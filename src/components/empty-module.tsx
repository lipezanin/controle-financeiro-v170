import { SectionTitle } from "@/components/section-title";

export function EmptyModule({
  kicker,
  title,
  description,
  etapa,
}: {
  kicker: string;
  title: string;
  description: string;
  etapa: string;
}) {
  return (
    <div className="mx-auto max-w-5xl">
      <SectionTitle kicker={kicker} title={title} description={description} />
      <div className="rounded-[16px] border border-dashed border-border bg-surface/60 px-5 py-10 text-center">
        <p className="text-sm font-medium text-fg">Módulo em espera</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          A estrutura e a navegação já existem. A lógica deste módulo entra na{" "}
          <span className="text-fg">{etapa}</span>, depois da autorização.
        </p>
      </div>
    </div>
  );
}
