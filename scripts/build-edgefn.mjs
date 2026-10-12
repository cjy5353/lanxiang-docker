// 把 Node 版的 API 处理器复制到 Edge Function 目录，
// 让 Docker 版与 Supabase 版共用同一份实现，避免两边走样。
import {readFile, writeFile} from 'node:fs/promises';
const pairs = [['server/handler.ts', 'supabase/functions/assessment-api/handler.ts']];
const banner = '// 由 scripts/build-edgefn.mjs 从 server/handler.ts 复制，请修改源文件并重新运行 npm run sync。\n';
for (const [from, to] of pairs) {
  const source = await readFile(new URL('../' + from, import.meta.url), 'utf8');
  await writeFile(new URL('../' + to, import.meta.url), banner + source);
  console.log('已同步 ' + from + ' -> ' + to);
}
