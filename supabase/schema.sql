-- Meadowfolk cloud saves (Supabase). Run once in the SQL editor of a new project, then:
--   * Authentication → Sign In / Providers → enable "Allow anonymous sign-ins" (instant guests).
--   * Set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY for the web build and
--     SUPABASE_URL for the relay (so it checks every player's JWT).
--
-- Each player's own client writes their own rows; row-level security keeps everyone else out.
-- Gold lives in the profile, never in the farm save.

-- A player's profile: name, look, gold, personal bag. Travels with them when visiting.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- One farm per player in v1: the serialized sim state (tiles, crops, animals, placements, storage, calendar).
create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null unique references auth.users (id) on delete cascade,
  data jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now()
);

-- The last three saves of every farm, so a corrupted save can be rolled back.
create table if not exists public.farm_history (
  id bigserial primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  data jsonb not null,
  version int not null,
  saved_at timestamptz not null
);
create index if not exists farm_history_farm on public.farm_history (farm_id, saved_at desc);

create or replace function public.keep_farm_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.farm_history (farm_id, data, version, saved_at) values (old.id, old.data, old.version, old.updated_at);
  delete from public.farm_history
   where farm_id = old.id
     and id not in (select id from public.farm_history where farm_id = old.id order by saved_at desc limit 3);
  return new;
end $$;

drop trigger if exists farms_history on public.farms;
create trigger farms_history before update on public.farms
  for each row when (old.data is distinct from new.data) execute function public.keep_farm_history();

-- Thank-you tips: the host inserts (as themselves), the recipient claims on their next visit.
create table if not exists public.gifts (
  id bigserial primary key,
  sender uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipient uuid not null references auth.users (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create index if not exists gifts_unclaimed on public.gifts (recipient) where claimed_at is null;

alter table public.profiles enable row level security;
alter table public.farms enable row level security;
alter table public.farm_history enable row level security;
alter table public.gifts enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "own farm" on public.farms;
create policy "own farm" on public.farms for all
  using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "own farm history" on public.farm_history;
create policy "own farm history" on public.farm_history for select
  using (exists (select 1 from public.farms f where f.id = farm_id and f.owner = auth.uid()));

drop policy if exists "send gifts as yourself" on public.gifts;
create policy "send gifts as yourself" on public.gifts for insert
  with check (sender = auth.uid() and recipient <> auth.uid());

drop policy if exists "see your gifts" on public.gifts;
create policy "see your gifts" on public.gifts for select
  using (recipient = auth.uid() or sender = auth.uid());

drop policy if exists "claim your gifts" on public.gifts;
create policy "claim your gifts" on public.gifts for update
  using (recipient = auth.uid()) with check (recipient = auth.uid());
