/**
 * Caixa de moeda estrangeira, separado do investimento.
 * Compra de dólar entra aqui. O ativo no exterior só consome esse saldo,
 * pelo custo médio. Dividendo em dólar volta para cá e pode ser reinvestido.
 */
import { consultar, executar, getDb, salvarDb } from "@/lib/financeiro/db";
import { computavelParaGravar } from "@/services/irpf-service";

export type MovimentoCambio = {
  id: number;
  data: string;
  moeda: string;
  tipo: string;
  quantidade: number;
  custoBrl: number;
  iofBrl: number;
  spreadBrl: number;
  cotacao: number | null;
  descricao: string | null;
};

export type SaldoCambio = {
  moeda: string;
  quantidade: number;
  custoBrl: number;
  precoMedio: number;
};

const ENTRA = new Set(["Compra", "Dividendo"]);

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v) || 0;
}

function linha(r: Record<string, unknown>): MovimentoCambio {
  return {
    id: num(r.id),
    data: String(r.data ?? ""),
    moeda: String(r.moeda ?? "USD"),
    tipo: String(r.tipo ?? ""),
    quantidade: num(r.quantidade),
    custoBrl: num(r.custo_brl),
    iofBrl: num(r.iof_brl),
    spreadBrl: num(r.spread_brl),
    cotacao: r.cotacao == null ? null : num(r.cotacao),
    descricao: r.descricao == null ? null : String(r.descricao),
  };
}

export async function listarCambio(moeda = "USD"): Promise<MovimentoCambio[]> {
  const db = await getDb();
  return consultar(db, `SELECT * FROM caixa_cambio WHERE moeda = ? ORDER BY data, id`, [moeda]).map(linha);
}

export async function saldoCambio(moeda = "USD"): Promise<SaldoCambio> {
  const db = await getDb();
  const movimentos = consultar(db, `SELECT tipo, quantidade, custo_brl FROM caixa_cambio WHERE moeda = ? ORDER BY id`, [
    moeda,
  ]);
  let quantidade = 0;
  let custoBrl = 0;
  for (const m of movimentos) {
    const qtd = num(m.quantidade);
    const custo = num(m.custo_brl);
    if (ENTRA.has(String(m.tipo))) {
      quantidade += qtd;
      custoBrl += custo;
    } else {
      quantidade -= qtd;
      custoBrl -= custo;
    }
  }
  if (quantidade < 0.0000001) {
    quantidade = 0;
    custoBrl = 0;
  }
  return {
    moeda,
    quantidade,
    custoBrl: Math.max(0, custoBrl),
    precoMedio: quantidade > 0 ? custoBrl / quantidade : 0,
  };
}

function contaEhCaixa(db: Awaited<ReturnType<typeof getDb>>, id?: number): boolean {
  if (!id) return false;
  const r = consultar(db, `SELECT instituicao, apelido FROM contas WHERE id = ?`, [id])[0];
  if (!r) return false;
  const nome = `${r.instituicao ?? ""} ${r.apelido ?? ""}`;
  return /caixa f[íi]sico/i.test(nome);
}

export async function lancarCompraMoeda(input: {
  data: string;
  moeda?: string;
  quantidade: number;
  valorBrl: number;
  iofBrl?: number;
  spreadBrl?: number;
  descricao?: string;
  contaOrigemId?: number;
  contaDestinoId?: number;
}): Promise<void> {
  if (!input.data || input.quantidade <= 0 || input.valorBrl <= 0) {
    throw new Error("Informe a data, a quantidade de moeda e o valor em R$.");
  }
  const iof = Math.max(0, input.iofBrl ?? 0);
  const spread = Math.max(0, input.spreadBrl ?? 0);
  const custo = input.valorBrl + iof + spread;
  const db = await getDb();
  executar(
    db,
    `INSERT INTO caixa_cambio (
       data, moeda, tipo, quantidade, custo_brl, iof_brl, spread_brl, cotacao, descricao,
       conta_origem_id, conta_destino_id, moeda_origem, valor_origem, moeda_destino, valor_destino
     ) VALUES (?, ?, 'Compra', ?, ?, ?, ?, ?, ?, ?, ?, 'BRL', ?, ?, ?)`,
    [
      input.data,
      input.moeda || "USD",
      input.quantidade,
      custo,
      iof,
      spread,
      custo / input.quantidade,
      input.descricao?.trim() || null,
      input.contaOrigemId ?? null,
      input.contaDestinoId ?? null,
      custo,
      input.moeda || "USD",
      input.quantidade,
    ],
  );
  const id = num(consultar(db, `SELECT last_insert_rowid() AS id`)[0]?.id);
  if (contaEhCaixa(db, input.contaOrigemId)) {
    executar(db, `INSERT INTO caixa_fisico (data, tipo, valor, descricao, cambio_id) VALUES (?, 'Saque', ?, ?, ?)`, [
      input.data,
      custo,
      input.descricao?.trim() || `Compra de ${input.moeda || "USD"}`,
      id,
    ]);
  }
  await salvarDb();
}

export async function lancarVendaMoeda(input: {
  data: string;
  moeda?: string;
  quantidade: number;
  valorBrl: number;
  descricao?: string;
  contaOrigemId?: number;
  contaDestinoId?: number;
}): Promise<{ resultado: number }> {
  const moeda = input.moeda || "USD";
  const saldo = await saldoCambio(moeda);
  if (!input.data || input.quantidade <= 0 || input.valorBrl <= 0) {
    throw new Error("Informe a data, a quantidade e o valor em R$ que entrou.");
  }
  if (input.quantidade > saldo.quantidade + 0.000001) {
    throw new Error(`Saldo insuficiente. Há ${saldo.quantidade.toLocaleString("pt-BR")} ${moeda}.`);
  }
  const custo = saldo.precoMedio * input.quantidade;
  const resultado = input.valorBrl - custo;
  const db = await getDb();
  executar(
    db,
    `INSERT INTO caixa_cambio (
       data, moeda, tipo, quantidade, custo_brl, iof_brl, spread_brl, cotacao, descricao,
       conta_origem_id, conta_destino_id, moeda_origem, valor_origem, moeda_destino, valor_destino
     ) VALUES (?, ?, 'Venda', ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, 'BRL', ?)`,
    [
      input.data,
      moeda,
      input.quantidade,
      custo,
      input.valorBrl / input.quantidade,
      input.descricao?.trim() || null,
      input.contaDestinoId ?? null,
      input.contaOrigemId ?? null,
      moeda,
      input.quantidade,
      input.valorBrl,
    ],
  );
  const id = num(consultar(db, `SELECT last_insert_rowid() AS id`)[0]?.id);
  if (contaEhCaixa(db, input.contaOrigemId)) {
    executar(db, `INSERT INTO caixa_fisico (data, tipo, valor, descricao, cambio_id) VALUES (?, 'Depósito', ?, ?, ?)`, [
      input.data,
      input.valorBrl,
      input.descricao?.trim() || `Venda de ${moeda}`,
      id,
    ]);
  }
  if (Math.abs(resultado) > 0.004) {
    const regra = computavelParaGravar(db, "Variação cambial", resultado);
    executar(
      db,
      `INSERT INTO rendimentos (
          data, tipo, categoria, origem, moeda, valor_bruto_orig, valor_bruto_brl, valor_liquido,
          valor_computavel_irpfm, ir_retido, descricao, classificacao_irpfm
        ) VALUES (?, 'Variação cambial', 'Câmbio', 'Internacional', ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        input.data,
        moeda,
        input.quantidade,
        resultado,
        resultado,
        regra.valor,
        `Venda de ${moeda} · resultado ${resultado.toFixed(2)} sobre o custo médio`,
        regra.classificacao || null,
      ],
    );
  }
  await salvarDb();
  return { resultado };
}

/** Tira dólar do caixa para comprar ativo. Devolve o custo em R$ pelo preço médio. */
export async function consumirMoeda(input: {
  data: string;
  moeda?: string;
  quantidade: number;
  descricao?: string;
}): Promise<{ custoBrl: number; cotacao: number }> {
  const moeda = input.moeda || "USD";
  const saldo = await saldoCambio(moeda);
  if (input.quantidade <= 0) throw new Error("Quantidade de moeda inválida.");
  if (input.quantidade > saldo.quantidade + 0.000001) {
    throw new Error(
      `Não há ${moeda} suficiente no câmbio. Saldo ${saldo.quantidade.toLocaleString("pt-BR")} ${moeda}. Compre a moeda antes, em Câmbio.`,
    );
  }
  const custo = saldo.precoMedio * input.quantidade;
  const db = await getDb();
  executar(
    db,
    `INSERT INTO caixa_cambio (data, moeda, tipo, quantidade, custo_brl, cotacao, descricao)
     VALUES (?, ?, 'Uso', ?, ?, ?, ?)`,
    [input.data, moeda, input.quantidade, custo, saldo.precoMedio, input.descricao?.trim() || null],
  );
  return { custoBrl: custo, cotacao: saldo.precoMedio };
}

/** Dividendo ou venda de ativo que volta em dólar para a conta. */
export async function creditarMoeda(input: {
  data: string;
  moeda?: string;
  quantidade: number;
  custoBrl: number;
  tipo?: "Dividendo";
  descricao?: string;
}): Promise<void> {
  if (input.quantidade <= 0 || input.custoBrl < 0) return;
  const db = await getDb();
  executar(
    db,
    `INSERT INTO caixa_cambio (data, moeda, tipo, quantidade, custo_brl, cotacao, descricao)
     VALUES (?, ?, 'Dividendo', ?, ?, ?, ?)`,
    [
      input.data,
      input.moeda || "USD",
      input.quantidade,
      input.custoBrl,
      input.quantidade > 0 ? input.custoBrl / input.quantidade : 0,
      input.descricao?.trim() || null,
    ],
  );
}

export async function excluirMovimentoCambio(id: number): Promise<void> {
  const db = await getDb();
  const atual = consultar(db, `SELECT moeda FROM caixa_cambio WHERE id = ?`, [id])[0];
  if (!atual) return;
  const moeda = String(atual.moeda ?? "USD");
  const resto = consultar(
    db,
    `SELECT tipo, quantidade, custo_brl FROM caixa_cambio WHERE moeda = ? AND id <> ? ORDER BY data, id`,
    [moeda, id],
  );
  let qtd = 0;
  for (const m of resto) {
    qtd += ENTRA.has(String(m.tipo)) ? num(m.quantidade) : -num(m.quantidade);
    if (qtd < -0.000001) {
      throw new Error("Excluir este lançamento deixaria o saldo de moeda negativo.");
    }
  }
  executar(db, `DELETE FROM caixa_fisico WHERE cambio_id = ?`, [id]);
  executar(db, `DELETE FROM caixa_cambio WHERE id = ?`, [id]);
  await salvarDb();
}
