export type PrototypeUser = {
  id: string;
  name: string;
  email: string;
};

type PrototypeAccount = PrototypeUser & {
  passwordHash: string;
  salt: string;
  createdAt: string;
};

const ACCOUNTS_KEY = "jikeoro-senior-accounts";
const SESSION_KEY = "jikeoro-senior-session";

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string, salt: string) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 120_000 }, material, 256);
  return bytesToHex(new Uint8Array(bits));
}

function readAccounts(): PrototypeAccount[] {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "[]") as PrototypeAccount[];
  } catch {
    return [];
  }
}

function saveSession(user: PrototypeUser) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
}

export function readPrototypeSession(): PrototypeUser | null {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as PrototypeUser | null;
  } catch {
    return null;
  }
}

export async function registerPrototypeAccount(name: string, email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const accounts = readAccounts();
  if (accounts.some((account) => account.email === normalizedEmail)) throw new Error("이미 가입된 이메일입니다. 로그인해주세요.");
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const account: PrototypeAccount = {
    id: `member-${crypto.randomUUID()}`,
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: await hashPassword(password, salt),
    salt,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([...accounts, account]));
  return saveSession({ id: account.id, name: account.name, email: account.email });
}

export async function loginPrototypeAccount(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const account = readAccounts().find((candidate) => candidate.email === normalizedEmail);
  if (!account || await hashPassword(password, account.salt) !== account.passwordHash) throw new Error("이메일 또는 비밀번호가 맞지 않습니다.");
  return saveSession({ id: account.id, name: account.name, email: account.email });
}

export function logoutPrototypeAccount() {
  sessionStorage.removeItem(SESSION_KEY);
}
