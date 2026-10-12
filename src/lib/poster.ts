import {characters,dimensions,Result} from './assessment.ts';
export async function makePoster(result:Result):Promise<Blob>{
 await document.fonts.ready;
 const c=characters.find(x=>x.name===result.name)!;
 const second=characters.find(x=>x.name===result.secondary)!;
 const canvas=document.createElement('canvas');const scale=2,W=720;
 // Draw once at generous height, then crop to the measured content height.
 canvas.width=W*scale;canvas.height=4500*scale;const ctx=canvas.getContext('2d')!;ctx.scale(scale,scale);ctx.fillStyle='#f5f2e9';ctx.fillRect(0,0,W,4500);
 let y=70;const left=56,width=W-left*2;
 const font=(size:number,serif=false)=>`${size}px ${serif?'"Songti SC", "Noto Serif CJK SC", serif':'"PingFang SC", "Microsoft YaHei", sans-serif'}`;
 function text(s:string,size=24,color='#39453c',serif=false,line=1.8){ctx.font=font(size,serif);ctx.fillStyle=color;let row='';for(const char of Array.from(s)){if(char==='\n'||ctx.measureText(row+char).width>width){ctx.fillText(row,left,y);y+=size*line;row=char==='\n'?'':char;}else row+=char;}if(row){ctx.fillText(row,left,y);y+=size*line;}}
 function section(title:string,body:string){y+=24;ctx.strokeStyle='#d8dbcc';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(W-left,y);ctx.stroke();y+=48;text(title,27,c.color,true);y+=4;text(body,23);}
 text('兰 香 识 人 录',24,c.color,true);y+=26;text('你的剧中同频人物',22,'#7b8371');y+=18;text(c.name,64,c.color,true,1.5);text(c.type,30,c.color,true);text(c.tags.join('  ·  '),22,'#818771');y+=10;text(c.quote,28,c.color,true);text('签语为本站原创',17,'#8c927f');y+=10;text(c.intro,23);
 section('01  你的力量',c.strength);section('02  值得留意的一面',c.tension);section('03  六项处世倾向','分数表示你在两端之间的位置；没有好坏之分，也不是人物匹配准确率。');
 for(let i=0;i<dimensions.length;i++){const d=dimensions[i];text(d.name+'  '+result.scores[i]+'/100',23,c.color);ctx.fillStyle='#dee3d4';ctx.fillRect(left,y-12,width,9);ctx.fillStyle=c.color;ctx.fillRect(left,y-12,width*result.scores[i]/100,9);y+=24;ctx.font=font(17);ctx.fillStyle='#818771';ctx.fillText(d.low,left,y);ctx.fillText(d.high,W-left-ctx.measureText(d.high).width,y);y+=42;}
 section('04  从你的选择看见你','以下两项回答与主匹配原型较为接近，是本次结果的部分依据。');for(const e of result.evidence){text(e.title,23,c.color);text('你的选择：'+e.choice,22);y+=14;}
 section('05  你也有另一面',`${second.name} · ${second.type}\n${second.intro}`);text(result.difference,23);
 section('06  给现实生活的一点启发',c.advice);y+=30;text('生成日期：'+new Date(result.created).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'}),18,'#858b78');text('娱乐性测评，不作为心理诊断。\n人物标签与签语为本站原创，匹配部分处世倾向，不代表人物的全部行为。',17,'#858b78');
 y+=24;ctx.strokeStyle='#b7c2a8';ctx.strokeRect(24,24,W-48,y-4);
 const output=document.createElement('canvas');output.width=canvas.width;output.height=Math.ceil((y+44)*scale);output.getContext('2d')!.drawImage(canvas,0,0);
 return new Promise((resolve,reject)=>output.toBlob(b=>b?resolve(b):reject(new Error('图片生成失败，请重试。')),'image/png'));
}
