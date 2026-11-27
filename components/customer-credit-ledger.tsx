import type { Role } from "@prisma/client";
import type { customerCredits } from "@/lib/customer-credit";
import type { DebtDocument } from "@/lib/customer-debt";
import { day, label, money, translate, type Language } from "@/lib/locale";
import { paymentChannelField } from "@/lib/payment-options";
import { can } from "@/lib/permissions";
import { today } from "@/lib/rules";
import type { receiptAccounts } from "@/lib/visit-forms";
import { ActionForm, type Field } from "./action-form";
import { Amt, Ref, Register } from "./register";
import { Panel } from "./ui";

export function CustomerCreditLedger({lang,partyId,role,archived,name,credit,invoices,accounts}:{
  lang:Language;partyId:string;role:Role;archived:boolean;name:string;credit:Awaited<ReturnType<typeof customerCredits>>;
  invoices:DebtDocument[];accounts:Awaited<ReturnType<typeof receiptAccounts>>;
}) {
  const back="/customers/"+partyId+"#customer-balance";
  const dateField:Field={key:"at",type:"date",label:"Date",value:today(),required:true,max:today(),advanced:true};
  const amount:Field={key:"amount",label:"Amount (EGP)",inputMode:"decimal",ltr:true,required:true};
  const reason:Field={key:"reason",label:"Reason",type:"textarea",required:true,wide:true};
  return <Panel title={translate(lang,"Customer credit history")}><Register lang={lang}
    head={["Credit source","Original invoice","Date","Credit amount","Refunds paid","Applied customer credit","Available customer credit","History","Action"]}
    rows={credit.sources.map((source)=>{
      const hidden={partyId,...(source.creditId?{creditId:source.creditId}:{receiptId:source.receiptId})};
      const actions=[];
      const formSummary={label:"Available customer credit",amount:money(lang,source.available),name};
      if(source.available>0n&&!archived&&can(role,"customerCreditApply")&&invoices.length) actions.push(<ActionForm key="apply" lang={lang} spec={{
        action:"customerCreditApply",title:"Apply customer credit",submitLabel:"Confirm allocation",destination:back,hidden,formSummary,
        fields:[{key:"invoiceId",label:"Unpaid invoice",type:"select",required:true,options:invoices.map((row)=>({value:row.id,name:row.number+" · "+money(lang,row.balance)}))},amount,dateField],
      }}/>);
      if(source.available>0n&&!archived&&accounts.length&&can(role,"customerCreditPayout")) actions.push(<ActionForm key="payout" lang={lang} spec={{
        action:"customerCreditPayout",title:"Pay cash or bank refund",submitLabel:"Confirm refund payout",destination:"/payment/$id",hidden,
        fields:[amount,paymentChannelField(lang,accounts,"Refund paid from"),dateField,reason],
        formSummary:{...formSummary,note:"Record a payout only after money is returned."},
      }}/>);
      return [<Ref href={(source.creditId?"/record/":"/payment/")+(source.creditId??source.receiptId)}>{source.number}</Ref>,
        source.source&&<Ref href={"/record/"+source.source.id}>{source.source.number}</Ref>,day(lang,source.at),
        <Amt lang={lang} value={source.original}/>,<Amt lang={lang} value={source.refunded}/>,<Amt lang={lang} value={source.applied}/>,<Amt lang={lang} value={source.available}/>,
        <div className="page-actions">{source.payouts.map((pay)=><Ref key={pay.id} href={"/payment/"+pay.id}>{pay.number}{pay.reversedAt?" · "+label(lang,"reversed"):""}</Ref>)}
          {source.uses.map((item)=><div key={item.id}>
            {item.invoice&&<Ref href={"/record/"+item.invoice.id}>{item.invoice.number}</Ref>}{item.payout&&<Ref href={"/payment/"+item.payout.id}>{item.payout.number}</Ref>}{" · "}<Amt lang={lang} value={item.amount}/>
            {item.reversedAt?" · "+label(lang,"reversed"):item.invoice&&can(role,"reverseCustomerCredit")&&<ActionForm lang={lang} spec={{
              action:"reverseCustomerCredit",title:"Reverse credit allocation",submitLabel:"Confirm reversal",destination:back,hidden:{id:item.id},fields:[dateField,reason],
            }}/>}
          </div>)}
        </div>,<div className="page-actions">{actions}</div>];
    })}/></Panel>;
}
