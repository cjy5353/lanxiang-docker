import assert from 'node:assert/strict';
import {createHandler,hash} from '../server/handler.ts';
import {database,postgrest} from './support.mjs';
const pg=await database();
await pg.exec('set role lx_app;');
const env={ADMIN_SECRET:'test-admin-only-password',SESSION_SIGNING_KEY:'test-signing-key',CLIENT_ORIGINS:'http://127.0.0.1:5174'};
const handle=createHandler({env:k=>env[k],fetch:postgrest(pg)});
const origin=env.CLIENT_ORIGINS;
async function call(path,body,token='',sid='',extra={}){
 const r=await handle(new Request(origin+'/api/assessment-api/'+path,{
   method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json','X-App-Token':token,'X-Test-Session':sid,...extra},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
 }));
 return {status:r.status,data:await r.json()};
}
assert.equal((await call('admin/codes')).status,401);
assert.equal((await call('admin/login',{password:'wrong'})).status,401);
const admin=await call('admin/login',{password:env.ADMIN_SECRET});assert.equal(admin.status,200);
const adminToken=admin.data.adminToken;
const generated=await call('admin/generate',{count:3},adminToken);assert.equal(generated.status,200);assert.equal(generated.data.codes.length,3);
const stored=await pg.query('select * from public.lx_codes');assert(!JSON.stringify(stored).includes(generated.data.codes[0]));
const code=generated.data.codes[0];
const unlock=await call('unlock',{code});assert.equal(unlock.status,200);
const accessToken=unlock.data.accessToken;assert.equal(unlock.data.remaining,3);
assert.equal((await call('start',{nonce:crypto.randomUUID()},adminToken)).status,401);
assert.equal((await call('admin/codes',undefined,accessToken)).status,401);
assert.equal((await call('start',{nonce:'bad'},accessToken)).status,400);
const nonce=crypto.randomUUID();
const first=await call('start',{nonce},accessToken);assert.equal(first.status,200);
const repeat=await call('start',{nonce},accessToken);assert.equal(repeat.data.sessionId,first.data.sessionId);assert.equal(repeat.data.remaining,2);
assert.equal((await call('submit',{answers:[]},'',first.data.sessionId)).status,400);
const responses=await Promise.all(Array.from({length:7},()=>call('start',{nonce:crypto.randomUUID()},accessToken)));
assert.equal(responses.filter(r=>r.status===200).length,2);assert.equal(responses.filter(r=>r.status===409).length,5);
assert.equal((await call('me',undefined,accessToken)).data.remaining,0);
const result=await call('submit',{answers:Array(16).fill(0)},'',first.data.sessionId);assert.equal(result.status,200);
const again=await call('submit',{answers:Array(16).fill(1)},'',first.data.sessionId);assert.deepEqual(again.data,result.data);
const shared=await call('result/'+result.data.id);assert.deepEqual(shared.data,result.data);
assert(!JSON.stringify(shared.data).includes(first.data.sessionId));
assert.equal((await call('result/'+first.data.sessionId)).status,404);
assert.equal((await call('session',undefined,'',first.data.sessionId)).data.resultId,result.data.id);
assert.equal((await call('admin/generate',{count:101},adminToken)).status,400);
assert.equal((await call('admin/generate',{count:1},adminToken.slice(0,-2)+'ff')).status,401);
const other=generated.data.codes[1],h=await hash(other);
assert.equal((await call('admin/toggle',{hash:h,disabled:true},adminToken)).status,200);
assert.equal((await call('unlock',{code:other})).status,400);
assert.equal((await call('admin/toggle',{hash:h,disabled:false},adminToken)).status,200);
assert.equal((await call('unlock',{code:other})).status,200);
assert.equal((await call('admin/codes',undefined,adminToken)).data.codes.reduce((n,c)=>n+c.used,0),3);
assert.equal((await call('me',undefined,'','',{Origin:'https://unapproved.example'})).status,403);
const preflight=await handle(new Request(origin+'/api/assessment-api/unlock',{method:'OPTIONS',headers:{Origin:origin}}));assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);
for(let i=0;i<31;i++)await call('admin/login',{password:'wrong'},'','',{'X-Forwarded-For':'rate-test'});
assert.equal((await call('admin/login',{password:env.ADMIN_SECRET},'','',{'X-Forwarded-For':'rate-test'})).status,429);
await pg.close();
console.log('PASS: backend auth isolation, code hashes, 3-use quota, nonce idempotency, immutable results, public read-only sharing, disable/enable, CORS and rate limits.');
