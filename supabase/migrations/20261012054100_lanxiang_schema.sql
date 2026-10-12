-- 兰香识人录 · Supabase 版数据库结构
-- 由 db/01-schema.sql 移植而来。差异：原 Docker 版使用独立的 lx_app 角色，
-- Supabase 版改为 service_role（只被 Edge Function 持有），浏览器端没有任何读表权限。

-- 密码库存：只保存密码摘要与尾号，浏览器无法读取。
create table if not exists public.lx_codes (
  hash text primary key check (hash ~ '^[a-f0-9]{64}$'),
  label text not null,
  disabled integer not null default 0 check (disabled in (0,1)),
  created bigint not null
);

-- 每次开始测试生成一行；额度按行数计算，跨设备累计。
create table if not exists public.lx_sessions (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null references public.lx_codes(hash),
  nonce uuid not null unique,
  created bigint not null,
  result_id uuid unique,
  result jsonb,
  check ((result_id is null) = (result is null))
);
create index if not exists lx_sessions_code_hash_idx on public.lx_sessions(code_hash);

-- 限流计数器。
create table if not exists public.lx_limits (
  key text primary key,
  attempts integer not null,
  reset bigint not null
);

-- Edge Function 的运行配置（管理员密码、签名密钥、允许的来源）。
-- 只有 service_role 能读取；也可以在 Edge Function 的环境变量里覆盖。
create table if not exists public.lx_config (
  key text primary key,
  value text not null
);

-- 四张表都开启 RLS 且不建任何策略：匿名与登录用户的请求拿不到任何行。
alter table public.lx_codes enable row level security;
alter table public.lx_sessions enable row level security;
alter table public.lx_limits enable row level security;
alter table public.lx_config enable row level security;

-- 撤销浏览器端角色（anon / authenticated）与 PUBLIC 的权限，只把权限留给 service_role。
revoke all on public.lx_codes, public.lx_sessions, public.lx_limits, public.lx_config from public;
revoke all on public.lx_codes, public.lx_sessions, public.lx_limits, public.lx_config from anon, authenticated;
grant all on public.lx_codes, public.lx_sessions, public.lx_limits, public.lx_config to service_role;

-- 开始测试：同一密码的行锁保证多个设备同时开始也不会超出额度。
-- 额度永远在数据库里判断，不依赖前端。
create or replace function public.lx_start_test(p_hash text, p_nonce uuid, p_now bigint)
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

-- 保存结果：同一 session 只写一次，重复提交返回已保存的结果。
create or replace function public.lx_save_result(p_session uuid, p_result jsonb)
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

-- 固定窗口限流：写入即计数。
create or replace function public.lx_rate_limit(p_key text,p_now bigint,p_max integer)
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

-- 管理页统计每个密码已用次数。
create or replace function public.lx_code_usage(p_hashes text[])
returns table(code_hash text,used bigint)
language sql security invoker set search_path = '' as $$
  select s.code_hash,count(*) from public.lx_sessions s where s.code_hash=any(p_hashes) group by s.code_hash;
$$;

-- 函数默认对 PUBLIC 开放 EXECUTE，这里全部收回，只允许 service_role 调用。
revoke all on function public.lx_start_test(text,uuid,bigint) from public;
revoke all on function public.lx_save_result(uuid,jsonb) from public;
revoke all on function public.lx_rate_limit(text,bigint,integer) from public;
revoke all on function public.lx_code_usage(text[]) from public;
revoke all on function public.lx_start_test(text,uuid,bigint) from anon, authenticated;
revoke all on function public.lx_save_result(uuid,jsonb) from anon, authenticated;
revoke all on function public.lx_rate_limit(text,bigint,integer) from anon, authenticated;
revoke all on function public.lx_code_usage(text[]) from anon, authenticated;
grant execute on function public.lx_start_test(text,uuid,bigint) to service_role;
grant execute on function public.lx_save_result(uuid,jsonb) to service_role;
grant execute on function public.lx_rate_limit(text,bigint,integer) to service_role;
grant execute on function public.lx_code_usage(text[]) to service_role;

-- 让 PostgREST 立即重新加载 schema 缓存。
notify pgrst, 'reload schema';
