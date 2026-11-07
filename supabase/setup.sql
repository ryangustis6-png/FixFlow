-- FixFlow demo table. Paste into Supabase: SQL Editor -> New query -> Run.
create table if not exists public.ff_requests (
  id text primary key,
  created_at timestamptz not null default now(),
  status text not null,
  data jsonb not null
);
alter table public.ff_requests enable row level security;
-- Demo-only: the app server uses the publishable key. Tighten (auth + per-owner policies) after the hackathon.
drop policy if exists "ff demo read" on public.ff_requests;
drop policy if exists "ff demo insert" on public.ff_requests;
drop policy if exists "ff demo update" on public.ff_requests;
create policy "ff demo read" on public.ff_requests for select to anon using (true);
create policy "ff demo insert" on public.ff_requests for insert to anon with check (true);
create policy "ff demo update" on public.ff_requests for update to anon using (true) with check (true);
