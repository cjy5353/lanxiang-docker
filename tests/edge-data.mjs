import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dimensions, characters, questions, calculate as canonical} from '../server/assessment.ts';
import {configure, calculate as edgeCalculate} from '../supabase/functions/assessment-api/assessment.ts';

// 1) public/quiz-data.json 必须与前端题库同源，过期时提示重新生成。
const expected = {
  dimensions: dimensions.map(({name, low, high}) => ({name, low, high})),
  characters: characters.map(({name, vector}) => ({name, vector})),
  questions: questions.map(({title, options}) => ({title, options: options.map(({text, v}) => ({text, v}))})),
};
const committed = JSON.parse(await readFile(new URL('../public/quiz-data.json', import.meta.url), 'utf8'));
assert.deepEqual(committed, expected, 'public/quiz-data.json 已过期，请运行 npm run sync');

// 2) Edge Function 里的匹配算法必须与 Docker 版逐题结果一致。
configure(committed);
const random = (() => {let seed = 20261012; return () => {seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648;};})();
const pick = (n) => Math.floor(random() * n);
let checked = 0;
for (let round = 0; round < 3000; round++) {
  const answers = Array.from({length: questions.length}, () => pick(4));
  const local = canonical(answers, 'local');
  const edge = edgeCalculate(answers, 'edge');
  assert.equal(edge.name, local.name);
  assert.equal(edge.secondary, local.secondary);
  assert.deepEqual(edge.scores, local.scores);
  assert.deepEqual(edge.evidence, local.evidence);
  assert.equal(edge.difference, local.difference);
  checked++;
}
for (const bad of [[], Array(16).fill(4), Array(16).fill(1).map((v, i) => (i === 3 ? 1.5 : v))]) {
  assert.throws(() => canonical(bad, 'local'));
  assert.throws(() => edgeCalculate(bad, 'edge'));
}
console.log('PASS: quiz-data.json 与前端题库一致，Edge Function 匹配算法在 ' + checked + ' 组随机作答上与 Docker 版结果完全相同。');
