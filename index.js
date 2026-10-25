import {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
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
const birthdaysMap = new Map(); 
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

// HTML Dashboard Y2K Crystal Terus Dalam Kod (Anti-Error)
app.get("/", (req, res) => {
  const username = req.isAuthenticated() && req.user ? req.user.username : "Guest";
  
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
                        neonPink: '#F996B1',
                        textSoft: '#FCE4EC',
                    }
                }
            }
        }
    </script>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        body { background-color: #050505; color: #FCE4EC; font-family: 'Outfit', sans-serif; }
        .crystal-dark-card { background-color: #111111; border: 1px solid rgba(249, 150, 177, 0.25); box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5); border-radius: 1.5rem; }
        .gel-filled-btn { background: #F996B1; color: #050505; font-weight: bold; }
    </style>
</head>
<body class="h-screen w-full flex items-center justify-center p-6">
    <div class="crystal-dark-card p-10 max-w-lg w-full text-center border-2 border-neonPink shadow-2xl">
        <div class="w-16 h-16 rounded-full bg-neonPink/20 text-neonPink flex items-center justify-center text-3xl mx-auto mb-6 border border-neonPink">
            🔮
        </div>
        <h1 class="text-3xl font-black text-textSoft mb-2">Plato<span class="text-neonPink">My</span> Dashboard</h1>
        <p class="text-sm text-neonPink/80 mb-6 uppercase tracking-wider">Status: ${username === "Guest" ? "Sila Log Masuk" : "Logged in as: " + username}</p>
        
        ${username === "Guest" 
            ? `<a href="/login" class="inline-block px-8 py-3 rounded-full gel-filled-btn text-sm uppercase tracking-wide shadow-lg">Login with Discord</a>`
            : `<a href="/logout" class="inline-block px-8 py-3 rounded-full bg-red-500 text-white text-sm uppercase tracking-wide">Logout</a>`
        }
    </div>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`Web Dashboard PlatoMy (Y2K Theme) berjalan di port ${PORT}!`);
});

// --- DISCORD BOT LOGIC ---
const BIRTHDAY_CHANNEL_ID = ""; 
const LEVEL_LOG_CHANNEL_NAME = "level-up";       
const WELCOME_CHANNEL_NAME = "selamat-datang";
const LOGO_URL = "https://cdn.discordapp.com/attachments/1549051773438787724/1549403998686281808/IMG_5614.png";

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
      console.log("Update check:", updateContent);
    }
  } catch (error) {
    console.error("Gagal mengambil update Plato:", error);
  }
}

const commands = [
  new SlashCommandBuilder().setName("wallet").setDescription("Semak baki akaun PlatoMy • Wallet anda! 🏦"),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Papar papan pendahulu (Leaderboard EXP) 📊"),
  new SlashCommandBuilder().setName("setup-verify").setDescription("Hantar panel sahkan Plato ID (Admin sahaja)"),
].map(c => c.toJSON());

client.once(Events.ClientReady, async (c) => {
  console.log(`Bot telah berjaya log masuk sebagai ${c.user.tag}!`);[span_0](start_span)[span_0](end_span)

  const rest = new REST({ version: "10" }).setToken(token);
  try {
    await rest.put(Routes.applicationCommands(c.user.id), { body: commands });
    console.log("Slash commands berjaya di-register!");[span_1](start_span)[span_1](end_span)
  } catch (error) {
    console.error("Gagal mendaftarkan slash commands:", error);
  }

  setInterval(() => { checkPlatoUpdates(); }, 1000 * 60 * 5);
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
