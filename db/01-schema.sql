-- App-only tables: browsers cannot select passwords, sessions or rate-limit records.
create table public.lx_codes (
  hash text primary key check (hash ~ '^[a-f0-9]{64}$'),
  label text not null,
  disabled integer not null default 0 check (disabled in (0,1)),
  created bigint not null
);
create table public.lx_sessions (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null references public.lx_codes(hash),
  nonce uuid not null unique,
  created bigint not null,
  result_id uuid unique,
  result jsonb,
  check ((result_id is null) = (result is null))
);
create index lx_sessions_code_hash_idx on public.lx_sessions(code_hash);
create table public.lx_limits (
  key text primary key,
  attempts integer not null,
  reset bigint not null
);
alter table public.lx_codes enable row level security;
alter table public.lx_sessions enable row level security;
alter table public.lx_limits enable row level security;
revoke all on public.lx_codes, public.lx_sessions, public.lx_limits from public;
grant all on public.lx_codes, public.lx_sessions, public.lx_limits to lx_app;

-- The lock serializes starts for the same code across devices; quota is never a client check.
create function public.lx_start_test(p_hash text, p_nonce uuid, p_now bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c public.lx_codes%rowtype; s public.lx_sessions%rowtype; n integer;
begin
  select * into c from public.lx_codes where hash=p_hash for update;
  if not found or c.disabled=1 then return jsonb_build_object('error','invalid'); end if;
  select count(*) into n from public.lx_sessions where code_hash=p_hash;
  select * into s from public.lx_sessions where nonce=p_nonce and code_hash=p_hash;
  if found then
    return jsonb_build_object('sessionId',s.id,'resultId',s.result_id,'remaining',greatest(0,3-n));
  end if;
  if n>=3 then return jsonb_build_object('error','quota'); end if;
  insert into public.lx_sessions(code_hash,nonce,created) values(p_hash,p_nonce,p_now) returning * into s;
  return jsonb_build_object('sessionId',s.id,'resultId',null,'remaining',2-n);
exception when unique_violation then
  return jsonb_build_object('error','nonce');
end;
$$;

create function public.lx_save_result(p_session uuid, p_result jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s public.lx_sessions%rowtype;
begin
  select * into s from public.lx_sessions where id=p_session for update;
  if not found then return null; end if;
  if s.result is not null then return s.result; end if;
  update public.lx_sessions set result_id=(p_result->>'id')::uuid,result=p_result where id=p_session;
  return p_result;
end;
$$;

create function public.lx_rate_limit(p_key text,p_now bigint,p_max integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  insert into public.lx_limits(key,attempts,reset) values(p_key,1,p_now+900000)
  on conflict(key) do update set
    attempts=case when lx_limits.reset<=p_now then 1 else lx_limits.attempts+1 end,
    reset=case when lx_limits.reset<=p_now then p_now+900000 else lx_limits.reset end
  returning attempts into n;
  return n<=p_max;
end;
$$;

revoke all on function public.lx_start_test(text,uuid,bigint) from public;
revoke all on function public.lx_save_result(uuid,jsonb) from public;
revoke all on function public.lx_rate_limit(text,bigint,integer) from public;
grant execute on function public.lx_start_test(text,uuid,bigint) to lx_app;
grant execute on function public.lx_save_result(uuid,jsonb) to lx_app;
grant execute on function public.lx_rate_limit(text,bigint,integer) to lx_app;

create function public.lx_code_usage(p_hashes text[])
returns table(code_hash text,used bigint)
language sql security invoker set search_path = '' as $$
  select s.code_hash,count(*) from public.lx_sessions s where s.code_hash=any(p_hashes) group by s.code_hash;
$$;
revoke all on function public.lx_code_usage(text[]) from public;
grant execute on function public.lx_code_usage(text[]) to lx_app;
