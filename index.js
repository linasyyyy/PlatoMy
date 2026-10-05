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

const WELCOME_CHANNEL_NAME = "🤗・selamat-datang";
const SERVER_LOGS_CHANNEL_NAME = "server-logs";
const WALLET_LOG_CHANNEL_NAME = "wallet-log";
const VERIFY_CHANNEL_NAME = "verification-log";

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
    .setDescription("Hantar panel butang verifikasi IGN (Admin sahaja)"),
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

async function sendLog(guild, channelName, logEmbed) {
  const logChannel = guild.channels.cache.find(
    (c) => c.name.includes(channelName) && c.isTextBased()
  );
  if (logChannel && "send" in logChannel) {
    await logChannel.send({ embeds: [logEmbed] });
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
        await interaction.reply({ content: "❌ Hanya Admin sahaja boleh setup panel ini!", ephemeral: true });
        return;
      }

      const verifyEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("🌸 PlatoMy IGN Verification")
        .setDescription("Sila klik butang di bawah untuk mengisi Plato ID dan maklumat jemputan anda bagi mendapatkan akses ke channel eksklusif! ♡");

      const verifyButton = new ButtonBuilder()
        .setCustomId("open_verify_modal")
        .setLabel("📝 Verify IGN")
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(verifyButton);

      await interaction.reply({ content: "✅ Panel verifikasi berjaya dihantar!", ephemeral: true });
      await interaction.channel.send({ embeds: [verifyEmbed], components: [row] });
      return;
    }

    if (interaction.commandName === "giveaway") {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "❌ Hanya Admin sahaja boleh mencipta giveaway!", ephemeral: true });
        return;
      }

      const prize = interaction.options.getString("prize");
      const winnersCount = interaction.options.getInteger("winners");
      const durationMins = interaction.options.getInteger("duration");

      const endsAt = Date.now() + durationMins * 60 * 1000;

      const giveawayEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("🎉 GIVEAWAY 🎉")
        .setDescription(`🎁 **Prize:** ${prize}\n👥 **Winners:** ${winnersCount}\n⏳ **Ends At:** <t:${Math.floor(endsAt / 1000)}:R>\n\nTekan butang di bawah untuk menyertai! ✨`)
        .setTimestamp(endsAt);

      const joinBtn = new ButtonBuilder()
        .setCustomId("join_giveaway")
        .setLabel("🎉 Join Giveaway")
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder().addComponents(joinBtn);

      await interaction.reply({ content: "✨ Giveaway berjaya dimulakan!", ephemeral: true });
      const giveawayMessage = await interaction.channel.send({ embeds: [giveawayEmbed], components: [row] });

      giveawaysMap.set(giveawayMessage.id, {
        prize,
        winnersCount,
        participants: [],
        ended: false,
      });

      setTimeout(async () => {
        const giveawayData = giveawaysMap.get(giveawayMessage.id);
        if (!giveawayData || giveawayData.ended) return;

        giveawayData.ended = true;

        if (giveawayData.participants.length === 0) {
          const endedEmbed = EmbedBuilder.from(giveawayMessage.embeds[0])
            .setTitle("🎉 GIVEAWAY TAMAT 🎉")
            .setDescription(`🎁 **Prize:** ${prize}\n\n❌ Tiada sesiapa yang menyertai giveaway ini.`);
          await giveawayMessage.edit({ embeds: [endedEmbed], components: [] }).catch(() => {});
          return;
        }

        const shuffled = [...giveawayData.participants].sort(() => 0.5 - Math.random());
        const winners = shuffled.slice(0, giveawayData.winnersCount);
        const winnerMentions = winners.map((id) => `<@${id}>`).join(", ");

        const resultEmbed = new EmbedBuilder()
          .setColor("#ffb6c1")
          .setTitle("🏆 GIVEAWAY WINNERS 🏆")
          .setDescription(`🎁 **Prize:** ${prize}\n\n🎉 **Winner(s):** ${winnerMentions}\n\nTahniah kepada pemenang! ♡`)
          .setTimestamp();

        await giveawayMessage.edit({ embeds: [resultEmbed], components: [] }).catch(() => {});
        await interaction.channel.send({ content: `🎊 Tahniah ${winnerMentions}! Anda memenangi **${prize}**!` });

      }, durationMins * 60 * 1000);

      return;
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === "ign_verify_modal") {
      const platoId = interaction.fields.getTextInputValue("plato_id");
      const invitedBy = interaction.fields.getTextInputValue("invited_by") || "Tiada / Sendiri";

      const reviewEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("🔍 New IGN Verification Request")
        .setDescription(`• **Member:** ${interaction.user} (${interaction.user.tag})\n• **Plato ID:** \`${platoId}\`\n• **Invited by:** ${invitedBy}`)
        .setTimestamp();

      const approveBtn = new ButtonBuilder()
        .setCustomId(`verify_approve_${interaction.user.id}`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success);

      const rejectBtn = new ButtonBuilder()
        .setCustomId(`verify_reject_${interaction.user.id}`)
        .setLabel("Reject")
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(approveBtn, rejectBtn);

      await sendLog(interaction.guild, VERIFY_CHANNEL_NAME, { embeds: [reviewEmbed], components: [row] });
      await interaction.reply({ content: "✨ Permohonan verifikasi anda telah dihantar kepada admin untuk disemak!", ephemeral: true });
      return;
    }

    if (interaction.customId.startsWith("wallet_modal_")) {
      const parts = interaction.customId.split("_");
      const action = `${parts[2]}_${parts[3]}`;
      const targetUserId = parts[4];

      const amountStr = interaction.fields.getTextInputValue("amount_input");
      const reason = interaction.fields.getTextInputValue("reason_input") || "Tiada sebab diberikan";
      const amount = parseInt(amountStr, 10);

      if (isNaN(amount) || amount <= 0) {
        await interaction.reply({ content: "❌ Sila masukkan nombor yang sah melebihi 0!", ephemeral: true });
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

      await interaction.reply({ content: `✅ Berjaya kemaskini baki untuk **${targetUser.tag}**!`, ephemeral: true });

      const logEmbed = new EmbedBuilder()
        .setColor("#ffb6c1")
        .setTitle("📜 Wallet Log")
        .setDescription(`• **Member:** ${targetUser}\n• **Currency:** ${currencyType}\n• **Amount:** ${formattedChange}\n• **Reason:** ${reason}\n• **Changed by:** ${interaction.user}\n• **Date:** <t:${Math.floor(Date.now() / 1000)}:F>`)
        .setTimestamp();

      await sendLog(interaction.guild, WALLET_LOG_CHANNEL_NAME, logEmbed);
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === "open_verify_modal") {
      const modal = new ModalBuilder()
        .setCustomId("ign_verify_modal")
        .setTitle("IGN Verification Form");

      const platoIdInput = new TextInputBuilder()
        .setCustomId("plato_id")
        .setLabel("Plato ID")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Masukkan Plato ID anda di sini...")
        .setRequired(true);

      const invitedInput = new TextInputBuilder()
        .setCustomId("invited_by")
        .setLabel("Invited by (Optional)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Nama/Tag rakan yang menjemput...")
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(platoIdInput),
        new ActionRowBuilder().addComponents(invitedInput)
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId === "join_giveaway") {
      const giveawayData = giveawaysMap.get(interaction.message.id);

      if (!giveawayData || giveawayData.ended) {
        await interaction.reply({ content: "❌ Giveaway ini telah tamat atau tidak wujud.", ephemeral: true });
        return;
      }

      if (giveawayData.participants.includes(interaction.user.id)) {
        await interaction.reply({ content: "⚠️ Awak sudah menyertai giveaway ini!", ephemeral: true });
        return;
      }

      giveawayData.participants.push(interaction.user.id);
      await interaction.reply({ content: "✅ Berjaya menyertai giveaway! Semoga ada rezeki! 🍀", ephemeral: true });
      return;
    }

    if (interaction.customId.startsWith("verify_approve_")) {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "❌ Hanya Admin sahaja boleh meluluskan permohonan ini!", ephemeral: true });
        return;
      }

      const targetUserId = interaction.customId.replace("verify_approve_", "");
      const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);

      if (targetMember) {
        const role = interaction.guild.roles.cache.find(r => r.name === VERIFIED_ROLE_NAME);
        if (role) {
          await targetMember.roles.add(role).catch(console.error);
        }
        await targetMember.send("🎉 Tahniah! Permohonan Plato IGN anda telah diluluskan oleh admin. Anda kini mempunyai akses ke channel eksklusif! 🌸").catch(() => {});
      }

      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor("#57F287")
        .setTitle("✅ Verification Approved")
        .addFields({ name: "Reviewed by", value: `${interaction.user}` });

      await interaction.update({ embeds: [updatedEmbed], components: [] });
      return;
    }

    if (interaction.customId.startsWith("verify_reject_")) {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "❌ Hanya Admin sahaja boleh menolak permohonan ini!", ephemeral: true });
        return;
      }

      const targetUserId = interaction.customId.replace("verify_reject_", "");
      const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);

      if (targetMember) {
        await targetMember.send("❌ Maaf, permohonan Plato IGN anda telah ditolak. Sila hubungi admin jika terdapat sebarang pertanyaan.").catch(() => {});
      }

      const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor("#ED4245")
        .setTitle("✅ Verification Rejected")
        .addFields({ name: "Reviewed by", value: `${interaction.user}` });

      await interaction.update({ embeds: [updatedEmbed], components: [] });
      return;
    }
  }
});

client.login(token).catch((error) => {
  console.error("Gagal log masuk ke Discord:", error);
  process.exitCode = 1;
});
