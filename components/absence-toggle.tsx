"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { message, translate, type Language } from "@/lib/locale";
import { requestKey } from "@/lib/request-key";
import { Button } from "./ui";

type AttendanceAction = "mark" | "halfDay" | "undo";

export function AbsenceToggle({ employeeId, day, state, lang }: {
  employeeId: string; day?: string; state?: "mark" | "halfDay"; lang: Language;
}) {
  const router = useRouter();
  const request = useRef<{ action: AttendanceAction; key: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState("");

  async function mark(action: AttendanceAction) {
    setWorking(true);
    setError("");
    if (request.current?.action !== action) request.current = { action, key: requestKey() };
    try {
      const result = await fetch("/api/actions/employeeAbsence", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": request.current.key },
        body: JSON.stringify({ employeeId, day, action }),
      });
      if (!result.ok) {
        const data = await result.json();
        if (result.status < 500) request.current = null;
        setError(data.error ?? "serverError");
        return;
      }
      request.current = null;
      startTransition(() => router.refresh());
    } catch {
      setError("network");
    } finally {
      setWorking(false);
    }
  }

  const disabled = working || refreshing;
  return <div className="attendance-actions" aria-busy={disabled}>
    {disabled && <small role="status">{translate(lang,"Saving…")}</small>}
    <Button type="button" className="attendance-absent" aria-pressed={state==="mark"}
      disabled={disabled || state==="mark"} onClick={()=>mark("mark")}>{translate(lang,"Mark absent")}</Button>
    <Button type="button" className="attendance-half" aria-pressed={state==="halfDay"}
      disabled={disabled || state==="halfDay"} onClick={()=>mark("halfDay")}>{translate(lang,"Half-day deduction")}</Button>
    {state && <Button type="button" disabled={disabled} onClick={()=>mark("undo")}>{translate(lang,"Undo attendance")}</Button>}
    {error && <p className="error" role="alert">{message(lang, error)}</p>}
  </div>;
}
