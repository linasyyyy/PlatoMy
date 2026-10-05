import {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import http from "http";

// Pelayan web mini untuk memenuhi syarat port Render
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("PlatoMy Bot is running!\n");
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`HTTP server is listening on port ${PORT}`);
});

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("Missing DISCORD_TOKEN environment variable.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Data Stores (Dalam memori)
const levels = new Map();
const wallets = new Map();
const giveawaysMap = new Map();
const eventsMap = new Map(); // Untuk menyimpan data event aktif

const WELCOME_CHANNEL_NAME = "🤗・selamat-datang";
const SERVER_LOGS_CHANNEL_NAME = "server-logs";
const WALLET_LOG_CHANNEL_NAME = "wallet-log";
const VERIFY_CHANNEL_NAME = "verification-log";
const EVENT_LOG_CHANNEL_NAME = "event-log";

const VERIFIED_ROLE_NAME = "Member";
const LOGO_URL = "https://cdn.discordapp.com/attachments/1549051773438787724/1549403998686281808/IMG_5614.png?ex=6ac447ab&is=6ac2f62b&hm=1fca40b2dcd05697b7b7629216cf9f064205e294ed0186f26aa45fff2880ad7e&";

const commands = [
  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Tengok level dan XP anda!"),
  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Tengok carta top members!"),
  new SlashCommandBuilder()
    .setName("wallet")
    .setDescription("Semak baki Coins dan Pips anda!"),
  new SlashCommandBuilder()
    .setName("admin-wallet")
    .setDescription("Urus baki wallet ahli (Admin sahaja)")
    .addStringOption(option =>
      option.setName("action")
        .setDescription("Pilih tindakan")
        .setRequired(true)
        .addChoices(
          { name: "Add Coins", value: "add_coins" },
          { name: "Deduct Coins", value: "deduct_coins" },
          { name: "Add Pips", value: "add_pips" },
          { name: "Deduct Pips", value: "deduct_pips" },
          { name: "Check Balance", value: "check" }
        )
    )
    .addUserOption(option =>
      option.setName("target")
        .setDescription("Ahli yang ingin diuruskan")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("setup-verify")
    .setDescription("Hantar panel butang verifikasi Plato ID (Admin sahaja)"),
  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Cipta giveaway baru (Admin sahaja)")
    .addStringOption(option =>
      option.setName("prize")
        .setDescription("Hadiah giveaway (Contoh: 1,000 Coins)")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName("winners")
        .setDescription("Bilangan pemenang")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName("duration")
        .setDescription("Tempoh masa dalam minit")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("create-event")
    .setDescription("Cipta komuniti event baru (Admin sahaja)")
    .addStringOption(option => option.setName("name").setDescription("Nama event").setRequired(true))
    .addStringOption(option => option.setName("description").setDescription("Penerangan event").setRequired(true))
    .addStringOption(option => option.setName("datetime").setDescription("Tarikh & Masa (Contoh: 10 Okt 2026, 8:00 PM)").setRequired(true))
    .addIntegerOption(option => option.setName("max_players").setDescription("Had maksimum pemain").setRequired(true))
    .addStringOption(option => option.setName("reward").setDescription("Hadiah/Ganjaran (Contoh: 1,000 Coins)").setRequired(true))
    .addIntegerOption(option => option.setName("server_points").setDescription("Server Points (Pilihan)").setRequired(false)),
  new SlashCommandBuilder()
    .setName("end-event")
    .setDescription("Tamatkan event dan umumkan pemenang (Admin sahaja)")
    .addStringOption(option => option.setName("event_id").setDescription("ID Mesej Event").setRequired(true))
    .addUserOption(option => option.setName("winner_1").setDescription("Pemenang Tempat ke-1").setRequired(false))
    .addUserOption(option => option.setName("winner_2").setDescription("Pemenang Tempat ke-2").setRequired(false))
    .addUserOption(option => option.setName("winner_3").setDescription("Pemenang Tempat ke-3").setRequired(false)),
].map((command) => command.toJSON());

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot dah siap! Logged in as ${readyClient.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(token);

  try {
    await rest.put(Routes.applicationCommands(readyClient.user.id), {
      body: commands,
    });
    console.log("Slash commands berjaya di-register!");
  } catch (error) {
    console.error("Gagal mendaftarkan slash commands:", error);
  }
});

function getWallet(userId) {
  if (!wallets.has(userId)) {
    wallets.set(userId, { coins: 0, pips: 0, serverPoints: 0 });
  }
  return wallets.get(userId);
}

async function sendLog(guild, channelName, logPayload) {
  const logChannel = guild.channels.cache.find(
    (c) => c.name.toLowerCase().includes(channelName.toLowerCase()) && c.isTextBased()
  );
  if (logChannel && "send" in logChannel) {
    await logChannel.send(logPayload);
  }
}

client.on(Events.GuildMemberAdd, async (member) => {
  const channel = member.guild.channels.cache.find(
    (candidate) => candidate.name.includes(WELCOME_CHANNEL_NAME) && candidate.isTextBased(),
  );
  if (!channel || !("send" in channel)) return;

  const userName = member.user.tag;
  const userAvatar = member.user.displayAvatarURL({ size: 128, dynamic: true });

  const welcomeEmbed = new EmbedBuilder()
    .setColor("#ffb6c1")
    .setAuthor({ name: userName, iconURL: userAvatar })
    .setTitle("🌸 SELAMAT DATANG!")
    .setDescription(`Hai ${member}! 🖐️💕\nSelamat datang ke Plato MY!\n\n🎀 Jom enjoy dan have fun bersama kami! ♡`)
    .setImage("https://cdn.discordapp.com/attachments/1549051773438787724/1551515791910903918/Video.gif?ex=6ab2412e&is=6ab0efae&hm=55745d5aeae4a0e4bedaec11b1821b998f516b8d64b0c02585202ac3a8748f00&")
    .setThumbnail(LOGO_URL)
    .setFooter({ text: `Awak adalah member ke ${member.guild.memberCount}th!` })
    .setTimestamp();

  await channel.send({ embeds: [welcomeEmbed] });
});

client.on(Events.GuildMemberRemove, async (member) => {
  const channel = member.guild.channels.cache.find(
    (candidate) => candidate.name.includes(SERVER_LOGS_CHANNEL_NAME) && candidate.isTextBased(),
  );
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
  const user = levels.get(userId) ?? { xp: 0, level: 1, username: message.author.username };
  user.username = message.author.username;
  user.xp += 10;
  if (user.xp >= user.level * 100) {
    user.level += 1;
    await message.channel.send(`Tahniah ${message.author}, awak naik level **${user.level}**! 🎉`);
  }
  levels.set(userId, user);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "rank") {
      const user = levels.get(interaction.user.id) ?? { xp: 0, level: 1 };
      await interaction.reply(`📊 **Rank awak:** Level ${user.level} | XP: ${user.xp}`);
      return;
    }

    if (interaction.commandName === "leaderboard") {
      if (!interaction.guild) {
        await interaction.reply({ content: "Gunakan dalam server.", ephemeral: true });
        return;
      }
      const topUsers = [...levels.values()].sort((a, b) => b.xp - a.xp).slice(0, 10);
      if (topUsers.length === 0) {
        await interaction.reply("Belum ada data leaderboard lagi!");
        return;
      }
      const description = topUsers
        .map((user, index) => {
          let medal = "";
          if (index === 0) medal = "🥇 ";
          else if (index === 1) medal = "🥈 ";
          else if (index === 2) medal = "🥉 ";
          else medal = `#${index + 1} `;
          return `${medal}**${user.username}**\nLevel ${user.level} • ${user.xp} XP\n`;
        })
        .join("\n");

      const serverIcon = interaction.guild.iconURL({ size: 128 });
      const leaderboardEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("🏆 PlatoMy Leaderboard")
        .setDescription(description)
        .setFooter({ text: "PlatoMy Community", ...(serverIcon ? { iconURL: serverIcon } : {}) })
        .setTimestamp();
      if (serverIcon) leaderboardEmbed.setThumbnail(serverIcon);

      await interaction.reply({ embeds: [leaderboardEmbed] });
      return;
    }

    if (interaction.commandName === "wallet") {
      const wallet = getWallet(interaction.user.id);
      const userAvatar = interaction.user.displayAvatarURL({ size: 128, dynamic: true });
      const walletEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setAuthor({ name: interaction.user.username, iconURL: userAvatar })
        .setTitle("💰 My Wallet")
        .setDescription(`🪙 **Plato Coins:** ${wallet.coins.toLocaleString()}\n💠 **Pips:** ${wallet.pips.toLocaleString()}\n✨ **Server Points:** ${wallet.serverPoints.toLocaleString()}`)
        .setTimestamp();
      await interaction.reply({ embeds: [walletEmbed] });
      return;
    }

    if (interaction.commandName === "admin-wallet") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "❌ Maaf, hanya Admin yang sah boleh menggunakan arahan ini!", ephemeral: true });
        return;
      }

      const action = interaction.options.getString("action");
      const targetUser = interaction.options.getUser("target");

      if (action === "check") {
        const wallet = getWallet(targetUser.id);
        await interaction.reply({
          content: `🔍 **Baki Wallet ${targetUser.tag}:**\n🪙 Coins: ${wallet.coins.toLocaleString()}\n💠 Pips: ${wallet.pips.toLocaleString()}\n✨ Points: ${wallet.serverPoints.toLocaleString()}`,
          ephemeral: true,
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`wallet_modal_${action}_${targetUser.id}`)
        .setTitle("Manage Wallet Balance");

      const amountInput = new TextInputBuilder()
        .setCustomId("amount_input")
        .setLabel("Jumlah (Amount)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Contoh: 500")
        .setRequired(true);

      const reasonInput = new TextInputBuilder()
        .setCustomId("reason_input")
        .setLabel("
