import { cn } from "@/lib/utils";

export type DirSort = "asc" | "desc";

export function compararSort(a: unknown, b: unknown, dir: DirSort): number {
  const va = a == null || a === "" ? null : a;
  const vb = b == null || b === "" ? null : b;
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  const na = typeof va === "number" ? va : Number(va);
  const nb = typeof vb === "number" ? vb : Number(vb);
  let r = 0;
  if (Number.isFinite(na) && Number.isFinite(nb) && String(va).trim() !== "" && !/^[A-Za-zÀ-ú]/.test(String(va))) {
    r = na - nb;
  } else {
    r = String(va).localeCompare(String(vb), "pt-BR", { numeric: true, sensitivity: "base" });
  }
  return dir === "asc" ? r : -r;
}

export function ThSort({
  label,
  campo,
  atual,
  dir,
  onClick,
  className,
  align = "left",
}: {
  label: string;
  campo: string;
  atual: string | null;
  dir: DirSort;
  onClick: (campo: string) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const ativo = atual === campo;
  return (
    <th className={cn("px-2 py-2.5", align === "right" && "text-right", className)}>
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-[0.12em]",
          ativo ? "text-fg" : "text-muted hover:text-fg",
          align === "right" && "ml-auto",
        )}
        onClick={() => onClick(campo)}
      >
        {label}
        <span className="text-[10px]">{ativo ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}
