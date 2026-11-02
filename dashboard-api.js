import { EmbedBuilder, ChannelType, PermissionFlagsBits } from "discord.js";

const PINK = "#ff69b4";
const SUPPORT_EMAIL = "hello@platoteam.com";

export function registerDashboardApi({ app, client, wallets, getWallet, createRumble }) {
  // Admin tambahan (pilihan): ADMIN_IDS=123,456 di Railway. Selain itu, sesiapa yang
  // ada permission Administrator di mana-mana server bot ini dikira admin.
  const ADMIN_IDS = (process.env.ADMIN_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  const listings = [];
  let listingSeq = 1;

  // ---------- Helpers ----------
  const clean = (s, max) => String(s ?? "").trim().slice(0, max);
  const int = (v, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
  const handle = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (e) { console.error(e); res.status(500).json({ error: "Ralat pelayan: " + e.message }); }
  };

  const pageAuth = (req, res, next) => (req.isAuthenticated() ? next() : res.redirect("/login"));
  const apiAuth = (req, res, next) => (req.isAuthenticated() ? next() : res.status(401).json({ error: "Sila log masuk semula." }));

  async function isAdmin(userId) {
    if (ADMIN_IDS.includes(userId)) return true;
    for (const g of client.guilds.cache.values()) {
      try {
        const m = await g.members.fetch(userId);
        if (m.permissions.has(PermissionFlagsBits.Administrator)) return true;
      } catch {}
    }
    return false;
  }
  const requireAdmin = async (req, res, next) =>
    (await isAdmin(req.user.id)) ? next() : res.status(403).json({ error: "Admin sahaja." });

  function getChannels() {
    const out = [];
    client.guilds.cache.forEach(g => g.channels.cache.forEach(c => {
      if (c.type === ChannelType.GuildText) out.push({ id: c.id, name: c.name, guild: g.name });
    }));
    return out;
  }
  const getTextChannel = id => {
    const c = client.channels.cache.get(String(id));
    return c && c.type === ChannelType.GuildText ? c : null;
  };
  const findLogAny = name => {
    for (const g of client.guilds.cache.values()) {
      const c = g.channels.cache.find(ch => ch.name.toLowerCase().includes(name) && ch.isTextBased());
      if (c) return c;
    }
    return null;
  };

  // ---------- Halaman utama ----------
  app.get("/", pageAuth, handle(async (req, res) => {
    const admin = await isAdmin(req.user.id);
    const all = [...wallets.entries()].map(([id, d]) => ({
      id, name: client.users.cache.get(id)?.username || id, ...d,
    }));
    res.render("dashboard", {
      user: req.user,
      wallet: getWallet(req.user.id),
      allWallets: all,
      totalCoins: all.reduce((a, b) => a + b.coins, 0),
      totalPips: all.reduce((a, b) => a + b.pips, 0),
      botClient: client,
      isAdmin: admin,
      channels: admin ? getChannels() : [],
      listings: listings.filter(l => l.status === "open").slice().reverse(),
      supportEmail: SUPPORT_EMAIL,
    });
  }));

  // ---------- Kawalan Bot (Admin) ----------
  app.post("/api/bot/event", apiAuth, requireAdmin, handle(async (req, res) => {
    const ch = getTextChannel(req.body.channelId);
    const title = clean(req.body.title, 100), desc = clean(req.body.description, 1500);
    if (!ch) return res.status(400).json({ error: "Channel tidak sah." });
    if (!title || !desc) return res.status(400).json({ error: "Sila isi tajuk dan butiran." });

    const embed = new EmbedBuilder().setColor(PINK).setTitle(title)
      .setDescription(`${desc}\n\n🎀 Dianjurkan oleh: ${req.user.username}`)
      .setThumbnail(client.user.displayAvatarURL()).setTimestamp();
    await ch.send({ content: "✨ **Pengumuman Event Baharu!**", embeds: [embed] });

    const log = ch.guild.channels.cache.find(c => c.name.toLowerCase().includes("event-log") && c.isTextBased());
    if (log) await log.send({ embeds: [new EmbedBuilder().setColor(PINK).setTitle("🛡️・Event Log: New Event Created")
      .setDescription(`📌 **Tajuk:** ${title}\n📝 **Butiran:** ${desc}\n👤 **Admin (web):** <@${req.user.id}>`).setTimestamp()] }).catch(() => {});

    res.json({ message: `Event "${title}" dihantar ke #${ch.name}!` });
  }));

  app.post("/api/bot/rumble", apiAuth, requireAdmin, handle(async (req, res) => {
    const ch = getTextChannel(req.body.channelId);
    const currency = req.body.currency === "pips" ? "pips" : "coins";
    const prize = int(req.body.prize, 1, 1e9), mins = int(req.body.duration, 1, 10080);
    if (!ch) return res.status(400).json({ error: "Channel tidak sah." });
    if (!prize || !mins) return res.status(400).json({ error: "Hadiah dan tempoh diperlukan." });

    await createRumble(ch, currency, prize, mins);
    res.json({ message: `Rumble ${prize.toLocaleString()} ${currency} bermula di #${ch.name}!` });
  }));

  app.post("/api/bot/announce", apiAuth, requireAdmin, handle(async (req, res) => {
    const ch = getTextChannel(req.body.channelId);
    const title = clean(req.body.title, 200), message = clean(req.body.message, 3000), image = clean(req.body.image, 500);
    let color = clean(req.body.color, 7);
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) color = PINK;
    if (!ch) return res.status(400).json({ error: "Channel tidak sah." });
    if (!title && !message && !image) return res.status(400).json({ error: "Isi sekurang-kurangnya satu medan." });

    const embed = new EmbedBuilder().setColor(color);
    if (title) embed.setTitle(title);
    if (message) embed.setDescription(message);
    if (/^https?:\/\//.test(image)) embed.setImage(image);
    await ch.send({ embeds: [embed] });
    res.json({ message: `Embed dihantar ke #${ch.name}!` });
  }));

  app.post("/api/wallet/adjust", apiAuth, requireAdmin, handle(async (req, res) => {
    const targetId = clean(req.body.targetId, 40).replace(/[<@!>]/g, "");
    const amount = int(req.body.amount, 1, 1e9), reason = clean(req.body.reason, 200) || "Tiada sebab dinyatakan";
    const type = ["coins", "pips", "sponsor"].includes(req.body.assetType) ? req.body.assetType : null;
    const deduct = req.body.action === "deduct";
    if (!/^\d{5,25}$/.test(targetId) || !amount || !type) return res.status(400).json({ error: "Discord ID, jenis aset dan jumlah tidak sah." });

    const w = getWallet(targetId);
    const key = type === "sponsor" ? "sponsorTotal" : type;
    w[key] = Math.max(0, w[key] + (deduct ? -amount : amount));

    const log = findLogAny("wallet-log");
    if (log) await log.send({ embeds: [new EmbedBuilder().setColor(PINK).setTitle(`💳・Wallet Log (Web): ${deduct ? "Deduct" : "Add"} ${type}`)
      .setDescription(`👤 **Target:** <@${targetId}> (\`${targetId}\`)\n🛡️ **Admin:** <@${req.user.id}>\n📝 **Jumlah:** ${amount.toLocaleString()}\n📌 **Reason:** ${reason}\n\n🪙 \`${w.coins.toLocaleString()}\` • 💠 \`${w.pips.toLocaleString()}\` • 🌸 \`${w.sponsorTotal.toLocaleString()}\``).setTimestamp()] }).catch(() => {});

    res.json({ message: `${deduct ? "Menolak" : "Menambah"} ${amount.toLocaleString()} ${type} ${deduct ? "daripada" : "kepada"} ${targetId}!` });
  }));

  // ---------- Trading Plato Item (papan di website) ----------
  const TYPES = { jual: "💰 Jual", beli: "🛒 Beli", tukar: "🔄 Tukar" };

  app.post("/api/trade", apiAuth, handle(async (req, res) => {
    const item = clean(req.body.item, 80), notes = clean(req.body.notes, 300);
    const type = TYPES[req.body.type] ? req.body.type : null;
    const price = clean(req.body.price, 40);
    const currency = ["Coins", "Pips", "RM", "Tukar item"].includes(req.body.currency) ? req.body.currency : "Coins";
    if (!item || !type) return res.status(400).json({ error: "Nama item dan jenis diperlukan." });
    if (listings.filter(l => l.userId === req.user.id && l.status === "open").length >= 5)
      return res.status(400).json({ error: "Maksimum 5 listing aktif. Tutup listing lama dahulu." });

    const l = { id: listingSeq++, userId: req.user.id, username: req.user.username, item, type, price, currency, notes, status: "open", createdAt: Date.now() };
    listings.push(l);

    const log = findLogAny("trading-log");
    if (log) await log.send({ embeds: [new EmbedBuilder().setColor(PINK).setTitle(`📦 Trading #${l.id}: ${TYPES[type]}`)
      .setDescription(`🎁 **Item:** ${item}\n💎 **Harga:** ${price ? `${price} ${currency}` : "Runding"}\n📝 **Nota:** ${notes || "-"}\n👤 **Penjual/Pembeli:** <@${l.userId}>`)
      .setFooter({ text: "PlatoMy Trading • via Web Dashboard" }).setTimestamp()] }).catch(() => {});

    res.json({ message: "Listing berjaya dipaparkan!" });
  }));

  const tradeAction = status => handle(async (req, res) => {
    const l = listings.find(x => x.id === parseInt(req.params.id, 10));
    if (!l) return res.status(404).json({ error: "Listing tidak dijumpai." });
    if (l.userId !== req.user.id && !(await isAdmin(req.user.id))) return res.status(403).json({ error: "Bukan listing anda." });
    l.status = status;
    res.json({ message: status === "sold" ? "Ditanda selesai." : "Listing dipadam." });
  });
  app.post("/api/trade/:id/close", apiAuth, tradeAction("sold"));
  app.post("/api/trade/:id/delete", apiAuth, tradeAction("deleted"));
}
