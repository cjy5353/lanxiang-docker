const accessKey = 'lx-docker-access-v1', adminKey = 'lx-docker-admin-v1';
// 部署到 GitHub Pages 时，用 VITE_API_BASE 指向 Supabase Edge Function 的完整地址；
// 未设置时保持 Docker 版的同源接口不变。
const configured = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
const apiBase = configured ? configured.replace(/\/+$/, '') + '/' : '/api/assessment-api/';
export async function api(path:string, body?:unknown, sid?:string):Promise<any> {
  const isAdmin = path.startsWith('admin/');
  const storageKey = isAdmin ? adminKey : accessKey;
  const token = sessionStorage.getItem(storageKey) || '';
  const headers:Record<string,string> = {};
  if(body!==undefined) headers['Content-Type']='application/json';
  if(sid) headers['X-Test-Session']=sid;
  if(token) headers['X-App-Token']=token;
  let response:Response;
  try {
    response=await fetch(apiBase+path,{
      method:body===undefined?'GET':'POST', headers,
      ...(body===undefined?{}:{body:JSON.stringify(body)}), signal:AbortSignal.timeout(20000)
    });
  } catch { throw new Error('无法连接测评服务，请检查网络或稍后重试。'); }
  const data=await response.json().catch(()=>({error:'测评服务响应异常。'}));
  if(!response.ok) {
    if(response.status===401) sessionStorage.removeItem(storageKey);
    throw new Error(data.error || '操作失败，请稍后重试。');
  }
  if(data.accessToken) sessionStorage.setItem(accessKey,data.accessToken);
  if(data.adminToken) sessionStorage.setItem(adminKey,data.adminToken);
  if(path==='admin/logout') sessionStorage.removeItem(adminKey);
  return data;
}
export const homeUrl = import.meta.env.BASE_URL;
export const adminUrl = homeUrl + 'admin/';
export const resultUrl = (id:string) => new URL(homeUrl + '?r=' + encodeURIComponent(id), location.origin).href;
