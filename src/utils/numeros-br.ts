/**
 * Parse de números no padrão brasileiro e internacional.
 * Aceita: 515000 | 515.000 | 515.000,50 | 515000,5 | 1,234.56
 */
export function parseNumeroBR(valor: unknown): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  if (valor == null) return 0;
  let s = String(valor).trim();
  if (!s) return 0;
  s = s.replace(/R\$\s?/gi, "").replace(/\s/g, "");
  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");
  if (temVirgula && temPonto) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (temVirgula) {
    s = s.replace(",", ".");
  } else if (temPonto) {
    const partes = s.split(".");
    if (partes.length > 2 || (partes.length === 2 && partes[1]!.length === 3 && partes[0]!.length <= 3)) {
      if (partes.every((p, i) => (i === 0 ? /^\d+$/.test(p) : /^\d{3}$/.test(p)))) {
        s = partes.join("");
      }
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function formatNumeroBR(n: number, casas = 2): string {
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

/** Máscara ao digitar: 123456 → 1.234,56 (casas decimais fixas). */
export function mascararMoedaBR(bruto: string, casas = 2): string {
  const neg = bruto.trim().startsWith("-");
  const digits = bruto.replace(/\D/g, "");
  if (!digits) return neg ? "-" : "";
  const pad = digits.padStart(casas + 1, "0");
  const intRaw = pad.slice(0, -casas).replace(/^0+(?=\d)/, "");
  const dec = pad.slice(-casas);
  const intFmt = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}${intFmt},${dec}`;
}

/** Quantidade: permite vírgula decimal livre e formata no blur. */
export function mascararQuantidadeBR(bruto: string, casas = 6): string {
  let s = bruto.replace(/[^\d.,-]/g, "");
  const neg = s.startsWith("-");
  s = s.replace(/-/g, "");
  s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return neg ? "-" : s.replace(".", ",");
  const txt = n.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: casas,
  });
  return neg ? `-${txt}` : txt;
}
