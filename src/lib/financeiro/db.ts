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

/** Persiste o estado atual no IndexedDB e agenda o espelho (se houver sessão). */
export async function salvarDb(): Promise<void> {
  if (!instancia) return;
  await gravarArquivo(instancia.export());
  void import("@/services/sync-service").then((m) => m.agendarFlushSync());
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
