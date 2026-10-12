import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createHandler} from './handler.ts';
import {databaseFetch} from './database.mjs';

export function createServer({pg,env,staticDir=resolve('dist')}) {
 const handle=createHandler({env:k=>env[k],fetch:databaseFetch(pg)});
 const primaryOrigin=env.CLIENT_ORIGINS.split(',')[0].trim();
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};
 return http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('X-Frame-Options','DENY');
  try {
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/healthz'&&req.method==='GET') {
    await pg.query('select 1');res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"ok":true}');return;
   }
   if(url.pathname.startsWith('/api/assessment-api/')) {
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>12000){res.writeHead(413,{'Content-Type':'application/json'});res.end('{"error":"请求内容过大。"}');return;}chunks.push(chunk);}
    const headers=new Headers();
    for(const key of ['origin','content-type','x-app-token','x-test-session'])if(typeof req.headers[key]==='string')headers.set(key,req.headers[key]);
    if(!headers.has('origin'))headers.set('origin',primaryOrigin);
    // Forwarded IPs are trusted only behind an owner-controlled reverse proxy.
    const ip=env.TRUST_PROXY==='1'&&typeof req.headers['x-forwarded-for']==='string'?req.headers['x-forwarded-for'].split(',')[0].trim():req.socket.remoteAddress||'unknown';
    headers.set('x-forwarded-for',ip);
    const response=await handle(new Request(primaryOrigin+url.pathname+url.search,{
     method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})
    }));
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
   }
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
   if(url.pathname==='/admin'){res.writeHead(308,{Location:'/admin/'});res.end();return;}
   const pathname=decodeURIComponent(url.pathname);
   const file=resolve(staticDir,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
   if(!file.startsWith(resolve(staticDir)+sep)){res.writeHead(404);res.end();return;}
   let info;try{info=await stat(file)}catch{res.writeHead(404);res.end('Not found');return;}
   if(!info.isFile()){res.writeHead(404);res.end();return;}
   res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache'});
   res.end(req.method==='HEAD'?undefined:await readFile(file));
  }catch(e){console.error('HTTP request failed:',e instanceof Error?e.message:'unknown');if(!res.headersSent)res.writeHead(503);res.end('Service temporarily unavailable');}
 });
}
