-- Планёрка студии: база и хранилище файлов в Supabase.
-- Запустить один раз: Supabase → SQL Editor → New query → вставить всё → Run.

-- Все записи (проекты, задачи, статусы, команда, время, комментарии) лежат в одной таблице:
-- collection — раздел, id — номер записи, data — поля записи.
create table if not exists public.docs (
  collection text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
alter table public.docs replica identity full;
alter table public.docs enable row level security;

-- Читать и менять могут только вошедшие по паролю студии.
drop policy if exists "studio read" on public.docs;
drop policy if exists "studio insert" on public.docs;
drop policy if exists "studio update" on public.docs;
drop policy if exists "studio delete" on public.docs;
create policy "studio read"   on public.docs for select to authenticated using (true);
create policy "studio insert" on public.docs for insert to authenticated with check (true);
create policy "studio update" on public.docs for update to authenticated using (true) with check (true);
create policy "studio delete" on public.docs for delete to authenticated using (true);

-- Частичное изменение записи одной операцией (без перезаписи чужих правок в других полях).
create or replace function public.doc_update(p_collection text, p_id text, p_patch jsonb)
returns public.docs
language sql
security invoker
as $$
  update public.docs
     set data = data || p_patch, updated_at = now()
   where collection = p_collection and id = p_id
  returning *;
$$;
revoke all on function public.doc_update(text, text, jsonb) from public, anon;
grant execute on function public.doc_update(text, text, jsonb) to authenticated;

-- Живое обновление у всех открытых вкладок.
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;

-- Закрытое хранилище для скриншотов и файлов из комментариев (до 20 МБ на файл).
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists "studio files read" on storage.objects;
drop policy if exists "studio files insert" on storage.objects;
drop policy if exists "studio files delete" on storage.objects;
create policy "studio files read"   on storage.objects for select to authenticated using (bucket_id = 'files');
create policy "studio files insert" on storage.objects for insert to authenticated with check (bucket_id = 'files');
create policy "studio files delete" on storage.objects for delete to authenticated using (bucket_id = 'files');
