// 部署后自检：对 Pages + Supabase 版做一遍完整流程，并核对结果与本地算法一致。
// 用法：ORIGIN=https://<用户>.github.io API_BASE=https://<ref>.supabase.co/functions/v1/assessment-api/ ADMIN_SECRET=LXADMIN-... node scripts/check-deployed.mjs
import assert from 'node:assert/strict';
import {calculate} from '../server/assessment.ts';

const origin = process.env.ORIGIN || '';
const base = (process.env.API_BASE || '').replace(/\/+$/, '') + '/';
const adminSecret = process.env.ADMIN_SECRET || '';
assert(origin && base.startsWith('http') && adminSecret, '需要设置 ORIGIN / API_BASE / ADMIN_SECRET');

async function call(path, {body, token, sid, origin: from = origin, extra = {}} = {}) {
  const headers = {'Content-Type': 'application/json', Origin: from, ...extra};
  if (token) headers['X-App-Token'] = token;
  if (sid) headers['X-Test-Session'] = sid;
  const response = await fetch(base + path, {method: body === undefined ? 'GET' : 'POST', headers, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = {raw: text}; }
  return {status: response.status, data, cors: response.headers.get('access-control-allow-origin')};
}

const checks = [];
const ok = (name, condition, detail = '') => {assert(condition, name + ' ' + detail); checks.push(name);};

// 来源校验与预检
const wrong = await call('me', {origin: 'https://unapproved.example'});
ok('未授权来源返回 403', wrong.status === 403, JSON.stringify(wrong.data));
const preflight = await fetch(base + 'unlock', {method: 'OPTIONS', headers: {Origin: origin, 'Access-Control-Request-Method': 'POST'}});
ok('预检返回 204 且允许来源', preflight.status === 204 && preflight.headers.get('access-control-allow-origin') === origin);

const me0 = await call('me');
ok('未登录时 me 显示未解锁', me0.status === 200 && me0.data.unlocked === false && me0.data.remaining === 0, JSON.stringify(me0.data));

// 管理端
const badLogin = await call('admin/login', {body: {password: 'definitely-wrong'}});
ok('错误管理密码返回 401', badLogin.status === 401 && /管理密码不正确/.test(badLogin.data.error), JSON.stringify(badLogin.data));
ok('未登录访问管理接口返回 401', (await call('admin/codes')).status === 401);
const login = await call('admin/login', {body: {password: adminSecret}});
ok('管理员登录成功', login.status === 200 && !!login.data.adminToken);
const adminToken = login.data.adminToken;
ok('生成数量越界返回 400', (await call('admin/generate', {body: {count: 101}, token: adminToken})).status === 400);
const generated = await call('admin/generate', {body: {count: 2}, token: adminToken});
ok('生成两个测试密码', generated.status === 200 && generated.data.codes.length === 2, JSON.stringify(generated.data));
const [code, spare] = generated.data.codes;
ok('密码格式为 LX- 加 12 位', /^LX-[A-Z0-9]{12}$/.test(code));

// 解锁、额度、幂等
ok('无效密码返回 400', (await call('unlock', {body: {code: 'LX-111111111111'}})).status === 400);
const unlock = await call('unlock', {body: {code}});
ok('正确密码解锁并显示 3 次额度', unlock.status === 200 && unlock.data.remaining === 3, JSON.stringify(unlock.data));
const accessToken = unlock.data.accessToken;
ok('用管理令牌开始测试返回 401', (await call('start', {body: {nonce: crypto.randomUUID()}, token: adminToken})).status === 401);
ok('用访问令牌访问管理接口返回 401', (await call('admin/codes', {token: accessToken})).status === 401);
ok('非法 nonce 返回 400', (await call('start', {body: {nonce: 'nope'}, token: accessToken})).status === 400);
const nonce = crypto.randomUUID();
const first = await call('start', {body: {nonce}, token: accessToken});
ok('开始测试成功', first.status === 200 && !!first.data.sessionId, JSON.stringify(first.data));
const repeat = await call('start', {body: {nonce}, token: accessToken});
ok('同一 nonce 重试返回同一会话且额度不变', repeat.data.sessionId === first.data.sessionId && repeat.data.remaining === 2);
const parallel = await Promise.all(Array.from({length: 7}, () => call('start', {body: {nonce: crypto.randomUUID()}, token: accessToken})));
ok('并发开始只放行剩余额度', parallel.filter((r) => r.status === 200).length === 2 && parallel.filter((r) => r.status === 409).length === 5);
ok('额度用尽后 me 显示 0', (await call('me', {token: accessToken})).data.remaining === 0);

// 提交结果：与本地算法逐字段比对
const answers = [0, 1, 2, 3, 0, 1, 2, 3, 3, 2, 1, 0, 1, 1, 2, 2];
const submit = await call('submit', {body: {answers}, sid: first.data.sessionId});
ok('提交结果成功', submit.status === 200 && !!submit.data.id, JSON.stringify(submit.data).slice(0, 200));
const expected = calculate(answers, submit.data.id);
for (const field of ['name', 'secondary', 'scores', 'evidence', 'difference']) {
  assert.deepEqual(submit.data[field], expected[field], '结果字段 ' + field + ' 与本地算法不一致：' + JSON.stringify(submit.data[field]));
}
checks.push('结果的匹配、维度分、依据与差异文案与本地算法完全一致');
const again = await call('submit', {body: {answers: Array(16).fill(0)}, sid: first.data.sessionId});
ok('重复提交返回原结果、不被覆盖', again.data.id === submit.data.id && again.data.name === submit.data.name);
ok('分享链接可读取', (await call('result/' + submit.data.id)).data.id === submit.data.id);
ok('session 能查到结果编号', (await call('session', {sid: first.data.sessionId})).data.resultId === submit.data.id);
ok('无效结果链接返回 404', (await call('result/not-a-uuid')).status === 404);
ok('未知接口返回 404', (await call('nope')).status === 404);
const oversized = await fetch(base + 'unlock', {method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json'}, body: JSON.stringify({code: 'x'.repeat(13000)})});
ok('超大请求体被拒绝', oversized.status === 413 || oversized.status === 400, String(oversized.status));

// 停用 / 启用
const spareHash = (await import('../server/handler.ts')).hash;
const spareHashValue = await spareHash(spare);
ok('停用密码', (await call('admin/toggle', {body: {hash: spareHashValue, disabled: true}, token: adminToken})).status === 200);
ok('停用后无法解锁', (await call('unlock', {body: {code: spare}})).status === 400);
ok('重新启用密码', (await call('admin/toggle', {body: {hash: spareHashValue, disabled: false}, token: adminToken})).status === 200);
ok('启用后可以解锁', (await call('unlock', {body: {code: spare}})).status === 200);
const codes = await call('admin/codes', {token: adminToken});
ok('管理列表能看到使用次数', codes.status === 200 && codes.data.codes.some((c) => c.used === 3), JSON.stringify(codes.data.codes.map((c) => c.used)));

// 限流：同一来源连续失败后应被拦住
let limited = 0;
for (let i = 0; i < 34; i++) {
  const response = await call('admin/login', {body: {password: 'wrong-' + i}, extra: {'X-Forwarded-For': '203.0.113.9'}});
  if (response.status === 429) limited++;
}
ok('连续失败触发限流 429', limited > 0, '累计 ' + limited + ' 次 429');
const fresh = await call('admin/login', {body: {password: 'wrong-again'}, extra: {'X-Forwarded-For': '203.0.113.' + (1 + Math.floor(Math.random() * 200))}});
console.log('换一个新 IP 头后的状态码：' + fresh.status + '（200/401 表示限流按请求头 IP 统计，可被伪造）');

console.log('\n通过 ' + checks.length + ' 项检查：\n- ' + checks.join('\n- '));
