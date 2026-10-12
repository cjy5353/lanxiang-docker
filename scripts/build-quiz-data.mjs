// 从 src/lib/assessment.ts 生成 public/quiz-data.json。
// Edge Function 只在计算匹配时需要 dimensions / characters.vector / questions，
// 因此这里只导出这些字段，既保证与前端题库同源，也不用到函数里再抄一份数据。
import {writeFile} from 'node:fs/promises';
import {dimensions, characters, questions} from '../src/lib/assessment.ts';

const data = {
  dimensions: dimensions.map(({name, low, high}) => ({name, low, high})),
  characters: characters.map(({name, vector}) => ({name, vector})),
  questions: questions.map(({title, options}) => ({title, options: options.map(({text, v}) => ({text, v}))})),
};
await writeFile(new URL('../public/quiz-data.json', import.meta.url), JSON.stringify(data, null, 2) + '\n');
console.log('已生成 public/quiz-data.json：' + data.characters.length + ' 位人物、' + data.questions.length + ' 道题。');
