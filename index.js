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
} from "discord.js";
import http from "http";

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("PlatoMy Bot is running!\n");
});
server.listen(process.env.PORT || 3000);

const token = process.env.DISCORD_TOKEN;
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMembers
  ] 
});

const wallets = new Map();
const eventsMap = new Map();
const birthdaysMap = new Map();

// KANAL & TETAPAN SERVER
const VERIFY_CHANNEL_ID = ""; 
const WALLET_LOG_ID = "";     
const WELCOME_CHANNEL_NAME = "🤗・selamat-datang";
const SERVER_LOGS_CHANNEL_NAME = "server-logs";
const VERIFIED_ROLE_NAME = "Member";
const LOGO_URL = "https://cdn.discordapp.com/attachments/1549051773438787724/1549403998686281808/IMG_5614.png";

const commands = [
  new SlashCommandBuilder().setName("wallet").setDescription("Semak baki wallet anda!"),
  new SlashCommandBuilder().setName("admin-wallet").setDescription("Urus baki wallet ahli (Admin sahaja)")
    .addStringOption(opt => opt.setName("action").setDescription("Tindakan").setRequired(true).addChoices(
      { name: "Add Coins", value: "add_coins" }, { name: "Deduct Coins", value: "deduct_coins" },
      { name: "Add Pips", value: "add_pips" }, { name: "Deduct Pips", value: "deduct_pips" }, { name: "Check", value: "check" }
    ))
    .addUserOption(opt => opt.setName("target").setDescription("Ahli").setRequired(true))
    .addIntegerOption(opt => opt.setName("amount").setDescription("Jumlah").setRequired(true))
    .addStringOption(opt => opt.setName("reason").setDescription("Sebab/Alasan").setRequired(false)),
  new SlashCommandBuilder().setName("setup-verify").setDescription("Hantar panel sahkan Plato ID (Admin sahaja)"),
  new SlashCommandBuilder().setName("setup-birthday").setDescription("Hantar panel Birthday Corner yang aesthetic (Admin sahaja)"),
  new SlashCommandBuilder().setName("birthday").setDescription("Urus tarikh lahir anda")
    .addSubcommand(sub => sub.setName("set").setDescription("Tetapkan tarikh lahir anda")),
  new SlashCommandBuilder().setName("event").setDescription("Urus event komuniti")
    .addSubcommand(sub => sub.setName("create").setDescription("Cipta event baharu menggunakan modal (Admin sahaja)")),
].map(c => c.toJSON());

client.once(Events.ClientReady, async (c) => {
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    await rest.put(Routes.applicationCommands(c.user.id), { body: commands });
    console.log("Slash commands berjaya di-register!");
  } catch (error) {
    console.error("Gagal mendaftarkan slash commands:", error);
  }
});

function getWallet(id) {
  if (!wallets.has(id)) wallets.set(id, { coins: 0, pips: 0, serverPoints: 0 });
  return wallets.get(id);
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

// WELCOME SYSTEM
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
    .setImage("https://cdn.discordapp.com/attachments/1549051773438787724/1551515791910903918/Video.gif")
    .setThumbnail(LOGO_URL)
    .setFooter({ text: `Awak adalah member ke ${member.guild.memberCount}!` })
    .setTimestamp();

  await channel.send({ embeds: [welcomeEmbed] });
});

// GOODBYE SYSTEM
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
      const amount = interaction.options.getInteger("amount") || 0;
      const reason = interaction.options.getString("reason") || "Tiada sebab diberikan";
      const w = getWallet(target.id);
      let cur = "";

      if (action === "check") {
        const embed = new EmbedBuilder()
          .setColor("#ffb6c1")
          .setTitle("🔍 Wallet Balance")
          .setDescription(`• **Member:** ${target}\n🪙 Coins: ${w.coins.toLocaleString()}\n💠 Pips: ${w.pips.toLocaleString()}\n✨ Points: ${w.serverPoints.toLocaleString()}`);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (action === "add_coins") { w.coins += amount; cur = "🪙 Coins"; }
      else if (action === "deduct_coins") { w.coins = Math.max(0, w.coins - amount); cur = "🪙 Coins"; }
      else if (action === "add_pips") { w.pips += amount; cur = "💠 Pips"; }
      else if (action === "deduct_pips") { w.pips = Math.max(0, w.pips - amount); cur = "💠 Pips"; }

      await interaction.reply({ content: `✅ Berjaya kemaskini baki ${target.tag}!`, ephemeral: true });
      
      const logEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("📜 Wallet Log")
        .setDescription(`• **Member:** ${target}\n• **Action:** ${action} ${amount}${cur}\n• **Reason:** ${reason}\n• **Admin:** ${interaction.user}`)
        .setTimestamp();
      
      await sendLog(interaction.guild, WALLET_LOG_ID || "wallet-log", { embeds: [logEmbed] });
      return;
    }

    if (interaction.commandName === "setup-verify") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      const embed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("PlatoMy • Sahkan Plato ID ✨")
        .setDescription("Sila klik butang di bawah untuk sahkan Plato ID anda!");
      const btn = new ButtonBuilder().setCustomId("open_verify_modal").setLabel("✨ Tekan Disini").setStyle(ButtonStyle.Primary);
      await interaction.reply({ content: "✅ Panel dihantar!", ephemeral: true });
      await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
      return;
    }

    if (interaction.commandName === "setup-birthday") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Hanya Admin sahaja!", ephemeral: true });
      }

      const bdayEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("🎂 Birthday Corner 🎂")
        .setDescription("💌 Ingin tarikh lahir anda disenaraikan di sini supaya kami boleh meraikannya bersama? Klik butang di bawah untuk menetapkan tarikh lahir anda! ♡\n\n✨ **Upcoming Birthdays**\n• *Tiada tarikh direkodkan lagi. Jom daftar sekarang!*");

      const bdayBtn = new ButtonBuilder()
        .setCustomId("open_birthday_modal")
        .setLabel("🎀 Set/Update Birthday")
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(bdayBtn);

      await interaction.reply({ content: "✅ Birthday Corner berjaya dihantar!", ephemeral: true });
      await interaction.channel.send({ embeds: [bdayEmbed], components: [row] });
      return;
    }

    if (interaction.commandName === "birthday") {
      const sub = interaction.options.getSubcommand();
      if (sub === "set") {
        const modal = new ModalBuilder()
          .setCustomId("birthday_modal")
          .setTitle("🎀 Set Your Birthday");

        const dateInput = new TextInputBuilder()
          .setCustomId("bday_date")
          .setLabel("Tarikh Lahir (Contoh: 15/10)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("DD/MM")
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(dateInput));
        await interaction.showModal(modal);
        return;
      }
    }

    if (interaction.commandName === "event") {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "create") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: "❌ Hanya Admin sahaja yang boleh mencipta event!", ephemeral: true });
        }

        const modal = new ModalBuilder()
          .setCustomId("event_create_modal")
          .setTitle("🌸 PlatoMy • Create Event (v2.0)");

        const titleInput = new TextInputBuilder()
          .setCustomId("event_title")
          .setLabel("Event Title")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("🌸 PlatoMy Evening Bingo")
          .setRequired(true);

        const datetimeInput = new TextInputBuilder()
          .setCustomId("event_datetime")
          .setLabel("Date & Start Time")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("10/10/2026 @ 8:00 PM")
          .setRequired(true);

        const durationInput = new TextInputBuilder()
          .setCustomId("event_duration")
          .setLabel("Duration")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("90 minutes")
          .setRequired(true);

        const prizeInput = new TextInputBuilder()
          .setCustomId("event_prize")
          .setLabel("Prize Pool")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("1,500 Plato Coins + Exclusive Role 👑")
          .setRequired(true);

        const descInput = new TextInputBuilder()
          .setCustomId("event_desc")
          .setLabel("Description / Notes")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Sila bersedia 5 minit lebih awal! Let's have fun! ✨")
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(titleInput),
          new ActionRowBuilder().addComponents(datetimeInput),
          new ActionRowBuilder().addComponents(durationInput),
          new ActionRowBuilder().addComponents(prizeInput),
          new ActionRowBuilder().addComponents(descInput)
        );

        await interaction.showModal(modal);
        return;
      }
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === "ign_verify_modal") {
      await interaction.deferReply({ ephemeral: true });
      const id = interaction.fields.getTextInputValue("plato_id");
      const embed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("🔍 Permohonan Sahkan Plato ID")
        .setDescription(`• **Member:** ${interaction.user}\n• **Plato ID:** \`${id}\``);
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`verify_approve_${interaction.user.id}`).setLabel("Approve").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`verify_reject_${interaction.user.id}`).setLabel("Reject").setStyle(ButtonStyle.Danger)
      );

      await sendLog(interaction.guild, VERIFY_CHANNEL_ID || "verification-log", { embeds: [embed], components: [row] });
      await interaction.editReply({ content: "✨ Permohonan anda akan dihantar kepada admin untuk semakan!" });
      return;
    }

    if (interaction.customId === "birthday_modal") {
      await interaction.deferReply({ ephemeral: true });
      const bdayDate = interaction.fields.getTextInputValue("bday_date");
      birthdaysMap.set(interaction.user.id, bdayDate);

      let bdayListText = "";
      for (const [userId, date] of birthdaysMap.entries()) {
        bdayListText += `• 🌸 **${date}** : <@${userId}>\n`;
      }

      const updatedEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("🎂 Birthday Corner 🎂")
        .setDescription(`💌 Ingin tarikh lahir anda disenaraikan di sini supaya kami boleh meraikannya bersama? Klik butang di bawah untuk menetapkan tarikh lahir anda! ♡\n\n✨ **Upcoming Birthdays**\n${bdayListText || "• *Tiada tarikh direkodkan lagi.*"}`);

      try {
        await interaction.message?.edit({ embeds: [updatedEmbed] }).catch(() => {});
      } catch (e) {}

      await interaction.editReply({ content: `✨ Tarikh lahir anda (${bdayDate}) berjaya disimpan dalam Birthday Corner! ♡` });
      return;
    }

    if (interaction.customId === "event_create_modal") {
      await interaction.deferReply({ ephemeral: true });
      const title = interaction.fields.getTextInputValue("event_title");
      const datetimeStr = interaction.fields.getTextInputValue("event_datetime");
      const duration = interaction.fields.getTextInputValue("event_duration");
      const prize = interaction.fields.getTextInputValue("event_prize");
      const desc = interaction.fields.getTextInputValue("event_desc");

      const eventEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle(`🎮 ${title}`)
        .setDescription(`${desc}\n\n📅 **Date & Time:** ${datetimeStr}\n⏳ **Duration:** ${duration}\n🎁 **Prize Pool:** ${prize}\n👥 **Players:** 0`)
        .setTimestamp();

      const joinBtn = new ButtonBuilder()
        .setCustomId("join_event_v2")
        .setLabel("🎟 Join Event")
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder().addComponents(joinBtn);

      const eventMessage = await interaction.channel.send({ embeds: [eventEmbed], components: [row] });
      
      eventsMap.set(eventMessage.id, {
        title,
        participants: [],
        ended: false,
      });

      await interaction.editReply({ content: "✨ Event v2.0 berjaya dicipta!" });
      return;
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === "open_verify_modal") {
      const modal = new ModalBuilder()
        .setCustomId("ign_verify_modal")
        .setTitle("Sahkan Plato ID");
      
      const platoInput = new TextInputBuilder()
        .setCustomId("plato_id")
        .setLabel("Plato ID")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(platoInput));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId === "open_birthday_modal") {
      const modal = new ModalBuilder()
        .setCustomId("birthday_modal")
        .setTitle("🎀 Set Your Birthday");

      const dateInput = new TextInputBuilder()
        .setCustomId("bday_date")
        .setLabel("Tarikh Lahir (Contoh: 15/10)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("DD/MM")
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(dateInput));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId === "join_event_v2") {
      await interaction.deferReply({ ephemeral: true });
      const ev = eventsMap.get(interaction.message.id);
      if (!ev || ev.ended) return interaction.editReply({ content: "❌ Event ini telah tamat atau tidak wujud." });

      if (ev.participants.includes(interaction.user.id)) {
        return interaction.editReply({ content: "⚠️ Awak sudah menyertai event ini!" });
      }

      ev.participants.push(interaction.user.id);

      const oldEmb = interaction.message.embeds[0];
      const newEmb = EmbedBuilder.from(oldEmb)
        .setDescription(oldEmb.description.replace(/👥 \*\*Players:\*\* \d+/, `👥 **Players:** ${ev.participants.length}`));

      await interaction.message.edit({ embeds: [newEmb] }).catch(() => {});
      await interaction.editReply({ content: `✅ Berjaya menyertai event! Jumlah pemain: ${ev.participants.length}` });
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
