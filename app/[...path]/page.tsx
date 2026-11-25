import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { message, translate, type Language } from "@/lib/locale";
import { Shell } from "@/components/identity";
import { Home, CustomerList, CustomerPage, CarList, CarPage, Debts, LogSearch, type LogQuery } from "@/components/workshop-log";
import { OfficePage } from "@/components/office-pages";
import { canViewPage } from "@/lib/permissions";

export default async function Page({ params, searchParams }: {
  params: Promise<{ path: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ path }, raw, request, prefs] = await Promise.all([params, searchParams, headers(), cookies()]);
  const user = await currentUser(request);
  if (!user) redirect("/login");
  const lang: Language = prefs.get("vag-lang")?.value === "ar" ? "ar" : "en";
  const theme = prefs.get("vag-theme")?.value === "light" ? "light" : "dark";
  const read = (key: string) => typeof raw[key] === "string" ? raw[key].trim().slice(0, 100) : "";
  const query: LogQuery = {
    q: read("q"), action: read("new"),
    page: Math.min(500, Math.max(0, Number.parseInt(read("page"), 10) || 0)),
    continueVisit: ["job", "visit"].includes(read("next")),
  };
  const [route, id] = path;
  if (path.length > 2 || !canViewPage(user.role, route)) notFound();
  if (route === "visits") {
    const search = new URLSearchParams();
    if (id) {
      if (read("saved")) search.set("saved", read("saved"));
      redirect("/jobs/" + encodeURIComponent(id) + (search.size ? "?" + search : ""));
    }
    for (const key of ["q", "service", "page"]) {
      const value = read(key);
      if (value) search.set(key, value);
    }
    if (read("customer")) search.set("party", read("customer"));
    if (query.action === "visit") search.set("new", "job");
    redirect((query.action === "visit" ? "/jobs" : "/jobs/history") + (search.size ? "?" + search : ""));
  }
  const props = { lang, query };
  const pages = {
    overview: () => id ? notFound() : <Home lang={lang} role={user.role}/>,
    customers: () => id ? <CustomerPage {...props} id={id} role={user.role}/> : <CustomerList {...props}/>,
    vehicles: () => id ? <CarPage {...props} id={id} role={user.role}/> : <CarList {...props}/>,
    debts: () => id ? notFound() : <Debts {...props} role={user.role} receipt={read("saved") === "1" ? read("receipt") : ""}/>,
    search: () => id ? notFound() : <LogSearch {...props}/>,
  };
  const officeQuery = Object.fromEntries(
    ["q","from","to","status","party","staff","category","service","report","new","page","week","paymentKind","date","account"].map((key) => [key, read(key)]).filter(([, value]) => value),
  );
  const content = Object.hasOwn(pages, route) ? pages[route as keyof typeof pages]() :
    <OfficePage lang={lang} route={route} id={id} actor={user} query={officeQuery}/>;
  return <Shell lang={lang} theme={theme} user={{name:user.name,role:user.role}} demo={process.env.VAG_DEMO === "true"}>
    {route !== "debts" && ["1","duplicate"].includes(read("saved")) && <p className="notice log-saved" role="status">{read("saved")==="duplicate" ? message(lang, "duplicateParty") : translate(lang, "Saved")}</p>}
    {content}
  </Shell>;
}

