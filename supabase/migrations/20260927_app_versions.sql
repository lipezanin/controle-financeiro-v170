-- Catálogo de releases do app. Leitura pública (anon). Escrita só via dashboard/service_role.
-- Bucket Storage "releases" para instaladores (.exe / zip). Upload manual no painel.

create table if not exists public.app_versions (
  id bigint generated always as identity primary key,
  canal text not null default 'stable',
  versao text not null,
  obrigatoria boolean not null default false,
  notas text,
  arquivo_path text,
  arquivo_url text,
  sha256 text,
  created_at timestamptz not null default now(),
  unique (canal, versao)
);

alter table public.app_versions enable row level security;
revoke all on public.app_versions from anon, public;
grant select on public.app_versions to anon, authenticated;

drop policy if exists cf_versions_read on public.app_versions;
create policy cf_versions_read
  on public.app_versions
  for select
  to anon, authenticated
  using (true);

insert into storage.buckets (id, name, public)
values ('releases', 'releases', true)
on conflict (id) do update set public = true;

drop policy if exists cf_releases_read on storage.objects;
create policy cf_releases_read
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'releases');
