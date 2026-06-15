// ===========================================================================
// Telegram WebApp authentication middleware
// ---------------------------------------------------------------------------
// Verifies the signed `initData` that Telegram injects into every Mini App.
// The REAL user id is taken ONLY from verified initData — never from a tg_id
// supplied by the client. This closes the "trust client tg_id" vulnerability.
//
// How identity is enforced without rewriting every controller:
//   - req.tgId / req.tgUser are set from the verified payload.
//   - req.body.tg_id is overwritten with the verified id (body is writable).
//   - For path params (:tg_id) use enforceTgIdParam as a router.param handler.
//   - For query-string identity, controllers should prefer req.tgId.
//
// Emergency rollback: set TELEGRAM_AUTH_REQUIRED=false to temporarily stop
// blocking (logs a warning instead). This re-opens the vulnerability and must
// only be used to recover from an incident.
// ===========================================================================
import crypto from "crypto";
import logger from "../config/logger.js";

const BOT_TOKEN = process.env.BOT_TOKEN;

// Optional freshness window for initData (seconds). 0 / unset = signature only.
const MAX_AGE = Number(process.env.TELEGRAM_INITDATA_MAX_AGE || 0);

// Default: enforce. Set to "false" ONLY for emergency rollback.
const ENFORCE =
  String(process.env.TELEGRAM_AUTH_REQUIRED ?? "true").toLowerCase() !== "false";

/**
 * Verify Telegram Mini App initData using the bot token (HMAC-SHA256).
 * Returns { user, authDate } on success, or null on failure.
 */
export function verifyTelegramInitData(initData, botToken = BOT_TOKEN) {
  if (!initData || !botToken) return null;

  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }

  const hash = params.get("hash");
  if (!hash) return null;

  // Telegram's HMAC is computed over all fields except `hash`.
  params.delete("hash");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  // Code-point sort, matching Telegram's reference implementation (NOT localeCompare).
  const codepointSort = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  const computeHash = (entries) => {
    const dcs = entries.slice().sort(codepointSort).map(([k, v]) => `${k}=${v}`).join("\n");
    return crypto.createHmac("sha256", secret).update(dcs).digest("hex");
  };
  const matches = (computed) => {
    try {
      const a = Buffer.from(computed, "hex");
      const b = Buffer.from(hash, "hex");
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  };

  const entries = Array.from(params.entries());
  // The newer `signature` field's inclusion in the HMAC check string has varied
  // across Telegram clients/docs. Accept either interpretation — both still
  // require a valid bot-token HMAC, so this does not weaken verification.
  let ok = matches(computeHash(entries));
  if (!ok && params.has("signature")) {
    ok = matches(computeHash(entries.filter(([k]) => k !== "signature")));
  }
  if (!ok) return null;

  let user = null;
  try {
    user = JSON.parse(params.get("user") || "null");
  } catch {
    user = null;
  }

  const authDate = Number(params.get("auth_date") || 0);
  return { user, authDate };
}

function extractInitData(req) {
  // Preferred: dedicated header. Fallback: Authorization: tma <initData>
  const headerVal = req.headers["x-telegram-init-data"];
  if (headerVal) return headerVal;
  const auth = req.headers["authorization"] || "";
  if (auth.toLowerCase().startsWith("tma ")) return auth.slice(4);
  // Last resort: initData sent in the request body (the activation flow posts it
  // there). It is still cryptographically verified below, so reading it from the
  // body is exactly as safe as the header — the tg_id is never trusted directly.
  if (req.body && typeof req.body === "object" && typeof req.body.initData === "string" && req.body.initData) {
    return req.body.initData;
  }
  return null;
}

function deny(res) {
  return res.status(401).json({ ok: false, error: "Unauthorized" });
}

/**
 * Require a valid Telegram session. On success, attaches the verified identity
 * and overwrites any client-supplied tg_id in the body.
 */
export function requireTelegramAuth(req, res, next) {
  const initData = extractInitData(req);
  const verified = verifyTelegramInitData(initData);

  const valid =
    verified &&
    verified.user &&
    verified.user.id &&
    (MAX_AGE <= 0 ||
      !verified.authDate ||
      Math.floor(Date.now() / 1000) - verified.authDate <= MAX_AGE);

  if (valid) {
    const tgId = String(verified.user.id);
    req.tgId = tgId;
    req.tgUser = verified.user;
    // Neutralise client-supplied identity in the body.
    if (req.body && typeof req.body === "object") {
      req.body.tg_id = tgId;
    }
    return next();
  }

  if (ENFORCE) {
    const reason = !initData ? "no initData sent" : "initData failed verification";
    logger.warn(`[TG AUTH FAIL] ${reason} | IP: ${req.ip} | Path: ${req.originalUrl}`);
    return deny(res);
  }

  // Emergency rollback mode: do not block, but flag that identity is unverified.
  logger.warn(`[TG AUTH BYPASS] enforcement disabled | Path: ${req.originalUrl}`);
  req.tgAuthUnverified = true;
  return next();
}

/**
 * router.param handler for ':tg_id' — forces the path param to the verified id.
 * Must be registered together with requireTelegramAuth.
 */
export function enforceTgIdParam(req, res, next, value) {
  if (req.tgId) {
    req.params.tg_id = req.tgId;
  }
  return next();
}
