/** Formatação pt-BR para valores, percentuais e datas. */

export function formatBRL(valor: number | null | undefined): string {
  if (valor == null || Number.isNaN(valor)) return "—";
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatPct(valor: number | null | undefined, casas = 1): string {
  if (valor == null || Number.isNaN(valor)) return "—";
  return `${(valor * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })}%`;
}

export function formatQtd(valor: number | null | undefined): string {
  if (valor == null || Number.isNaN(valor)) return "—";
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

export function formatData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}
