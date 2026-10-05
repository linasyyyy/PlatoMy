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

const levels = new Map();
const wallets = new Map();
const giveawaysMap = new Map();
const eventsMap = new Map();

const WELCOME_CHANNEL_NAME = "🤗・selamat-datang";
const SERVER_LOGS_CHANNEL_NAME = "server-logs";
const WALLET_LOG_CHANNEL_NAME = "wallet-log";
const VERIFY_CHANNEL_NAME = "verification-log";
const EVENT_LOG_CHANNEL_NAME = "event-log";

const VERIFIED_ROLE_NAME = "Member";
const LOGO_URL = "https://cdn.discordapp.com/attachments/1549051773438787724/1549403998686281808/IMG_5614.png";

const commands = [
  new SlashCommandBuilder().setName("rank").setDescription("Tengok level dan XP anda!"),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Tengok carta top members!"),
  new SlashCommandBuilder().setName("wallet").setDescription("Semak baki Coins dan Pips anda!"),
  new SlashCommandBuilder()
    .setName("admin-wallet")
    .setDescription("Urus baki wallet ahli (Admin sahaja)")
    .addStringOption(option =>
      option.setName("action").setDescription("Pilih tindakan").setRequired(true).addChoices(
        { name: "Add Coins", value: "add_coins" },
        { name: "Deduct Coins", value: "deduct_coins" },
        { name: "Add Pips", value: "add_pips" },
        { name: "Deduct Pips", value: "deduct_pips" },
        { name: "Check Balance", value: "check" }
      )
    )
    .addUserOption(option => option.setName("target").setDescription("Ahli").setRequired(true)),
  new SlashCommandBuilder().setName("setup-verify").setDescription("Hantar panel verifikasi Plato ID"),
  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Cipta giveaway")
    .addStringOption(option => option.setName("prize").setDescription("Hadiah").setRequired(true))
    .addIntegerOption(option => option.setName("winners").setDescription("Pemenang").setRequired(true))
    .addIntegerOption(option => option.setName("duration").setDescription("Masa (minit)").setRequired(true)),
  new SlashCommandBuilder()
    .setName("create-event")
    .setDescription("Cipta event")
    .addStringOption(option => option.setName("name").setDescription("Nama event").setRequired(true))
    .addStringOption(option => option.setName("description").setDescription("Penerangan").setRequired(true))
    .addStringOption(option => option.setName("datetime").setDescription("Tarikh & Masa").setRequired(true))
    .addIntegerOption(option => option.setName("max_players").setDescription("Had pemain").setRequired(true))
    .addStringOption(option => option.setName("reward").setDescription("Hadiah").setRequired(true))
    .addIntegerOption(option => option.setName("server_points").setDescription("Server Points").setRequired(false)),
  new SlashCommandBuilder()
    .setName("end-event")
    .setDescription("Tamatkan event")
    .addStringOption(option => option.setName("event_id").setDescription("ID Mesej").setRequired(true))
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

client.on(Events.GuildMemberAdd, async (member) => {
  const channel = member.guild.channels.cache.find(c => c.name.includes(WELCOME_CHANNEL_NAME) && c.isTextBased());
  if (!channel || !("send" in channel)) return;

  const welcomeEmbed = new EmbedBuilder()
    .setColor("#ffb6c1")
    .setTitle("🌸 SELAMAT DATANG!")
    .setDescription(`Hai ${member}! Selamat datang ke Plato MY! ♡`)
    .setTimestamp();

  await channel.send({ embeds: [welcomeEmbed] });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "wallet") {
      const wallet = getWallet(interaction.user.id);
      await interaction.reply({
        content: `🪙 **Plato Coins:** ${wallet.coins}\n💠 **Pips:** ${wallet.pips}\n✨ **Server Points:** ${wallet.serverPoints}`,
        ephemeral: true,
      });
      return;
    }
    if (interaction.commandName === "setup-verify") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      const embed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("🌸 PlatoMy Plato ID Verification")
        .setDescription("Sila klik butang di bawah untuk verifikasi Plato ID anda!");
      const btn = new ButtonBuilder().setCustomId("open_verify_modal").setLabel("✨ Tekan Disini").setStyle(ButtonStyle.Primary);
      await interaction.reply({ content: "✅ Panel dihantar!", ephemeral: true });
      await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
      return;
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === "ign_verify_modal") {
    await interaction.deferReply({ ephemeral: true });
    const platoId = interaction.fields.getTextInputValue("plato_id");
    const invitedBy = interaction.fields.getTextInputValue("invited_by") || "Tiada";

    const reviewEmbed = new EmbedBuilder()
      .setColor("#ffb6c1")
      .setTitle("🔍 New Plato ID Verification Request")
      .setDescription(`• **Member:** ${interaction.user}\n• **Plato ID:** \`${platoId}\`\n• **Invited by:** ${invitedBy}`)
      .setTimestamp();

    const approveBtn = new ButtonBuilder().setCustomId(`verify_approve_${interaction.user.id}`).setLabel("Approve").setStyle(ButtonStyle.Success);
    const rejectBtn = new ButtonBuilder().setCustomId(`verify_reject_${interaction.user.id}`).setLabel("Reject").setStyle(ButtonStyle.Danger);

    await sendLog(interaction.guild, VERIFY_CHANNEL_NAME, { embeds: [reviewEmbed], components: [new ActionRowBuilder().addComponents(approveBtn, rejectBtn)] });
    await interaction.editReply({ content: "✨ Permohonan verifikasi telah dihantar kepada admin!" });
    return;
  }

  if (interaction.isButton()) {
    if (interaction.customId === "open_verify_modal") {
      const modal = new ModalBuilder().setCustomId("ign_verify_modal").setTitle("Plato ID Verification Form");
      const platoIdInput = new TextInputBuilder().setCustomId("plato_id").setLabel("Plato ID").setStyle(TextInputStyle.Short).setRequired(true);
      const invitedInput = new TextInputBuilder().setCustomId("invited_by").setLabel("Invited by (Optional)").setStyle(TextInputStyle.Short).setRequired(false);
      modal.addComponents(new ActionRowBuilder().addComponents(platoIdInput), new ActionRowBuilder().addComponents(invitedInput));
      await interaction.showModal(modal);
      return;
    }
    if (interaction.customId.startsWith("verify_approve_")) {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      await interaction.deferUpdate();
      const targetUserId = interaction.customId.replace("verify_approve_", "");
      const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
      if (targetMember) {
        const role = interaction.guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);
        if (role) await targetMember.roles.add(role).catch(() => {});
      }
      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setColor("#57F287").setTitle("✅ Verification Approved");
      await interaction.edit({ embeds: [updatedEmbed], components: [] });
      return;
    }
    if (interaction.customId.startsWith("verify_reject_")) {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      await interaction.deferUpdate();
      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setColor("#ED4245").setTitle("✅ Verification Rejected");
      await interaction.edit({ embeds: [updatedEmbed], components: [] });
      return;
    }
  }
});

client.login(token).catch((error) => {
  console.error("Gagal log masuk:", error);
  process.exitCode = 1;
});
