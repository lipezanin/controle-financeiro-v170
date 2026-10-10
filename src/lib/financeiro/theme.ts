/**
 * Tokens visuais do Controle Financeiro.
 * Espelho das cores do Excel original (tema escuro).
 * A fonte da verdade no CSS é `src/styles.css` (@theme).
 */

export const CORES = {
  fundo: "#0f172a",
  card: "#1e293b",
  borda: "#334155",
  texto: "#f1f5f9",
  textoSecundario: "#94a3b8",
  accent: "#3b82f6",
  campoFundo: "#1e3a5f",
  campoBorda: "#3b82f6",
  lucro: "#22c55e",
  prejuizo: "#ef4444",
  alerta: "#eab308",
} as const;

export const CORES_GRAFICO = [
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#38bdf8",
  "#94a3b8",
  "#64748b",
  "#f1f5f9",
  "#ef4444",
] as const;

/** Paleta do donut / cards de classe (inspirada em Status Invest, no tema escuro). */
export const CORES_CLASSE = [
  "#8b5cf6",
  "#ef4444",
  "#22c55e",
  "#38bdf8",
  "#f97316",
  "#eab308",
  "#ec4899",
  "#14b8a6",
  "#6366f1",
  "#94a3b8",
  "#3b82f6",
  "#a3e635",
] as const;

export const CLASSES_INVESTIMENTO = [
  "Renda Fixa",
  "Fundos Imobiliários",
  "Ações",
  "ETF's Nacionais",
  "Imóveis",
  "Previdência Privada",
  "Stocks",
  "ETF's USA",
  "Reits",
  "Bonds - Renda Fixa",
  "Treasuries - Renda Fixa",
  "BDR",
] as const;

export const FAIXAS_LIQUIDEZ = [
  "D+0",
  "D+1",
  "D+2",
  "D+30",
  "D+360",
  "No Vencimento",
] as const;

/** Limites da Lei 15.270/2025 (IRPFM). */
export const IRPFM = {
  isentoAte: 600_000,
  rampaAte: 1_200_000,
  aliquotaMax: 0.1,
  darfCodigo: "6015",
  darfIsencaoMensal: 20_000,
} as const;
