// Outils partagés : sessions signées, cookies et appels à l'API Discord.

export const API = "https://discord.com/api/v10";

export function env(name) {
  const value = process.env[name];
  if (!value) throw new Error("Variable d'environnement manquante : " + name);
  return value;
}

export function json(body, status = 200, headers) {
  const h = new Headers(headers);
  h.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers: h });
}

export function parseCookies(req) {
  const out = {};
  (req.headers.get("cookie") || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

export function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

const enc = new TextEncoder();

async function sign(data) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(env("SESSION_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return Buffer.from(await crypto.subtle.sign("HMAC", key, enc.encode(data))).toString("base64url");
}

function sameString(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Session : { id, username, name, exp }, valable 6 heures.
export async function makeSession(user) {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 6 * 3600 * 1000 })).toString("base64url");
  return payload + "." + (await sign(payload));
}

export async function readSession(req) {
  const raw = parseCookies(req).osiris_session;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  if (!sameString(await sign(payload), sig)) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, "base64url").toString());
    return user.exp > Date.now() ? user : null;
  } catch {
    return null;
  }
}

export function bot(path, init = {}) {
  return fetch(API + path, {
    ...init,
    headers: { Authorization: "Bot " + env("DISCORD_BOT_TOKEN"), "Content-Type": "application/json", ...(init.headers || {}) },
  });
}
