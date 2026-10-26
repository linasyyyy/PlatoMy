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

// --- INTEGRASI WEB DASHBOARD (EXPRESS + DISCORD OAUTH2 + Y2K THEME) ---
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

app.get(
  "/discord/callback",
  passport.authenticate("discord", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect("/");
  }
);

app.get("/logout", (req, res) => {
  req.logout(() => {
    res.redirect("/");
  });
});

app.get("/", checkAuth, (req, res) => {
  const userWallet = getWallet(req.user.id);
  const allWallets = [...wallets.entries()].map(([id, data]) => ({
    id,
    ...data
  }));

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

  if (assetType.includes("Coins")) {
    targetWallet.coins += qty;
  } else {
    targetWallet.pips += qty;
  }

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

// --- CANVAS GENERATOR UNTUK KAD LEVEL & LEADERBOARD (Y2K THEME) ---
async function generateLevelCard(member, w, hexColor = "#ffb6c1") {
  const canvas = Canvas.createCanvas(1200, 600);
  const ctx = canvas.getContext('2d');

  // Latar Belakang Hitam Pekat Y2K
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Bingkai Kad / Panel Kristal Neon (Mengikut Warna Hex Pilihan)
  ctx.strokeStyle = hexColor;
  ctx.lineWidth = 6;
  ctx.strokeRect(60, 60, canvas.width - 120, canvas.height - 120);

  // Tajuk Utama
  ctx.fillStyle = hexColor;
  ctx.font = 'bold 45px sans-serif';
  ctx.fillText("LEVEL UP & STATUS", 100, 140);

  // Maklumat Pengguna
  const currentLevel = Math.floor(w.exp / 1000) + 1;
  const currentXpInLevel = Math.floor(w.exp % 1000);

  ctx.fillStyle = "#ffffff";
  ctx.font = 'bold 35px sans-serif';
  ctx.fillText(`Member: ${member.user.username}`, 100, 240);
  ctx.fillText(`Current Level: ${currentLevel}`, 100, 310);
  ctx.fillText(`Total EXP: ${w.exp.toLocaleString()}`, 100, 380);

  // Progress Bar EXP
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
  ctx.fillText("✨ LEADERBOARD TOP 10 Y2K MASTERS ✨", 90, 110);

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

async function checkPlatoUpdates() {
  try {
    const rssUrl = "https://nitter.poast.org/platochat/rss";
    const response = await fetch(rssUrl);
    if (!response.ok) return;
    const text = await response.text();

    const matchLink = text.match(/<link>(.*?)<\/link>/);
    const matchTitle = text.match(/<title>(.*?)<\/title>/);

    if (matchLink && matchTitle) {
      const updateUrl = matchLink[1];
      const updateContent = matchTitle[1];

      if (updateUrl !== lastPostedUpdateId && !updateUrl.includes("/rss")) {
        lastPostedUpdateId = updateUrl;

        for (const [_, guild] of client.guilds.cache) {
          const targetChannel = guild.channels.cache.find(
            c => c.name.toLowerCase().includes(UPDATE_CHANNEL_NAME.toLowerCase()) && c.isTextBased()
          );

          if (targetChannel) {
            const updateRole = guild.roles.cache.find(r => r.name.toLowerCase() === "plato update" || r.name.toLowerCase() === "@plato update");
            const pingTarget = updateRole ? `<@&${updateRole.id}>` : "@Plato Update";

            const updateEmbed = new EmbedBuilder()
              .setColor("#ffb6c1")
              .setTitle("🛠️・Plato Official Update")
              .setDescription(`${updateContent}\n\n[🔗 Baca Update Penuh di X](${updateUrl})`)
              .setThumbnail(LOGO_URL)
              .setTimestamp();

            await targetChannel.send({ 
              content: `${pingTarget} ✨ **Terdapat update baharu daripada Plato!**`, 
              embeds: [updateEmbed] 
            }).catch(() => {});
          }
        }
      }
    }
  } catch (error) {
    console.error("Gagal mengambil update Plato:", error);
  }
}

async function checkActiveRoles() {
  const now = Date.now();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000; 

  for (const [_, guild] of client.guilds.cache) {
    const activeRole = guild.roles.cache.find(r => r.name.toLowerCase() === ACTIVE_ROLE_NAME.toLowerCase());
    if (!activeRole) continue;

    await guild.members.fetch().catch(() => {});

    for (const [userId, lastTime] of lastActiveMap.entries()) {
      const member = guild.members.cache.get(userId);
      if (!member) continue;

      if (now - lastTime > threeDaysMs) {
        if (member.roles.cache.has(activeRole.id)) {
          await member.roles.remove(activeRole).catch(() => {});
        }
      } else {
        if (!member.roles.cache.has(activeRole.id)) {
          await member.roles.add(activeRole).catch(() => {});
        }
      }
    }
  }
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
    .addStringOption(opt => opt.setName("reason").setDescription("Sebab / Nama Penaja / Nota Sponsor").setRequired(false)),
  new SlashCommandBuilder().setName("setup-verify").setDescription("Hantar panel sahkan Plato ID (Admin sahaja)"),
  new SlashCommandBuilder().setName("setup-birthday").setDescription("Hantar panel Birthday Corner yang aesthetic (Admin sahaja)"),
  new SlashCommandBuilder().setName("setup-trading").setDescription("Hantar panel Trading Ticket sahaja (Admin sahaja)"),
  new SlashCommandBuilder().setName("setup-report").setDescription("Hantar panel Report Ticket sahaja (Admin sahaja)"),
  new SlashCommandBuilder().setName("setup-role-plato").setDescription("Hantar menu dropdown game role Plato (Admin sahaja)"),
  new SlashCommandBuilder().setName("setup-update").setDescription("Hantar panel atau tetapan update rasmi (Admin sahaja)"),
  new SlashCommandBuilder().setName("setup-voice-panel").setDescription("Hantar panel kawalan Voice Channel sementara (Admin sahaja)")
    .addChannelOption(opt => opt.setName("channel").setDescription("Pilih text channel untuk hantar panel ini").setRequired(true)),
  new SlashCommandBuilder().setName("rumble").setDescription("Mula permainan PlatoMy Rumble dengan Total Prize (Admin sahaja)")
    .addStringOption(opt => opt.setName("currency").setDescription("Jenis mata wang hadiah").setRequired(true).addChoices(
      { name: "🪙 Plato Coins", value: "coins" },
      { name: "💠 Pips", value: "pips" }
    ))
    .addIntegerOption(opt => opt.setName("prize").setDescription("Jumlah Hadiah Utama (Total Prize)").setRequired(true))
    .addIntegerOption(opt => opt.setName("duration").setDescription("Tempoh masa (minit)").setRequired(true)),
  new SlashCommandBuilder().setName("embed-builder").setDescription("Cipta dan edit custom embed interaktif (Admin sahaja)")
    .addChannelOption(opt => opt.setName("channel").setDescription("Pilih channel untuk hantar embed").setRequired(true)),
  new SlashCommandBuilder().setName("embed-image").setDescription("Hantar embed gambar sahaja ke channel pilihan (Admin sahaja)")
    .addChannelOption(opt => opt.setName("channel").setDescription("Pilih channel tujuan").setRequired(true))
    .addStringOption(opt => opt.setName("image_url").setDescription("Link URL gambar/GIF").setRequired(true))
    .addStringOption(opt => opt.setName("title").setDescription("Tajuk ringkas (pilihan)").setRequired(false))
    .addStringOption(opt => opt.setName("color").setDescription("Kod warna Hex (cth: #ffb6c1)").setRequired(false)),
  new SlashCommandBuilder().setName("birthday").setDescription("Urus tarikh lahir anda")
    .addSubcommand(sub => sub.setName("set").setDescription("Tetapkan tarikh lahir anda")),
  new SlashCommandBuilder().setName("event").setDescription("Urus event komuniti")
    .addSubcommand(sub => sub.setName("create").setDescription("Cipta event baharu menggunakan modal (Admin sahaja)")),
  new SlashCommandBuilder().setName("giveaway").setDescription("Urus sistem giveaway komuniti (Admin sahaja)")
    .addSubcommand(sub => sub.setName("start").setDescription("Mula giveaway baharu")
      .addStringOption(opt => opt.setName("prize").setDescription("Hadiah giveaway").setRequired(true))
      .addIntegerOption(opt => opt.setName("duration").setDescription("Tempoh masa dalam minit").setRequired(true))
      .addIntegerOption(opt => opt.setName("winners").setDescription("Bilangan pemenang").setRequired(true))
      .addStringOption(opt => opt.setName("requirement").setDescription("Syarat penyertaan").setRequired(false))
      .addStringOption(opt => opt.setName("image").setDescription("Link URL imej besar banner giveaway").setRequired(false))
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

  setInterval(() => { checkBirthdays(); }, 1000 * 60 * 60);
  setInterval(() => { checkPlatoUpdates(); }, 1000 * 60 * 5);
  setInterval(() => { checkActiveRoles(); }, 1000 * 60 * 60 * 6);
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
    } catch (err) {
      console.error("Gagal mencipta voice channel:", err);
    }
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
  const channel = guild.channels.cache.find(
    (candidate) => candidate.name.toLowerCase().includes(LEVEL_LOG_CHANNEL_NAME.toLowerCase()) && candidate.isTextBased()
  );
  if (!channel || !("send" in channel)) return;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  const w = getWallet(userId);
  const cardBuffer = await generateLevelCard(member, w, "#ffb6c1");
  const attachment = new AttachmentBuilder(cardBuffer, { name: 'level-up.png' });

  await channel.send({ 
    content: `🎉 Tahniah <@${userId}> atas kenaikan level ke **Level ${newLevel}**!`, 
    files: [attachment] 
  }).catch(() => {});
}

async function sendLog(guild, channelNameOrId, payload) {
  if (!channelNameOrId) return;
  let ch = guild.channels.cache.get(channelNameOrId);
  if (!ch) {
    ch = guild.channels.cache.find(c => c.name.toLowerCase().includes(channelNameOrId.toLowerCase()) && c.isTextBased());
  }
  if (ch && "send" in ch) {
    await ch.send(payload);
  }
}

function parseBirthdayToTimestamp(inputStr) {
  const months = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9, okt: 9,
    nov: 10, november: 10, dec: 11, december: 11, dis: 11
  };
  const parts = inputStr.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) return null;
  const day = parseInt(parts[0]);
  const monthKey = parts[1];
  const month = months[monthKey];
  if (isNaN(day) || month === undefined) return null;

  const now = new Date();
  let year = now.getFullYear();
  let targetDate = new Date(year, month, day);
  if (targetDate < now) targetDate.setFullYear(year + 1);
  return Math.floor(targetDate.getTime() / 1000);
}

async function checkBirthdays() {
  const now = new Date();
  const todaySec = Math.floor(now.setHours(0,0,0,0) / 1000);

  for (const [userId, data] of birthdaysMap.entries()) {
    if (data.timestamp <= todaySec + 86400 && data.timestamp >= todaySec) {
      for (const [_, guild] of client.guilds.cache) {
        const targetChannel = guild.channels.cache.get(BIRTHDAY_CHANNEL_ID) || 
                              guild.channels.cache.find(c => c.name.includes("birthday") && c.isTextBased());
        if (targetChannel) {
          const bdayEmbed = new EmbedBuilder()
            .setColor("#ffb6c1")
            .setTitle("🎉 HAPPY BIRTHDAY! 🎂✨")
            .setDescription(`Selamat Hari Lahir <@${userId}>! 🥳💕\n\nSemoga hari lahir anda pada hari ini diwarnai dengan seribu kebahagiaan!`)
            .setImage("https://cdn.discordapp.com/attachments/1549051773438787724/1551515791910903918/Video.gif")
            .setTimestamp();

          await targetChannel.send({ content: `🎂 Selamat Hari Lahir <@${userId}>!`, embeds: [bdayEmbed] }).catch(() => {});         
        }       
      }       
      birthdaysMap.delete(userId);     
    }   
  } 
}  

client.on(Events.GuildMemberAdd, async (member) => {   
  const channel = member.guild.channels.cache.find(c => c.name.includes(WELCOME_CHANNEL_NAME) && c.isTextBased());   
  if (!channel || !("send" in channel)) return;    

  const userName = member.user.tag;   
  const userAvatar = member.user.displayAvatarURL({ size: 128, dynamic: true });    

  const welcomeEmbed = new EmbedBuilder()     
    .setColor("#ffb6c1")     
    .setAuthor({ name: userName, iconURL: userAvatar })     
    .setTitle("🌸SELAMAT DATANG!")     
    .setDescription(`Hai ${member}! 🖐️💕\nSelamat datang ke Plato MY!\n\n🎀 Jom enjoy dan have fun bersama kami! ♡`)
    .setImage("https://cdn.discordapp.com/attachments/1549051773438787724/1551515791910903918/Video.gif")
    .setThumbnail(LOGO_URL)
    .setFooter({ text: `Awak adalah member ke ${member.guild.memberCount}!` })     
    .setTimestamp();    

  await channel.send({ embeds: [welcomeEmbed] }); 
});  

client.on(Events.GuildMemberRemove, async (member) => {   
  const channel = member.guild.channels.cache.find(c => c.name.includes(SERVER_LOGS_CHANNEL_NAME) && c.isTextBased());   
  if (!channel || !("send" in channel)) return;    

  const userAvatar = member.user.displayAvatarURL({ size: 128, dynamic: true });   
  const goodbyeEmbed = new EmbedBuilder()     
    .setColor("#ffb6c1")     
    .setTitle(`${member.user.tag} left the server`)
    .setDescription(`**User**\n<@${member.id}>`)     
    .setThumbnail(userAvatar)     
    .setFooter({ text: `${member.guild.name}` })
    .setTimestamp();

  await channel.send({ embeds: [goodbyeEmbed] });
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;

  const userId = message.author.id;
  lastActiveMap.set(userId, Date.now());

  const activeRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === ACTIVE_ROLE_NAME.toLowerCase());
  if (activeRole && !message.member.roles.cache.has(activeRole.id)) {
    await message.member.roles.add(activeRole).catch(() => {});
  }

  const w = getWallet(userId);
  const oldExp = w.exp;
  
  const parentCategoryName = message.channel.parent?.name?.toLowerCase() || "";
  const channelName = message.channel.name.toLowerCase();
  
  let earnedExp = 2; 
  if (parentCategoryName.includes("play zone") || channelName.includes("play") || channelName.includes("game")) {
    earnedExp = 0.5; 
  }

  w.exp += earnedExp;

  const oldLevel = Math.floor(oldExp / 1000) + 1;
  const newLevel = Math.floor(w.exp / 1000) + 1;
  if (newLevel > oldLevel) {
    await sendLevelUpLog(message.guild, userId, newLevel);
  }

  const content = message.content.trim().toLowerCase();

  if (content === "!wallet" || content === "!bank") {
    const embed = new EmbedBuilder()
      .setColor("#ffb6c1")
      .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ size: 128, dynamic: true }) })
      .setTitle("💳 PlatoMy • Wallet")
      .setDescription(`🪙 **Plato Coins:** ${w.coins.toLocaleString()}\n💠 **Pips:** ${w.pips.toLocaleString()}\n🎁 **Sponsor Total:** ${w.sponsorTotal.toLocaleString()}\n✨ **EXP:** ${w.exp.toLocaleString()}`)
      .setTimestamp();
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
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL({ size: 128, dynamic: true }) })
        .setTitle("💳 PlatoMy • Wallet")
        .setDescription(`🪙 **Plato Coins:** ${w.coins.toLocaleString()}\n💠 **Pips:** ${w.pips.toLocaleString()}\n🎁 **Sponsor Total:** ${w.sponsorTotal.toLocaleString()}\n✨ **EXP:** ${w.exp.toLocaleString()}`)
        .setTimestamp();
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

    if (interaction.commandName === "setup-voice-panel") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Hanya Admin sahaja!", ephemeral: true });
      }

      const targetChannel = interaction.options.getChannel("channel");
      const vcEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("ʚ・₊˚  VOICE CONTROL PANEL  ˚₊・ɞ")
        .setDescription("Masuk ke channel ⁠`➕ Create Voice`⁠ di bawah untuk cipta bilik dan kawal menggunakan butang.")
        .setTimestamp();

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("vc_lock").setLabel("Lock / Unlock").setStyle(ButtonStyle.Secondary).setEmoji("🔒"),
        new ButtonBuilder().setCustomId("vc_hide").setLabel("Hide / Unhide").setStyle(ButtonStyle.Secondary).setEmoji("👁️"),
        new ButtonBuilder().setCustomId("vc_limit").setLabel("Set Limit").setStyle(ButtonStyle.Primary).setEmoji("👥"),
        new ButtonBuilder().setCustomId("vc_rename").setLabel("Rename").setStyle(ButtonStyle.Primary).setEmoji("✏️")
      );

      await targetChannel.send({ embeds: [vcEmbed], components: [row1] });
      await interaction.reply({ content: `✅ Voice panel berjaya dihantar ke <#${targetChannel.id}>!`, ephemeral: true });
      return;
    }

    if (interaction.commandName === "setup-role-plato") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: "❌ Staf sahaja!", ephemeral: true });
      
      const roleEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("ʚ・₊˚  PLATO ROLES  ˚₊・ɞ")
        .setDescription("Sila pilih role game pilihan anda di bawah.");

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("role_select_menu_1")
        .setPlaceholder("✨ Pilih game role anda di sini...")
        .addOptions([
          { label: "Archery", value: "role_archery", emoji: "🏹" },
          { label: "Pool", value: "role_pool", emoji: "🎱" },
          { label: "Ludo", value: "role_ludo", emoji: "🎲" },
          { label: "Plato Update", value: "role_plato_update", emoji: "🛠️" }
        ]);

      await interaction.reply({ content: "✅ Panel game role dihantar!", ephemeral: true });
      await interaction.channel.send({ embeds: [roleEmbed], components: [new ActionRowBuilder().addComponents(selectMenu)] });
      return;
    }

    if (interaction.commandName === "setup-update") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      const embed = new EmbedBuilder().setColor("#ffb6c1").setTitle("🛠️・Plato Updates Integration").setDescription("Sistem aktif.");
      await interaction.reply({ content: "✅ Tetapan update aktif!", ephemeral: true });
      await interaction.channel.send({ embeds: [embed] });
      return;
    }

    if (interaction.commandName === "rumble") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Hanya Admin sahaja!", ephemeral: true });
      }

      const currencyType = interaction.options.getString("currency");
      const totalPrize = interaction.options.getInteger("prize");
      const durationMins = interaction.options.getInteger("duration");

      const currencyName = currencyType === "coins" ? "🪙 Plato Coins" : "💠 Pips";
      const endTimeSeconds = Math.floor((Date.now() + durationMins * 60 * 1000) / 1000);

      const rumbleEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("🌸・PlatoMy Rumble Arena")
        .setDescription(`🎁 **Total Prize:** ${totalPrize.toLocaleString()} ${currencyName}\n⏳ **Berakhir Pada:** <t:${endTimeSeconds}:R>\n\n👥 **Penyertaan:** 0 pemain`)
        .setTimestamp();

      const joinBtn = new ButtonBuilder().setCustomId(`join_rumble_${currencyType}_${totalPrize}`).setLabel("🎟️ Enter Free Rumble").setStyle(ButtonStyle.Success);
      const rumbleMsg = await interaction.channel.send({ embeds: [rumbleEmbed], components: [new ActionRowBuilder().addComponents(joinBtn)] });

      rumbleMap.set(rumbleMsg.id, { currencyType, totalPrize, participants: [], ended: false });
      await interaction.reply({ content: "✅ PlatoMy Rumble berjaya dimulakan!", ephemeral: true });

      setTimeout(async () => {
        const game = rumbleMap.get(rumbleMsg.id);
        if (!game || game.ended) return;
        game.ended = true;

        const players = [...game.participants];
        if (players.length === 0) {
          await rumbleMsg.edit({ content: "• *Tiada sesiapa menyertai Rumble.*", embeds: [], components: [] }).catch(() => {});
          rumbleMap.delete(rumbleMsg.id);
          return;
        }

        const winnerId = players[Math.floor(Math.random() * players.length)];
        const winnerWallet = getWallet(winnerId);
        if (game.currencyType === "coins") winnerWallet.coins += game.totalPrize;
        else winnerWallet.pips += game.totalPrize;

        const endedEmbed = new EmbedBuilder()
          .setColor("#ffb6c1")
          .setTitle("🌸・PlatoMy Rumble Selesai!")
          .setDescription(`🏆 **Pemenang Terakhir (Champion):**\n👑 <@${winnerId}> memenangi **${game.totalPrize.toLocaleString()} ${currencyName}**! 🎉`);

        await rumbleMsg.edit({ embeds: [endedEmbed], components: [] }).catch(() => {});
        rumbleMap.delete(rumbleMsg.id);
      }, durationMins * 60 * 1000);
      return;
    }

    if (interaction.commandName === "embed-builder") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      const targetChannel = interaction.options.getChannel("channel");
      const embed = new EmbedBuilder().setColor("#ffb6c1").setTitle("Plato MY").setDescription("Test Builder");
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`eb_edit_basic_${targetChannel.id}`).setLabel("edit basic info").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`eb_send_${targetChannel.id}`).setLabel("🚀 Send").setStyle(ButtonStyle.Success)
      );
      await interaction.reply({ content: `✨ Builder diaktifkan:`, embeds: [embed], components: [row], ephemeral: true });
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
      await interaction.reply({ content: `✅ Embed gambar dihantar!`, ephemeral: true });
      return;
    }

    if (interaction.commandName === "admin-wallet") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: "❌ Admin sahaja!", ephemeral: true });
      
      const action = interaction.options.getString("action");
      const target = interaction.options.getUser("target");
      const amount = interaction.options.getInteger("amount") || 0;
      const reason = interaction.options.getString("reason") || "Tiada sebab";
      const w = getWallet(target.id);

      if (action === "check") {
        const embed = new EmbedBuilder()
          .setColor("#ffb6c1")
          .setTitle("💳 Wallet Check")
          .setDescription(`• **Member:** ${target}\n🪙 Coins: ${w.coins.toLocaleString()}\n💠 Pips: ${w.pips.toLocaleString()}`);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (action === "add_coins") w.coins += amount;
      else if (action === "deduct_coins") w.coins = Math.max(0, w.coins - amount);
      else if (action === "add_pips") { w.pips += amount; w.exp += amount; }
      else if (action === "deduct_pips") w.pips = Math.max(0, w.pips - amount);

      await interaction.reply({ content: `✅ Berjaya kemaskini baki ${target.tag}!`, ephemeral: true });
      return;
    }

    if (interaction.commandName === "setup-verify") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      const embed = new EmbedBuilder().setColor("#ffb6c1").setTitle("PlatoMy • Sahkan Plato ID").setDescription("Klik butang bawah.");
      const btn = new ButtonBuilder().setCustomId("open_verify_modal").setLabel("✨ Verifikasi").setStyle(ButtonStyle.Primary);
      await interaction.reply({ content: "✅ Dihantar!", ephemeral: true });
      await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
      return;
    }

    if (interaction.commandName === "setup-birthday") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      const embed = new EmbedBuilder().setColor("#ffb6c1").setTitle("🎂 Birthday Corner").setDescription("Sila tetapkan tarikh lahir anda.");
      const btn = new ButtonBuilder().setCustomId("open_birthday_modal").setLabel("🎀 Set Birthday").setStyle(ButtonStyle.Primary);
      await interaction.reply({ content: "✅ Dihantar!", ephemeral: true });
      await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
      return;
    }

    if (interaction.commandName === "setup-trading") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      const embed = new EmbedBuilder().setColor("#ffb6c1").setTitle("🛍 Trading Center").setDescription("Buka trading ticket.");
      const btn = new ButtonBuilder().setCustomId("open_trading_ticket").setLabel("🛍 Open Trading").setStyle(ButtonStyle.Success);
      await interaction.reply({ content: "✅ Dihantar!", ephemeral: true });
      await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
      return;
    }

    if (interaction.commandName === "setup-report") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      const embed = new EmbedBuilder().setColor("#ffb6c1").setTitle("🚨 Report Center").setDescription("Buat laporan isu.");
      const btn = new ButtonBuilder().setCustomId("open_report_ticket").setLabel("🚨 Report").setStyle(ButtonStyle.Danger);
      await interaction.reply({ content: "✅ Dihantar!", ephemeral: true });
      await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
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

    if (interaction.customId === "open_verify_modal") {
      const modal = new ModalBuilder().setCustomId("ign_verify_modal").setTitle("Sahkan Plato ID");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("plato_id").setLabel("Plato ID").setStyle(TextInputStyle.Short).setRequired(true)));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId === "open_birthday_modal") {
      const modal = new ModalBuilder().setCustomId("birthday_modal").setTitle("Set Birthday");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("bday_date").setLabel("Tarikh (Cth: 1 Oktober)").setStyle(TextInputStyle.Short).setRequired(true)));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId === "open_trading_ticket") {
      await interaction.deferReply({ ephemeral: true });
      const ticketChannel = await interaction.guild.channels.create({
        name: `trade-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ]
      });
      await ticketChannel.send({ content: `${interaction.user}`, embeds: [new EmbedBuilder().setColor("#ffb6c1").setTitle("Trading Ticket").setDescription("Nyatakan item trade.")] });
      await interaction.editReply({ content: `✅ Tiket dibuka: <#${ticketChannel.id}>` });
      return;
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === "ign_verify_modal") {
      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply({ content: "✨ Permohonan hantar!" });
      return;
    }

    if (interaction.customId === "birthday_modal") {
      await interaction.deferReply({ ephemeral: true });
      const d = interaction.fields.getTextInputValue("bday_date");
      const ts = parseBirthdayToTimestamp(d);
      if (ts) birthdaysMap.set(interaction.user.id, { dateStr: d, timestamp: ts });
      await interaction.editReply({ content: "✨ Tarikh lahir disimpan!" });
      return;
    }
  }
});

client.login(token).catch(err => {
  console.error("GAGAL LOGIN KE DISCORD:", err);
});
