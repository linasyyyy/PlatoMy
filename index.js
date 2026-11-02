import {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
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
const TRADE_ROLE_NAME = "trade";                  // nama role mengandungi perkataan ini
const LOGO_URL = "https://cdn.discordapp.com/attachments/1549051773438787724/1549403998686281808/IMG_5614.png";
const PINK = "#ff69b4";

const isAdmin = (i) => i.member?.permissions?.has(PermissionFlagsBits.Administrator);
const safeColor = (c) => {
  const v = String(c || "").trim().replace("#", "");
  return /^[0-9a-fA-F]{6}$/.test(v) ? `#${v}` : PINK;
};
const isUrl = (u) => /^https?:\/\/\S+$/i.test(String(u || "").trim());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const findChannel = (guild, part) =>
  guild.channels.cache.find((c) => c.name.toLowerCase().includes(part) && c.isTextBased());

function getMalaysiaTime() {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function walletEmbed(w) {
  return new EmbedBuilder()
    .setColor(PINK)
    .setTitle("💳 PlatoMy • Wallet")
    .setDescription(`🪙 **Plato Coins:** ${w.coins.toLocaleString()}\n💠 **Pips:** ${w.pips.toLocaleString()}\n🌸 **Total Sponsor:** ${w.sponsorTotal.toLocaleString()}`)
    .setFooter({ text: `PlatoMy Bank • Today at ${getMalaysiaTime()}` });
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

async function createRumble(channel, currencyType, totalPrize, durationMins) {
  const endTimeSeconds = Math.floor((Date.now() + durationMins * 60 * 1000) / 1000);

  const embed = new EmbedBuilder()
    .setColor(PINK)
    .setTitle("🌸・PlatoMy Rumble Arena")
    .setDescription(
      `🎁 **Total Prize:** ${totalPrize.toLocaleString()} ${rumbleLabel(currencyType)}\n` +
      `⏳ **Ends:** <t:${endTimeSeconds}:R>\n\n` +
      `👥 **Players:** 0`
    );

  const joinBtn = new ButtonBuilder()
    .setCustomId(`join_rumble_${currencyType}_${totalPrize}`)
    .setLabel("🎟️ Join Rumble")
    .setStyle(ButtonStyle.Success);

  const msg = await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(joinBtn)] });
  rumbleMap.set(msg.id, { currencyType, totalPrize, participants: [], ended: false });
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
  const edit = (embed) => (msg ? msg.edit({ embeds: [embed], components: [] }).catch(() => {}) : null);

  const players = [...game.participants];

  if (players.length === 0) {
    await edit(
      new EmbedBuilder().setColor(PINK).setTitle("🌸・Rumble Ended")
        .setDescription(`🎁 **Prize:** ${prizeText}\n🏆 **Winner:** No participants\n\n👥 **Players:** 0`)
    );
    await channel.send("😢 Rumble ended with no participants.").catch(() => {});
    return;
  }

  let alive = [...players];

  if (alive.length > 1) {
    await edit(
      new EmbedBuilder().setColor(PINK).setTitle("🌸・PlatoMy Rumble Arena")
        .setDescription(`🔥 **The battle begins!**\n${players.length} players have entered the arena...`)
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
        new EmbedBuilder().setColor(PINK).setTitle("🌸・PlatoMy Rumble Arena")
          .setDescription(`⚔️ **Round ${round}**\n\n${shown.join("\n")}\n\n👥 **Players left:** ${alive.length}`)
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
    new EmbedBuilder().setColor(PINK).setTitle("🌸・Rumble Ended")
      .setDescription(`🎁 **Prize:** ${prizeText}\n🏆 **Winner:** <@${winnerId}>\n\n👥 **Players:** ${players.length}`)
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

  new SlashCommandBuilder().setName("setup-trading").setDescription("Hantar panel PlatoMy BlackMarket (Admin sahaja)"),

  new SlashCommandBuilder().setName("embed-builder").setDescription("Cipta custom embed interaktif (Admin sahaja)")
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
    await message.reply({ embeds: [walletEmbed(getWallet(message.author.id))] });
  }
});

// --- INTERACTIONS ---
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // ===== SLASH COMMANDS =====
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;

      if (name === "wallet") {
        await interaction.reply({ embeds: [walletEmbed(getWallet(interaction.user.id))], ephemeral: true });
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
          const logEmbed = new EmbedBuilder()
            .setColor(PINK)
            .setTitle(`💳・Wallet Log: ${actionTitle}`)
            .setDescription(
              `👤 **Target:** ${targetUser} (\`${targetUser.id}\`)\n` +
              `🛡️ **Admin:** ${interaction.user}\n` +
              `📝 **Details:** ${actionDesc}\n` +
              `📌 **Reason:** ${reason}\n\n` +
              `📊 **Current Balances:**\n` +
              `🪙 Coins: \`${targetWallet.coins.toLocaleString()}\`\n` +
              `💠 Pips: \`${targetWallet.pips.toLocaleString()}\`\n` +
              `🌸 Total Sponsor: \`${targetWallet.sponsorTotal.toLocaleString()}\``
            )
            .setFooter({ text: `PlatoMy Bank Log • Today at ${getMalaysiaTime()}` })
            .setTimestamp();
          await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
        return;
      }

      if (name === "setup-trading") {
        if (!isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        }
        const embed = new EmbedBuilder()
          .setColor(PINK)
          .setTitle("🛍️ PlatoMy BlackMarket")
          .setDescription("Ingin melakukan trade item? Klik butang di bawah untuk membuka tiket.");
        const btn = new ButtonBuilder().setCustomId("open_trading_modal").setLabel("🤝 Trading Ticket").setStyle(ButtonStyle.Success);
        await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
        await interaction.reply({ content: "✅ Panel Trading berjaya dihantar!", ephemeral: true });
        return;
      }

      if (name === "embed-builder") {
        if (!isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        }
        const targetChannel = interaction.options.getChannel("channel");

        const modal = new ModalBuilder()
          .setCustomId(`embed_builder:${targetChannel.id}`)
          .setTitle("🎨 PlatoMy Embed Builder");

        const titleInput = new TextInputBuilder().setCustomId("eb_title").setLabel("Tajuk (pilihan)")
          .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(256);
        const descInput = new TextInputBuilder().setCustomId("eb_desc").setLabel("Mesej / Penerangan")
          .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(4000);
        const colorInput = new TextInputBuilder().setCustomId("eb_color").setLabel("Warna Hex (cth: #ff69b4)")
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

        const imageEmbed = new EmbedBuilder().setColor(safeColor(colorInput)).setImage(imageUrl.trim());

        await targetChannel.send({ embeds: [imageEmbed] });
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

        const eventEmbed = new EmbedBuilder()
          .setColor(PINK)
          .setTitle(title)
          .setDescription(`${description}\n\n🎀 Dianjurkan oleh: ${interaction.user}`)
          .setThumbnail(LOGO_URL)
          .setTimestamp();

        await interaction.channel.send({ content: "✨ **Pengumuman Event Baharu!**", embeds: [eventEmbed] });
        await interaction.reply({ content: "✅ Event berjaya dicipta dan diumumkan!", ephemeral: true });

        const eventLogChannel = findChannel(interaction.guild, EVENT_LOG_CHANNEL_NAME);
        if (eventLogChannel) {
          const logEmbed = new EmbedBuilder()
            .setColor(PINK)
            .setTitle("🛡️・Event Log: New Event Created")
            .setDescription(
              `📌 **Tajuk:** ${title}\n` +
              `📝 **Butiran:** ${description}\n` +
              `👤 **Admin:** ${interaction.user} (\`${interaction.user.id}\`)`
            )
            .setFooter({ text: `Event Log • Today at ${getMalaysiaTime()}` })
            .setTimestamp();
          await eventLogChannel.send({ embeds: [logEmbed] }).catch(() => {});
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

        const oldEmb = interaction.message.embeds[0];
        const newEmb = EmbedBuilder.from(oldEmb).setDescription(
          oldEmb.description.replace(
            /👥 \*\*(?:Penyertaan|Players):\*\* \d+(?: pemain)?/,
            `👥 **Players:** ${game.participants.length}`
          )
        );
        await interaction.message.edit({ embeds: [newEmb] }).catch(() => {});
        await interaction.editReply({ content: "✅ Successfully joined PlatoMy Rumble!" });
        return;
      }

      // --- buka borang tiket trading ---
      if (id === "open_trading_modal") {
        const modal = new ModalBuilder().setCustomId("trading_modal").setTitle("🛍️ PlatoMy BlackMarket");
        const itemInput = new TextInputBuilder()
          .setCustomId("trading_text")
          .setLabel("Butiran item yang dimahukan")
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
          return interaction.reply({ content: "❌ Anda memerlukan role Trade untuk menerima trade.", ephemeral: true });
        }
        if (interaction.user.id === requesterId) {
          return interaction.reply({ content: "⚠️ Anda tidak boleh menerima trade sendiri.", ephemeral: true });
        }
        if (acceptedTrades.has(interaction.message.id)) {
          return interaction.reply({ content: "❌ Trade ini sudah diterima.", ephemeral: true });
        }
        acceptedTrades.add(interaction.message.id);

        await interaction.deferUpdate();

        const oldEmb = interaction.message.embeds[0];
        const item = (oldEmb.description || "").split("**Butiran item yang dimahukan:**\n")[1] || "-";

        const newEmb = EmbedBuilder.from(oldEmb).setDescription(
          `${oldEmb.description}\n\n✅ **Diterima oleh:** ${interaction.user}`
        );
        const doneBtn = new ButtonBuilder()
          .setCustomId(`accept_trade:${requesterId}`)
          .setLabel("Trade Accepted")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true);
        await interaction.editReply({ embeds: [newEmb], components: [new ActionRowBuilder().addComponents(doneBtn)] });

        await interaction.channel.send(
          `🤝 <@${requesterId}>, trade anda diterima oleh ${interaction.user}. Sila berhubung untuk selesaikan trade!`
        ).catch(() => {});

        const logChannel = findChannel(interaction.guild, TRADING_LOG_CHANNEL_NAME);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setColor(PINK)
            .setTitle("🛍️ BlackMarket Log: Trade Accepted")
            .setDescription(
              `📥 **Requester:** <@${requesterId}> (\`${requesterId}\`)\n` +
              `🤝 **Accepted by:** ${interaction.user} (\`${interaction.user.id}\`)\n\n` +
              `📝 **Item:**\n${item}`
            )
            .setFooter({ text: `Trading Log • Today at ${getMalaysiaTime()}` })
            .setTimestamp();
          await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
        return;
      }
    }

    // ===== MODAL =====
    if (interaction.isModalSubmit()) {
      // --- tiket trading ---
      if (interaction.customId === "trading_modal") {
        const details = interaction.fields.getTextInputValue("trading_text").trim();
        if (!details) {
          return interaction.reply({ content: "❌ Sila isi butiran item.", ephemeral: true });
        }

        const listChannel = findChannel(interaction.guild, TRADING_LIST_CHANNEL_NAME);
        if (!listChannel) {
          return interaction.reply({ content: "❌ Channel trading-list tidak dijumpai.", ephemeral: true });
        }

        const listEmbed = new EmbedBuilder()
          .setColor(PINK)
          .setTitle("🛍️ PlatoMy BlackMarket")
          .setDescription(
            `👤 **Requester:** ${interaction.user}\n\n` +
            `📝 **Butiran item yang dimahukan:**\n${details}`
          )
          .setFooter({ text: `BlackMarket • Today at ${getMalaysiaTime()}` })
          .setTimestamp();

        const acceptBtn = new ButtonBuilder()
          .setCustomId(`accept_trade:${interaction.user.id}`)
          .setLabel("Accept Trade")
          .setStyle(ButtonStyle.Success);

        const sent = await listChannel.send({ embeds: [listEmbed], components: [new ActionRowBuilder().addComponents(acceptBtn)] }).catch(() => null);
        if (!sent) {
          return interaction.reply({ content: "❌ Bot tidak dapat menghantar ke channel trading-list. Semak permission bot.", ephemeral: true });
        }

        await interaction.reply({ content: "✅ Maklumat item anda telah dihantar!", ephemeral: true });

        const logChannel = findChannel(interaction.guild, TRADING_LOG_CHANNEL_NAME);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setColor(PINK)
            .setTitle("🛍️ BlackMarket Log: New Request")
            .setDescription(
              `👤 **Requester:** ${interaction.user} (\`${interaction.user.id}\`)\n\n` +
              `📝 **Item:**\n${details}`
            )
            .setFooter({ text: `Trading Log • Today at ${getMalaysiaTime()}` })
            .setTimestamp();
          await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
        return;
      }

      // --- embed builder ---
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

        const embed = new EmbedBuilder().setColor(safeColor(color));
        if (title) embed.setTitle(title);
        if (desc) embed.setDescription(desc);
        if (isUrl(image)) embed.setImage(image);

        await targetChannel.send({ embeds: [embed] });
        await interaction.reply({ content: `✅ Embed berjaya dihantar ke <#${targetChannel.id}>!`, ephemeral: true });
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
