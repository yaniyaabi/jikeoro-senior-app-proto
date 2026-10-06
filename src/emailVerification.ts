const EMAIL_VERIFICATION_KEY = "jikeoro-email-verification-v1";
const VERIFICATION_LIFETIME_MS = 5 * 60 * 1000;

type EmailVerification = {
  email: string;
  code: string;
  expiresAt: number;
  verified: boolean;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function readVerification(): EmailVerification | null {
  try {
    const value = sessionStorage.getItem(EMAIL_VERIFICATION_KEY);
    return value ? JSON.parse(value) as EmailVerification : null;
  } catch {
    return null;
  }
}

export function issueEmailVerificationCode(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  const verification: EmailVerification = { email: normalizedEmail, code, expiresAt: Date.now() + VERIFICATION_LIFETIME_MS, verified: false };
  sessionStorage.setItem(EMAIL_VERIFICATION_KEY, JSON.stringify(verification));
  return code;
}

export function verifyEmailCode(email: string, code: string) {
  const verification = readVerification();
  if (!verification || verification.email !== normalizeEmail(email) || verification.expiresAt < Date.now() || verification.code !== code.trim()) return false;
  sessionStorage.setItem(EMAIL_VERIFICATION_KEY, JSON.stringify({ ...verification, verified: true }));
  return true;
}

export function isEmailVerified(email: string) {
  const verification = readVerification();
  return Boolean(verification && verification.email === normalizeEmail(email) && verification.expiresAt >= Date.now() && verification.verified);
}

export function clearEmailVerification() {
  sessionStorage.removeItem(EMAIL_VERIFICATION_KEY);
}
