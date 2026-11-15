import { consultar, getDb } from "@/lib/financeiro/db";
import { CATEGORIA_IMOVEL, ehSaidaImovel, TIPOS_CUSTO_SEM_CAIXA } from "@/lib/financeiro/imovel";

export type PainelImovel = {
  ticker: string;
  quantidade: number;
  custo: number;
  parcela: number;
  correcao: number;
  impostos: number;
  corretagem: number;
  reforma: number;
  manutencao: number;
  doacaoHeranca: number;
  ganhoRealizado: number;
};

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v) || 0;
}

export async function listarNomesImoveis(): Promise<string[]> {
  const painel = await listarPainelImoveis();
  return painel.map((p) => p.ticker);
}

export async function listarPainelImoveis(): Promise<PainelImovel[]> {
  const db = await getDb();
  const linhas = consultar(
    db,
    `SELECT ticker, tipo_operacao AS tipo, valor_brl AS valor, ganho_capital_brl AS gc
     FROM transacoes
     WHERE categoria IN ('Imóvel', ?)
     ORDER BY id`,
    [CATEGORIA_IMOVEL],
  );
  const mapa = new Map<string, PainelImovel>();
  for (const r of linhas) {
    const ticker = String(r.ticker ?? "").trim();
    if (!ticker) continue;
    const chave = ticker.toUpperCase();
    let item = mapa.get(chave);
    if (!item) {
      item = {
        ticker,
        quantidade: 0,
        custo: 0,
        parcela: 0,
        correcao: 0,
        impostos: 0,
        corretagem: 0,
        reforma: 0,
        manutencao: 0,
        doacaoHeranca: 0,
        ganhoRealizado: 0,
      };
      mapa.set(chave, item);
    }
    const tipo = String(r.tipo ?? "");
    const valor = Math.abs(num(r.valor));
    if (ehSaidaImovel(tipo)) {
      item.quantidade = 0;
      item.custo = 0;
      item.ganhoRealizado += num(r.gc);
      continue;
    }
    item.quantidade = 1;
    item.custo += valor;
    if (tipo === "Parcela Imóvel" || tipo === "Compra") item.parcela += valor;
    else if (tipo === "Correção e juros") item.correcao += valor;
    else if (tipo === "ITBI / Cartório" || tipo === "Imposto Imóvel") item.impostos += valor;
    else if (tipo === "Corretagem Imóvel") item.corretagem += valor;
    else if (tipo === "Reforma Imóvel") item.reforma += valor;
    else if (tipo === "Manutenção Imóvel") item.manutencao += valor;
    else if ((TIPOS_CUSTO_SEM_CAIXA as readonly string[]).includes(tipo)) item.doacaoHeranca += valor;
    else item.parcela += valor;
  }
  return [...mapa.values()].sort((a, b) => a.ticker.localeCompare(b.ticker, "pt-BR"));
}
