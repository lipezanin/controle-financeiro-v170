-- Alinha o Supabase com o SQLite do aplicativo.
-- Idempotente: pode rodar de novo. A chave anon NÃO executa isto.
-- SQL Editor do projeto wnhytbojvaiamlofkaoe → Run.
-- No fim recarrega o cache do PostgREST (senão o app continua vendo o schema velho).

create sequence if not exists public.cf_local_id_seq;

-- Tabelas que o app espelha e que podem nem existir na nuvem.
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
  sync_status text not null default 'synced',
  deleted_at timestamptz,
  primary key (user_id, categoria)
);

create table if not exists public.cotacoes_ativos (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ticker text not null,
  preco double precision not null,
  moeda text not null default 'BRL',
  fonte text,
  data_preco text,
  atualizado_em text,
  dividend_yield double precision,
  updated_at timestamptz not null default now(),
  device_id text,
  sync_status text not null default 'synced',
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
  sync_status text not null default 'synced',
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
  sync_status text not null default 'synced',
  deleted_at timestamptz,
  primary key (user_id, data)
);

-- Colunas de controle em toda tabela já criada (versões antigas não tinham).
do $$
declare
  t text;
begin
  foreach t in array array[
    'configuracoes','indicadores','cadastros','tipos_rendimento','mapeamento_fiscal',
    'ativos','transacoes','renda_fixa','rendimentos','despesas','caixa_fisico','posicoes',
    'impostos_mensais','darf_gc','cotacoes_ativos','cotacoes_cambio','snapshots_patrimonio'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('alter table public.%I add column if not exists user_id uuid', t);
    execute format('alter table public.%I add column if not exists updated_at timestamptz default now()', t);
    execute format('alter table public.%I add column if not exists device_id text', t);
    execute format('alter table public.%I add column if not exists sync_status text default ''synced''', t);
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);
  end loop;
end $$;

-- local_id = id do SQLite. Sem ele o upsert não acha a mesma linha.
do $$
declare
  t text;
begin
  foreach t in array array[
    'cadastros','tipos_rendimento','ativos','transacoes','renda_fixa',
    'rendimentos','despesas','caixa_fisico','posicoes','impostos_mensais','darf_gc'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('alter table public.%I add column if not exists local_id bigint', t);
    execute format(
      'update public.%I set local_id = nextval(''public.cf_local_id_seq'') where local_id is null',
      t
    );
  end loop;
end $$;

-- cadastros
alter table if exists public.cadastros add column if not exists grupo text;
alter table if exists public.cadastros add column if not exists valor text;
alter table if exists public.cadastros add column if not exists ordem integer default 0;

-- tipos de rendimento
alter table if exists public.tipos_rendimento add column if not exists nome text;
alter table if exists public.tipos_rendimento add column if not exists origem text;
alter table if exists public.tipos_rendimento add column if not exists categoria text;
alter table if exists public.tipos_rendimento add column if not exists tributacao text;
alter table if exists public.tipos_rendimento add column if not exists forma_recolhimento text;
alter table if exists public.tipos_rendimento add column if not exists classificacao_irpfm text;

-- mapeamento fiscal
alter table if exists public.mapeamento_fiscal add column if not exists categoria text;
alter table if exists public.mapeamento_fiscal add column if not exists grupo_fiscal text;
alter table if exists public.mapeamento_fiscal add column if not exists classif_irpfm_gc text;
alter table if exists public.mapeamento_fiscal add column if not exists forma_recolhimento_gc text;
alter table if exists public.mapeamento_fiscal add column if not exists aliquota_padrao double precision default 0;
alter table if exists public.mapeamento_fiscal add column if not exists isencao_20k integer default 0;

-- ativos
alter table if exists public.ativos add column if not exists ticker text;
alter table if exists public.ativos add column if not exists nome text;
alter table if exists public.ativos add column if not exists categoria text;
alter table if exists public.ativos add column if not exists emissor text;
alter table if exists public.ativos add column if not exists liquidez text;
alter table if exists public.ativos add column if not exists moeda text default 'BRL';
alter table if exists public.ativos add column if not exists observacao text;

-- transacoes (livro-razão, inclusive campos internacionais e de custo)
alter table if exists public.transacoes add column if not exists nota text;
alter table if exists public.transacoes add column if not exists data text;
alter table if exists public.transacoes add column if not exists tipo_operacao text;
alter table if exists public.transacoes add column if not exists categoria text;
alter table if exists public.transacoes add column if not exists ticker text;
alter table if exists public.transacoes add column if not exists liquidez text;
alter table if exists public.transacoes add column if not exists emissor text;
alter table if exists public.transacoes add column if not exists instituicao text;
alter table if exists public.transacoes add column if not exists instituicao_destino text;
alter table if exists public.transacoes add column if not exists moeda text default 'BRL';
alter table if exists public.transacoes add column if not exists origem text;
alter table if exists public.transacoes add column if not exists quantidade double precision;
alter table if exists public.transacoes add column if not exists proporcao_desdob double precision;
alter table if exists public.transacoes add column if not exists fator_desdob double precision;
alter table if exists public.transacoes add column if not exists valor_orig double precision;
alter table if exists public.transacoes add column if not exists taxas_orig double precision default 0;
alter table if exists public.transacoes add column if not exists valor_liq_orig double precision;
alter table if exists public.transacoes add column if not exists cotacao double precision;
alter table if exists public.transacoes add column if not exists valor_brl double precision;
alter table if exists public.transacoes add column if not exists classif_irpfm text;
alter table if exists public.transacoes add column if not exists forma_recolhimento text;
alter table if exists public.transacoes add column if not exists qtd_anterior double precision;
alter table if exists public.transacoes add column if not exists custo_ant_brl double precision;
alter table if exists public.transacoes add column if not exists qtd_acumulada double precision;
alter table if exists public.transacoes add column if not exists custo_acum_brl double precision;
alter table if exists public.transacoes add column if not exists preco_medio_brl double precision;
alter table if exists public.transacoes add column if not exists ganho_capital_brl double precision;
alter table if exists public.transacoes add column if not exists ganho_capital_orig double precision;
alter table if exists public.transacoes add column if not exists ganho_cambial double precision;
alter table if exists public.transacoes add column if not exists iof_brl double precision default 0;
alter table if exists public.transacoes add column if not exists spread_brl double precision default 0;
alter table if exists public.transacoes add column if not exists valor_usd double precision;
alter table if exists public.transacoes add column if not exists cotacao_efetiva double precision;
alter table if exists public.transacoes add column if not exists cotacao_ptax double precision;
alter table if exists public.transacoes add column if not exists custo_acum_usd double precision;
alter table if exists public.transacoes add column if not exists preco_medio_usd double precision;
alter table if exists public.transacoes add column if not exists observacao text;

-- renda fixa
alter table if exists public.renda_fixa add column if not exists nome text;
alter table if exists public.renda_fixa add column if not exists ticker text;
alter table if exists public.renda_fixa add column if not exists tipo_movimento text;
alter table if exists public.renda_fixa add column if not exists tipo_rf text;
alter table if exists public.renda_fixa add column if not exists emissor text;
alter table if exists public.renda_fixa add column if not exists instituicao text;
alter table if exists public.renda_fixa add column if not exists indexador text;
alter table if exists public.renda_fixa add column if not exists taxa double precision;
alter table if exists public.renda_fixa add column if not exists data_aplicacao text;
alter table if exists public.renda_fixa add column if not exists valor_aplicado double precision;
alter table if exists public.renda_fixa add column if not exists prazo_dias integer;
alter table if exists public.renda_fixa add column if not exists data_vencimento text;
alter table if exists public.renda_fixa add column if not exists liquidez text;
alter table if exists public.renda_fixa add column if not exists amortizacao text;
alter table if exists public.renda_fixa add column if not exists isencao_ir integer default 0;
alter table if exists public.renda_fixa add column if not exists irpfm text;
alter table if exists public.renda_fixa add column if not exists status text default 'Ativo';
alter table if exists public.renda_fixa add column if not exists data_resgate text;
alter table if exists public.renda_fixa add column if not exists tipo_resgate text;
alter table if exists public.renda_fixa add column if not exists valor_resgatado double precision;
alter table if exists public.renda_fixa add column if not exists ir_pago double precision;
alter table if exists public.renda_fixa add column if not exists valor_liq_recebido double precision;
alter table if exists public.renda_fixa add column if not exists lancado_rendimentos integer default 0;
alter table if exists public.renda_fixa add column if not exists valor_mercado double precision;
alter table if exists public.renda_fixa add column if not exists atualizado_em text;
alter table if exists public.renda_fixa add column if not exists fonte_atualizacao text;
alter table if exists public.renda_fixa add column if not exists qtd_tesouro double precision;
alter table if exists public.renda_fixa add column if not exists pu_atual double precision;
alter table if exists public.renda_fixa add column if not exists moeda text default 'BRL';
alter table if exists public.renda_fixa add column if not exists origem text default 'Nacional';
alter table if exists public.renda_fixa add column if not exists valor_usd double precision;
alter table if exists public.renda_fixa add column if not exists cotacao_efetiva double precision;
alter table if exists public.renda_fixa add column if not exists iof_brl double precision default 0;
alter table if exists public.renda_fixa add column if not exists spread_brl double precision default 0;

-- rendimentos
alter table if exists public.rendimentos add column if not exists data text;
alter table if exists public.rendimentos add column if not exists tipo text;
alter table if exists public.rendimentos add column if not exists origem text;
alter table if exists public.rendimentos add column if not exists categoria text;
alter table if exists public.rendimentos add column if not exists tributacao text;
alter table if exists public.rendimentos add column if not exists forma_recolhimento text;
alter table if exists public.rendimentos add column if not exists classificacao_irpfm text;
alter table if exists public.rendimentos add column if not exists instituicao text;
alter table if exists public.rendimentos add column if not exists ticker text;
alter table if exists public.rendimentos add column if not exists descricao text;
alter table if exists public.rendimentos add column if not exists moeda text default 'BRL';
alter table if exists public.rendimentos add column if not exists valor_bruto_orig double precision;
alter table if exists public.rendimentos add column if not exists cotacao double precision;
alter table if exists public.rendimentos add column if not exists valor_bruto_brl double precision;
alter table if exists public.rendimentos add column if not exists ir_retido double precision default 0;
alter table if exists public.rendimentos add column if not exists valor_liquido double precision;
alter table if exists public.rendimentos add column if not exists valor_computavel_irpfm double precision;
alter table if exists public.rendimentos add column if not exists observacao text;

-- despesas, caixa, posicoes, impostos, darf
alter table if exists public.despesas add column if not exists data_vencimento text;
alter table if exists public.despesas add column if not exists categoria text;
alter table if exists public.despesas add column if not exists descricao text;
alter table if exists public.despesas add column if not exists instituicao text;
alter table if exists public.despesas add column if not exists valor double precision;
alter table if exists public.despesas add column if not exists data_pagamento text;
alter table if exists public.despesas add column if not exists situacao text;
alter table if exists public.despesas add column if not exists observacao text;

alter table if exists public.caixa_fisico add column if not exists data text;
alter table if exists public.caixa_fisico add column if not exists tipo text;
alter table if exists public.caixa_fisico add column if not exists valor double precision;
alter table if exists public.caixa_fisico add column if not exists descricao text;
alter table if exists public.caixa_fisico add column if not exists observacao text;

alter table if exists public.posicoes add column if not exists ticker text;
alter table if exists public.posicoes add column if not exists categoria text;
alter table if exists public.posicoes add column if not exists emissor text;
alter table if exists public.posicoes add column if not exists liquidez text;
alter table if exists public.posicoes add column if not exists quantidade double precision default 0;
alter table if exists public.posicoes add column if not exists preco_medio double precision;
alter table if exists public.posicoes add column if not exists preco_atual double precision;
alter table if exists public.posicoes add column if not exists valor_investido double precision;
alter table if exists public.posicoes add column if not exists valor_atual double precision;
alter table if exists public.posicoes add column if not exists lucro_prejuizo double precision;
alter table if exists public.posicoes add column if not exists lucro_pct double precision;
alter table if exists public.posicoes add column if not exists proventos_liq double precision default 0;
alter table if exists public.posicoes add column if not exists lucro_proventos double precision;
alter table if exists public.posicoes add column if not exists ativa integer default 1;

alter table if exists public.impostos_mensais add column if not exists ano integer;
alter table if exists public.impostos_mensais add column if not exists mes integer;
alter table if exists public.impostos_mensais add column if not exists dist_lucros double precision default 0;
alter table if exists public.impostos_mensais add column if not exists demais_computaveis double precision default 0;
alter table if exists public.impostos_mensais add column if not exists gc_obrigatorio double precision default 0;
alter table if exists public.impostos_mensais add column if not exists base_mensal double precision default 0;
alter table if exists public.impostos_mensais add column if not exists base_acumulada double precision default 0;
alter table if exists public.impostos_mensais add column if not exists credito_rendimentos double precision default 0;
alter table if exists public.impostos_mensais add column if not exists credito_darf_gc double precision default 0;
alter table if exists public.impostos_mensais add column if not exists credito_mensal double precision default 0;
alter table if exists public.impostos_mensais add column if not exists credito_acumulado double precision default 0;
alter table if exists public.impostos_mensais add column if not exists aliquota_efetiva double precision default 0;
alter table if exists public.impostos_mensais add column if not exists imposto_teorico double precision default 0;
alter table if exists public.impostos_mensais add column if not exists escudo_fiscal double precision default 0;
alter table if exists public.impostos_mensais add column if not exists teto_adicional double precision default 0;

alter table if exists public.darf_gc add column if not exists ano integer;
alter table if exists public.darf_gc add column if not exists mes integer;
alter table if exists public.darf_gc add column if not exists codigo text default '6015';
alter table if exists public.darf_gc add column if not exists vendas_rv double precision default 0;
alter table if exists public.darf_gc add column if not exists gc_apurado double precision default 0;
alter table if exists public.darf_gc add column if not exists isento integer default 0;
alter table if exists public.darf_gc add column if not exists imposto double precision default 0;
alter table if exists public.darf_gc add column if not exists pago integer default 0;
alter table if exists public.darf_gc add column if not exists data_pagamento text;

alter table if exists public.cotacoes_ativos add column if not exists dividend_yield double precision;
alter table if exists public.cotacoes_ativos add column if not exists preco double precision;
alter table if exists public.cotacoes_ativos add column if not exists moeda text;
alter table if exists public.cotacoes_ativos add column if not exists fonte text;
alter table if exists public.cotacoes_ativos add column if not exists data_preco text;
alter table if exists public.cotacoes_ativos add column if not exists atualizado_em text;

alter table if exists public.configuracoes add column if not exists chave text;
alter table if exists public.configuracoes add column if not exists valor text;
alter table if exists public.indicadores add column if not exists chave text;
alter table if exists public.indicadores add column if not exists valor double precision;
alter table if exists public.indicadores add column if not exists unidade text;
alter table if exists public.indicadores add column if not exists atualizado_em text;

-- Remove cópias da mesma linha (o espelho antigo gravou duas vezes).
-- Fica a mais recente. O aplicativo local continua sendo a origem e reenvia o dado certo.
do $$
declare
  t text;
  cols text;
begin
  for t, cols in
    select * from (values
      ('cadastros', 'user_id, local_id'),
      ('tipos_rendimento', 'user_id, local_id'),
      ('ativos', 'user_id, local_id'),
      ('transacoes', 'user_id, local_id'),
      ('renda_fixa', 'user_id, local_id'),
      ('rendimentos', 'user_id, local_id'),
      ('despesas', 'user_id, local_id'),
      ('caixa_fisico', 'user_id, local_id'),
      ('posicoes', 'user_id, local_id'),
      ('impostos_mensais', 'user_id, local_id'),
      ('darf_gc', 'user_id, local_id'),
      ('cadastros', 'user_id, grupo, valor'),
      ('tipos_rendimento', 'user_id, nome'),
      ('configuracoes', 'user_id, chave'),
      ('indicadores', 'user_id, chave'),
      ('mapeamento_fiscal', 'user_id, categoria'),
      ('cotacoes_ativos', 'user_id, ticker'),
      ('cotacoes_cambio', 'user_id, data, moeda'),
      ('snapshots_patrimonio', 'user_id, data')
    ) as v(tabela, chave)
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format($f$
      delete from public.%1$I
      where ctid in (
        select ctid from (
          select ctid,
                 row_number() over (
                   partition by %2$s
                   order by updated_at desc nulls last, ctid desc
                 ) as n
          from public.%1$I
        ) d
        where d.n > 1
      )
    $f$, t, cols);
  end loop;
end $$;

-- Chaves que o app usa no upsert (ON CONFLICT).
create unique index if not exists cadastros_user_local_uidx on public.cadastros (user_id, local_id);
create unique index if not exists cadastros_user_grupo_valor_uidx on public.cadastros (user_id, grupo, valor);
create unique index if not exists tipos_rendimento_user_local_uidx on public.tipos_rendimento (user_id, local_id);
create unique index if not exists tipos_rendimento_user_nome_uidx on public.tipos_rendimento (user_id, nome);
create unique index if not exists ativos_user_local_uidx on public.ativos (user_id, local_id);
create unique index if not exists transacoes_user_local_uidx on public.transacoes (user_id, local_id);
create unique index if not exists renda_fixa_user_local_uidx on public.renda_fixa (user_id, local_id);
create unique index if not exists rendimentos_user_local_uidx on public.rendimentos (user_id, local_id);
create unique index if not exists despesas_user_local_uidx on public.despesas (user_id, local_id);
create unique index if not exists caixa_user_local_uidx on public.caixa_fisico (user_id, local_id);
create unique index if not exists posicoes_user_local_uidx on public.posicoes (user_id, local_id);
create unique index if not exists impostos_user_local_uidx on public.impostos_mensais (user_id, local_id);
create unique index if not exists darf_user_local_uidx on public.darf_gc (user_id, local_id);
create unique index if not exists configuracoes_user_chave_uidx on public.configuracoes (user_id, chave);
create unique index if not exists indicadores_user_chave_uidx on public.indicadores (user_id, chave);
create unique index if not exists map_fiscal_user_cat_uidx on public.mapeamento_fiscal (user_id, categoria);
create unique index if not exists cotacoes_ativos_user_ticker_uidx on public.cotacoes_ativos (user_id, ticker);
create unique index if not exists cambio_user_data_moeda_uidx on public.cotacoes_cambio (user_id, data, moeda);
create unique index if not exists snap_user_data_uidx on public.snapshots_patrimonio (user_id, data);

do $$
declare
  t text;
begin
  foreach t in array array[
    'configuracoes','indicadores','cadastros','tipos_rendimento','mapeamento_fiscal',
    'ativos','transacoes','renda_fixa','rendimentos','despesas','caixa_fisico','posicoes',
    'impostos_mensais','darf_gc','cotacoes_ativos','cotacoes_cambio','snapshots_patrimonio'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists cf_select_own on public.%I', t);
    execute format('drop policy if exists cf_insert_own on public.%I', t);
    execute format('drop policy if exists cf_update_own on public.%I', t);
    execute format('drop policy if exists cf_delete_own on public.%I', t);
    execute format('create policy cf_select_own on public.%I for select to authenticated using (auth.uid() = user_id)', t);
    execute format('create policy cf_insert_own on public.%I for insert to authenticated with check (auth.uid() = user_id)', t);
    execute format('create policy cf_update_own on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy cf_delete_own on public.%I for delete to authenticated using (auth.uid() = user_id)', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
