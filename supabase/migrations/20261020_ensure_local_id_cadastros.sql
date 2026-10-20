-- Corrige PGRST204: Could not find the 'local_id' column of 'cadastros'
-- Aplicar no SQL Editor do Supabase (projeto do Controle Financeiro).
-- Idempotente: só cria o que faltar.

do $$
declare
  t text;
  tem boolean;
begin
  foreach t in array array[
    'cadastros','tipos_rendimento','ativos','transacoes','renda_fixa',
    'rendimentos','despesas','caixa_fisico','posicoes','impostos_mensais','darf_gc'
  ]
  loop
    select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) into tem;
    if not tem then
      raise notice 'tabela % ausente — rode 20260926_espelho_financeiro.sql primeiro', t;
      continue;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'local_id'
    ) then
      execute format('alter table public.%I add column local_id bigint', t);
      raise notice 'adicionou local_id em %', t;
    end if;

    -- Preenche local_id vazio com row_number por usuário (só onde estiver nulo)
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'local_id'
    ) then
      execute format($f$
        with n as (
          select ctid, row_number() over (partition by user_id order by ctid) as rn
          from public.%I
          where local_id is null
        )
        update public.%I t
        set local_id = n.rn
        from n
        where t.ctid = n.ctid
      $f$, t, t);
    end if;

    -- Unique (user_id, local_id) se ainda não existir
    if not exists (
      select 1 from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'public' and r.relname = t
        and c.contype in ('u','p')
        and pg_get_constraintdef(c.oid) ilike '%%(user_id, local_id)%%'
    ) then
      begin
        execute format(
          'alter table public.%I add constraint %I unique (user_id, local_id)',
          t, t || '_user_local_uidx'
        );
      exception when others then
        raise notice 'unique (user_id, local_id) em %: %', t, sqlerrm;
      end;
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
