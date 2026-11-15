import { useEffect, useRef, useState } from "react";
import { buscarTickers, type HitTicker } from "@/services/ticker-catalogo-service";

const campo =
  "h-9 w-full rounded-md border border-input-border bg-input px-2 text-[12px] text-fg";

export function TickerCampo({
  value,
  onChange,
  onCategoria,
  name,
  required,
}: {
  value: string;
  onChange: (ticker: string) => void;
  onCategoria?: (categoria: string) => void;
  name?: string;
  required?: boolean;
}) {
  const [hits, setHits] = useState<HitTicker[]>([]);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      void buscarTickers(q)
        .then((lista) => {
          setHits(lista);
          setAberto(lista.length > 0);
        })
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div className="relative" ref={caixa}>
      <input
        name={name}
        required={required}
        className={campo}
        value={value}
        autoComplete="off"
        placeholder="Ticker"
        onChange={(e) => {
          onChange(e.target.value.toUpperCase());
          setAberto(true);
        }}
        onFocus={() => hits.length && setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 180)}
      />
      {aberto && hits.length ? (
        <ul className="absolute z-30 mt-1 max-h-56 w-72 overflow-auto rounded-md border border-border bg-surface text-left shadow-lg">
          {hits.map((h) => (
            <li key={h.symbol}>
              <button
                type="button"
                className="block w-full px-2 py-1.5 text-left hover:bg-surface-2"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(h.symbol);
                  onCategoria?.(h.categoria);
                  setAberto(false);
                }}
              >
                <span className="font-mono text-[12px] text-fg">{h.symbol}</span>
                <span className="ml-2 text-[11px] text-muted">{h.categoria}</span>
                <span className="block truncate text-[11px] text-subtle">{h.nome}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
