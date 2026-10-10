-- Controle Financeiro 2.1 — schema SQLite local
-- Espelha as abas do Excel original, normalizado o suficiente para consultas.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Configurações chave/valor (ano corrente, limites IRPFM, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES
  ('ano_corrente', '2026'),
  ('irpfm_isento_ate', '600000'),
  ('irpfm_rampa_ate', '1200000'),
  ('irpfm_aliquota_max', '0.10'),
  ('darf_codigo', '6015'),
  ('darf_isencao_mensal', '20000'),
  ('schema_versao', '1');

-- ---------------------------------------------------------------------------
-- Indicadores de mercado (SELIC, CDI, IPCA, câmbio)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indicadores (
  chave TEXT PRIMARY KEY,
  valor REAL,
  unidade TEXT,
  atualizado_em TEXT
);

INSERT OR IGNORE INTO indicadores (chave, valor, unidade, atualizado_em) VALUES
  ('SELIC', 14.75, '% a.a.', NULL),
  ('CDI', 14.65, '% a.a.', NULL),
  ('IPCA_12M', 5.06, '% 12M', NULL),
  ('INPC_12M', 5.12, '% 12M', NULL),
  ('USD_BRL', 5.80, 'USD/BRL', NULL);

-- ---------------------------------------------------------------------------
-- Cadastros genéricos (listas da aba BASE DE DADOS)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cadastros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grupo TEXT NOT NULL,
  valor TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  UNIQUE (grupo, valor)
);

CREATE INDEX IF NOT EXISTS idx_cadastros_grupo ON cadastros (grupo);

-- ---------------------------------------------------------------------------
-- Tipos de rendimento + classificação tributária / IRPFM
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tipos_rendimento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  origem TEXT NOT NULL,
  categoria TEXT NOT NULL,
  tributacao TEXT NOT NULL,
  forma_recolhimento TEXT NOT NULL,
  classificacao_irpfm TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Mapeamento fiscal por categoria de investimento (aba MAPEAMENTO FISCAL)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mapeamento_fiscal (
  categoria TEXT PRIMARY KEY,
  grupo_fiscal TEXT NOT NULL,
  classif_irpfm_gc TEXT NOT NULL,
  forma_recolhimento_gc TEXT NOT NULL,
  aliquota_padrao REAL NOT NULL DEFAULT 0,
  isencao_20k INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO mapeamento_fiscal
  (categoria, grupo_fiscal, classif_irpfm_gc, forma_recolhimento_gc, aliquota_padrao, isencao_20k)
VALUES
  ('CDB', 'RF', 'Neutro', 'Na Fonte', 0, 0),
  ('RDB', 'RF', 'Neutro', 'Na Fonte', 0, 0),
  ('LCI', 'RF', 'Isento', 'Não se Aplica', 0, 0),
  ('LCA', 'RF', 'Isento', 'Não se Aplica', 0, 0),
  ('CRI', 'RF', 'Isento', 'Isento', 0, 0),
  ('CRA', 'RF', 'Isento', 'Isento', 0, 0),
  ('Debênture', 'RF', 'Neutro', 'Na Fonte', 0, 0),
  ('Debênture Incentivada', 'RF', 'Isento', 'Isento', 0, 0),
  ('Poupança', 'RF', 'Isento', 'Na Fonte', 0, 0),
  ('Tesouro Selic', 'RF', 'Neutro', 'Na Fonte', 0, 0),
  ('Tesouro IPCA+', 'RF', 'Neutro', 'Na Fonte', 0, 0),
  ('Tesouro Pré Fixado', 'RF', 'Neutro', 'Na Fonte', 0, 0),
  ('Fundos Imobiliários', 'FII', 'Obrigatório', 'DARF', 0.20, 0),
  ('Ações', 'BOLSA', 'Obrigatório', 'DARF', 0.15, 1),
  ('ETF Brasil', 'BOLSA', 'Obrigatório', 'DARF', 0.15, 1),
  ('Imóvel', 'IMOVEL', 'Excluído do limite', 'DARF', 0.15, 0),
  ('Previdência Privada', 'PREV', 'Neutro', 'Na Fonte', 0, 0),
  ('BDR', 'BOLSA', 'Obrigatório', 'DARF', 0.15, 1),
  ('Stocks', 'INTL', 'Obrigatório', 'DARF', 0.15, 0),
  ('ETF USA', 'INTL', 'Obrigatório', 'DARF', 0.15, 0),
  ('Reits', 'INTL', 'Obrigatório', 'DARF', 0.15, 0),
  ('Bonds', 'RF', 'Neutro', 'Na Fonte', 0, 0),
  ('Treasuries', 'RF', 'Neutro', 'Na Fonte', 0, 0);

-- ---------------------------------------------------------------------------
-- Ativos (catálogo de tickers)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ativos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  nome TEXT,
  categoria TEXT NOT NULL,
  emissor TEXT,
  liquidez TEXT,
  moeda TEXT NOT NULL DEFAULT 'BRL',
  observacao TEXT,
  UNIQUE (ticker, categoria)
);

CREATE INDEX IF NOT EXISTS idx_ativos_ticker ON ativos (ticker);

-- ---------------------------------------------------------------------------
-- Transações (aba TRANSAÇÕES — livro-razão)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nota TEXT,
  data TEXT NOT NULL,
  tipo_operacao TEXT NOT NULL,
  categoria TEXT,
  ticker TEXT,
  liquidez TEXT,
  emissor TEXT,
  instituicao TEXT,
  instituicao_destino TEXT,
  moeda TEXT NOT NULL DEFAULT 'BRL',
  origem TEXT,
  quantidade REAL,
  proporcao_desdob REAL,
  fator_desdob REAL,
  valor_orig REAL,
  taxas_orig REAL DEFAULT 0,
  valor_liq_orig REAL,
  cotacao REAL,
  valor_brl REAL,
  classif_irpfm TEXT,
  forma_recolhimento TEXT,
  qtd_anterior REAL,
  custo_ant_brl REAL,
  qtd_acumulada REAL,
  custo_acum_brl REAL,
  preco_medio_brl REAL,
  ganho_capital_brl REAL,
  ganho_capital_orig REAL,
  ganho_cambial REAL,
  iof_brl REAL DEFAULT 0,
  spread_brl REAL DEFAULT 0,
  valor_usd REAL,
  cotacao_efetiva REAL,
  cotacao_ptax REAL,
  custo_acum_usd REAL,
  preco_medio_usd REAL,
  observacao TEXT
);

CREATE INDEX IF NOT EXISTS idx_tx_data ON transacoes (data);
CREATE INDEX IF NOT EXISTS idx_tx_ticker ON transacoes (ticker);
CREATE INDEX IF NOT EXISTS idx_tx_categoria ON transacoes (categoria);

-- ---------------------------------------------------------------------------
-- Renda fixa (aba RENDA FIXA)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS renda_fixa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT,
  ticker TEXT,
  tipo_movimento TEXT,
  tipo_rf TEXT,
  emissor TEXT,
  instituicao TEXT,
  indexador TEXT,
  taxa REAL,
  data_aplicacao TEXT,
  valor_aplicado REAL,
  prazo_dias INTEGER,
  data_vencimento TEXT,
  liquidez TEXT,
  amortizacao TEXT,
  isencao_ir INTEGER NOT NULL DEFAULT 0,
  irpfm TEXT,
  status TEXT NOT NULL DEFAULT 'Ativo',
  data_resgate TEXT,
  tipo_resgate TEXT,
  valor_resgatado REAL,
  ir_pago REAL,
  valor_liq_recebido REAL,
  lancado_rendimentos INTEGER NOT NULL DEFAULT 0,
  valor_mercado REAL,
  atualizado_em TEXT,
  fonte_atualizacao TEXT,
  qtd_tesouro REAL,
  pu_atual REAL,
  moeda TEXT DEFAULT 'BRL',
  origem TEXT DEFAULT 'Nacional',
  valor_usd REAL,
  cotacao_efetiva REAL,
  iof_brl REAL DEFAULT 0,
  spread_brl REAL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_rf_status ON renda_fixa (status);
CREATE INDEX IF NOT EXISTS idx_rf_ticker ON renda_fixa (ticker);

-- ---------------------------------------------------------------------------
-- Rendimentos (aba RENDIMENTOS)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rendimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  tipo TEXT,
  origem TEXT,
  categoria TEXT,
  tributacao TEXT,
  forma_recolhimento TEXT,
  classificacao_irpfm TEXT,
  instituicao TEXT,
  ticker TEXT,
  descricao TEXT,
  moeda TEXT NOT NULL DEFAULT 'BRL',
  valor_bruto_orig REAL,
  cotacao REAL,
  valor_bruto_brl REAL,
  ir_retido REAL NOT NULL DEFAULT 0,
  valor_liquido REAL,
  valor_computavel_irpfm REAL,
  observacao TEXT
);

CREATE INDEX IF NOT EXISTS idx_rend_data ON rendimentos (data);
CREATE INDEX IF NOT EXISTS idx_rend_tipo ON rendimentos (tipo);
CREATE INDEX IF NOT EXISTS idx_rend_ticker ON rendimentos (ticker);

-- ---------------------------------------------------------------------------
-- Despesas / contas a pagar
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS despesas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data_vencimento TEXT NOT NULL,
  categoria TEXT,
  descricao TEXT,
  instituicao TEXT,
  valor REAL NOT NULL,
  data_pagamento TEXT,
  situacao TEXT,
  observacao TEXT
);

CREATE INDEX IF NOT EXISTS idx_desp_venc ON despesas (data_vencimento);
CREATE INDEX IF NOT EXISTS idx_desp_sit ON despesas (situacao);

-- ---------------------------------------------------------------------------
-- Caixa físico (espécie)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS caixa_fisico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('Depósito', 'Saque')),
  valor REAL NOT NULL,
  descricao TEXT,
  observacao TEXT
);

CREATE INDEX IF NOT EXISTS idx_caixa_data ON caixa_fisico (data);

-- ---------------------------------------------------------------------------
-- Posições consolidadas (carteira ativa / inativa)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS posicoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  categoria TEXT NOT NULL,
  emissor TEXT,
  liquidez TEXT,
  quantidade REAL NOT NULL DEFAULT 0,
  preco_medio REAL,
  preco_atual REAL,
  valor_investido REAL,
  valor_atual REAL,
  lucro_prejuizo REAL,
  lucro_pct REAL,
  proventos_liq REAL DEFAULT 0,
  lucro_proventos REAL,
  ativa INTEGER NOT NULL DEFAULT 1,
  UNIQUE (ticker, categoria)
);

CREATE INDEX IF NOT EXISTS idx_pos_ativa ON posicoes (ativa);
CREATE INDEX IF NOT EXISTS idx_pos_cat ON posicoes (categoria);

-- ---------------------------------------------------------------------------
-- Motor mensal IRPFM (aba IMPOSTO)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS impostos_mensais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  dist_lucros REAL NOT NULL DEFAULT 0,
  demais_computaveis REAL NOT NULL DEFAULT 0,
  gc_obrigatorio REAL NOT NULL DEFAULT 0,
  base_mensal REAL NOT NULL DEFAULT 0,
  base_acumulada REAL NOT NULL DEFAULT 0,
  credito_rendimentos REAL NOT NULL DEFAULT 0,
  credito_darf_gc REAL NOT NULL DEFAULT 0,
  credito_mensal REAL NOT NULL DEFAULT 0,
  credito_acumulado REAL NOT NULL DEFAULT 0,
  aliquota_efetiva REAL NOT NULL DEFAULT 0,
  imposto_teorico REAL NOT NULL DEFAULT 0,
  escudo_fiscal REAL NOT NULL DEFAULT 0,
  teto_adicional REAL NOT NULL DEFAULT 0,
  UNIQUE (ano, mes)
);

-- ---------------------------------------------------------------------------
-- DARF mensal de ganho de capital (código 6015)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS darf_gc (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  codigo TEXT NOT NULL DEFAULT '6015',
  vendas_rv REAL NOT NULL DEFAULT 0,
  gc_apurado REAL NOT NULL DEFAULT 0,
  isento INTEGER NOT NULL DEFAULT 0,
  imposto REAL NOT NULL DEFAULT 0,
  pago INTEGER NOT NULL DEFAULT 0,
  data_pagamento TEXT,
  UNIQUE (ano, mes)
);

-- ---------------------------------------------------------------------------
-- Sementes de cadastro (listas do Excel)
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO cadastros (grupo, valor, ordem) VALUES
  ('origem', 'Nacional', 1),
  ('origem', 'Internacional', 2),
  ('moeda', 'BRL', 1),
  ('moeda', 'USD', 2),
  ('moeda', 'EUR', 3),
  ('moeda', 'GBP', 4),
  ('moeda', 'ARS', 5),
  ('tipo_movimentacao', 'Saque', 1),
  ('tipo_movimentacao', 'Depósito', 2),
  ('tipo_movimentacao', 'Compra', 3),
  ('tipo_movimentacao', 'Venda', 4),
  ('tipo_movimentacao', 'Transferência', 5),
  ('tipo_movimentacao', 'Subscrição', 6),
  ('tipo_movimentacao', 'Desdobramento', 7),
  ('tipo_movimentacao', 'Resgate do Principal', 8),
  ('tipo_movimentacao', 'Parcela Imóvel', 9),
  ('tipo_movimentacao', 'ITBI / Cartório', 10),
  ('tipo_movimentacao', 'Aplicação', 11),
  ('tipo_movimentacao', 'Resgate', 12),
  ('liquidez', 'D+0', 1),
  ('liquidez', 'D+1', 2),
  ('liquidez', 'D+2', 3),
  ('liquidez', 'D+30', 4),
  ('liquidez', 'D+360', 5),
  ('liquidez', 'No Vencimento', 6),
  ('indexador', 'Prefixado', 1),
  ('indexador', 'CDI', 2),
  ('indexador', 'Selic', 3),
  ('indexador', 'IPCA+', 4),
  ('indexador', 'INPC+', 5),
  ('indexador', 'Poupança', 6),
  ('indexador', 'IGPM+', 7),
  ('indexador', 'INCC+', 8),
  ('indexador', 'CDI+', 9),
  ('indexador', 'Selic+', 10),
  ('categoria_despesa', 'Alimentação', 1),
  ('categoria_despesa', 'Assinaturas', 2),
  ('categoria_despesa', 'Beleza e Cuidados Pessoais', 3),
  ('categoria_despesa', 'Bem estar e Esporte', 4),
  ('categoria_despesa', 'Combustível', 5),
  ('categoria_despesa', 'Educação', 6),
  ('categoria_despesa', 'Impostos e Taxas', 7),
  ('categoria_despesa', 'Investimentos', 8),
  ('categoria_despesa', 'Lazer', 9),
  ('categoria_despesa', 'Moradia', 10),
  ('categoria_despesa', 'Restaurantes e Delivery', 11),
  ('categoria_despesa', 'Saúde', 12),
  ('situacao_pagamento', 'Aberto', 1),
  ('situacao_pagamento', 'Atrasado', 2),
  ('situacao_pagamento', 'Pago', 3),
  ('instituicao', 'Bradesco', 1),
  ('instituicao', 'XP Inc', 2),
  ('instituicao', 'Unicred', 3),
  ('instituicao', 'Caixa Físico', 4),
  ('instituicao', 'Outras Instituições', 5),
  ('categoria_investimento', 'CDB', 1),
  ('categoria_investimento', 'RDB', 2),
  ('categoria_investimento', 'LCI', 3),
  ('categoria_investimento', 'LCA', 4),
  ('categoria_investimento', 'CRI', 5),
  ('categoria_investimento', 'CRA', 6),
  ('categoria_investimento', 'Debênture', 7),
  ('categoria_investimento', 'Debênture Incentivada', 8),
  ('categoria_investimento', 'Poupança', 9),
  ('categoria_investimento', 'Tesouro Selic', 10),
  ('categoria_investimento', 'Tesouro IPCA+', 11),
  ('categoria_investimento', 'Tesouro Pré Fixado', 12),
  ('categoria_investimento', 'Fundos Imobiliários', 13),
  ('categoria_investimento', 'Ações', 14),
  ('categoria_investimento', 'ETF Brasil', 15),
  ('categoria_investimento', 'Imóvel', 16),
  ('categoria_investimento', 'Previdência Privada', 17),
  ('categoria_investimento', 'BDR', 18),
  ('categoria_investimento', 'Stocks', 19),
  ('categoria_investimento', 'ETF USA', 20),
  ('categoria_investimento', 'Reits', 21),
  ('categoria_investimento', 'Bonds', 22),
  ('categoria_investimento', 'Treasuries', 23);

INSERT OR IGNORE INTO tipos_rendimento
  (nome, origem, categoria, tributacao, forma_recolhimento, classificacao_irpfm)
VALUES
  ('CDB', 'Nacional', 'Renda Fixa', 'Tributável', 'Na Fonte', 'Neutro'),
  ('RDB', 'Nacional', 'Renda Fixa', 'Tributável', 'Na Fonte', 'Neutro'),
  ('LCI', 'Nacional', 'Renda Fixa', 'Não Tributável', 'Não se Aplica', 'Isento'),
  ('LCA', 'Nacional', 'Renda Fixa', 'Não Tributável', 'Não se Aplica', 'Isento'),
  ('CRI', 'Nacional', 'Renda Fixa', 'Não Tributável', 'Isento', 'Isento'),
  ('CRA', 'Nacional', 'Renda Fixa', 'Não Tributável', 'Isento', 'Isento'),
  ('Debênture', 'Nacional', 'Renda Fixa', 'Tributável', 'Na Fonte', 'Neutro'),
  ('Debênture Incentivada', 'Nacional', 'Renda Fixa', 'Não Tributável', 'Isento', 'Isento'),
  ('Poupança', 'Nacional', 'Renda Fixa', 'Não Tributável', 'Na Fonte', 'Isento'),
  ('Tesouro Selic', 'Nacional', 'Renda Fixa', 'Tributável', 'Na Fonte', 'Neutro'),
  ('Tesouro IPCA+', 'Nacional', 'Renda Fixa', 'Tributável', 'Na Fonte', 'Neutro'),
  ('Tesouro Pré Fixado', 'Nacional', 'Renda Fixa', 'Tributável', 'Na Fonte', 'Neutro'),
  ('Fundos Imobiliários - Dividendos', 'Nacional', 'Fundos Imobiliários - Renda Variável', 'Não Tributável', 'Não se Aplica', 'Neutro'),
  ('Fundos Imobiliários - Ganho de Capital', 'Nacional', 'Fundos Imobiliários - Renda Variável', 'Tributável', 'DARF', 'Obrigatório'),
  ('Ações - JCP', 'Nacional', 'Ações - Renda Variável', 'Tributável', 'Na Fonte', 'Neutro'),
  ('Ações - Ganho de Capital', 'Nacional', 'Ações - Renda Variável', 'Tributável', 'DARF', 'Obrigatório'),
  ('Ações - Aluguel', 'Nacional', 'Ações - Renda Variável', 'Tributável', 'Na Fonte', 'Neutro'),
  ('Ações - Dividendos', 'Nacional', 'Ações - Renda Variável', 'Não Tributável', 'Na Fonte', 'Obrigatório'),
  ('ETF Brasil - Ganho de Capital', 'Nacional', 'ETF''s - Renda Variável', 'Tributável', 'DARF', 'Obrigatório'),
  ('ETF Brasil - Dividendos', 'Nacional', 'ETF''s - Renda Variável', 'Tributável', 'Na Fonte', 'Neutro'),
  ('Imóvel - Aluguel', 'Nacional', 'Imóveis', 'Tributável', 'DARF', 'Neutro'),
  ('Imóvel - Ganho de Capital', 'Nacional', 'Imóveis', 'Tributável', 'DARF', 'Isento'),
  ('Resgate PGBL', 'Nacional', 'Previdência Privada', 'Tributável', 'Na Fonte', 'Neutro'),
  ('Resgate VGBL', 'Nacional', 'Previdência Privada', 'Tributável', 'Na Fonte', 'Neutro'),
  ('Distribuição de Lucros - Consultório Médico', 'Nacional', 'Consultório Médico', 'Não Tributável', 'Não se Aplica', 'Obrigatório'),
  ('Pró Labore', 'Nacional', 'Consultório Médico', 'Tributável', 'Na Fonte', 'Obrigatório'),
  ('Espécie', 'Nacional', 'Consultório Médico', 'Não Tributável', 'Não se Aplica', 'Isento'),
  ('Planos de Saúde', 'Nacional', 'Consultório Médico', 'Tributável', 'DARF', 'Obrigatório'),
  ('BDR''s - Ganho de Capital', 'Nacional', 'Ações - Renda Variável', 'Tributável', 'DARF', 'Obrigatório'),
  ('BDR''s - Dividendos', 'Nacional', 'Ações - Renda Variável', 'Tributável', 'Na Fonte', 'Neutro'),
  ('Stocks - Dividendos', 'Internacional', 'Stocks - Renda Variável', 'Não Tributável', 'Na Fonte', 'Neutro'),
  ('Stocks - Ganho de Capital', 'Internacional', 'Stocks - Renda Variável', 'Não Tributável', 'Na Fonte', 'Neutro'),
  ('ETF''s USA - Ganho de Capital', 'Internacional', 'ETF''s USA - Renda Variável', 'Não Tributável', 'Na Fonte', 'Neutro'),
  ('ETF''s USA - Dividendos', 'Internacional', 'ETF''s USA - Renda Variável', 'Não Tributável', 'Na Fonte', 'Neutro'),
  ('Reits - Dividendos', 'Internacional', 'Reits - Renda Variável', 'Não Tributável', 'Na Fonte', 'Neutro'),
  ('Reits - Ganho de Capital', 'Internacional', 'Reits - Renda Variável', 'Não Tributável', 'Na Fonte', 'Neutro'),
  ('Bonds - Juros', 'Internacional', 'Bonds - Renda Fixa', 'Não Tributável', 'Na Fonte', 'Neutro'),
  ('Treasuries - Juros', 'Internacional', 'Treasuries - Renda Fixa', 'Não Tributável', 'Na Fonte', 'Neutro'),
  ('LCA - Pagamento de Juro Mensal', 'Nacional', 'Renda Fixa', 'Não Tributável', 'Não se Aplica', 'Isento'),
  ('CDB - Pagamento de Juro Mensal', 'Nacional', 'Renda Fixa', 'Tributável', 'Na Fonte', 'Neutro'),
  ('BDR''s - Aluguel', 'Nacional', 'Ações - Renda Variável', 'Tributável', 'Na Fonte', 'Neutro');

-- ---------------------------------------------------------------------------
-- Cotações locais (Etapa 6) — preenchidas por BCB / brapi / Yahoo / COTAHIST
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cotacoes_ativos (
  ticker TEXT PRIMARY KEY,
  preco REAL NOT NULL,
  moeda TEXT NOT NULL DEFAULT 'BRL',
  fonte TEXT,
  data_preco TEXT,
  atualizado_em TEXT,
  dividend_yield REAL
);

CREATE TABLE IF NOT EXISTS cotacoes_cambio (
  data TEXT NOT NULL,
  moeda TEXT NOT NULL,
  cotacao_compra REAL,
  cotacao_venda REAL NOT NULL,
  fonte TEXT,
  PRIMARY KEY (data, moeda)
);

CREATE TABLE IF NOT EXISTS snapshots_patrimonio (
  data TEXT PRIMARY KEY,
  custo REAL,
  mercado REAL,
  caixa REAL
);

