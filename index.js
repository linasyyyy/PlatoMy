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
  ChannelType,
  StringSelectMenuBuilder,
  AttachmentBuilder,
} from "discord.js";
import Canvas from 'canvas';
import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import path from "path";
import { fileURLToPath } from "url";

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
    GatewayIntentBits.GuildVoiceStates
  ] 
});

const wallets = new Map();
const eventsMap = new Map();
const birthdaysMap = new Map(); 
const giveawaysMap = new Map(); 
const rumbleMap = new Map(); 
const tempVoiceOwners = new Map();

function getWallet(id) {
  if (!wallets.has(id)) wallets.set(id, { coins: 0, pips: 0, exp: 0, sponsorTotal: 0 });
  return wallets.get(id);
}

// --- INTEGRASI WEB DASHBOARD ---
const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: "platomy_y2k_secret_key_123",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

const CLIENT_ID = "1556578779437072546";
const CLIENT_SECRET = "XIfRq23FWQttp-5E9JSgRLfizc03Io_9";
const DOMAIN_URL = process.env.RAILWAY_STATIC_URL 
  ? `https://${process.env.RAILWAY_STATIC_URL}` 
  : `http://localhost:${PORT}`;

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(
  new DiscordStrategy(
    {
      clientID: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      callbackURL: `${DOMAIN_URL}/discord/callback`,
      scope: ["identify", "guilds"],
    },
    (accessToken, refreshToken, profile, done) => {
      process.nextTick(() => done(null, profile));
    }
  )
);

function checkAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

app.get("/login", passport.authenticate("discord"));
app.get("/discord/callback", passport.authenticate("discord", { failureRedirect: "/" }), (req, res) => { res.redirect("/"); });
app.get("/logout", (req, res) => { req.logout(() => { res.redirect("/"); }); });

app.get("/", checkAuth, (req, res) => {
  const userWallet = getWallet(req.user.id);
  const allWallets = [...wallets.entries()].map(([id, data]) => ({ id, ...data }));

  res.render("dashboard", {
    user: req.user,
    wallet: userWallet,
    allWallets: allWallets,
    totalCoins: Array.from(wallets.values()).reduce((a, b) => a + b.coins, 0),
    totalPips: Array.from(wallets.values()).reduce((a, b) => a + b.pips, 0),
    botClient: client
  });
});

app.post("/api/inject-assets", checkAuth, (req, res) => {
  const { targetId, assetType, amount } = req.body;
  if (!targetId || !amount) return res.status(400).json({ error: "Sila isi semua maklumat!" });

  const cleanTargetId = targetId.replace(/[<@!>]/g, "").trim();
  const targetWallet = getWallet(cleanTargetId);
  const qty = parseInt(amount) || 0;

  if (assetType.includes("Coins")) targetWallet.coins += qty;
  else targetWallet.pips += qty;

  res.json({ success: true, message: `Berjaya menambah ${qty} ${assetType} kepada ${cleanTargetId}!` });
});

app.listen(PORT, () => {
  console.log(`Web Dashboard PlatoMy (Y2K Theme) berjalan di port ${PORT}!`);
});

// --- DISCORD BOT LOGIC ---
const VERIFY_CHANNEL_ID = ""; 
const WALLET_LOG_ID = "";     
const BIRTHDAY_CHANNEL_ID = ""; 
const LEVEL_LOG_CHANNEL_NAME = "level-up";       
const TRADING_LOG_CHANNEL_NAME = "trading-log"; 
const REPORT_LOG_CHANNEL_NAME = "report-log";         
const WELCOME_CHANNEL_NAME = "selamat-datang";
const SERVER_LOGS_CHANNEL_NAME = "server-logs";
const UPDATE_CHANNEL_NAME = "plato-update";
const VERIFIED_ROLE_NAME = "Member";
const ACTIVE_ROLE_NAME = "Murai Chatters 🥵"; 
const LOGO_URL = "https://cdn.discordapp.com/attachments/1549051773438787724/1549403998686281808/IMG_5614.png";

let lastPostedUpdateId = null;
const lastActiveMap = new Map(); 

// --- CANVAS GENERATOR (KAD LEVEL & LEADERBOARD DENGAN SOKONGAN HEX) ---
async function generateLevelCard(member, w, hexColor = "#ffb6c1") {
  const canvas = Canvas.createCanvas(1200, 600);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = hexColor;
  ctx.lineWidth = 6;
  ctx.strokeRect(60, 60, canvas.width - 120, canvas.height - 120);

  ctx.fillStyle = hexColor;
  ctx.font = 'bold 45px sans-serif';
  ctx.fillText("LEVEL UP & STATUS", 100, 140);

  const currentLevel = Math.floor(w.exp / 1000) + 1;
  const currentXpInLevel = Math.floor(w.exp % 1000);

  ctx.fillStyle = "#ffffff";
  ctx.font = 'bold 35px sans-serif';
  ctx.fillText(`Member: ${member.user.username}`, 100, 240);
  ctx.fillText(`Current Level: ${currentLevel}`, 100, 310);
  ctx.fillText(`Total EXP: ${w.exp.toLocaleString()}`, 100, 380);

  ctx.fillStyle = "#222222";
  ctx.fillRect(100, 440, 1000, 40);

  ctx.fillStyle = hexColor;
  const progressWidth = (currentXpInLevel / 1000) * 1000;
  ctx.fillRect(100, 440, progressWidth, 40);

  ctx.fillStyle = "#ffffff";
  ctx.font = '24px sans-serif';
  ctx.fillText(`Progress: ${currentXpInLevel} / 1000 EXP`, 100, 520);

  return canvas.toBuffer();
}

async function generateLeaderboardCard(sortedWallets, guild, hexColor = "#ffb6c1") {
  const canvas = Canvas.createCanvas(1200, 700);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = hexColor;
  ctx.lineWidth = 6;
  ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);

  ctx.fillStyle = hexColor;
  ctx.font = 'bold 45px sans-serif';
  ctx.fillText("✨ LEADERBOARD TOP 10 ✨", 90, 110);

  let y = 180;
  for (let i = 0; i < Math.min(sortedWallets.length, 10); i++) {
    const [userId, data] = sortedWallets[i];
    const member = guild.members.cache.get(userId);
    const username = member ? member.user.username : `User ${userId.slice(0, 5)}`;
    const estimatedLevel = Math.floor(data.exp / 1000) + 1;

    ctx.fillStyle = i === 0 ? "#ffd700" : (i === 1 ? "#c0c0c0" : (i === 2 ? "#cd7f32" : "#ffffff"));
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(`#${i + 1}  ${username}`, 90, y);

    ctx.fillStyle = "#aaaaaa";
    ctx.font = '22px sans-serif';
    ctx.fillText(`Level ${estimatedLevel}  |  EXP: ${data.exp.toLocaleString()}`, 650, y);

    y += 45;
  }

  return canvas.toBuffer();
}

const commands = [
  new SlashCommandBuilder().setName("wallet").setDescription("Semak baki akaun PlatoMy • Wallet anda! 🏦"),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Papar papan pendahulu (Leaderboard EXP) 📊")
    .addStringOption(opt => opt.setName("color").setDescription("Kod warna Hex (cth: #ffb6c1)").setRequired(false)),
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
  new SlashCommandBuilder().setName("setup-verify").setDescription("Hantar panel sahkan Plato ID (Admin sahaja)"),
  new SlashCommandBuilder().setName("setup-birthday").setDescription("Hantar panel Birthday Corner (Admin sahaja)"),
  new SlashCommandBuilder().setName("setup-trading").setDescription("Hantar panel Trading Ticket (Admin sahaja)"),
  new SlashCommandBuilder().setName("setup-report").setDescription("Hantar panel Report Ticket (Admin sahaja)"),
  new SlashCommandBuilder().setName("setup-role-plato").setDescription("Hantar menu dropdown game role (Admin sahaja)"),
  new SlashCommandBuilder().setName("setup-update").setDescription("Hantar tetapan update rasmi (Admin sahaja)"),
  new SlashCommandBuilder().setName("setup-voice-panel").setDescription("Hantar panel kawalan Voice Channel (Admin sahaja)")
    .addChannelOption(opt => opt.setName("channel").setDescription("Pilih text channel").setRequired(true)),
  new SlashCommandBuilder().setName("rumble").setDescription("Mula permainan PlatoMy Rumble (Admin sahaja)")
    .addStringOption(opt => opt.setName("currency").setDescription("Jenis mata wang").setRequired(true).addChoices(
      { name: "🪙 Plato Coins", value: "coins" },
      { name: "💠 Pips", value: "pips" }
    ))
    .addIntegerOption(opt => opt.setName("prize").setDescription("Jumlah Hadiah Utama").setRequired(true))
    .addIntegerOption(opt => opt.setName("duration").setDescription("Tempoh masa (minit)").setRequired(true)),
  new SlashCommandBuilder().setName("embed-builder").setDescription("Cipta custom embed interaktif (Admin sahaja)")
    .addChannelOption(opt => opt.setName("channel").setDescription("Pilih channel").setRequired(true)),
  new SlashCommandBuilder().setName("embed-image").setDescription("Hantar embed gambar dengan kod warna Hex (Admin sahaja)")
    .addChannelOption(opt => opt.setName("channel").setDescription("Pilih channel").setRequired(true))
    .addStringOption(opt => opt.setName("image_url").setDescription("Link URL gambar").setRequired(true))
    .addStringOption(opt => opt.setName("title").setDescription("Tajuk ringkas").setRequired(false))
    .addStringOption(opt => opt.setName("color").setDescription("Kod warna Hex (cth: #ffb6c1)").setRequired(false)),
  new SlashCommandBuilder().setName("birthday").setDescription("Urus tarikh lahir anda")
    .addSubcommand(sub => sub.setName("set").setDescription("Tetapkan tarikh lahir anda")),
  new SlashCommandBuilder().setName("event").setDescription("Urus event komuniti")
    .addSubcommand(sub => sub.setName("create").setDescription("Cipta event baharu (Admin sahaja)")),
  new SlashCommandBuilder().setName("giveaway").setDescription("Urus sistem giveaway (Admin sahaja)")
    .addSubcommand(sub => sub.setName("start").setDescription("Mula giveaway baharu")
      .addStringOption(opt => opt.setName("prize").setDescription("Hadiah giveaway").setRequired(true))
      .addIntegerOption(opt => opt.setName("duration").setDescription("Tempoh masa (minit)").setRequired(true))
      .addIntegerOption(opt => opt.setName("winners").setDescription("Bilangan pemenang").setRequired(true))
      .addStringOption(opt => opt.setName("requirement").setDescription("Syarat penyertaan").setRequired(false))
      .addStringOption(opt => opt.setName("image").setDescription("Link URL imej").setRequired(false))
    ),
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

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const member = newState.member;
  if (!member || member.user.bot) return;

  const creatorChannelName = "➕ Create Voice";
  if (newState.channel && newState.channel.name.toLowerCase() === creatorChannelName.toLowerCase()) {
    const guild = newState.guild;
    const parentCategory = newState.channel.parent;
    try {
      const userVc = await guild.channels.create({
        name: `ʚ₊˚🔊・${member.user.username}'s Room`,
        type: ChannelType.GuildVoice,
        parent: parentCategory ? parentCategory.id : null,
        permissionOverwrites: [
          { id: guild.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
          { id: member.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers] }
        ]
      });
      await member.voice.setChannel(userVc);
      tempVoiceOwners.set(userVc.id, member.id);
    } catch (err) { console.error(err); }
  }

  if (oldState.channel) {
    const leftChannel = oldState.channel;
    if (tempVoiceOwners.has(leftChannel.id) && leftChannel.members.size === 0) {
      tempVoiceOwners.delete(leftChannel.id);
      await leftChannel.delete().catch(() => {});
    }
  }
});

async function sendLevelUpLog(guild, userId, newLevel) {
  const channel = guild.channels.cache.find(c => c.name.toLowerCase().includes(LEVEL_LOG_CHANNEL_NAME.toLowerCase()) && c.isTextBased());
  if (!channel || !("send" in channel)) return;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  const w = getWallet(userId);
  const cardBuffer = await generateLevelCard(member, w, "#ffb6c1");
  const attachment = new AttachmentBuilder(cardBuffer, { name: 'level-up.png' });

  await channel.send({ content: `🎉 Tahniah <@${userId}> atas kenaikan level ke **Level ${newLevel}**!`, files: [attachment] }).catch(() => {});
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  const userId = message.author.id;

  const w = getWallet(userId);
  const oldExp = w.exp;
  w.exp += 2;

  const oldLevel = Math.floor(oldExp / 1000) + 1;
  const newLevel = Math.floor(w.exp / 1000) + 1;
  if (newLevel > oldLevel) {
    await sendLevelUpLog(message.guild, userId, newLevel);
  }

  const content = message.content.trim().toLowerCase();

  if (content === "!wallet" || content === "!bank") {
    const embed = new EmbedBuilder()
      .setColor("#ffb6c1")
      .setTitle("💳 PlatoMy • Wallet")
      .setDescription(`🪙 **Plato Coins:** ${w.coins.toLocaleString()}\n💠 **Pips:** ${w.pips.toLocaleString()}\n✨ **EXP:** ${w.exp.toLocaleString()}`);
    await message.reply({ embeds: [embed] });
    return;
  }

  if (content === "!lb" || content === "!leaderboard") {
    const sortedWallets = [...wallets.entries()].sort((a, b) => b[1].exp - a[1].exp);
    const cardBuffer = await generateLeaderboardCard(sortedWallets, message.guild, "#ffb6c1");
    const attachment = new AttachmentBuilder(cardBuffer, { name: 'leaderboard.png' });
    await message.reply({ files: [attachment] });
    return;
  }

  if (content === "!level" || content === "!rank") {
    const cardBuffer = await generateLevelCard(message.member, w, "#ffb6c1");
    const attachment = new AttachmentBuilder(cardBuffer, { name: 'level.png' });
    await message.reply({ files: [attachment] });
    return;
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "wallet") {
      const w = getWallet(interaction.user.id);
      const embed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("💳 PlatoMy • Wallet")
        .setDescription(`🪙 **Plato Coins:** ${w.coins.toLocaleString()}\n💠 **Pips:** ${w.pips.toLocaleString()}\n✨ **EXP:** ${w.exp.toLocaleString()}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (interaction.commandName === "leaderboard") {
      const colorInput = interaction.options.getString("color") || "#ffb6c1";
      const sortedWallets = [...wallets.entries()].sort((a, b) => b[1].exp - a[1].exp);
      const cardBuffer = await generateLeaderboardCard(sortedWallets, interaction.guild, colorInput);
      const attachment = new AttachmentBuilder(cardBuffer, { name: 'leaderboard.png' });
      await interaction.reply({ files: [attachment] });
      return;
    }

    if (interaction.commandName === "embed-image") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      const targetChannel = interaction.options.getChannel("channel");
      const imageUrl = interaction.options.getString("image_url");
      const titleText = interaction.options.getString("title");
      const colorInput = interaction.options.getString("color") || "#ffb6c1";

      const imageEmbed = new EmbedBuilder().setColor(colorInput).setImage(imageUrl);
      if (titleText) imageEmbed.setTitle(titleText);

      await targetChannel.send({ embeds: [imageEmbed] });
      await interaction.reply({ content: `✅ Embed gambar berjaya dihantar!`, ephemeral: true });
      return;
    }

    if (interaction.commandName === "rumble") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      const currencyType = interaction.options.getString("currency");
      const totalPrize = interaction.options.getInteger("prize");
      const durationMins = interaction.options.getInteger("duration");
      const currencyName = currencyType === "coins" ? "🪙 Plato Coins" : "💠 Pips";
      const endTimeSeconds = Math.floor((Date.now() + durationMins * 60 * 1000) / 1000);

      const rumbleEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("🌸・PlatoMy Rumble Arena")
        .setDescription(`🎁 **Total Prize:** ${totalPrize.toLocaleString()} ${currencyName}\n⏳ **Berakhir Pada:** <t:${endTimeSeconds}:R>\n\n👥 **Penyertaan:** 0 pemain`);

      const joinBtn = new ButtonBuilder().setCustomId(`join_rumble_${currencyType}_${totalPrize}`).setLabel("🎟️ Enter Free Rumble").setStyle(ButtonStyle.Success);
      const rumbleMsg = await interaction.channel.send({ embeds: [rumbleEmbed], components: [new ActionRowBuilder().addComponents(joinBtn)] });

      rumbleMap.set(rumbleMsg.id, { currencyType, totalPrize, participants: [], ended: false });
      await interaction.reply({ content: "✅ PlatoMy Rumble berjaya dimulakan!", ephemeral: true });
      return;
    }

    if (interaction.commandName === "giveaway") {
      const sub = interaction.options.getSubcommand();
      if (sub === "start") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        const prize = interaction.options.getString("prize");
        const durationMins = interaction.options.getInteger("duration");
        const winnersCount = interaction.options.getInteger("winners");
        const endTimeSeconds = Math.floor((Date.now() + durationMins * 60 * 1000) / 1000);

        const gwEmbed = new EmbedBuilder()
          .setColor("#ffb6c1")
          .setTitle("🎉 GIVEAWAY")
          .setDescription(`🎁 **Prize:** ${prize}\n👑 **Winners:** ${winnersCount}\n⏳ **Ends In:** <t:${endTimeSeconds}:R>\n\n👥 **Entries:** 0`);

        const joinBtn = new ButtonBuilder().setCustomId("join_giveaway").setLabel("🎉 Join Giveaway").setStyle(ButtonStyle.Success);
        const msg = await interaction.channel.send({ embeds: [gwEmbed], components: [new ActionRowBuilder().addComponents(joinBtn)] });

        giveawaysMap.set(msg.id, { prize, winnersCount, participants: [], ended: false });
        await interaction.reply({ content: "✅ Giveaway bermula!", ephemeral: true });
      }
      return;
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === "join_giveaway") {
      await interaction.deferReply({ ephemeral: true });
      const gw = giveawaysMap.get(interaction.message.id);
      if (!gw || gw.ended) return interaction.editReply({ content: "❌ Tamat." });
      if (gw.participants.includes(interaction.user.id)) return interaction.editReply({ content: "⚠️ Sudah sertai!" });
      gw.participants.push(interaction.user.id);

      const oldEmb = interaction.message.embeds[0];
      const newEmb = EmbedBuilder.from(oldEmb).setDescription(oldEmb.description.replace(/👥 \*\*Entries:\*\* \d+/, `👥 **Entries:** ${gw.participants.length}`));
      await interaction.message.edit({ embeds: [newEmb] }).catch(() => {});
      await interaction.editReply({ content: "✅ Berjaya sertai giveaway!" });
      return;
    }

    if (interaction.customId.startsWith("join_rumble_")) {
      await interaction.deferReply({ ephemeral: true });
      const game = rumbleMap.get(interaction.message.id);
      if (!game || game.ended) return interaction.editReply({ content: "❌ Rumble telah tamat." });
      if (game.participants.includes(interaction.user.id)) return interaction.editReply({ content: "⚠️ Awak sudah menyertai!" });
      game.participants.push(interaction.user.id);

      const oldEmb = interaction.message.embeds[0];
      const newEmb = EmbedBuilder.from(oldEmb).setDescription(oldEmb.description.replace(/👥 \*\*Penyertaan:\*\* \d+ pemain/, `👥 **Penyertaan:** ${game.participants.length} pemain`));
      await interaction.message.edit({ embeds: [newEmb] }).catch(() => {});
      await interaction.editReply({ content: "✅ Berjaya menyertai PlatoMy Rumble!" });
      return;
    }
  }
});

client.login(token).catch(err => { console.error("GAGAL LOGIN:", err); });
