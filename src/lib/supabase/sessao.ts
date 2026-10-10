/** Sessão Supabase (preenchida na etapa de auth). Sem JWT de usuário o flush fica pending. */

const CHAVE = "cf-supabase-sessao";

export type SessaoSupabase = {
  accessToken: string;
  refreshToken?: string;
  userId: string;
  email?: string;
  expiresAt?: number;
};

export function lerSessaoSupabase(): SessaoSupabase | null {
  if (typeof window === "undefined") return null;
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return null;
    const s = JSON.parse(bruto) as SessaoSupabase;
    if (!s?.accessToken || !s.userId) return null;
    return s;
  } catch {
    return null;
  }
}

export function sessaoValida(): SessaoSupabase | null {
  const s = lerSessaoSupabase();
  if (!s) return null;
  if (s.expiresAt && s.expiresAt * 1000 < Date.now() + 15_000) return null;
  return s;
}

export function gravarSessaoSupabase(s: SessaoSupabase | null): void {
  if (typeof window === "undefined") return;
  if (!s) localStorage.removeItem(CHAVE);
  else localStorage.setItem(CHAVE, JSON.stringify(s));
}

export function idDispositivo(): string {
  if (typeof window === "undefined") return "servidor";
  const k = "cf-device-id";
  let id = localStorage.getItem(k);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(k, id);
  }
  return id;
}
