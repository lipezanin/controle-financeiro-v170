/**
 * Banco SQLite 100% local (sql.js + IndexedDB).
 * Nada é enviado à nuvem: o arquivo vive no navegador deste dispositivo.
 */

import type { Database } from "sql.js";
import { aplicarSchemaCadastros } from "./cadastros-def";
import schemaSql from "./schema.sql?raw";
import syncTriggersSql from "./sync-triggers.sql?raw";

const IDB_NAME = "controle-financeiro-v2";
const IDB_STORE = "sqlite";
const IDB_KEY = "arquivo";
const WASM_PUBLICO = "/sql-wasm/sql-wasm.wasm";

let instancia: Database | null = null;
let iniciando: Promise<Database> | null = null;

function somenteCliente(): void {
  if (typeof window === "undefined") {
    throw new Error("O banco SQLite só existe no navegador.");
  }
}

function abrirIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function lerArquivoSalvo(): Promise<Uint8Array | null> {
  const idb = await abrirIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => {
      const val = req.result;
      if (val instanceof Uint8Array) resolve(val);
      else if (val instanceof ArrayBuffer) resolve(new Uint8Array(val));
      else resolve(null);
    };
    req.onerror = () => reject(req.error);
  });
}

async function gravarArquivo(bytes: Uint8Array): Promise<void> {
  const idb = await abrirIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function urlDoWasm(): Promise<string> {
  try {
    const mod = await import("sql.js/dist/sql-wasm.wasm?url");
    return mod.default;
  } catch {
    return WASM_PUBLICO;
  }
}

async function criarEngine() {
  const initSqlJs = (await import("sql.js")).default;
  const wasmUrl = await urlDoWasm();
  return initSqlJs({
    locateFile: () => wasmUrl,
  });
}

async function abrirOuCriar(): Promise<Database> {
  somenteCliente();
  const SQL = await criarEngine();
  const salvo = await lerArquivoSalvo();
  const db = salvo ? new SQL.Database(salvo) : new SQL.Database();
  db.exec(schemaSql);
  migrarSchema(db);
  await gravarArquivo(db.export());
  return db;
}

function nomesColunas(db: Database, tabela: string): string[] {
  return consultar(db, `PRAGMA table_info(${tabela})`).map((r) => String(r.name));
}

function garantirColuna(db: Database, tabela: string, coluna: string, tipo: string): void {
  if (!nomesColunas(db, tabela).includes(coluna)) {
    db.run(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
  }
}

/** Colunas novas em bancos já criados nas etapas anteriores. */
function migrarSchema(db: Database): void {
  const extras: [string, string][] = [
    ["qtd_anterior", "REAL"],
    ["custo_ant_brl", "REAL"],
    ["qtd_acumulada", "REAL"],
    ["custo_acum_brl", "REAL"],
    ["preco_medio_brl", "REAL"],
    ["ganho_capital_brl", "REAL"],
    ["ganho_capital_orig", "REAL"],
    ["ganho_cambial", "REAL"],
  ];
  for (const [col, tipo] of extras) {
    garantirColuna(db, "transacoes", col, tipo);
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS cotacoes_ativos (
      ticker TEXT PRIMARY KEY,
      preco REAL NOT NULL,
      moeda TEXT NOT NULL DEFAULT 'BRL',
      fonte TEXT,
      data_preco TEXT,
      atualizado_em TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS cotacoes_cambio (
      data TEXT NOT NULL,
      moeda TEXT NOT NULL,
      cotacao_compra REAL,
      cotacao_venda REAL NOT NULL,
      fonte TEXT,
      PRIMARY KEY (data, moeda)
    )
  `);
  garantirColuna(db, "renda_fixa", "valor_mercado", "REAL");
  garantirColuna(db, "renda_fixa", "atualizado_em", "TEXT");
  garantirColuna(db, "renda_fixa", "fonte_atualizacao", "TEXT");
  garantirColuna(db, "renda_fixa", "qtd_tesouro", "REAL");
  garantirColuna(db, "renda_fixa", "pu_atual", "REAL");
  garantirColuna(db, "renda_fixa", "amortizacao", "TEXT");
  garantirColuna(db, "cotacoes_ativos", "dividend_yield", "REAL");
  garantirColuna(db, "transacoes", "iof_brl", "REAL");
  garantirColuna(db, "transacoes", "spread_brl", "REAL");
  garantirColuna(db, "transacoes", "valor_usd", "REAL");
  garantirColuna(db, "transacoes", "cotacao_efetiva", "REAL");
  garantirColuna(db, "transacoes", "cotacao_ptax", "REAL");
  garantirColuna(db, "transacoes", "custo_acum_usd", "REAL");
  garantirColuna(db, "transacoes", "preco_medio_usd", "REAL");
  garantirColuna(db, "renda_fixa", "moeda", "TEXT");
  garantirColuna(db, "renda_fixa", "origem", "TEXT");
  garantirColuna(db, "renda_fixa", "valor_usd", "REAL");
  garantirColuna(db, "renda_fixa", "cotacao_efetiva", "REAL");
  garantirColuna(db, "renda_fixa", "iof_brl", "REAL");
  garantirColuna(db, "renda_fixa", "spread_brl", "REAL");
  garantirColuna(db, "renda_fixa", "data_resgate", "TEXT");
  garantirColuna(db, "renda_fixa", "valor_liq_recebido", "REAL");
  garantirColuna(db, "renda_fixa", "valor_resgatado", "REAL");
  garantirColuna(db, "renda_fixa", "tipo_resgate", "TEXT");
  garantirColuna(db, "renda_fixa", "status", "TEXT");
  db.run(`
    CREATE TABLE IF NOT EXISTS caixa_cambio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL,
      moeda TEXT NOT NULL DEFAULT 'USD',
      tipo TEXT NOT NULL,
      quantidade REAL NOT NULL,
      custo_brl REAL NOT NULL DEFAULT 0,
      iof_brl REAL NOT NULL DEFAULT 0,
      spread_brl REAL NOT NULL DEFAULT 0,
      cotacao REAL,
      descricao TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS tickers_catalogo (
      simbolo TEXT PRIMARY KEY,
      nome TEXT,
      categoria TEXT NOT NULL,
      atualizado_em TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS metas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      metrica TEXT NOT NULL,
      alvo REAL NOT NULL,
      ate TEXT,
      created_at TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS snapshots_patrimonio (
      data TEXT PRIMARY KEY,
      custo REAL,
      mercado REAL,
      caixa REAL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS caixa_conferencias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL,
      saldo_sistema REAL NOT NULL,
      saldo_contado REAL NOT NULL,
      diferenca REAL NOT NULL,
      observacao TEXT,
      ajustou_livro INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS exclusoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tabela TEXT NOT NULL,
      local_id INTEGER NOT NULL,
      deleted_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      nuvem TEXT NOT NULL DEFAULT 'pendente',
      UNIQUE (tabela, local_id)
    )
  `);
  garantirColuna(db, "exclusoes", "nuvem", "TEXT");
  db.run(`UPDATE transacoes SET tipo_operacao = 'Venda de imóvel'
    WHERE tipo_operacao = 'Venda' AND categoria IN ('Imóvel','Imóveis')`);
  db.run(`UPDATE transacoes SET tipo_operacao = 'Doação de imóvel'
    WHERE tipo_operacao = 'Doação realizada' AND categoria IN ('Imóvel','Imóveis')`);
  db.run("INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES ('cobertura_fiscal_min', '0.80')");
  const tabelasSync = [
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
  ];
  for (const t of tabelasSync) {
    garantirColuna(db, t, "updated_at", "TEXT");
    garantirColuna(db, t, "device_id", "TEXT");
    garantirColuna(db, t, "sync_status", "TEXT");
    garantirColuna(db, t, "deleted_at", "TEXT");
    db.run(`UPDATE ${t} SET sync_status = 'pending' WHERE sync_status IS NULL OR sync_status = ''`);
  }
  db.exec(syncTriggersSql);
  aplicarSchemaCadastros(db);
  deduplicarEspelhos(db);
  db.run(`
    CREATE TABLE IF NOT EXISTS historico_cotacoes (
      ticker TEXT NOT NULL,
      data TEXT NOT NULL,
      preco REAL NOT NULL,
      moeda TEXT NOT NULL DEFAULT 'BRL',
      fonte TEXT,
      PRIMARY KEY (ticker, data)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS historico_indices (
      indice TEXT NOT NULL,
      data TEXT NOT NULL,
      valor REAL NOT NULL,
      fator REAL,
      unidade TEXT,
      fonte TEXT,
      PRIMARY KEY (indice, data)
    )
  `);
  db.run("INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('schema_versao', '11')");
}

/** Devolve a instância única do SQLite, criando o schema na primeira vez. */
function deduplicarEspelhos(db: Database): void {
  const apagar = (tabela: string, grupo: string) => {
    db.run(
      `DELETE FROM ${tabela} WHERE id NOT IN (SELECT MIN(id) FROM ${tabela} GROUP BY ${grupo})`,
    );
  };
  apagar(
    "renda_fixa",
    "COALESCE(ticker,''), COALESCE(data_aplicacao,''), ROUND(COALESCE(valor_aplicado,0), 2), COALESCE(tipo_rf,''), COALESCE(emissor,''), COALESCE(data_vencimento,'')",
  );
  apagar(
    "rendimentos",
    "COALESCE(data,''), COALESCE(tipo,''), COALESCE(ticker,''), COALESCE(descricao,''), COALESCE(instituicao,''), ROUND(COALESCE(valor_liquido, valor_bruto_brl, 0), 2)",
  );
  apagar(
    "transacoes",
    "COALESCE(data,''), COALESCE(tipo_operacao,''), COALESCE(ticker,''), COALESCE(categoria,''), COALESCE(nota,''), ROUND(COALESCE(quantidade,0), 6), ROUND(COALESCE(valor_brl,0), 2)",
  );
  db.run(`UPDATE caixa_fisico SET tipo = 'Saque'
    WHERE COALESCE(tipo,'') != 'Saque'
      AND lower(replace(replace(replace(COALESCE(tipo,''),'ó','o'),'Ó','o'),'á','a')) IN ('saque','retirada','saida')`);
  db.run(`UPDATE caixa_fisico SET tipo = 'Depósito'
    WHERE COALESCE(tipo,'') != 'Depósito'
      AND lower(replace(replace(replace(COALESCE(tipo,''),'ó','o'),'Ó','o'),'á','a')) NOT IN ('saque','retirada','saida')`);
  db.run(`UPDATE caixa_fisico SET data = substr(data, 1, 10) WHERE data LIKE '____-__-__%' AND length(data) > 10`);
  db.run(`UPDATE caixa_fisico SET data = '2026-10-28'
    WHERE ABS(ROUND(COALESCE(valor, 0), 2) - 11400) < 0.02
      AND (substr(COALESCE(data,''), 1, 10) = '2024-10-28' OR data LIKE '28/10/2024%')`);
  db.run(`UPDATE caixa_fisico SET data = printf('%s-%s-%s', substr(data, 7, 4), substr(data, 4, 2), substr(data, 1, 2))
    WHERE data LIKE '__/__/____%'`);
  apagar(
    "caixa_fisico",
    "COALESCE(substr(data,1,10),''), tipo, ROUND(COALESCE(valor,0), 2), COALESCE(descricao,''), COALESCE(observacao,'')",
  );
}

/** Guarda a exclusão e tira a linha do livro. A nuvem não pode recolocar essa operação. */
export function apagarComTombstone(db: Database, tabela: string, ids: number[]): void {
  if (!ids.length) return;
  const ph = ids.map(() => "?").join(",");
  const rows = consultar(db, `SELECT * FROM ${tabela} WHERE id IN (${ph})`, ids);
  const agora = new Date().toISOString();
  for (const r of rows) {
    const id = Number(r.id);
    const payload = JSON.stringify({ ...r, deleted_at: agora, updated_at: agora, sync_status: "pending" });
    executar(db, `DELETE FROM exclusoes WHERE tabela = ? AND local_id = ?`, [tabela, id]);
    executar(db, `INSERT INTO exclusoes (tabela, local_id, deleted_at, payload) VALUES (?,?,?,?)`, [
      tabela,
      id,
      agora,
      payload,
    ]);
  }
  executar(db, `DELETE FROM ${tabela} WHERE id IN (${ph})`, ids);
}

/** Devolve a instância única do SQLite, criando o schema na primeira vez. */
export async function getDb(): Promise<Database> {
  if (instancia) return instancia;
  if (!iniciando) {
    iniciando = abrirOuCriar()
      .then((db) => {
        instancia = db;
        return db;
      })
      .catch((err) => {
        iniciando = null;
        throw err;
      });
  }
  return iniciando;
}

/** Persiste o estado atual no IndexedDB e avisa as telas abertas. */
export async function salvarDb(): Promise<void> {
  if (!instancia) return;
  await gravarArquivo(instancia.export());
  void import("@/services/sync-service").then((m) => m.agendarFlushSync());
  if (typeof window === "undefined") return;
  const w = window as Window & { __cfDados?: number };
  window.clearTimeout(w.__cfDados);
  w.__cfDados = window.setTimeout(() => {
    window.dispatchEvent(new Event("cf-dados"));
  }, 80);
}

export type LinhaSql = Record<string, string | number | null>;

export function consultar(
  db: Database,
  sql: string,
  params: (string | number | null)[] = [],
): LinhaSql[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const linhas: LinhaSql[] = [];
  while (stmt.step()) {
    linhas.push(stmt.getAsObject() as LinhaSql);
  }
  stmt.free();
  return linhas;
}

export function executar(
  db: Database,
  sql: string,
  params: (string | number | null)[] = [],
): void {
  db.run(sql, params);
}
