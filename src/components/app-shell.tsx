import { Link, useRouterState } from "@tanstack/react-router";
import {
  Banknote,
  CandlestickChart,
  ChevronDown,
  Landmark,
  LayoutDashboard,
  Menu,
  PenLine,
  Percent,
  PieChart,
  Settings,
  Wallet,
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
import { cn } from "@/lib/utils";
import {
  iniciarAtualizacaoAutomatica,
  onStatusMercado,
  type StatusMercado,
} from "@/services/atualizacao-automatica-service";
import { sincronizarAoAbrir } from "@/services/sync-service";
import { iniciarChecagemUpdate } from "@/services/update-service";
import { atualizarPosicoes } from "@/services/cotacao-ativos-service";
import { atualizarRendaFixa } from "@/services/renda-fixa-service";
import { atualizarTaxas } from "@/services/taxas-service";

type Filho = {
  label: string;
  to?: string;
  search?: Record<string, string>;
  acao?: "posicoes" | "rf" | "taxas";
  hash?: string;
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
    label: "Investimentos",
    hint: "Carteira e análises",
    icon: CandlestickChart,
    to: "/investimentos",
    filhos: [
      { label: "Carteira ativa", to: "/investimentos", search: { aba: "ativa" } },
      { label: "Histórico / Inativa", to: "/investimentos", search: { aba: "inativa" } },
      { label: "Proventos recebidos", to: "/proventos" },
      { label: "Atualizar posições", acao: "posicoes" },
    ],
  },
  {
    label: "Renda fixa",
    hint: "CDB, LCA e Tesouro",
    icon: Percent,
    to: "/renda-fixa",
    filhos: [
      { label: "Títulos", to: "/renda-fixa" },
      { label: "Atualizar renda fixa", acao: "rf" },
    ],
  },
  {
    label: "Patrimônio",
    hint: "Composição e liquidez",
    icon: PieChart,
    to: "/patrimonio",
    filhos: [{ label: "Visão geral", to: "/patrimonio" }],
  },
  {
    label: "IRPF / IRPFM",
    hint: "Lei 15.270/2025",
    icon: Landmark,
    to: "/irpf",
    filhos: [
      { label: "Motor mensal", to: "/irpf" },
      { label: "Controle fiscal", to: "/irpf", hash: "fiscal" },
      { label: "Relatório ano-base", to: "/irpf", hash: "relatorio" },
    ],
  },
  {
    label: "Caixa físico",
    hint: "Espécie e conferência",
    icon: Banknote,
    to: "/caixa",
    filhos: [
      { label: "Extrato", to: "/caixa" },
      { label: "Conferência", to: "/caixa", hash: "conferencia" },
    ],
  },
  {
    label: "Financeiro",
    hint: "Fluxo e despesas",
    icon: Wallet,
    to: "/financeiro",
    filhos: [{ label: "Resumo", to: "/financeiro" }],
  },
  {
    label: "Lançamentos",
    hint: "Entrada de dados",
    icon: PenLine,
    to: "/lancamentos",
    filhos: [
      { label: "Nota de corretagem", to: "/lancamentos", search: { tipo: "nota" } },
      { label: "Extrato bancário", to: "/lancamentos", search: { tipo: "extrato" } },
      { label: "Imóvel", to: "/lancamentos", search: { tipo: "imovel" } },
      { label: "Transação avulsa", to: "/lancamentos", search: { tipo: "tx" } },
      { label: "Conta a pagar", to: "/lancamentos", search: { tipo: "desp" } },
      { label: "Conta a receber", to: "/lancamentos", search: { tipo: "rend" } },
      { label: "Caixa físico", to: "/lancamentos", search: { tipo: "caixa" } },
      { label: "Conferência", to: "/lancamentos", search: { tipo: "conferencia" } },
      { label: "Nota internacional", to: "/lancamentos", search: { tipo: "nota_int" } },
      { label: "Extrato internacional", to: "/lancamentos", search: { tipo: "extrato_int" } },
      { label: "RF internacional", to: "/lancamentos", search: { tipo: "rf_int" } },
      { label: "Avulsa internacional", to: "/lancamentos", search: { tipo: "tx_int" } },
    ],
  },
  {
    label: "Configurações",
    hint: "Base de dados",
    icon: Settings,
    to: "/configuracoes",
    filhos: [{ label: "Base de Dados", to: "/configuracoes" }],
  },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const [abertos, setAbertos] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const g of NAV) if (g.to && pathname.startsWith(g.to) && g.to !== "/") o[g.label] = true;
    if (pathname === "/lancamentos") {
      o["Lançamentos"] = true;
    }
    return o;
  });
  const [acaoMsg, setAcaoMsg] = useState<string | null>(null);

  async function runAcao(acao: Filho["acao"]) {
    setAcaoMsg("Atualizando…");
    try {
      if (acao === "posicoes") {
        const r = await atualizarPosicoes();
        setAcaoMsg(`${r.ok} cotações (${r.fonte})`);
      } else if (acao === "rf") {
        const r = await atualizarRendaFixa();
        setAcaoMsg(`${r.atualizados} títulos · ${r.fonte}`);
      } else if (acao === "taxas") {
        await atualizarTaxas();
        setAcaoMsg("Taxas SGS atualizadas");
      }
    } catch (e) {
      setAcaoMsg(e instanceof Error ? e.message : "Falha");
    }
  }

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
                  if (f.acao) {
                    return (
                      <button
                        key={f.label}
                        type="button"
                        className="rounded-md px-2 py-1.5 text-left text-xs text-muted hover:bg-surface-2 hover:text-fg"
                        onClick={() => void runAcao(f.acao)}
                      >
                        {f.label}
                      </button>
                    );
                  }
                  const href = `${f.to ?? ""}${f.search ? `?${new URLSearchParams(f.search).toString()}` : ""}${f.hash ? `#${f.hash}` : ""}`;
                  const ativo =
                    pathname === f.to &&
                    (!f.search || search.includes(`${Object.keys(f.search)[0]}=${Object.values(f.search)[0]}`));
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
      {acaoMsg ? <p className="px-3 pt-2 text-[11px] text-subtle">{acaoMsg}</p> : null}
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
