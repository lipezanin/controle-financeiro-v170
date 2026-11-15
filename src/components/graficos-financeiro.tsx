import { useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL, formatPct } from "@/lib/financeiro/format";
import { CORES, CORES_CLASSE, CORES_GRAFICO } from "@/lib/financeiro/theme";

function eixoReais(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return v.toLocaleString("pt-BR");
}

const tooltip = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 8,
  color: "#ffffff",
  fontSize: 12,
};

function TooltipBranco({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number }[];
}): ReactNode {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md bg-slate-950 px-3 py-1.5 text-xs text-white">
      {payload.map((p) => (
        <p key={String(p.name)} className="text-white">
          {p.name}: {typeof p.value === "number" ? formatBRL(p.value) : "—"}
        </p>
      ))}
    </div>
  );
}

function fatiaAmpliada(props: {
  cx?: number;
  cy?: number;
  innerRadius?: number;
  outerRadius?: number;
  startAngle?: number;
  endAngle?: number;
  fill?: string;
}) {
  const { cx = 0, cy = 0, innerRadius = 0, outerRadius = 0, startAngle = 0, endAngle = 0, fill } = props;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 16}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  );
}

export function GraficoRendimentosAportes({
  dados,
}: {
  dados: { nome: string; rendimentos: number; aportes: number }[];
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CORES.borda} strokeDasharray="3 3" />
          <XAxis dataKey="nome" stroke={CORES.textoSecundario} tick={{ fill: CORES.textoSecundario, fontSize: 11 }} />
          <YAxis
            stroke={CORES.textoSecundario}
            tick={{ fill: CORES.textoSecundario, fontSize: 11 }}
            tickFormatter={eixoReais}
          />
          <Tooltip contentStyle={tooltip} formatter={(v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
          <Legend />
          <Bar dataKey="rendimentos" name="Rendimentos" fill={CORES.lucro} radius={4} />
          <Bar dataKey="aportes" name="Aportes" fill={CORES.accent} radius={4} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoComposicao({
  dados,
}: {
  dados: { classe: string; valor: number }[];
}) {
  const visiveis = dados.filter((d) => d.valor > 0);
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={visiveis} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={CORES.borda} strokeDasharray="3 3" />
          <XAxis
            type="number"
            stroke={CORES.textoSecundario}
            tick={{ fill: CORES.textoSecundario, fontSize: 11 }}
            tickFormatter={eixoReais}
          />
          <YAxis
            type="category"
            dataKey="classe"
            width={110}
            stroke={CORES.textoSecundario}
            tick={{ fill: CORES.textoSecundario, fontSize: 11 }}
          />
          <Tooltip contentStyle={tooltip} formatter={(v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} />
          <Bar dataKey="valor" name="Custo" fill={CORES_GRAFICO[0]} radius={4} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoYoc({ dados }: { dados: { data: string; yoc: number | null; proventosAcum: number }[] }) {
  const serie = dados.map((d) => ({
    data: d.data.slice(0, 7),
    yoc: d.yoc == null ? null : +(d.yoc * 100).toFixed(3),
  }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CORES.borda} strokeDasharray="3 3" />
          <XAxis dataKey="data" stroke={CORES.textoSecundario} tick={{ fill: CORES.textoSecundario, fontSize: 11 }} />
          <YAxis
            stroke={CORES.textoSecundario}
            tick={{ fill: CORES.textoSecundario, fontSize: 11 }}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip contentStyle={tooltip} formatter={(v: number) => `${v.toLocaleString("pt-BR")}%`} />
          <Line type="monotone" dataKey="yoc" name="YoC" stroke={CORES.lucro} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoPrecoAtivo({
  dados,
}: {
  dados: { data: string; preco: number }[];
}) {
  const serie = dados.map((d) => ({ data: d.data.slice(0, 10), preco: d.preco }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CORES.borda} strokeDasharray="3 3" />
          <XAxis dataKey="data" stroke={CORES.textoSecundario} tick={{ fill: CORES.textoSecundario, fontSize: 11 }} minTickGap={24} />
          <YAxis
            stroke={CORES.textoSecundario}
            tick={{ fill: CORES.textoSecundario, fontSize: 11 }}
            tickFormatter={(v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={tooltip}
            formatter={(v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          />
          <Line type="monotone" dataKey="preco" name="Fechamento" stroke={CORES.accent} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoEvolucaoPatrimonio({
  dados,
}: {
  dados: { rotulo: string; custo: number; mercado: number | null }[];
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CORES.borda} strokeDasharray="3 3" />
          <XAxis dataKey="rotulo" stroke={CORES.textoSecundario} tick={{ fill: CORES.textoSecundario, fontSize: 11 }} />
          <YAxis
            stroke={CORES.textoSecundario}
            tick={{ fill: CORES.textoSecundario, fontSize: 11 }}
            tickFormatter={eixoReais}
          />
          <Tooltip
            contentStyle={tooltip}
            formatter={(v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          />
          <Legend />
          <Line type="monotone" dataKey="custo" name="Custo investido" stroke={CORES.accent} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="mercado" name="A mercado" stroke={CORES.lucro} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function corClasse(i: number): string {
  return CORES_CLASSE[i % CORES_CLASSE.length];
}

export function GraficoDonut({
  dados,
  titulo,
}: {
  dados: { classe: string; valor: number }[];
  titulo?: string;
}) {
  const visiveis = dados.filter((d) => d.valor > 0);
  const total = visiveis.reduce((s, d) => s + d.valor, 0);
  const serie = visiveis.map((d, i) => ({ ...d, cor: corClasse(i) }));
  const [ativa, setAtiva] = useState<number | undefined>(undefined);
  return (
    <div className="rounded-[16px] border border-border bg-surface p-4">
      {titulo ? <p className="mb-2 text-sm font-medium">{titulo}</p> : null}
      <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="relative h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={serie}
                dataKey="valor"
                nameKey="classe"
                innerRadius="58%"
                outerRadius="88%"
                paddingAngle={2}
                stroke="transparent"
                activeIndex={ativa}
                activeShape={fatiaAmpliada}
                onMouseEnter={(_, i) => setAtiva(i)}
                onMouseLeave={() => setAtiva(undefined)}
              >
                {serie.map((d) => (
                  <Cell key={d.classe} fill={d.cor} />
                ))}
              </Pie>
              <Tooltip content={<TooltipBranco />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Total</p>
            <p className="font-mono text-sm text-fg">{formatBRL(total)}</p>
          </div>
        </div>
        <ul className="space-y-1.5 text-xs">
          {serie.map((d) => (
            <li key={d.classe} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.cor }} />
                <span className="truncate text-muted">{d.classe}</span>
              </span>
              <span className="shrink-0 font-mono text-fg">{formatPct(total ? d.valor / total : 0)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function CardsClasse({
  dados,
}: {
  dados: { classe: string; valor: number; variacaoPct?: number | null; variacaoReais?: number | null }[];
}) {
  const visiveis = dados.filter((d) => d.valor > 0);
  const total = visiveis.reduce((s, d) => s + d.valor, 0);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {visiveis.map((d, i) => {
        const v = d.variacaoPct;
        const positivo = (v ?? 0) > 0.0000001;
        const negativo = (v ?? 0) < -0.0000001;
        return (
          <div key={d.classe} className="min-w-0 overflow-hidden rounded-[16px] p-4 text-white" style={{ background: corClasse(i) }}>
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-[11px] font-semibold uppercase leading-snug tracking-[0.06em] opacity-90">{d.classe}</p>
              <p className="shrink-0 font-mono text-xs">
                {v == null ? "—" : `${positivo ? "↑" : negativo ? "↓" : ""} ${formatPct(v, 2)}`}
              </p>
            </div>
            <p className="mt-2 font-mono text-sm leading-snug sm:text-base">{formatBRL(d.valor)}</p>
            <p className="mt-1 text-xs opacity-90">{formatPct(total ? d.valor / total : 0)} da carteira</p>
            {d.variacaoReais != null ? (
              <p className="mt-1 font-mono text-xs opacity-90">Hoje: {formatBRL(d.variacaoReais)}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function GraficoProventosMes({ dados }: { dados: { rotulo: string; valor: number }[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CORES.borda} strokeDasharray="3 3" />
          <XAxis dataKey="rotulo" stroke={CORES.textoSecundario} tick={{ fill: CORES.textoSecundario, fontSize: 11 }} />
          <YAxis stroke={CORES.textoSecundario} tick={{ fill: CORES.textoSecundario, fontSize: 11 }} tickFormatter={eixoReais} />
          <Tooltip contentStyle={tooltip} formatter={(v: number) => formatBRL(v)} />
          <Bar dataKey="valor" name="Proventos" fill="#f97316" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoProventosComparativo({
  anterior,
  atual,
}: {
  anterior: number;
  atual: number;
}) {
  const serie = [
    { nome: "Mês anterior", valor: anterior, cor: "#3b82f6" },
    { nome: "Mês atual", valor: atual, cor: "#22c55e" },
  ];
  const pct = anterior > 0 ? atual / anterior : null;
  const [ativa, setAtiva] = useState<number | undefined>(undefined);
  return (
    <div className="relative h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={serie}
            dataKey="valor"
            nameKey="nome"
            innerRadius="62%"
            outerRadius="88%"
            stroke="transparent"
            paddingAngle={3}
            activeIndex={ativa}
            activeShape={fatiaAmpliada}
            onMouseEnter={(_, i) => setAtiva(i)}
            onMouseLeave={() => setAtiva(undefined)}
          >
            {serie.map((d) => (
              <Cell key={d.nome} fill={d.cor} />
            ))}
          </Pie>
          <Tooltip content={<TooltipBranco />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-[11px] text-muted">Mês anterior</p>
        <p className="font-mono text-sm text-fg">{formatBRL(anterior)}</p>
        <p className="mt-1 text-[11px] text-gain">Mês atual</p>
        <p className="font-mono text-sm text-fg">{formatBRL(atual)}</p>
        <p className="text-[11px] text-subtle">{pct == null ? "—" : formatPct(pct, 2)}</p>
      </div>
    </div>
  );
}

export function GraficoCaixa({ dados }: { dados: { rotulo: string; saldo: number }[] }) {
  const media = dados.length ? dados.reduce((s, d) => s + d.saldo, 0) / dados.length : 0;
  const serie = dados.map((d) => ({ ...d, media }));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="caixaSaldo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CORES.accent} stopOpacity={0.45} />
              <stop offset="100%" stopColor={CORES.accent} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CORES.borda} strokeDasharray="3 3" />
          <XAxis dataKey="rotulo" stroke={CORES.textoSecundario} tick={{ fill: CORES.textoSecundario, fontSize: 11 }} />
          <YAxis
            stroke={CORES.textoSecundario}
            tick={{ fill: CORES.textoSecundario, fontSize: 11 }}
            tickFormatter={eixoReais}
          />
          <Tooltip content={<TooltipBranco />} />
          <Legend />
          <Area type="monotone" dataKey="saldo" name="Saldo em espécie" stroke={CORES.accent} fill="url(#caixaSaldo)" strokeWidth={2} />
          <Line type="monotone" dataKey="media" name="Média mensal" stroke={CORES.alerta} strokeWidth={1.5} strokeDasharray="6 4" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoSerieMedia({
  dados,
  nome,
  cor = CORES.accent,
}: {
  dados: { rotulo: string; valor: number }[];
  nome: string;
  cor?: string;
}) {
  const media = dados.length ? dados.reduce((s, d) => s + d.valor, 0) / dados.length : 0;
  const serie = dados.map((d) => ({ ...d, media }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CORES.borda} strokeDasharray="3 3" />
          <XAxis dataKey="rotulo" stroke={CORES.textoSecundario} tick={{ fill: CORES.textoSecundario, fontSize: 11 }} />
          <YAxis stroke={CORES.textoSecundario} tick={{ fill: CORES.textoSecundario, fontSize: 11 }} tickFormatter={eixoReais} />
          <Tooltip content={<TooltipBranco />} />
          <Legend />
          <Line type="monotone" dataKey="valor" name={nome} stroke={cor} strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="media" name="Média mensal" stroke="#ffffff" strokeWidth={1.5} strokeDasharray="6 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GraficoCategoriasMes({
  categorias,
  meses,
}: {
  categorias: { categoria: string; meses: number[] }[];
  meses: string[];
}) {
  const serie = meses.map((rotulo, i) => {
    const row: Record<string, string | number> = { rotulo };
    let soma = 0;
    for (const c of categorias) {
      const v = c.meses[i] ?? 0;
      row[c.categoria] = v;
      soma += v;
    }
    return row;
  });
  const media = serie.length
    ? serie.reduce((s, r) => s + categorias.reduce((a, c) => a + Number(r[c.categoria] ?? 0), 0), 0) / serie.length
    : 0;
  const comMedia = serie.map((r) => ({ ...r, media }));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={comMedia} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CORES.borda} strokeDasharray="3 3" />
          <XAxis dataKey="rotulo" stroke={CORES.textoSecundario} tick={{ fill: CORES.textoSecundario, fontSize: 11 }} />
          <YAxis stroke={CORES.textoSecundario} tick={{ fill: CORES.textoSecundario, fontSize: 11 }} tickFormatter={eixoReais} />
          <Tooltip content={<TooltipBranco />} />
          <Legend />
          {categorias.map((c, i) => (
            <Line key={c.categoria} type="monotone" dataKey={c.categoria} stroke={corClasse(i)} strokeWidth={2} dot={false} />
          ))}
          <Line type="monotone" dataKey="media" name="Média mensal" stroke="#ffffff" strokeWidth={1.5} strokeDasharray="6 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Dois anéis: mês anterior (externo) × mês atual (interno). */
export function GraficoAneis({
  atual,
  anterior,
  rotuloAtual = "Mês atual",
  rotuloAnterior = "Mês anterior",
}: {
  atual: number;
  anterior: number;
  rotuloAtual?: string;
  rotuloAnterior?: string;
}) {
  const max = Math.max(atual, anterior, 1);
  const circ = 2 * Math.PI * 42;
  const circExt = 2 * Math.PI * 54;
  const pct = anterior > 0 ? atual / anterior : null;
  return (
    <div className="flex flex-col items-center rounded-[16px] border border-border bg-surface p-4">
      <svg viewBox="0 0 140 140" className="h-52 w-52">
        <circle cx="70" cy="70" r="54" fill="none" stroke={CORES.borda} strokeWidth="10" />
        <circle
          cx="70"
          cy="70"
          r="54"
          fill="none"
          stroke={CORES.accent}
          strokeWidth="10"
          strokeDasharray={`${(anterior / max) * circExt} ${circExt}`}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
        />
        <circle cx="70" cy="70" r="42" fill="none" stroke={CORES.borda} strokeWidth="10" />
        <circle
          cx="70"
          cy="70"
          r="42"
          fill="none"
          stroke={CORES.lucro}
          strokeWidth="10"
          strokeDasharray={`${(atual / max) * circ} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
        />
      </svg>
      <div className="-mt-2 space-y-1 text-center text-sm">
        <p className="text-muted">
          <span className="mr-1 inline-block size-2 rounded-full bg-accent" />
          {rotuloAnterior} · {formatBRL(anterior)}
        </p>
        <p className="text-fg">
          <span className="mr-1 inline-block size-2 rounded-full" style={{ background: CORES.lucro }} />
          {rotuloAtual} · {formatBRL(atual)}
        </p>
        {pct != null ? (
          <p className={pct >= 1 ? "text-gain" : "text-loss"}>{formatPct(pct, 2)} do mês anterior</p>
        ) : null}
      </div>
    </div>
  );
}

export function CalendarioFluxo({
  ano,
  mes,
  pontos,
}: {
  ano: number;
  mes: number;
  pontos: { dia: number; entrada: number; saida: number }[];
}) {
  const mapa = new Map(pontos.map((p) => [p.dia, p]));
  const primeiro = new Date(ano, mes - 1, 1).getDay();
  const dias = new Date(ano, mes, 0).getDate();
  const celulas: (number | null)[] = [...Array(primeiro).fill(null), ...Array.from({ length: dias }, (_, i) => i + 1)];
  const totE = pontos.reduce((s, p) => s + p.entrada, 0);
  const totS = pontos.reduce((s, p) => s + p.saida, 0);
  return (
    <div className="rounded-[16px] border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap gap-4 text-xs">
        <span className="text-gain">Entrada {formatBRL(totE)}</span>
        <span className="text-loss">Saída {formatBRL(totS)}</span>
        <span className="text-fg">Resultado {formatBRL(totE - totS)}</span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <div key={`${d}-${i}`} className="py-1">
            {d}
          </div>
        ))}
        {celulas.map((dia, i) => {
          const p = dia ? mapa.get(dia) : null;
          const tem = p && (p.entrada > 0 || p.saida > 0);
          const positivo = p && p.entrada >= p.saida;
          return (
            <div
              key={i}
              className="flex aspect-square items-center justify-center rounded-md text-xs"
              style={
                tem
                  ? { background: positivo ? "rgba(34,197,94,0.35)" : "rgba(139,92,246,0.45)", color: "#f1f5f9" }
                  : { background: "#1e293b", color: "#64748b" }
              }
              title={p ? `+${p.entrada} −${p.saida}` : undefined}
            >
              {dia ?? ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}
