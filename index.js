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

// HTML Dashboard Y2K Crystal (Anti-Error & Full)
app.get("/", (req, res) => {
  try {
    const user = req.isAuthenticated() && req.user ? req.user.username : null;
    
    res.send(`<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PlatoMy Dashboard — Black & Pink Y2K Crystal</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background-color: #050505; color: #FCE4EC; font-family: 'Outfit', sans-serif; }
        .crystal-card { background-color: #111111; border: 1px solid rgba(249, 150, 177, 0.3); box-shadow: 0 4px 20px rgba(0, 0, 0, 0.8); border-radius: 1.5rem; }
        .btn-pink { background: #F996B1; color: #050505; font-weight: bold; }
    </style>
</head>
<body class="h-screen w-full flex items-center justify-center p-6">
    <div class="crystal-card p-10 max-w-lg w-full text-center border-2 border-pink-400">
        <div class="w-16 h-16 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center text-3xl mx-auto mb-6 border border-pink-400">
            🔮
        </div>
        <h1 class="text-3xl font-black text-white mb-2">Plato<span class="text-pink-400">My</span> Dashboard</h1>
        <p class="text-sm text-pink-300 mb-6 uppercase tracking-wider">${user ? 'Logged in as: ' + user : 'Sila log masuk menggunakan akaun Discord anda'}</p>
        
        ${!user 
            ? `<a href="/login" class="inline-block px-8 py-3 rounded-full btn-pink text-sm uppercase tracking-wide shadow-lg">Login with Discord</a>`
            : `<a href="/logout" class="inline-block px-8 py-3 rounded-full bg-red-500 text-white text-sm uppercase tracking-wide">Logout</a>`
        }
    </div>
</body>
</html>`);
  } catch (err) {
    res.send("Server Error: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Web Dashboard PlatoMy (Y2K Theme) berjalan di port ${PORT}!`);
});

// --- DISCORD BOT LOGIC ---
const WELCOME_CHANNEL_NAME = "selamat-datang";

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
    .addStringOption(opt => opt.setName("reason").setDescription("Sebab / Nota").setRequired(false)),
  new SlashCommandBuilder().setName("setup-verify").setDescription("Hantar panel sahkan Plato ID (Admin sahaja)"),
  new SlashCommandBuilder().setName("setup-trading").setDescription("Hantar panel Trading Ticket (Admin sahaja)"),
  new SlashCommandBuilder().setName("setup-report").setDescription("Hantar panel Report Ticket (Admin sahaja)"),
  new SlashCommandBuilder().setName("embed-image").setDescription("Hantar embed gambar ke channel pilihan (Admin sahaja)")
    .addChannelOption(opt => opt.setName("channel").setDescription("Pilih channel tujuan").setRequired(true))
    .addStringOption(opt => opt.setName("image_url").setDescription("Link URL gambar/GIF").setRequired(true))
    .addStringOption(opt => opt.setName("title").setDescription("Tajuk ringkas").setRequired(false)),
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

client.on(Events.GuildMemberAdd, async (member) => {   
  const channel = member.guild.channels.cache.find(c => c.name.includes(WELCOME_CHANNEL_NAME) && c.isTextBased());   
  if (!channel || !("send" in channel)) return;    
  const welcomeEmbed = new EmbedBuilder()     
    .setColor("#ffb6c1")     
    .setTitle("🌸SELAMAT DATANG!")     
    .setDescription(`Hai ${member}! 👤💕 Selamat datang ke Plato MY!`)
    .setTimestamp();    
  await channel.send({ embeds: [welcomeEmbed] }); 
});  

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  const userId = message.author.id;
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
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "wallet") {
    const w = getWallet(interaction.user.id);
    const embed = new EmbedBuilder()
      .setColor("#ffb6c1")
      .setTitle("💳 PlatoMy • Wallet")
      .setDescription(`🪙 **Plato Coins:** ${w.coins.toLocaleString()}\n💠 **Pips:** ${w.pips.toLocaleString()}`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (interaction.commandName === "leaderboard") {
    const sorted = [...wallets.entries()].sort((a, b) => b[1].exp - a[1].exp).slice(0, 10);
    const desc = sorted.length === 0 ? "Belum ada data." : sorted.map((item, idx) => `${idx + 1}. <@${item[0]}> — **${item[1].exp}** EXP`).join("\n");
    
    const embed = new EmbedBuilder()
      .setColor("#ffb6c1")
      .setTitle("📊 PlatoMy Leaderboard (EXP)")
      .setDescription(desc)
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "embed-image") {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
    }
    const targetChannel = interaction.options.getChannel("channel");
    const imageUrl = interaction.options.getString("image_url");
    const title = interaction.options.getString("title") || "PlatoMy Announcement";

    const embed = new EmbedBuilder()
      .setColor("#ffb6c1")
      .setTitle(title)
      .setImage(imageUrl)
      .setTimestamp();

    await targetChannel.send({ embeds: [embed] });
    await interaction.reply({ content: `✅ Embed berjaya dihantar ke <#${targetChannel.id}>!`, ephemeral: true });
  }
});

client.login(token).catch(err => {
  console.error("GAGAL LOGIN KE DISCORD:", err);
});
