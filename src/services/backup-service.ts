/**
 * Backup / restauração 100% local do SQLite.
 * JSON das tabelas de dados. Não envia nada à nuvem (o sync reenvia se houver login).
 */

import { consultar, executar, getDb, salvarDb, type LinhaSql } from "@/lib/financeiro/db";
import { TABELAS_ESPELHO } from "@/lib/supabase/tabelas";
import { baixarTexto } from "@/utils/baixar";

const TABELAS_BACKUP = [...TABELAS_ESPELHO, "caixa_conferencias", "sync_conflitos"] as const;

export type BackupJson = {
  app: "controle-financeiro";
  versao: 1;
  geradoEm: string;
  tabelas: Record<string, LinhaSql[]>;
};

function colunas(db: Awaited<ReturnType<typeof getDb>>, tabela: string): string[] {
  return consultar(db, `PRAGMA table_info(${tabela})`).map((r) => String(r.name));
}

export async function montarBackup(): Promise<BackupJson> {
  const db = await getDb();
  const tabelas: Record<string, LinhaSql[]> = {};
  for (const t of TABELAS_BACKUP) {
    try {
      tabelas[t] = consultar(db, `SELECT * FROM ${t}`);
    } catch {
      tabelas[t] = [];
    }
  }
  return {
    app: "controle-financeiro",
    versao: 1,
    geradoEm: new Date().toISOString(),
    tabelas,
  };
}

export async function baixarBackup(): Promise<number> {
  const b = await montarBackup();
  const n = Object.values(b.tabelas).reduce((a, l) => a + l.length, 0);
  const dia = b.geradoEm.slice(0, 10);
  baixarTexto(`controle-financeiro-${dia}.json`, JSON.stringify(b), "application/json");
  return n;
}

export async function restaurarBackup(texto: string): Promise<{ tabelas: number; linhas: number }> {
  let parsed: BackupJson;
  try {
    parsed = JSON.parse(texto) as BackupJson;
  } catch {
    throw new Error("Arquivo JSON inválido.");
  }
  if (parsed.app !== "controle-financeiro" || !parsed.tabelas) {
    throw new Error("Este arquivo não é um backup do Controle Financeiro.");
  }
  const db = await getDb();
  db.run("BEGIN");
  try {
    let tabelas = 0;
    let linhas = 0;
    for (const t of TABELAS_BACKUP) {
      const rows = parsed.tabelas[t];
      if (!rows) continue;
      const colsDb = new Set(colunas(db, t));
      if (!colsDb.size) continue;
      executar(db, `DELETE FROM ${t}`);
      tabelas += 1;
      for (const row of rows) {
        const cols = Object.keys(row).filter((c) => colsDb.has(c));
        if (!cols.length) continue;
        const ph = cols.map(() => "?").join(",");
        const vals = cols.map((c) => (row[c] as string | number | null) ?? null);
        executar(db, `INSERT INTO ${t} (${cols.join(",")}) VALUES (${ph})`, vals);
        linhas += 1;
      }
      if (colsDb.has("sync_status")) {
        executar(db, `UPDATE ${t} SET sync_status = 'pending' WHERE sync_status IS NULL OR sync_status = 'synced'`);
      }
    }
    db.run("COMMIT");
    await salvarDb();
    return { tabelas, linhas };
  } catch (e) {
    try {
      db.run("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  }
}
