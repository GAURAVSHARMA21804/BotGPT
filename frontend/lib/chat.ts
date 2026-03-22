import { authRefresh } from "@/lib/auth";

export type ChatApiResponse = {
  reply: string;
  context_used: string[];
};

async function parseError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { detail?: unknown };
    const d = j.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d))
      return d.map((x: { msg?: string }) => x.msg || "").filter(Boolean).join(", ");
    return res.statusText;
  } catch {
    return res.statusText;
  }
}

async function postChat(message: string): Promise<{ ok: true; data: ChatApiResponse } | { ok: false; status: number; error: string }> {
  const res = await fetch("/api/v1/chat", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });
  if (res.ok) return { ok: true, data: (await res.json()) as ChatApiResponse };
  return { ok: false, status: res.status, error: await parseError(res) };
}

/** Sends chat message; on 401 tries refresh once then retries. */
export async function sendChatMessage(message: string): Promise<ChatApiResponse> {
  let r = await postChat(message);
  if (r.ok) return r.data;
  if (r.status === 401) {
    try {
      await authRefresh();
    } catch {
      throw new Error("Session expired. Please sign in again.");
    }
    r = await postChat(message);
    if (r.ok) return r.data;
  }
  throw new Error(r.ok ? "Unknown error" : r.error);
}
