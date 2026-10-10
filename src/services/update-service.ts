/**
 * Checa releases em public.app_versions (Supabase).
 * Não baixa o instalador sozinho: avisa e aponta a URL pública do Storage.
 */

import { APP_CANAL, APP_VERSAO } from "@/lib/app-version";
import { cabecalhosAnon, SUPABASE_REST, SUPABASE_URL } from "@/lib/supabase/config";

export type ReleaseRemota = {
  versao: string;
  canal: string;
  obrigatoria: boolean;
  notas: string | null;
  arquivo_url: string | null;
  arquivo_path: string | null;
  sha256: string | null;
  created_at: string;
};

export type StatusUpdate = {
  estado: "idle" | "checando" | "atualizado" | "disponivel" | "obrigatoria" | "indisponivel";
  local: string;
  remota: string | null;
  notas: string | null;
  url: string | null;
  detalhe: string;
};

const DISMISS_KEY = "cf-update-dismiss";

let status: StatusUpdate = {
  estado: "idle",
  local: APP_VERSAO,
  remota: null,
  notas: null,
  url: null,
  detalhe: `v${APP_VERSAO}`,
};
const ouvintes = new Set<(s: StatusUpdate) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let iniciado = false;

export function onStatusUpdate(fn: (s: StatusUpdate) => void): () => void {
  ouvintes.add(fn);
  fn(status);
  return () => {
    ouvintes.delete(fn);
  };
}

function emitir(parcial: Partial<StatusUpdate>) {
  status = { ...status, ...parcial };
  for (const fn of ouvintes) fn(status);
}

function partes(v: string): number[] {
  return v
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((p) => Number.parseInt(p, 10) || 0);
}

export function versaoMaior(a: string, b: string): boolean {
  const pa = partes(a);
  const pb = partes(b);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return true;
    if (da < db) return false;
  }
  return false;
}

function urlArquivo(r: ReleaseRemota): string | null {
  if (r.arquivo_url) return r.arquivo_url;
  if (r.arquivo_path) {
    return `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/releases/${r.arquivo_path.replace(/^\//, "")}`;
  }
  return null;
}

function dispensada(versao: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DISMISS_KEY) === versao;
}

export function dispensarUpdate(versao: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DISMISS_KEY, versao);
  emitir({ estado: "atualizado", detalhe: `v${APP_VERSAO} (aviso oculto)` });
}

export async function checarUpdate(): Promise<StatusUpdate> {
  emitir({ estado: "checando", detalhe: "Consultando versões…" });
  try {
    const r = await fetch(
      `${SUPABASE_REST}/app_versions?canal=eq.${encodeURIComponent(APP_CANAL)}&select=*&order=created_at.desc&limit=1`,
      { headers: cabecalhosAnon() },
    );
    if (r.status === 404 || r.status === 406) {
      emitir({ estado: "indisponivel", detalhe: "Catálogo de versões ainda não aplicado no SQL." });
      return status;
    }
    if (!r.ok) {
      emitir({ estado: "indisponivel", detalhe: `HTTP ${r.status}` });
      return status;
    }
    const lista = (await r.json()) as ReleaseRemota[];
    const ultima = lista[0];
    if (!ultima) {
      emitir({ estado: "atualizado", remota: null, detalhe: `v${APP_VERSAO} · catálogo vazio` });
      return status;
    }
    const url = urlArquivo(ultima);
    if (!versaoMaior(ultima.versao, APP_VERSAO)) {
      emitir({
        estado: "atualizado",
        remota: ultima.versao,
        notas: ultima.notas,
        url,
        detalhe: `v${APP_VERSAO} em dia`,
      });
      return status;
    }
    if (ultima.obrigatoria) {
      emitir({
        estado: "obrigatoria",
        remota: ultima.versao,
        notas: ultima.notas,
        url,
        detalhe: `Atualização obrigatória ${ultima.versao}`,
      });
      return status;
    }
    if (dispensada(ultima.versao)) {
      emitir({
        estado: "atualizado",
        remota: ultima.versao,
        notas: ultima.notas,
        url,
        detalhe: `v${APP_VERSAO} (v${ultima.versao} oculta)`,
      });
      return status;
    }
    emitir({
      estado: "disponivel",
      remota: ultima.versao,
      notas: ultima.notas,
      url,
      detalhe: `Nova versão ${ultima.versao}`,
    });
    return status;
  } catch (e) {
    emitir({
      estado: "indisponivel",
      detalhe: e instanceof Error ? e.message : "Falha ao checar versão",
    });
    return status;
  }
}

export function iniciarChecagemUpdate(): void {
  if (typeof window === "undefined" || iniciado) return;
  iniciado = true;
  void checarUpdate();
  timer = setInterval(() => void checarUpdate(), 30 * 60 * 1000);
  void timer;
}
