import { db } from "./db";
import { invoiceSettlements } from "./invoice-settlement";
import { creditEntitlement } from "./trade";

export async function refundableInvoices(partyId:string) {
  const invoices=await db.document.findMany({where:{partyId,kind:"invoice",status:"posted"},orderBy:[{at:"desc"},{id:"desc"}],include:{
    lines:{orderBy:{position:"asc"},include:{related:{where:{document:{kind:"credit",status:"posted"}},select:{quantity:true,total:true,stockQty:true}}}},
  }});
  const balances=await invoiceSettlements(invoices);
  return invoices.map((invoice)=>{
    const settlement=balances.get(invoice.id)!;
    return {id:invoice.id,number:invoice.number,at:invoice.at.toISOString(),total:String(invoice.total),paid:String(settlement.paid),
      balance:String(settlement.balance),remaining:String(settlement.adjusted),lines:invoice.lines.map((line)=>({
        id:line.id,description:line.description,purpose:line.purpose,originalQuantity:line.quantity.toFixed(),originalValue:String(line.total),
        remainingQuantity:line.quantity.minus(line.related.reduce((sum,row)=>sum.plus(row.quantity),line.quantity.mul(0))).toFixed(),
        remainingValue:String(line.total-line.related.reduce((sum,row)=>sum+row.total,0n)),
        restockQuantity:line.stockQty.minus(line.related.reduce((sum,row)=>sum.plus(row.stockQty),line.stockQty.mul(0))).toFixed(),
        physical:Boolean(line.partId || line.purpose==="importedItem"),
      })).filter((line)=>BigInt(line.remainingValue)>0n)};
  });
}

export async function refundBatchDetail(id:string) {
  const batch=await db.refundBatch.findUnique({where:{id},include:{party:{select:{name:true}},notes:{orderBy:{number:"asc"},include:{
    source:{select:{id:true,number:true}},lines:{orderBy:{position:"asc"}},
    allocations:{include:{payment:{select:{id:true,number:true,reversedAt:true,kind:true}}}},
    creditUses:{include:{invoice:{select:{id:true,number:true}}}},
  }}}});
  if(!batch) return null;
  const entries=await Promise.all(batch.notes.map(async (note)=>{
    const posted=note.status==="posted";
    const credit=posted?await creditEntitlement(db,note):0n;
    const payouts=note.allocations.filter((item)=>item.payment.kind==="refund");
    const refunded=posted?payouts.reduce((sum,item)=>item.releasedAt||item.payment.reversedAt?sum:sum+item.amount,0n):0n;
    const applied=posted?note.creditUses.reduce((sum,item)=>item.reversedAt?sum:sum+item.amount,0n):0n;
    return {note,payouts,refunded,applied,debtReduced:posted?note.total-credit:0n,retained:credit-refunded-applied};
  }));
  return {batch,entries};
}
