/**
 * Atualização automática de mercado a cada 10 minutos.
 * Taxas SGS, PTAX, cotações de ativos e mark-to-market da renda fixa.
 * Um único timer no cliente — não depende de botões na UI.
 */

import { consultar, executar, getDb, salvarDb } from "@/lib/financeiro/db";
import { atualizarDolar } from "@/services/cambio-service";
import { atualizarPosicoes } from "@/services/cotacao-ativos-service";
import { gravarSnapshotPatrimonio } from "@/services/evolucao-patrimonio-service";
import { atualizarRendaFixa } from "@/services/renda-fixa-service";
import { atualizarTaxas } from "@/services/taxas-service";

export const INTERVALO_MERCADO_MS = 10 * 60 * 1000;
export const EVENTO_MERCADO = "financeiro:mercado-atualizado";

export type StatusMercado = {
  rodando: boolean;
  ultimaIso: string | null;
  detalhe: string | null;
  erro: string | null;
};

let timer: ReturnType<typeof setInterval> | number | null = null;
let iniciado = false;
let emCurso = false;
let status: StatusMercado = { rodando: false, ultimaIso: null, detalhe: null, erro: null };
const ouvintes = new Set<(s: StatusMercado) => void>();

function emitir(): void {
  for (const cb of ouvintes) cb(status);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENTO_MERCADO, { detail: status }));
  }
}

async function lerUltima(): Promise<string | null> {
  try {
    const db = await getDb();
    const v = consultar(db, `SELECT valor FROM configuracoes WHERE chave = 'mercado_atualizado_em'`)[0]?.valor;
    return v ? String(v) : null;
  } catch {
    return null;
  }
}

async function gravarUltima(iso: string, detalhe: string): Promise<void> {
  const db = await getDb();
  executar(db, `INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('mercado_atualizado_em', ?)`, [iso]);
  executar(db, `INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('mercado_detalhe', ?)`, [detalhe]);
  await salvarDb();
}

async function ciclo(): Promise<void> {
  if (emCurso || typeof window === "undefined") return;
  if (document.visibilityState === "hidden") return;
  emCurso = true;
  status = { ...status, rodando: true, erro: null };
  emitir();
  const partes: string[] = [];
  try {
    try {
      await atualizarTaxas();
      partes.push("SGS");
    } catch (e) {
      partes.push(`SGS falhou`);
      status.erro = e instanceof Error ? e.message : "SGS";
    }
    try {
      const d = await atualizarDolar();
      partes.push(`PTAX ${d.venda.toLocaleString("pt-BR")}`);
    } catch (e) {
      partes.push("PTAX falhou");
      status.erro = e instanceof Error ? e.message : "PTAX";
    }
    try {
      const p = await atualizarPosicoes();
      partes.push(`${p.ok} cotações`);
    } catch (e) {
      partes.push("cotações falharam");
      status.erro = e instanceof Error ? e.message : "cotações";
    }
    try {
      const rf = await atualizarRendaFixa({ pularTaxas: true });
      partes.push(`${rf.atualizados} RF`);
    } catch (e) {
      partes.push("RF falhou");
      status.erro = e instanceof Error ? e.message : "renda fixa";
    }
    try {
      await gravarSnapshotPatrimonio();
      partes.push("snapshot");
    } catch {
      partes.push("snapshot falhou");
    }
    const iso = new Date().toISOString();
    const detalhe = partes.join(" · ");
    await gravarUltima(iso, detalhe);
    status = { rodando: false, ultimaIso: iso, detalhe, erro: status.erro };
  } catch (e) {
    status = {
      ...status,
      rodando: false,
      erro: e instanceof Error ? e.message : "Falha na atualização automática",
    };
  } finally {
    emCurso = false;
    emitir();
  }
}

function vencido(iso: string | null): boolean {
  if (!iso) return true;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t >= INTERVALO_MERCADO_MS;
}

/** Idempotente. Chamar uma vez no AppShell (cliente). */
export function iniciarAtualizacaoAutomatica(): void {
  if (typeof window === "undefined" || iniciado) return;
  iniciado = true;
  void (async () => {
    const ultima = await lerUltima();
    status = { ...status, ultimaIso: ultima };
    emitir();
    if (vencido(ultima)) {
      window.setTimeout(() => void ciclo(), 8_000);
    }
    timer = window.setInterval(() => void ciclo(), INTERVALO_MERCADO_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && vencido(status.ultimaIso)) void ciclo();
    });
    agendarHistoricoNoturno();
  })();
}

function msAte21h(): number {
  const agora = new Date();
  const alvo = new Date(agora);
  alvo.setHours(21, 0, 0, 0);
  if (agora.getTime() >= alvo.getTime()) alvo.setDate(alvo.getDate() + 1);
  return alvo.getTime() - agora.getTime();
}

/** API 1 — 21h local: grava PTAX, CDI/SELIC/IPCA e fechamento da janela de cada ativo. */
function agendarHistoricoNoturno(): void {
  const disparar = () => {
    void import("@/services/historico-mercado-service")
      .then((m) => m.cicloHistoricoNoturno())
      .catch(() => undefined);
    window.setTimeout(disparar, 24 * 60 * 60 * 1000);
  };
  window.setTimeout(disparar, msAte21h());
  void import("@/services/historico-mercado-service").then(async (m) => {
    const ultima = await m.ultimoHistoricoNoturno();
    const hoje = new Date().toISOString().slice(0, 10);
    if (new Date().getHours() >= 21 && (!ultima || !ultima.startsWith(hoje))) {
      void m.cicloHistoricoNoturno().catch(() => undefined);
    }
  });
}

export function statusMercado(): StatusMercado {
  return status;
}

export function onStatusMercado(cb: (s: StatusMercado) => void): () => void {
  ouvintes.add(cb);
  cb(status);
  return () => {
    ouvintes.delete(cb);
  };
}
