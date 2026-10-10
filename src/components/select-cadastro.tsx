import { useCadastroNomes } from "@/hooks/use-cadastro";
import { cn } from "@/lib/utils";

type Props = {
  sessao?: string;
  opcoes?: string[];
  value: string;
  onChange: (v: string) => void;
  name?: string;
  required?: boolean;
  className?: string;
  placeholder?: string;
  permitirVazio?: boolean;
};

/** Lista suspensa alimentada pela Base de Dados (nunca texto livre). */
export function SelectCadastro({
  sessao,
  opcoes,
  value,
  onChange,
  name,
  required,
  className,
  placeholder = "Selecionar…",
  permitirVazio,
}: Props) {
  const carregados = useCadastroNomes(sessao ?? "");
  const lista = opcoes ?? (sessao ? carregados : []);
  const extra = value && !lista.includes(value) ? [value] : [];
  const opts = [...extra, ...lista];

  return (
    <select
      name={name}
      required={required}
      className={cn(
        "h-9 w-full rounded-md border border-input-border bg-input px-2 text-sm text-fg",
        className,
      )}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {permitirVazio || !value ? (
        <option value="" disabled={required}>
          {placeholder}
        </option>
      ) : null}
      {opts.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
