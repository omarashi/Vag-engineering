import { requestKey } from "./request-key";

export type PendingAction = { key: string; body: string; uncertain: boolean };

export async function postFormAction(action: string, body: string, request: { current: PendingAction | null }) {
  try {
    let response: Response | undefined;
    const pending = request.current;
    if (pending?.uncertain) {
      const lookup = await fetch("/api/requests/" + pending.key, { cache: "no-store" });
      if (lookup.ok) response = lookup;
      else if (lookup.status !== 404 || pending.body !== body) throw Error("Unconfirmed action");
    }
    if (!response) {
      const submission = pending?.body === body ? pending : { key: requestKey(), body, uncertain: false };
      request.current = submission;
      response = await fetch("/api/actions/" + action, {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": submission.key }, body,
      });
    }
    const data = await response.json() as { id: string; warning?: string; error?: string };
    if (response.status < 500) request.current = null;
    else if (request.current) request.current.uncertain = true;
    return { ok: response.ok, data };
  } catch (error) {
    if (request.current) request.current.uncertain = true;
    throw error;
  }
}
