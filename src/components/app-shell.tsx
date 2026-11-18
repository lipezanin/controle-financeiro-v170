import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  Building2,
  Banknote,
  CandlestickChart,
  ChevronDown,
  Home,
  Landmark,
  LayoutDashboard,
  Menu,
  Percent,
  PieChart,
  Settings,
  Target,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { FiltroPeriodo } from "@/components/filtro-periodo";
import { ChipSync } from "@/components/chip-sync";
import { ChipUpdate } from "@/components/chip-update";
import { LoginSupabase } from "@/components/login-supabase";
import { Button } from "@/components/ui/button";
import { PeriodoProvider } from "@/hooks/periodo-context";
import { MercadoProvider } from "@/hooks/mercado-context";
import { APP_VERSAO } from "@/lib/app-version";
import { SESSOES_CADASTRO } from "@/lib/financeiro/cadastros-def";
import { cn } from "@/lib/utils";
import {
  iniciarAtualizacaoAutomatica,
  onStatusMercado,
  type StatusMercado,
} from "@/services/atualizacao-automatica-service";
import { sincronizarAoAbrir } from "@/services/sync-service";
import { iniciarChecagemUpdate } from "@/services/update-service";

type Filho = {
  label: string;
  to?: string;
  search?: Record<string, string>;
  hash?: string;
  titulo?: boolean;
};

const NAV: {
  label: string;
  hint: string;
  icon: typeof LayoutDashboard;
  to?: string;
  filhos: Filho[];
}[] = [
  { label: "Dashboard", hint: "Visão geral", icon: LayoutDashboard, to: "/", filhos: [] },
  {
    label: "Patrimônio",
    hint: "Composição e liquidez",
    icon: PieChart,
    to: "/patrimonio",
    filhos: [{ label: "Visão geral", to: "/patrimonio" }],
  },
  {
    label: "Investimentos",
    hint: "Carteira e análises",
    icon: CandlestickChart,
    to: "/investimentos",
    filhos: [
      { label: "Carteira ativa", to: "/investimentos", search: { aba: "ativa" } },
      { label: "Carteira inativa", to: "/investimentos", search: { aba: "inativa" } },
      { label: "Histórico e Análise de Ativos", to: "/investimentos", search: { aba: "historico" } },
      { label: "Proventos recebidos", to: "/proventos" },
      { label: "Transações", to: "/transacoes", search: { livro: "bolsa" } },
      { label: "Nota de corretagem", to: "/lancamentos", search: { tipo: "nota" } },
      { label: "Extrato da corretora", to: "/lancamentos", search: { tipo: "extrato_corretora" } },
    ],
  },
  {
    label: "Câmbio",
    hint: "Moeda comprada e ainda não investida",
    icon: ArrowLeftRight,
    to: "/cambio",
    filhos: [],
  },
  {
    label: "Renda fixa",
    hint: "CDB, LCA e Tesouro",
    icon: Percent,
    to: "/renda-fixa",
    filhos: [
      { label: "Títulos", to: "/renda-fixa" },
      { label: "Renda fixa internacional", to: "/lancamentos", search: { tipo: "rf_int" } },
    ],
  },
  {
    label: "Imóveis",
    hint: "Custo e lançamentos",
    icon: Home,
    to: "/imoveis",
    filhos: [
      { label: "Painel", to: "/imoveis", search: { aba: "painel" } },
      { label: "Transações", to: "/transacoes", search: { livro: "imoveis" } },
      { label: "Aquisição / venda", to: "/imoveis", search: { aba: "aquisicao" } },
      { label: "Imposto e corretagem", to: "/imoveis", search: { aba: "custo" } },
      { label: "Custos de manutenção", to: "/imoveis", search: { aba: "manutencao" } },
    ],
  },
  {
    label: "IRPF / IRPFM",
    hint: "Lei 15.270/2025",
    icon: Landmark,
    to: "/irpf",
    filhos: [
      { label: "Motor mensal", to: "/irpf", search: { tela: "motor" } },
      { label: "Controle fiscal", to: "/irpf", search: { tela: "fiscal" } },
      { label: "Relatório ano-base", to: "/irpf", search: { tela: "relatorio" } },
    ],
  },
  {
    label: "Caixa físico",
    hint: "Espécie e conferência",
    icon: Banknote,
    to: "/caixa",
    filhos: [
      { label: "Extrato", to: "/caixa" },
      { label: "Lançar depósito ou saque", to: "/lancamentos", search: { tipo: "caixa" } },
      { label: "Conferência", to: "/lancamentos", search: { tipo: "conferencia" } },
    ],
  },
  {
    label: "Financeiro",
    hint: "Fluxo e despesas",
    icon: Wallet,
    to: "/financeiro",
    filhos: [
      { label: "Resumo", to: "/financeiro" },
      { label: "Extrato bancário", to: "/lancamentos", search: { tipo: "extrato" } },
      { label: "Extrato internacional", to: "/lancamentos", search: { tipo: "extrato_int" } },
      { label: "Conta a pagar", to: "/lancamentos", search: { tipo: "desp" } },
      { label: "Conta a receber", to: "/lancamentos", search: { tipo: "rend" } },
    ],
  },
  {
    label: "Contas",
    hint: "Bancos e corretoras",
    icon: Building2,
    to: "/contas",
    filhos: [
      { label: "Visão geral", to: "/contas", search: { aba: "visao" } },
      { label: "Nova conta", to: "/contas", search: { aba: "nova" } },
    ],
  },
  {
    label: "Metas",
    hint: "Cruzamento de dados",
    icon: Target,
    to: "/metas",
    filhos: [],
  },
  {
    label: "Manutenção",
    hint: "Instalador e arquivos",
    icon: Wrench,
    to: "/manutencao",
    filhos: [],
  },
  {
    label: "Configurações",
    hint: "Base de dados",
    icon: Settings,
    to: "/configuracoes",
    filhos: ["Rendimentos", "Despesas", "Gerais", "Investimentos"].flatMap((secao) => [
      { label: secao, titulo: true },
      ...SESSOES_CADASTRO.filter((s) => s.secao === secao).map((s) => ({
        label: s.rotulo,
        to: "/configuracoes",
        search: { sessao: s.id },
      })),
    ]),
  },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const hashAtual = useRouterState({ select: (s) => s.location.hash.replace(/^#/, "") });
  const [abertos, setAbertos] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const g of NAV) if (g.filhos.length && g.label !== "Configurações") o[g.label] = true;
    return o;
  });

  return (
    <nav className="flex flex-col gap-1" aria-label="Módulos">
      {NAV.map((item) => {
        const Icon = item.icon;
        const grupoAtivo = item.to
          ? pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to))
          : false;
        const aberto = abertos[item.label] ?? grupoAtivo;
        return (
          <div key={item.label}>
            <div className="flex items-center gap-0.5">
              {item.to ? (
                <Link
                  to={item.to}
                  onClick={onNavigate}
                  className={cn(
                    "flex min-h-10 min-w-0 flex-1 items-center gap-3 rounded-[12px] px-3 py-2 text-sm",
                    grupoAtivo ? "bg-accent/15 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", grupoAtivo ? "text-accent" : "text-subtle")} />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium leading-tight">{item.label}</span>
                    <span className="truncate text-[11px] text-subtle">{item.hint}</span>
                  </span>
                </Link>
              ) : null}
              {item.filhos.length ? (
                <button
                  type="button"
                  aria-label={`Abrir ${item.label}`}
                  className="flex size-8 items-center justify-center rounded-md text-subtle hover:bg-surface-2"
                  onClick={() => setAbertos((s) => ({ ...s, [item.label]: !aberto }))}
                >
                  <ChevronDown className={cn("size-4 transition", aberto && "rotate-180")} />
                </button>
              ) : null}
            </div>
            {aberto && item.filhos.length ? (
              <div className="mb-1 ml-6 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2">
                {item.filhos.map((f) => {
                  if (f.titulo) {
                    return (
                      <p key={f.label} className="px-2 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">
                        {f.label}
                      </p>
                    );
                  }
                  const params = new URLSearchParams(search.replace(/^\?/, ""));
                  const href = `${f.to ?? ""}${f.search ? `?${new URLSearchParams(f.search).toString()}` : ""}${f.hash ? `#${f.hash}` : ""}`;
                  const ativo =
                    pathname === f.to &&
                    (f.hash
                      ? hashAtual === f.hash
                      : !f.search || Object.entries(f.search).every(([k, v]) => params.get(k) === v));
                  return (
                    <Link
                      key={href + f.label}
                      to={f.to ?? "/"}
                      search={f.search}
                      hash={f.hash}
                      onClick={onNavigate}
                      className={cn(
                        "rounded-md px-2 py-1.5 text-xs",
                        ativo ? "bg-accent/10 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                      )}
                    >
                      {f.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-1">
      <div
        className="cf-badge flex size-9 items-center justify-center rounded-[10px] bg-accent text-xs font-semibold tracking-tight text-accent-fg"
        aria-hidden
      >
        CF
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-tight">Controle Financeiro</p>
        <p className="truncate whitespace-nowrap text-[11px] text-subtle">v{APP_VERSAO} · local · SQLite</p>
      </div>
    </div>
  );
}

function textoMercado(s: StatusMercado): string {
  if (s.rodando) return "Atualizando mercado…";
  if (!s.ultimaIso) return "Mercado · auto 10 min";
  const t = Date.parse(s.ultimaIso);
  if (!Number.isFinite(t)) return "Mercado · auto 10 min";
  const min = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (min < 1) return "Mercado · agora";
  if (min === 1) return "Mercado · há 1 min";
  return `Mercado · há ${min} min`;
}

function ChipMercado() {
  const [s, setS] = useState<StatusMercado | null>(null);
  useEffect(() => onStatusMercado(setS), []);
  if (!s) return null;
  return (
    <p className="px-3 pt-2 text-[11px] text-subtle" title={s.detalhe ?? undefined}>
      {textoMercado(s)}
      {s.erro ? <span className="mt-1 block text-warn">{s.erro}</span> : null}
    </p>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    setAberto(false);
  }, [pathname]);

  useEffect(() => {
    iniciarAtualizacaoAutomatica();
    void sincronizarAoAbrir();
    iniciarChecagemUpdate();
  }, []);

  return (
    <PeriodoProvider>
      <MercadoProvider>
      <div className="cf-shell min-h-dvh bg-bg text-fg">
        <aside className="cf-aside hidden w-[280px] flex-col md:flex">
          <Brand />
          <div className="mt-6 flex-1 overflow-y-auto">
            <NavLinks />
          </div>
          <ChipMercado />
          <ChipSync />
          <ChipUpdate />
          <LoginSupabase />
        </aside>

        <header className="cf-mobile-header md:hidden">
          <Button
            variant="secondary"
            size="icon"
            aria-label={aberto ? "Fechar menu" : "Abrir menu"}
            onClick={() => setAberto((v) => !v)}
          >
            {aberto ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
          <Brand />
        </header>

        {aberto ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/50"
              aria-label="Fechar menu"
              onClick={() => setAberto(false)}
            />
            <div className="absolute inset-y-0 left-0 flex w-[min(300px,88vw)] flex-col bg-bg px-3 py-4 shadow-[var(--shadow-card)]">
              <Brand />
              <div className="mt-6 flex-1 overflow-y-auto">
                <NavLinks onNavigate={() => setAberto(false)} />
              </div>
              <ChipMercado />
              <ChipSync />
              <ChipUpdate />
              <LoginSupabase />
            </div>
          </div>
        ) : null}

        <main className="cf-main md:pl-[280px]">
          <div className="px-4 py-6 sm:px-6 lg:px-8">
            <FiltroPeriodo />
            {children}
          </div>
        </main>
      </div>
      </MercadoProvider>
    </PeriodoProvider>
  );
}
