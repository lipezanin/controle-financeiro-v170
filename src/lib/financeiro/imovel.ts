/** Imóvel é uma unidade. Vários lançamentos somam no custo e a quantidade permanece 1. */

export const CATEGORIA_IMOVEL = "Imóveis";

export const TIPOS_CUSTO_IMOVEL = [
  "Parcela Imóvel",
  "Correção e juros",
  "ITBI / Cartório",
  "Corretagem Imóvel",
  "Imposto Imóvel",
  "Reforma Imóvel",
  "Manutenção Imóvel",
] as const;

/** Entram no custo de aquisição para ganho de capital, mas não são desembolso do preço. */
export const TIPOS_CUSTO_SEM_CAIXA = ["Doação recebida", "Herança"] as const;

export const TIPOS_SAIDA_IMOVEL = ["Venda de imóvel", "Doação de imóvel"] as const;

export const SQL_COMPRAS = `('Compra','Parcela Imóvel','Correção e juros','ITBI / Cartório','Corretagem Imóvel','Imposto Imóvel','Reforma Imóvel','Manutenção Imóvel')`;

export function ehImovel(categoria: string | null | undefined): boolean {
  const c = (categoria ?? "").trim();
  return c === "Imóvel" || c === "Imóveis";
}

export function ehSaidaImovel(tipo: string): boolean {
  return (
    tipo === "Venda de imóvel" ||
    tipo === "Doação de imóvel" ||
    tipo === "Doação realizada"
  );
}

/** Venda de ação também se chama "Venda". Só é imóvel pela categoria ou por um tipo exclusivo de imóvel. */
export function operacaoDeImovel(categoria: string | null | undefined, tipo: string | null | undefined): boolean {
  if (ehImovel(categoria)) return true;
  const t = tipo ?? "";
  return (TIPOS_CUSTO_IMOVEL as readonly string[]).includes(t) || (TIPOS_CUSTO_SEM_CAIXA as readonly string[]).includes(t);
}
