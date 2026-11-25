import { label, translate, type Language } from "./locale";

export function accountTypeName(lang: Language, kind: string) {
  return kind === "bank" ? translate(lang, "Visa") : label(lang, kind);
}

export function accountName(account: { name: string; code?: string | null }) {
  return account.code && account.code !== account.name ? account.code + " · " + account.name : account.name;
}

export function paymentMethodOptions(lang: Language) {
  return ["cash", "card", "transfer", "vodafoneCash", "instaPay"].map((value) => ({
    value,
    name: paymentMethodName(lang, value),
  }));
}

function paymentMethodName(lang:Language, method:string) {
  return method === "transfer" ? translate(lang, "Bank transfer") : label(lang, method);
}

export function receiptMethods(kind:string):readonly string[] {
  switch(kind) {
    case "cash": return ["cash"];
    case "cardTerminal": return ["card"];
    case "vodafoneCash": return ["vodafoneCash"];
    case "instaPay": return ["instaPay"];
    case "bank": return ["transfer","card"];
    default: return ["transfer"];
  }
}

export function receiptDestinations(lang:Language, accounts:readonly {id:string;kind:string;name:string;code?:string|null}[]) {
  const options=accounts.flatMap((account)=>receiptMethods(account.kind).map((method)=>{
    const caption=account.kind==="bank" && method==="card" ? translate(lang,"Visa") : paymentMethodName(lang,method);
    const name=accountName(account);
    return {value:method+":"+account.id,name:name.toLowerCase()===caption.toLowerCase() ? name : caption+" · "+name};
  }));
  const cashAccounts=accounts.filter(({kind})=>kind==="cash");
  const initial=cashAccounts.length===1 ? "cash:"+cashAccounts[0].id : options.length===1 ? options[0].value : "";
  return {options,initial};
}
