import bcrypt from "bcrypt";
import { query } from "../config/db.js";
import { signRoleToken } from "../services/authTokens.js";
import { transferFromOfficialAgentWallet } from "../services/officialAgentWallet.service.js";
import { createOfficialAgentReport } from "../services/report.service.js";

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: "Username and password are required" });
    }

    const result = await query(
      `SELECT * FROM official_agents WHERE username = $1 AND is_active = TRUE`,
      [username.trim()]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    const agent = result.rows[0];
    const valid = await bcrypt.compare(password, agent.password_hash);
    if (!valid) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    await query(`UPDATE official_agents SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`, [agent.id]);
    const token = signRoleToken({ role: "official_agent", officialAgentId: agent.id }, "24h");

    res.json({
      ok: true,
      token,
      officialAgent: {
        id: agent.id,
        username: agent.username,
        name: agent.name,
        wallet_name: agent.wallet_name
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

export const me = async (req, res) => {
  res.json({ ok: true, officialAgent: req.officialAgent });
};

export const getDashboard = async (req, res) => {
  try {
    const officialAgentId = req.officialAgent.id;
    const [walletResult, usersResult, openTradesResult, closedTradesResult, profitsResult] = await Promise.all([
      query(
        `SELECT balance, total_allocated, total_sent FROM official_agent_wallets WHERE official_agent_id = $1`,
        [officialAgentId]
      ),
      query(
        `SELECT COUNT(*) AS total_users,
                COALESCE(SUM(ref_count), 0) AS total_referrals
         FROM (
           SELECT u.id,
                  (SELECT COUNT(*) FROM referrals r WHERE r.referrer_tg_id = u.tg_id) AS ref_count
           FROM users u
         ) stats`,
        []
      ),
      query(
        `SELECT COUNT(*) AS count FROM (
           SELECT id FROM trades WHERE status = 'open'
           UNION ALL
           SELECT id FROM mass_trade_user_trades WHERE status = 'open'
           UNION ALL
           SELECT id FROM custom_trades WHERE status = 'open'
         ) q`,
        []
      ),
      query(
        `SELECT COUNT(*) AS count FROM trades_history`,
        []
      ),
      query(
        `SELECT COALESCE(SUM(pnl), 0) AS total_profit FROM trades_history`,
        []
      )
    ]);

    const wallet = walletResult.rows[0] || { balance: 0, total_allocated: 0, total_sent: 0 };
    const users = usersResult.rows[0] || { total_users: 0, total_referrals: 0 };

    res.json({
      ok: true,
      data: {
        wallet: {
          wallet_name: req.officialAgent.wallet_name,
          balance: Number(wallet.balance || 0),
          total_allocated: Number(wallet.total_allocated || 0),
          total_sent: Number(wallet.total_sent || 0)
        },
        stats: {
          total_users: Number(users.total_users || 0),
          total_referrals: Number(users.total_referrals || 0),
          open_trades: Number(openTradesResult.rows[0]?.count || 0),
          closed_trades: Number(closedTradesResult.rows[0]?.count || 0),
          total_profit: Number(profitsResult.rows[0]?.total_profit || 0)
        }
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

export const getUsers = async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.tg_id, u.name, u.balance, u.country, u.created_at,
              (SELECT COUNT(*) FROM referrals r WHERE r.referrer_tg_id = u.tg_id) AS referral_count,
              (SELECT COUNT(*) FROM trades t WHERE t.user_id = u.id AND t.status = 'open')
              + (SELECT COUNT(*) FROM mass_trade_user_trades mt WHERE mt.user_id = u.id AND mt.status = 'open')
              + (SELECT COUNT(*) FROM custom_trades ct WHERE ct.user_id = u.id AND ct.status = 'open') AS open_trades_count
       FROM users u
       ORDER BY u.created_at DESC
       LIMIT 300`
    );
    res.json({ ok: true, users: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

export const getWallet = async (req, res) => {
  try {
    const officialAgentId = req.officialAgent.id;
    const [walletResult, transactionsResult] = await Promise.all([
      query(`SELECT * FROM official_agent_wallets WHERE official_agent_id = $1`, [officialAgentId]),
      query(
        `SELECT * FROM official_agent_wallet_transactions WHERE official_agent_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [officialAgentId]
      )
    ]);
    res.json({
      ok: true,
      wallet: walletResult.rows[0] || { balance: 0, total_allocated: 0, total_sent: 0 },
      transactions: transactionsResult.rows
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

export const transferBalance = async (req, res) => {
  try {
    const { user_id, amount, note } = req.body;
    if (!user_id) return res.status(400).json({ ok: false, error: "user_id is required" });
    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid amount" });
    }

    const transfer = await transferFromOfficialAgentWallet({
      officialAgentId: req.officialAgent.id,
      userId: Number(user_id),
      amount: amountValue,
      note: note || `Transfer from official agent ${req.officialAgent.name}`,
      walletNameSnapshot: req.officialAgent.wallet_name
    });

    res.json({ ok: true, message: "Balance transferred successfully", transfer });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
};

export const getTodayTradeTimes = async (req, res) => {
  try {
    const scheduled = await query(
      `SELECT id, symbol, scheduled_time, scheduled_date, created_at
       FROM mass_trades
       WHERE scheduled_date = CURRENT_DATE::text
         AND scheduled_time IS NOT NULL
       ORDER BY scheduled_time ASC`
    );
    const regular = await query(
      `SELECT id, symbol, opened_at FROM trades WHERE DATE(opened_at) = CURRENT_DATE ORDER BY opened_at ASC LIMIT 100`
    );
    const custom = await query(
      `SELECT id, symbol, opened_at FROM custom_trades WHERE DATE(opened_at) = CURRENT_DATE ORDER BY opened_at ASC LIMIT 100`
    );

    res.json({
      ok: true,
      times: [
        ...scheduled.rows.map((row) => ({ type: "scheduled", symbol: row.symbol, time: row.scheduled_time })),
        ...regular.rows.map((row) => ({ type: "regular", symbol: row.symbol, time: new Date(row.opened_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) })),
        ...custom.rows.map((row) => ({ type: "custom", symbol: row.symbol, time: new Date(row.opened_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) }))
      ]
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

export const getOpenTrades = async (req, res) => {
  try {
    const result = await query(
      `SELECT 'regular' AS trade_type, t.id, t.symbol, t.direction, t.pnl, t.opened_at, u.name AS user_name, u.tg_id
       FROM trades t JOIN users u ON u.id = t.user_id WHERE t.status = 'open'
       UNION ALL
       SELECT 'mass' AS trade_type, mt.id, mt.symbol, mt.direction, mt.pnl, mt.opened_at, u.name AS user_name, u.tg_id
       FROM mass_trade_user_trades mt JOIN users u ON u.id = mt.user_id WHERE mt.status = 'open'
       UNION ALL
       SELECT 'custom' AS trade_type, ct.id, ct.symbol, ct.direction, ct.pnl, ct.opened_at, u.name AS user_name, u.tg_id
       FROM custom_trades ct JOIN users u ON u.id = ct.user_id WHERE ct.status = 'open'
       ORDER BY opened_at DESC`
    );
    res.json({ ok: true, trades: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

export const getClosedTrades = async (req, res) => {
  try {
    const result = await query(
      `SELECT th.id, th.symbol, th.direction, th.pnl, th.opened_at, th.closed_at, u.name AS user_name, u.tg_id
       FROM trades_history th
       JOIN users u ON u.id = th.user_id
       ORDER BY th.closed_at DESC
       LIMIT 200`
    );
    res.json({ ok: true, trades: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

export const getProfits = async (req, res) => {
  try {
    const [summary, byUser] = await Promise.all([
      query(`SELECT COALESCE(SUM(pnl),0) AS total_profit, COUNT(*) AS total_trades FROM trades_history`),
      query(
        `SELECT u.id, u.name, u.tg_id, COALESCE(SUM(th.pnl),0) AS profit, COUNT(*) AS trades_count
         FROM users u
         LEFT JOIN trades_history th ON th.user_id = u.id
         GROUP BY u.id, u.name, u.tg_id
         ORDER BY profit DESC
         LIMIT 100`
      )
    ]);
    res.json({ ok: true, summary: summary.rows[0], users: byUser.rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

export const createReport = async (req, res) => {
  try {
    const { reported_user_id, reason } = req.body;
    if (!reported_user_id) {
      return res.status(400).json({ ok: false, error: "reported_user_id is required" });
    }
    const report = await createOfficialAgentReport({
      officialAgentId: req.officialAgent.id,
      reportedUserId: Number(reported_user_id),
      reason
    });
    res.json({ ok: true, report });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
};

export const getReports = async (req, res) => {
  try {
    const result = await query(
      `SELECT r.*, u.name AS reported_user_name, u.tg_id AS reported_user_tg_id
       FROM official_agent_reports r
       JOIN users u ON u.id = r.reported_user_id
       WHERE r.official_agent_id = $1
       ORDER BY r.created_at DESC`,
      [req.officialAgent.id]
    );
    res.json({ ok: true, reports: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

export const getKycRequests = async (req, res) => {
  try {
    const statusFilter = req.query.status;
    let sql = `SELECT k.id, k.user_id, k.tg_id, k.first_name, k.last_name, k.country_name, k.document_type, k.status, k.submitted_at, k.reviewed_at, u.name AS user_name
       FROM kyc_verifications k
       LEFT JOIN users u ON u.id = k.user_id
       WHERE k.status != 'draft'`;
    const params = [];
    if (statusFilter && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
      params.push(statusFilter);
      sql += ` AND k.status = $${params.length}`;
    }
    sql += ` ORDER BY COALESCE(k.submitted_at, k.created_at) DESC LIMIT 200`;
    const result = await query(sql, params);
    res.json({ ok: true, requests: result.rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};
