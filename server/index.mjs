import pg from 'pg';
import {createServer} from './http.mjs';
for(const [key,min] of [['ADMIN_SECRET',24],['SESSION_SIGNING_KEY',32],['PGPASSWORD',24]]) {
 if(!process.env[key]||process.env[key].length<min)throw new Error(key+' must be configured; run setup first.');
}
const origins=(process.env.PUBLIC_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
if(!origins.length)throw new Error('PUBLIC_ORIGINS is required.');
for(const origin of origins){const u=new URL(origin);if(!['http:','https:'].includes(u.protocol)||u.origin!==origin)throw new Error('PUBLIC_ORIGINS must contain origins without a trailing slash or path.');}
const pool=new pg.Pool({max:10,connectionTimeoutMillis:10000,idleTimeoutMillis:30000});
pool.on('error',e=>console.error('Database connection failed:',e.message));
await pool.query('select 1 from public.lx_codes limit 1');
const server=createServer({pg:pool,env:{...process.env,CLIENT_ORIGINS:origins.join(',')}});
server.requestTimeout=30000;server.headersTimeout=15000;
server.listen(3000,'0.0.0.0',()=>console.log('Lanxiang site listening on port 3000'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(async()=>{await pool.end();process.exit(0)});setTimeout(()=>process.exit(1),10000).unref();});
