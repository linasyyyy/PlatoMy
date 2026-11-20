import pg from "pg";

const url = process.env.DATABASE_URL;
const pool = url
  ? new pg.Pool({
      connectionString: url,
      ssl: url.includes(".railway.internal") ? false : { rejectUnauthorized: false },
    })
  : null;

const lastSaved = new Map();

// Muat wallet dari PostgreSQL bila bot hidup (guna kolum discord_id)
export async function loadWallets(wallets) {
  if (!pool) {
    console.warn("DATABASE_URL tiada: data wallet TIDAK akan disimpan selepas restart.");
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

    // Tambah kolum exp & sponsor_total secara automatik jika belum ada
    await pool.query(`ALTER TABLE platomy_wallets ADD COLUMN IF NOT EXISTS exp BIGINT NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE platomy_wallets ADD COLUMN IF NOT EXISTS sponsor_total BIGINT NOT NULL DEFAULT 0`);

    // Jadual untuk simpan tetapan leaderboard (channelId & messageId)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platomy_leaderboard_config (
        category TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await pool.query("SELECT * FROM platomy_wallets");
    for (const r of rows) {
      const w = {
        coins: Number(r.coins || 0),
        pips: Number(r.pips || 0),
        exp: Number(r.exp || 0),
        sponsorTotal: Number(r.sponsor_total || 0),
      };
      wallets.set(r.discord_id, w);
      lastSaved.set(r.discord_id, JSON.stringify(w));
    }
    console.log(`✅ ${rows.length} wallet dimuatkan dari PostgreSQL.`);
  } catch (e) {
    console.error("Gagal memuat wallet dari PostgreSQL:", e.message);
  }
}

// Simpan hanya wallet yang berubah
async function saveChanged(wallets) {
  if (!pool) return;
  for (const [id, w] of wallets) {
    const snap = JSON.stringify(w);
    if (lastSaved.get(id) === snap) continue;
    try {
      await pool.query(
        `INSERT INTO platomy_wallets (discord_id, coins, pips, exp, sponsor_total, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (discord_id) DO UPDATE SET
           coins = EXCLUDED.coins,
           pips = EXCLUDED.pips,
           exp = EXCLUDED.exp,
           sponsor_total = EXCLUDED.sponsor_total,
           updated_at = NOW()`,
        [id, w.coins, w.pips, w.exp, w.sponsorTotal]
      );
      lastSaved.set(id, snap);
    } catch (e) {
      console.error("Gagal simpan wallet", id, e.message);
    }
  }
}

// Muat tetapan leaderboard dari PostgreSQL
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

// Simpan tetapan leaderboard ke PostgreSQL
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

// Autosave setiap 15 saat + simpan terakhir bila bot restart/deploy
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
