/** Download de arquivo gerado no cliente (CSV / JSON / HTML). */

export function baixarTexto(nome: string, conteudo: string, mime: string): void {
  const blob = new Blob([conteudo], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function imprimirHtml(titulo: string, corpo: string): void {
  const w = window.open("", "_blank", "noopener,width=900,height=700");
  if (!w) return;
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>${titulo}</title>
<style>
  body{font-family:Inter,system-ui,sans-serif;color:#0f172a;margin:24px;font-size:13px}
  h1{font-size:18px;margin:0 0 4px} p.sub{color:#64748b;margin:0 0 16px}
  table{border-collapse:collapse;width:100%;margin:12px 0}
  th,td{border-bottom:1px solid #e2e8f0;padding:6px 8px;text-align:left}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  .kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:12px 0}
  .kpi{border:1px solid #e2e8f0;padding:8px 10px;border-radius:8px}
  .kpi b{display:block;font-size:14px}
  @media print { button { display:none } }
</style></head><body>${corpo}<p style="margin-top:24px;color:#94a3b8;font-size:11px">Gerado localmente · Controle Financeiro · sem espécie em dinheiro</p></body></html>`);
  w.document.close();
  w.focus();
  w.print();
}
