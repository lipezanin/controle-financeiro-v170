/** Recorte nacional / internacional — categorias já usadas no livro. */

export type RecorteMercado = "tudo" | "nacional" | "internacional";

export const CATS_INTERNACIONAL = [
  "Stocks",
  "ETF USA",
  "Reits",
  "Bonds",
  "Treasuries",
] as const;

export function eCategoriaInternacional(categoria: string | null | undefined): boolean {
  const c = String(categoria ?? "");
  return (CATS_INTERNACIONAL as readonly string[]).includes(c);
}

export function ePosicaoInternacional(
  categoria: string | null | undefined,
  origem?: string | null,
): boolean {
  if (String(origem ?? "").toLowerCase().includes("internacional")) return true;
  return eCategoriaInternacional(categoria);
}

export const CLASSES_INTERNACIONAL = [
  "Stocks",
  "ETF's USA",
  "Reits",
  "Bonds - Renda Fixa",
  "Treasuries - Renda Fixa",
] as const;

export function classeNoRecorte(recorte: RecorteMercado, classe: string): boolean {
  if (recorte === "tudo") return true;
  const intl = (CLASSES_INTERNACIONAL as readonly string[]).includes(classe);
  return recorte === "internacional" ? intl : !intl;
}
export function passaRecorte(
  recorte: RecorteMercado,
  categoria: string | null | undefined,
  origem?: string | null,
): boolean {
  if (recorte === "tudo") return true;
  const intl = ePosicaoInternacional(categoria, origem);
  return recorte === "internacional" ? intl : !intl;
}
