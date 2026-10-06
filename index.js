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
import url from "url";
import querystring from "querystring";

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
const giveawaysMap = new Map(); 

// --- LAMAN WEB DASHBOARD INTERAKTIF ---
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  if (req.method === "POST" && pathname === "/action") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      const postData = querystring.parse(body);
      const actionType = postData.actionType;
      
      const guild = client.guilds.cache.first();
      if (guild) {
        let targetChannelName = "";
        if (actionType === "giveaway") targetChannelName = "🎁・giveaway";
        else if (actionType === "event") targetChannelName = "🗣・event-annoucement";
        else if (actionType === "setup_verify") targetChannelName = "🫆・verify-here";
        else if (actionType === "setup_birthday") targetChannelName = "🎂・birthday-corner";

        let textChannel = guild.channels.cache.find(c => c.name.toLowerCase().includes(targetChannelName.toLowerCase()) && c.isTextBased());
        
        if (!textChannel) {
          textChannel = guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages));
        }
        
        if (textChannel) {
          if (actionType === "giveaway") {
            const prize = postData.gwPrize || "Hadiah Misteri";
            const duration = parseInt(postData.gwDuration) || 5;
            const winnersCount = parseInt(postData.gwWinners) || 1;

            const endTime = Date.now() + duration * 60 * 1000;
            const endTimeSeconds = Math.floor(endTime / 1000);

            const gwEmbed = new EmbedBuilder()
              .setColor("#ffb6c1")
              .setTitle("˚.🎀༘⋆ GIVEAWAY ˚.🎀༘⋆")
              .setDescription(`🎁 **Hadiah:** ${prize}\n👑 **Pemenang:** ${winnersCount}\n⏳ **Berakhir:** <t:${endTimeSeconds}:R>\n\n👥 **Penyertaan:** 0`)
              .setTimestamp();

            const joinBtn = new ButtonBuilder().setCustomId("join_giveaway").setLabel("🎉 Sertai Giveaway").setStyle(ButtonStyle.Success);
            const msg = await textChannel.send({ embeds: [gwEmbed], components: [new ActionRowBuilder().addComponents(joinBtn)] });

            giveawaysMap.set(msg.id, { prize, winnersCount, participants: [], ended: false });
          } 
          else if (actionType === "event") {
            const title = postData.evTitle || "Event Komuniti";
            const timeStr = postData.evTime || "Sekarang";
            const prize = postData.evPrize || "Tiada Hadiah";

            const evEmbed = new EmbedBuilder()
              .setColor("#ffb6c1")
              .setTitle(`🎮 ${title}`)
              .setDescription(`📅 **Masa:** ${timeStr}\n🎁 **Hadiah:** ${prize}\n👥 **Pemain:** 0`)
              .setTimestamp();

            const joinBtn = new ButtonBuilder().setCustomId("join_event_v2").setLabel("🎟 Join Event").setStyle(ButtonStyle.Success);
            const msg = await textChannel.send({ embeds: [evEmbed], components: [new ActionRowBuilder().addComponents(joinBtn)] });

            eventsMap.set(msg.id, { title, dateStr: "Hari Ini", timeStr, endTimeMs: Date.now() + 86400000, participants: [], ended: false });
          }
          else if (actionType === "setup_verify") {
            const embed = new EmbedBuilder().setColor("#ffb6c1").setTitle("PlatoMy • Sahkan Plato ID ✨").setDescription("Sila klik butang di bawah untuk sahkan Plato ID anda!");
            const btn = new ButtonBuilder().setCustomId("open_verify_modal").setLabel("✨ Tekan Disini").setStyle(ButtonStyle.Primary);
            await textChannel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
          }
          else if (actionType === "setup_birthday") {
            const embed = new EmbedBuilder().setColor("#ffb6c1").setTitle("🎂 Birthday Corner 🎂").setDescription("Klik butang di bawah untuk tetapkan tarikh lahir anda! ♡");
            const btn = new ButtonBuilder().setCustomId("open_birthday_modal").setLabel("🎀 Set/Update Birthday").setStyle(ButtonStyle.Primary);
            await textChannel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
          }
        }
      }

      res.writeHead(302, { Location: "/" });
      res.end();
    });
    return;
  }

  const sortedWallets = [...wallets.entries()].sort((a, b) => b[1].serverPoints - a[1].serverPoints).slice(0, 5);
  let leaderboardRows = sortedWallets.length === 0 ? "<tr><td colspan='3'>Belum ada rekod EXP lagi.</td></tr>" : 
    sortedWallets.map(([uid, data], i) => `<tr><td>#${i+1}</td><td>ID:${uid}</td><td>Lvl ${Math.floor(data.serverPoints/100)+1} (${data.serverPoints} pts)</td></tr>`).join("");

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`
    <!DOCTYPE html>
    <html lang="ms">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>👑 PlatoMy • Control Panel</title>
        <style>
            body { background-color: #fff0f3; color: #59484b; font-family: 'Segoe UI', Tahoma, sans-serif; text-align: center; padding: 20px; }
            .container { max-width: 750px; margin: 0 auto; }
            .card { background: white; padding: 25px; border-radius: 20px; box-shadow: 0 10px 25px rgba(255,182,193,0.4); border: 2px solid #ffb6c1; margin-bottom: 20px; }
            h1, h3 { color: #ff69b4; }
            input, button { width: 100%; padding: 10px; margin: 8px 0; border-radius: 10px; border: 1px solid #ffb6c1; box-sizing: border-box; }
            button { background-color: #ff69b4; color: white; font-weight: bold; cursor: pointer; }
            button:hover { background-color: #ff479b; }
            table { width: 100%; border-collapse: collapse; background: #fff8f9; border-radius: 10px; overflow: hidden; margin-top: 10px; }
            th, td { padding: 8px; border-bottom: 1px solid #ffe4e6; font-size: 13px; text-align: center; }
            th { background-color: #ffb6c1; color: white; }
            .badge { display: inline-block; background: #ffb6c1; color: white; padding: 5px 12px; border-radius: 50px; font-weight: bold; font-size: 13px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="card">
                <h1>🌸 PlatoMy Bot Control Panel 🌸</h1>
                <div class="badge">✨ Status: Online & Connected</div>
                <p>Urus bot Discord anda secara terus dari website ini! ♡</p>
            </div>

            <div class="card">
                <h3>🎉 Cipta Giveaway (Hantar ke 🎁・giveaway)</h3>
                <form action="/action" method="POST">
                    <input type="hidden" name="actionType" value="giveaway">
                    <input type="text" name="gwPrize" placeholder="Hadiah (Cth: 1,000 Coins)" required>
                    <input type="number" name="gwDuration" placeholder="Masa (Minit)" required>
                    <input type="number" name="gwWinners" placeholder="Bilangan Pemenang" required>
                    <button type="submit">Hantar Giveaway 🚀</button>
                </form>
            </div>

            <div class="card">
                <h3>🗣️ Cipta Event (Hantar ke 🗣️・event-annoucement)</h3>
                <form action="/action" method="POST">
                    <input type="hidden" name="actionType" value="event">
                    <input type="text" name="evTitle" placeholder="Tajuk Event" required>
                    <input type="text" name="evTime" placeholder="Masa (Cth: 8:00 PM)" required>
                    <input type="text" name="evPrize" placeholder="Hadiah Event" required>
                    <button type="submit">Hantar Event 🎮</button>
                </form>
            </div>

            <div class="card">
                <h3>📌 Hantar Panel Setup Utama</h3>
                <form action="/action" method="POST">
                    <input type="hidden" name="actionType" value="setup_verify">
                    <button type="submit">Hantar Panel Verify (ke 🫆・verify-here)</button>
                </form>
                <form action="/action" method="POST" style="margin-top: 10px;">
                    <input type="hidden" name="actionType" value="setup_birthday">
                    <button type="submit">Hantar Panel Birthday (ke 🎂・birthday-corner)</button>
                </form>
            </div>

            <div class="card">
                <h3>👑 Live Leaderboard (Top 5)</h3>
                <table>
                    <tr><th>Rank</th><th>User</th><th>Level & Points</th></tr>
                    ${leaderboardRows}
                </table>
            </div>
        </div>
    </body>
    </html>
  `);
});
server.listen(process.env.PORT || 3000);

const VERIFY_CHANNEL_ID = ""; 
const WALLET_LOG_ID = "";     
const BIRTHDAY_CHANNEL_ID = ""; 
const LEVEL_LOG_CHANNEL_NAME = "🆙・level-up";       
const TRADING_LOG_CHANNEL_NAME = "🤝・blackmarket"; 
const REPORT_LOG_CHANNEL_NAME = "report-log";         
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
  new SlashCommandBuilder().setName("embed-builder").setDescription("Cipta dan edit custom embed interaktif (Admin sahaja)")
    .addChannelOption(opt => opt.setName("channel").setDescription("Pilih channel untuk hantar embed").setRequired(true)),
  new SlashCommandBuilder().setName("birthday").setDescription("Urus tarikh lahir anda")
    .addSubcommand(sub => sub.setName("set").setDescription("Tetapkan tarikh lahir anda")),
  new SlashCommandBuilder().setName("event").setDescription("Urus event komuniti")
    .addSubcommand(sub => sub.setName("create").setDescription("Cipta event baharu menggunakan modal (Admin sahaja)")),
  new SlashCommandBuilder().setName("giveaway").setDescription("Urus sistem giveaway komuniti (Admin sahaja)")
    .addSubcommand(sub => sub.setName("start").setDescription("Mula giveaway baharu")
      .addStringOption(opt => opt.setName("prize").setDescription("Hadiah giveaway").setRequired(true))
      .addIntegerOption(opt => opt.setName("duration").setDescription("Tempoh masa dalam minit").setRequired(true))
      .addIntegerOption(opt => opt.setName("winners").setDescription("Bilangan pemenang").setRequired(true))
      .addStringOption(opt => opt.setName("image").setDescription("Link URL imej besar banner giveaway").setRequired(false))
    ),
].map(c => c.toJSON());

client.once(Events.ClientReady, async (c) => {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
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

function parseBirthdayToTimestamp(inputStr) {
  const months = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, september: 8,
    oct: 9, october: 9, okt: 9,
    nov: 10, november: 10,
    dec: 11, december: 11, dis: 11
  };

  const parts = inputStr.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) return null;

  const day = parseInt(parts[0]);
  const monthKey = parts[1];
  const month = months[monthKey];

  if (isNaN(day) || month === undefined) return null;

  const now = new Date();
  let year = now.getFullYear();
  let targetDate = new Date(year, month, day);

  if (targetDate < now) {
    targetDate.setFullYear(year + 1);
  }

  return Math.floor(targetDate.getTime() / 1000);
}

async function checkBirthdays() {
  const now = new Date();
  const todaySec = Math.floor(now.setHours(0,0,0,0) / 1000);

  for (const [userId, data] of birthdaysMap.entries()) {
    if (data.timestamp <= todaySec + 86400 && data.timestamp >= todaySec) {
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

          await targetChannel.send({ content: `🎂 Selamat Hari Lahir <@${userId}>!`, embeds: [bdayEmbed] }).catch(() => {});         
        }       
      }       
      birthdaysMap.delete(userId);     
    }   
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
    .setTitle("🌸SELAMAT DATANG!")     
    .setDescription(`Hai ${member}! 🖐️💕\nSelamat datang ke Plato MY!\n\n🎀 Jom enjoy dan have fun bersama kami! ♡`)
    .setImage("https://cdn.discordapp.com/attachments/1549051773438787724/1551515791910903918/Video.gif")
    .setThumbnail(LOGO_URL)
    .setFooter({ text: `Awak adalah member ke ${member.guild.memberCount}!` })     
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
          const medalIcon = medals[index] || `#${index + 1}`;           
          const estimatedLevel = Math.floor(data.serverPoints / 100) + 1;           
          lbDescription += `${medalIcon} **<@${userId}>**\nLevel${estimatedLevel} • XP: **${data.serverPoints.toLocaleString()}** pts\n\n`;
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

    if (interaction.commandName === "embed-builder") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Hanya Admin sahaja!", ephemeral: true });
      }

      const targetChannel = interaction.options.getChannel("channel");
      
      const defaultEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("Plato MY")
        .setDescription("Test");

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`eb_edit_basic_${targetChannel.id}`).setLabel("edit basic info").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`eb_edit_author_${targetChannel.id}`).setLabel("edit author").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`eb_edit_footer_${targetChannel.id}`).setLabel("edit footer").setStyle(ButtonStyle.Secondary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`eb_edit_images_${targetChannel.id}`).setLabel("edit images").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`eb_send_${targetChannel.id}`).setLabel("🚀 Send to Channel").setStyle(ButtonStyle.Success)
      );

      await interaction.reply({ content: `✨ Embed Builder diaktifkan untuk channel **${targetChannel.name}**:`, embeds: [defaultEmbed], components: [row1, row2], ephemeral: true });
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

      let sortedBdays = [...birthdaysMap.entries()].sort((a,b) => a[1].timestamp - b[1].timestamp);
      let bdayListText = "";
      sortedBdays.forEach(([userId, data]) => {
        bdayListText += `• <t:${data.timestamp}:D> : <@${userId}>\n`;
      });

      const bdayEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("🎂Birthday Corner 🎂")
        .setDescription(`💌 Ingin tarikh lahir anda disenaraikan di sini supaya kami boleh meraikannya bersama? Klik butang di bawah untuk menetapkan tarikh lahir anda! ♡\n\n✨ **Upcoming Birthdays**\n${bdayListText || "• *Tiada tarikh direkodkan lagi. Jom daftar sekarang!* "}`);        
      
      const bdayBtn = new ButtonBuilder()         
        .setCustomId("open_birthday_modal")         
        .setLabel("🎀 Set/Update Birthday")         
        .setStyle(ButtonStyle.Primary);        
      
      const row = new ActionRowBuilder().addComponents(bdayBtn);        
      await interaction.reply({ content: "✅ Birthday Corner berjaya dihantar!", ephemeral: true });       
      await interaction.channel.send({ embeds: [bdayEmbed], components: [row] });       
      return;     
    }      

    if (interaction.commandName === "setup-trading") {       
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;       
      const embed = new EmbedBuilder()         
        .setColor("#ffb6c1")         
        .setTitle("🛍️️ PlatoMy • Trading Center 🤝")         
        .setDescription("Ingin membuat pertukaran item? Sila klik butang di bawah untuk membuka Trading Ticket!");        
      
      const row = new ActionRowBuilder().addComponents(         
        new ButtonBuilder().setCustomId("open_trading_ticket").setLabel("🛍 Open Trading Ticket").setStyle(ButtonStyle.Success)
      );        
      
      await interaction.reply({ content: "✅ Panel Trading Ticket berjaya dihantar!", ephemeral: true });       
      await interaction.channel.send({ embeds: [embed], components: [row] });       
      return;     
    }

    if (interaction.commandName === "setup-report") {       
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;       
      const embed = new EmbedBuilder()         
        .setColor("#ffb6c1")         
        .setTitle("🚨 PlatoMy • Report  🎫")         
        .setDescription("Menghadapi sebarang isu atau masalah? Sila klik butang di bawah untuk membuat laporan kepada Leader!");        
      
      const row = new ActionRowBuilder().addComponents(         
        new ButtonBuilder().setCustomId("open_report_ticket").setLabel("🚨 Submit Report").setStyle(ButtonStyle.Danger)
      );        
      
      await interaction.reply({ content: "✅ Panel Report Ticket berjaya dihantar!", ephemeral: true });       
      await interaction.channel.send({ embeds: [embed], components: [row] });       
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
          .setLabel("Tarikh Lahir (Cth: 1 Oktober atau 7 Oct)")           
          .setStyle(TextInputStyle.Short)           
          .setPlaceholder("1 Oktober")           
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
          .setTitle("🌸 PlatoMy • Event ");          

        const titleInput = new TextInputBuilder()           
          .setCustomId("event_title")           
          .setLabel("Event Title")           
          .setStyle(TextInputStyle.Short)           
          .setPlaceholder("🌸 PlatoMy Evening Bingo")           
          .setRequired(true);          

        const dateInput = new TextInputBuilder()           
          .setCustomId("event_date")           
          .setLabel("Tarikh Event (Cth: 15 October 2026)")           
          .setStyle(TextInputStyle.Short)           
          .setPlaceholder("15 October 2026")           
          .setRequired(true);          

        const timeInput = new TextInputBuilder()           
          .setCustomId("event_time")           
          .setLabel("Masa Tamat / Mula (Cth: 21:00 atau 9 PM)")           
          .setStyle(TextInputStyle.Short)           
          .setPlaceholder("21:00")           
          .setRequired(true);          

        const prizeInput = new TextInputBuilder()           
          .setCustomId("event_prize")           
          .setLabel("Prize Pool")           
          .setStyle(TextInputStyle.Short)           
          .setPlaceholder("1,500 Plato Coins")           
          .setRequired(true);          

        const descInput = new TextInputBuilder()           
          .setCustomId("event_desc")           
          .setLabel("Description / Notes")           
          .setStyle(TextInputStyle.Paragraph)           
          .setPlaceholder("Sila bersedia 5 minit lebih awal!")           
          .setRequired(true);          

        modal.addComponents(           
          new ActionRowBuilder().addComponents(titleInput),           
          new ActionRowBuilder().addComponents(dateInput),           
          new ActionRowBuilder().addComponents(timeInput),           
          new ActionRowBuilder().addComponents(prizeInput),           
          new ActionRowBuilder().addComponents(descInput)         
        );          

        await interaction.showModal(modal);         
        return;       
      }     
    }

    if (interaction.commandName === "giveaway") {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "start") {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: "❌ Hanya Admin sahaja yang boleh memulakan giveaway!", ephemeral: true });
        }

        const prize = interaction.options.getString("prize");
        const durationMins = interaction.options.getInteger("duration");
        const winnersCount = interaction.options.getInteger("winners");
        const imageUrl = interaction.options.getString("image");

        const endTime = Date.now() + durationMins * 60 * 1000;
        const endTimeSeconds = Math.floor(endTime / 1000);

        const giveawayEmbed = new EmbedBuilder()
          .setColor("#ffb6c1")
          .setTitle("˚.🎀༘⋆ GIVEAWAY ˚.🎀༘⋆")
          .setDescription(`🎁 **Hadiah:** ${prize}\n👑 **Bilangan Pemenang:** ${winnersCount}\n⏳ **Berakhir Pada:** <t:${endTimeSeconds}:R> (<t:${endTimeSeconds}:f>)\n\n✨ Klik butang **"🎉 Sertai Giveaway"** di bawah untuk menyertai!\n👥 **Penyertaan:** 0`)
          .setTimestamp();

        if (imageUrl) {
          giveawayEmbed.setImage(imageUrl);
        } else {
          giveawayEmbed.setThumbnail(LOGO_URL);
        }

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

        setTimeout(async () => {
          const gw = giveawaysMap.get(giveawayMessage.id);
          if (!gw || gw.ended) return;
          gw.ended = true;

          let winnersText = "";
          if (gw.participants.length === 0) {
            winnersText = "• *Tiada sesiapa menyertai giveaway ini.*";
          } else {
            const shuffled = [...gw.participants].sort(() => 0.5 - Math.random());
            const winners = shuffled.slice(0, gw.winnersCount);
            winnersText = winners.map(id => `<@${id}>`).join(", ");
          }

          const endedEmbed = new EmbedBuilder()
            .setColor("#ffb6c1")
            .setTitle("🎉 GIVEAWAY TELAH TAMAT! 🏆")
            .setDescription(`🎁 **Hadiah:** ${gw.prize}\n👥 **Penyertaan:** ${gw.participants.length}\n\n🏆 **Pemenang Rasmi:**\n${winnersText}`)
            .setTimestamp();

          if (imageUrl) {
            endedEmbed.setImage(imageUrl);
          } else {
            endedEmbed.setThumbnail(LOGO_URL);
          }

          const disabledRow = new ActionRowBuilder().addComponents(
            ButtonBuilder.from(joinBtn).setDisabled(true).setStyle(ButtonStyle.Secondary)
          );

          await giveawayMessage.edit({ embeds: [endedEmbed], components: [disabledRow] }).catch(() => {});
          await giveawayMessage.reply({ content: `🎉 Tahniah kepada pemenang giveaway: ${winnersText}!` }).catch(() => {});
          giveawaysMap.delete(giveawayMessage.id);
        }, durationMins * 60 * 1000);

        return;
      }
    }
  }    

  if (interaction.isModalSubmit()) {     
    if (interaction.customId.startsWith("eb_modal_basic_")) {
      await interaction.deferUpdate();
      const newTitle = interaction.fields.getTextInputValue("eb_title");
      const newDesc = interaction.fields.getTextInputValue("eb_desc");
      const newColor = interaction.fields.getTextInputValue("eb_color") || "#ffb6c1";

      const oldEmbed = interaction.message.embeds[0];
      const updatedEmbed = EmbedBuilder.from(oldEmbed)
        .setTitle(newTitle)
        .setDescription(newDesc)
        .setColor(newColor);

      await interaction.editReply({ embeds: [updatedEmbed] });
      return;
    }

    if (interaction.customId.startsWith("eb_modal_author_")) {
      await interaction.deferUpdate();
      const authorName = interaction.fields.getTextInputValue("eb_author_name");
      const authorIcon = interaction.fields.getTextInputValue("eb_author_icon") || null;

      const oldEmbed = interaction.message.embeds[0];
      const updatedEmbed = EmbedBuilder.from(oldEmbed)
        .setAuthor({ name: authorName, iconURL: authorIcon });

      await interaction.editReply({ embeds: [updatedEmbed] });
      return;
    }

    if (interaction.customId.startsWith("eb_modal_footer_")) {
      await interaction.deferUpdate();
      const footerText = interaction.fields.getTextInputValue("eb_footer_text");
      const footerIcon = interaction.fields.getTextInputValue("eb_footer_icon") || null;

      const oldEmbed = interaction.message.embeds[0];
      const updatedEmbed = EmbedBuilder.from(oldEmbed)
        .setFooter({ text: footerText, iconURL: footerIcon });

      await interaction.editReply({ embeds: [updatedEmbed] });
      return;
    }

    if (interaction.customId.startsWith("eb_modal_images_")) {
      await interaction.deferUpdate();
      const imageUrl = interaction.fields.getTextInputValue("eb_image") || null;
      const thumbUrl = interaction.fields.getTextInputValue("eb_thumbnail") || null;

      const oldEmbed = interaction.message.embeds[0];
      const updatedEmbed = EmbedBuilder.from(oldEmbed)
        .setImage(imageUrl)
        .setThumbnail(thumbUrl);

      await interaction.editReply({ embeds: [updatedEmbed] });
      return;
    }

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
      const bdayInput = interaction.fields.getTextInputValue("bday_date");
      const timestampSec = parseBirthdayToTimestamp(bdayInput);

      if (!timestampSec) {
        return interaction.editReply({ content: "❌ Format tarikh tidak sah! Sila guna contoh seperti: `1 Oktober` atau `7 Oct`." });
      }
      
      birthdaysMap.set(interaction.user.id, { dateStr: bdayInput, timestamp: timestampSec });

      let sortedBdays = [...birthdaysMap.entries()].sort((a,b) => a[1].timestamp - b[1].timestamp);
      let bdayListText = "";
      sortedBdays.forEach(([userId, data]) => {
        bdayListText += `• <t:${data.timestamp}:D> : <@${userId}>\n`;
      });

      const updatedEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("🎂Birthday Corner 🎂")
        .setDescription(`💌 Ingin tarikh lahir anda disenaraikan di sini supaya kami boleh meraikannya bersama? Klik butang di bawah untuk menetapkan tarikh lahir anda! ♡\n\n✨ **Upcoming Birthdays**\n${bdayListText || "• *Tiada tarikh direkodkan lagi.*"}`);

      try {
        await interaction.message?.edit({ embeds: [updatedEmbed] }).catch(() => {});
      } catch (e) {}

      await interaction.editReply({ content: `✨ Tarikh lahir anda berjaya disimpan dalam Birthday Corner! ♡` });
      return;
    }

    if (interaction.customId === "event_create_modal") {
      await interaction.deferReply({ ephemeral: true });
      const title = interaction.fields.getTextInputValue("event_title");
      const dateStr = interaction.fields.getTextInputValue("event_date");
      const timeStr = interaction.fields.getTextInputValue("event_time");
      const prize = interaction.fields.getTextInputValue("event_prize");
      const desc = interaction.fields.getTextInputValue("event_desc");

      const parsedTargetDate = new Date(`${dateStr} ${timeStr}`);
      const endTimeMs = isNaN(parsedTargetDate.getTime()) ? Date.now() + 86400000 : parsedTargetDate.getTime();

      const eventEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle(`🎮 ${title}`)
        .setDescription(`${desc}\n\n📅 **Tarikh:** ${dateStr}\n⏰ **Masa Tamat:** ${timeStr}\n🎁 **Prize Pool:** ${prize}\n👥 **Pemain:** 0`)
        .setTimestamp();

      const joinBtn = new ButtonBuilder()
        .setCustomId("join_event_v2")
        .setLabel("🎟 Join Event")
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder().addComponents(joinBtn);

      const eventMessage = await interaction.channel.send({ embeds: [eventEmbed], components: [row] });
      
      eventsMap.set(eventMessage.id, {
        title,
        dateStr,
        timeStr,
        endTimeMs,
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
        .setColor("#ffb6c1")
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
    if (interaction.customId.startsWith("eb_edit_basic_")) {
      const channelId = interaction.customId.replace("eb_edit_basic_", "");
      const currentEmbed = interaction.message.embeds[0];

      const modal = new ModalBuilder()
        .setCustomId(`eb_modal_basic_${channelId}`)
        .setTitle("Edit Basic Information");

      const titleInput = new TextInputBuilder()
        .setCustomId("eb_title")
        .setLabel("Embed Title")
        .setStyle(TextInputStyle.Short)
        .setValue(currentEmbed.title || "")
        .setRequired(true);

      const descInput = new TextInputBuilder()
        .setCustomId("eb_desc")
        .setLabel("Embed Description")
        .setStyle(TextInputStyle.Paragraph)
        .setValue(currentEmbed.description || "")
        .setRequired(true);

      const colorInput = new TextInputBuilder()
        .setCustomId("eb_color")
        .setLabel("Embed Color (Cth: #ffb6c1)")
        .setStyle(TextInputStyle.Short)
        .setValue("#ffb6c1")
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(colorInput)
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId.startsWith("eb_edit_author_")) {
      const channelId = interaction.customId.replace("eb_edit_author_", "");
      const currentEmbed = interaction.message.embeds[0];

      const modal = new ModalBuilder()
        .setCustomId(`eb_modal_author_${channelId}`)
        .setTitle("Edit Author");

      const authorNameInput = new TextInputBuilder()
        .setCustomId("eb_author_name")
        .setLabel("Author Name")
        .setStyle(TextInputStyle.Short)
        .setValue(currentEmbed.author?.name || "")
        .setRequired(false);

      const authorIconInput = new TextInputBuilder()
        .setCustomId("eb_author_icon")
        .setLabel("Author Icon URL")
        .setStyle(TextInputStyle.Short)
        .setValue(currentEmbed.author?.iconURL || "")
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(authorNameInput),
        new ActionRowBuilder().addComponents(authorIconInput)
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId.startsWith("eb_edit_footer_")) {
      const channelId = interaction.customId.replace("eb_edit_footer_", "");
      const currentEmbed = interaction.message.embeds[0];

      const modal = new ModalBuilder()
        .setCustomId(`eb_modal_footer_${channelId}`)
        .setTitle("Edit Footer");

      const footerTextInput = new TextInputBuilder()
        .setCustomId("eb_footer_text")
        .setLabel("Footer Text")
        .setStyle(TextInputStyle.Short)
        .setValue(currentEmbed.footer?.text || "")
        .setRequired(false);

      const footerIconInput = new TextInputBuilder()
        .setCustomId("eb_footer_icon")
        .setLabel("Footer Icon URL")
        .setStyle(TextInputStyle.Short)
        .setValue(currentEmbed.footer?.iconURL || "")
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(footerTextInput),
        new ActionRowBuilder().addComponents(footerIconInput)
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId.startsWith("eb_edit_images_")) {
      const channelId = interaction.customId.replace("eb_edit_images_", "");
      const currentEmbed = interaction.message.embeds[0];

      const modal = new ModalBuilder()
        .setCustomId(`eb_modal_images_${channelId}`)
        .setTitle("Edit Images");

      const imageInput = new TextInputBuilder()
        .setCustomId("eb_image")
        .setLabel("Main Image URL")
        .setStyle(TextInputStyle.Short)
        .setValue(currentEmbed.image?.url || "")
        .setRequired(false);

      const thumbInput = new TextInputBuilder()
        .setCustomId("eb_thumbnail")
        .setLabel("Thumbnail URL")
        .setStyle(TextInputStyle.Short)
        .setValue(currentEmbed.thumbnail?.url || "")
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(imageInput),
        new ActionRowBuilder().addComponents(thumbInput)
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId.startsWith("eb_send_")) {
      const channelId = interaction.customId.replace("eb_send_", "");
      const targetChannel = interaction.guild.channels.cache.get(channelId);

      if (!targetChannel) {
        return interaction.reply({ content: "❌ Channel tidak dijumpai!", ephemeral: true });
      }

      const embedToSend = interaction.message.embeds[0];
      await targetChannel.send({ embeds: [embedToSend] });
      await interaction.update({ content: "✅ Embed berjaya dihantar ke channel pilihan!", embeds: [], components: [] });
      return;
    }

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
        .setLabel("Tarikh Lahir (Cth: 1 Oktober atau 7 Oct)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("1 Oktober")
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

    if (["report_claim", "report_resolve", "report_reject", "report_close"].includes(interaction.customId)) {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ Hanya staf sahaja yang boleh menguruskan laporan ini!", ephemeral: true });
      }

      const oldEmb = interaction.message.embeds[0];
      const oldDesc = oldEmb.description;
      let newStatus = "🟡 Open";

      if (interaction.customId === "report_claim") {
        newStatus = `🔵 Under Review (Claimed by ${interaction.user.tag})`;
      } else if (interaction.customId === "report_resolve") {
        newStatus = `🟢 Resolved (Handled by ${interaction.user.tag})`;
      } else if (interaction.customId === "report_reject") {
        newStatus = `🔴 Rejected (Handled by ${interaction.user.tag})`;
      } else if (interaction.customId === "report_close") {
        newStatus = `🔒 Closed & Archived (Handled by ${interaction.user.tag})`;
      }

      const updatedDesc = oldDesc.replace(/• \*\*Status:\*\* .*/, `• **Status:** ${newStatus}`);
      const newEmb = EmbedBuilder.from(oldEmb).setColor("#ffb6c1").setDescription(updatedDesc);

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
      
      if (!ev || ev.ended) {
        return interaction.editReply({ content: "❌ Event ini tidak wujud atau telah tamat." });
      }

      if (Date.now() > ev.endTimeMs) {
        ev.ended = true;
        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("join_event_v2").setLabel("🎟 Event Telah Tamat").setStyle(ButtonStyle.Secondary).setDisabled(true)
        );
        await interaction.message.end?.({ components: [disabledRow] }).catch(() => {});
        await interaction.message.edit({ components: [disabledRow] }).catch(() => {});
        return interaction.editReply({ content: "❌ Maaf, masa untuk menyertai event ini sudah tamat!" });
      }

      if (ev.participants.includes(interaction.user.id)) {
        return interaction.editReply({ content: "⚠️ Awak sudah menyertai event ini!" });
      }

      ev.participants.push(interaction.user.id);

      const oldEmb = interaction.message.embeds[0];
      const newEmb = EmbedBuilder.from(oldEmb)
        .setDescription(oldEmb.description.replace(/👥 \*\*Pemain:\*\* \d+/, `👥 **Pemain:** ${ev.participants.length}`));

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

      const oldEmbed = interaction.message.embeds[0];
      const newEmbed = EmbedBuilder.from(oldEmbed)
        .setDescription(oldEmbed.description.replace(/👥 \*\*Penyertaan:\*\* \d+/, `👥 **Penyertaan:** ${gw.participants.length}`));

      await interaction.message.edit({ embeds: [newEmbed] }).catch(() => {});
      await interaction.editReply({ content: `✅ Berjaya menyertai giveaway! Semoga ada rezeki awak! 🎉` });
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
      await interaction.edit({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor("#ffb6c1").setTitle("✅ Diluluskan")], components: [] });
      return;
    }

    if (interaction.customId.startsWith("verify_reject_")) {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return;
      await interaction.deferUpdate();
      await interaction.edit({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor("#ffb6c1").setTitle("❌ Ditolak")], components: [] }).catch(() => {});
      return;
    }
  }
});

client.login(token);
