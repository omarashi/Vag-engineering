import { label, translate, type Language } from "./locale";

export function accountTypeName(lang: Language, kind: string) {
  return kind === "bank" ? translate(lang, "Visa") : label(lang, kind);
}

export function accountName(account: { name: string; code?: string | null }) {
  return account.code && account.code !== account.name ? account.code + " · " + account.name : account.name;
}

const standardMethods = ["cash", "card", "transfer", "bank", "vodafoneCash", "instaPay"];

export function isCustomPaymentMethod(method: string) {
  return method.length > 0 && method.length <= 80 && !standardMethods.includes(method);
}

function paymentMethodName(lang:Language, method:string) {
  return method === "transfer" ? translate(lang, "Bank transfer") : label(lang, method);
}

export function accountPaymentMethods(kind:string):readonly string[] {
  switch(kind) {
    case "cash": return ["cash"];
    case "visa":
    case "cardTerminal": return ["card"];
    case "vodafoneCash": return ["vodafoneCash"];
    case "instaPay": return ["instaPay"];
    case "bank": return ["transfer","card"];
    default: return ["transfer"];
  }
}

export function paymentChannelField(lang:Language, accounts:readonly {id:string;kind:string;name:string;code?:string|null}[],
  fieldLabel:string, customMethods:readonly string[] = []) {
  const options=accounts.flatMap((account)=>{
    const methods=accountPaymentMethods(account.kind);
    const name=accountName(account);
    return [...methods,...customMethods].map((method)=>{
      const caption=account.kind==="bank" && method==="card" ? translate(lang,"Visa") : paymentMethodName(lang,method);
      const namedChannel=account.code && methods.length===1 && method===methods[0];
      return {value:method+":"+account.id,name:namedChannel || name.toLowerCase()===caption.toLowerCase() ? name : caption+" · "+name};
    });
  });
  const cashAccounts=accounts.filter(({kind})=>kind==="cash");
  const defaultCash=cashAccounts.find(({code})=>code==="C") ?? (cashAccounts.length===1 ? cashAccounts[0] : undefined);
  const value=options.length===1 ? options[0].value :
    fieldLabel==="Receive payment via" && defaultCash ? "cash:"+defaultCash.id : "";
  return {key:"paymentChannel",label:fieldLabel,type:"select" as const,options,value,required:true,wide:true};
}
