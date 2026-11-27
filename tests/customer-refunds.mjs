import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { postAction, signIn } from "./support/http.mjs";
import { launchBrowser } from "./support/browser.mjs";

const base=process.env.TEST_URL;
if(!base||!new URL(process.env.DATABASE_URL).pathname.endsWith("_test"))throw Error("Use an isolated test database.");
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
const sessions=Object.fromEntries(await Promise.all(["owner","accountant","technician"].map(async(role)=>[role,await signIn(base,role)])));
const at="2025-11-26";
const account=await db.moneyAccount.findFirstOrThrow({where:{kind:"cash",archived:false}});
const post=(action,data,role="owner",key)=>postAction(base,sessions[role],action,data,key);
async function save(action,data,role,key){const result=await post(action,data,role,key);assert.equal(result.status,200,await result.clone().text());return (await result.json()).id;}
async function page(path,role="owner",status=200){const response=await fetch(base+path,{headers:{Cookie:sessions[role]}});assert.equal(response.status,status,path);return response.text();}
async function customer(name){const partyId=await save("customer",{name:name+" "+randomUUID().slice(0,5)});return {partyId,vehicleId:await save("vehicle",{partyId,make:"Audi",model:"A3"})};}
async function invoice(customer,price,extra={},invoiceDate=at){
  const visitId=await save("visit",{...customer,at,services:["inspection","other"],...extra});
  const id=await save("visitInvoice",{visitId,at:invoiceDate,servicePrices:{other:price}});
  return db.document.findUniqueOrThrow({where:{id},include:{lines:{orderBy:{position:"asc"}}}});
}
const receive=(invoice,amount)=>save("payment",{kind:"receipt",at,invoiceId:invoice.id,accountId:account.id,amount});
const forAmount=(row,amount)=>({invoiceId:row.id,lines:[{sourceId:row.lines[0].id,amount,disposition:"none"}]});
const request=(customer,invoices,total,available,extra={})=>({partyId:customer.partyId,at,reason:"QA return",settlement:"keep",invoices,expectedTotal:String(total),expectedAvailable:String(available),...extra});
const notes=(refundBatchId)=>db.document.findMany({where:{refundBatchId},include:{lines:true,allocations:true},orderBy:{number:"asc"}});
const printInvoice=(row)=>page("/print/record/"+row.id+"?lang=en");
const amountLabel=(body,label,value)=>assert.match(body,new RegExp(label+"</(?:strong|dt)>\\s*<(?:dd><)?bdi>EGP\\s*"+value.replaceAll(".","\\.")+"</bdi>"));
const debtPayment=(customer,row,amount)=>({partyId:customer.partyId,invoiceId:row.id,at,accountId:account.id,amount});

try{
  const person=await customer("Debt QA");
  const old=await invoice(person,"10000");
  await receive(old,"4000");
  const recent=await invoice(person,"5000");
  await receive(recent,"2000");
  assert.match(await page("/customers/"+person.partyId),/9,000\.00/);
  const reductionBody=request(person,[forAmount(old,"2500")],250000,0);
  const cashImpossible=await post("customerRefund",{...reductionBody,settlement:"payout",accountId:account.id,paidOut:true});
  assert.equal(cashImpossible.status,409);
  const reduction=await save("customerRefund",reductionBody);
  assert.equal((await notes(reduction))[0].allocations.length,0);
  amountLabel(await printInvoice(old),"Adjusted invoice total","7,500.00");
  amountLabel(await printInvoice(old),"Remaining balance","3,500.00");
  amountLabel(await printInvoice(recent),"Remaining balance","3,000.00");
  const single=debtPayment(person,old,"1500");
  const singleKey=randomUUID();
  const pay=await save("customerDebtPayment",single,"owner",singleKey);
  assert.equal(await save("customerDebtPayment",single,"owner",singleKey),pay);
  assert.equal(await db.allocation.count({where:{paymentId:pay}}),1);
  amountLabel(await page("/print/payment/"+pay+"?lang=en"),"Remaining balance","2,000.00");
  amountLabel(await printInvoice(recent),"Remaining balance","3,000.00");
  assert.equal((await post("customerDebtPayment",{...single,amount:"2000.01"})).status,422);
  assert.equal((await post("customerDebtPayment",{...single,invoiceId:undefined})).status,422);
  const split=await save("customerDebtPayment",{partyId:person.partyId,at,accountId:account.id,amount:"1500",
    allocations:[{documentId:old.id,amount:"1000"},{documentId:recent.id,amount:"500"}]});
  assert.equal(await db.cashMovement.count({where:{paymentId:split}}),1);
  assert.equal(await db.allocation.count({where:{paymentId:split}}),2);
  await save("reversePayment",{id:split,at,reason:"Mistaken split"});
  amountLabel(await printInvoice(old),"Remaining balance","2,000.00");
  amountLabel(await printInvoice(recent),"Remaining balance","3,000.00");
  const closing=await Promise.all([post("customerDebtPayment",{...single,amount:"2000"}),post("customerDebtPayment",{...single,amount:"2000"},"accountant")]);
  assert.deepEqual(closing.map((row)=>row.status).sort(),[200,422]);
  amountLabel(await printInvoice(old),"Remaining balance","0.00");
  assert.ok(await db.payment.findUnique({where:{id:pay}}));
  const mixed=await invoice(person,"1000",{},at+"T20:00");
  await receive(mixed,"400");
  const appliedBatch=await save("customerRefund",request(person,[forAmount(mixed,"800")],80000,20000,{settlement:"apply",destinationId:recent.id}));
  const mixedNote=(await notes(appliedBatch))[0];
  const appliedUse=await db.customerCreditUse.findFirstOrThrow({where:{creditId:mixedNote.id,invoiceId:recent.id}});
  assert.equal(appliedUse.amount,20000n);
  amountLabel(await printInvoice(mixed),"Remaining balance","0.00");
  amountLabel(await printInvoice(recent),"Remaining balance","2,800.00");
  await save("reverseCustomerCredit",{id:appliedUse.id,at,reason:"Reverse allocated credit"});

  const other=await customer("Multi-invoice refund QA");
  const sales=await Promise.all([invoice(other,"8000"),invoice(other,"5000"),invoice(other,"4000")]);
  for(const [i,sale] of sales.entries())await receive(sale,["8000","5000","4000"][i]);
  const multi=request(other,[forAmount(sales[0],"2000"),forAmount(sales[1],"1000")],300000,300000,{settlement:"payout",paidOut:true,accountId:account.id});
  assert.equal((await post("customerRefund",multi,"technician")).status,403);
  assert.equal((await post("customerRefund",{...multi,paidOut:false})).status,422);
  assert.equal((await post("customerRefund",{...multi,expectedAvailable:"299900"})).status,409);
  const batchKey=randomUUID();
  const batch=await save("customerRefund",multi,"accountant",batchKey);
  assert.equal(await save("customerRefund",multi,"accountant",batchKey),batch);
  const creditNotes=await notes(batch);
  assert.deepEqual(creditNotes.map(({sourceId})=>sourceId),sales.slice(0,2).map(({id})=>id));
  const payoutId=creditNotes[0].allocations[0].paymentId;
  assert.equal(creditNotes[1].allocations[0].paymentId,payoutId);
  assert.equal((await db.cashMovement.findFirstOrThrow({where:{paymentId:payoutId}})).amount,-300000n);
  const refundReceipt=await page("/print/refund/"+batch+"?lang=en");
  assert.ok(sales.slice(0,2).every(({number})=>refundReceipt.includes(number)));
  amountLabel(refundReceipt,"Refunds paid","3,000.00");
  await page("/refunds/"+batch,"technician",404);
  const three=await save("customerRefund",request(other,sales.map((row)=>forAmount(row,"500")),150000,150000));
  assert.equal((await notes(three)).length,3);
  const full=await save("customerRefund",request(other,[{invoiceId:sales[2].id,full:true}],350000,350000));
  assert.equal((await notes(full))[0].total,350000n);
  assert.equal((await db.document.findUniqueOrThrow({where:{id:sales[2].id}})).total,400000n);
  amountLabel(await printInvoice(sales[2]),"Adjusted invoice total","0.00");
  const chargedLater=await invoice(other,"6000");
  assert.match(await page("/customers/"+other.partyId),/5,000\.00/);
  amountLabel(await printInvoice(chargedLater),"Remaining balance","6,000.00");
  const creditId=(await notes(full))[0].id;
  const use={partyId:other.partyId,creditId,invoiceId:chargedLater.id,amount:"2000",at};
  const competing=await Promise.all([post("customerCreditApply",use),post("customerCreditApply",use,"accountant")]);
  assert.deepEqual(competing.map((row)=>row.status).sort(),[200,409]);
  const transfer=(await competing.find((row)=>row.ok).json()).id;
  amountLabel(await printInvoice(chargedLater),"Remaining balance","4,000.00");
  assert.match(await page("/print/statement/"+other.partyId+"?lang=en"),/Credit application/);
  assert.equal((await post("customerCreditPayout",{...use,amount:"1500.01",reason:"Too much",accountId:account.id})).status,409);
  await save("reverseCustomerCredit",{id:transfer,at,reason:"QA correction"});
  amountLabel(await printInvoice(chargedLater),"Remaining balance","6,000.00");

  const depositor=await customer("Overpayment QA");
  const deposit=await save("payment",{kind:"receipt",partyId:depositor.partyId,accountId:account.id,amount:"800",allowCredit:true,at});
  const applyTo=await invoice(depositor,"500");
  await save("customerCreditApply",{partyId:depositor.partyId,receiptId:deposit,invoiceId:applyTo.id,amount:"500",at});
  const refund=await save("customerCreditPayout",{partyId:depositor.partyId,receiptId:deposit,accountId:account.id,amount:"300",reason:"Return excess",at});
  assert.equal((await db.cashMovement.findFirstOrThrow({where:{paymentId:refund}})).amount,-30000n);
  assert.equal((await post("reversePayment",{id:deposit,reason:"Consumed credit",at})).status,422);
  await save("reversePayment",{id:refund,reason:"Void payout booking",at});
  assert.match(await page("/customers/"+depositor.partyId),/300\.00/);

  const stockCustomer=await customer("Inventory return QA");
  const partId=await save("part",{name:"Refund filter",code:"RET-"+randomUUID().slice(0,8),price:"1000",cost:"500"});
  await save("stock",{partId,quantity:"10",kind:"adjustment",reason:"Return fixture"});
  const stockedId=await save("invoice",{...stockCustomer,at,lines:[{kind:"part",partId,quantity:"3",price:"1000"}]});
  const stocked=await db.document.findUniqueOrThrow({where:{id:stockedId},include:{lines:true}});
  await receive(stocked,"3000");
  const onHand=async()=>String((await db.part.findUniqueOrThrow({where:{id:partId}})).onHand);
  assert.equal(await onHand(),"7");
  const physical=(quantity,disposition)=>({invoiceId:stockedId,lines:[{sourceId:stocked.lines[0].id,quantity,disposition}]});
  const countBefore=await db.refundBatch.count();
  assert.equal((await post("customerRefund",request(stockCustomer,[physical("1","restock"),forAmount(sales[0],"10")],101000,101000))).status,422);
  assert.equal(await db.refundBatch.count(),countBefore);
  assert.equal(await onHand(),"7");
  const restock=await save("customerRefund",request(stockCustomer,[physical("1","restock")],100000,100000));
  assert.equal(await onHand(),"8");
  const damage=await save("customerRefund",request(stockCustomer,[physical("2","damaged")],200000,200000));
  assert.equal((await notes(damage))[0].lines[0].returnDisposition,"damaged");
  assert.equal(await onHand(),"8");
  assert.equal((await post("customerRefund",request(stockCustomer,[physical("1","restock")],100000,100000))).status,422);
  await save("reverseDocument",{id:(await notes(restock))[0].id,at,reason:"Reverse return after review"});
  assert.equal(await onHand(),"7");

  const workshop=await customer("Classified return QA");
  const supplierId=await save("supplier",{name:"Return Vendor "+randomUUID().slice(0,8)});
  const categorized=await invoice(workshop,"0",{importRequested:true,importItems:[{name:"Imported return module",supplierId,quantity:"1",buyingPrice:"200",sellingPrice:"900"}],
    workshopCharges:{electricalLabor:"1000"}});
  await receive(categorized,"1900");
  const item=categorized.lines.find((row)=>row.purpose==="importedItem");
  const labor=categorized.lines.find((row)=>row.purpose==="electricalLabor");
  const specialist=await save("customerRefund",request(workshop,[{invoiceId:categorized.id,lines:[{sourceId:item.id,amount:"200",disposition:"none"},
    {sourceId:labor.id,amount:"300",disposition:"none"}]}],50000,50000));
  assert.equal(await db.stockMovement.count({where:{documentId:(await notes(specialist))[0].id}}),0);
  assert.match(await page("/electrical-work?vehicle="+workshop.vehicleId),/Electrical labor<\/small><b><bdi>EGP\s*700\.00/);
  assert.match(await page("/imports?q=Imported+return+module"),/Net sales<\/small><b><bdi>EGP\s*700\.00/);
  assert.equal((await post("customerRefund",request(workshop,[{invoiceId:categorized.id,lines:[{sourceId:labor.id,amount:"700.01",disposition:"none"}]}],70001,70001))).status,422);
  assert.match(await page("/print/refund/"+specialist+"?lang=ar"),/مصنعيات كهرباء/);

  const browser=await launchBrowser();
  try{
    const preview=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    preview.setDefaultTimeout(10000);
    const loggedIn=await preview.request.post(base+"/api/auth/sign-in/username",{headers:{Origin:base},data:{username:"owner",password:"Demo-Workshop-2026!"}});
    assert.equal(loggedIn.status(),200);
    await preview.goto(base+"/customers/"+person.partyId);
    const unpaid=preview.getByRole("table").filter({has:preview.getByRole("columnheader",{name:"Unpaid invoices and balances"})});
    assert.equal(await unpaid.getByRole("row").filter({hasText:old.number}).count(),0);
    const row=unpaid.getByRole("row").filter({hasText:recent.number});
    await row.getByRole("button",{name:"Pay Debt",exact:true}).click();
    const dialog=preview.getByRole("dialog",{name:"Pay Debt"});
    assert.match(await dialog.innerText(),/3,000\.00/);
    await dialog.getByLabel("Amount received (EGP)").fill("2500");
    await dialog.locator('select[name="paymentChannel"]').selectOption("cash:"+account.id);
    await dialog.getByRole("button",{name:"Confirm Payment"}).click();
    await preview.getByRole("link",{name:"View receipt"}).waitFor();
    assert.match(await row.innerText(),/500\.00/);

    await preview.goto(base+"/refunds?party="+workshop.partyId+"&invoice="+categorized.id);
    await preview.getByRole("checkbox",{name:/Electrical labor/}).check();
    await preview.getByLabel("Refund amount (EGP)").fill("100");
    await preview.getByLabel(/Settlement/).selectOption("keep");
    await preview.getByLabel("Reason",{exact:true}).fill("Phone-width service credit");
    await preview.getByRole("button",{name:"Review refund"}).click();
    await preview.getByRole("button",{name:"Confirm refund"}).click();
    await preview.waitForURL((url)=>url.pathname.startsWith("/refunds/"));
    await preview.getByRole("heading",{name:"Refund receipt"}).waitFor();
    assert.match(await preview.locator(".receipt-totals").innerText(),/Credit retained\s+EGP\s*100\.00/);
  }finally{await browser.close();}

  const reconciliation=JSON.parse(execFileSync(process.execPath,["scripts/reconcile-customer-finance.mjs"],{encoding:"utf8"}));
  assert.equal(reconciliation.hasCreditLedger,true);
  assert.deepEqual(reconciliation.issues,[]);
  console.log("PASS invoice-specific debt, split payments, reversal, two/three-invoice refunds, restock, damaged returns, credit payout/application, race handling, rollback, reporting and print");
}finally{await db.$disconnect();}
