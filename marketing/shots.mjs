// 抓取小红书用的商品截图：首页、解锁、答题、结果与结果长图。
// 用法：LX_CODE=LX-XXXXXXXXXXXX node marketing/shots.mjs [站点地址]
// 需要 playwright-core（npm i --no-save playwright-core）与本机安装的 Google Chrome。
import {chromium} from 'playwright-core';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {calculate} from '../src/lib/assessment.ts';

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, 'xhs');
const base = process.argv[2] || 'https://cjy5353.github.io/lanxiang-docker/';
const code = process.env.LX_CODE;
const shot = (page, name, fullPage = false, clip) => page.screenshot({path: join(out, name), fullPage, clip});
if (!code) throw new Error('请用 LX_CODE=<测试密码> 运行本脚本。');
await mkdir(out, {recursive: true});

// 先搜索一组能落在招牌人物上的答案，让结果截图正好是“许兰香”。
const quiz = JSON.parse(await readFile(join(root, '..', 'public', 'quiz-data.json'), 'utf8'));
const featured = process.env.LX_FEATURE || '许兰香';
const target = quiz.characters.find((c) => c.name === featured).vector;
const random = (() => {let seed = 20261012; return () => {seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648;};})();
let picks = null, closest = Infinity;
for (let attempt = 0; attempt < 60000 && closest > 0; attempt++) {
  const answers = quiz.questions.map((q) => Math.floor(random() * q.options.length));
  const result = calculate(answers, 'probe');
  if (result.name !== featured) continue;
  const distance = result.scores.reduce((sum, x, k) => sum + (x - target[k]) ** 2, 0);
  if (distance < closest) {closest = distance; picks = answers;}
}
if (!picks) throw new Error('没有找到落在「' + featured + '」上的答案组合。');
console.log('截图人物：' + featured + '（偏差平方和 ' + closest + '）');

const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true});
try {
  const phone = await browser.newContext({
    viewport: {width: 390, height: 844}, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai', colorScheme: 'light',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  });
  const page = await phone.newPage();
  await page.goto(base, {waitUntil: 'load'});
  await page.waitForSelector('text=输入测试密码', {timeout: 40000});
  await page.waitForTimeout(800);
  await shot(page, '01-首页-手机.png');
  await shot(page, '01b-首页-方图3x4.png', false, {x: 0, y: 0, width: 390, height: 520});
  await shot(page, '02-首页-完整长图.png', true);

  await page.fill('#code', code);
  await page.keyboard.press('Enter');
  await page.waitForSelector('text=密码已验证', {timeout: 25000});
  await page.waitForTimeout(600);
  await shot(page, '03-解锁-剩余3次.png');

  await page.getByRole('button', {name: /开始测试/}).click();
  await page.waitForSelector('.question-card', {timeout: 25000});
  // 等“密码验证成功”的提示条自然消失，再截图，避免遮住题目。
  await page.waitForSelector('.toast', {state: 'detached', timeout: 8000}).catch(() => {});
  await page.waitForTimeout(500);
  await shot(page, '04-答题-第一题.png');
  await shot(page, '04b-答题-方图3x4.png', false, {x: 0, y: 0, width: 390, height: 520});

  for (let i = 0; i < picks.length; i++) {
    await page.locator('button.option').nth(picks[i]).click();
    await page.waitForTimeout(220);
    await page.locator('.quiz-nav button.primary').click();
    await page.waitForTimeout(360);
  }
  await page.waitForSelector('.result-shell', {timeout: 40000});
  await page.waitForTimeout(1000);
  await shot(page, '05-结果-人物.png');
  await shot(page, '05b-结果-方图3x4.png', false, {x: 0, y: 0, width: 390, height: 520});
  await shot(page, '06-结果-完整页.png', true);

  await page.getByRole('button', {name: /保存测试结果|保存长图/}).first().click();
  await page.waitForSelector('text=保存你的完整花笺', {timeout: 40000});
  await page.waitForSelector('a[download]', {timeout: 40000});
  const href = await page.locator('a[download]').first().getAttribute('href');
  const base64 = await page.evaluate(async (url) => {
    const response = await fetch(url);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(text);
  }, href);
  await writeFile(join(out, '07-结果-完整长图.png'), Buffer.from(base64, 'base64'));

  const desktop = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 2, locale: 'zh-CN', timezoneId: 'Asia/Shanghai'});
  // 电脑端只用于展示大屏效果，保持 2 倍清晰度即可。
  const wide = await desktop.newPage();
  await wide.goto(base, {waitUntil: 'load'});
  await wide.waitForSelector('text=输入测试密码', {timeout: 40000});
  await wide.waitForTimeout(800);
  await shot(wide, '08-首页-电脑端.png');
} finally {
  await browser.close();
}
console.log('截图完成：' + out);
