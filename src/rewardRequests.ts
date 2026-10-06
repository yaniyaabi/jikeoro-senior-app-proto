export const REWARD_REQUESTS_KEY = "jikeoro-reward-requests-v1";
export const REWARD_EXCHANGE_MINIMUM = 500;

export type RewardRequest = {
  id: string;
  applicantId: string;
  name: string;
  email: string;
  phone: string;
  points: number;
  exchangePoints: number;
  source: "app" | "web";
  status: "pending" | "sent";
  requestedAt: string;
  sentAt: string | null;
};

export function readRewardRequests(): RewardRequest[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(REWARD_REQUESTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeRewardRequests(requests: RewardRequest[]) {
  localStorage.setItem(REWARD_REQUESTS_KEY, JSON.stringify(requests));
}

export function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}
