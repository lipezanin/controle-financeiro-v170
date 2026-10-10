/**
 * Auth do espelho Supabase (e-mail/senha). Independente do login Grok.
 * Só URL + anon. Sem sessão, o app continua 100% local.
 */

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import { gravarSessaoSupabase, lerSessaoSupabase, type SessaoSupabase } from "@/lib/supabase/sessao";

type TokenJson = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: { id?: string; email?: string };
  msg?: string;
  error_description?: string;
  error?: string;
};

function authUrl(path: string): string {
  return `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1${path}`;
}

function cabecalhos(token?: string): HeadersInit {
  const t = token ?? SUPABASE_ANON_KEY;
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${t}`,
    "Content-Type": "application/json",
  };
}

function paraSessao(j: TokenJson): SessaoSupabase {
  if (!j.access_token || !j.user?.id) {
    throw new Error(j.msg || j.error_description || j.error || "Resposta de auth incompleta.");
  }
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    userId: j.user.id,
    email: j.user.email,
    expiresAt: j.expires_at ?? Math.floor(Date.now() / 1000) + (j.expires_in ?? 3600),
  };
}

async function postAuth(path: string, body: Record<string, string>, token?: string): Promise<TokenJson> {
  const r = await fetch(authUrl(path), {
    method: "POST",
    headers: cabecalhos(token),
    body: JSON.stringify(body),
  });
  const j = (await r.json()) as TokenJson;
  if (!r.ok) {
    throw new Error(j.msg || j.error_description || j.error || `HTTP ${r.status}`);
  }
  return j;
}

export async function entrarComEmail(email: string, senha: string): Promise<SessaoSupabase> {
  const j = await postAuth("/token?grant_type=password", { email: email.trim(), password: senha });
  const s = paraSessao(j);
  gravarSessaoSupabase(s);
  return s;
}

export async function criarConta(email: string, senha: string): Promise<{ sessao: SessaoSupabase | null; precisaConfirmar: boolean }> {
  const j = await postAuth("/signup", { email: email.trim(), password: senha });
  if (!j.access_token) {
    return { sessao: null, precisaConfirmar: true };
  }
  const s = paraSessao(j);
  gravarSessaoSupabase(s);
  return { sessao: s, precisaConfirmar: false };
}

export async function sairSupabase(): Promise<void> {
  const s = lerSessaoSupabase();
  try {
    if (s) await postAuth("/logout", {}, s.accessToken);
  } catch {
    /* logout local mesmo se a nuvem falhar */
  }
  gravarSessaoSupabase(null);
}

export async function restaurarSessao(): Promise<SessaoSupabase | null> {
  const atual = lerSessaoSupabase();
  if (atual) return atual;
  if (typeof window === "undefined") return null;
  try {
    const bruto = localStorage.getItem("cf-supabase-sessao");
    if (!bruto) return null;
    const velha = JSON.parse(bruto) as SessaoSupabase;
    if (!velha.refreshToken) return null;
    const j = await postAuth("/token?grant_type=refresh_token", { refresh_token: velha.refreshToken });
    const s = paraSessao(j);
    gravarSessaoSupabase(s);
    return s;
  } catch {
    gravarSessaoSupabase(null);
    return null;
  }
}
