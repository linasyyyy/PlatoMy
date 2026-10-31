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
import path from "path";
import { fileURLToPath } from "url";
import { registerDashboardApi } from "./dashboard-api.js";

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
const giveawaysMap = new Map(); 
const rumbleMap = new Map(); 
const tempVoiceOwners = new Map();

function getWallet(id) {
  if (!wallets.has(id)) wallets.set(id, { coins: 0, pips: 0, exp: 0, sponsorTotal: 0 });
  return wallets.get(id);
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

// Diambil dari env Railway atau fallback selamat
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

// Logo (fail di repo bernama "public:logo.jpg.jpg"; kalau dah betulkan kepada public/logo.jpg, baris ini boleh dipadam)
app.get("/logo.jpg", (req, res) => res.sendFile(path.join(__dirname, "public:logo.jpg.jpg")));

// Halaman dashboard + semua API (event, giveaway, rumble, embed, wallet, trading)
registerDashboardApi({ app, client, wallets, getWallet, giveawaysMap, rumbleMap });

app.listen(PORT, () => {
  console.log(`Web Dashboard PlatoMy (Y2K Theme) berjalan di port ${PORT}!`);
});

const LEVEL_LOG_CHANNEL_NAME = "level-up";       
const WALLET_LOG_CHANNEL_NAME = "wallet-log";       
const TRADING_LOG_CHANNEL_NAME = "trading-log"; 
const ADMIN_REVIEW_CHANNEL_NAME = "admin-review";         
const EVENT_LOG_CHANNEL_NAME = "event-log";         
const LOGO_URL = "https://cdn.discordapp.com/attachments/1549051773438787724/1549403998686281808/IMG_5614.png";

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
    .addSubcommand(sub => sub.setName("create").setDescription("Cipta event baharu (Admin sahaja)")
      .addStringOption(opt => opt.setName("title").setDescription("Tajuk event").setRequired(true))
      .addStringOption(opt => opt.setName("description").setDescription("Butiran event").setRequired(true))
    ),
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

  const levelUpEmbed = new EmbedBuilder()
    .setColor("#ff69b4")
    .setTitle("✨ 𝖫𝖤𝖵𝖤𝖫 𝖴𝖯! 🌸")
    .setDescription(`🖤 Tahniah <@${userId}>! Anda baru sahaja naik ke **Level ${newLevel}**! ✨\n\n🎀 Teruskan aktif dalam komuniti **PlatoMy**! 🚀`)
    .setThumbnail(LOGO_URL)
    .setTimestamp();

  await channel.send({ content: `🎉 Tahniah <@${userId}> atas kenaikan level anda!`, embeds: [levelUpEmbed] }).catch(() => {});
}

function calculateLevelData(totalExp) {
  let level = 1;
  let expRequired = 200;
  let currentExp = totalExp;

  while (currentExp >= expRequired) {
    currentExp -= expRequired;
    level++;
    expRequired = level * 200;
  }

  return { level, currentExp, expRequired };
}

function getMalaysiaTime() {
  return new Date().toLocaleTimeString('en-US', { 
    timeZone: 'Asia/Kuala_Lumpur', 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true 
  });
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  const userId = message.author.id;

  const w = getWallet(userId);
  const oldExp = w.exp;
  w.exp += 2;

  const oldData = calculateLevelData(oldExp);
  const newData = calculateLevelData(w.exp);

  if (newData.level > oldData.level) {
    await sendLevelUpLog(message.guild, userId, newData.level);
  }

  const content = message.content.trim().toLowerCase();

  if (content === "!wallet" || content === "!bank") {
    const timeString = getMalaysiaTime();
    const embed = new EmbedBuilder()
      .setColor("#ff69b4")
      .setTitle("💳 PlatoMy • Wallet")
      .setDescription(`🪙 **Plato Coins:** ${w.coins.toLocaleString()}\n💠 **Pips:** ${w.pips.toLocaleString()}\n🌸 **Total Sponsor:** ${w.sponsorTotal.toLocaleString()}`)
      .setFooter({ text: `PlatoMy Bank • Today at ${timeString}` });
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
        const userLevelData = calculateLevelData(data.exp);           
        lbDescription += `${medalIcon} **<@${uid}>**\nLevel ${userLevelData.level} • EXP: **${data.exp.toLocaleString()}**\n\n`;
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

    const data = calculateLevelData(w.exp);
    const progressBlocks = Math.floor((data.currentExp / data.expRequired) * 4);
    const progressBar = "ꕤ".repeat(progressBlocks) + "✧".repeat(4 - progressBlocks);

    const timeString = getMalaysiaTime();

    const rankEmbed = new EmbedBuilder()
      .setColor("#ff69b4")
      .setAuthor({ name: `${message.author.username}'s Rank Card`, iconURL: message.author.displayAvatarURL({ size: 128, dynamic: true }) })
      .setTitle("✿ LEVEL & STATUS ✿")
      .setDescription(
        `🖤 **Member:** ${message.author}\n\n` +
        `🏆 **Server Rank:** \`${rankDisplay}\`\n` +
        `📊 **Current Level:** \`${data.level}\`\n` +
        `✨ **Total EXP:** \`${w.exp.toLocaleString()} EXP\`\n\n` +
        `📈 **Progress to Level ${data.level + 1}:**\n` +
        `\`[${progressBar}]\` **${data.currentExp}/${data.expRequired} EXP**`
      )
      .setThumbnail(message.author.displayAvatarURL({ size: 256, dynamic: true }))
      .setFooter({ text: `PlatoMy • Today at ${timeString}` });

    await message.reply({ embeds: [rankEmbed] });
    return;
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "wallet") {
      const w = getWallet(interaction.user.id);
      const timeString = getMalaysiaTime();
      const embed = new EmbedBuilder()
        .setColor("#ff69b4")
        .setTitle("💳 PlatoMy • Wallet")
        .setDescription(`🪙 **Plato Coins:** ${w.coins.toLocaleString()}\n💠 **Pips:** ${w.pips.toLocaleString()}\n🌸 **Total Sponsor:** ${w.sponsorTotal.toLocaleString()}`)
        .setFooter({ text: `PlatoMy Bank • Today at ${timeString}` });
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (interaction.commandName === "setup-report") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      const embed = new EmbedBuilder()
        .setColor("#ff69b4")
        .setTitle("🛡️ PlatoMy Report Center")
        .setDescription("Ada sebarang aduan, masalah atau laporan? Klik butang di bawah untuk menghantar laporan kepada pihak admin secara sulit.");
      const btn = new ButtonBuilder().setCustomId("open_report_modal").setLabel("🚨 Submit Report").setStyle(ButtonStyle.Danger);
      await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
      await interaction.reply({ content: "✅ Panel Report berjaya dihantar!", ephemeral: true });
      return;
    }

    if (interaction.commandName === "setup-trading") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      const embed = new EmbedBuilder()
        .setColor("#ff69b4")
        .setTitle("📦 PlatoMy Trading Center")
        .setDescription("Ingin melakukan transaksi, jual beli atau trade item? Klik butang di bawah untuk membuka tiket trading.");
      const btn = new ButtonBuilder().setCustomId("open_trading_modal").setLabel("🤝 Trading Ticket").setStyle(ButtonStyle.Success);
      await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
      await interaction.reply({ content: "✅ Panel Trading berjaya dihantar!", ephemeral: true });
      return;
    }

    if (interaction.commandName === "setup-birthday") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      const embed = new EmbedBuilder()
        .setColor("#ff69b4")
        .setTitle("🎂 PlatoMy Birthday Corner")
        .setDescription("Ingin tarikh lahir anda disambut? Gunakan arahan `/birthday set` untuk mendaftarkan hari istimewa anda!");
      await interaction.channel.send({ embeds: [embed] });
      await interaction.reply({ content: "✅ Panel Birthday Corner berjaya dihantar!", ephemeral: true });
      return;
    }

    if (interaction.commandName === "event") {
      const sub = interaction.options.getSubcommand();
      if (sub === "create") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        }

        const title = interaction.options.getString("title");
        const description = interaction.options.getString("description");
        const timeString = getMalaysiaTime();

        const eventEmbed = new EmbedBuilder()
          .setColor("#ff69b4")
          .setTitle(`🎉・${title}`)
          .setDescription(`${description}\n\n🎀 Dianjurkan oleh: ${interaction.user}`)
          .setThumbnail(LOGO_URL)
          .setTimestamp();

        await interaction.channel.send({ content: "✨ **Pengumuman Event Baharu!**", embeds: [eventEmbed] });
        await interaction.reply({ content: "✅ Event berjaya dicipta dan diumumkan!", ephemeral: true });

        const eventLogChannel = interaction.guild.channels.cache.find(
          c => c.name.toLowerCase().includes(EVENT_LOG_CHANNEL_NAME.toLowerCase()) && c.isTextBased()
        );

        if (eventLogChannel) {
          const logEmbed = new EmbedBuilder()
            .setColor("#ff69b4")
            .setTitle("🛡️・Event Log: New Event Created")
            .setDescription(
              `📌 **Tajuk:** ${title}\n` +
              `📝 **Butiran:** ${description}\n` +
              `👤 **Admin:** ${interaction.user} (\`${interaction.user.id}\`)`
            )
            .setFooter({ text: `Event Log • Today at ${timeString}` })
            .setTimestamp();
          await eventLogChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
      }
      return;
    }

    if (interaction.commandName === "admin-wallet") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
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

      const logChannel = interaction.guild.channels.cache.find(
        c => c.name.toLowerCase().includes(WALLET_LOG_CHANNEL_NAME.toLowerCase()) && c.isTextBased()
      );

      if (logChannel) {
        const timeString = getMalaysiaTime();
        const logEmbed = new EmbedBuilder()
          .setColor("#ff69b4")
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
          .setFooter({ text: `PlatoMy Bank Log • Today at ${timeString}` })
          .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }
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
          const userLevelData = calculateLevelData(data.exp);           
          lbDescription += `${medalIcon} **<@${userId}>**\nLevel ${userLevelData.level} • EXP: **${data.exp.toLocaleString()}**\n\n`;
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
    const customId = interaction.customId;
    const buttonLabel = interaction.component?.label?.toLowerCase() || "";

    if (customId === "open_report_modal" || buttonLabel.includes("submit report")) {
      const modal = new ModalBuilder().setCustomId("report_modal").setTitle("🛡️ PlatoMy Report Form");
      const reportInput = new TextInputBuilder().setCustomId("report_text").setLabel("Nyatakan aduan / laporan anda").setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(reportInput));
      await interaction.showModal(modal);
      return;
    }

    if (customId === "open_trading_modal" || buttonLabel.includes("trading ticket")) {
      const modal = new ModalBuilder().setCustomId("trading_modal").setTitle("📦 PlatoMy Trading Ticket");
      const tradingInput = new TextInputBuilder().setCustomId("trading_text").setLabel("Butiran trading / item").setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(tradingInput));
      await interaction.showModal(modal);
      return;
    }

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

  if (interaction.isModalSubmit()) {
    const timeString = getMalaysiaTime();

    if (interaction.customId === "report_modal") {
      const reportContent = interaction.fields.getTextInputValue("report_text");
      await interaction.reply({ content: "✅ Laporan anda telah dihantar kepada pihak Admin!", ephemeral: true });

      const reviewChannel = interaction.guild.channels.cache.find(
        c => c.name.toLowerCase().includes(ADMIN_REVIEW_CHANNEL_NAME.toLowerCase()) && c.isTextBased()
      );

      if (reviewChannel) {
        const reportEmbed = new EmbedBuilder()
          .setColor("#ff69b4")
          .setTitle("🚨 New Report Received")
          .setDescription(`👤 **Pengadu:** ${interaction.user} (\`${interaction.user.id}\`)\n📝 **Aduan:**\n${reportContent}`)
          .setFooter({ text: `Admin Review • Today at ${timeString}` })
          .setTimestamp();
        await reviewChannel.send({ embeds: [reportEmbed] }).catch(() => {});
      }
      return;
    }

    if (interaction.customId === "trading_modal") {
      const tradingContent = interaction.fields.getTextInputValue("trading_text");
      await interaction.reply({ content: "✅ Maklumat trading anda telah dihantar!", ephemeral: true });

      const tradingChannel = interaction.guild.channels.cache.find(
        c => c.name.toLowerCase().includes(TRADING_LOG_CHANNEL_NAME.toLowerCase()) && c.isTextBased()
      );

      if (tradingChannel) {
        const tradingEmbed = new EmbedBuilder()
          .setColor("#ff69b4")
          .setTitle("📦 New Trading Ticket Log")
          .setDescription(`👤 **Pengguna:** ${interaction.user} (\`${interaction.user.id}\`)\n📝 **Butiran Trading:**\n${tradingContent}`)
          .setFooter({ text: `Trading Log • Today at ${timeString}` })
          .setTimestamp();
        await tradingChannel.send({ embeds: [tradingEmbed] }).catch(() => {});
      }
      return;
    }
  }
});

client.login(token).catch(err => { console.error("GAGAL LOGIN:", err); });
