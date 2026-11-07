-- FixFlow demo tables. Paste into Supabase: SQL Editor -> New query -> Run. Safe to run more than once.
create table if not exists public.ff_requests (id text primary key, created_at timestamptz not null default now(), status text not null, data jsonb not null);
create table if not exists public.ff_properties (id text primary key, created_at timestamptz not null default now(), status text not null, data jsonb not null);
alter table public.ff_requests enable row level security;
alter table public.ff_properties enable row level security;
-- Demo-only: only the app server holds this key (it is never sent to browsers). Tighten with auth after the hackathon.
do $$ declare t text; begin
  foreach t in array array['ff_requests','ff_properties'] loop
    execute format('drop policy if exists "ff demo read" on public.%I', t);
    execute format('drop policy if exists "ff demo insert" on public.%I', t);
    execute format('drop policy if exists "ff demo update" on public.%I', t);
    execute format('drop policy if exists "ff demo delete" on public.%I', t);
    execute format('create policy "ff demo read" on public.%I for select to anon using (true)', t);
    execute format('create policy "ff demo insert" on public.%I for insert to anon with check (true)', t);
    execute format('create policy "ff demo update" on public.%I for update to anon using (true) with check (true)', t);
    execute format('create policy "ff demo delete" on public.%I for delete to anon using (true)', t);
  end loop;
end $$;
