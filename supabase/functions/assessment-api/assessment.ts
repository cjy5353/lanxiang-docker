// Edge Function 里的题库与匹配逻辑。
//
// 题库数据来自 public/quiz-data.json（由 scripts/build-quiz-data.mjs 从 src/lib/assessment.ts 生成），
// 通过 configure() 注入。算法与 Docker 版 server/assessment.ts 完全一致，
// tests/edge-data.mjs 会在随机答题样本上逐个结果比对，防止两边走样。

export type QuizData = {
  dimensions: {name: string; low: string; high: string}[];
  characters: {name: string; vector: number[]}[];
  questions: {title: string; options: {text: string; v: number[]}[]}[];
};
export type Result = {id:string;name:string;secondary:string;scores:number[];evidence:{title:string;choice:string}[];difference:string;created:string;version:number};

let data: QuizData | null = null;

export function configure(quiz: QuizData): void {
  data = quiz;
}

export function calculate(answers:number[], id:string):Result {
 if(!data) throw new Error('题库未加载。');
 const {dimensions,characters,questions}=data;
 if(answers.length!==questions.length||answers.some((x,i)=>!Number.isInteger(x)||!questions[i].options[x])) throw new Error('请完成全部题目后再提交。');
 const scores=dimensions.map((_,d)=>Math.round(answers.reduce((s,a,i)=>s+questions[i].options[a].v[d],0)/answers.length));
 const rank=characters.map(c=>({c,dist:c.vector.reduce((s,x,d)=>s+(x-scores[d])**2,0)})).sort((a,b)=>a.dist-b.dist);
 const match=rank[0].c;
 const evidence=answers.map((a,i)=>({i,dist:questions[i].options[a].v.reduce((s,x,d)=>s+(x-match.vector[d])**2,0)})).sort((a,b)=>a.dist-b.dist).slice(0,2).map(({i})=>({title:questions[i].title,choice:questions[i].options[answers[i]].text}));
 const diff=match.vector.map((x,d)=>({d,delta:scores[d]-x})).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta))[0];
 return {id,name:match.name,secondary:rank[1].c.name,scores,evidence,difference:`与这个人物原型相比，你在「${dimensions[diff.d].name}」上更靠近「${diff.delta>=0?dimensions[diff.d].high:dimensions[diff.d].low}」。这也是你自己的独特之处。`,created:new Date().toISOString(),version:1};
}
