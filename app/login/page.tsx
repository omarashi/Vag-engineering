import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { Login } from "@/components/login";
export default async function Page(){
  const [request,prefs]=await Promise.all([headers(),cookies()]);
  if(await currentUser(request))redirect("/overview");
  return <Login lang={prefs.get("vag-lang")?.value==="ar"?"ar":"en"}/>;
}

