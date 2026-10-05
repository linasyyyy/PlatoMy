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
server.listen(process.env.PORT || 3000);

const token = process.env.DISCORD_TOKEN;
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });

const wallets = new Map();
const eventsMap = new Map();
const VERIFY_CHANNEL = "verification-log";
const EVENT_LOG = "event-log";
const WALLET_LOG = "wallet-log";
const VERIFIED_ROLE_NAME = "Member";

const commands = [
  new SlashCommandBuilder().setName("wallet").setDescription("Semak baki wallet!"),
  new SlashCommandBuilder().setName("admin-wallet").setDescription("Urus baki wallet ahli")
    .addStringOption(opt => opt.setName("action").setDescription("Tindakan").setRequired(true).addChoices(
      { name: "Add Coins", value: "add_coins" }, { name: "Deduct Coins", value: "deduct_coins" },
      { name: "Add Pips", value: "add_pips" }, { name: "Deduct Pips", value: "deduct_pips" }, { name: "Check", value: "check" }
    ))
    .addUserOption(opt => opt.setName("target").setDescription("Ahli").setRequired(true)),
  new SlashCommandBuilder().setName("setup-verify").setDescription("Hantar panel sahkan Plato ID"),
  new SlashCommandBuilder().setName("create-event").setDescription("Cipta event")
    .addStringOption(opt => opt.setName("name").setDescription("Nama").setRequired(true))
    .addStringOption(opt => opt.setName("description").setDescription("Penerangan").setRequired(true))
    .addStringOption(opt => opt.setName("datetime").setDescription("Masa").setRequired(true))
    .addIntegerOption(opt => opt.setName("max_players").setDescription("Had pemain").setRequired(true))
    .addStringOption(opt => opt.setName("reward").setDescription("Hadiah").setRequired(true))
    .addIntegerOption(opt => opt.setName("server_points").setDescription("Points").setRequired(false)),
  new SlashCommandBuilder().setName("end-event").setDescription("Tamatkan event")
    .addStringOption(opt => opt.setName("event_id").setDescription("ID Mesej").setRequired(true))
    .addUserOption(opt => opt.setName("winner_1").setDescription("1st").setRequired(false))
].map(c => c.toJSON());

client.once(Events.ClientReady, async (c) => {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(c.user.id), { body: commands });
  console.log("Ready!");
});

function getWallet(id) {
  if (!wallets.has(id)) wallets.set(id, { coins: 0, pips: 0, serverPoints: 0 });
  return wallets.get(id);
}

async function sendLog(guild, name, payload) {
  const ch = guild.channels.cache.find(c => c.name.toLowerCase().includes(name.toLowerCase()) && c.isTextBased());
  if (ch) await ch.send(payload);
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "wallet") {
      const w = getWallet(interaction.user.id);
      const embed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL({ size: 128, dynamic: true }) })
        .setTitle("💰 My Wallet")
        .setDescription(`🪙 **Plato Coins:** ${w.coins.toLocaleString()}\n💠 **Pips:** ${w.pips.toLocaleString()}\n✨ **Server Points:** ${w.serverPoints.toLocaleString()}`)
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
    if (interaction.commandName === "admin-wallet") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: "❌ Admin sahaja!", ephemeral: true });
      const action = interaction.options.getString("action");
      const target = interaction.options.getUser("target");
      if (action === "check") {
        const w = getWallet(target.id);
        const embed = new EmbedBuilder().setColor("#ffb6c1").setTitle("🔍 Wallet Balance").setDescription(`• **Member:** ${target}\n🪙 Coins: ${w.coins}\n💠 Pips: ${w.pips}\n✨ Points: ${w.serverPoints}`);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
      const modal = new ModalBuilder().setCustomId(`wallet_modal_${action}_${target.id}`).setTitle("Urus Wallet");
      const detailsInput = new TextInputBuilder().setCustomId("details_input").setLabel("Jumlah & Sebab (Contoh: 500 - Hadiah)").setStyle(TextInputStyle.Short).setPlaceholder("500 - Hadiah Event").setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(detailsInput));
      await interaction.showModal(modal);
      return;
    }
    if (interaction.commandName === "setup-verify") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      const embed = new EmbedBuilder().setColor("#ffb6c1").setTitle("PlatoMy • Sahkan Plato ID ✨").setDescription("Klik butang untuk sahkan Plato ID!");
      const btn = new ButtonBuilder().setCustomId("open_verify_modal").setLabel("✨ Tekan Disini").setStyle(ButtonStyle.Primary);
      await interaction.reply({ content: "✅ Dihantar!", ephemeral: true });
      await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
      return;
    }
    if (interaction.commandName === "create-event") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      const name = interaction.options.getString("name");
      const desc = interaction.options.getString("description");
      const dt = interaction.options.getString("datetime");
      const max = interaction.options.getInteger("max_players");
      const reward = interaction.options.getString("reward");

      const embed = new EmbedBuilder().setColor("#ffb6c1").setTitle(`🎮 ${name}`).setDescription(`${desc}\n\n📅 ${dt}\n👥 Players: 0/${max}\n🎁 ${reward}`);
      const btn = new ButtonBuilder().setCustomId("join_event").setLabel("🎟 Join Event").setStyle(ButtonStyle.Success);
      await interaction.reply({ content: "✨ Event dicipta!", ephemeral: true });
      const msg = await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
      eventsMap.set(msg.id, { name, max, reward, participants: [], ended: false });
      return;
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === "ign_verify_modal") {
      await interaction.deferReply({ ephemeral: true });
      const id = interaction.fields.getTextInputValue("plato_id");
      const embed = new EmbedBuilder().setColor("#ffb6c1").setTitle("🔍 Permohonan Sahkan Plato ID").setDescription(`• **Member:** ${interaction.user}\n• **Plato ID:** \`${id}\``);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`verify_approve_${interaction.user.id}`).setLabel("Approve").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`verify_reject_${interaction.user.id}`).setLabel("Reject").setStyle(ButtonStyle.Danger)
      );
      await sendLog(interaction.guild, VERIFY_CHANNEL, { embeds: [embed], components: [row] });
      await interaction.editReply({ content: "✨ Permohonan anda akan dihantar kepada admin untuk semakan!" });
      return;
    }
    if (interaction.customId.startsWith("wallet_modal_")) {
      await interaction.deferReply({ ephemeral: true });
      const [, , action, targetId] = interaction.customId.split("_");
      const inputVal = interaction.fields.getTextInputValue("details_input");
      
      // Pecahkan input kepada jumlah dan sebab (jika ada tanda '-')
      const parts = inputVal.split("-");
      const amount = parseInt(parts[0].trim(), 10);
      const reason = parts[1] ? parts[1].trim() : "Tiada sebab diberikan";

      if (isNaN(amount) || amount <= 0) {
        await interaction.editReply({ content: "❌ Sila masukkan nombor jumlah yang sah di bahagian hadapan!" });
        return;
      }

      const target = await client.users.fetch(targetId);
      const w = getWallet(targetId);
      let cur = "";

      if (action === "add_coins") { w.coins += amount; cur = "🪙 Coins"; }
      else if (action === "deduct_coins") { w.coins = Math.max(0, w.coins - amount); cur = "🪙 Coins"; }
      else if (action === "add_pips") { w.pips += amount; cur = "💠 Pips"; }
      else if (action === "deduct_pips") { w.pips = Math.max(0, w.pips - amount); cur = "💠 Pips"; }

      await interaction.editReply({ content: `✅ Berjaya kemaskini baki ${target.tag}!` });
      const logEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("📜 Wallet Log")
        .setDescription(`• **Member:** ${target}\n• **Action:** ${action} ${amount} ${cur}\n• **Reason:** ${reason}\n• **Admin:** ${interaction.user}`)
        .setTimestamp();
      await sendLog(interaction.guild, WALLET_LOG, logEmbed);
      return;
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === "open_verify_modal") {
      const modal = new ModalBuilder().setCustomId("ign_verify_modal").setTitle("Sahkan Plato ID");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("plato_id").setLabel("Plato ID").setStyle(TextInputStyle.Short).setRequired(true)));
      await interaction.showModal(modal);
      return;
    }
    if (interaction.customId === "join_event") {
      await interaction.deferReply({ ephemeral: true });
      const ev = eventsMap.get(interaction.message.id);
      if (!ev || ev.ended) return interaction.editReply({ content: "❌ Event tamat." });
      if (ev.participants.includes(interaction.user.id)) return interaction.editReply({ content: "⚠️ Sudah menyertai!" });
      if (ev.participants.length >= ev.max) return interaction.editReply({ content: "❌ Penuh!" });
      ev.participants.push(interaction.user.id);
      
      const oldEmb = interaction.message.embeds[0];
      const newEmb = EmbedBuilder.from(oldEmb).setDescription(oldEmb.description.replace(/👥 Players: \d+\/\d+/, `👥 Players: ${ev.participants.length}/${ev.max}`));
      await interaction.message.edit({ embeds: [newEmb] }).catch(() => {});
      await interaction.editReply({ content: "✅ Berjaya join event!" });
      return;
    }
    if (interaction.customId.startsWith("verify_approve_")) {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      await interaction.deferUpdate();
      const member = await interaction.guild.members.fetch(interaction.customId.replace("verify_approve_", "")).catch(() => null);
      if (member) {
        const role = interaction.guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);
        if (role) await member.roles.add(role).catch(() => {});
      }
      await interaction.edit({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor("#57F287").setTitle("✅ Diluluskan")], components: [] });
      return;
    }
    if (interaction.customId.startsWith("verify_reject_")) {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      await interaction.deferUpdate();
      await interaction.edit({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor("#ED4245").setTitle("❌ Ditolak")], components: [] });
      return;
    }
  }
});

client.login(token);
