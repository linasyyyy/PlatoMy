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

const LEVEL_LOG_CHANNEL_NAME = "level-up";       
const TRADING_LOG_CHANNEL_NAME = "trading-log"; 
const REPORT_LOG_CHANNEL_NAME = "report-log";         
const WELCOME_CHANNEL_NAME = "selamat-datang";
const SERVER_LOGS_CHANNEL_NAME = "server-logs";
const UPDATE_CHANNEL_NAME = "plato-update";
const LOGO_URL = "https://cdn.discordapp.com/attachments/1549051773438787724/1549403998686281808/IMG_5614.png";

let lastPostedUpdateId = null;

// --- FUNGSI ALERT X (TWITTER) AUTOMATIK ---
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
              .setColor("#ff69b4")
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
    console.error("Gagal mengambil update Plato dari X:", error);
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

  // Semak update X (Twitter) secara automatik setiap 3 minit (180000ms)
  checkPlatoUpdates();
  setInterval(checkPlatoUpdates, 180000);
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

  const levelUpEmbed = new EmbedBuilder()
    .setColor("#ff69b4")
    .setTitle("✨ 𝖫𝖤𝖵𝖤𝖫 𝖴𝖯! 🌸")
    .setDescription(`🖤 Tahniah <@${userId}>! Anda baru sahaja naik ke **Level ${newLevel}**! ✨\n\n🎀 Teruskan aktif dalam komuniti **PlatoMy**! 🚀`)
    .setThumbnail(LOGO_URL)
    .setTimestamp();

  await channel.send({ content: `🎉 Tahniah <@${userId}> atas kenaikan level anda!`, embeds: [levelUpEmbed] }).catch(() => {});
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
      .setColor("#ff69b4")
      .setTitle("💳 PlatoMy • Wallet")
      .setDescription(`🪙 **Plato Coins:** ${w.coins.toLocaleString()}\n💠 **Pips:** ${w.pips.toLocaleString()}\n✨ **EXP:** ${w.exp.toLocaleString()}`);
    await message.reply({ embeds: [embed] });
    return;
  }

  if (content === "!lb" || content === "!leaderboard") {
    const sortedWallets = [...wallets.entries()].sort((a, b) => b[1].exp - a[1].exp).slice(0, 10);
    let lbDescription = "";
    
    if (sortedWallets.length === 0) {
      lbDescription = "• *Belum ada rekod leaderboard EXP lagi.*";
    } else {
      const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
      sortedWallets.forEach(([uid, data], index) => {
        const medalIcon = medals[index] || `#${index + 1}`;           
        const estimatedLevel = Math.floor(data.exp / 1000) + 1;           
        lbDescription += `${medalIcon} **<@${uid}>**\nLevel ${estimatedLevel} • EXP: **${data.exp.toLocaleString()}**\n\n`;
      });
    }

    const lbEmbed = new EmbedBuilder()
      .setColor("#ff69b4")
      .setTitle("💃🏻 Leaderboard PlatoMy")
      .setDescription(lbDescription)
      .setThumbnail(LOGO_URL)
      .setTimestamp();

    await message.reply({ embeds: [lbEmbed] });
    return;
  }

  if (content === "!level" || content === "!rank") {
    const sortedArr = [...wallets.entries()].sort((a, b) => b[1].exp - a[1].exp);
    const serverRank = sortedArr.findIndex(([id]) => id === userId) + 1;
    const rankDisplay = serverRank > 0 ? `#${serverRank}` : "#-";

    const currentLevel = Math.floor(w.exp / 1000) + 1;
    const currentXpInLevel = Math.floor(w.exp % 1000);
    const progressBlocks = Math.floor(currentXpInLevel / 100);
    const progressBar = "🖤".repeat(progressBlocks) + "🤍".repeat(10 - progressBlocks);

    const rankEmbed = new EmbedBuilder()
      .setColor("#ff69b4")
      .setAuthor({ name: `${message.author.username}'s Rank Card`, iconURL: message.author.displayAvatarURL({ size: 128, dynamic: true }) })
      .setTitle("ʚ₊˚ 🌸 𝖫𝖤𝖵𝖤𝖫 & 𝖲𝖳𝖠𝖳𝖴𝖲 ˚₊・ɞ")
      .setDescription(
        `🖤 **Member:** ${message.author}\n\n` +
        `🏆 **Server Rank:** \`${rankDisplay}\`\n` +
        `📊 **Current Level:** \`${currentLevel}\`\n` +
        `✨ **Total EXP:** \`${w.exp.toLocaleString()} EXP\`\n\n` +
        `📈 **Progress to Level ${currentLevel + 1}:**\n` +
        `\`[${progressBar}]\` **${currentXpInLevel}/1000 EXP**`
      )
      .setThumbnail(message.author.displayAvatarURL({ size: 256, dynamic: true }))
      .setFooter({ text: "PlatoMy • Y2K Crystal Pink & Black Edition ♡" })
      .setTimestamp();

    await message.reply({ embeds: [rankEmbed] });
    return;
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "wallet") {
      const w = getWallet(interaction.user.id);
      const embed = new EmbedBuilder()
        .setColor("#ff69b4")
        .setTitle("💳 PlatoMy • Wallet")
        .setDescription(`🪙 **Plato Coins:** ${w.coins.toLocaleString()}\n💠 **Pips:** ${w.pips.toLocaleString()}\n✨ **EXP:** ${w.exp.toLocaleString()}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (interaction.commandName === "leaderboard") {
      const colorInput = interaction.options.getString("color") || "#ff69b4";
      const sortedWallets = [...wallets.entries()].sort((a, b) => b[1].exp - a[1].exp).slice(0, 10);
      let lbDescription = "";
      
      if (sortedWallets.length === 0) {
        lbDescription = "• *Belum ada rekod leaderboard EXP lagi.*";
      } else {
        const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
        sortedWallets.forEach(([userId, data], index) => {
          const medalIcon = medals[index] || `#${index + 1}`;           
          const estimatedLevel = Math.floor(data.exp / 1000) + 1;           
          lbDescription += `${medalIcon} **<@${userId}>**\nLevel ${estimatedLevel} • EXP: **${data.exp.toLocaleString()}**\n\n`;
        });
      }

      const lbEmbed = new EmbedBuilder()
        .setColor(colorInput)
        .setTitle("💃🏻 Leaderboard PlatoMy")
        .setDescription(lbDescription)
        .setThumbnail(LOGO_URL)
        .setTimestamp();

      await interaction.reply({ embeds: [lbEmbed] });
      return;
    }

    if (interaction.commandName === "embed-image") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      const targetChannel = interaction.options.getChannel("channel");
      const imageUrl = interaction.options.getString("image_url");
      const titleText = interaction.options.getString("title");
      const colorInput = interaction.options.getString("color") || "#ff69b4";

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
        .setColor("#ff69b4")
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
          .setColor("#ff69b4")
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
