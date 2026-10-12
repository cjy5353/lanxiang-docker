import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
export async function database(){
 const pg=await PGlite.create();
 await pg.exec('create role anon; create role authenticated; create role lx_app bypassrls;');
 await pg.exec(await readFile(new URL('../db/01-schema.sql',import.meta.url),'utf8'));
 return pg;
}
export {databaseFetch as postgrest} from '../server/database.mjs';

// Supabase 版结构：角色名与线上一致，迁移文件来自 supabase/migrations/。
export async function supabaseDatabase(){
 const pg=await PGlite.create();
 await pg.exec('create role anon; create role authenticated; create role service_role bypassrls;');
 const dir=new URL('../supabase/migrations/',import.meta.url);
 for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort())await pg.exec(await readFile(new URL(name,dir),'utf8'));
 return pg;
}
