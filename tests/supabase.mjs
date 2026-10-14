import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createHandler,hash} from '../server/handler.ts';
import {postgrest} from './support.mjs';

// 用 Supabase 版迁移建库，角色名与线上一致：anon / authenticated 只做旁观，service_role 是 Edge Function 的身份。
const pg=await PGlite.create();
await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
const dir=new URL('../supabase/migrations/',import.meta.url);
for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await pg.exec(await readFile(new URL(name,dir),'utf8'));

const anyHash='a'.repeat(64);
for(const role of ['anon','authenticated']){
 await pg.exec('set role '+role+';');
 await assert.rejects(pg.query('select * from public.lx_codes'),/permission denied/,role+' 不应能读取密码库存');
 await assert.rejects(pg.query('select * from public.lx_sessions'),/permission denied/,role+' 不应能读取测试记录');
 await assert.rejects(pg.query('select * from public.lx_config'),/permission denied/,role+' 不应能读取运行配置');
 await assert.rejects(pg.query('insert into public.lx_codes(hash,label,created) values($1,$2,$3)',[anyHash,'x',Date.now()]),/permission denied/);
 await assert.rejects(pg.query('select public.lx_start_test($1,$2,$3)',[anyHash,crypto.randomUUID(),Date.now()]),/permission denied/,role+' 不应能调用额度函数');
 await assert.rejects(pg.query('select public.lx_rate_limit($1,$2,$3)',['k',Date.now(),30]),/permission denied/);
 await pg.exec('reset role;');
}

await pg.exec('set role service_role;');
const env={ADMIN_SECRET:'test-admin-password-24-characters',SESSION_SIGNING_KEY:'test-session-signing-key-32-characters',CLIENT_ORIGINS:'https://example.github.io'};
const handle=createHandler({env:k=>env[k],fetch:postgrest(pg)});
const origin=env.CLIENT_ORIGINS;
async function call(path,body,token='',sid=''){
 const r=await handle(new Request(origin+'/api/assessment-api/'+path,{
  method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json','X-App-Token':token,'X-Test-Session':sid},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
 }));
 return {status:r.status,data:await r.json()};
}
assert.equal((await call('me')).status,200);
assert.equal((await call('admin/codes')).status,401);
const admin=await call('admin/login',{password:env.ADMIN_SECRET});assert.equal(admin.status,200);
const adminToken=admin.data.adminToken;
const generated=await call('admin/generate',{count:2},adminToken);assert.equal(generated.status,200);
const stored=await pg.query('select hash,label,code from public.lx_codes');assert.equal(stored.rows.find(r=>r.code===generated.data.codes[0])?.code,generated.data.codes[0],'明文密码应保存在库里');assert.equal((await call('admin/codes',undefined,adminToken)).data.codes.find(c=>c.code===generated.data.codes[0])?.code,generated.data.codes[0],'管理接口应能取回明文密码');
const code=generated.data.codes[0];
const unlock=await call('unlock',{code});assert.equal(unlock.status,200);assert.equal(unlock.data.remaining,3);
const accessToken=unlock.data.accessToken;
const nonce=crypto.randomUUID();
const first=await call('start',{nonce},accessToken);assert.equal(first.status,200);
assert.equal((await call('start',{nonce},accessToken)).data.sessionId,first.data.sessionId);
const responses=await Promise.all(Array.from({length:7},()=>call('start',{nonce:crypto.randomUUID()},accessToken)));
assert.equal(responses.filter(r=>r.status===200).length,2);
assert.equal(responses.filter(r=>r.status===409).length,5);
assert.equal((await call('me',undefined,accessToken)).data.remaining,0);
const result=await call('submit',{answers:Array(16).fill(0)},'',first.data.sessionId);assert.equal(result.status,200);
assert.deepEqual((await call('submit',{answers:Array(16).fill(1)},'',first.data.sessionId)).data,result.data);
assert.equal((await call('result/'+result.data.id)).data.id,result.data.id);
assert.equal((await call('admin/codes',undefined,accessToken)).status,401);
const other=generated.data.codes[1],otherHash=await hash(other);
assert.equal((await call('admin/toggle',{hash:otherHash,disabled:true},adminToken)).status,200);
assert.equal((await call('unlock',{code:other})).status,400);
await pg.close();
console.log('PASS: Supabase 迁移（RLS 无策略 + 权限收回），service_role 下完整流程：登录、生成、解锁、3 次额度、结果不可覆盖、分享只读。');
