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
      await interaction.reply({
        content: `🪙 **Plato Coins:** ${wallet.coins}\n💠 **Pips:** ${wallet.pips}\n✨ **Server Points:** ${wallet.serverPoints}`,
        ephemeral: true,
      });
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
        .setLabel("Sebab (Reason)")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Contoh: Event Reward")
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(amountInput),
        new ActionRowBuilder().addComponents(reasonInput)
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.commandName === "setup-verify") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "❌ Hanya Admin sahaja!", ephemeral: true });
        return;
      }
      const embed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("PlatoMy • Sahkan Plato ID ✨")
        .setDescription("Sila klik butang di bawah untuk sahkan Plato ID anda!");
      const btn = new ButtonBuilder().setCustomId("open_verify_modal").setLabel("✨ Tekan Disini").setStyle(ButtonStyle.Primary);
      await interaction.reply({ content: "✅ Panel dihantar!", ephemeral: true });
      await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
      return;
    }

    if (interaction.commandName === "create-event") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "❌ Hanya Admin sahaja!", ephemeral: true });
        return;
      }

      const eventName = interaction.options.getString("name");
      const description = interaction.options.getString("description");
      const datetime = interaction.options.getString("datetime");
      const maxPlayers = interaction.options.getInteger("max_players");
      const reward = interaction.options.getString("reward");
      const serverPoints = interaction.options.getInteger("server_points") || 0;

      const eventEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle(`🎮 ${eventName}`)
        .setDescription(`${description}\n\n📅 **Date & Time:** ${datetime}\n👥 **Players:** 0/${maxPlayers}\n🎁 **Reward:** ${reward}\n✨ **Server Points:** ${serverPoints}`)
        .setTimestamp();

      const joinBtn = new ButtonBuilder().setCustomId("join_event").setLabel("🎟 Join Event").setStyle(ButtonStyle.Success);
      const row = new ActionRowBuilder().addComponents(joinBtn);

      await interaction.reply({ content: "✨ Event berjaya dicipta!", ephemeral: true });
      const eventMessage = await interaction.channel.send({ embeds: [eventEmbed], components: [row] });

      eventsMap.set(eventMessage.id, {
        name: eventName,
        maxPlayers,
        reward,
        serverPoints,
        participants: [],
        ended: false,
      });
      return;
    }

    if (interaction.commandName === "end-event") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "❌ Hanya Admin sahaja!", ephemeral: true });
        return;
      }

      const eventId = interaction.options.getString("event_id");
      const eventData = eventsMap.get(eventId);

      if (!eventData || eventData.ended) {
        await interaction.reply({ content: "❌ Event tidak dijumpai atau telah tamat.", ephemeral: true });
        return;
      }

      eventData.ended = true;
      const w1 = interaction.options.getUser("winner_1");
      const w2 = interaction.options.getUser("winner_2");
      const w3 = interaction.options.getUser("winner_3");

      const winnersList = [];
      if (w1) winnersList.push({ user: w1, place: "1st", medal: "🥇" });
      if (w2) winnersList.push({ user: w2, place: "2nd", medal: "🥈" });
      if (w3) winnersList.push({ user: w3, place: "3rd", medal: "🥉" });

      let resultsDesc = `🎁 **Event:** ${eventData.name}\n\n🏆 **Event Results**\n`;
      for (const w of winnersList) {
        resultsDesc += `${w.medal} **${w.place}** – ${w.user}\n`;
        const wallet = getWallet(w.user.id);
        wallet.serverPoints += eventData.serverPoints;

        const logEmbed = new EmbedBuilder()
          .setColor("#ffb6c1")
          .setTitle("🏆 Event Reward Log")
          .setDescription(`• **Member:** ${w.user}\n• **Event:** ${eventData.name}\n• **Result:** ${w.place} Place\n• **Reward:** ${eventData.reward}\n• **Server Points:** +${eventData.serverPoints}`)
          .setTimestamp();
        await sendLog(interaction.guild, EVENT_LOG_CHANNEL_NAME, logEmbed);
      }

      const resultEmbed = new EmbedBuilder().setColor("#ffb6c1").setTitle("🏆 EVENT RESULTS 🏆").setDescription(resultsDesc).setTimestamp();
      await interaction.reply({ embeds: [resultEmbed] });
      return;
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === "ign_verify_modal") {
      await interaction.deferReply({ ephemeral: true });
      const platoId = interaction.fields.getTextInputValue("plato_id");
      const invitedBy = interaction.fields.getTextInputValue("invited_by") || "Tiada";

      const reviewEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("🔍 Permohonan Sahkan Plato ID Baru")
        .setDescription(`• **Member:** ${interaction.user}\n• **Plato ID:** \`${platoId}\`\n• **Invited by:** ${invitedBy}`)
        .setTimestamp();

      const approveBtn = new ButtonBuilder().setCustomId(`verify_approve_${interaction.user.id}`).setLabel("Approve").setStyle(ButtonStyle.Success);
      const rejectBtn = new ButtonBuilder().setCustomId(`verify_reject_${interaction.user.id}`).setLabel("Reject").setStyle(ButtonStyle.Danger);

      await sendLog(interaction.guild, VERIFY_CHANNEL_NAME, { embeds: [reviewEmbed], components: [new ActionRowBuilder().addComponents(approveBtn, rejectBtn)] });
      await interaction.editReply({ content: "✨ Permohonan anda akan dihantar kepada admin untuk semakan!" });
      return;
    }

    if (interaction.customId.startsWith("wallet_modal_")) {
      await interaction.deferReply({ ephemeral: true });
      const parts = interaction.customId.split("_");
      const action = `${parts[2]}_${parts[3]}`;
      const targetUserId = parts[4];

      const amountStr = interaction.fields.getTextInputValue("amount_input");
      const reason = interaction.fields.getTextInputValue("reason_input") || "Tiada sebab diberikan";
      const amount = parseInt(amountStr, 10);

      if (isNaN(amount) || amount <= 0) {
        await interaction.editReply({ content: "❌ Sila masukkan nombor yang sah melebihi 0!" });
        return;
      }

      const targetUser = await client.users.fetch(targetUserId);
      const wallet = getWallet(targetUserId);
      let currencyType = "";
      let formattedChange = "";

      if (action === "add_coins") {
        wallet.coins += amount;
        currencyType = "🪙 Plato Coins";
        formattedChange = `+${amount.toLocaleString()}`;
      } else if (action === "deduct_coins") {
        wallet.coins = Math.max(0, wallet.coins - amount);
        currencyType = "🪙 Plato Coins";
        formattedChange = `-${amount.toLocaleString()}`;
      } else if (action === "add_pips") {
        wallet.pips += amount;
        currencyType = "💠 Pips";
        formattedChange = `+${amount.toLocaleString()}`;
      } else if (action === "deduct_pips") {
        wallet.pips = Math.max(0, wallet.pips - amount);
        currencyType = "💠 Pips";
        formattedChange = `-${amount.toLocaleString()}`;
      }

      await interaction.editReply({ content: `✅ Berjaya kemaskini baki untuk **${targetUser.tag}**!` });

      const logEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("📜 Wallet Log")
        .setDescription(`• **Member:** ${targetUser}\n• **Currency:** ${currencyType}\n• **Amount:** ${formattedChange}\n• **Reason:** ${reason}\n• **Changed by:** ${interaction.user}\n• **Date:** <t:${Math.floor(Date.now() / 1000)}:F>`)
        .setTimestamp();

      await sendLog(interaction.guild, WALLET_LOG_CHANNEL_NAME, logEmbed);
      return;
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === "open_verify_modal") {
      const modal = new ModalBuilder().setCustomId("ign_verify_modal").setTitle("Borang Sahkan Plato ID");
      const platoIdInput = new TextInputBuilder().setCustomId("plato_id").setLabel("Plato ID").setStyle(TextInputStyle.Short).setRequired(true);
      const invitedInput = new TextInputBuilder().setCustomId("invited_by").setLabel("Invited by (Optional)").setStyle(TextInputStyle.Short).setRequired(false);
      modal.addComponents(new ActionRowBuilder().addComponents(platoIdInput), new ActionRowBuilder().addComponents(invitedInput));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId === "join_event") {
      await interaction.deferReply({ ephemeral: true });
      const eventData = eventsMap.get(interaction.message.id);

      if (!eventData || eventData.ended) {
        await interaction.editReply({ content: "❌ Event ini telah tamat atau tidak wujud." });
        return;
      }

      if (eventData.participants.includes(interaction.user.id)) {
        await interaction.editReply({ content: "⚠️ Awak sudah menyertai event ini!" });
        return;
      }

      if (eventData.participants.length >= eventData.maxPlayers) {
        await interaction.editReply({ content: "❌ Maaf, tempat duduk event ini telah penuh!" });
        return;
      }

      eventData.participants.push(interaction.user.id);
      const isFull = eventData.participants.length >= eventData.maxPlayers;

      const oldEmbed = interaction.message.embeds[0];
      const updatedEmbed = EmbedBuilder.from(oldEmbed)
        .setDescription(oldEmbed.description.replace(/👥 \*\*Players:\*\* \d+\/\d+/, `👥 **Players:** ${eventData.participants.length}/${eventData.maxPlayers}`));

      let newComponents = interaction.message.components;
      if (isFull) {
        const disabledBtn = new ButtonBuilder().setCustomId("full").setLabel("🔒 Event Full").setStyle(ButtonStyle.Secondary).setDisabled(true);
        newComponents = [new ActionRowBuilder().addComponents(disabledBtn)];
      }

      await interaction.message.edit({ embeds: [updatedEmbed], components: newComponents }).catch(() => {});
      await interaction.editReply({ content: `✅ Berjaya menyertai event! (${eventData.participants.length}/${eventData.maxPlayers})` });
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
      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setColor("#57F287").setTitle("✅ Sahkan Diluluskan");
      await interaction.edit({ embeds: [updatedEmbed], components: [] });
      return;
    }

    if (interaction.customId.startsWith("verify_reject_")) {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      await interaction.deferUpdate();
      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setColor("#ED4245").setTitle("✅ Sahkan Ditolak");
      await interaction.edit({ embeds: [updatedEmbed], components: [] });
      return;
    }
  }
});

client.login(token).catch((error) => {
  console.error("Gagal log masuk:", error);
  process.exitCode = 1;
});
