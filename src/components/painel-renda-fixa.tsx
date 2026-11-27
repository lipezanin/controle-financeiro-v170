import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { GraficoAplicadoMercado, GraficoRentabilidade } from "@/components/graficos-financeiro";
import { KpiCard } from "@/components/kpi-card";
import { SectionTitle } from "@/components/section-title";
import { usePeriodo } from "@/hooks/periodo-context";
import { dataNoPeriodo } from "@/lib/financeiro/periodo";
import { CORES_GRAFICO } from "@/lib/financeiro/theme";
import { formatBRL, formatPct } from "@/lib/financeiro/format";
import {
  curvaTituloRf,
  painelRendaFixa,
  type PainelRf,
  type PontoCurvaRf,
  type TituloRf,
} from "@/services/renda-fixa-service";

function noMes(mes: string, periodo: ReturnType<typeof usePeriodo>["periodo"]): boolean {
  return dataNoPeriodo(`${mes}-01`, periodo);
}

export function PainelRendaFixa({ internacional }: { internacional: boolean | null }) {
  const { periodo } = usePeriodo();
  const [dados, setDados] = useState<PainelRf | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    void painelRendaFixa(internacional)
      .then((p) => {
        if (vivo) setDados(p);
      })
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof Error ? e.message : "Falha ao montar o histórico");
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [internacional]);

  const carteira = useMemo(
    () => (dados?.carteira ?? []).filter((p) => noMes(p.mes, periodo)),
    [dados, periodo],
  );
  const classes = useMemo(() => {
    return (dados?.classes ?? [])
      .map((c) => ({ ...c, pontos: c.pontos.filter((p) => noMes(p.mes, periodo)) }))
      .filter((c) => c.pontos.length);
  }, [dados, periodo]);

  const ultimo = carteira.at(-1);
  const media =
    carteira.length > 0
      ? carteira.reduce((s, p) => s + (p.rentabilidade ?? 0), 0) / carteira.length
      : null;
  const rentSerie = carteira.map((p) => ({ rotulo: p.rotulo, carteira: p.rentabilidade ?? 0, media: media ?? 0 }));
  const porClasse = carteira.map((p) => {
    const row: Record<string, string | number> = { rotulo: p.rotulo };
    const valores: number[] = [];
    for (const c of classes) {
      const ponto = c.pontos.find((x) => x.rotulo === p.rotulo);
      if (ponto) {
        row[c.classe] = ponto.rentabilidade;
        valores.push(ponto.rentabilidade);
      }
    }
    row.media = valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : 0;
    return row;
  });

  return (
    <div className="mx-auto max-w-6xl">
      <SectionTitle
        kicker="Módulo"
        title="Renda fixa"
        description="Evolução do que está aplicado, do valor de mercado e da rentabilidade por indexador. O histórico diário fica gravado no aplicativo. Os títulos estão em Títulos e Títulos internacionais."
      />
      {erro ? <p className="mb-4 text-sm text-loss">{erro}</p> : null}
      {carregando ? (
        <div className="mb-4">
          <p className="mb-2 text-sm text-muted">Montando o histórico diário dos títulos…</p>
          <div className="h-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full w-1/3 animate-pulse bg-accent" />
          </div>
        </div>
      ) : null}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Aplicado no período" value={formatBRL(ultimo?.aplicado)} />
        <KpiCard label="Mercado no período" value={formatBRL(ultimo?.mercado)} tom="accent" />
        <KpiCard
          label="Rentabilidade média"
          value={formatPct(media, 2)}
          tom={(media ?? 0) >= 0 ? "gain" : "loss"}
          hint="Média dos meses do recorte"
        />
      </div>
      <section className="mb-6 rounded-[16px] border border-border bg-surface p-4">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Evolução do investimento</p>
        <GraficoAplicadoMercado dados={carteira} />
      </section>
      <section className="mb-6 rounded-[16px] border border-border bg-surface p-4">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Rentabilidade da carteira</p>
        <GraficoRentabilidade
          dados={rentSerie}
          series={[
            { chave: "carteira", nome: "Rentabilidade", cor: "#22c55e" },
            { chave: "media", nome: "Média", cor: "#ffffff" },
          ]}
        />
      </section>
      <section className="rounded-[16px] border border-border bg-surface p-4">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
          Rentabilidade por indexador
        </p>
        <GraficoRentabilidade
          dados={porClasse}
          series={[
            ...classes.map((c, i) => ({ chave: c.classe, nome: c.classe, cor: CORES_GRAFICO[i % CORES_GRAFICO.length] })),
            { chave: "media", nome: "Média", cor: "#ffffff" },
          ]}
        />
      </section>
    </div>
  );
}

export function CurvaTitulo({ id }: { id: number }) {
  const [titulo, setTitulo] = useState<TituloRf | null>(null);
  const [pontos, setPontos] = useState<PontoCurvaRf[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void curvaTituloRf(id)
      .then((r) => {
        if (!vivo) return;
        setTitulo(r.titulo);
        setPontos(r.pontos);
      })
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof Error ? e.message : "Falha ao ler a curva");
      });
    return () => {
      vivo = false;
    };
  }, [id]);

  const media = pontos.length ? pontos.reduce((s, p) => s + (p.rentabilidade ?? 0), 0) / pontos.length : 0;
  const serie = pontos.map((p) => ({
    rotulo: p.data.slice(8, 10) + "/" + p.data.slice(5, 7),
    aplicado: p.aplicado,
    mercado: p.mercado,
  }));
  const renta = pontos.map((p) => ({ rotulo: p.data.slice(8, 10) + "/" + p.data.slice(5, 7), renta: p.rentabilidade ?? 0, media }));

  return (
    <div className="mx-auto max-w-6xl">
      <SectionTitle
        kicker="Título"
        title={titulo?.ticker || titulo?.nome || "Renda fixa"}
        description={titulo ? `${titulo.indexador ?? "—"} · ${titulo.emissor ?? ""}` : "Evolução desde a aplicação"}
      />
      <Link
        to="/renda-fixa"
        search={{
          aba: String(titulo?.origem ?? "").toLowerCase().includes("internacional") ? "internacional" : "titulos",
          id: 0,
        }}
        className="mb-4 inline-block text-sm text-accent"
      >
        Voltar aos títulos
      </Link>
      {erro ? <p className="mb-4 text-sm text-loss">{erro}</p> : null}
      <section className="mb-6 rounded-[16px] border border-border bg-surface p-4">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Valor ao longo do tempo</p>
        <GraficoAplicadoMercado dados={serie} />
      </section>
      <section className="rounded-[16px] border border-border bg-surface p-4">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Rentabilidade</p>
        <GraficoRentabilidade
          dados={renta}
          series={[
            { chave: "renta", nome: "Rentabilidade", cor: "#22c55e" },
            { chave: "media", nome: "Média", cor: "#ffffff" },
          ]}
        />
      </section>
    </div>
  );
}
