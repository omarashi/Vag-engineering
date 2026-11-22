import { serviceName } from "@/lib/services";
import type { WorkDetail } from "@/lib/visit-items";
import type { Language } from "@/lib/locale";

export function VisitServiceDescription({ lang, work }: { lang: Language; work: WorkDetail }) {
  return <span>{serviceName(lang, work.service)}
    {work.detail && <bdi className="invoice-service-detail">{work.detail}</bdi>}
  </span>;
}

export function VisitWorkList({ lang, work }: { lang: Language; work: WorkDetail[] }) {
  return <ul className="visit-work-list">{work.map(({ service, detail }) => <li key={service}>
    <strong>{serviceName(lang, service)}</strong>
    {detail && <p><bdi>{detail}</bdi></p>}
  </li>)}</ul>;
}
