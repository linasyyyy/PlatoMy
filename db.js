import pg from "pg";

const url = process.env.DATABASE_URL;
const pool = url
  ? new pg.Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
    })
  : null;

const lastSaved = new Map();

export async function loadWallets(wallets) {
  if (!pool) {
    console.warn("DATABASE_URL tiada: data TIDAK akan disimpan selepas restart.");
    return;
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platomy_wallets (
        discord_id TEXT PRIMARY KEY,
        coins BIGINT NOT NULL DEFAULT 0,
        pips BIGINT NOT NULL DEFAULT 0,
        exp BIGINT NOT NULL DEFAULT 0,
        sponsor_total BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`ALTER TABLE platomy_wallets ADD COLUMN IF NOT EXISTS exp BIGINT NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE platomy_wallets ADD COLUMN IF NOT EXISTS sponsor_total BIGINT NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE platomy_wallets ADD COLUMN IF NOT EXISTS exp_total BIGINT NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE platomy_wallets ADD COLUMN IF NOT EXISTS sponsor_monthly BIGINT NOT NULL DEFAULT 0`);
    await pool.query(`UPDATE platomy_wallets SET exp_total = exp WHERE exp_total = 0 AND exp > 0`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS platomy_leaderboard_config (
        category TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Jadual Birthday Corner (Config & Tarikh Lahir Ahli)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platomy_birthday_config (
        id INT PRIMARY KEY DEFAULT 1,
        channel_id TEXT NOT NULL,
        chat_channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS platomy_birthdays (
        discord_id TEXT PRIMARY KEY,
        day INT NOT NULL,
        month INT NOT NULL,
        celebrated_year INT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await pool.query("SELECT * FROM platomy_wallets");
    for (const r of rows) {
      const w = {
        coins: Number(r.coins || 0),
        pips: Number(r.pips || 0),
        exp: Number(r.exp || 0),
        expTotal: Number(r.exp_total || 0),
        sponsorTotal: Number(r.sponsor_total || 0),
        sponsorMonthly: Number(r.sponsor_monthly || 0),
      };
      wallets.set(r.discord_id, w);
      lastSaved.set(r.discord_id, JSON.stringify(w));
    }
    console.log(`✅ ${rows.length} wallet dimuatkan dari PostgreSQL.`);
  } catch (e) {
    console.error("Gagal memuat wallet dari PostgreSQL:", e.message);
  }
}

async function saveChanged(wallets) {
  if (!pool) return;
  for (const [id, w] of wallets) {
    const snap = JSON.stringify(w);
    if (lastSaved.get(id) === snap) continue;
    try {
      await pool.query(
        `INSERT INTO platomy_wallets (discord_id, coins, pips, exp, exp_total, sponsor_total, sponsor_monthly, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (discord_id) DO UPDATE SET
           coins = EXCLUDED.coins,
           pips = EXCLUDED.pips,
           exp = EXCLUDED.exp,
           exp_total = EXCLUDED.exp_total,
           sponsor_total = EXCLUDED.sponsor_total,
           sponsor_monthly = EXCLUDED.sponsor_monthly,
           updated_at = NOW()`,
        [id, w.coins, w.pips, w.exp, w.expTotal || 0, w.sponsorTotal, w.sponsorMonthly || 0]
      );
      lastSaved.set(id, snap);
    } catch (e) {
      console.error("Gagal simpan wallet", id, e.message);
    }
  }
}

export async function loadLeaderboardConfigsDB() {
  if (!pool) return {};
  try {
    const { rows } = await pool.query("SELECT category, channel_id, message_id FROM platomy_leaderboard_config");
    const configs = {};
    for (const r of rows) {
      configs[r.category] = { channelId: r.channel_id, messageId: r.message_id };
    }
    return configs;
  } catch (e) {
    console.error("Gagal memuat leaderboard config:", e.message);
    return {};
  }
}

export async function saveLeaderboardConfigDB(category, channelId, messageId) {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO platomy_leaderboard_config (category, channel_id, message_id, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (category) DO UPDATE SET
         channel_id = EXCLUDED.channel_id,
         message_id = EXCLUDED.message_id,
         updated_at = NOW()`,
      [category, channelId, messageId]
    );
  } catch (e) {
    console.error("Gagal simpan leaderboard config:", e.message);
  }
}

// --- BIRTHDAY DB ---
export async function loadBirthdayDataDB() {
  if (!pool) return { config: null, users: {} };
  try {
    const cfgRes = await pool.query("SELECT channel_id, chat_channel_id, message_id FROM platomy_birthday_config WHERE id = 1");
    const usersRes = await pool.query("SELECT discord_id, day, month, celebrated_year FROM platomy_birthdays");

    const config = cfgRes.rows[0]
      ? {
          channelId: cfgRes.rows[0].channel_id,
          chatChannelId: cfgRes.rows[0].chat_channel_id,
          messageId: cfgRes.rows[0].message_id,
        }
      : null;

    const users = {};
    for (const r of usersRes.rows) {
      users[r.discord_id] = {
        day: Number(r.day),
        month: Number(r.month),
        celebratedYear: r.celebrated_year ? Number(r.celebrated_year) : null,
      };
    }
    return { config, users };
  } catch (e) {
    console.error("Gagal memuat data birthday:", e.message);
    return { config: null, users: {} };
  }
}

export async function saveBirthdayConfigDB(channelId, chatChannelId, messageId) {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO platomy_birthday_config (id, channel_id, chat_channel_id, message_id, updated_at)
       VALUES (1, $1, $2, $3, NOW())
       ON CONFLICT (id) DO UPDATE SET
         channel_id = EXCLUDED.channel_id,
         chat_channel_id = EXCLUDED.chat_channel_id,
         message_id = EXCLUDED.message_id,
         updated_at = NOW()`,
      [channelId, chatChannelId, messageId]
    );
  } catch (e) {
    console.error("Gagal simpan birthday config:", e.message);
  }
}

export async function saveUserBirthdayDB(discordId, day, month, celebratedYear = null) {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO platomy_birthdays (discord_id, day, month, celebrated_year, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (discord_id) DO UPDATE SET
         day = EXCLUDED.day,
         month = EXCLUDED.month,
         celebrated_year = EXCLUDED.celebrated_year,
         updated_at = NOW()`,
      [discordId, day, month, celebratedYear]
    );
  } catch (e) {
    console.error("Gagal simpan birthday user:", e.message);
  }
}

export function startAutosave(wallets) {
  if (!pool) return;
  setInterval(() => saveChanged(wallets), 15000);
  const flush = async () => {
    await saveChanged(wallets);
    process.exit(0);
  };
  process.once("SIGTERM", flush);
  process.once("SIGINT", flush);
}
