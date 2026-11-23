import {apiJson,jsonBody} from './api-client';
import {normalizeResidentAvatar,type ResidentAvatarConfig} from './residentAvatar';
export type PrototypeUser={id:string;name:string;email:string;avatar:ResidentAvatarConfig};
export async function getPrototypeSession() {
  const result=await apiJson<{authenticated:boolean;user:PrototypeUser|null}>('/api/auth/session');
  return result.authenticated?result.user:null;
}
export async function registerPrototypeAccount(name:string,email:string,password:string) {
  const result=await apiJson<{user:PrototypeUser}>('/api/auth/register',jsonBody({name,email,password,avatar:normalizeResidentAvatar(null)}));
  return result.user;
}
export async function loginPrototypeAccount(email:string,password:string) {
  const result=await apiJson<{user:PrototypeUser}>('/api/auth/login',jsonBody({email,password}));return result.user;
}
export async function logoutPrototypeAccount() {await apiJson('/api/auth/logout',jsonBody({}));}
