/**
 * Único ponto de conversa com o Supabase.
 * SQLite grava primeiro. Nuvem é espelho. Sem sessão tudo fica pending.
 */

import { consultar, executar, getDb, salvarDb, type LinhaSql } from "@/lib/financeiro/db";
import { SUPABASE_ANON_KEY, SUPABASE_REST } from "@/lib/supabase/config";
import { idDispositivo, sessaoValida } from "@/lib/supabase/sessao";
import { restaurarSessao } from "@/lib/supabase/auth-cliente";
import { TABELAS_ESPELHO, type TabelaEspelho } from "@/lib/supabase/tabelas";

export type StatusSync = {
  estado: "idle" | "sincronizando" | "ok" | "pending" | "offline" | "sem_login" | "conflito" | "erro";
  detalhe: string;
  pending: number;
  conflitos: number;
  ultimaIso: string | null;
};

type Meta = {
  onConflict: string;
  temId: boolean;
  chaveLocal: (r: LinhaSql) => string;
};

const META: Record<TabelaEspelho, Meta> = {
  transacoes: { onConflict: "user_id,local_id", temId: true, chaveLocal: (r) => String(r.id) },
  rendimentos: { onConflict: "user_id,local_id", temId: true, chaveLocal: (r) => String(r.id) },
  despesas: { onConflict: "user_id,local_id", temId: true, chaveLocal: (r) => String(r.id) },
  caixa_fisico: { onConflict: "user_id,local_id", temId: true, chaveLocal: (r) => String(r.id) },
  renda_fixa: { onConflict: "user_id,local_id", temId: true, chaveLocal: (r) => String(r.id) },
  ativos: { onConflict: "user_id,local_id", temId: true, chaveLocal: (r) => String(r.id) },
  posicoes: { onConflict: "user_id,ticker,categoria", temId: true, chaveLocal: (r) => String(r.id) },
  cadastros: { onConflict: "user_id,grupo,valor", temId: true, chaveLocal: (r) => String(r.id) },
  tipos_rendimento: { onConflict: "user_id,local_id", temId: true, chaveLocal: (r) => String(r.id) },
  impostos_mensais: { onConflict: "user_id,local_id", temId: true, chaveLocal: (r) => String(r.id) },
  darf_gc: { onConflict: "user_id,local_id", temId: true, chaveLocal: (r) => String(r.id) },
  configuracoes: { onConflict: "user_id,chave", temId: false, chaveLocal: (r) => String(r.chave) },
  indicadores: { onConflict: "user_id,chave", temId: false, chaveLocal: (r) => String(r.chave) },
  mapeamento_fiscal: { onConflict: "user_id,categoria", temId: false, chaveLocal: (r) => String(r.categoria) },
  cotacoes_ativos: { onConflict: "user_id,ticker", temId: false, chaveLocal: (r) => String(r.ticker) },
  cotacoes_cambio: { onConflict: "user_id,data,moeda", temId: false, chaveLocal: (r) => `${r.data}|${r.moeda}` },
  snapshots_patrimonio: { onConflict: "user_id,data", temId: false, chaveLocal: (r) => String(r.data) },
};

const SKIP_COL = new Set(["id"]);

const CHAVE_NATURAL: Partial<Record<TabelaEspelho, string[]>> = {
  cadastros: ["user_id,grupo,valor", "grupo,valor"],
  posicoes: ["user_id,ticker,categoria", "ticker,categoria"],
  tipos_rendimento: ["user_id,nome", "nome"],
};

const TABELAS_NATURAIS = new Set<TabelaEspelho>(["renda_fixa", "rendimentos", "transacoes", "caixa_fisico"]);

function colunaAusente(texto: string): string | null {
  const pgrst = texto.match(/Could not find the '([^']+)' column/);
  if (pgrst) return pgrst[1] ?? null;
  return texto.match(/column ["']([^"']+)["'] does not exist/i)?.[1] ?? null;
}

function tabelaInexistente(texto: string): boolean {
  return texto.includes("PGRST205") || texto.includes("Could not find the table");
}

function jwtExpirado(status: number, texto: string): boolean {
  return status === 401 || texto.includes("PGRST303") || texto.includes("JWT expired");
}

function semColunas(rows: Record<string, unknown>[], ausentes: Set<string>): Record<string, unknown>[] {
  if (!ausentes.size) return rows;
  return rows.map((row) => {
    const copia = { ...row };
    for (const c of ausentes) delete copia[c];
    return copia;
  });
}

function conflitoValido(oc: string, ausentes: Set<string>, tabela: TabelaEspelho): string {
  const partes = oc.split(",").map((s) => s.trim()).filter(Boolean);
  if (partes.length && partes.every((c) => !ausentes.has(c))) return oc;
  const natural = (CHAVE_NATURAL[tabela] ?? []).find((c) => c.split(",").every((p) => !ausentes.has(p.trim())));
  if (natural) return natural;
  return partes.filter((c) => !ausentes.has(c)).join(",") || "user_id";
}

let timer: ReturnType<typeof setTimeout> | null = null;
let rodando = false;
let silenciarFlush = false;
let escutaOnline = false;
let accessToken = "";

let status: StatusSync = {
  estado: "idle",
  detalhe: "Sync local-first",
  pending: 0,
  conflitos: 0,
  ultimaIso: null,
};
const ouvintes = new Set<(s: StatusSync) => void>();

export function onStatusSync(fn: (s: StatusSync) => void): () => void {
  ouvintes.add(fn);
  fn(status);
  return () => {
    ouvintes.delete(fn);
  };
}

function emitir(parcial: Partial<StatusSync>) {
  status = { ...status, ...parcial };
  for (const fn of ouvintes) fn(status);
}

function headersAuth(token: string): Record<string, string> {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  };
}

function ts(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Date.parse(String(v).replace(" ", "T") + (String(v).includes("Z") || String(v).includes("+") ? "" : "Z"));
  return Number.isFinite(n) ? n : 0;
}

function paraNuvem(tabela: TabelaEspelho, row: LinhaSql, userId: string, device: string): Record<string, unknown> {
  const meta = META[tabela];
  const out: Record<string, unknown> = {
    user_id: userId,
    device_id: device,
    updated_at: row.updated_at || new Date().toISOString(),
    sync_status: "synced",
    deleted_at: row.deleted_at ?? null,
  };
  if (meta.temId) out.local_id = row.id;
  for (const [k, v] of Object.entries(row)) {
    if (SKIP_COL.has(k) || k === "sync_status" || k === "device_id" || k === "updated_at" || k === "deleted_at" || k === "local_id") continue;
    out[k] = v;
  }
  if (meta.temId && row.id != null && row.id !== "") out.local_id = row.id;
  return out;
}

async function rest(path: string, init: RequestInit): Promise<{ ok: boolean; status: number; json: LinhaSql[] | null; texto: string }> {
  const ctrl = new AbortController();
  const timerFetch = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(`${SUPABASE_REST}/${path}`, { ...init, signal: ctrl.signal });
    const texto = await r.text();
    let json: LinhaSql[] | null = null;
    try {
      json = texto ? (JSON.parse(texto) as LinhaSql[]) : null;
    } catch {
      json = null;
    }
    return { ok: r.ok, status: r.status, json, texto };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "rede";
    return { ok: false, status: 0, json: null, texto: msg.includes("abort") ? "timeout" : msg };
  } finally {
    clearTimeout(timerFetch);
  }
}

async function restAuth(path: string, init: RequestInit): Promise<{ ok: boolean; status: number; json: LinhaSql[] | null; texto: string }> {
  const enviar = (token: string) => {
    const base = headersAuth(token);
    const extra = (init.headers ?? {}) as Record<string, string>;
    return rest(path, {
      ...init,
      headers: { ...base, ...extra, apikey: base.apikey, Authorization: base.Authorization },
    });
  };
  let res = await enviar(accessToken);
  if (jwtExpirado(res.status, res.texto)) {
    const nova = await restaurarSessao();
    if (!nova) return res;
    accessToken = nova.accessToken;
    res = await enviar(accessToken);
  }
  return res;
}

async function contarPending(): Promise<{ pending: number; conflitos: number }> {
  const db = await getDb();
  let pending = 0;
  for (const t of TABELAS_ESPELHO) {
    pending += Number(
      consultar(db, `SELECT COUNT(*) AS n FROM ${t} WHERE COALESCE(sync_status,'pending') IN ('pending','')`)[0]?.n ?? 0,
    );
  }
  const conflitos = Number(consultar(db, `SELECT COUNT(*) AS n FROM sync_conflitos`)[0]?.n ?? 0);
  return { pending, conflitos };
}

async function enviarExclusoes(tabela: TabelaEspelho, userId: string, device: string): Promise<number> {
  const db = await getDb();
  const meta = META[tabela];
  const lixo = consultar(db, `SELECT id, local_id, deleted_at, payload FROM exclusoes WHERE tabela = ?`, [tabela]);
  if (!lixo.length) return 0;
  const payload = lixo.map((r) => {
    let base: LinhaSql = {};
    try {
      base = JSON.parse(String(r.payload ?? "{}")) as LinhaSql;
    } catch {
      base = {};
    }
    return paraNuvem(
      tabela,
      { ...base, id: Number(r.local_id), deleted_at: String(r.deleted_at), updated_at: String(r.deleted_at) },
      userId,
      device,
    );
  });
  for (let i = 0; i < payload.length; i += 200) {
    try {
      if ((await upsertFatia(tabela, payload.slice(i, i + 200), meta)) === "ausente") return 0;
    } catch {
      return 0;
    }
  }
  return lixo.length;
}

async function enviarTabela(tabela: TabelaEspelho, userId: string, device: string): Promise<number> {
  const removidos = await enviarExclusoes(tabela, userId, device);
  const db = await getDb();
  const meta = META[tabela];
  const linhas = consultar(db, `SELECT * FROM ${tabela} WHERE COALESCE(sync_status,'pending') IN ('pending','','conflict')`);
  if (!linhas.length) return 0;
  const payload = linhas.map((r) => paraNuvem(tabela, r, userId, device));
  for (let i = 0; i < payload.length; i += 200) {
    if ((await upsertFatia(tabela, payload.slice(i, i + 200), meta)) === "ausente") return 0;
  }
  if (meta.temId) {
    const ids = linhas.map((r) => Number(r.id));
    executar(db, `UPDATE ${tabela} SET sync_status='synced', device_id=? WHERE id IN (${ids.map(() => "?").join(",")})`, [device, ...ids]);
  } else {
    executar(db, `UPDATE ${tabela} SET sync_status='synced', device_id=? WHERE COALESCE(sync_status,'pending') IN ('pending','','conflict')`, [device]);
  }
  executar(db, `DELETE FROM ${tabela} WHERE deleted_at IS NOT NULL AND TRIM(CAST(deleted_at AS TEXT)) <> '' AND sync_status = 'synced'`);
  return linhas.length + removidos;
}

function conflitoExistente(tabela: TabelaEspelho, meta: Meta, cols?: Set<string>): string | null {
  const candidatos = [meta.onConflict, ...(CHAVE_NATURAL[tabela] ?? [])];
  for (const c of candidatos) {
    const partes = c.split(",").map((s) => s.trim()).filter(Boolean);
    if (!cols || partes.every((p) => cols.has(p))) return c;
  }
  return null;
}

const colunasFora = new Map<string, Set<string>>();

function duplicata(texto: string): boolean {
  return texto.includes("23505") || texto.includes("duplicate key");
}

function dedupeConflito(rows: Record<string, unknown>[], oc: string | null): Record<string, unknown>[] {
  if (!oc) return rows;
  const partes = oc.split(",").map((s) => s.trim()).filter((p) => p && p !== "user_id");
  if (!partes.length) return rows;
  const mapa = new Map<string, Record<string, unknown>>();
  for (const r of rows) mapa.set(partes.map((p) => String(r[p] ?? "")).join("\u0001"), r);
  return [...mapa.values()];
}

async function upsertFatia(
  tabela: TabelaEspelho,
  fatia: Record<string, unknown>[],
  meta: Meta,
  cols?: Set<string>,
): Promise<"ok" | "ausente"> {
  const ausentes = new Set(colunasFora.get(tabela) ?? []);
  let oc = conflitoExistente(tabela, meta, cols);
  let rows = dedupeConflito(semColunas(fatia, ausentes), oc);
  let ultimo = "";
  const limite = Math.max(Object.keys(fatia[0] ?? {}).length + 2, 12);
  for (let tentativa = 0; tentativa < limite; tentativa++) {
    const res = await restAuth(oc ? `${tabela}?on_conflict=${encodeURIComponent(oc)}` : tabela, { method: "POST", body: JSON.stringify(rows) });
    if (res.ok) {
      colunasFora.set(tabela, ausentes);
      return "ok";
    }
    ultimo = res.texto;
    if (tabelaInexistente(res.texto)) return "ausente";
    const col = colunaAusente(res.texto);
    if (col === "deleted_at") {
      throw new Error(`nuvem ${tabela}: falta a coluna deleted_at. A exclusão não foi aceita.`);
    }
    if (col && !ausentes.has(col)) {
      ausentes.add(col);
      colunasFora.set(tabela, ausentes);
      rows = dedupeConflito(semColunas(rows, ausentes), oc);
      const ajustado = conflitoValido(oc ?? meta.onConflict, ausentes, tabela);
      oc = ajustado.split(",").some((p) => ausentes.has(p.trim())) ? null : ajustado;
      continue;
    }
    if ((res.texto.includes("42P10") || res.texto.includes("42703")) && oc) {
      oc = null;
      continue;
    }
    if (duplicata(res.texto)) {
      const natural = (CHAVE_NATURAL[tabela] ?? [])[0];
      if (natural && oc !== natural) {
        oc = natural;
        rows = dedupeConflito(rows, oc);
        continue;
      }
      if ((tabela === "cadastros" || tabela === "posicoes") && rows.some((r) => "local_id" in r) && res.texto.includes("local_id")) {
        rows = rows.map((r) => {
          const copia = { ...r };
          delete copia.local_id;
          return copia;
        });
        continue;
      }
    }
    if (res.texto.includes("23502") && res.texto.includes("local_id")) {
      const comId = rows.filter((r) => r.local_id != null && r.local_id !== "");
      if (comId.length && comId.length < rows.length) {
        rows = comId;
        continue;
      }
    }
    break;
  }
  if (tabelaInexistente(ultimo)) return "ausente";
  throw new Error(`nuvem ${tabela}: ${ultimo.slice(0, 180)}`);
}

const colunasLocais = new Map<string, Set<string>>();

function colunasDa(db: Awaited<ReturnType<typeof getDb>>, tabela: string): Set<string> {
  const ja = colunasLocais.get(tabela);
  if (ja) return ja;
  const set = new Set(consultar(db, `PRAGMA table_info(${tabela})`).map((r) => String(r.name)));
  colunasLocais.set(tabela, set);
  return set;
}

function dataCaixa(v: unknown, valor?: unknown): string {
  const s = String(v ?? "").trim();
  let iso = "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) iso = `${m[1]}-${m[2]}-${m[3]}`;
  else {
    const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4,6})/);
    if (br) iso = `${br[3].slice(0, 4)}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  if (iso === "2024-10-28" && Math.abs(centavos(valor) - 11400) < 0.02) return "2026-10-28";
  return iso || s.slice(0, 10);
}

function centavos(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function mesmaLinha(tabela: TabelaEspelho, a: LinhaSql, b: LinhaSql): boolean {
  if (tabela === "renda_fixa") {
    return (
      String(a.ticker ?? "") === String(b.ticker ?? "") &&
      String(a.data_aplicacao ?? "") === String(b.data_aplicacao ?? "") &&
      centavos(a.valor_aplicado) === centavos(b.valor_aplicado) &&
      String(a.tipo_rf ?? "") === String(b.tipo_rf ?? "") &&
      String(a.emissor ?? "") === String(b.emissor ?? "") &&
      String(a.data_vencimento ?? "") === String(b.data_vencimento ?? "")
    );
  }
  if (tabela === "rendimentos") {
    return (
      String(a.data ?? "") === String(b.data ?? "") &&
      String(a.tipo ?? "") === String(b.tipo ?? "") &&
      String(a.ticker ?? "") === String(b.ticker ?? "") &&
      String(a.descricao ?? "") === String(b.descricao ?? "") &&
      String(a.instituicao ?? "") === String(b.instituicao ?? "") &&
      centavos(a.valor_liquido ?? a.valor_bruto_brl) === centavos(b.valor_liquido ?? b.valor_bruto_brl)
    );
  }
  if (tabela === "transacoes") {
    return (
      String(a.data ?? "") === String(b.data ?? "") &&
      String(a.tipo_operacao ?? "") === String(b.tipo_operacao ?? "") &&
      String(a.ticker ?? "") === String(b.ticker ?? "") &&
      String(a.categoria ?? "") === String(b.categoria ?? "") &&
      String(a.nota ?? "") === String(b.nota ?? "") &&
      centavos(a.quantidade) === centavos(b.quantidade) &&
      centavos(a.valor_brl) === centavos(b.valor_brl)
    );
  }
  if (tabela === "caixa_fisico") {
    const norm = (t: unknown) => {
      const s = String(t ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
      return s === "saque" || s === "retirada" || s === "saida" ? "saque" : "deposito";
    };
    return (
      dataCaixa(a.data, a.valor) === dataCaixa(b.data, b.valor) &&
      norm(a.tipo) === norm(b.tipo) &&
      centavos(a.valor) === centavos(b.valor) &&
      String(a.descricao ?? "") === String(b.descricao ?? "") &&
      String(a.observacao ?? "") === String(b.observacao ?? "")
    );
  }
  if (tabela === "despesas") {
    return (
      String(a.data_vencimento ?? "") === String(b.data_vencimento ?? "") &&
      String(a.categoria ?? "") === String(b.categoria ?? "") &&
      String(a.descricao ?? "") === String(b.descricao ?? "") &&
      centavos(a.valor) === centavos(b.valor)
    );
  }
  return false;
}

async function puxarTabela(tabela: TabelaEspelho, userId: string): Promise<number> {
  const db = await getDb();
  const meta = META[tabela];
  const res = await restAuth(`${tabela}?select=*`, { method: "GET", headers: { Prefer: "return=representation" } });
  if (res.status === 404 || tabelaInexistente(res.texto)) return 0;
  if (!res.ok || !res.json) throw new Error(`leitura ${tabela}: HTTP ${res.status} ${res.texto.slice(0, 120)}`);
  const nuvem = res.json;
  const locais = consultar(db, `SELECT * FROM ${tabela}`);
  const bloqueio = consultar(db, `SELECT local_id, payload FROM exclusoes WHERE tabela = ?`, [tabela]);
  const mapa = new Map(locais.map((r) => [meta.chaveLocal(r), r]));
  let aplicados = 0;
  for (const n of nuvem) {
    if (meta.temId && (n.local_id == null || n.local_id === "")) {
      if (tabela === "cadastros") {
        if (locais.find((r) => String(r.grupo) === String(n.grupo) && String(r.valor) === String(n.valor))) continue;
      } else continue;
    }
    if (tabela === "caixa_fisico") n.data = dataCaixa(n.data, n.valor);
    const idNuvem = n.local_id == null ? "" : String(n.local_id);
    const bloqueada = bloqueio.some((b) => {
      if (idNuvem && String(b.local_id) === idNuvem) return true;
      try {
        const p = JSON.parse(String(b.payload ?? "{}")) as LinhaSql;
        return mesmaLinha(tabela, p, n);
      } catch {
        return false;
      }
    });
    if (bloqueada) continue;
    const chave = meta.temId && n.local_id != null ? String(n.local_id) : meta.chaveLocal(n);
    const loc =
      mapa.get(chave) ??
      (tabela === "cadastros"
        ? locais.find((r) => String(r.grupo) === String(n.grupo) && String(r.valor) === String(n.valor))
        : tabela === "posicoes"
          ? locais.find((r) => String(r.ticker) === String(n.ticker) && String(r.categoria) === String(n.categoria))
          : TABELAS_NATURAIS.has(tabela)
            ? locais.find((r) => mesmaLinha(tabela, r, n))
            : undefined);
    if (n.deleted_at) {
      if (loc && meta.temId) executar(db, `DELETE FROM ${tabela} WHERE id = ?`, [Number(loc.id)]);
      continue;
    }
    const tn = ts(n.updated_at);
    const tl = loc ? ts(loc.updated_at) : 0;
    if (loc && meta.temId && n.local_id != null && String(loc.id) !== String(n.local_id)) continue;
    if (!loc) {
      if (tabela === "posicoes" && !posicaoAindaExiste(db, n)) continue;
      inserirDoNuvem(db, tabela, n);
      locais.push({ ...n, id: n.local_id ?? n.id });
      aplicados += 1;
      continue;
    }
    const localPendente = loc.sync_status === "pending" || loc.sync_status === "conflict";
    if (localPendente) continue;
    if (tabela === "posicoes" && !posicaoAindaExiste(db, n)) continue;
    if (tn > tl) {
      inserirDoNuvem(db, tabela, n);
      aplicados += 1;
    }
  }
  void userId;
  return aplicados;
}

function posicaoAindaExiste(db: Awaited<ReturnType<typeof getDb>>, n: LinhaSql): boolean {
  const ticker = String(n.ticker ?? "");
  if (!ticker) return false;
  const cat = String(n.categoria ?? "");
  if (cat === "Renda Fixa") {
    return Boolean(
      consultar(
        db,
        `SELECT 1 AS ok FROM renda_fixa WHERE COALESCE(ticker, nome) = ? AND COALESCE(status, 'Ativo') <> 'Resgatado' LIMIT 1`,
        [ticker],
      )[0],
    );
  }
  return Boolean(
    consultar(
      db,
      `SELECT 1 AS ok FROM transacoes WHERE ticker = ? AND COALESCE(categoria, '') = ? AND (deleted_at IS NULL OR deleted_at = '') LIMIT 1`,
      [ticker, cat],
    )[0],
  );
}

function inserirDoNuvem(db: Awaited<ReturnType<typeof getDb>>, tabela: TabelaEspelho, n: LinhaSql): void {
  const meta = META[tabela];
  const row: Record<string, unknown> = { ...n };
  delete row.user_id;
  delete row.local_id;
  if (meta.temId) row.id = n.local_id;
  row.sync_status = "synced";
  const permitidas = colunasDa(db, tabela);
  const cols = Object.keys(row).filter((c) => c !== "user_id" && permitidas.has(c));
  const ph = cols.map(() => "?").join(",");
  const vals = cols.map((c) => (row[c] as string | number | null) ?? null);
  if (!meta.temId && tabela === "configuracoes") {
    executar(db, `INSERT OR REPLACE INTO configuracoes (chave, valor, updated_at, device_id, sync_status, deleted_at) VALUES (?,?,?,?,?,?)`, [
      String(n.chave),
      String(n.valor ?? ""),
      n.updated_at == null ? null : String(n.updated_at),
      n.device_id == null ? null : String(n.device_id),
      "synced",
      n.deleted_at == null ? null : String(n.deleted_at),
    ]);
    return;
  }
  executar(db, `INSERT OR REPLACE INTO ${tabela} (${cols.join(",")}) VALUES (${ph})`, vals);
}

export async function sincronizarAgora(): Promise<StatusSync> {
  if (rodando) return status;
  rodando = true;
  emitir({ estado: "sincronizando", detalhe: "Equalizando local × nuvem" });
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const c = await contarPending();
      emitir({ estado: "offline", detalhe: "Sem internet — fila local", ...c });
      return status;
    }
    const sessao = sessaoValida() ?? (await restaurarSessao());
    if (!sessao) {
      const c = await contarPending();
      emitir({
        estado: "sem_login",
        detalhe: "Sessão expirada. Entre de novo no espelho.",
        ...c,
      });
      return status;
    }
    accessToken = sessao.accessToken;
    const device = idDispositivo();
    colunasFora.clear();
    let enviados = 0;
    for (const t of TABELAS_ESPELHO) {
      const fila = await contarPending();
      emitir({ estado: "sincronizando", detalhe: `enviando ${t}`, ...fila });
      enviados += await enviarTabela(t, sessao.userId, device);
    }
    let puxados = 0;
    for (const t of TABELAS_ESPELHO) {
      emitir({ estado: "sincronizando", detalhe: `lendo ${t}`, ...(await contarPending()) });
      puxados += await puxarTabela(t, sessao.userId);
    }
    silenciarFlush = true;
    try {
      await salvarDb();
    } finally {
      silenciarFlush = false;
    }
    const c = await contarPending();
    const estado = c.conflitos > 0 ? "conflito" : c.pending > 0 ? "pending" : "ok";
    emitir({
      estado,
      detalhe: `↑${enviados} ↓${puxados}`,
      ultimaIso: new Date().toISOString(),
      ...c,
    });
    return status;
  } catch (e) {
    const c = await contarPending().catch(() => ({ pending: 0, conflitos: 0 }));
    emitir({
      estado: "erro",
      detalhe: e instanceof Error ? e.message : "Falha no sync",
      ...c,
    });
    return status;
  } finally {
    rodando = false;
  }
}

export function agendarFlushSync(): void {
  if (silenciarFlush) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void sincronizarAgora();
  }, 1200);
}

export async function sincronizarAoAbrir(): Promise<StatusSync> {
  if (typeof window === "undefined") return status;
  if (!escutaOnline) {
    escutaOnline = true;
    window.addEventListener("online", () => void sincronizarAgora());
  }
  return sincronizarAgora();
}
