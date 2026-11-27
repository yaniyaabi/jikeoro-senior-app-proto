import { MAX_FILE_BYTES, uploadLimitMessage } from './media-policy';
const networkFetch=globalThis.fetch.bind(globalThis);
const TOKEN_KEY='jikeoro-local-session-v1';
const API_BASE=(import.meta.env.VITE_API_BASE_URL??'').replace(/\/$/,'');
export function apiUrl(path:string) {return `${API_BASE}${path.startsWith('/')?path:`/${path}`}`;}
function token() {try{return window.localStorage.getItem(TOKEN_KEY);}catch{return null;}}
function setToken(value:string|null) {
  if(token()===value)return;
  if(value)window.localStorage.setItem(TOKEN_KEY,value);else window.localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event('jikeoro-session-change'));
}
export async function apiFetch(path:string,init:RequestInit={}) {
  const headers=new Headers(init.headers),accessToken=token();
  if(accessToken)headers.set('Authorization',`Bearer ${accessToken}`);
  const response=await networkFetch(apiUrl(path),{...init,headers,credentials:'omit',cache:'no-store'});
  if(response.status===401)setToken(null);
  if(['/api/auth/login','/api/auth/admin-login','/api/auth/register'].includes(path) && response.ok) {
    const data=await response.clone().json();
    if(typeof data.accessToken==='string')setToken(data.accessToken);
  }
  if(path==='/api/auth/logout')setToken(null);
  return response;
}
export async function apiJson<T=Record<string,unknown>>(path:string,init:RequestInit={}):Promise<T> {
  const response=await apiFetch(path,init);
  const data=await response.json().catch(()=>({error:'서버 응답을 확인하지 못했습니다.'}));
  if(!response.ok)throw new Error(data.error||'요청을 처리하지 못했습니다.');
  return data as T;
}
export function jsonBody(body:unknown):RequestInit {return {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};}
export async function uploadMedia(reportId:string,file:Blob,name:string,kind:string) {
  if(file.size>MAX_FILE_BYTES)throw new Error(uploadLimitMessage(file,kind));
  return await apiJson(`/api/reports/${encodeURIComponent(reportId)}/media`,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','X-File-Name':encodeURIComponent(name),'X-Media-Kind':kind},body:file});
}
