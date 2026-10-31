import pg from "pg";

const url = process.env.DATABASE_URL;
const pool = url
  ? new pg.Pool({
      connectionString: url,
      ssl: url.includes(".railway.internal") ? false : { rejectUnauthorized: false },
    })
  : null;

const lastSaved = new Map();

// Muat wallet dari PostgreSQL bila bot hidup (jadual baharu: platomy_wallets)
export async function loadWallets(wallets) {
  if (!pool) {
    console.warn("DATABASE_URL tiada: data wallet TIDAK akan disimpan selepas restart.");
    return;
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platomy_wallets (
        id TEXT PRIMARY KEY,
        coins BIGINT NOT NULL DEFAULT 0,
        pips BIGINT NOT NULL DEFAULT 0,
        exp BIGINT NOT NULL DEFAULT 0,
        sponsor_total BIGINT NOT NULL DEFAULT 0
      )
    `);
    const { rows } = await pool.query("SELECT * FROM platomy_wallets");
    for (const r of rows) {
      const w = { coins: Number(r.coins), pips: Number(r.pips), exp: Number(r.exp), sponsorTotal: Number(r.sponsor_total) };
      wallets.set(r.id, w);
      lastSaved.set(r.id, JSON.stringify(w));
    }
    console.log(`${rows.length} wallet dimuatkan dari PostgreSQL.`);
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
        `INSERT INTO platomy_wallets (id, coins, pips, exp, sponsor_total)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET
           coins = EXCLUDED.coins, pips = EXCLUDED.pips,
           exp = EXCLUDED.exp, sponsor_total = EXCLUDED.sponsor_total`,
        [id, w.coins, w.pips, w.exp, w.sponsorTotal]
      );
      lastSaved.set(id, snap);
    } catch (e) {
      console.error("Gagal simpan wallet", id, e.message);
    }
  }
}

// Autosave setiap 15 saat + simpan terakhir bila Railway restart/deploy
export function startAutosave(wallets) {
  if (!pool) return;
  setInterval(() => saveChanged(wallets), 15000);
  const flush = async () => { await saveChanged(wallets); process.exit(0); };
  process.once("SIGTERM", flush);
  process.once("SIGINT", flush);
}
