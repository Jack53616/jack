// ===========================================================================
// Trade fee model (v7.0)
// ---------------------------------------------------------------------------
// On a WINNING trade close, the company + Turkey fees are deducted from the
// gross profit; the user receives only the NET, and the total fee is credited
// automatically to the admin fee account and logged in `fee_transfers`.
//
//   Company fee: 20% (VIP) / 30% (normal)  — VIP = users.custom_rank === 'VIP'
//   Turkey fee : 3% for users whose country is 'TR'
//   Losses / break-even: no fees (credited as-is).
//
// This module is the SINGLE source of truth — every trade-close path must call
// applyTradeFees() so fees are applied consistently.
// ===========================================================================
import { query as poolQuery } from "../config/db.js";

export const ADMIN_FEE_TG_ID = process.env.FEE_ADMIN_TG_ID || "1262317603";

const r2 = (n) => Number((Number(n) || 0).toFixed(2));

export function isVipUser(user) {
  return String(user?.custom_rank || "").trim().toUpperCase() === "VIP";
}

/**
 * Pure fee breakdown for a gross profit. No side effects.
 */
export function computeTradeFees(grossProfit, { isVip = false, isTurkey = false } = {}) {
  const profit = Number(grossProfit) || 0;
  if (profit <= 0) {
    return { gross: r2(profit), companyRate: 0, companyFee: 0, turkeyFee: 0, turkeyRate: 0, totalFee: 0, net: r2(profit), isVip: !!isVip };
  }
  const companyRate = isVip ? 20 : 30;
  const companyFee = r2(profit * companyRate / 100);
  const turkeyRate = isTurkey ? 3 : 0;
  const turkeyFee = r2(profit * turkeyRate / 100);
  const totalFee = r2(companyFee + turkeyFee);
  const net = r2(profit - totalFee);
  return { gross: r2(profit), companyRate, companyFee, turkeyRate, turkeyFee, totalFee, net, isVip: !!isVip };
}

/**
 * Apply fees for a closed trade.
 * Returns { net, fees } where `net` is the amount that should be credited to the
 * user (full pnl for losses/break-even). Credits the total fee to the admin
 * account and records the breakdown in fee_transfers. Crediting/logging failures
 * never block the trade close (the user always gets their net).
 *
 * @param {object} opts
 * @param {object} opts.user   - user row (needs id, tg_id, name, custom_rank, country)
 * @param {number} opts.grossPnl
 * @param {number|null} opts.tradeId
 * @param {string|null} opts.tradeRef
 * @param {Function} [opts.q]  - query fn (pass a transaction client.query to stay atomic)
 */
export async function applyTradeFees({ user, grossPnl, tradeId = null, tradeRef = null, q = poolQuery }) {
  const pnl = Number(grossPnl) || 0;
  if (pnl <= 0) {
    return { net: r2(pnl), fees: computeTradeFees(pnl) };
  }

  const vip = isVipUser(user);
  const turkey = String(user?.country || "").trim().toUpperCase() === "TR";
  const f = computeTradeFees(pnl, { isVip: vip, isTurkey: turkey });

  if (f.totalFee > 0) {
    // Credit the admin fee account (never block the user's close on failure).
    try {
      const admin = await q("SELECT id FROM users WHERE tg_id = $1", [ADMIN_FEE_TG_ID]);
      if (admin.rows.length > 0 && admin.rows[0].id !== user.id) {
        await q("UPDATE users SET balance = balance + $1 WHERE id = $2", [f.totalFee, admin.rows[0].id]);
        await q(
          "INSERT INTO ops (user_id, type, amount, note) VALUES ($1, 'fee_in', $2, $3)",
          [admin.rows[0].id, f.totalFee, `Trade fee from ${user.name || user.tg_id} (trade ${tradeId ?? tradeRef ?? ""})`]
        );
      }
    } catch (e) { /* swallow: user still gets net; fee logged below */ }

    // Audit log
    try {
      await q(
        `INSERT INTO fee_transfers (trade_id, trade_ref, user_id, tg_id, user_name, gross_profit, company_fee, company_fee_rate, turkey_fee, total_fee, net_profit, is_vip)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [tradeId, tradeRef, user.id, user.tg_id, user.name || null, f.gross, f.companyFee, f.companyRate, f.turkeyFee, f.totalFee, f.net, vip]
      );
    } catch (e) { /* logging must not block close */ }
  }

  return { net: f.net, fees: f };
}
