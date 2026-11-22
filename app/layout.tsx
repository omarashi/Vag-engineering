import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import "./workshop.css";
export const metadata: Metadata={title:"VAG Engineering · Workshop Log",description:"Customer, car and service visit history",icons:{icon:"/brand.jpg"}};
export default async function RootLayout({children}:{children:React.ReactNode}){
  const prefs=await cookies();
  const lang=prefs.get("vag-lang")?.value==="ar"?"ar":"en";
  const theme=prefs.get("vag-theme")?.value==="light"?"light":"dark";
  return <html lang={lang==="ar"?"ar-EG":"en"} dir={lang==="ar"?"rtl":"ltr"} data-theme={theme}><body>{children}</body></html>;
}

