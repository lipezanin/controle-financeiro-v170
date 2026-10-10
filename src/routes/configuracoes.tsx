import { createFileRoute } from "@tanstack/react-router";
import { ConfiguracoesBase } from "@/components/configuracoes-base";
import { SectionTitle } from "@/components/section-title";

export const Route = createFileRoute("/configuracoes")({
  component: Pagina,
});

function Pagina() {
  return (
    <div className="mx-auto max-w-6xl">
      <SectionTitle
        kicker="Configurações"
        title="Base de Dados"
        description="Cada sessão é uma tabela própria. Cadastre itens em linha — as listas suspensas dos lançamentos usam estes cadastros."
      />
      <ConfiguracoesBase />
    </div>
  );
}
