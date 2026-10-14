import {calculate} from './assessment.ts';
type Dependencies={env:(key:string)=>string|undefined;fetch:typeof fetch};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encode=(s:string)=>new TextEncoder().encode(s);
const hex=(buffer:ArrayBuffer)=>Array.from(new Uint8Array(buffer),x=>x.toString(16).padStart(2,'0')).join('');
export async function hash(s:string){return hex(await crypto.subtle.digest('SHA-256',encode(s)))}
function equal(a:string,b:string){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0}
export function createHandler(deps:Dependencies){
 const setting=(key:string)=>{const value=deps.env(key);if(!value)throw new Error('Missing server configuration: '+key);return value};
 const signing=()=>deps.env('SESSION_SIGNING_KEY')||setting('ADMIN_SECRET');
 const key=()=>crypto.subtle.importKey('raw',encode(signing()),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
 const sign=async(raw:string)=>hex(await crypto.subtle.sign('HMAC',await key(),encode(raw)));
 const issue=async(scope:string,value:string)=>{const raw=scope+'.'+value+'.'+(Date.now()+86400000);return raw+'.'+await sign(raw)};
 const verify=async(token:string,scope:string)=>{
   const p=token.split('.');if(p.length!==4||p[0]!==scope||!/^\d+$/.test(p[2])||Number(p[2])<=Date.now()||!/^[a-f0-9]{64}$/.test(p[3]))return null;
   const signature=Uint8Array.from(p[3].match(/../g)!,x=>parseInt(x,16));
   return await crypto.subtle.verify('HMAC',await key(),signature,encode(p.slice(0,3).join('.')))?p[1]:null;
 };
 const rest=async(path:string,method='GET',payload?:unknown)=>{
   const r=await deps.fetch('http://internal/rest/v1/'+path,{
     method,headers:{'Content-Type':'application/json',Prefer:'return=representation'},
     ...(payload===undefined?{}:{body:JSON.stringify(payload)}),signal:AbortSignal.timeout(15000)
   });
   if(!r.ok)throw new Error('Database request failed ('+r.status+')');
   return await r.json();
 };
 const rpc=(name:string,payload:unknown)=>rest('rpc/'+name,'POST',payload);
 const lookup=async(h:string)=>{
   const rows=await rest('lx_codes?hash=eq.'+h+'&select=hash,label,disabled,created');
   if(!rows[0]||rows[0].disabled)return null;
   const sessions=await rest('lx_sessions?code_hash=eq.'+h+'&select=id');
   return {...rows[0],used:sessions.length};
 };
 const input=async(req:Request)=>{
   if(Number(req.headers.get('content-length'))>12000)throw new Error('input');
   const text=await req.text();if(text.length>12000)throw new Error('input');
   try{return JSON.parse(text)}catch{throw new Error('input')}
 };
 const limit=async(req:Request,scope:string)=>{
   const ip=(req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim();
   const allowed=await rpc('lx_rate_limit',{p_key:await hash(scope+':'+ip),p_now:Date.now(),p_max:30});
   if(!allowed)return false;
   if(scope==='admin')return await rpc('lx_rate_limit',{p_key:await hash('admin:global'),p_now:Date.now(),p_max:300});
   return true;
 };
 return async(req:Request):Promise<Response>=>{
   const origin=req.headers.get('origin')||'';
   const origins=(deps.env('CLIENT_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean);
   const cors:Record<string,string>={'Vary':'Origin','Cache-Control':'no-store'};
   if(origins.includes(origin)){
     cors['Access-Control-Allow-Origin']=origin;
     cors['Access-Control-Allow-Methods']='GET, POST, OPTIONS';
     cors['Access-Control-Allow-Headers']='content-type, apikey, x-app-token, x-test-session';
     cors['Access-Control-Max-Age']='600';
   }
   const json=(data:unknown,status=200)=>Response.json(data,{status,headers:cors});
   if(!origins.includes(origin))return json({error:'访问地址未授权，请联系演示管理员。'},403);
   if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
   if(!['GET','POST'].includes(req.method))return json({error:'请求方法不支持。'},405);
   try{
     const prefix='/assessment-api/';
     const url=new URL(req.url);
     const marker=url.pathname.indexOf(prefix);
     const path=marker>=0?url.pathname.slice(marker+prefix.length):'';
     const method=req.method;
     const access=()=>verify(req.headers.get('x-app-token')||'','access');
     const admin=()=>verify(req.headers.get('x-app-token')||'','admin');
     const sid=req.headers.get('x-test-session')||'';
     if(path==='me'&&method==='GET'){
       const h=await access();const a=h?await lookup(h):null;
       return json({unlocked:!!a,remaining:a?Math.max(0,3-a.used):0});
     }
     if(path==='unlock'&&method==='POST'){
       if(!await limit(req,'unlock'))return json({error:'尝试过于频繁，请15分钟后再试。'},429);
       const b=await input(req);const code=String(b.code||'').trim().toUpperCase();
       if(!/^LX-[A-Z0-9]{12}$/.test(code))return json({error:'密码无效，请检查后重新输入。'},400);
       const h=await hash(code);const a=await lookup(h);
       if(!a)return json({error:'密码无效或已停用，请联系演示管理员。'},400);
       if(a.used>=3)return json({error:'这个密码的3次测试额度已用完。'},409);
       return json({remaining:3-a.used,accessToken:await issue('access',h)});
     }
     if(path==='start'&&method==='POST'){
       const h=await access();if(!h)return json({error:'请先输入有效密码。'},401);
       const b=await input(req);if(typeof b.nonce!=='string'||!uuid.test(b.nonce))return json({error:'请求无效，请刷新重试。'},400);
       const r=await rpc('lx_start_test',{p_hash:h,p_nonce:b.nonce,p_now:Date.now()});
       if(r.error)return json({error:r.error==='quota'?'这个密码的3次测试额度已用完。':'密码或请求无效，请重新验证密码。'},r.error==='quota'?409:400);
       return json(r);
     }
     if(path==='session'&&method==='GET'){
       if(!uuid.test(sid))return json({error:'本次测试不存在。'},404);
       const rows=await rest('lx_sessions?id=eq.'+sid+'&select=result_id');
       return rows[0]?json({resultId:rows[0].result_id}):json({error:'本次测试不存在。'},404);
     }
     if(path==='submit'&&method==='POST'){
       if(!uuid.test(sid))return json({error:'请先开始测试。'},401);
       const rows=await rest('lx_sessions?id=eq.'+sid+'&select=result');
       if(!rows[0])return json({error:'本次测试不存在。'},401);
       if(rows[0].result)return json(rows[0].result);
       const b=await input(req);let result;
       try{if(!Array.isArray(b.answers))throw new Error();result=calculate(b.answers,crypto.randomUUID())}
       catch{return json({error:'请完成全部16道题后再提交。'},400)}
       const saved=await rpc('lx_save_result',{p_session:sid,p_result:result});
       return saved?json(saved):json({error:'本次测试不存在。'},401);
     }
     if(path.startsWith('result/')&&method==='GET'){
       const id=path.slice(7);
       if(!uuid.test(id))return json({error:'结果链接无效。'},404);
       const rows=await rest('lx_sessions?result_id=eq.'+id+'&select=result');
       return rows[0]?.result?json(rows[0].result):json({error:'未找到这份结果，请检查分享链接。'},404);
     }
     if(path==='admin/login'&&method==='POST'){
       if(!await limit(req,'admin'))return json({error:'尝试过于频繁，请15分钟后再试。'},429);
       const b=await input(req);
       if(!equal(await hash(String(b.password||'')),await hash(setting('ADMIN_SECRET'))))return json({error:'管理密码不正确。'},401);
       return json({ok:true,adminToken:await issue('admin','owner')});
     }
     if(path==='admin/logout'&&method==='POST')return json({ok:true});
     if(path.startsWith('admin/')){
       if(!await admin())return json({error:'请先登录管理页。'},401);
       if(path==='admin/codes'&&method==='GET'){
         const codes=await rest('lx_codes?select=hash,label,disabled,created,code&order=created.desc&limit=500');
         const counts=await rpc('lx_code_usage',{p_hashes:codes.map((c:any)=>c.hash)});
         const used=new Map(counts.map((c:any)=>[c.code_hash,Number(c.used)]));
         return json({codes:codes.map((c:any)=>({...c,used:used.get(c.hash)||0}))});
       }
       if(path==='admin/generate'&&method==='POST'){
         const b=await input(req);const n=Number(b.count);
         if(!Number.isInteger(n)||n<1||n>100)return json({error:'每批请生成1至100个密码。'},400);
         const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const codes:string[]=[];const rows=[];
         for(let i=0;i<n;i++){
           const code='LX-'+Array.from(crypto.getRandomValues(new Uint8Array(12)),x=>alphabet[x%32]).join('');
           codes.push(code);rows.push({hash:await hash(code),label:code.slice(-4),disabled:0,created:Date.now(),code});
         }
         await rest('lx_codes','POST',rows);return json({codes});
       }
       if(path==='admin/toggle'&&method==='POST'){
         const b=await input(req);
         if(typeof b.hash!=='string'||!/^[a-f0-9]{64}$/.test(b.hash)||typeof b.disabled!=='boolean')return json({error:'参数无效。'},400);
         await rest('lx_codes?hash=eq.'+b.hash,'PATCH',{disabled:b.disabled?1:0});return json({ok:true});
       }
     }
     return json({error:'未找到此接口。'},404);
   }catch(e){
     if(e instanceof Error&&e.message==='input')return json({error:'请求内容无效。'},400);
     console.error('Assessment API request failed',e instanceof Error?e.message:'unknown');
     return json({error:'测评服务暂时不可用，请稍后重试。'},503);
   }
 };
}
