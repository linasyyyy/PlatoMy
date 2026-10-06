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
const birthdaysMap = new Map(); // Simpan UserId -> "DD/MM"
const giveawaysMap = new Map(); // Simpan rekod giveaway messageId -> data

// KANAL & TETAPAN SERVER
const VERIFY_CHANNEL_ID = ""; 
const WALLET_LOG_ID = "";     
const BIRTHDAY_CHANNEL_ID = ""; 
const LEVEL_LOG_CHANNEL_NAME = "🆙・level-up";       // Channel log untuk Level Up
const TRADING_LOG_CHANNEL_NAME = "🤝・blackmarket"; // Channel log untuk Trading Ticket
const REPORT_LOG_CHANNEL_NAME = "report-log";         // Channel log untuk Report System
const WELCOME_CHANNEL_NAME = "🤗・selamat-datang";
const SERVER_LOGS_CHANNEL_NAME = "server-logs";
const VERIFIED_ROLE_NAME = "Member";
const LOGO_URL = "https://cdn.discordapp.com/attachments/1549051773438787724/1549403998686281808/IMG_5614.png";

const commands = [
  new SlashCommandBuilder().setName("wallet").setDescription("Semak baki wallet anda!"),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Papar papan pendahulu (Leaderboard EXP & Server Points) 📊"),
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
  new SlashCommandBuilder().setName("setup-trading").setDescription("Hantar panel Trading Ticket sahaja (Admin sahaja)"),
  new SlashCommandBuilder().setName("setup-report").setDescription("Hantar panel Report Ticket sahaja (Admin sahaja)"),
  new SlashCommandBuilder().setName("birthday").setDescription("Urus tarikh lahir anda")
    .addSubcommand(sub => sub.setName("set").setDescription("Tetapkan tarikh lahir anda")),
  new SlashCommandBuilder().setName("event").setDescription("Urus event komuniti")
    .addSubcommand(sub => sub.setName("create").setDescription("Cipta event baharu menggunakan modal (Admin sahaja)")),
  new SlashCommandBuilder().setName("giveaway").setDescription("Urus sistem giveaway komuniti (Admin sahaja)")
    .addSubcommand(sub => sub.setName("start").setDescription("Mula giveaway baharu")
      .addStringOption(opt => opt.setName("prize").setDescription("Hadiah giveaway").setRequired(true))
      .addIntegerOption(opt => opt.setName("duration").setDescription("Tempoh masa dalam minit").setRequired(true))
      .addIntegerOption(opt => opt.setName("winners").setDescription("Bilangan pemenang").setRequired(true))
    ),
].map(c => c.toJSON());

client.once(Events.ClientReady, async (c) => {
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    await rest.put(Routes.applicationCommands(c.user.id), { body: commands });
    console.log("Slash commands berjaya di-register!");
  } catch (error) {
    console.error("Gagal mendaftarkan slash commands:", error);
  }

  setInterval(() => {
    checkBirthdays();
  }, 1000 * 60 * 60);
});

function getWallet(id) {
  if (!wallets.has(id)) wallets.set(id, { coins: 0, pips: 0, serverPoints: 0 });
  return wallets.get(id);
}

// Fungsi pembantu untuk hantar mesej Level Up ke channel 🆙・level-up
async function sendLevelUpLog(guild, userId, newLevel, totalXp) {
  const channel = guild.channels.cache.find(
    (candidate) => candidate.name.toLowerCase().includes(LEVEL_LOG_CHANNEL_NAME.toLowerCase()) && candidate.isTextBased()
  );
  if (!channel || !("send" in channel)) return;

  const levelUpEmbed = new EmbedBuilder()
    .setColor("#ffb6c1")
    .setTitle("LEVEL UP! 🎉")
    .setDescription(`Tahniah <@${userId}>! Anda baru sahaja naik ke **Level ${newLevel}**! ✨\n\n📊 **Jumlah EXP Terkumpul:** \`${totalXp.toLocaleString()} pts\`\nTeruskan aktif dalam komuniti **PlatoMy**! 🚀`)
    .setThumbnail(LOGO_URL)
    .setTimestamp();

  await channel.send({ content: `🎉 Tahniah <@${userId}> atas kenaikan level anda!`, embeds: [levelUpEmbed] }).catch(() => {});
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

async function checkBirthdays() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const todayFormatted = `${day}/${month}`;

  for (const [userId, bday] of birthdaysMap.entries()) {
    if (bday === todayFormatted) {
      for (const [_, guild] of client.guilds.cache) {
        const targetChannel = guild.channels.cache.get(BIRTHDAY_CHANNEL_ID) || 
                              guild.channels.cache.find(c => c.name.includes("birthday") && c.isTextBased());
        if (targetChannel) {
          const bdayEmbed = new EmbedBuilder()
            .setColor("#ffb6c1")
            .setTitle("🎉 HAPPY BIRTHDAY! 🎂✨")
            .setDescription(`Selamat Hari Lahir <@${userId}>! 🥳💕\n\nSemoga hari lahir anda pada hari ini diwarnai dengan seribu kebahagiaan, dimurahkan rezeki, sentiasa sihat, dan terus sukses dalam apa jua bidang yang diceburi! Terima kasih kerana menjadi sebahagian daripada komuniti **PlatoMy** ini. 🌸✨`)
            .setImage("https://cdn.discordapp.com/attachments/1549051773438787724/1551515791910903918/Video.gif")
            .setTimestamp();

          await targetChannel.send({ content: `🎂 Selamat Hari Lahir <@${userId}>!`, embeds: [bdayEmbed] }).catch(() => {});                  }              }              birthdaysMap.delete(userId);          }      }  }    client.on(Events.GuildMemberAdd, async (member) => {      const channel = member.guild.channels.cache.find(          (candidate) => candidate.name.includes(WELCOME_CHANNEL_NAME) && candidate.isTextBased(),      );      if (!channel \vert{}\vert{} !("send" in channel)) return;        const userName = member.user.tag;      const userAvatar = member.user.displayAvatarURL({ size: 128, dynamic: true });        const welcomeEmbed = new EmbedBuilder()          .setColor("#ffb6c1")          .setAuthor({ name: userName, iconURL: userAvatar })          .setTitle("🌸SELAMAT DATANG!")          .setDescription(`Hai ${member}! 🖐️💕\nSelamat datang ke Plato MY!\n\n🎀 Jom enjoy dan have fun bersama kami! ♡`)
    .setImage("https://cdn.discordapp.com/attachments/1549051773438787724/1551515791910903918/Video.gif")
    .setThumbnail(LOGO_URL)
    .setFooter({ text: `Awak adalah member ke ${member.guild.memberCount}!` })          .setTimestamp();        await channel.send({ embeds: [welcomeEmbed] });  });    client.on(Events.GuildMemberRemove, async (member) => {      const channel = member.guild.channels.cache.find(          (candidate) => candidate.name.includes(SERVER_LOGS_CHANNEL_NAME) && candidate.isTextBased(),      );      if (!channel \vert{}\vert{} !("send" in channel)) return;        const userAvatar = member.user.displayAvatarURL({ size: 128, dynamic: true });      const goodbyeEmbed = new EmbedBuilder()          .setColor("#ffb6c1")          .setTitle(`${member.user.tag} left the server`)
    .setDescription(`**User**\n<@${member.id}>`)          .setThumbnail(userAvatar)          .setFooter({ text: `${member.guild.name}` })
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
        .setTitle("💰PlatoMy Wallet")
        .setDescription(`🪙 **Plato Coins:** ${w.coins.toLocaleString()}\n💠 **Pips:** ${w.pips.toLocaleString()}\n✨ **Server Points:** ${w.serverPoints.toLocaleString()}`)
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (interaction.commandName === "leaderboard") {
      const sortedWallets = [...wallets.entries()].sort((a, b) => b[1].serverPoints - a[1].serverPoints).slice(0, 10);
      let lbDescription = "Want to see more than the top 10?\n\n";
      
      if (sortedWallets.length === 0) {
        lbDescription += "• *Belum ada rekod leaderboard EXP lagi.*";
      } else {
        const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
        sortedWallets.forEach(([userId, data], index) => {
          const medalIcon = medals[index] || `#${index + 1}`;                      const estimatedLevel = Math.floor(data.serverPoints / 100) + 1;                      lbDescription += `${medalIcon} **<@${userId}>**\nLevel${estimatedLevel} • XP: **${data.serverPoints.toLocaleString()}** pts\n\n`;
        });
      }

      const lbEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("💃🏻 Leaderboard PlatoMy")
        .setDescription(lbDescription)
        .setThumbnail(LOGO_URL)
        .setFooter({ text: "Last update: Just now" })
        .setTimestamp();

      await interaction.reply({ embeds: [lbEmbed] });
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

      const oldPoints = w.serverPoints;
      if (action === "add_coins") { w.coins += amount; cur = "🪙 Coins"; }
      else if (action === "deduct_coins") { w.coins = Math.max(0, w.coins - amount); cur = "🪙 Coins"; }
      else if (action === "add_pips") { 
        w.pips += amount; 
        w.serverPoints += amount; 
        cur = "💠 Pips"; 
      }
      else if (action === "deduct_pips") { w.pips = Math.max(0, w.pips - amount); cur = "💠 Pips"; }

      const oldLevel = Math.floor(oldPoints / 100) + 1;
      const newLevel = Math.floor(w.serverPoints / 100) + 1;
      if (newLevel > oldLevel) {
        await sendLevelUpLog(interaction.guild, target.id, newLevel, w.serverPoints);
      }

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

      let bdayListText = "";
      for (const [userId, date] of birthdaysMap.entries()) {
        bdayListText += `• 🌸 **${date}** : <@${userId}>\n`;
      }

      const bdayEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("🎂Birthday Corner 🎂")
        .setDescription(`💌 Ingin tarikh lahir anda disenaraikan di sini supaya kami boleh meraikannya bersama? Klik butang di bawah untuk menetapkan tarikh lahir anda! ♡\n\n✨ **Upcoming Birthdays**\n${bdayListText \vert{}\vert{} "• *Tiada tarikh direkodkan lagi. Jom daftar sekarang!* "}`);                      const bdayBtn = new ButtonBuilder()                  .setCustomId("open_birthday_modal")                  .setLabel("🎀 Set/Update Birthday")                  .setStyle(ButtonStyle.Primary);                      const row = new ActionRowBuilder().addComponents(bdayBtn);               await interaction.reply({ content: "✅ Birthday Corner berjaya dihantar!", ephemeral: true });              await interaction.channel.send({ embeds: [bdayEmbed], components: [row] });              return;          }            if (interaction.commandName === "setup-trading") {              if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;              const embed = new EmbedBuilder()                  .setColor("#ffb6c1")                  .setTitle("🛍️ PlatoMy • Trading Center 🤝")                  .setDescription("Ingin membuat pertukaran item? Sila klik butang di bawah untuk membuka Trading Ticket!");                      const row = new ActionRowBuilder().addComponents(                  new ButtonBuilder().setCustomId("open_trading_ticket").setLabel("🛍️ Open Trading Ticket").setStyle(ButtonStyle.Success)       );                      await interaction.reply({ content: "✅ Panel Trading Ticket berjaya dihantar!", ephemeral: true });              await interaction.channel.send({ embeds: [embed], components: [row] });              return;          }      if (interaction.commandName === "setup-report") {              if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;              const embed = new EmbedBuilder()                  .setColor("#ff2222")                  .setTitle("🚨 PlatoMy • Report  🎫")                  .setDescription("Menghadapi sebarang isu atau masalah? Sila klik butang di bawah untuk membuat laporan kepada Leader!");                      const row = new ActionRowBuilder().addComponents(                  new ButtonBuilder().setCustomId("open_report_ticket").setLabel("🚨 Submit Report").setStyle(ButtonStyle.Danger)       );                      await interaction.reply({ content: "✅ Panel Report Ticket berjaya dihantar!", ephemeral: true });              await interaction.channel.send({ embeds: [embed], components: [row] });              return;          }            if (interaction.commandName === "birthday") {              const sub = interaction.options.getSubcommand();              if (sub === "set") {                  const modal = new ModalBuilder()                      .setCustomId("birthday_modal")                      .setTitle("🎀 Set Your Birthday");                            const dateInput = new TextInputBuilder()                      .setCustomId("bday_date")                      .setLabel("Tarikh Lahir (Format: DD/MM)")                      .setStyle(TextInputStyle.Short)                      .setPlaceholder("15/10")                      .setRequired(true);                            modal.addComponents(new ActionRowBuilder().addComponents(dateInput));                  await interaction.showModal(modal);                  return;              }          }            if (interaction.commandName === "event") {              const subcommand = interaction.options.getSubcommand();              if (subcommand === "create") {                  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {                      return interaction.reply({ content: "❌ Hanya Admin sahaja yang boleh mencipta event!", ephemeral: true });                  }                    const modal = new ModalBuilder()                      .setCustomId("event_create_modal")                      .setTitle("🌸 PlatoMy • Event ");                    const titleInput = new TextInputBuilder()                      .setCustomId("event_title")                      .setLabel("Event Title")                      .setStyle(TextInputStyle.Short)                      .setPlaceholder("🌸 PlatoMy Evening Bingo")                      .setRequired(true);                    const datetimeInput = new TextInputBuilder()                      .setCustomId("event_datetime")                      .setLabel("Date & Start Time")                      .setStyle(TextInputStyle.Short)                      .setPlaceholder("10/10 @ 8:00 PM")                      .setRequired(true);                    const durationInput = new TextInputBuilder()                      .setCustomId("event_duration")                      .setLabel("Duration")                      .setStyle(TextInputStyle.Short)                      .setPlaceholder("90 minutes")                      .setRequired(true);                    const prizeInput = new TextInputBuilder()                      .setCustomId("event_prize")                      .setLabel("Prize Pool")                      .setStyle(TextInputStyle.Short)                      .setPlaceholder("1,500 Plato Coins + Exclusive Role 👑")                      .setRequired(true);                    const descInput = new TextInputBuilder()                      .setCustomId("event_desc")                      .setLabel("Description / Notes")                      .setStyle(TextInputStyle.Paragraph)                      .setPlaceholder("Sila bersedia 5 minit lebih awal! Let's have fun! ✨")                      .setRequired(true);                    modal.addComponents(                      new ActionRowBuilder().addComponents(titleInput),                      new ActionRowBuilder().addComponents(datetimeInput),                      new ActionRowBuilder().addComponents(durationInput),                      new ActionRowBuilder().addComponents(prizeInput),                      new ActionRowBuilder().addComponents(descInput)                  );                    await interaction.showModal(modal);                  return;              }          }      if (interaction.commandName === "giveaway") {       const subcommand = interaction.options.getSubcommand();       if (subcommand === "start") {         if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {           return interaction.reply({ content: "❌ Hanya Admin sahaja yang boleh memulakan giveaway!", ephemeral: true });         }          const prize = interaction.options.getString("prize");         const durationMins = interaction.options.getInteger("duration");         const winnersCount = interaction.options.getInteger("winners");          const endTime = Date.now() + durationMins * 60 * 1000;         const endTimeSeconds = Math.floor(endTime / 1000);          const giveawayEmbed = new EmbedBuilder()           .setColor("#ffb6c1")           .setTitle("🎉 GIVEAWAY BERMULA! 🎁")           .setDescription(`🎁 **Hadiah:** ${prize}\n👑 **Bilangan Pemenang:** ${winnersCount}\n⏳ **Berakhir Pada:** <t:${endTimeSeconds}:R> (<t:${endTimeSeconds}:f>)\n\n✨ Klik butang **"🎉 Sertai Giveaway"** di bawah untuk menyertai!\n👥 **Jumlah Penyertaan:** 0`)
          .setThumbnail(LOGO_URL)
          .setTimestamp();

        const joinBtn = new ButtonBuilder()
          .setCustomId("join_giveaway")
          .setLabel("🎉 Sertai Giveaway")
          .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(joinBtn);

        await interaction.reply({ content: "✅ Giveaway berjaya dimulakan!", ephemeral: true });
        const giveawayMessage = await interaction.channel.send({ embeds: [giveawayEmbed], components: [row] });

        giveawaysMap.set(giveawayMessage.id, {
          prize,
          winnersCount,
          participants: [],
          ended: false,
        });

        // Tetapkan masa tamat automatik
        setTimeout(async () => {
          const gw = giveawaysMap.get(giveawayMessage.id);
          if (!gw || gw.ended) return;
          gw.ended = true;

          let winnersText = "";
          if (gw.participants.length === 0) {
            winnersText = "• *Tiada sesiapa menyertai giveaway ini.*";
          } else {
            // Pilih pemenang secara rawak
            const shuffled = [...gw.participants].sort(() => 0.5 - Math.random());
            const winners = shuffled.slice(0, gw.winnersCount);
            winnersText = winners.map(id => `<@${id}>`).join(", ");           }            const endedEmbed = new EmbedBuilder()             .setColor("#57F287")             .setTitle("🎉 GIVEAWAY TELAH TAMAT! 🏆")             .setDescription(`🎁 **Hadiah:** ${gw.prize}\n👥 **Jumlah Penyertaan:** ${gw.participants.length}\n\n🏆 **Pemenang Rasmi:**\n${winnersText}`)
            .setThumbnail(LOGO_URL)
            .setTimestamp();

          const disabledRow = new ActionRowBuilder().addComponents(
            ButtonBuilder.from(joinBtn).setDisabled(true).setStyle(ButtonStyle.Secondary)
          );

          await giveawayMessage.edit({ embeds: [endedEmbed], components: [disabledRow] }).catch(() => {});
          await giveawayMessage.reply({ content: `🎉 Tahniah kepada pemenang giveaway: ${winnersText}!` }).catch(() => {});           giveawaysMap.delete(giveawayMessage.id);         }, durationMins * 60 * 1000);          return;       }     }   }        if (interaction.isModalSubmit()) {          if (interaction.customId === "ign_verify_modal") {              await interaction.deferReply({ ephemeral: true });              const id = interaction.fields.getTextInputValue("plato_id");              const embed = new EmbedBuilder()                  .setColor("#ffb6c1")                  .setTitle("🔍 Permohonan Sahkan Plato ID")                  .setDescription(`• **Member:** ${interaction.user}\n• **Plato ID:** \`${id}\``);
      
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
        .setTitle("🎂Birthday Corner 🎂")
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

    if (interaction.customId.startsWith("report_modal_")) {
      await interaction.deferReply({ ephemeral: true });
      const category = interaction.customId.replace("report_modal_", "");
      const details = interaction.fields.getTextInputValue("report_details");
      const evidence = interaction.fields.getTextInputValue("report_evidence") || "Tiada bukti diberikan";

      const reportChannel = interaction.guild.channels.cache.find(c => c.name.includes("report-log") && c.isTextBased());

      if (!reportChannel) {
        return interaction.editReply({ content: "❌ Channel 'report-log' tidak dijumpai di server! Sila pastikan channel tersebut wujud." });
      }

      const reportEmbed = new EmbedBuilder()
        .setColor("#ff2222")
        .setTitle(`🚨 Laporan Baharu: [${category}]`)
        .setDescription(`• **Pelapor:** ${interaction.user} (${interaction.user.tag})\n• **Status:** 🟡 Open\n• **Handler:** Belum di-claim\n\n📝 **Butiran:**\n${details}\n\n🔗 **Bukti / Screenshot:**\n${evidence}`)
        .setTimestamp();

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("report_claim").setLabel("🙋‍♂️ Claim Report").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("report_resolve").setLabel("✅ Resolve").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("report_reject").setLabel("❌ Reject").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("report_close").setLabel("🔒 Close & Log").setStyle(ButtonStyle.Secondary)
      );

      await reportChannel.send({ embeds: [reportEmbed], components: [actionRow] });
      await interaction.editReply({ content: "✅ Laporan anda telah berjaya dihantar ke channel **report-log**! Terima kasih." });
      return;
    }
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "report_category_select") {
    const selectedCategory = interaction.values[0];
    const modal = new ModalBuilder()
      .setCustomId(`report_modal_${selectedCategory}`)
      .setTitle(`Report: ${selectedCategory}`);

    const detailsInput = new TextInputBuilder()
      .setCustomId("report_details")
      .setLabel("Butiran / Isu Laporan")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Terangkan masalah atau pengguna yang ingin dilapor...")
      .setRequired(true);

    const evidenceInput = new TextInputBuilder()
      .setCustomId("report_evidence")
      .setLabel("Link Bukti / Screenshot")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("https://imgur.com/... atau lampiran pautan")
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(detailsInput),
      new ActionRowBuilder().addComponents(evidenceInput)
    );

    await interaction.showModal(modal);
    return;
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
        .setLabel("Tarikh Lahir (Format: DD/MM)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("15/10")
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(dateInput));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId === "open_trading_ticket") {
      await interaction.deferReply({ ephemeral: true });
      const guild = interaction.guild;
      const ticketChannel = await guild.channels.create({
        name: `trade-${interaction.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        ],
      });

      const embed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("🛍 Trading Ticket Lounge")
        .setDescription(`Hai ${interaction.user}! Selamat datang ke Trading Lounge.\n\nSila nyatakan item yang anda inginkan/Hi please list item that you want to trade here.`);

      const closeBtn = new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("🔒 Trading Selesai/Trading Done")
        .setStyle(ButtonStyle.Danger);

      await ticketChannel.send({ content: `${interaction.user}`, embeds: [embed], components: [new ActionRowBuilder().addComponents(closeBtn)] });
      await interaction.editReply({ content: `✅ Tiket peribadi anda telah dibuka: <#${ticketChannel.id}>` });
      return;
    }

    if (interaction.customId === "open_report_ticket") {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("report_category_select")
        .setPlaceholder("Sila pilih kategori laporan...")
        .addOptions([
          { label: "Player / User Report", value: "Player Report", description: "Lapor salah laku pemain" },
          { label: "Scam / Trading Issue", value: "Scam Issue", description: "Isu penipuan atau perdagangan" },
          { label: "Harassment", value: "Harassment", description: "Gangguan atau ancaman" },
          { label: "Bug / Technical Issue", value: "Technical Bug", description: "Isu teknikal atau pepijat" },
          { label: "Other", value: "Other", description: "Lain-lain isu" },
        ]);

      const row = new ActionRowBuilder().addComponents(selectMenu);
      await interaction.reply({ content: "📌 Sila pilih kategori laporan anda di bawah:", components: [row], ephemeral: true });
      return;
    }

    if (interaction.customId === "close_ticket") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Hanya staf atau admin sahaja yang boleh menutup tiket ini!", ephemeral: true });
      }

      await interaction.reply({ content: "🔒 Tiket ini akan ditutup dalam masa 5 saat..." });
      
      setTimeout(async () => {
        const logChannel = interaction.guild.channels.cache.find(c => c.name.includes(TRADING_LOG_CHANNEL_NAME) && c.isTextBased());
        if (logChannel) {
          const logEmb = new EmbedBuilder()
            .setColor("#ffb6c1")
            .setTitle("🔒 Trading Ticket Closed Log")
            .setDescription(`• **Channel:** \`${interaction.channel.name}\`\n• **Closed by:** ${interaction.user}`)
            .setTimestamp();
          await logChannel.send({ embeds: [logEmb] }).catch(() => {});
        }
        await interaction.channel.delete().catch(() => {});
      }, 5000);
      return;
    }

    // Report Management Buttons for Staff
    if (["report_claim", "report_resolve", "report_reject", "report_close"].includes(interaction.customId)) {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Hanya staf sahaja yang boleh menguruskan laporan ini!", ephemeral: true });
      }

      const oldEmb = interaction.message.embeds[0];
      const oldDesc = oldEmb.description;
      let newStatus = "🟡 Open";
      let color = "#ff2222";

      if (interaction.customId === "report_claim") {
        newStatus = `🔵 Under Review (Claimed by ${interaction.user.tag})`;
        color = "#5865F2";
      } else if (interaction.customId === "report_resolve") {
        newStatus = `🟢 Resolved (Handled by ${interaction.user.tag})`;
        color = "#57F287";
      } else if (interaction.customId === "report_reject") {
        newStatus = `🔴 Rejected (Handled by ${interaction.user.tag})`;
        color = "#ED4245";
      } else if (interaction.customId === "report_close") {
        newStatus = `🔒 Closed & Archived (Handled by ${interaction.user.tag})`;
        color = "#99AAB5";
      }

      const updatedDesc = oldDesc.replace(/• \*\*Status:\*\* .*/, `• **Status:** ${newStatus}`);
      const newEmb = EmbedBuilder.from(oldEmb).setColor(color).setDescription(updatedDesc);

      await interaction.update({ embeds: [newEmb], components: interaction.customId === "report_close" ? [] : interaction.message.components });

      if (interaction.customId === "report_close") {
        const logChannel = interaction.guild.channels.cache.find(c => c.name.includes(REPORT_LOG_CHANNEL_NAME) && c.isTextBased());
        if (logChannel) {
          await logChannel.send({ embeds: [newEmb] }).catch(() => {});
        }
      }
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

    if (interaction.customId === "join_giveaway") {
      await interaction.deferReply({ ephemeral: true });
      const gw = giveawaysMap.get(interaction.message.id);
      if (!gw || gw.ended) return interaction.editReply({ content: "❌ Giveaway ini telah tamat atau tidak wujud." });

      if (gw.participants.includes(interaction.user.id)) {
        return interaction.editReply({ content: "⚠️ Awak sudah menyertai giveaway ini!" });
      }

      gw.participants.push(interaction.user.id);

      const oldEmb = interaction.message.embeds[0];
      const newEmb = EmbedBuilder.from(oldEmb)
        .setDescription(oldEmb.description.replace(/👥 \*\*Jumlah Penyertaan:\*\* \d+/, `👥 **Jumlah Penyertaan:** ${gw.participants.length}`));

      await interaction.message.edit({ embeds: [newEmb] }).catch(() => {});
      await interaction.editReply({ content: `✅ Berjaya menyertai giveaway! Semoga rezeki awak! 🎉` });
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
      await interaction.edit({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor("#ED4245").setTitle("❌ Ditolak")], components: [] }).catch(() => {});
      return;
    }
  }
});

client.login(token);
