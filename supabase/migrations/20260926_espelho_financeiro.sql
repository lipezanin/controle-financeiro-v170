-- Espelho PostgreSQL do SQLite local (controle financeiro).
-- Projeto: wnhytbojvaiamlofkaoe
-- Aplicar no SQL Editor do Supabase (MCP/service_role). A chave anon NÃO executa DDL.
-- RLS: cada linha pertence a auth.uid(). Anon não lê nada.

create extension if not exists pgcrypto;

create or replace function public.cf_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Colunas de sync repetidas em toda tabela de dados:
--   user_id      uuid  dono (auth.users)
--   local_id     bigint id do SQLite neste dispositivo
--   updated_at   timestamptz
--   device_id    text
--   sync_status  synced | pending | conflict
--   deleted_at   timestamptz  (soft delete)

create table if not exists public.perfis (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  device_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.cf_cria_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists cf_cria_perfil on auth.users;
create trigger cf_cria_perfil
  after insert on auth.users
  for each row execute function public.cf_cria_perfil();

create table if not exists public.configuracoes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chave text not null,
  valor text not null,
  updated_at timestamptz not null default now(),
  device_id text,
  sync_status text not null default 'pending' check (sync_status in ('synced', 'pending', 'conflict')),
  deleted_at timestamptz,
  primary key (user_id, chave)
);

create table if not exists public.indicadores (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chave text not null,
  valor double precision,
  unidade text,
  atualizado_em text,
  updated_at timestamptz not null default now(),
  device_id text,
  sync_status text not null default 'pending' check (sync_status in ('synced', 'pending', 'conflict')),
  deleted_at timestamptz,
  primary key (user_id, chave)
);

create table if not exists public.cadastros (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_id bigint not null,
  grupo text not null,
  valor text not null,
  ordem integer not null default 0,
  updated_at timestamptz not null default now(),
  device_id text,
  sync_status text not null default 'pending' check (sync_status in ('synced', 'pending', 'conflict')),
  deleted_at timestamptz,
  primary key (user_id, local_id),
  unique (user_id, grupo, valor)
);

create table if not exists public.tipos_rendimento (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_id bigint not null,
  nome text not null,
  origem text not null,
  categoria text not null,
  tributacao text not null,
  forma_recolhimento text not null,
  classificacao_irpfm text not null,
  updated_at timestamptz not null default now(),
  device_id text,
  sync_status text not null default 'pending' check (sync_status in ('synced', 'pending', 'conflict')),
  deleted_at timestamptz,
  primary key (user_id, local_id),
  unique (user_id, nome)
);

create table if not exists public.mapeamento_fiscal (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  categoria text not null,
  grupo_fiscal text not null,
  classif_irpfm_gc text not null,
  forma_recolhimento_gc text not null,
  aliquota_padrao double precision not null default 0,
  isencao_20k integer not null default 0,
  updated_at timestamptz not null default now(),
  device_id text,
  sync_status text not null default 'pending' check (sync_status in ('synced', 'pending', 'conflict')),
  deleted_at timestamptz,
  primary key (user_id, categoria)
);

create table if not exists public.ativos (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_id bigint not null,
  ticker text not null,
  nome text,
  categoria text not null,
  emissor text,
  liquidez text,
  moeda text not null default 'BRL',
  observacao text,
  updated_at timestamptz not null default now(),
  device_id text,
  sync_status text not null default 'pending' check (sync_status in ('synced', 'pending', 'conflict')),
  deleted_at timestamptz,
  primary key (user_id, local_id),
  unique (user_id, ticker, categoria)
);

create table if not exists public.transacoes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_id bigint not null,
  nota text,
  data text not null,
  tipo_operacao text not null,
  categoria text,
  ticker text,
  liquidez text,
  emissor text,
  instituicao text,
  instituicao_destino text,
  moeda text not null default 'BRL',
  origem text,
  quantidade double precision,
  proporcao_desdob double precision,
  fator_desdob double precision,
  valor_orig double precision,
  taxas_orig double precision default 0,
  valor_liq_orig double precision,
  cotacao double precision,
  valor_brl double precision,
  classif_irpfm text,
  forma_recolhimento text,
  qtd_anterior double precision,
  custo_ant_brl double precision,
  qtd_acumulada double precision,
  custo_acum_brl double precision,
  preco_medio_brl double precision,
  ganho_capital_brl double precision,
  ganho_capital_orig double precision,
  ganho_cambial double precision,
  observacao text,
  updated_at timestamptz not null default now(),
  device_id text,
  sync_status text not null default 'pending' check (sync_status in ('synced', 'pending', 'conflict')),
  deleted_at timestamptz,
  primary key (user_id, local_id)
);

create index if not exists idx_cf_tx_data on public.transacoes (user_id, data);
create index if not exists idx_cf_tx_ticker on public.transacoes (user_id, ticker);

create table if not exists public.renda_fixa (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_id bigint not null,
  nome text,
  ticker text,
  tipo_movimento text,
  tipo_rf text,
  emissor text,
  instituicao text,
  indexador text,
  taxa double precision,
  data_aplicacao text,
  valor_aplicado double precision,
  prazo_dias integer,
  data_vencimento text,
  liquidez text,
  amortizacao text,
  isencao_ir integer not null default 0,
  irpfm text,
  status text not null default 'Ativo',
  data_resgate text,
  tipo_resgate text,
  valor_resgatado double precision,
  ir_pago double precision,
  valor_liq_recebido double precision,
  lancado_rendimentos integer not null default 0,
  valor_mercado double precision,
  atualizado_em text,
  fonte_atualizacao text,
  qtd_tesouro double precision,
  pu_atual double precision,
  updated_at timestamptz not null default now(),
  device_id text,
  sync_status text not null default 'pending' check (sync_status in ('synced', 'pending', 'conflict')),
  deleted_at timestamptz,
  primary key (user_id, local_id)
);

create table if not exists public.rendimentos (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_id bigint not null,
  data text not null,
  tipo text,
  origem text,
  categoria text,
  tributacao text,
  forma_recolhimento text,
  classificacao_irpfm text,
  instituicao text,
  ticker text,
  descricao text,
  moeda text not null default 'BRL',
  valor_bruto_orig double precision,
  cotacao double precision,
  valor_bruto_brl double precision,
  ir_retido double precision not null default 0,
  valor_liquido double precision,
  valor_computavel_irpfm double precision,
  observacao text,
  updated_at timestamptz not null default now(),
  device_id text,
  sync_status text not null default 'pending' check (sync_status in ('synced', 'pending', 'conflict')),
  deleted_at timestamptz,
  primary key (user_id, local_id)
);

create index if not exists idx_cf_rend_data on public.rendimentos (user_id, data);

create table if not exists public.despesas (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_id bigint not null,
  data_vencimento text not null,
  categoria text,
  descricao text,
  instituicao text,
  valor double precision not null,
  data_pagamento text,
  situacao text,
  observacao text,
  updated_at timestamptz not null default now(),
  device_id text,
  sync_status text not null default 'pending' check (sync_status in ('synced', 'pending', 'conflict')),
  deleted_at timestamptz,
  primary key (user_id, local_id)
);

create table if not exists public.caixa_fisico (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_id bigint not null,
  data text not null,
  tipo text not null check (tipo in ('Depósito', 'Saque')),
  valor double precision not null,
  descricao text,
  observacao text,
  updated_at timestamptz not null default now(),
  device_id text,
  sync_status text not null default 'pending' check (sync_status in ('synced', 'pending', 'conflict')),
  deleted_at timestamptz,
  primary key (user_id, local_id)
);

create table if not exists public.posicoes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_id bigint not null,
  ticker text not null,
  categoria text not null,
  emissor text,
  liquidez text,
  quantidade double precision not null default 0,
  preco_medio double precision,
  preco_atual double precision,
  valor_investido double precision,
  valor_atual double precision,
  lucro_prejuizo double precision,
  lucro_pct double precision,
  proventos_liq double precision default 0,
  lucro_proventos double precision,
  ativa integer not null default 1,
  updated_at timestamptz not null default now(),
  device_id text,
  sync_status text not null default 'pending' check (sync_status in ('synced', 'pending', 'conflict')),
  deleted_at timestamptz,
  primary key (user_id, local_id),
  unique (user_id, ticker, categoria)
);

create table if not exists public.impostos_mensais (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_id bigint not null,
  ano integer not null,
  mes integer not null check (mes between 1 and 12),
  dist_lucros double precision not null default 0,
  demais_computaveis double precision not null default 0,
  gc_obrigatorio double precision not null default 0,
  base_mensal double precision not null default 0,
  base_acumulada double precision not null default 0,
  credito_rendimentos double precision not null default 0,
  credito_darf_gc double precision not null default 0,
  credito_mensal double precision not null default 0,
  credito_acumulado double precision not null default 0,
  aliquota_efetiva double precision not null default 0,
  imposto_teorico double precision not null default 0,
  escudo_fiscal double precision not null default 0,
  teto_adicional double precision not null default 0,
  updated_at timestamptz not null default now(),
  device_id text,
  sync_status text not null default 'pending' check (sync_status in ('synced', 'pending', 'conflict')),
  deleted_at timestamptz,
  primary key (user_id, local_id),
  unique (user_id, ano, mes)
);

create table if not exists public.darf_gc (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_id bigint not null,
  ano integer not null,
  mes integer not null check (mes between 1 and 12),
  codigo text not null default '6015',
  vendas_rv double precision not null default 0,
  gc_apurado double precision not null default 0,
  isento integer not null default 0,
  imposto double precision not null default 0,
  pago integer not null default 0,
  data_pagamento text,
  updated_at timestamptz not null default now(),
  device_id text,
  sync_status text not null default 'pending' check (sync_status in ('synced', 'pending', 'conflict')),
  deleted_at timestamptz,
  primary key (user_id, local_id),
  unique (user_id, ano, mes)
);

create table if not exists public.cotacoes_ativos (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ticker text not null,
  preco double precision not null,
  moeda text not null default 'BRL',
  fonte text,
  data_preco text,
  atualizado_em text,
  updated_at timestamptz not null default now(),
  device_id text,
  sync_status text not null default 'pending' check (sync_status in ('synced', 'pending', 'conflict')),
  deleted_at timestamptz,
  primary key (user_id, ticker)
);

create table if not exists public.cotacoes_cambio (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data text not null,
  moeda text not null,
  cotacao_compra double precision,
  cotacao_venda double precision not null,
  fonte text,
  updated_at timestamptz not null default now(),
  device_id text,
  sync_status text not null default 'pending' check (sync_status in ('synced', 'pending', 'conflict')),
  deleted_at timestamptz,
  primary key (user_id, data, moeda)
);

create table if not exists public.snapshots_patrimonio (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data text not null,
  custo double precision,
  mercado double precision,
  caixa double precision,
  updated_at timestamptz not null default now(),
  device_id text,
  sync_status text not null default 'pending' check (sync_status in ('synced', 'pending', 'conflict')),
  deleted_at timestamptz,
  primary key (user_id, data)
);

-- RLS: dono só vê as próprias linhas. Anon zerado.
do $$
declare
  t text;
begin
  foreach t in array array[
    'perfis','configuracoes','indicadores','cadastros','tipos_rendimento','mapeamento_fiscal',
    'ativos','transacoes','renda_fixa','rendimentos','despesas','caixa_fisico','posicoes',
    'impostos_mensais','darf_gc','cotacoes_ativos','cotacoes_cambio','snapshots_patrimonio'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists cf_select_own on public.%I', t);
    execute format('drop policy if exists cf_insert_own on public.%I', t);
    execute format('drop policy if exists cf_update_own on public.%I', t);
    execute format('drop policy if exists cf_delete_own on public.%I', t);
    if t = 'perfis' then
      execute 'create policy cf_select_own on public.perfis for select to authenticated using (auth.uid() = user_id)';
      execute 'create policy cf_insert_own on public.perfis for insert to authenticated with check (auth.uid() = user_id)';
      execute 'create policy cf_update_own on public.perfis for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)';
    else
      execute format('create policy cf_select_own on public.%I for select to authenticated using (auth.uid() = user_id and deleted_at is null)', t);
      execute format('create policy cf_insert_own on public.%I for insert to authenticated with check (auth.uid() = user_id)', t);
      execute format('create policy cf_update_own on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
      execute format('create policy cf_delete_own on public.%I for delete to authenticated using (auth.uid() = user_id)', t);
    end if;
  end loop;
end;
$$;

grant usage on schema public to authenticated;
