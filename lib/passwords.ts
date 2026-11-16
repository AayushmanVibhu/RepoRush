import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SETTINGS = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
export const DUMMY_PASSWORD_HASH = `scrypt$v1$131072$8$1$${"1a".repeat(16)}$${"00".repeat(64)}`;
export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 128) return null;
  const username = value.trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,29}$/.test(username)
    ? username.toLowerCase()
    : null;
}
export function validNewPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 256 &&
    value.trim().length > 0 &&
    Array.from(value).length >= 15 &&
    Array.from(value).length <= 128
  );
}
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, SETTINGS, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}
export async function hashPassword(password: string): Promise<string> {
  if (!validNewPassword(password))
    throw Error("Password must contain 15 to 128 characters.");
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$v1$131072$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
}
export async function verifyPassword(
  password: unknown,
  encoded: string,
): Promise<boolean> {
  if (
    typeof password !== "string" ||
    password.length > 256 ||
    !password ||
    Array.from(password).length > 128
  )
    return false;
  const parts = encoded.split("$");
  if (
    parts.length !== 7 ||
    parts.slice(0, 5).join("$") !== "scrypt$v1$131072$8$1" ||
    !/^[a-f0-9]{32}$/.test(parts[5]) ||
    !/^[a-f0-9]{128}$/.test(parts[6])
  )
    return false;
  const derived = await derive(password, Buffer.from(parts[5], "hex"));
  return timingSafeEqual(derived, Buffer.from(parts[6], "hex"));
}
