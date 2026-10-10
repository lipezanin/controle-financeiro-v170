/**
 * Definição das sessões da Base de Dados.
 * Cada sessão tem tabela SQLite própria (cad_*), espelhando cadastros de ERP.
 */

import type { Database } from "sql.js";

export type SessaoCadastro = {
  id: string;
  tabela: string;
  rotulo: string;
  secao: string;
  descricao: string;
  usadoEm: string;
  especial?: "tipo_rendimento";
};

export const SESSOES_CADASTRO: SessaoCadastro[] = [
  {
    id: "tipo_rendimento",
    tabela: "tipos_rendimento",
    rotulo: "Tipo de rendimento",
    secao: "Rendimentos",
    descricao: "Classificação fiscal de cada tipo (origem, tributação, IRPFM).",
    usadoEm: "Extrato bancário, conta a receber, motor IRPF",
    especial: "tipo_rendimento",
  },
  {
    id: "categoria_rendimento",
    tabela: "cad_categoria_rendimento",
    rotulo: "Categoria de rendimento",
    secao: "Rendimentos",
    descricao: "Agrupa os tipos (Renda Fixa, Ações, Imóveis…).",
    usadoEm: "Cadastro de tipo de rendimento",
  },
  {
    id: "tributacao",
    tabela: "cad_tributacao",
    rotulo: "Tributação",
    secao: "Rendimentos",
    descricao: "Se o rendimento é tributável ou não.",
    usadoEm: "Cadastro de tipo de rendimento",
  },
  {
    id: "forma_recolhimento",
    tabela: "cad_forma_recolhimento",
    rotulo: "Forma de recolhimento",
    secao: "Rendimentos",
    descricao: "Como o imposto é recolhido (fonte, DARF, isento).",
    usadoEm: "Cadastro de tipo de rendimento, IRPF",
  },
  {
    id: "classificacao_irpfm",
    tabela: "cad_classificacao_irpfm",
    rotulo: "Classificação IRPFM",
    secao: "Rendimentos",
    descricao: "Enquadramento na Lei 15.270/2025.",
    usadoEm: "Cadastro de tipo de rendimento, IRPFM",
  },
  {
    id: "categoria_despesa",
    tabela: "cad_categoria_despesa",
    rotulo: "Categorias de despesas",
    secao: "Despesas",
    descricao: "Plano de contas de gastos.",
    usadoEm: "Conta a pagar, módulo Financeiro",
  },
  {
    id: "situacao_pagamento",
    tabela: "cad_situacao_pagamento",
    rotulo: "Situação de pagamento",
    secao: "Despesas",
    descricao: "Aberto, pago, atrasado.",
    usadoEm: "Conta a pagar",
  },
  {
    id: "instituicao",
    tabela: "cad_instituicao",
    rotulo: "Instituições / corretoras",
    secao: "Gerais",
    descricao: "Bancos, corretoras e custódias.",
    usadoEm: "Nota de corretagem, extrato, transação, imóvel, renda fixa",
  },
  {
    id: "tipo_movimentacao",
    tabela: "cad_tipo_movimentacao",
    rotulo: "Tipo de movimentação",
    secao: "Gerais",
    descricao: "Compra, venda, parcela, transferência…",
    usadoEm: "Nota de corretagem, transação avulsa",
  },
  {
    id: "moeda",
    tabela: "cad_moeda",
    rotulo: "Moeda",
    secao: "Gerais",
    descricao: "Moedas de lançamento e câmbio.",
    usadoEm: "Nota, extrato, transação, rendimentos",
  },
  {
    id: "origem",
    tabela: "cad_origem",
    rotulo: "Origem",
    secao: "Gerais",
    descricao: "Nacional ou internacional.",
    usadoEm: "Extrato, rendimentos, tipo de rendimento",
  },
  {
    id: "categoria_investimento",
    tabela: "cad_categoria_investimento",
    rotulo: "Categorias de investimentos",
    secao: "Investimentos",
    descricao: "Classe do ativo (Ações, FII, CDB, Imóvel…).",
    usadoEm: "Nota de corretagem, transação, carteira, mapeamento fiscal",
  },
  {
    id: "liquidez",
    tabela: "cad_liquidez",
    rotulo: "Liquidez",
    secao: "Investimentos",
    descricao: "Prazo de liquidação (D+0, D+2, vencimento).",
    usadoEm: "Nota de corretagem, transação, renda fixa",
  },
  {
    id: "indexador",
    tabela: "cad_indexador",
    rotulo: "Indexador",
    secao: "Investimentos",
    descricao: "Indexadores de renda fixa (CDI, IPCA+, Prefixado…).",
    usadoEm: "Renda fixa",
  },
];

export const SEMENTES_CADASTRO: Record<string, string[]> = {
  origem: ["Nacional", "Internacional"],
  moeda: ["BRL", "USD", "EUR", "GBP", "ARS"],
  tipo_movimentacao: [
    "Compra",
    "Venda",
    "Transferência",
    "Subscrição",
    "Desdobramento",
    "Bonificação",
    "Saque",
    "Depósito",
    "Aplicação",
    "Resgate",
    "Resgate do Principal",
    "Parcela Imóvel",
    "ITBI / Cartório",
  ],
  liquidez: ["D+0", "D+1", "D+2", "D+30", "D+360", "No Vencimento"],
  indexador: [
    "Prefixado",
    "CDI",
    "Selic",
    "IPCA+",
    "INPC+",
    "Poupança",
    "IGPM+",
    "INCC+",
    "CDI+",
    "Selic+",
  ],
  categoria_despesa: [
    "Alimentação",
    "Assinaturas",
    "Beleza e Cuidados Pessoais",
    "Bem estar e Esporte",
    "Combustível",
    "Educação",
    "Impostos e Taxas",
    "Investimentos",
    "Lazer",
    "Moradia",
    "Restaurantes e Delivery",
    "Saúde",
    "Transporte",
    "Outros",
  ],
  situacao_pagamento: ["Aberto", "Atrasado", "Pago"],
  instituicao: ["Bradesco", "XP Inc", "Unicred", "Caixa Físico", "Outras Instituições"],
  categoria_investimento: [
    "CDB",
    "RDB",
    "LCI",
    "LCA",
    "CRI",
    "CRA",
    "Debênture",
    "Debênture Incentivada",
    "Poupança",
    "Tesouro Selic",
    "Tesouro IPCA+",
    "Tesouro Pré Fixado",
    "Fundos Imobiliários",
    "Ações",
    "ETF Brasil",
    "Imóvel",
    "Imóveis",
    "Previdência Privada",
    "BDR",
    "Stocks",
    "ETF USA",
    "Reits",
    "Bonds",
    "Treasuries",
  ],
  categoria_rendimento: [
    "Renda Fixa",
    "Fundos Imobiliários - Renda Variável",
    "Ações - Renda Variável",
    "ETF's - Renda Variável",
    "Imóveis",
    "Previdência Privada",
    "Consultório Médico",
    "Internacional",
    "Outros",
  ],
  tributacao: ["Tributável", "Não Tributável"],
  forma_recolhimento: ["Na Fonte", "DARF", "Não se Aplica", "Isento"],
  classificacao_irpfm: ["Neutro", "Isento", "Obrigatório", "Excluído do limite"],
};

export function tabelaDaSessao(id: string): string {
  const s = SESSOES_CADASTRO.find((x) => x.id === id);
  if (!s) throw new Error(`Sessão de cadastro desconhecida: ${id}`);
  return s.tabela;
}

function count(db: Database, sql: string, params: (string | number)[] = []): number {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let n = 0;
  if (stmt.step()) n = Number(stmt.getAsObject().n ?? 0);
  stmt.free();
  return n;
}

/** Cria cad_* e copia do EAV legado. Chamado no boot do SQLite. */
export function aplicarSchemaCadastros(db: Database): void {
  for (const s of SESSOES_CADASTRO) {
    if (s.especial) continue;
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${s.tabela} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT,
        nome TEXT NOT NULL,
        ativo INTEGER NOT NULL DEFAULT 1,
        ordem INTEGER NOT NULL DEFAULT 0,
        observacao TEXT,
        UNIQUE (nome)
      );
      CREATE INDEX IF NOT EXISTS idx_${s.tabela}_ordem ON ${s.tabela} (ordem, nome);
    `);
    if (count(db, `SELECT COUNT(*) AS n FROM ${s.tabela}`) === 0) {
      const stmtLeg = db.prepare(
        `SELECT valor, ordem FROM cadastros WHERE grupo = ? ORDER BY ordem, valor`,
      );
      stmtLeg.bind([s.id]);
      const legado: { nome: string; ordem: number }[] = [];
      while (stmtLeg.step()) {
        const r = stmtLeg.getAsObject();
        legado.push({ nome: String(r.valor ?? ""), ordem: Number(r.ordem ?? 0) });
      }
      stmtLeg.free();
      const fonte =
        legado.length > 0
          ? legado
          : (SEMENTES_CADASTRO[s.id] ?? []).map((nome, i) => ({ nome, ordem: i + 1 }));
      const ins = db.prepare(`INSERT OR IGNORE INTO ${s.tabela} (nome, ordem, ativo) VALUES (?, ?, 1)`);
      fonte.forEach((it, i) => {
        if (!it.nome.trim()) return;
        ins.run([it.nome.trim(), it.ordem || i + 1]);
      });
      ins.free();
    }
    const insEav = db.prepare(
      `INSERT OR IGNORE INTO cadastros (grupo, valor, ordem) VALUES (?, ?, ?)`,
    );
    const sel = db.prepare(`SELECT nome, ordem FROM ${s.tabela} WHERE ativo = 1`);
    while (sel.step()) {
      const r = sel.getAsObject();
      insEav.run([s.id, String(r.nome), Number(r.ordem ?? 0)]);
    }
    sel.free();
    insEav.free();
  }
  const cols: string[] = [];
  const pragma = db.prepare(`PRAGMA table_info(tipos_rendimento)`);
  while (pragma.step()) cols.push(String(pragma.getAsObject().name));
  pragma.free();
  if (!cols.includes("ativo")) {
    db.run(`ALTER TABLE tipos_rendimento ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1`);
  }
}
