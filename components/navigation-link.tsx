"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

function PendingNavigation() {
  const { pending } = useLinkStatus();
  return pending ? <span data-route-pending hidden/> : null;
}

export default function NavigationLink({ children, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props}>{children}<PendingNavigation/></Link>;
}
