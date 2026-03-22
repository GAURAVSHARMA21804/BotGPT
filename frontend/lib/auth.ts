/**
 * Calls go to same-origin `/api/...` (Next.js rewrites → FastAPI) so httpOnly cookies work.
 */

const prefix = "/api";

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

export type UserOut = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
};

/** Matches backend `SuccessResponse` / `ForgotPasswordSuccessResponse`. */
export type SuccessMessage = {
  success: boolean;
  message: string;
  reset_token?: string;
  expires_in_hours?: number;
};

export async function authLogin(email: string, password: string): Promise<UserOut> {
  const res = await fetch(`${prefix}/v1/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<UserOut>;
}

export async function authRegister(body: {
  email: string;
  password: string;
  first_name?: string | null;
  last_name?: string | null;
}): Promise<UserOut> {
  const res = await fetch(`${prefix}/v1/auth/register`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<UserOut>;
}

export async function authLogout(): Promise<void> {
  await fetch(`${prefix}/v1/auth/logout`, {
    method: "POST",
    credentials: "include"
  });
}

export async function authRefresh(): Promise<UserOut> {
  const res = await fetch(`${prefix}/v1/auth/refresh`, {
    method: "POST",
    credentials: "include"
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<UserOut>;
}

export async function authMe(): Promise<UserOut> {
  const res = await fetch(`${prefix}/v1/auth/me`, { credentials: "include" });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<UserOut>;
}

export async function authForgotPassword(email: string): Promise<SuccessMessage> {
  const res = await fetch(`${prefix}/v1/auth/forgot-password`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<SuccessMessage>;
}

export async function authResetPassword(
  token: string,
  new_password: string
): Promise<SuccessMessage> {
  const res = await fetch(`${prefix}/v1/auth/reset-password`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, new_password })
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<SuccessMessage>;
}
