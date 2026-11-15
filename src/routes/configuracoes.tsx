import { createFileRoute } from "@tanstack/react-router";
import { ConfiguracoesBase } from "@/components/configuracoes-base";
import { SectionTitle } from "@/components/section-title";
import { SESSOES_CADASTRO } from "@/lib/financeiro/cadastros-def";

export const Route = createFileRoute("/configuracoes")({
  validateSearch: (s: Record<string, unknown>) => ({
    sessao: typeof s.sessao === "string" ? s.sessao : "",
  }),
  component: Pagina,
});

function Pagina() {
  const { sessao } = Route.useSearch();
  const atual = SESSOES_CADASTRO.find((s) => s.id === sessao) ?? SESSOES_CADASTRO[0]!;
  return (
    <div className="mx-auto max-w-6xl">
      <SectionTitle
        kicker={atual.secao}
        title={atual.rotulo}
        description={`${atual.descricao} Usado em: ${atual.usadoEm}.`}
      />
      <ConfiguracoesBase key={atual.id} sessaoId={atual.id} />
    </div>
  );
}