-- Garante UNIQUE para o upsert do espelho (erro 42P10).
-- A tabela pode ter sido criada só com PK em "chave" (sem user_id).

alter table public.configuracoes
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

update public.configuracoes
  set user_id = auth.uid()
  where user_id is null and auth.uid() is not null;

create unique index if not exists configuracoes_chave_uidx
  on public.configuracoes (chave);

create unique index if not exists configuracoes_user_chave_uidx
  on public.configuracoes (user_id, chave)
  where user_id is not null;

alter table public.indicadores
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

create unique index if not exists indicadores_chave_uidx
  on public.indicadores (chave);

create unique index if not exists indicadores_user_chave_uidx
  on public.indicadores (user_id, chave)
  where user_id is not null;
