import { supabase } from "./supabase";
import { normalizeResidentAvatar, type ResidentAvatarConfig } from "./residentAvatar";

export type PrototypeUser = {
  id: string;
  name: string;
  email: string;
  avatar: ResidentAvatarConfig;
};

function authErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "이메일 또는 비밀번호가 맞지 않습니다.";
  if (normalized.includes("already registered") || normalized.includes("already been registered")) return "이미 가입된 이메일입니다. 로그인해주세요.";
  if (normalized.includes("password")) return "비밀번호는 8자 이상 입력해주세요.";
  if (normalized.includes("email")) return "이메일 주소를 확인해주세요.";
  return "로그인 정보를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

async function toPrototypeUser(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }): Promise<PrototypeUser> {
  const email = user.email ?? "";
  const metadataName = typeof user.user_metadata?.name === "string" ? user.user_metadata.name.trim() : "";
  const { data: profile } = await supabase.from("profiles").select("name,avatar").eq("id", user.id).maybeSingle();
  return {
    id: user.id,
    name: profile?.name || metadataName || email.split("@")[0] || "지킴이",
    email,
    avatar: normalizeResidentAvatar(profile?.avatar ?? user.user_metadata?.avatar),
  };
}

export async function getPrototypeSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) return null;
  return await toPrototypeUser(data.session.user);
}

export async function registerPrototypeAccount(name: string, email: string, password: string, avatar: ResidentAvatarConfig) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { name: name.trim(), avatar: normalizeResidentAvatar(avatar) } },
  });
  if (error) throw new Error(authErrorMessage(error.message));
  if (!data.user || !data.session) throw new Error("회원가입은 완료됐지만 바로 로그인하지 못했습니다. 관리자에게 이메일 확인 설정을 문의해주세요.");
  return await toPrototypeUser(data.user);
}

export async function loginPrototypeAccount(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error || !data.user) throw new Error(authErrorMessage(error?.message ?? "invalid login credentials"));
  return await toPrototypeUser(data.user);
}

export async function logoutPrototypeAccount() {
  await supabase.auth.signOut();
}
