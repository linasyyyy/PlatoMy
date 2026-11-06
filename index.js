import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} from "discord.js";
import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import path from "path";
import { fileURLToPath } from "url";
import { registerDashboardApi } from "./dashboard-api.js";
import { loadWallets, startAutosave } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("RALAT: DISCORD_TOKEN tidak ditemui di dalam Environment Variables!");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const wallets = new Map();
const giveawaysMap = new Map(); // kosong, diperlukan oleh dashboard-api.js
const rumbleMap = new Map();
const acceptedTrades = new Set();

function getWallet(id) {
  if (!wallets.has(id)) wallets.set(id, { coins: 0, pips: 0, exp: 0, sponsorTotal: 0 });
  return wallets.get(id);
}

// Muat data dari PostgreSQL dan autosave (perlu DATABASE_URL di Railway)
await loadWallets(wallets);
startAutosave(wallets);

// --- TETAPAN BOT ---
const WALLET_LOG_CHANNEL_NAME = "wallet-log";
const EVENT_LOG_CHANNEL_NAME = "event-log";
const TRADING_LIST_CHANNEL_NAME = "trading-list"; // channel permintaan item (private untuk role Trade)
const TRADING_LOG_CHANNEL_NAME = "trading-log";   // log: requester + accepter
const TRADE_ROLE_NAME = "trade";                  // role yang boleh Accept Trade (nama mengandungi perkataan ini)
const TRADER_ROLE_NAME = "trader";                // role yang di-ping bila ada trading list baru
const TRADE_CATEGORY_ID = "1567527038368223332";  // category untuk channel trade sementara
const LOGO_URL = "https://cdn.discordapp.com/attachments/1549051773438787724/1549403998686281808/IMG_5614.png";

const isAdmin = (i) => i.member?.permissions?.has(PermissionFlagsBits.Administrator);
const isUrl = (u) => /^https?:\/\/\S+$/i.test(String(u || "").trim());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const findChannel = (guild, part) =>
  guild.channels.cache.find((c) => c.name.toLowerCase().includes(part) && c.isTextBased());

// Tukar kod hex jadi nombor warna. Kalau kosong/tak sah, bagi null (container tanpa warna)
const accent = (c) => {
  const v = String(c || "").trim().replace("#", "");
  return /^[0-9a-fA-F]{6}$/.test(v) ? parseInt(v, 16) : null;
};

function getMalaysiaTime() {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ================= CONTAINER (Components V2) =================
const V2 = MessageFlags.IsComponentsV2;
const V2_EPHEMERAL = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const NO_PING = { parse: [] }; // mention nampak tapi tak ping
const sep = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
const txt = (content) => new TextDisplayBuilder().setContent(content);

// Container umum: tajuk + garisan + isi + footer kecil (tanpa warna)
function info(title, body, footer = null) {
  const box = new ContainerBuilder()
    .addTextDisplayComponents(txt(`## ${title}`))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(body));
  if (footer) box.addTextDisplayComponents(txt(`-# ${footer}`));
  return box;
}

// Kumpul semua teks dalam mesej container (untuk baca butiran item semasa Accept)
function collectText(components, out = []) {
  for (const c of components || []) {
    const t = c.content ?? c.data?.content;
    if (typeof t === "string") out.push(t);
    if (c.components) collectText(c.components, out);
  }
  return out;
}

// ================= WALLET =================
const BANK_FOOTER = "⋆˚࿔ 🎀 PlatoMy Bank 𝜗𝜚˚⋆";
const bankFooter = () => `${BANK_FOOTER} • Today at ${getMalaysiaTime()}`;

// Baris baki (digunakan oleh wallet dan wallet log)
function balanceLines(w) {
  return (
    `╰┈➤ 🪙 Plato Coins: ${w.coins.toLocaleString()}\n` +
    `╰┈➤ 💠 Pips: ${w.pips.toLocaleString()}\n` +
    `╰┈➤ 🌸 Total Sponsor: ${w.sponsorTotal.toLocaleString()}`
  );
}

// Wallet pemain (/wallet dan !wallet)
function walletBox(w) {
  return new ContainerBuilder()
    .addTextDisplayComponents(txt("# ˚₊‧꒰ა 👛 𝑃𝐿𝐴𝑇𝑂𝑀𝑌 𝑊𝐴𝐿𝐿𝐸𝑇 ໒꒱‧₊˚"))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(balanceLines(w)))
    .addTextDisplayComponents(txt(`-# ${bankFooter()}`));
}

// Wallet log (admin tambah/tolak baki)
function walletLogBox({ actionTitle, target, admin, details, reason, w }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(txt("# ˚₊‧꒰ა 👛 𝑊𝐴𝐿𝐿𝐸𝑇 𝐿𝑂𝐺 ໒꒱‧₊˚"))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      txt(
        `╰┈➤ 📌 **Action:** ${actionTitle}\n` +
        `╰┈➤ 👤 **Target:** ${target} (\`${target.id}\`)\n` +
        `╰┈➤ 🛡️ **Admin:** ${admin}\n` +
        `╰┈➤ 📝 **Details:** ${details}\n` +
        `╰┈➤ 💬 **Reason:** ${reason}`
      )
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(`**Current Balances**\n${balanceLines(w)}`))
    .addTextDisplayComponents(txt(`-# ${bankFooter()}`));
}

// ================= TRADING =================
// Panel trading (dihantar oleh /setup-trading)
function buildTradePanel(listRef) {
  const btn = new ButtonBuilder()
    .setCustomId("open_trading_modal")
    .setLabel("Trading Ticket")
    .setEmoji("🤝")
    .setStyle(ButtonStyle.Secondary); // kelabu

  return new ContainerBuilder()
    .addTextDisplayComponents(txt("# ˚₊‧꒰ა 🛍️ 𝑃𝐿𝐴𝑇𝑂𝑀𝑌 𝑇𝑅𝐴𝐷𝐼𝑁𝐺 ໒꒱‧₊˚"))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      txt(
        "╰┈➤ Click the **Trading Ticket** button below to look for or trade your Plato items.\n" +
        `╰┈➤ Your trade request will be posted automatically in ${listRef}.`
      )
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(btn));
}

// Mesej permintaan dalam trading-list (accepterId diisi bila dah diterima)
function buildTradeList({ requesterId, details, accepterId = null }) {
  const accepted = Boolean(accepterId);
  const btn = new ButtonBuilder()
    .setCustomId(`accept_trade:${requesterId}`)
    .setLabel(accepted ? "Trade Accepted" : "Accept Trade")
    .setStyle(ButtonStyle.Secondary) // kelabu
    .setDisabled(accepted);

  const box = new ContainerBuilder()
    .addTextDisplayComponents(txt("# ˚₊‧꒰ა 📋 𝑇𝑅𝐴𝐷𝐼𝑁𝐺 𝐿𝐼𝑆𝑇 ໒꒱‧₊˚"))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      txt(`╰┈➤ **Requester:** <@${requesterId}>\n╰┈➤ **Item Details:** ${details}`)
    )
    .addSeparatorComponents(sep());

  if (accepted) {
    box.addTextDisplayComponents(txt(`✅ **Accepted by:** <@${accepterId}>`));
  } else {
    box.addTextDisplayComponents(
      txt("╰┈➤ Click **Accept Trade** if you are interested in trading with the requester.")
    );
  }
  return box.addActionRowComponents(new ActionRowBuilder().addComponents(btn));
}

// Mesej dalam channel trade sementara (ada butang Close Trade untuk accepter)
function buildTradeChatBox({ requesterId, accepterId, details }) {
  const btn = new ButtonBuilder()
    .setCustomId(`close_trade:${accepterId}`)
    .setLabel("Close Trade")
    .setEmoji("🔒")
    .setStyle(ButtonStyle.Secondary); // kelabu

  return new ContainerBuilder()
    .addTextDisplayComponents(txt("# ˚₊‧꒰ა 🤝 𝑇𝑅𝐴𝐷𝐸 𝐶𝐻𝐴𝑇 ໒꒱‧₊˚"))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      txt(
        `╰┈➤ **Requester:** <@${requesterId}>\n` +
        `╰┈➤ **Accepted by:** <@${accepterId}>\n` +
        `╰┈➤ **Item Details:** ${details}`
      )
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      txt(`╰┈➤ Discuss and complete your trade here. Only <@${accepterId}> (or an admin) can close this channel.`)
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(btn));
}

// Cipta channel trade sementara dalam category yang ditetapkan
async function createTradeChannel(guild, requesterId, accepter, details) {
  try {
    const safe = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20) || "user";
    const requesterMember = await guild.members.fetch(requesterId).catch(() => null);
    const requesterName = requesterMember?.user?.username;

    const memberPerms = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.EmbedLinks,
    ];

    const overwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }, // @everyone tak nampak
      { id: accepter.id, allow: memberPerms },
      {
        id: guild.client.user.id, // bot
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
        ],
      },
    ];
    if (requesterMember) overwrites.push({ id: requesterId, allow: memberPerms });

    const channel = await guild.channels.create({
      name: `🤝・trade-${safe(requesterName)}-${safe(accepter.username)}`,
      type: ChannelType.GuildText,
      parent: TRADE_CATEGORY_ID,
      topic: `Trade chat • Accepted by ${accepter.username}`,
      permissionOverwrites: overwrites,
      reason: `Trade accepted by ${accepter.tag}`,
    });

    await channel.send({
      components: [buildTradeChatBox({ requesterId, accepterId: accepter.id, details })],
      flags: V2,
      allowedMentions: { users: [requesterId, accepter.id] },
    });

    return channel;
  } catch (err) {
    console.error("Gagal cipta channel trade:", err);
    return null;
  }
}

// ================= RUMBLE (battle royale) =================
const KILL_SCENES = [
  (a, b) => `🔫 ${a} shot ${b} right in the chest!`,
  (a, b) => `💥 ${a} blasted ${b} with a shotgun!`,
  (a, b) => `🏹 ${a} sniped ${b} from across the arena!`,
  (a, b) => `🗡️ ${a} stabbed ${b} in the back!`,
  (a, b) => `💣 ${a} tossed a grenade at ${b}!`,
  (a, b) => `🪓 ${a} chopped ${b} down with an axe!`,
  (a, b) => `🧨 ${a} blew up ${b} with dynamite!`,
  (a, b) => `🥊 ${a} knocked out ${b} with one punch!`,
  (a, b) => `🍌 ${b} slipped on a banana peel thrown by ${a}!`,
  (a, b) => `⚡ ${a} zapped ${b} with a lightning bolt!`,
  (a, b) => `🕳️ ${a} pushed ${b} into a trap pit!`,
  (a, b) => `☄️ ${a} called a meteor down on ${b}!`,
  (a, b) => `🔥 ${a} torched ${b} with a flamethrower!`,
];
const SOLO_SCENES = [
  (b) => `🌋 ${b} fell into the lava!`,
  (b) => `🦈 ${b} got eaten by a shark!`,
  (b) => `💨 ${b} ran into a poison cloud!`,
  (b) => `🪤 ${b} stepped on a hidden mine!`,
  (b) => `🧊 ${b} froze solid in the storm!`,
];

function rumbleLabel(currencyType) {
  return currencyType === "coins" ? "🪙 Plato Coins" : "💠 Pips";
}

// Container rumble yang masih terbuka (ada butang Join)
function rumbleOpenBox(game) {
  const joinBtn = new ButtonBuilder()
    .setCustomId(`join_rumble_${game.currencyType}_${game.totalPrize}`)
    .setLabel("🎟️ Join Rumble")
    .setStyle(ButtonStyle.Success);

  return info(
    "🌸・PlatoMy Rumble Arena",
    `🎁 **Total Prize:** ${game.totalPrize.toLocaleString()} ${rumbleLabel(game.currencyType)}\n` +
    `⏳ **Ends:** <t:${game.endTimeSeconds}:R>\n\n` +
    `👥 **Players:** ${game.participants.length}`
  ).addActionRowComponents(new ActionRowBuilder().addComponents(joinBtn));
}

async function createRumble(channel, currencyType, totalPrize, durationMins) {
  const game = {
    currencyType,
    totalPrize,
    participants: [],
    ended: false,
    endTimeSeconds: Math.floor((Date.now() + durationMins * 60 * 1000) / 1000),
  };

  const msg = await channel.send({ components: [rumbleOpenBox(game)], flags: V2 });
  rumbleMap.set(msg.id, game);
  setTimeout(() => runRumbleBattle(channel, msg.id), durationMins * 60 * 1000);
  return msg;
}

async function runRumbleBattle(channel, msgId) {
  const game = rumbleMap.get(msgId);
  if (!game || game.ended) return;
  game.ended = true;

  const label = rumbleLabel(game.currencyType);
  const prizeText = `${game.totalPrize.toLocaleString()} ${label}`;
  const msg = await channel.messages.fetch(msgId).catch(() => null);
  const edit = (box) => (msg ? msg.edit({ components: [box], flags: V2 }).catch(() => {}) : null);

  const players = [...game.participants];

  if (players.length === 0) {
    await edit(
      info("🌸・Rumble Ended", `🎁 **Prize:** ${prizeText}\n🏆 **Winner:** No participants\n\n👥 **Players:** 0`)
    );
    await channel.send("😢 Rumble ended with no participants.").catch(() => {});
    return;
  }

  let alive = [...players];

  if (alive.length > 1) {
    await edit(
      info("🌸・PlatoMy Rumble Arena", `🔥 **The battle begins!**\n${players.length} players have entered the arena...`)
    );
    await sleep(5000);

    let round = 0;
    while (alive.length > 1) {
      round++;
      const kills = Math.max(1, Math.min(alive.length - 1, Math.ceil(alive.length * 0.35)));
      const lines = [];

      for (let i = 0; i < kills; i++) {
        const [victim] = alive.splice(Math.floor(Math.random() * alive.length), 1);
        const v = `<@${victim}>`;
        if (alive.length > 0 && Math.random() > 0.15) {
          const killer = `<@${pick(alive)}>`;
          lines.push(pick(KILL_SCENES)(killer, v));
        } else {
          lines.push(pick(SOLO_SCENES)(v));
        }
      }

      const shown = lines.slice(0, 8);
      if (lines.length > shown.length) shown.push(`...and ${lines.length - shown.length} more fell in the chaos.`);

      await edit(
        info("🌸・PlatoMy Rumble Arena", `⚔️ **Round ${round}**\n\n${shown.join("\n")}\n\n👥 **Players left:** ${alive.length}`)
      );
      if (alive.length > 1) await sleep(5000);
    }
    await sleep(2000);
  }

  const winnerId = alive[0];
  const w = getWallet(winnerId);
  if (game.currencyType === "coins") w.coins += game.totalPrize;
  else w.pips += game.totalPrize;

  await edit(
    info("🌸・Rumble Ended", `🎁 **Prize:** ${prizeText}\n🏆 **Winner:** <@${winnerId}>\n\n👥 **Players:** ${players.length}`)
  );
  await channel.send(`🏆 <@${winnerId}> won **${prizeText}** in PlatoMy Rumble!`).catch(() => {});
}

// --- INTEGRASI WEB DASHBOARD & PASSPORT ---
const app = express();
const PORT = process.env.PORT || 8080;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "platomy_y2k_secret_key_123",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

const CLIENT_ID = process.env.CLIENT_ID || "1556578779437072546";
const CLIENT_SECRET = process.env.CLIENT_SECRET || "XIfRq23FWQttp-5E9JSgRLfizc03Io_9";
const CALLBACK_URL = process.env.CALLBACK_URL || "https://platomy-production.up.railway.app/discord/callback";

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(
  new DiscordStrategy(
    {
      clientID: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      callbackURL: CALLBACK_URL,
      scope: ["identify", "guilds"],
    },
    (accessToken, refreshToken, profile, done) => {
      process.nextTick(() => done(null, profile));
    }
  )
);

app.get("/login", passport.authenticate("discord"));
app.get("/discord/callback", passport.authenticate("discord", { failureRedirect: "/" }), (req, res) => { res.redirect("/"); });
app.get("/logout", (req, res) => { req.logout(() => { res.redirect("/"); }); });

// Logo (fail di repo bernama "public:logo.jpg.jpg")
app.get("/logo.jpg", (req, res) => res.sendFile(path.join(__dirname, "public:logo.jpg.jpg")));

// Halaman dashboard + API web
registerDashboardApi({ app, client, wallets, getWallet, giveawaysMap, rumbleMap, createRumble });

app.listen(PORT, () => {
  console.log(`Web Dashboard PlatoMy berjalan di port ${PORT}!`);
});

// --- SLASH COMMANDS ---
const commands = [
  new SlashCommandBuilder().setName("wallet").setDescription("Semak baki akaun PlatoMy • Wallet anda! 🏦"),

  new SlashCommandBuilder().setName("admin-wallet").setDescription("Urus baki akaun PlatoMy • Wallet ahli (Admin sahaja)")
    .addStringOption(opt => opt.setName("action").setDescription("Tindakan").setRequired(true).addChoices(
      { name: "Add Sponsor", value: "add_sponsor" },
      { name: "Add Coins", value: "add_coins" },
      { name: "Deduct Coins", value: "deduct_coins" },
      { name: "Add Pips", value: "add_pips" },
      { name: "Deduct Pips", value: "deduct_pips" },
      { name: "Check", value: "check" }
    ))
    .addUserOption(opt => opt.setName("target").setDescription("Ahli / Penaja").setRequired(true))
    .addIntegerOption(opt => opt.setName("amount").setDescription("Jumlah").setRequired(true))
    .addStringOption(opt => opt.setName("reason").setDescription("Sebab / Nota").setRequired(false)),

  new SlashCommandBuilder().setName("setup-trading").setDescription("Hantar panel PlatoMy Trading (Admin sahaja)"),

  new SlashCommandBuilder().setName("embed-builder").setDescription("Cipta custom container interaktif (Admin sahaja)")
    .addChannelOption(opt => opt.setName("channel").setDescription("Pilih channel").setRequired(true)),

  new SlashCommandBuilder().setName("embed-image").setDescription("Hantar gambar sahaja dengan kod warna Hex (Admin sahaja)")
    .addChannelOption(opt => opt.setName("channel").setDescription("Pilih channel").setRequired(true))
    .addStringOption(opt => opt.setName("image_url").setDescription("Link URL gambar").setRequired(true))
    .addStringOption(opt => opt.setName("color").setDescription("Kod warna Hex (cth: #ffb6c1)").setRequired(false)),

  new SlashCommandBuilder().setName("event").setDescription("Urus event komuniti")
    .addSubcommand(sub => sub.setName("create").setDescription("Cipta event baharu (Admin sahaja)")
      .addStringOption(opt => opt.setName("title").setDescription("Tajuk event").setRequired(true))
      .addStringOption(opt => opt.setName("description").setDescription("Butiran event").setRequired(true))
    ),

  new SlashCommandBuilder().setName("rumble").setDescription("Mula permainan PlatoMy Rumble (Admin sahaja)")
    .addStringOption(opt => opt.setName("currency").setDescription("Jenis mata wang").setRequired(true).addChoices(
      { name: "🪙 Plato Coins", value: "coins" },
      { name: "💠 Pips", value: "pips" }
    ))
    .addIntegerOption(opt => opt.setName("prize").setDescription("Jumlah Hadiah Utama").setRequired(true).setMinValue(1))
    .addIntegerOption(opt => opt.setName("duration").setDescription("Tempoh masa (minit)").setRequired(true).setMinValue(1).setMaxValue(10080)),
].map(c => c.toJSON());

client.once(Events.ClientReady, async (c) => {
  console.log(`Bot telah berjaya log masuk sebagai ${c.user.tag}!`);
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    await rest.put(Routes.applicationCommands(c.user.id), { body: commands });
    console.log("Slash commands berjaya di-register!");
  } catch (error) {
    console.error("Gagal mendaftarkan slash commands:", error);
  }
});

// --- !wallet / !bank ---
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  const content = message.content.trim().toLowerCase();
  if (content === "!wallet" || content === "!bank") {
    await message.reply({ components: [walletBox(getWallet(message.author.id))], flags: V2 });
  }
});

// --- INTERACTIONS ---
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // ===== SLASH COMMANDS =====
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;

      if (name === "wallet") {
        await interaction.reply({ components: [walletBox(getWallet(interaction.user.id))], flags: V2_EPHEMERAL });
        return;
      }

      if (name === "admin-wallet") {
        if (!isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        }

        const action = interaction.options.getString("action");
        const targetUser = interaction.options.getUser("target");
        const amount = interaction.options.getInteger("amount");
        const reason = interaction.options.getString("reason") || "Tiada sebab dinyatakan";

        const targetWallet = getWallet(targetUser.id);
        let actionTitle = "";
        let actionDesc = "";

        if (action === "add_coins") {
          targetWallet.coins += amount;
          actionTitle = "🪙 Plato Coins Added";
          actionDesc = `Berjaya menambah **${amount.toLocaleString()} Coins** kepada ${targetUser}.`;
        } else if (action === "deduct_coins") {
          targetWallet.coins = Math.max(0, targetWallet.coins - amount);
          actionTitle = "🪙 Plato Coins Deducted";
          actionDesc = `Berjaya menolak **${amount.toLocaleString()} Coins** daripada ${targetUser}.`;
        } else if (action === "add_pips") {
          targetWallet.pips += amount;
          actionTitle = "💠 Pips Added";
          actionDesc = `Berjaya menambah **${amount.toLocaleString()} Pips** kepada ${targetUser}.`;
        } else if (action === "deduct_pips") {
          targetWallet.pips = Math.max(0, targetWallet.pips - amount);
          actionTitle = "💠 Pips Deducted";
          actionDesc = `Berjaya menolak **${amount.toLocaleString()} Pips** daripada ${targetUser}.`;
        } else if (action === "add_sponsor") {
          targetWallet.sponsorTotal += amount;
          actionTitle = "🌸 Total Sponsor Added";
          actionDesc = `Berjaya menambah **${amount.toLocaleString()} Total Sponsor** kepada ${targetUser}.`;
        } else if (action === "check") {
          actionTitle = "📊 Wallet Checked";
          actionDesc = `Menyemak baki wallet ${targetUser}.`;
        }

        await interaction.reply({ content: `✅ Tindakan berjaya dilaksana untuk ${targetUser}!`, ephemeral: true });

        const logChannel = findChannel(interaction.guild, WALLET_LOG_CHANNEL_NAME);
        if (logChannel) {
          await logChannel.send({
            components: [
              walletLogBox({
                actionTitle,
                target: targetUser,
                admin: interaction.user,
                details: actionDesc,
                reason,
                w: targetWallet,
              }),
            ],
            flags: V2,
            allowedMentions: NO_PING,
          }).catch(() => {});
        }
        return;
      }

      if (name === "setup-trading") {
        if (!isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        }
        const listChannel = findChannel(interaction.guild, TRADING_LIST_CHANNEL_NAME);
        const listRef = listChannel ? `<#${listChannel.id}>` : "#🛍️・trading-list";

        await interaction.channel.send({
          components: [buildTradePanel(listRef)],
          flags: V2,
        });
        await interaction.reply({ content: "✅ Trading panel sent!", ephemeral: true });
        return;
      }

      if (name === "embed-builder") {
        if (!isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        }
        const targetChannel = interaction.options.getChannel("channel");

        const modal = new ModalBuilder()
          .setCustomId(`embed_builder:${targetChannel.id}`)
          .setTitle("🎨 PlatoMy Container Builder");

        const titleInput = new TextInputBuilder().setCustomId("eb_title").setLabel("Tajuk (pilihan)")
          .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(256);
        const descInput = new TextInputBuilder().setCustomId("eb_desc").setLabel("Mesej / Penerangan")
          .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(3500);
        const colorInput = new TextInputBuilder().setCustomId("eb_color").setLabel("Warna Hex (pilihan, cth: #ff69b4)")
          .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(7).setPlaceholder("#ff69b4");
        const imageInput = new TextInputBuilder().setCustomId("eb_image").setLabel("URL gambar (pilihan)")
          .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500).setPlaceholder("https://...");

        modal.addComponents(
          new ActionRowBuilder().addComponents(titleInput),
          new ActionRowBuilder().addComponents(descInput),
          new ActionRowBuilder().addComponents(colorInput),
          new ActionRowBuilder().addComponents(imageInput)
        );
        await interaction.showModal(modal);
        return;
      }

      if (name === "embed-image") {
        if (!isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        }
        const targetChannel = interaction.options.getChannel("channel");
        const imageUrl = interaction.options.getString("image_url");
        const colorInput = interaction.options.getString("color");

        if (!isUrl(imageUrl)) {
          return interaction.reply({ content: "❌ Link gambar tidak sah. Mesti bermula dengan https://", ephemeral: true });
        }

        const imageBox = new ContainerBuilder();
        const ac = accent(colorInput);
        if (ac !== null) imageBox.setAccentColor(ac);
        imageBox.addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl.trim()))
        );

        await targetChannel.send({ components: [imageBox], flags: V2 });
        await interaction.reply({ content: "✅ Gambar berjaya dihantar!", ephemeral: true });
        return;
      }

      if (name === "event") {
        if (interaction.options.getSubcommand() !== "create") return;
        if (!isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        }

        const title = interaction.options.getString("title");
        const description = interaction.options.getString("description");

        const eventBox = new ContainerBuilder()
          .addTextDisplayComponents(txt("✨ **Pengumuman Event Baharu!**"))
          .addSeparatorComponents(sep())
          .addSectionComponents(
            new SectionBuilder()
              .addTextDisplayComponents(
                txt(`## ${title}`),
                txt(`${description}\n\n🎀 Dianjurkan oleh: ${interaction.user}`)
              )
              .setThumbnailAccessory(new ThumbnailBuilder().setURL(LOGO_URL))
          )
          .addTextDisplayComponents(txt(`-# Event • Today at ${getMalaysiaTime()}`));

        await interaction.channel.send({ components: [eventBox], flags: V2, allowedMentions: NO_PING });
        await interaction.reply({ content: "✅ Event berjaya dicipta dan diumumkan!", ephemeral: true });

        const eventLogChannel = findChannel(interaction.guild, EVENT_LOG_CHANNEL_NAME);
        if (eventLogChannel) {
          await eventLogChannel.send({
            components: [
              info(
                "🛡️・Event Log: New Event Created",
                `📌 **Tajuk:** ${title}\n` +
                `📝 **Butiran:** ${description}\n` +
                `👤 **Admin:** ${interaction.user} (\`${interaction.user.id}\`)`,
                `Event Log • Today at ${getMalaysiaTime()}`
              ),
            ],
            flags: V2,
            allowedMentions: NO_PING,
          }).catch(() => {});
        }
        return;
      }

      if (name === "rumble") {
        if (!isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        }
        const currencyType = interaction.options.getString("currency");
        const totalPrize = interaction.options.getInteger("prize");
        const durationMins = interaction.options.getInteger("duration");

        await createRumble(interaction.channel, currencyType, totalPrize, durationMins);
        await interaction.reply({ content: "✅ PlatoMy Rumble berjaya dimulakan!", ephemeral: true });
        return;
      }
    }

    // ===== BUTANG =====
    if (interaction.isButton()) {
      const id = interaction.customId;

      // --- join rumble ---
      if (id.startsWith("join_rumble_")) {
        await interaction.deferReply({ ephemeral: true });
        const game = rumbleMap.get(interaction.message.id);
        if (!game || game.ended) return interaction.editReply({ content: "❌ This rumble has ended." });
        if (game.participants.includes(interaction.user.id)) return interaction.editReply({ content: "⚠️ You've already joined!" });
        game.participants.push(interaction.user.id);

        await interaction.message.edit({ components: [rumbleOpenBox(game)], flags: V2 }).catch(() => {});
        await interaction.editReply({ content: "✅ Successfully joined PlatoMy Rumble!" });
        return;
      }

      // --- buka borang tiket trading ---
      if (id === "open_trading_modal") {
        const modal = new ModalBuilder().setCustomId("trading_modal").setTitle("🛍️ PlatoMy Trading");
        const itemInput = new TextInputBuilder()
          .setCustomId("trading_text")
          .setLabel("Item details")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000);
        modal.addComponents(new ActionRowBuilder().addComponents(itemInput));
        await interaction.showModal(modal);
        return;
      }

      // --- Accept Trade ---
      if (id.startsWith("accept_trade:")) {
        const requesterId = id.split(":")[1];
        const hasTradeRole = interaction.member?.roles?.cache?.some(r => r.name.toLowerCase().includes(TRADE_ROLE_NAME));

        if (!hasTradeRole) {
          return interaction.reply({ content: "❌ You need the Trade role to accept trades.", ephemeral: true });
        }
        if (interaction.user.id === requesterId) {
          return interaction.reply({ content: "⚠️ You can't accept your own trade.", ephemeral: true });
        }
        if (acceptedTrades.has(interaction.message.id)) {
          return interaction.reply({ content: "❌ This trade has already been accepted.", ephemeral: true });
        }
        acceptedTrades.add(interaction.message.id);

        await interaction.deferUpdate();

        // Baca butiran item daripada teks dalam container
        const infoText = collectText(interaction.message.components).find(t => t.includes("**Item Details:**")) || "";
        const item = infoText.split("**Item Details:**")[1]?.trim() || "-";

        // Buka channel trade sementara
        const tradeChannel = await createTradeChannel(interaction.guild, requesterId, interaction.user, item);

        await interaction.editReply({
          components: [buildTradeList({ requesterId, details: item, accepterId: interaction.user.id })],
          flags: V2,
        });

        if (tradeChannel) {
          await interaction.channel.send({
            content: `🤝 <@${requesterId}>, your trade was accepted by ${interaction.user}. Head to ${tradeChannel} to complete the trade!`,
            allowedMentions: { users: [requesterId] },
          }).catch(() => {});
        } else {
          await interaction.followUp({
            content: "❌ I couldn't create the trade channel. Please check the bot's permissions on the trade category.",
            ephemeral: true,
          }).catch(() => {});
          await interaction.channel.send(
            `🤝 <@${requesterId}>, your trade was accepted by ${interaction.user}. Please contact each other to complete the trade!`
          ).catch(() => {});
        }

        const logChannel = findChannel(interaction.guild, TRADING_LOG_CHANNEL_NAME);
        if (logChannel) {
          await logChannel.send({
            components: [
              info(
                "🛍️ Trading Log: Trade Accepted",
                `📥 **Requester:** <@${requesterId}> (\`${requesterId}\`)\n` +
                `🤝 **Accepted by:** ${interaction.user} (\`${interaction.user.id}\`)\n` +
                (tradeChannel ? `📍 **Trade Channel:** ${tradeChannel}\n` : "") +
                `\n📝 **Item:**\n${item}`,
                `Trading Log • Today at ${getMalaysiaTime()}`
              ),
            ],
            flags: V2,
            allowedMentions: NO_PING,
          }).catch(() => {});
        }
        return;
      }

      // --- Close Trade (dalam channel trade sementara) ---
      if (id.startsWith("close_trade:")) {
        const accepterId = id.split(":")[1];

        if (interaction.channel?.parentId !== TRADE_CATEGORY_ID) {
          return interaction.reply({ content: "❌ This button only works inside a trade channel.", ephemeral: true });
        }
        if (interaction.user.id !== accepterId && !isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Only the person who accepted this trade can close this channel.", ephemeral: true });
        }

        const channelName = interaction.channel.name;
        await interaction.reply({
          content: `🔒 Trade closed by ${interaction.user}. This channel will be deleted in 5 seconds...`,
          allowedMentions: NO_PING,
        });

        const logChannel = findChannel(interaction.guild, TRADING_LOG_CHANNEL_NAME);
        if (logChannel) {
          await logChannel.send({
            components: [
              info(
                "🛍️ Trading Log: Trade Closed",
                `🔒 **Closed by:** ${interaction.user} (\`${interaction.user.id}\`)\n` +
                `🤝 **Accepted by:** <@${accepterId}>\n` +
                `📍 **Channel:** ${channelName}`,
                `Trading Log • Today at ${getMalaysiaTime()}`
              ),
            ],
            flags: V2,
            allowedMentions: NO_PING,
          }).catch(() => {});
        }

        await sleep(5000);
        await interaction.channel.delete(`Trade closed by ${interaction.user.tag}`).catch((e) => {
          console.error("Gagal padam channel trade:", e);
        });
        return;
      }
    }

    // ===== MODAL =====
    if (interaction.isModalSubmit()) {
      // --- tiket trading ---
      if (interaction.customId === "trading_modal") {
        const details = interaction.fields.getTextInputValue("trading_text").trim();
        if (!details) {
          return interaction.reply({ content: "❌ Please fill in the item details.", ephemeral: true });
        }

        const listChannel = findChannel(interaction.guild, TRADING_LIST_CHANNEL_NAME);
        if (!listChannel) {
          return interaction.reply({ content: "❌ The trading-list channel was not found.", ephemeral: true });
        }

        // Ping role @trader bila ada list baru
        const traderRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase().includes(TRADER_ROLE_NAME));

        const sent = await listChannel.send({
          components: [
            ...(traderRole ? [txt(`<@&${traderRole.id}>`)] : []),
            buildTradeList({ requesterId: interaction.user.id, details }),
          ],
          flags: V2,
          allowedMentions: traderRole ? { roles: [traderRole.id] } : NO_PING,
        }).catch(() => null);
        if (!sent) {
          return interaction.reply({ content: "❌ The bot can't send to the trading-list channel. Please check the bot's permissions.", ephemeral: true });
        }

        await interaction.reply({ content: "✅ Your item details have been sent!", ephemeral: true });

        const logChannel = findChannel(interaction.guild, TRADING_LOG_CHANNEL_NAME);
        if (logChannel) {
          await logChannel.send({
            components: [
              info(
                "🛍️ Trading Log: New Request",
                `👤 **Requester:** ${interaction.user} (\`${interaction.user.id}\`)\n\n` +
                `📝 **Item:**\n${details}`,
                `Trading Log • Today at ${getMalaysiaTime()}`
              ),
            ],
            flags: V2,
            allowedMentions: NO_PING,
          }).catch(() => {});
        }
        return;
      }

      // --- container builder ---
      if (interaction.customId.startsWith("embed_builder:")) {
        const channelId = interaction.customId.split(":")[1];
        const targetChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
        if (!targetChannel || !targetChannel.isTextBased()) {
          return interaction.reply({ content: "❌ Channel tidak dijumpai.", ephemeral: true });
        }

        const title = interaction.fields.getTextInputValue("eb_title").trim();
        const desc = interaction.fields.getTextInputValue("eb_desc").trim();
        const color = interaction.fields.getTextInputValue("eb_color");
        const image = interaction.fields.getTextInputValue("eb_image").trim();

        if (!title && !desc && !isUrl(image)) {
          return interaction.reply({ content: "❌ Isi sekurang-kurangnya tajuk, mesej atau gambar.", ephemeral: true });
        }

        const box = new ContainerBuilder();
        const ac = accent(color);
        if (ac !== null) box.setAccentColor(ac);
        if (title) box.addTextDisplayComponents(txt(`## ${title}`));
        if (title && desc) box.addSeparatorComponents(sep());
        if (desc) box.addTextDisplayComponents(txt(desc));
        if (isUrl(image)) {
          box.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(image))
          );
        }

        await targetChannel.send({ components: [box], flags: V2 });
        await interaction.reply({ content: `✅ Container berjaya dihantar ke <#${targetChannel.id}>!`, ephemeral: true });
        return;
      }
    }
  } catch (err) {
    console.error("Ralat interaction:", err);
    const msg = { content: "❌ Ralat berlaku. Cuba lagi.", ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(msg).catch(() => {});
    else await interaction.reply(msg).catch(() => {});
  }
});

client.login(token).catch(err => { console.error("GAGAL LOGIN:", err); });
