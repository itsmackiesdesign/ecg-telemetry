import { cookies } from "next/headers";
import { env } from "cloudflare:workers";

export type AppRole = "doctor" | "manager";
export type AppUser = { id: string; email: string; displayName: string; role: AppRole };
const COOKIE = "pp_session";
const SESSION_DAYS = 14;

function db() { return (env as unknown as { DB?: D1Database }).DB; }
function bytesToBase64(bytes: Uint8Array) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function base64ToBytes(value: string) { const binary = atob(value); return Uint8Array.from(binary, char => char.charCodeAt(0)); }
async function digest(value: Uint8Array | string) { const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value; return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)); }
async function derivePassword(password: string, salt: Uint8Array) { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password) as BufferSource, "PBKDF2", false, ["deriveBits"]); const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt as BufferSource, iterations: 120000, hash: "SHA-256" }, key, 256); return new Uint8Array(bits); }
function equal(a: Uint8Array, b: Uint8Array) { if (a.length !== b.length) return false; let result = 0; for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i]; return result === 0; }
export async function hashPassword(password: string) { const salt = crypto.getRandomValues(new Uint8Array(16)); const hash = await derivePassword(password, salt); return { salt: bytesToBase64(salt), hash: bytesToBase64(hash) }; }
export async function verifyPassword(password: string, salt: string, expected: string) { try { return equal(await derivePassword(password, base64ToBytes(salt)), base64ToBytes(expected)); } catch { return false; } }
export async function createSession(user: AppUser, secure = true) { const token = bytesToBase64(crypto.getRandomValues(new Uint8Array(32))); const tokenHash = bytesToBase64(await digest(token)); const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString(); const database = db(); if (!database) throw new Error("auth_not_configured"); await database.prepare("INSERT INTO app_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), user.id, tokenHash, expires).run(); const jar = await cookies(); jar.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: SESSION_DAYS * 86400 }); }
export async function clearSession(secure = true) { const jar = await cookies(); const token = jar.get(COOKIE)?.value; if (token && db()) await db()!.prepare("DELETE FROM app_sessions WHERE token_hash = ?").bind(bytesToBase64(await digest(token))).run(); jar.set(COOKIE, "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 }); }
export async function getAppUser(): Promise<AppUser | null> { const token = (await cookies()).get(COOKIE)?.value; if (!token || !db()) return null; const tokenHash = bytesToBase64(await digest(token)); const row = await db()!.prepare("SELECT u.id, u.email, u.display_name, u.role, s.expires_at FROM app_sessions s JOIN app_users u ON u.id = s.user_id WHERE s.token_hash = ?").bind(tokenHash).first<{ id: string; email: string; display_name: string; role: AppRole; expires_at: string }>(); if (!row || Date.parse(row.expires_at) <= Date.now()) { if (row) await db()!.prepare("DELETE FROM app_sessions WHERE token_hash = ?").bind(tokenHash).run(); return null; } return { id: row.id, email: row.email, displayName: row.display_name, role: row.role }; }
export { COOKIE as APP_SESSION_COOKIE };
