import { useEffect, useState } from "react";
import { listarContas, type Conta } from "@/services/contas-service";

const campo = "mt-1 h-10 w-full rounded-md border border-input-border bg-input px-2 text-sm text-fg";

export function SelectConta({
  value,
  onChange,
  moeda,
  semPadrao = false,
}: {
  value: number;
  onChange: (id: number, conta: Conta | null) => void;
  moeda?: string;
  semPadrao?: boolean;
}) {
  const [contas, setContas] = useState<Conta[]>([]);

  useEffect(() => {
    void listarContas().then((lista) => {
      const ativas = lista.filter((c) => c.status === "ativa" && (!moeda || c.moeda === moeda));
      setContas(ativas);
      if (!semPadrao && !value && ativas[0]) onChange(ativas[0].id, ativas[0]);
    });
  }, [moeda, onChange, semPadrao, value]);

  return (
    <select className={campo} value={value || ""} onChange={(e) => {
      const id = Number(e.target.value);
      onChange(id, contas.find((c) => c.id === id) ?? null);
    }} required>
      <option value="">Escolha a conta</option>
      {contas.map((c) => (
        <option key={c.id} value={c.id}>
          {c.apelido} · {c.moeda}
        </option>
      ))}
    </select>
  );
}
