/**
 * Único ponto de conversa com o Supabase.
 * SQLite grava primeiro. Nuvem é espelho. Sem sessão (etapa c) tudo fica pending.
 */

import { consultar, executar, getDb, salvarDb, type LinhaSql } from "@/lib/financeiro/db";
import { SUPABASE_ANON_KEY, SUPABASE_REST } from "@/lib/supabase/config";
import { idDispositivo, lerSessaoSupabase, sessaoValida } from "@/lib/supabase/sessao";
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
  posicoes: { onConflict: "user_id,local_id", temId: true, chaveLocal: (r) => String(r.id) },
  cadastros: { onConflict: "user_id,local_id", temId: true, chaveLocal: (r) => String(r.id) },
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

let timer: ReturnType<typeof setTimeout> | null = null;
let rodando = false;
let silenciarFlush = false;
let escutaOnline = false;
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

function headersAuth(token: string): HeadersInit {
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
    if (SKIP_COL.has(k) || k === "sync_status" || k === "device_id" || k === "updated_at" || k === "deleted_at") continue;
    out[k] = v;
  }
  return out;
}

async function rest<T>(path: string, init: RequestInit): Promise<{ ok: boolean; status: number; json: T | null; texto: string }> {
  const r = await fetch(`${SUPABASE_REST}/${path}`, init);
  const texto = await r.text();
  let json: T | null = null;
  try {
    json = texto ? (JSON.parse(texto) as T) : null;
  } catch {
    json = null;
  }
  return { ok: r.ok, status: r.status, json, texto };
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

async function enviarTabela(tabela: TabelaEspelho, userId: string, token: string, device: string): Promise<number> {
  const db = await getDb();
  const meta = META[tabela];
  const linhas = consultar(
    db,
    `SELECT * FROM ${tabela} WHERE COALESCE(sync_status,'pending') IN ('pending','','conflict') AND deleted_at IS NULL`,
  );
  if (!linhas.length) return 0;
  const payload = linhas.map((r) => paraNuvem(tabela, r, userId, device));
  const alts = alternativasConflict(meta.onConflict);
  for (let i = 0; i < payload.length; i += 80) {
    const fatia = payload.slice(i, i + 80);
    let ok = false;
    let ultimo = "";
    for (const oc of alts) {
      const res = await rest(`${tabela}?on_conflict=${oc}`, {
        method: "POST",
        headers: headersAuth(token),
        body: JSON.stringify(fatia),
      });
      if (res.ok) {
        ok = true;
        break;
      }
      ultimo = res.texto;
      if (!res.texto.includes("42P10")) {
        throw new Error(`nuvem ${tabela}: HTTP ${res.status} ${res.texto.slice(0, 180)}`);
      }
    }
    if (!ok) {
      await enviarLinhaALinha(tabela, fatia, token, meta);
      void ultimo;
    }
  }
  if (meta.temId) {
    const ids = linhas.map((r) => Number(r.id));
    executar(
      db,
      `UPDATE ${tabela} SET sync_status='synced', device_id=? WHERE id IN (${ids.map(() => "?").join(",")})`,
      [device, ...ids],
    );
  } else {
    executar(db, `UPDATE ${tabela} SET sync_status='synced', device_id=? WHERE COALESCE(sync_status,'pending') IN ('pending','','conflict')`, [
      device,
    ]);
  }
  return linhas.length;
}

function alternativasConflict(padrao: string): string[] {
  const out = [padrao];
  if (padrao.includes(",")) {
    const ultimo = padrao.split(",").pop()!;
    out.push(ultimo);
  }
  return [...new Set(out)];
}

async function enviarLinhaALinha(
  tabela: TabelaEspelho,
  fatia: Record<string, unknown>[],
  token: string,
  meta: Meta,
): Promise<void> {
  for (const row of fatia) {
    const chave = meta.temId ? "local_id" : meta.onConflict.split(",").pop()!;
    const val = row[chave];
    const filtro = `${chave}=eq.${encodeURIComponent(String(val ?? ""))}`;
    const patch = await rest(`${tabela}?${filtro}`, {
      method: "PATCH",
      headers: headersAuth(token),
      body: JSON.stringify(row),
    });
    if (patch.ok) continue;
    const ins = await rest(tabela, {
      method: "POST",
      headers: { ...headersAuth(token), Prefer: "return=minimal" },
      body: JSON.stringify(row),
    });
    if (!ins.ok) throw new Error(`nuvem ${tabela}: HTTP ${ins.status} ${ins.texto.slice(0, 180)}`);
  }
}

async function puxarTabela(tabela: TabelaEspelho, userId: string, token: string): Promise<number> {
  const db = await getDb();
  const meta = META[tabela];
  const res = await rest<LinhaSql[]>(`${tabela}?select=*`, {
    method: "GET",
    headers: { ...headersAuth(token), Prefer: "return=representation" },
  });
  if (res.status === 404) return 0;
  if (!res.ok || !res.json) throw new Error(`leitura ${tabela}: HTTP ${res.status}`);
  const nuvem = res.json;
  const locais = consultar(db, `SELECT * FROM ${tabela}`);
  const mapa = new Map(locais.map((r) => [meta.chaveLocal(r), r]));
  let aplicados = 0;
  for (const n of nuvem) {
    const chave = meta.temId ? String(n.local_id) : meta.chaveLocal(n);
    const loc = mapa.get(chave);
    const tn = ts(n.updated_at);
    const tl = loc ? ts(loc.updated_at) : 0;
    if (!loc) {
      inserirDoNuvem(db, tabela, n);
      aplicados += 1;
      continue;
    }
    const localPending = loc.sync_status === "pending";
    if (localPending && tn > tl) {
      executar(db, `INSERT INTO sync_conflitos (tabela, chave, local_json, nuvem_json, detectado_em) VALUES (?,?,?,?,?)`, [
        tabela,
        chave,
        JSON.stringify(loc),
        JSON.stringify(n),
        new Date().toISOString(),
      ]);
      if (meta.temId) executar(db, `UPDATE ${tabela} SET sync_status='conflict' WHERE id=?`, [Number(loc.id)]);
      continue;
    }
    if (tn > tl && !localPending) {
      inserirDoNuvem(db, tabela, n);
      aplicados += 1;
    }
  }
  void userId;
  return aplicados;
}

function inserirDoNuvem(db: Awaited<ReturnType<typeof getDb>>, tabela: TabelaEspelho, n: LinhaSql): void {
  const meta = META[tabela];
  const row: Record<string, unknown> = { ...n };
  delete row.user_id;
  delete row.local_id;
  if (meta.temId) row.id = n.local_id;
  row.sync_status = "synced";
  const cols = Object.keys(row).filter((c) => c !== "user_id");
  const ph = cols.map(() => "?").join(",");
  const vals = cols.map((c) => (row[c] as string | number | null) ?? null);
  if (meta.temId) {
    executar(db, `INSERT OR REPLACE INTO ${tabela} (${cols.join(",")}) VALUES (${ph})`, vals);
  } else if (tabela === "configuracoes") {
    executar(db, `INSERT OR REPLACE INTO configuracoes (chave, valor, updated_at, device_id, sync_status, deleted_at) VALUES (?,?,?,?,?,?)`, [
      String(n.chave),
      String(n.valor ?? ""),
      n.updated_at == null ? null : String(n.updated_at),
      n.device_id == null ? null : String(n.device_id),
      "synced",
      n.deleted_at == null ? null : String(n.deleted_at),
    ]);
  } else {
    executar(db, `INSERT OR REPLACE INTO ${tabela} (${cols.join(",")}) VALUES (${ph})`, vals);
  }
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
    const sessao = sessaoValida() ?? (await restaurarSessao()) ?? lerSessaoSupabase();
    if (!sessao) {
      const c = await contarPending();
      emitir({
        estado: "sem_login",
        detalhe: "Local gravado. Login Supabase (etapa c) libera o espelho.",
        ...c,
      });
      return status;
    }
    const device = idDispositivo();
    let enviados = 0;
    for (const t of TABELAS_ESPELHO) {
      enviados += await enviarTabela(t, sessao.userId, sessao.accessToken, device);
    }
    let puxados = 0;
    for (const t of TABELAS_ESPELHO) {
      puxados += await puxarTabela(t, sessao.userId, sessao.accessToken);
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
