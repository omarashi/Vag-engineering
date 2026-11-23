"use client";

import { Languages, Moon, Sun, LogOut, Search, ChevronDown, House, UsersRound, ClipboardList, Wallet, Ellipsis } from "lucide-react";
import Link from "./navigation-link";
import Form from "next/form";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { translate, type Language } from "@/lib/locale";
import type { Role } from "@prisma/client";
import { canViewPage } from "@/lib/permissions";

const navigation = [
  ["overview", "Home", House],
  ["customers", "Customers", UsersRound],
  ["jobs", "Jobs", ClipboardList],
  ["debts", "Debts", Wallet],
  ["more", "More", Ellipsis],
] as const;

export function Mark({ lang }: { lang: Language }) {
  return <div className="mark"><Image src="/brand.jpg" alt="" width={36} height={36}/><div>
    <strong dir="ltr">VAG <span>ENGINEERING</span></strong><small>{translate(lang, "Workshop log")}</small>
  </div></div>;
}

export function Preferences({ lang, theme }: { lang: Language; theme: string }) {
  const router = useRouter();
  function set(key: string, value: string) {
    document.cookie = key + "=" + value + ";path=/;max-age=31536000;SameSite=Lax";
    router.refresh();
  }
  const themeText = translate(lang, theme === "dark" ? "Light theme" : "Dark theme");
  return <>
    <button type="button" className="icon-button lang-toggle" aria-label={translate(lang, "Language")} onClick={() => set("vag-lang", lang === "en" ? "ar" : "en")}>
      <Languages size={17}/><span>{lang === "en" ? "مصري" : "EN"}</span>
    </button>
    <button type="button" className="icon-button" title={themeText} aria-label={themeText} onClick={() => set("vag-theme", theme === "dark" ? "light" : "dark")}>
      {theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>}
    </button>
  </>;
}

export function Shell({ lang, theme, user, demo, children }: {
  lang: Language; theme: string; user: { name: string; role: Role }; demo: boolean; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const route = pathname.split("/")[1];
  const visibleNavigation = navigation.filter(([path]) => canViewPage(user.role, path));
  const active = visibleNavigation.some(([path]) => path === route) ? route : route === "search" ? "" : "more";
  const [profile, setProfile] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const t = (key: string) => translate(lang, key);
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("");
  async function logout() {
    try {
      const result = await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!result.ok) throw Error();
      window.location.assign("/login");
    } catch { setLogoutError(true); }
  }
  const links = () => visibleNavigation.map(([route, title, Icon]) => <Link key={route} href={"/" + route}
    className={"log-nav-link" + (active === route ? " current" : "")} aria-current={active === route ? "page" : undefined}>
    <Icon size={19} strokeWidth={1.8}/><span>{t(title)}</span>
  </Link>);
  return <div className="log-shell">
    <aside className="log-sidebar">
      <Link href="/overview" className="log-brand"><Mark lang={lang}/></Link>
      <nav className="log-nav" aria-label={t("Main navigation")}>{links()}</nav>
      {demo && <div className="log-demo"><span/>{t("Demonstration data")}</div>}
    </aside>
    <div className="log-main">
      <header className="log-topbar">
        <span className="log-route-progress" role="progressbar" aria-label={t("Loading…")}>
          <span className="log-route-sweep" aria-hidden="true">
            <span className="log-route-car">
              <Image src="/loading-golf.png" alt="" width={72} height={54} sizes="70px" loading="eager"/>
            </span>
          </span>
        </span>
        <Link href="/overview" className="log-mobile-brand" aria-label={t("Home")}><Image src="/brand.jpg" alt="" width={34} height={34}/></Link>
        <Form className="log-search" action="/search" prefetch={false}>
          <button type="submit" aria-label={t("Search")}><Search size={18}/></button><input name="q" required maxLength={100} aria-label={t("Search the workshop log")} placeholder={t("Search by name, phone or plate")}/>
        </Form>
        <div className="log-top-actions"><Preferences lang={lang} theme={theme}/>
          <div className="profile-wrap">
            <button type="button" className="profile" aria-label={t("Account")} aria-expanded={profile} onClick={() => setProfile(!profile)}>
              <span className="avatar"><bdi>{initials}</bdi></span><span className="profile-text"><b><bdi>{user.name}</bdi></b></span><ChevronDown size={14}/>
            </button>
            {profile && <div className="profile-menu"><button onClick={logout}><LogOut size={16}/>{t("Sign out")}</button>
              {logoutError && <p className="error" role="alert">{t("Could not sign out. Try again.")}</p>}
            </div>}
          </div>
        </div>
      </header>
      <main id="main-content" className="log-content">
        <div className="log-route-content" key={pathname}>{children}</div>
      </main>
    </div>
    <nav className="log-dock" aria-label={t("Main navigation")}>{links()}</nav>
  </div>;
}

