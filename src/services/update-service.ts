/**
 * Checa a última versão no GitHub (via /api/latest, que lê latest.json da Release).
 * Não instala sozinho: o usuário confirma. No desktop, o processo principal baixa
 * o Setup para %TEMP% e executa com /S (NSIS silencioso).
 */

import { APP_VERSAO } from "@/lib/app-version";

export type StatusUpdate = {
  estado: "idle" | "checando" | "atualizado" | "disponivel" | "baixando" | "pronto" | "indisponivel";
  local: string;
  remota: string | null;
  notas: string | null;
  url: string | null;
  deltaUrl: string | null;
  detalhe: string;
};

type DeltaInfo = { from?: string; url?: string; bytes?: number | null };
type LatestJson = { version?: string; url?: string; notes?: string | null; delta?: DeltaInfo | null };

type Desktop = {
  ativo?: boolean;
  aplicarAtualizacao?: (url: string) => Promise<unknown>;
  baixarDelta?: (url: string) => Promise<unknown>;
  aplicarDelta?: () => Promise<unknown>;
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
  deltaUrl: null,
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

/** Comparação numérica. 2.0.008 é maior que 2.0.7 e igual a 2.0.8. */
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
    const deltaCompativel = Boolean(ultima.delta?.url) && (!ultima.delta?.from || ultima.delta.from === local);
    emitir({
      estado: deltaCompativel ? "baixando" : "disponivel",
      local,
      remota: ultima.version,
      notas: ultima.notes ?? null,
      url: ultima.url,
      deltaUrl: deltaCompativel ? (ultima.delta?.url ?? null) : null,
      detalhe: deltaCompativel
        ? `Baixando só o que mudou para ${ultima.version}…`
        : `Nova versão ${ultima.version}`,
    });
    if (deltaCompativel && ultima.delta?.url) {
      const desktop = (window as unknown as { cfDesktop?: Desktop }).cfDesktop;
      if (desktop?.ativo && desktop.baixarDelta) {
        const versao = ultima.version;
        const deltaUrl = ultima.delta.url;
        void desktop
          .baixarDelta(deltaUrl)
          .then(() => {
            emitir({
              estado: "pronto",
              detalhe: `Atualização ${versao} pronta. Reinicie para aplicar só os arquivos novos.`,
            });
          })
          .catch((e: unknown) => {
            emitir({
              estado: "disponivel",
              deltaUrl: null,
              detalhe: e instanceof Error ? e.message : "Delta indisponível. Use o instalador completo.",
            });
          });
      } else {
        emitir({ estado: "disponivel", detalhe: `Nova versão ${ultima.version}` });
      }
    }
    return status;
  } catch (e) {
    emitir({
      estado: "indisponivel",
      detalhe: e instanceof Error ? e.message : "Falha ao checar versão",
    });
    return status;
  }
}

/** Confirmação do usuário. Delta já baixado só pede o reinício. Sem delta, baixa o instalador inteiro. */
export async function confirmarAtualizacao(): Promise<void> {
  const desktop = (window as unknown as { cfDesktop?: Desktop }).cfDesktop;
  if (desktop?.ativo && desktop.aplicarDelta && status.estado === "pronto") {
    emitir({ estado: "baixando", detalhe: "Aplicando arquivos e reiniciando…" });
    await desktop.aplicarDelta();
    return;
  }
  const url = status.url;
  if (!url) return;
  if (desktop?.ativo && desktop.aplicarAtualizacao && /^https:\/\//.test(url)) {
    emitir({ estado: "baixando", detalhe: "Baixando o instalador completo…" });
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
