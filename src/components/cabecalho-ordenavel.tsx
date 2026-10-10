import { type DirOrdem, rotuloOrdem } from "@/hooks/use-ordenacao";
import { cn } from "@/lib/utils";

export function CabecalhoOrdenavel<K extends string>({
  id,
  label,
  chave,
  dir,
  onToggle,
  align = "left",
}: {
  id: K;
  label: string;
  chave: K;
  dir: DirOrdem;
  onToggle: (k: K) => void;
  align?: "left" | "right";
}) {
  const ativo = chave === id;
  return (
    <th className={cn("px-2 py-2.5", align === "right" && "text-right")}>
      <button
        type="button"
        className={cn(
          "font-medium uppercase tracking-[0.12em]",
          ativo ? "text-fg" : "text-muted hover:text-fg",
        )}
        onClick={() => onToggle(id)}
      >
        {label}
        {rotuloOrdem(ativo, dir)}
      </button>
    </th>
  );
}
