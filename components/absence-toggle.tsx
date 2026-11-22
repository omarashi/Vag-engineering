"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { message, translate, type Language } from "@/lib/locale";
import { requestKey } from "@/lib/request-key";
import { Button } from "./ui";

export function AbsenceToggle({ employeeId, absent, lang }: { employeeId: string; absent: boolean; lang: Language }) {
  const router = useRouter();
  const key = useRef("");
  const [working, setWorking] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState("");

  async function toggle() {
    setWorking(true);
    setError("");
    if (!key.current) key.current = requestKey();
    try {
      const result = await fetch("/api/actions/employeeAbsence", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key.current },
        body: JSON.stringify({ employeeId, action: absent ? "undo" : "mark" }),
      });
      if (!result.ok) {
        const data = await result.json();
        if (result.status < 500) key.current = "";
        setError(data.error ?? "serverError");
        return;
      }
      key.current = "";
      startTransition(() => router.refresh());
    } catch {
      setError("network");
    } finally {
      setWorking(false);
    }
  }

  return <div>
    <Button type="button" disabled={working || refreshing} onClick={toggle}>
      {translate(lang, working || refreshing ? "Saving…" : absent ? "Undo absence" : "Mark absent")}
    </Button>
    {error && <p className="error" role="alert">{message(lang, error)}</p>}
  </div>;
}
