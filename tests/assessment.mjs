import assert from 'node:assert/strict';
import {characters,questions,calculate} from '../src/lib/assessment.ts';
const reached=new Map();
for(const c of characters){for(let restart=0;restart<20;restart++){let a=questions.map((_,i)=>(i+restart)%4);for(let pass=0;pass<12;pass++)for(let i=0;i<a.length;i++){let best=a[i],dist=Infinity;for(let k=0;k<4;k++){a[i]=k;const r=calculate(a,'test');const d=r.scores.reduce((s,x,j)=>s+(x-c.vector[j])**2,0);if(d<dist){dist=d;best=k}}a[i]=best;}const r=calculate(a,'test');if(r.name===c.name)reached.set(c.name,a);}}
assert.equal(reached.size,characters.length,'Every character must be reachable');
for(const [name,answers]of reached){const r=calculate(answers,'test');assert.equal(r.name,name);assert.equal(r.scores.length,6);assert.equal(r.evidence.length,2);assert.notEqual(r.name,r.secondary);assert(r.scores.every(x=>x>=0&&x<=100));assert.equal(calculate(answers,'test').name,r.name)}
for(const bad of [[],Array(16).fill(-1),Array(16).fill(4),Array(16).fill(.5)])assert.throws(()=>calculate(bad,'bad'));
console.log('PASS: 10/10 reachable characters, deterministic matching, six bounded dimensions, evidence, secondary match, invalid answer rejection.');
