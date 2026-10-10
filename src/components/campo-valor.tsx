import { cn } from "@/lib/utils";
import { formatNumeroBR, mascararMoedaBR, mascararQuantidadeBR, parseNumeroBR } from "@/utils/numeros-br";

type Props = {
  value: string;
  onChange: (texto: string) => void;
  name?: string;
  required?: boolean;
  className?: string;
  placeholder?: string;
  /** moeda = 2 casas com milhar; qtd = até `casas` decimais. */
  modo?: "moeda" | "qtd";
  casas?: number;
};

const CLS =
  "h-11 w-full rounded-md border border-input-border bg-input px-3 font-mono text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent/70";

/** Campo numérico no padrão BR (1.234,56). */
export function CampoValor({
  value,
  onChange,
  name,
  required,
  className,
  placeholder,
  modo = "moeda",
  casas,
}: Props) {
  const nCasas = casas ?? (modo === "qtd" ? 6 : 2);
  return (
    <input
      name={name}
      required={required}
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder ?? (modo === "qtd" ? "0,055711" : "0,00")}
      value={value}
      className={cn(CLS, className)}
      onChange={(e) => {
        const v = e.target.value;
        if (modo === "moeda") onChange(mascararMoedaBR(v, nCasas));
        else onChange(v.replace(/[^\d.,-]/g, ""));
      }}
      onBlur={() => {
        const n = parseNumeroBR(value);
        if (!value.trim()) return;
        onChange(modo === "moeda" ? mascararMoedaBR(value, nCasas) : mascararQuantidadeBR(value, nCasas) || formatNumeroBR(n, Math.min(nCasas, 6)));
      }}
    />
  );
}
