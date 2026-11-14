-- ArchPro drawing storage. Run once in the Supabase SQL editor.
-- Also enable: Authentication > Sign In / Providers > "Allow anonymous sign-ins".
-- Each browser then gets its own auth user, and row-level security keeps every user's drawings private.
-- (Add a real login later and these same policies keep working.)

create table if not exists public.drawings (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id   text not null,
  ref          text not null,                       -- designated id, e.g. P7K2-FLOOR-PLAN
  kind         text not null check (kind in ('source_plan','floor_plan','foundation_plan','elevations')),
  title        text not null,
  origin       text not null check (origin in ('drafting','elevation','measurement','upload')),
  generated    boolean not null default false,
  mime         text not null,
  storage_path text not null,
  width        integer not null default 0,
  height       integer not null default 0,
  version      integer not null default 1,
  data         jsonb,                               -- the page data that produced the drawing
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (owner, project_id, ref)
);
create index if not exists drawings_project_idx on public.drawings (owner, project_id);

alter table public.drawings enable row level security;
create policy "drawings: owner select" on public.drawings for select to authenticated using (owner = auth.uid());
create policy "drawings: owner insert" on public.drawings for insert to authenticated with check (owner = auth.uid());
create policy "drawings: owner update" on public.drawings for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "drawings: owner delete" on public.drawings for delete to authenticated using (owner = auth.uid());

-- Private bucket; files live under <user id>/<project id>/<ref>.<ext>
insert into storage.buckets (id, name, public, file_size_limit)
values ('drawings', 'drawings', false, 52428800)
on conflict (id) do nothing;

create policy "drawings files: owner read"   on storage.objects for select to authenticated using (bucket_id = 'drawings' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "drawings files: owner insert" on storage.objects for insert to authenticated with check (bucket_id = 'drawings' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "drawings files: owner update" on storage.objects for update to authenticated using (bucket_id = 'drawings' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "drawings files: owner delete" on storage.objects for delete to authenticated using (bucket_id = 'drawings' and (storage.foldername(name))[1] = auth.uid()::text);
