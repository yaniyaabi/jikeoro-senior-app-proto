import {apiJson,jsonBody} from './api-client';
export const REWARD_REQUESTS_KEY='jikeoro-reward-requests-v1';
export const REWARD_EXCHANGE_MINIMUM=500;
export type RewardRequest={id:string;applicantId:string;name:string;email:string;phone:string;points:number;exchangePoints:number;source:'app'|'web';status:'pending'|'sent';requestedAt:string;sentAt:string|null};
let cached:RewardRequest[]=[];
export function readRewardRequests():RewardRequest[] {return cached;}
export async function refreshRewardRequests(admin=false):Promise<RewardRequest[]> {
  try {
    const result=await apiJson<{requests:RewardRequest[]}>(admin?'/api/admin/rewards':'/api/rewards');
    cached=result.requests;return cached;
  } catch(error) {cached=[];throw error;}
}
export async function createRewardRequest(phone:string,source:'app'|'web') {
  await apiJson('/api/rewards',jsonBody({phone,source}));
  return await refreshRewardRequests();
}
export async function markRewardSent(id:string) {
  await apiJson(`/api/admin/rewards/${encodeURIComponent(id)}`,{...jsonBody({}),method:'PATCH'});
  return await refreshRewardRequests(true);
}
export function formatPhone(phone:string) {
  const digits=phone.replace(/\D/g,'');
  if(digits.length===11)return `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
  if(digits.length===10)return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
  return phone;
}
export const formatRewardPhone=formatPhone;
