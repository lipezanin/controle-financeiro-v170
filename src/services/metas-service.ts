import { consultar, executar, getDb, salvarDb } from "@/lib/financeiro/db";
import { tipoCaixa } from "@/services/caixa-service";

export type MetricaMeta =
  | "proventos_mes"
  | "proventos_ano"
  | "caixa"
  | "despesas_mes"
  | "despesas_ano"
  | "aluguel_ano"
  | "custo_imoveis"
  | "aportes_ano"
  | "patrimonio_mercado";

export type Meta = {
  id: number;
  nome: string;
  metrica: MetricaMeta;
  alvo: number;
  ate: string | null;
  atual: number;
};

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v) || 0;
}

async function valorMetrica(metrica: MetricaMeta): Promise<number> {
  const db = await getDb();
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  if (metrica === "caixa") {
    const linhas = consultar(
      db,
      `SELECT tipo, valor FROM caixa_fisico WHERE deleted_at IS NULL OR TRIM(CAST(deleted_at AS TEXT)) = ''`,
    );
    return linhas.reduce((s, r) => s + (tipoCaixa(r.tipo) === "Saque" ? -num(r.valor) : num(r.valor)), 0);
  }
  if (metrica === "despesas_mes" || metrica === "despesas_ano") {
    const filtro =
      metrica === "despesas_mes"
        ? `substr(COALESCE(data_vencimento,''),1,7) = '${ano}-${mes}'`
        : `substr(COALESCE(data_vencimento,''),1,4) = '${ano}'`;
    return num(
      consultar(
        db,
        `SELECT COALESCE(SUM(valor), 0) AS v FROM despesas
         WHERE (deleted_at IS NULL OR TRIM(deleted_at) = '') AND ${filtro}`,
      )[0]?.v,
    );
  }
  if (metrica === "aluguel_ano") {
    return num(
      consultar(
        db,
        `SELECT COALESCE(SUM(COALESCE(valor_liquido, valor_bruto_brl, 0)), 0) AS v
         FROM rendimentos
         WHERE substr(COALESCE(data,''),1,4) = '${ano}'
           AND (
             COALESCE(categoria,'') IN ('Imóveis','Imóvel')
             OR COALESCE(tipo,'') LIKE '%Aluguel%'
             OR COALESCE(tipo,'') LIKE '%Imóvel%'
           )`,
      )[0]?.v,
    );
  }
  if (metrica === "custo_imoveis") {
    return num(
      consultar(
        db,
        `SELECT COALESCE(SUM(ABS(valor_brl)), 0) AS v FROM transacoes
         WHERE categoria IN ('Imóvel','Imóveis')
           AND COALESCE(tipo_operacao,'') NOT IN ('Venda','Venda de imóvel','Doação realizada','Doação de imóvel')`,
      )[0]?.v,
    );
  }
  if (metrica === "aportes_ano") {
    return num(
      consultar(
        db,
        `SELECT COALESCE(SUM(ABS(valor_brl)), 0) AS v FROM transacoes
         WHERE substr(COALESCE(data,''),1,4) = '${ano}'
           AND tipo_operacao IN ('Compra','Aplicação','Parcela Imóvel')`,
      )[0]?.v,
    );
  }
  if (metrica === "patrimonio_mercado") {
    const { listarCarteira } = await import("@/services/investimento-service");
    return (await listarCarteira()).variacaoGrupos.reduce((s, g) => s + g.valor, 0);
  }
  const filtro = metrica === "proventos_mes" ? `substr(data,1,7) = '${ano}-${mes}'` : `substr(data,1,4) = '${ano}'`;
  return num(
    consultar(
      db,
      `SELECT COALESCE(SUM(COALESCE(valor_liquido, valor_bruto_brl, 0)), 0) AS v
       FROM rendimentos
       WHERE ${filtro}
         AND COALESCE(tipo,'') NOT LIKE '%Consultório%'
         AND COALESCE(tipo,'') NOT LIKE '%Espécie%'
         AND COALESCE(tipo,'') NOT LIKE '%Imóvel%'
         AND COALESCE(categoria,'') NOT IN ('Consultório', 'Espécie', 'Imóveis', 'Imóvel')
         AND COALESCE(categoria,'') NOT LIKE '%Consultório%'`,
    )[0]?.v,
  );
}

export async function listarMetas(): Promise<Meta[]> {
  const db = await getDb();
  const rows = consultar(db, `SELECT id, nome, metrica, alvo, ate FROM metas ORDER BY id DESC`);
  const out: Meta[] = [];
  for (const r of rows) {
    const metrica = (String(r.metrica) || "proventos_mes") as MetricaMeta;
    out.push({
      id: num(r.id),
      nome: String(r.nome),
      metrica,
      alvo: num(r.alvo),
      ate: r.ate == null ? null : String(r.ate),
      atual: await valorMetrica(metrica),
    });
  }
  return out;
}

export async function criarMeta(input: {
  nome: string;
  metrica: MetricaMeta;
  alvo: number;
  ate?: string | null;
}): Promise<void> {
  const db = await getDb();
  executar(db, `INSERT INTO metas (nome, metrica, alvo, ate, created_at) VALUES (?, ?, ?, ?, ?)`, [
    input.nome.trim(),
    input.metrica,
    input.alvo,
    input.ate || null,
    new Date().toISOString(),
  ]);
  await salvarDb();
}

export async function excluirMeta(id: number): Promise<void> {
  const db = await getDb();
  executar(db, `DELETE FROM metas WHERE id = ?`, [id]);
  await salvarDb();
}
