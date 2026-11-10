-- Kings Korners schema (already applied to the Supabase project).

-- Full game state (includes hidden hands). Not readable by clients directly.
create table public.games (
  id text primary key,
  state jsonb not null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.games enable row level security;

-- Server secret gate for the RPCs below. Not readable by clients.
create table public.kk_config (key text primary key, value text not null);
alter table public.kk_config enable row level security;
insert into public.kk_config (key, value) values ('server_secret', encode(extensions.gen_random_bytes(32), 'hex'));

-- Public "something changed" pings, broadcast via Realtime. Contains no secrets.
create table public.game_pings (
  game_id text primary key references public.games(id) on delete cascade,
  version int not null,
  updated_at timestamptz not null default now()
);
alter table public.game_pings enable row level security;
create policy "anyone can read pings" on public.game_pings for select to anon, authenticated using (true);
alter publication supabase_realtime add table public.game_pings;

create or replace function public.kk_check(p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_secret is null or p_secret <> (select value from public.kk_config where key = 'server_secret') then
    raise exception 'unauthorized';
  end if;
end $$;

create or replace function public.kk_get(p_secret text, p_id text)
returns table (state jsonb, version int)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.kk_check(p_secret);
  return query select g.state, g.version from public.games g where g.id = p_id;
end $$;

create or replace function public.kk_create(p_secret text, p_id text, p_state jsonb)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform public.kk_check(p_secret);
  delete from public.games where updated_at < now() - interval '3 days';
  insert into public.games (id, state) values (p_id, p_state) on conflict (id) do nothing;
  if not found then return false; end if;
  insert into public.game_pings (game_id, version) values (p_id, 1);
  return true;
end $$;

create or replace function public.kk_save(p_secret text, p_id text, p_state jsonb, p_version int)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform public.kk_check(p_secret);
  update public.games set state = p_state, version = version + 1, updated_at = now()
    where id = p_id and version = p_version;
  if not found then return false; end if;
  update public.game_pings set version = p_version + 1, updated_at = now() where game_id = p_id;
  return true;
end $$;

revoke all on function public.kk_check(text) from public, anon, authenticated;
revoke all on function public.kk_get(text, text) from public, authenticated;
revoke all on function public.kk_create(text, text, jsonb) from public, authenticated;
revoke all on function public.kk_save(text, text, jsonb, int) from public, authenticated;
grant execute on function public.kk_get(text, text) to anon;
grant execute on function public.kk_create(text, text, jsonb) to anon;
grant execute on function public.kk_save(text, text, jsonb, int) to anon;
