-- 兰香识人录 · 让店主可以在管理页看到并复制明文测试密码
--
-- 之前 lx_codes 只保存 sha256 摘要和尾号，密码生成后无法再次取回。
-- 现在额外保存完整密码：解锁流程仍然先算摘要再比对，公开页面依旧读不到任何行；
-- 只有持管理员令牌的 /admin/codes 接口会返回明文。
-- 代价是数据库里会存在明文密码，请务必保管好管理员密码与 Supabase 账号。

alter table public.lx_codes add column if not exists code text;

comment on column public.lx_codes.code is '完整测试密码（仅 service_role 可读，用于管理页复制）';
