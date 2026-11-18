import assert from "node:assert/strict";
import test from "node:test";
import { calcularSaldo, paraCentavos, sinalOperacao } from "./contas-saldo.ts";

test("converte reais em centavos sem fração perdida", () => {
  assert.equal(paraCentavos(10.1), 1010);
  assert.equal(paraCentavos(0.29), 29);
  assert.equal(paraCentavos(null), 0);
});

test("saldo atual ignora lançamento futuro", () => {
  const r = calcularSaldo({
    saldoInicialCentavos: 100_00,
    dataSaldoInicial: "2026-01-01",
    hoje: "2026-01-10",
    movimentos: [
      { data: "2026-01-05", centavos: 50_00, futuro: false, descricao: "venda", origem: "transacao" },
      { data: "2026-01-20", centavos: -30_00, futuro: true, descricao: "conta", origem: "despesa" },
    ],
  });
  assert.equal(r.atual, 150_00);
  assert.equal(r.previsto, 120_00);
});

test("lançamento anterior ao saldo inicial não entra", () => {
  const r = calcularSaldo({
    saldoInicialCentavos: 200_00,
    dataSaldoInicial: "2026-02-01",
    hoje: "2026-03-01",
    movimentos: [{ data: "2026-01-01", centavos: -500_00, futuro: false, descricao: "velho", origem: "tx" }],
  });
  assert.equal(r.atual, 200_00);
  assert.equal(r.previsto, 200_00);
});

test("exclusão de um movimento recalcula o saldo", () => {
  const base = {
    saldoInicialCentavos: 0,
    dataSaldoInicial: "2026-01-01",
    hoje: "2026-06-01",
  };
  const movs = [
    { data: "2026-02-01", centavos: 80_00, futuro: false, descricao: "a", origem: "tx" },
    { data: "2026-03-01", centavos: -30_00, futuro: false, descricao: "b", origem: "tx" },
  ];
  assert.equal(calcularSaldo({ ...base, movimentos: movs }).atual, 50_00);
  assert.equal(calcularSaldo({ ...base, movimentos: movs.slice(0, 1) }).atual, 80_00);
});

test("projeção negativa aponta a data", () => {
  const r = calcularSaldo({
    saldoInicialCentavos: 10_00,
    dataSaldoInicial: "2026-01-01",
    hoje: "2026-01-01",
    movimentos: [{ data: "2026-04-01", centavos: -25_00, futuro: true, descricao: "boleto", origem: "despesa" }],
  });
  assert.equal(r.atual, 10_00);
  assert.equal(r.negativoEm, "2026-04-01");
});

test("transferência soma zero entre as duas pontas", () => {
  const saida = sinalOperacao("Transferência");
  assert.equal(saida, "transfer");
  const origem = calcularSaldo({
    saldoInicialCentavos: 100_00,
    dataSaldoInicial: "2026-01-01",
    hoje: "2026-01-31",
    movimentos: [{ data: "2026-01-15", centavos: -40_00, futuro: false, descricao: "transf", origem: "transacao" }],
  });
  const destino = calcularSaldo({
    saldoInicialCentavos: 0,
    dataSaldoInicial: "2026-01-01",
    hoje: "2026-01-31",
    movimentos: [{ data: "2026-01-15", centavos: 40_00, futuro: false, descricao: "transf", origem: "transacao" }],
  });
  assert.equal(origem.atual + destino.atual, 100_00);
});
