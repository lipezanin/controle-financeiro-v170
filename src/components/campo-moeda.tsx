import { formatNumeroBR, parseNumeroBR } from "@/utils/numeros-br";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (texto: string) => void;
  name?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
};

/** Campo de valor no padrão BR (1.234,56). */
export function CampoMoeda({
  value,
  onChange,
  name,
  required,
  placeholder = "1.234,56",
  className,
  id,
}: Props) {
  return (
    <input
      id={id}
      name={name}
      inputMode="decimal"
      required={required}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        const n = parseNumeroBR(value);
        if (value.trim()) onChange(formatNumeroBR(n));
      }}
      className={cn(
        "h-11 rounded-md border border-input-border bg-input px-3 font-mono text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
        className,
      )}
    />
  );
}

export function numeroDoCampo(texto: string): number {
  return parseNumeroBR(texto);
}
