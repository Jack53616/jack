// Short-lived signed token for serving KYC images to <img> tags.
// <img> cannot send Authorization headers, so the image URL needs a credential
// in the query string. Instead of leaking the long-lived ADMIN_TOKEN there, we
// embed a 15-minute HMAC token scoped to a specific KYC id + side.
import crypto from "crypto";

const TTL_MS = 15 * 60 * 1000;

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not configured");
  return s;
}

export function signKycImageToken(id, side) {
  const exp = Date.now() + TTL_MS;
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(`${id}:${side}:${exp}`)
    .digest("hex");
  return `${exp}.${sig}`;
}

export function verifyKycImageToken(token, id, side) {
  if (!token || typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const exp = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!exp || Date.now() > exp) return false;

  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(`${id}:${side}:${exp}`)
    .digest("hex");

  let a, b;
  try {
    a = Buffer.from(sig, "hex");
    b = Buffer.from(expected, "hex");
  } catch {
    return false;
  }
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
