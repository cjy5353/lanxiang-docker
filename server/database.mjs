export function databaseFetch(pg){
 return async(url,options={})=>{
   const u=new URL(url);const path=u.pathname.replace('/rest/v1/','');
   const b=options.body?JSON.parse(options.body):null;
   try{
     let rows;
     if(path.startsWith('rpc/')){
       const name=path.slice(4);const signatures={
         lx_start_test:['p_hash','p_nonce','p_now'],lx_save_result:['p_session','p_result'],
         lx_rate_limit:['p_key','p_now','p_max'],lx_code_usage:['p_hashes']
       };
       const keys=signatures[name];if(!keys)throw new Error('Unknown RPC');
       const args=keys.map(k=>b[k]);
       if(name==='lx_save_result')args[1]=JSON.stringify(args[1]);
       const params=keys.map((_,i)=>'$'+(i+1)).join(',');
       if(name==='lx_code_usage')rows=(await pg.query('select * from public.'+name+'('+params+')',args)).rows;
       else rows=(await pg.query('select public.'+name+'('+params+') as value',args)).rows[0].value;
     }else{
       const table=path;
       if(!['lx_codes','lx_sessions'].includes(table))throw new Error('Unknown table');
       if(options.method==='POST'){
         if(table!=='lx_codes'||!Array.isArray(b)||b.length<1||b.length>100)throw new Error('Bad insert');
         const fields=['hash','label','disabled','created'];
         const args=[];
         const values=b.map(row=>{
           if(Object.keys(row).some(k=>!fields.includes(k)))throw new Error('Bad field');
           return '('+fields.map(k=>{args.push(row[k]);return '$'+args.length}).join(',')+')';
         });
         rows=(await pg.query('insert into public.lx_codes('+fields.join(',')+') values '+values.join(',')+' returning *',args)).rows;
       }else{
         const filters=[];const args=[];
         for(const [k,v]of u.searchParams){
           if(['select','order','limit'].includes(k))continue;
           if(!['hash','id','result_id','code_hash'].includes(k)||!v.startsWith('eq.'))throw new Error('Bad filter');
           args.push(v.slice(3));filters.push(k+'=$'+args.length);
         }
         const where=filters.length?' where '+filters.join(' and '):'';
         if(options.method==='PATCH'){
           const i=args.length;args.push(b.disabled);
           rows=(await pg.query('update public.'+table+' set disabled=$'+(i+1)+where+' returning *',args)).rows;
         }else{
           const cols=u.searchParams.get('select')||'*';
           const valid=table==='lx_codes'?['hash','label','disabled','created']:['id','code_hash','nonce','created','result_id','result'];
           if(cols!=='*'&&cols.split(',').some(k=>!valid.includes(k)))throw new Error('Bad select');
           const order=u.searchParams.has('order')?' order by created desc':'';
           const n=Number(u.searchParams.get('limit'));
           if(u.searchParams.has('limit')&&(!Number.isInteger(n)||n<1||n>500))throw new Error('Bad limit');
           const limit=u.searchParams.has('limit')?' limit '+n:'';
           rows=(await pg.query('select '+cols+' from public.'+table+where+order+limit,args)).rows;
         }
       }
     }
     return Response.json(rows);
   }catch(e){return Response.json({message:e.message},{status:400})}
 };
}
