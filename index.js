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
} from "discord.js";
import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";

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

// --- EXPRESS SERVER & HTML TEMPLATE ---
const app = express();
const PORT = process.env.PORT || 8080;

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

// HTML Dashboard Y2K Crystal Terus Dalam Kod
app.get("/", checkAuth, (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PlatoMy Dashboard — Black & Pink Y2K Crystal</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        pureBlack: '#050505',
                        darkCard: '#111111',
                        darkHover: '#1a1a1a',
                        neonPink: '#F996B1',
                        pinkMuted: 'rgba(249, 150, 177, 0.15)',
                        textSoft: '#FCE4EC',
                    },
                    fontFamily: {
                        sans: ['Outfit', 'Inter', 'sans-serif'],
                        mono: ['JetBrains Mono', 'monospace'],
                    },
                    boxShadow: {
                        'neon': '0 0 15px rgba(249, 150, 177, 0.4)',
                        'neon-strong': '0 0 25px rgba(249, 150, 177, 0.7)',
                    }
                }
            }
        }
    </script>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body { background-color: #050505; color: #FCE4EC; font-family: 'Outfit', sans-serif; }
        .crystal-dark-card { background-color: #111111; border: 1px solid rgba(249, 150, 177, 0.25); box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5); border-radius: 1.5rem; }
        .gel-neon-btn { background: linear-gradient(180deg, #1a1a1a 0%, #050505 100%); border: 1px solid #F996B1; color: #F996B1; box-shadow: 0 0 15px rgba(249, 150, 177, 0.3); }
        .gel-filled-btn { background: #F996B1; color: #050505; border: 1px solid #F996B1; }
        .text-glow { text-shadow: 0 0 10px rgba(249, 150, 177, 0.6); }
    </style>
</head>
<body class="h-screen w-full flex items-center justify-center p-6">
    <div class="crystal-dark-card p-10 max-w-lg w-full text-center border-2 border-neonPink shadow-neon-strong">
        <div class="w-16 h-16 rounded-full bg-neonPink/20 text-neonPink flex items-center justify-center text-3xl mx-auto mb-6 border border-neonPink shadow-neon">
            🔮
        </div>
        <h1 class="text-3xl font-black text-textSoft mb-2">Plato<span class="text-neonPink text-glow">My</span> Dashboard</h1>
        <p class="text-sm text-neonPink/80 font-mono mb-6 uppercase tracking-wider">Authenticated as: ${req.user.username}</p>
        <div class="bg-[#0a0a0a] p-4 rounded-xl border border-neonPink/30 mb-6 text-left space-y-2 text-sm">
            <p>✅ **Discord Connection:** Active</p>
            <p>🚀 **Node Status:** Online (Port ${PORT})</p>
        </div>
        <a href="/logout" class="inline-block px-8 py-3 rounded-full gel-filled-btn text-sm font-bold uppercase tracking-wide">
            Logout Terminal
        </a>
    </div>
</body>
</html>`);
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
  new SlashCommandBuilder().setName("leaderboard").setDescription("Papar papan pendahulu (Leaderboard EXP) 📊"),
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
    .addStringOption(opt => opt.setName("title").setDescription("Tajuk ringkas (pilihan)").setRequired(false)),
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
  const channel = guild.channels.cache.find(c => c.name.toLowerCase().includes(LEVEL_LOG_CHANNEL_NAME.toLowerCase()) && c.isTextBased());
  if (!channel || !("send" in channel)) return;

  const levelUpEmbed = new EmbedBuilder()
    .setColor("#ffb6c1")
    .setTitle("LEVEL UP! 🎉")
    .setDescription(`Tahniah <@${userId}>! Anda baru sahaja naik ke **Level ${newLevel}**! ✨`)
    .setThumbnail(LOGO_URL)
    .setTimestamp();

  await channel.send({ content: `🎉 Tahniah <@${userId}> atas kenaikan level anda!`, embeds: [levelUpEmbed] }).catch(() => {});
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
  const month = months[parts[1]];
  if (isNaN(day) || month === undefined) return null;
  const now = new Date();
  let targetDate = new Date(now.getFullYear(), month, day);
  if (targetDate < now) targetDate.setFullYear(now.getFullYear() + 1);
  return Math.floor(targetDate.getTime() / 1000);
}

async function checkBirthdays() {
  const now = new Date();
  const todaySec = Math.floor(now.setHours(0,0,0,0) / 1000);
  for (const [userId, data] of birthdaysMap.entries()) {
    if (data.timestamp <= todaySec + 86400 && data.timestamp >= todaySec) {
      for (const [_, guild] of client.guilds.cache) {
        const targetChannel = guild.channels.cache.get(BIRTHDAY_CHANNEL_ID) || guild.channels.cache.find(c => c.name.includes("birthday") && c.isTextBased());
        if (targetChannel) {
          const bdayEmbed = new EmbedBuilder()
            .setColor("#ffb6c1")
            .setTitle("🎉 HAPPY BIRTHDAY! 🎂✨")
            .setDescription(`Selamat Hari Lahir <@${userId}>! 🥳💕`)
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
  const welcomeEmbed = new EmbedBuilder()     
    .setColor("#ffb6c1")     
    .setTitle("🌸SELAMAT DATANG!")     
    .setDescription(`Hai ${member}! 🖐️💕 Selamat datang ke Plato MY!`)
    .setTimestamp();    
  await channel.send({ embeds: [welcomeEmbed] }); 
});  

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  const userId = message.author.id;
  lastActiveMap.set(userId, Date.now());
  const w = getWallet(userId);
  w.exp += 2;

  const content = message.content.trim().toLowerCase();
  if (content === "!wallet" || content === "!bank") {
    const embed = new EmbedBuilder()
      .setColor("#ffb6c1")
      .setTitle("💳 PlatoMy • Wallet")
      .setDescription(`🪙 **Plato Coins:** ${w.coins.toLocaleString()}\n💠 **Pips:** ${w.pips.toLocaleString()}`);
    await message.reply({ embeds: [embed] });
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "wallet") {
      const w = getWallet(interaction.user.id);
      const embed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("💳 PlatoMy • Wallet")
        .setDescription(`🪙 **Plato Coins:** ${w.coins.toLocaleString()}\n💠 **Pips:** ${w.pips.toLocaleString()}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
});

client.login(token).catch(err => {
  console.error("GAGAL LOGIN KE DISCORD:", err);
});
