"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { translate, type Language } from "@/lib/locale";

export function StickyTable({ lang, children, stickyKey = false }: {
  lang: Language; children: ReactNode; stickyKey?: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const heading = headingRef.current;
    const scroll = scrollRef.current;
    const table = scroll?.querySelector("table");
    const head = table?.tHead;
    if (!frame || !heading || !scroll || !table || !head?.rows.length) return;

    // The original header stays in the table for accessibility and column sizing.
    // A visual copy can stick vertically outside the horizontal scroll container.
    const cells = Array.from(head.rows[0].cells);
    const copy = document.createElement("table");
    const columns = document.createElement("colgroup");
    const columnWidths = cells.map(() => columns.appendChild(document.createElement("col")));
    copy.append(columns, head.cloneNode(true));
    heading.replaceChildren(copy);

    const alignScroll = () => { heading.scrollLeft = scroll.scrollLeft; };
    const measure = () => {
      const height = head.getBoundingClientRect().height;
      if (!height) return;
      copy.style.width = `${table.getBoundingClientRect().width}px`;
      cells.forEach((cell, index) => {
        columnWidths[index].style.width = `${cell.getBoundingClientRect().width}px`;
      });
      frame.style.setProperty("--table-heading-height", `${height}px`);
      frame.dataset.stickyHeader = "";
      alignScroll();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    cells.forEach((cell) => observer.observe(cell));
    scroll.addEventListener("scroll", alignScroll, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      scroll.removeEventListener("scroll", alignScroll);
      heading.replaceChildren();
      delete frame.dataset.stickyHeader;
    };
  }, [children, lang]);

  const keyClass = stickyKey ? " table-sticky-key" : "";
  return <div className="table-frame" ref={frameRef}>
    <div className={"table-pinned-header" + keyClass} aria-hidden="true" ref={headingRef}/>
    <div className={"table-scroll table-register" + keyClass} tabIndex={0} role="region" aria-label={translate(lang,"Table")} ref={scrollRef}>
      {children}
    </div>
  </div>;
}
