import Link from "./navigation-link";
import type { ReactNode } from "react";
import { ChevronRight, Inbox } from "lucide-react";
import { label, translate, type Language } from "@/lib/locale";
import { twMerge } from "tailwind-merge";
import { clsx } from "clsx";

export function cn(...inputs:Parameters<typeof clsx>){return twMerge(clsx(...inputs));}
import { Button } from "./ui/button";
export { Button };
export function ButtonLink({children,href,primary=false}:{children:ReactNode;href:string;primary?:boolean}){
  return <Button asChild variant={primary?"primary":"secondary"}><Link href={href}>{children}</Link></Button>;
}
export function Badge({lang,value}:{lang:Language;value:string}){
  const tone=["inProgress","arrived","posted"].includes(value)?"blue":
    ["approved","paid","ready","completed","delivered","received"].includes(value)?"green":
    ["waitingParts","partial","scheduled","awaitingApproval","inspecting"].includes(value)?"gold":
    ["cancelled","reversed","unpaid","noShow"].includes(value)?"red":"neutral";
  return <span className={"badge "+tone}><i/>{label(lang,value)}</span>;
}
export function Empty({lang,text="No matching records"}:{lang:Language;text?:string}){
  return <div className="empty"><Inbox size={23}/><span>{translate(lang,text)}</span></div>;
}
export function Panel({title,link,linkLabel,icon,children,className=""}:{title:string;link?:string;linkLabel?:string;icon?:ReactNode;children:ReactNode;className?:string}){
  return <section className={"panel "+className}>
    <header className="panel-heading"><h2>{icon}{title}</h2>{link&&<Link className="inline-link" href={link}>{linkLabel}<ChevronRight size={15}/></Link>}</header>{children}
  </section>;
}

