/** Recorte de período compartilhado por todos os módulos. */

export type ModoPeriodo = "tudo" | "ano" | "mes" | "dia";

export type Periodo = {
  modo: ModoPeriodo;
  ano: number;
  mes: number;
  data: string;
};

export function periodoPadrao(): Periodo {
  const d = new Date();
  return {
    modo: "tudo",
    ano: d.getFullYear(),
    mes: d.getMonth() + 1,
    data: d.toISOString().slice(0, 10),
  };
}

export function rotuloPeriodo(p: Periodo): string {
  if (p.modo === "tudo") return "Todo o histórico";
  if (p.modo === "ano") return String(p.ano);
  if (p.modo === "mes") {
    const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${nomes[p.mes - 1]}/${p.ano}`;
  }
  return p.data.split("-").reverse().join("/");
}

export function anoDoPeriodo(p: Periodo): number | undefined {
  return p.modo === "tudo" ? undefined : p.ano;
}

export function dataNoPeriodo(iso: unknown, p: Periodo): boolean {
  if (p.modo === "tudo") return true;
  const s = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  if (p.modo === "ano") return s.startsWith(String(p.ano));
  if (p.modo === "mes") return s.startsWith(`${p.ano}-${String(p.mes).padStart(2, "0")}`);
  return s === p.data;
}

/** Último dia incluso no recorte (estoque “até esta data”). */
export function fimDoPeriodo(p: Periodo): string | null {
  if (p.modo === "tudo") return null;
  if (p.modo === "dia") return p.data;
  if (p.modo === "mes") {
    const last = new Date(p.ano, p.mes, 0).getDate();
    return `${p.ano}-${String(p.mes).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  }
  return `${p.ano}-12-31`;
}

export function dataAtePeriodo(iso: unknown, p: Periodo): boolean {
  const fim = fimDoPeriodo(p);
  if (!fim) return true;
  const s = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return s <= fim;
}

export function prefixoSql(p?: Periodo | null, coluna = "data"): { sql: string; params: string[] } {
  if (!p || p.modo === "tudo") return { sql: "1=1", params: [] };
  if (p.modo === "ano") return { sql: `substr(${coluna},1,4) = ?`, params: [String(p.ano)] };
  if (p.modo === "mes") {
    return { sql: `substr(${coluna},1,7) = ?`, params: [`${p.ano}-${String(p.mes).padStart(2, "0")}`] };
  }
  return { sql: `substr(${coluna},1,10) = ?`, params: [p.data] };
}

export function prefixoSqlAte(p?: Periodo | null, coluna = "data"): { sql: string; params: string[] } {
  if (!p) return { sql: "1=1", params: [] };
  const fim = fimDoPeriodo(p);
  if (!fim) return { sql: "1=1", params: [] };
  return { sql: `substr(${coluna},1,10) <= ?`, params: [fim] };
}
