/**
 * Evolução do patrimônio investido.
 * Série mensal reconstruída das transações (custo) + snapshots diários a mercado.
 */

import { consultar, executar, getDb, salvarDb } from "@/lib/financeiro/db";
import { type Periodo } from "@/lib/financeiro/periodo";
import { resumirPatrimonio } from "@/services/patrimonio-service";
import { SQL_COMPRAS } from "@/lib/financeiro/imovel";
import { resumirRentabilidade } from "@/services/rentabilidade-service";

export type PontoEvolucao = {
  data: string;
  rotulo: string;
  custo: number;
  mercado: number | null;
};

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v) || 0;
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export async function gravarSnapshotPatrimonio(): Promise<void> {
  const [rent, pat] = await Promise.all([resumirRentabilidade(), resumirPatrimonio()]);
  const db = await getDb();
  const dia = new Date().toISOString().slice(0, 10);
  executar(
    db,
    `INSERT OR REPLACE INTO snapshots_patrimonio (data, custo, mercado, caixa)
     VALUES (?, ?, ?, ?)`,
    [dia, rent.custo, rent.mercado, pat.caixaFisico],
  );
  await salvarDb();
}

function mesChave(v: unknown): string | null {
  const s = String(v ?? "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}`;
  return null;
}

export async function evolucaoPatrimonio(periodo?: Periodo): Promise<PontoEvolucao[]> {
  const db = await getDb();
  const fluxos = consultar(
    db,
    `SELECT data AS d, valor_brl AS v
     FROM transacoes
     WHERE tipo_operacao IN ${SQL_COMPRAS}
     UNION ALL
     SELECT data AS d, -valor_brl AS v
     FROM transacoes WHERE tipo_operacao IN ('Venda','Venda de imóvel','Doação de imóvel','Doação realizada')
     UNION ALL
     SELECT data_aplicacao AS d, valor_aplicado AS v
     FROM renda_fixa
     WHERE tipo_movimento = 'Aplicação' AND COALESCE(valor_aplicado, 0) > 0
     UNION ALL
     SELECT data_aplicacao AS d, valor_aplicado AS v
     FROM renda_fixa
     WHERE tipo_movimento = 'Resgate parcial' AND COALESCE(valor_aplicado, 0) > 0
     UNION ALL
     SELECT data_resgate AS d, -COALESCE(valor_aplicado, 0) AS v
     FROM renda_fixa
     WHERE tipo_movimento = 'Resgate parcial' AND data_resgate IS NOT NULL AND TRIM(data_resgate) <> ''
     UNION ALL
     SELECT data_resgate AS d, -COALESCE(valor_aplicado, 0) AS v
     FROM renda_fixa
     WHERE status = 'Resgatado' AND data_resgate IS NOT NULL AND TRIM(data_resgate) <> ''`,
  );
  const porMes = new Map<string, number>();
  for (const r of fluxos) {
    const mes = mesChave(r.d);
    if (!mes) continue;
    porMes.set(mes, (porMes.get(mes) ?? 0) + num(r.v));
  }
  const snaps = consultar(db, `SELECT data, mercado FROM snapshots_patrimonio ORDER BY data`);
  const mercadoPorMes = new Map<string, number>();
  for (const s of snaps) {
    const mes = mesChave(s.data);
    if (mes) mercadoPorMes.set(mes, num(s.mercado));
  }
  const meses = [...porMes.keys()].sort();
  if (!meses.length) return [];
  const hoje = new Date();
  const y1 = hoje.getFullYear();
  const m1 = hoje.getMonth() + 1;
  let [y0, m0] = meses[0].split("-").map(Number);
  if (y0 < y1 - 15) {
    y0 = y1 - 15;
    m0 = 1;
  }
  const out: PontoEvolucao[] = [];
  let custo = 0;
  for (const [mes, valor] of [...porMes.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (mes < `${y0}-${String(m0).padStart(2, "0")}`) custo += valor;
  }
  let y = y0;
  let m = m0;
  while (y < y1 || (y === y1 && m <= m1)) {
    const chave = `${y}-${String(m).padStart(2, "0")}`;
    custo += porMes.get(chave) ?? 0;
    out.push({
      data: chave,
      rotulo: `${MESES[m - 1]}/${String(y).slice(2)}`,
      custo,
      mercado: mercadoPorMes.get(chave) ?? null,
    });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  let ultimoMercado: number | null = null;
  for (const p of out) {
    const bruto = p.mercado;
    if (bruto != null && bruto > 0) {
      const quedaFalsa =
        ultimoMercado != null &&
        p.custo > 0 &&
        bruto < ultimoMercado * 0.5 &&
        bruto < p.custo * 0.5;
      if (!quedaFalsa) ultimoMercado = bruto;
    }
    p.mercado = ultimoMercado;
  }
  if (periodo && periodo.modo !== "tudo") {
    const limite =
      periodo.modo === "ano"
        ? `${periodo.ano}-12`
        : periodo.modo === "mes"
          ? `${periodo.ano}-${String(periodo.mes).padStart(2, "0")}`
          : String(periodo.data).slice(0, 7);
    const inicio = periodo.modo === "ano" ? `${periodo.ano}-01` : "0000-00";
    return out.filter((p) => p.data >= inicio && p.data <= limite);
  }
  return out;
}
