import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { criarConta, entrarComEmail, restaurarSessao, sairSupabase } from "@/lib/supabase/auth-cliente";
import { lerSessaoSupabase } from "@/lib/supabase/sessao";
import { sincronizarAgora } from "@/services/sync-service";

export function LoginSupabase() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [sessaoEmail, setSessaoEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    void restaurarSessao().then((s) => setSessaoEmail(s?.email ?? lerSessaoSupabase()?.email ?? null));
  }, []);

  async function depoisDoLogin() {
    setSessaoEmail(lerSessaoSupabase()?.email ?? email);
    setSenha("");
    await sincronizarAgora();
  }

  async function entrar() {
    setBusy(true);
    setMsg(null);
    try {
      await entrarComEmail(email, senha);
      await depoisDoLogin();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha no login");
    } finally {
      setBusy(false);
    }
  }

  async function cadastrar() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await criarConta(email, senha);
      if (r.precisaConfirmar) {
        setMsg("Conta criada. Confirme o e-mail no inbox e entre.");
        return;
      }
      await depoisDoLogin();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha no cadastro");
    } finally {
      setBusy(false);
    }
  }

  async function sair() {
    await sairSupabase();
    setSessaoEmail(null);
    setMsg("Sessão encerrada. Dados continuam neste dispositivo.");
  }

  if (sessaoEmail) {
    return (
      <div className="mt-2 rounded-[12px] border border-border bg-surface px-3 py-2 text-[11px]">
        <p className="truncate text-muted">{sessaoEmail}</p>
        <Button variant="secondary" size="sm" className="mt-2 h-8 w-full text-[11px]" onClick={() => void sair()}>
          Sair do espelho
        </Button>
      </div>
    );
  }

  if (!aberto) {
    return (
      <button
        type="button"
        className="mt-2 w-full rounded-[12px] border border-border bg-surface px-3 py-2 text-left text-[11px] text-muted hover:text-fg"
        onClick={() => setAberto(true)}
      >
        Espelho na nuvem (opcional)
      </button>
    );
  }

  return (
    <form
      className="mt-2 space-y-2 rounded-[12px] border border-border bg-surface px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        void entrar();
      }}
    >
      <p className="text-[11px] font-medium text-muted">Espelho na nuvem (opcional)</p>
      <input
        type="email"
        required
        placeholder="e-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-8 w-full rounded-md border border-input-border bg-input px-2 text-[12px] text-fg"
      />
      <input
        type="password"
        required
        minLength={6}
        placeholder="senha"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        className="h-8 w-full rounded-md border border-input-border bg-input px-2 text-[12px] text-fg"
      />
      <div className="flex gap-1">
        <Button type="submit" size="sm" className="h-8 flex-1 text-[11px]" disabled={busy}>
          Entrar
        </Button>
        <Button type="button" variant="secondary" size="sm" className="h-8 flex-1 text-[11px]" disabled={busy} onClick={() => void cadastrar()}>
          Criar
        </Button>
      </div>
      <button type="button" className="text-[11px] text-subtle" onClick={() => setAberto(false)}>
        Fechar
      </button>
      {msg ? <p className="text-[11px] text-warn">{msg}</p> : null}
    </form>
  );
}
