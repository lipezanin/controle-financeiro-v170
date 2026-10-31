/**
 * Checa a última versão no GitHub (via /api/latest, que lê latest.json da Release).
 * Não instala sozinho: o usuário confirma. No desktop, o processo principal baixa
 * o Setup para %TEMP% e executa com /S (NSIS silencioso).
 */

import { APP_VERSAO } from "@/lib/app-version";

export type StatusUpdate = {
  estado: "idle" | "checando" | "atualizado" | "disponivel" | "baixando" | "indisponivel";
  local: string;
  remota: string | null;
  notas: string | null;
  url: string | null;
  detalhe: string;
};

type LatestJson = { version?: string; url?: string; notes?: string | null };

type Desktop = {
  ativo?: boolean;
  aplicarAtualizacao?: (url: string) => Promise<unknown>;
};

function versaoDesteApp(): string {
  if (typeof window === "undefined") return APP_VERSAO;
  const desktop = (window as unknown as { cfDesktop?: { versao?: string } }).cfDesktop;
  return desktop?.versao || APP_VERSAO;
}

const DISMISS_KEY = "cf-update-dismiss";

let status: StatusUpdate = {
  estado: "idle",
  local: versaoDesteApp(),
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

function dispensada(versao: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DISMISS_KEY) === versao;
}

export function dispensarUpdate(versao: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DISMISS_KEY, versao);
  emitir({ estado: "atualizado", detalhe: `v${versaoDesteApp()} (aviso oculto)` });
}

export async function checarUpdate(): Promise<StatusUpdate> {
  emitir({ estado: "checando", detalhe: "Consultando versões…" });
  try {
    const r = await fetch("/api/latest", { cache: "no-store" });
    if (!r.ok) {
      emitir({ estado: "indisponivel", detalhe: `HTTP ${r.status}` });
      return status;
    }
    const ultima = (await r.json()) as LatestJson;
    const local = versaoDesteApp();
    if (!ultima.version || !ultima.url) {
      emitir({ estado: "atualizado", remota: null, detalhe: `v${local} · sem catálogo` });
      return status;
    }
    if (!versaoMaior(ultima.version, local)) {
      emitir({
        estado: "atualizado",
        local,
        remota: ultima.version,
        notas: ultima.notes ?? null,
        url: ultima.url,
        detalhe: `v${local} em dia`,
      });
      return status;
    }
    if (dispensada(ultima.version)) {
      emitir({
        estado: "atualizado",
        local,
        remota: ultima.version,
        notas: ultima.notes ?? null,
        url: ultima.url,
        detalhe: `v${local} (v${ultima.version} oculta)`,
      });
      return status;
    }
    emitir({
      estado: "disponivel",
      local,
      remota: ultima.version,
      notas: ultima.notes ?? null,
      url: ultima.url,
      detalhe: `Nova versão ${ultima.version}`,
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

/** Confirmação do usuário. No Windows desktop instala em silêncio e reabre. No navegador, baixa o arquivo. */
export async function confirmarAtualizacao(): Promise<void> {
  const url = status.url;
  if (!url) return;
  const desktop = (window as unknown as { cfDesktop?: Desktop }).cfDesktop;
  if (desktop?.ativo && desktop.aplicarAtualizacao && /^https:\/\//.test(url)) {
    emitir({ estado: "baixando", detalhe: "Baixando e instalando…" });
    await desktop.aplicarAtualizacao(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function iniciarChecagemUpdate(): void {
  if (typeof window === "undefined" || iniciado) return;
  iniciado = true;
  void checarUpdate();
  timer = setInterval(() => void checarUpdate(), 30 * 60 * 1000);
  void timer;
}
