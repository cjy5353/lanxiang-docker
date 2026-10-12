// 兰香识人录 · Supabase Edge Function（测评 API）
//
// 前端静态资源托管在 GitHub Pages，本函数承担原来 Node 服务端的角色：
//   https://<项目>.supabase.co/functions/v1/assessment-api/<path>
// 路径与 server/handler.ts 一一对应，处理器代码由 npm run sync 从 server/ 复制，
// 因此 Docker 版与 Pages + Supabase 版跑的是同一套逻辑。
//
// 数据访问通过 PostgREST + service_role 完成；浏览器端只有 publishable key，
// 且四张表都开着 RLS 又不带策略，读不到任何行。管理员密码、签名密钥与允许的
// 来源优先读 Edge Function 环境变量，其次读数据库里的 lx_config。

import {createHandler} from './handler.ts';
import {configure} from './assessment.ts';
import type {QuizData} from './assessment.ts';

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';
const CONFIG_KEYS = ['ADMIN_SECRET', 'SESSION_SIGNING_KEY', 'CLIENT_ORIGINS', 'QUIZ_DATA_URL'];
const DEFAULT_QUIZ_URL = 'https://cjy5605205.github.io/lanxiang-docker/quiz-data.json';
const BODY_LIMIT = 12000;
const CONFIG_TTL = 60000;
const QUIZ_TTL = 600000;

if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未配置。');

function dbHeaders(prefer = 'return=representation'): Record<string, string> {
  return {apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', Prefer: prefer};
}

async function rows(path: string): Promise<any[]> {
  const response = await fetch(SUPABASE_URL + '/rest/v1' + path, {headers: dbHeaders(), signal: AbortSignal.timeout(8000)});
  if (!response.ok) throw new Error('数据库请求失败（' + response.status + '）');
  return await response.json();
}

let cachedConfig: {at: number; value: Record<string, string>} | null = null;
let starting: Promise<Record<string, string>> | null = null;

async function settings(): Promise<Record<string, string>> {
  if (cachedConfig && Date.now() - cachedConfig.at < CONFIG_TTL) return cachedConfig.value;
  if (!starting) {
    starting = (async () => {
      const found = await rows('/lx_config?select=key,value&key=in.(' + CONFIG_KEYS.join(',') + ')');
      const map: Record<string, string> = {};
      for (const row of found) map[row.key] = String(row.value);
      cachedConfig = {at: Date.now(), value: map};
      return map;
    })().finally(() => {starting = null;});
  }
  return await starting;
}

let cachedQuiz: {at: number; value: QuizData} | null = null;
let loading: Promise<QuizData> | null = null;

// 题库优先用数据库缓存，没有时从 GitHub Pages 上的 quiz-data.json 拉取并回写数据库，
// 之后冷启动就不再依赖外部网络。
async function loadQuiz(): Promise<QuizData> {
  try {
    const cached = await rows('/lx_config?select=value&key=eq.QUIZ_DATA');
    if (cached[0]?.value) return JSON.parse(String(cached[0].value)) as QuizData;
  } catch (error) {
    console.error('题库缓存读取失败', error instanceof Error ? error.message : 'unknown');
  }
  const url = (await settings()).QUIZ_DATA_URL || DEFAULT_QUIZ_URL;
  const response = await fetch(url, {cache: 'no-store', signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('题库下载失败（' + response.status + '）');
  const text = await response.text();
  const parsed = JSON.parse(text) as QuizData;
  try {
    const saved = await fetch(SUPABASE_URL + '/rest/v1/lx_config?on_conflict=key', {
      method: 'POST',
      headers: {...dbHeaders('resolution=merge-duplicates,return=minimal')},
      body: JSON.stringify([{key: 'QUIZ_DATA', value: text}]),
      signal: AbortSignal.timeout(8000),
    });
    if (!saved.ok) console.error('题库缓存写入失败（' + saved.status + '）');
  } catch (error) {
    console.error('题库缓存写入失败', error instanceof Error ? error.message : 'unknown');
  }
  return parsed;
}

async function quiz(): Promise<QuizData> {
  if (cachedQuiz && Date.now() - cachedQuiz.at < QUIZ_TTL) return cachedQuiz.value;
  if (!loading) {
    loading = loadQuiz()
      .then((value) => {cachedQuiz = {at: Date.now(), value}; return value;})
      .finally(() => {loading = null;});
  }
  return await loading;
}

// handler 用固定内网地址拼接 REST 路径，这里改写成真实 PostgREST 地址并补上鉴权头。
async function postgrest(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(String(input));
  const headers = {...(init.headers as Record<string, string> | undefined), ...dbHeaders()};
  return await fetch(SUPABASE_URL + url.pathname + url.search, {...init, headers, signal: AbortSignal.timeout(15000)});
}

// Edge 运行时会带上客户端 IP 头，限流按来源 IP 统计。
function clientIp(headers: Headers): string {
  for (const name of ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'x-client-ip']) {
    const value = headers.get(name);
    if (value) return value.split(',')[0].trim();
  }
  return 'unknown';
}

Deno.serve(async (request: Request): Promise<Response> => {
  let values: Record<string, string> = {};
  try {
    values = await settings();
  } catch (error) {
    console.error('读取运行配置失败', error instanceof Error ? error.message : 'unknown');
    return Response.json({error: '测评服务暂时不可用，请稍后重试。'}, {status: 503});
  }
  try {
    configure(await quiz());
  } catch (error) {
    console.error('题库加载失败', error instanceof Error ? error.message : 'unknown');
  }
  const handle = createHandler({
    env: (key: string) => Deno.env.get(key) ?? values[key],
    fetch: postgrest,
  });
  const headers = new Headers(request.headers);
  if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', clientIp(headers));
  const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text();
  if (body && body.length > BODY_LIMIT) {
    return Response.json({error: '请求内容过大。'}, {status: 413, headers: {'Vary': 'Origin', 'Cache-Control': 'no-store'}});
  }
  return await handle(new Request(request.url, {method: request.method, headers, body}));
});
