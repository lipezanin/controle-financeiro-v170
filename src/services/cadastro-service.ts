/**
 * Cadastros da Base de Dados — uma tabela SQLite por sessão.
 * Itens são linhas (ERP), não um bloco de texto.
 */

import { consultar, executar, getDb, salvarDb } from "@/lib/financeiro/db";
import { aplicarSchemaCadastros, SESSOES_CADASTRO, tabelaDaSessao } from "@/lib/financeiro/cadastros-def";

export { SESSOES_CADASTRO, SEMENTES_CADASTRO } from "@/lib/financeiro/cadastros-def";

export type CadastroItem = {
  id: number;
  sessao: string;
  codigo: string;
  nome: string;
  ativo: boolean;
  ordem: number;
  observacao: string;
};

export type TipoRendimentoItem = {
  id: number;
  nome: string;
  origem: string;
  categoria: string;
  tributacao: string;
  formaRecolhimento: string;
  classificacaoIrpfm: string;
  ativo: boolean;
};

const ID_OK = /^[a-z_]+$/;

async function dbCadastro() {
  const db = await getDb();
  aplicarSchemaCadastros(db);
  return db;
}

function assertSessao(id: string): string {
  if (!ID_OK.test(id)) throw new Error("Sessão inválida.");
  return tabelaDaSessao(id);
}

function espelharEav(db: Awaited<ReturnType<typeof getDb>>, sessao: string): void {
  const tabela = tabelaDaSessao(sessao);
  executar(db, `DELETE FROM cadastros WHERE grupo = ?`, [sessao]);
  const rows = consultar(db, `SELECT nome, ordem FROM ${tabela} WHERE ativo = 1 ORDER BY ordem, nome`);
  rows.forEach((r, i) => {
    executar(db, `INSERT OR IGNORE INTO cadastros (grupo, valor, ordem) VALUES (?, ?, ?)`, [
      sessao,
      String(r.nome),
      Number(r.ordem ?? i + 1),
    ]);
  });
}

export async function listarItens(sessao: string, incluirInativos = true): Promise<CadastroItem[]> {
  const db = await dbCadastro();
  const tabela = assertSessao(sessao);
  const sql = incluirInativos
    ? `SELECT id, codigo, nome, ativo, ordem, observacao FROM ${tabela} ORDER BY ordem, nome`
    : `SELECT id, codigo, nome, ativo, ordem, observacao FROM ${tabela} WHERE ativo = 1 ORDER BY ordem, nome`;
  return consultar(db, sql).map((r) => ({
    id: Number(r.id),
    sessao,
    codigo: String(r.codigo ?? ""),
    nome: String(r.nome ?? ""),
    ativo: Number(r.ativo) !== 0,
    ordem: Number(r.ordem ?? 0),
    observacao: String(r.observacao ?? ""),
  }));
}

/** Nomes ativos — alimenta listas suspensas. */
export async function listarNomes(sessao: string): Promise<string[]> {
  const itens = await listarItens(sessao, false);
  return itens.map((i) => i.nome);
}

export async function inserirItem(sessao: string, nome: string, codigo = ""): Promise<number> {
  const limpo = nome.trim();
  if (!limpo) throw new Error("Informe o nome do item.");
  const db = await dbCadastro();
  const tabela = assertSessao(sessao);
  const max = consultar(db, `SELECT MAX(ordem) AS m FROM ${tabela}`)[0];
  const ordem = Number(max?.m ?? 0) + 1;
  executar(db, `INSERT INTO ${tabela} (codigo, nome, ativo, ordem) VALUES (?, ?, 1, ?)`, [
    codigo.trim() || null,
    limpo,
    ordem,
  ]);
  const id = consultar(db, `SELECT last_insert_rowid() AS id`)[0];
  espelharEav(db, sessao);
  await salvarDb();
  return Number(id?.id ?? 0);
}

export async function atualizarItem(
  sessao: string,
  id: number,
  patch: Partial<Pick<CadastroItem, "nome" | "codigo" | "ativo" | "ordem" | "observacao">>,
): Promise<void> {
  const db = await dbCadastro();
  const tabela = assertSessao(sessao);
  const atual = consultar(db, `SELECT * FROM ${tabela} WHERE id = ?`, [id])[0];
  if (!atual) throw new Error("Item não encontrado.");
  const nome = patch.nome !== undefined ? patch.nome.trim() : String(atual.nome);
  if (!nome) throw new Error("Nome não pode ficar vazio.");
  executar(
    db,
    `UPDATE ${tabela} SET codigo = ?, nome = ?, ativo = ?, ordem = ?, observacao = ? WHERE id = ?`,
    [
      patch.codigo !== undefined ? patch.codigo.trim() || null : (atual.codigo as string | null),
      nome,
      patch.ativo !== undefined ? (patch.ativo ? 1 : 0) : Number(atual.ativo),
      patch.ordem !== undefined ? patch.ordem : Number(atual.ordem ?? 0),
      patch.observacao !== undefined ? patch.observacao : (atual.observacao as string | null),
      id,
    ],
  );
  espelharEav(db, sessao);
  await salvarDb();
}

export async function excluirItem(sessao: string, id: number): Promise<void> {
  const db = await dbCadastro();
  const tabela = assertSessao(sessao);
  executar(db, `DELETE FROM ${tabela} WHERE id = ?`, [id]);
  espelharEav(db, sessao);
  await salvarDb();
}

export async function moverItem(sessao: string, id: number, direcao: -1 | 1): Promise<void> {
  const itens = await listarItens(sessao, true);
  const idx = itens.findIndex((i) => i.id === id);
  const outro = idx + direcao;
  if (idx < 0 || outro < 0 || outro >= itens.length) return;
  const a = itens[idx]!;
  const b = itens[outro]!;
  const db = await dbCadastro();
  const tabela = assertSessao(sessao);
  executar(db, `UPDATE ${tabela} SET ordem = ? WHERE id = ?`, [b.ordem, a.id]);
  executar(db, `UPDATE ${tabela} SET ordem = ? WHERE id = ?`, [a.ordem, b.id]);
  espelharEav(db, sessao);
  await salvarDb();
}

export async function listarTiposRendimento(incluirInativos = true): Promise<TipoRendimentoItem[]> {
  const db = await dbCadastro();
  const sql = incluirInativos
    ? `SELECT * FROM tipos_rendimento ORDER BY nome`
    : `SELECT * FROM tipos_rendimento WHERE COALESCE(ativo, 1) = 1 ORDER BY nome`;
  return consultar(db, sql).map((r) => ({
    id: Number(r.id),
    nome: String(r.nome ?? ""),
    origem: String(r.origem ?? "Nacional"),
    categoria: String(r.categoria ?? ""),
    tributacao: String(r.tributacao ?? ""),
    formaRecolhimento: String(r.forma_recolhimento ?? ""),
    classificacaoIrpfm: String(r.classificacao_irpfm ?? ""),
    ativo: Number(r.ativo ?? 1) !== 0,
  }));
}

export async function inserirTipoRendimento(input: Omit<TipoRendimentoItem, "id">): Promise<number> {
  const nome = input.nome.trim();
  if (!nome) throw new Error("Informe o nome do tipo.");
  const db = await dbCadastro();
  executar(
    db,
    `INSERT INTO tipos_rendimento
      (nome, origem, categoria, tributacao, forma_recolhimento, classificacao_irpfm, ativo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      nome,
      input.origem,
      input.categoria,
      input.tributacao,
      input.formaRecolhimento,
      input.classificacaoIrpfm,
      input.ativo ? 1 : 0,
    ],
  );
  const id = consultar(db, `SELECT last_insert_rowid() AS id`)[0];
  await salvarDb();
  return Number(id?.id ?? 0);
}

export async function atualizarTipoRendimento(
  id: number,
  patch: Partial<Omit<TipoRendimentoItem, "id">>,
): Promise<void> {
  const db = await dbCadastro();
  const atual = consultar(db, `SELECT * FROM tipos_rendimento WHERE id = ?`, [id])[0];
  if (!atual) throw new Error("Tipo não encontrado.");
  executar(
    db,
    `UPDATE tipos_rendimento SET
        nome = ?, origem = ?, categoria = ?, tributacao = ?,
        forma_recolhimento = ?, classificacao_irpfm = ?, ativo = ?
     WHERE id = ?`,
    [
      patch.nome?.trim() || String(atual.nome),
      patch.origem ?? String(atual.origem),
      patch.categoria ?? String(atual.categoria),
      patch.tributacao ?? String(atual.tributacao),
      patch.formaRecolhimento ?? String(atual.forma_recolhimento),
      patch.classificacaoIrpfm ?? String(atual.classificacao_irpfm),
      patch.ativo !== undefined ? (patch.ativo ? 1 : 0) : Number(atual.ativo ?? 1),
      id,
    ],
  );
  await salvarDb();
}

export async function excluirTipoRendimento(id: number): Promise<void> {
  const db = await dbCadastro();
  executar(db, `DELETE FROM tipos_rendimento WHERE id = ?`, [id]);
  await salvarDb();
}

/** Compat: nomes de uma sessão (dropdowns). */
export async function listarCadastro(grupo: string): Promise<string[]> {
  if (grupo === "tipo_rendimento") {
    return (await listarTiposRendimento(false)).map((t) => t.nome);
  }
  return listarNomes(grupo);
}

export async function contarSessoes(): Promise<Record<string, number>> {
  const db = await dbCadastro();
  const out: Record<string, number> = {};
  for (const s of SESSOES_CADASTRO) {
    if (s.especial) {
      const r = consultar(
        db,
        `SELECT COUNT(*) AS n FROM tipos_rendimento WHERE COALESCE(ativo, 1) = 1`,
      )[0];
      out[s.id] = Number(r?.n ?? 0);
    } else {
      const r = consultar(db, `SELECT COUNT(*) AS n FROM ${s.tabela} WHERE ativo = 1`)[0];
      out[s.id] = Number(r?.n ?? 0);
    }
  }
  return out;
}
