import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
}

/** Minimum bar for a self-hosted internal HR tool: length + a mix of character classes. */
export function checkPasswordPolicy(plain: string): PasswordPolicyResult {
  const errors: string[] = [];
  if (plain.length < 10) errors.push("Password must be at least 10 characters.");
  if (!/[a-z]/.test(plain)) errors.push("Password must include a lowercase letter.");
  if (!/[A-Z]/.test(plain)) errors.push("Password must include an uppercase letter.");
  if (!/[0-9]/.test(plain)) errors.push("Password must include a digit.");
  return { valid: errors.length === 0, errors };
}
