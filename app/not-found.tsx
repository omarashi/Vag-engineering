import { cookies } from "next/headers";
import Link from "next/link";
import { translate } from "@/lib/locale";

export default async function NotFound() {
  const lang = (await cookies()).get("vag-lang")?.value === "ar" ? "ar" : "en";
  return <main className="empty">
    <h1>{translate(lang, "Page not found")}</h1>
    <Link className="button secondary" href="/overview">{translate(lang, "Home")}</Link>
  </main>;
}

