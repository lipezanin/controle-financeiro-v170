/** Tabelas de dados do SQLite que terão espelho no Supabase. */

export const TABELAS_ESPELHO = [
  "configuracoes",
  "indicadores",
  "cadastros",
  "tipos_rendimento",
  "mapeamento_fiscal",
  "ativos",
  "transacoes",
  "renda_fixa",
  "rendimentos",
  "despesas",
  "caixa_fisico",
  "posicoes",
  "impostos_mensais",
  "darf_gc",
  "cotacoes_ativos",
  "cotacoes_cambio",
  "snapshots_patrimonio",
] as const;

export type TabelaEspelho = (typeof TABELAS_ESPELHO)[number];

export const COLUNAS_SYNC = ["updated_at", "device_id", "sync_status", "deleted_at"] as const;
