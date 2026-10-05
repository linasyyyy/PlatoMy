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

const wallets = new Map();
const eventsMap = new Map();

const VERIFY_CHANNEL_NAME = "verification-log";
const EVENT_LOG_CHANNEL_NAME = "event-log";
const WALLET_LOG_CHANNEL_NAME = "wallet-log";
const VERIFIED_ROLE_NAME = "Member";
const LOGO_URL = "https://cdn.discordapp.com/attachments/1549051773438787724/1549403998686281808/IMG_5614.png";

const commands = [
  new SlashCommandBuilder().setName("wallet").setDescription("Semak baki Coins dan Pips anda!"),
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
  new SlashCommandBuilder().setName("setup-verify").setDescription("Hantar panel sahkan Plato ID"),
  new SlashCommandBuilder()
    .setName("create-event")
    .setDescription("Cipta event komuniti baharu (Admin sahaja)")
    .addStringOption(option => option.setName("name").setDescription("Nama event").setRequired(true))
    .addStringOption(option => option.setName("description").setDescription("Penerangan event").setRequired(true))
    .addStringOption(option => option.setName("datetime").setDescription("Tarikh & Masa (Contoh: 10 Okt, 8 PM)").setRequired(true))
    .addIntegerOption(option => option.setName("max_players").setDescription("Had maksimum pemain").setRequired(true))
    .addStringOption(option => option.setName("reward").setDescription("Hadiah (Contoh: 1,000 Coins)").setRequired(true))
    .addIntegerOption(option => option.setName("server_points").setDescription("Server Points (Pilihan)").setRequired(false)),
  new SlashCommandBuilder()
    .setName("end-event")
    .setDescription("Tamatkan event dan umumkan pemenang")
    .addStringOption(option => option.setName("event_id").setDescription("ID Mesej Event").setRequired(true))
    .addUserOption(option => option.setName("winner_1").setDescription("1st Place").setRequired(false))
    .addUserOption(option => option.setName("winner_2").setDescription("2nd Place").setRequired(false))
    .addUserOption(option => option.setName("winner_3").setDescription("3rd Place").setRequired(false)),
].map(c => c.toJSON());

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot dah siap! Logged in as ${readyClient.user.tag}`);
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    await rest.put(Routes.applicationCommands(readyClient.user.id), { body: commands });
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
    c => c.name.toLowerCase().includes(channelName.toLowerCase()) && c.isTextBased()
  );
  if (logChannel && "send" in logChannel) {
    await logChannel.send(logPayload);
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "wallet") {
      const wallet = getWallet(interaction.user.id);
      const userAvatar = interaction.user.displayAvatarURL({ size: 128, dynamic: true });

      const walletEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setAuthor({ name: interaction.user.username, iconURL: userAvatar })
        .setTitle("💰 My Wallet")
        .setDescription(`🪙 **Plato Coins:** ${wallet.coins.toLocaleString()}\n💠 **Pips:** ${wallet.pips.toLocaleString()}\n✨ **Server Points:** ${wallet.serverPoints.toLocaleString()}`)
        .setTimestamp();

      await interaction.reply({ embeds: [walletEmbed], ephemeral: true });
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
        const checkEmbed = new EmbedBuilder()
          .setColor("#ffb6c1")
          .setTitle("🔍 Wallet Balance Check")
          .setDescription(`• **Member:** ${targetUser}\n🪙 Coins: ${wallet.coins.toLocaleString()}\n💠 Pips: ${wallet.pips.toLocaleString()}\n✨ Points: ${wallet.serverPoints.toLocaleString()}`)
          .setTimestamp();

        await interaction.reply({ embeds: [checkEmbed], ephemeral: true });
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
        .setLabel("Sebab (Reason)")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Cont
