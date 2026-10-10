/**
 * Preços oficiais do Tesouro Direto (Tesouro Transparente — CSV diário).
 * Fonte: taxas dos títulos ofertados. PU venda = marcação a mercado da posição.
 */

export type PrecoTesouro = {
  tipo: string;
  vencimento: string;
  dataBase: string;
  taxaCompra: number;
  taxaVenda: number;
  puCompra: number;
  puVenda: number;
  puBase: number;
};

function numBr(s: string): number {
  return Number(s.trim().replace(/\./g, "").replace(",", ".")) || 0;
}

function isoDeBr(s: string): string | null {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function parsearCsv(texto: string): PrecoTesouro[] {
  const linhas = texto.split(/\r?\n/).filter((l) => l.includes(";"));
  const out: PrecoTesouro[] = [];
  let dataAlvo: string | null = null;
  for (const ln of linhas) {
    if (ln.toLowerCase().startsWith("tipo")) continue;
    const p = ln.split(";");
    if (p.length < 7) continue;
    const dataBase = isoDeBr(p[2] ?? "");
    if (!dataBase) continue;
    if (!dataAlvo) dataAlvo = dataBase;
    if (dataBase !== dataAlvo) break;
    const vencimento = isoDeBr(p[1] ?? "");
    if (!vencimento) continue;
    out.push({
      tipo: (p[0] ?? "").trim(),
      vencimento,
      dataBase,
      taxaCompra: numBr(p[3] ?? ""),
      taxaVenda: numBr(p[4] ?? ""),
      puCompra: numBr(p[5] ?? ""),
      puVenda: numBr(p[6] ?? ""),
      puBase: numBr(p[7] ?? p[6] ?? ""),
    });
  }
  return out;
}

export async function listarPrecosTesouro(): Promise<PrecoTesouro[]> {
  const r = await fetch("/proxy/tesouro", { cache: "no-store" });
  if (!r.ok) throw new Error(`Tesouro Transparente HTTP ${r.status}`);
  const buf = await r.arrayBuffer();
  const texto = new TextDecoder("latin1").decode(buf);
  return parsearCsv(texto);
}

function scoreTipo(cadastro: string, oficial: string): number {
  const a = cadastro.toUpperCase().replace(/\s+/g, " ").trim();
  const b = oficial.toUpperCase().replace(/\s+/g, " ").trim();
  if (!a) return 0;
  if (a === b) return 100;
  if (b.startsWith(a) && !b.includes("JUROS")) return 80;
  if (b.startsWith(a)) return 60;
  if (b.includes(a.split(" ")[1] ?? a)) return 40;
  return 0;
}

export function casarTesouro(
  lista: PrecoTesouro[],
  cadastro: { tipoRf?: string | null; nome?: string | null; vencimento?: string | null },
): PrecoTesouro | null {
  const venc = (cadastro.vencimento ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) return null;
  const tipo = cadastro.tipoRf || cadastro.nome || "";
  const candidatos = lista.filter((p) => p.vencimento === venc);
  if (!candidatos.length) return null;
  let melhor = candidatos[0];
  let pts = scoreTipo(tipo, melhor.tipo);
  for (const c of candidatos) {
    const s = scoreTipo(tipo, c.tipo);
    if (s > pts) {
      pts = s;
      melhor = c;
    }
  }
  return melhor;
}
