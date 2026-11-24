import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
} from "discord.js";
import cron from "node-cron";

import { loadWallets, startAutosave } from "./db.js";
import { commands } from "./commands.js";
import {
  NL,
  WALLET_LOG_CHANNEL_NAME,
  TRADING_LIST_CHANNEL_NAME,
  TRADING_LOG_CHANNEL_NAME,
  TRADE_ROLE_NAME,
  TRADER_ROLE_NAME,
  TRADE_CATEGORY_ID,
  LEVEL_UP_CHANNEL_ID,
  LOW_EXP_CHANNEL_IDS,
  COINS_PER_PIP,
  V2,
  V2_EPHEMERAL,
  NO_PING,
  isAdmin,
  isUrl,
  sleep,
  findChannel,
  accent,
  getMalaysiaTime,
  sep,
  txt,
  info,
  collectText,
} from "./utils.js";
import { walletBox, walletLogBox } from "./wallet.js";
import {
  PETALS_PER_COIN,
  PETALS_PER_PIP,
  SHOP_COINS_EMOJI,
  SHOP_PIPS_EMOJI,
  buildShopPanel,
  buildShopModal,
  buildShopReceiptBox,
  buildCalcModal,
  buildCalcResultBox,
} from "./shop.js";
import {
  MAX_LEVEL,
  NORMAL_EXP_COOLDOWN_MS,
  LOW_EXP_COOLDOWN_MS,
  expCooldowns,
  getLevelInfo,
  syncLevelRoles,
  buildLevelUpBox,
  handleYapperActivity,
  cleanupInactiveYappers,
} from "./leveling.js";
import { acceptedTrades, buildTradePanel, buildTradeList, createTradeChannel } from "./trading.js";
import {
  getBirthdayData,
  saveBirthdayConfig,
  saveUserBirthday,
  formatDayMonth,
  buildBirthdayCornerBox,
  refreshBirthdayBoard,
  runDailyBirthdayRoutine,
} from "./birthday.js";
import { createLeaderboardSystem } from "./leaderboard.js";
import { createRumbleSystem } from "./rumble.js";
import { createGiveawaySystem } from "./giveaway.js";
import { generateWheelGif } from "./wheelspin.js";

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
  ],
});

const wallets = new Map();
function getWallet(id) {
  if (!wallets.has(id)) {
    wallets.set(id, { coins: 0, pips: 0, petals: 0, exp: 0, expTotal: 0, sponsorTotal: 0, sponsorMonthly: 0 });
  }
  const w = wallets.get(id);
  if (typeof w.petals !== "number") w.petals = 0;
  return w;
}

await loadWallets(wallets);
startAutosave(wallets);

const {
  LEADERBOARD_CATEGORIES,
  getLeaderboardConfigs,
  saveLeaderboardConfig,
  generateLeaderboardImage,
  buildLeaderboardBox,
  generateRankCard,
} = createLeaderboardSystem({ client, wallets, getWallet, getLevelInfo, MAX_LEVEL });

const { rumbleMap, rumbleOpenBox, createRumble } = createRumbleSystem({ getWallet });
const { giveawayGames, saveGiveaways, giveawayBox, createGiveaway, rerollGiveaway, resumeGiveaways } =
  createGiveawaySystem({ client });

// ================= WHEEL SPIN LOBBY =================
const spinGames = new Map();

function buildSpinLobbyBox(game) {
  const lines = [
    `🎁 **Event:** ${game.title}`,
    `🏆 **Winners:** ${game.winnersCount}`,
    `👤 **Host:** <@${game.hostId}>`,
    "",
    `👥 **Peserta (${game.participants.length}):**`,
    game.participants.length
      ? game.participants
          .slice(0, 20)
          .map((id) => `<@${id}>`)
          .join(", ") + (game.participants.length > 20 ? ` dan ${game.participants.length - 20} lagi...` : "")
      : "*Belum ada peserta. Tekan butang di bawah untuk sertai!*",
  ];

  const joinBtn = new ButtonBuilder()
    .setCustomId("join_spin")
    .setLabel(game.ended ? "Spin Tamat" : "Join Spin")
    .setEmoji("🎡")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(game.ended);

  const startBtn = new ButtonBuilder()
    .setCustomId("start_spin")
    .setLabel("Spin Now")
    .setEmoji("▶️")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(game.ended);

  return new ContainerBuilder()
    .addTextDisplayComponents(txt("### ˚ · . ꒰ა 🎡 PlatoMy Wheel Spin 🎡 ໒꒱ . · ˚"))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(lines.join(NL)))
    .addActionRowComponents(new ActionRowBuilder().addComponents(joinBtn, startBtn));
}

// ================= CLIENT READY & CRON =================
client.once(Events.ClientReady, async (c) => {
  console.log(`Bot telah berjaya log masuk sebagai ${c.user.tag}!`);
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    await rest.put(Routes.applicationCommands(c.user.id), { body: commands });
    console.log("Slash commands berjaya di-register!");
  } catch (error) {
    console.error("Gagal mendaftarkan slash commands:", error);
  }

  resumeGiveaways();

  cron.schedule(
    "*/10 * * * *",
    async () => {
      const configs = await getLeaderboardConfigs();
      for (const [category, cfg] of Object.entries(configs)) {
        if (!cfg?.channelId || !cfg?.messageId) continue;
        try {
          const channel = await client.channels.fetch(cfg.channelId).catch(() => null);
          const message = await channel?.messages.fetch(cfg.messageId).catch(() => null);
          if (!message) continue;
          const attachment = await generateLeaderboardImage(category);
          await message.edit({
            components: [buildLeaderboardBox(category)],
            files: [attachment],
            attachments: [],
            flags: V2,
          });
          console.log(`✅ Auto-update leaderboard [${category}] berjaya!`);
        } catch (err) {
          console.error(`Ralat auto-update leaderboard [${category}]:`, err);
        }
      }
    },
    { timezone: "Asia/Kuala_Lumpur" }
  );

  cron.schedule("0 * * * *", () => cleanupInactiveYappers(client));

  cron.schedule(
    "0 0 * * *",
    async () => {
      try {
        console.log("Menjalankan semakan harian Birthday Corner...");
        await runDailyBirthdayRoutine(client);
      } catch (err) {
        console.error("Ralat semakan harian Birthday Corner:", err);
      }
    },
    { timezone: "Asia/Kuala_Lumpur" }
  );

  cron.schedule(
    "0 0 1 * *",
    async () => {
      try {
        console.log("Memulakan proses auto-reset bulanan...");
        for (const [, data] of wallets.entries()) {
          data.exp = 0;
          data.sponsorMonthly = 0;
        }
        const configs = await getLeaderboardConfigs();
        for (const category of ["exp", "sponsor"]) {
          const cfg = configs[category];
          if (!cfg?.channelId || !cfg?.messageId) continue;
          const channel = await client.channels.fetch(cfg.channelId).catch(() => null);
          if (!channel) continue;
          await channel
            .send(`🎉 **${LEADERBOARD_CATEGORIES[category].label} telah tamat! Papan telah diset semula untuk bulan baharu. Semoga berjaya!** 🌸`)
            .catch(() => {});
          const message = await channel.messages.fetch(cfg.messageId).catch(() => null);
          if (message) {
            const attachment = await generateLeaderboardImage(category);
            await message
              .edit({
                components: [buildLeaderboardBox(category, "Bulan Baharu • Papan telah diset semula")],
                files: [attachment],
                attachments: [],
                flags: V2,
              })
              .catch(() => {});
          }
        }
        console.log("✅ Reset bulanan selesai!");
      } catch (err) {
        console.error("Ralat semasa auto-reset bulanan:", err);
      }
    },
    { timezone: "Asia/Kuala_Lumpur" }
  );
});

// ================= MESSAGE CREATE =================
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;

  const raw = message.content.trim();
  const content = raw.toLowerCase();

  if (content === "!wallet" || content === "!bank") {
    await message.reply({ components: [walletBox(getWallet(message.author.id))], flags: V2 });
    return;
  }

  // !petals add <jumlah> @p1 @p2  ATAU  !petals deduct <jumlah> @p1 @p2
  if (content === "!petals" || content.startsWith("!petals ")) {
    if (!message.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      await message.reply("❌ Hanya Administrator boleh guna command `!petals`!");
      return;
    }

    const args = raw.split(/\s+/).slice(1);
    const mode = args[0]?.toLowerCase();
    if (!["add", "deduct"].includes(mode)) {
      await message.reply(
        [
          "❌ Format salah! Guna:",
          "`!petals add <jumlah> @player1 @player2`",
          "`!petals deduct <jumlah> @player1 @player2`",
        ].join(NL)
      );
      return;
    }

    const amountArg = args.slice(1).find((a) => /^\d+$/.test(a));
    const amount = amountArg ? parseInt(amountArg, 10) : NaN;
    const targets = [...message.mentions.users.values()];

    if (isNaN(amount) || amount <= 0 || targets.length === 0) {
      await message.reply(
        [
          "❌ Sila masukkan jumlah nombor (> 0) dan tag sekurang-kurangnya seorang pemain!",
          "Contoh: `!petals add 50 @player1 @player2`",
        ].join(NL)
      );
      return;
    }

    const isAdd = mode === "add";
    const actionTitle = isAdd ? "❀ Petals Added (Bulk)" : "❀ Petals Deducted (Bulk)";
    const logChannel = findChannel(message.guild, WALLET_LOG_CHANNEL_NAME);

    for (const user of targets) {
      const w = getWallet(user.id);
      w.petals = isAdd ? (w.petals || 0) + amount : Math.max(0, (w.petals || 0) - amount);

      if (logChannel) {
        const desc = `Berjaya ${isAdd ? "menambah" : "menolak"} **${amount.toLocaleString()} ❀ Petals** ${isAdd ? "kepada" : "daripada"} ${user}.`;
        await logChannel
          .send({
            components: [
              walletLogBox({ actionTitle, target: user, admin: message.author, details: desc, reason: "Command !petals", w }),
            ],
            flags: V2,
            allowedMentions: NO_PING,
          })
          .catch(() => {});
      }
    }

    const mentionList = targets.map((u) => `<@${u.id}>`).join(", ");
    await message.reply({
      content: `✅ Berjaya ${isAdd ? "menambah" : "menolak"} **${amount.toLocaleString()} ❀ Petals** ${isAdd ? "kepada" : "daripada"} **${targets.length} pemain**: ${mentionList}`,
      allowedMentions: NO_PING,
    });
    return;
  }

  const isLowExpChannel = LOW_EXP_CHANNEL_IDS.has(message.channel.id);
  if (message.member && !isLowExpChannel) {
    handleYapperActivity(message.member).catch(() => {});
  }

  const now = Date.now();
  const cooldownMs = isLowExpChannel ? LOW_EXP_COOLDOWN_MS : NORMAL_EXP_COOLDOWN_MS;
  const lastExp = expCooldowns.get(message.author.id) || 0;

  if (now - lastExp >= cooldownMs) {
    expCooldowns.set(message.author.id, now);
    const w = getWallet(message.author.id);
    const oldLvl = getLevelInfo(w.exp).level;
    const gain = isLowExpChannel ? Math.floor(Math.random() * 4) + 3 : Math.floor(Math.random() * 11) + 15;

    w.exp += gain;
    w.expTotal = (w.expTotal || 0) + gain;
    const newLvl = getLevelInfo(w.exp).level;

    if (newLvl > oldLvl && message.member) {
      if (newLvl >= 10) syncLevelRoles(message.member, newLvl).catch(() => {});
      const lvlChannel = await client.channels.fetch(LEVEL_UP_CHANNEL_ID).catch(() => null);
      if (lvlChannel?.isTextBased()) {
        await lvlChannel
          .send({
            components: [buildLevelUpBox(message.member, newLvl, w.exp)],
            flags: V2,
            allowedMentions: { users: [message.author.id] },
          })
          .catch(() => {});
      }
    }
  }
});

// ================= INTERACTIONS =================
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // ===== SLASH COMMANDS =====
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;

      if (name === "wallet") {
        const target = interaction.options.getUser("player");
        const checkingOther = target && target.id !== interaction.user.id;
        if (checkingOther && !isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Hanya Administrator boleh semak wallet pemain lain!", ephemeral: true });
        }
        const who = checkingOther ? target : interaction.user;
        return interaction.reply({
          components: [walletBox(getWallet(who.id), checkingOther ? who : null, isAdmin(interaction) ? who.id : null)],
          flags: V2_EPHEMERAL,
          allowedMentions: NO_PING,
        });
      }

      if (name === "myrank") {
        await interaction.deferReply();
        const target = interaction.options.getUser("user") || interaction.user;
        const card = await generateRankCard(target);
        return interaction.editReply({ files: [card] });
      }

      if (name === "petals") {
        if (!isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        }
        const action = interaction.options.getString("action");
        const amount = interaction.options.getInteger("amount");
        const playersRaw = interaction.options.getString("players");
        const reason = interaction.options.getString("reason") || "Tiada sebab dinyatakan";

        const userIds = [...new Set([...playersRaw.matchAll(/<@!?(\d+)>/g)].map((m) => m[1]))];
        if (userIds.length === 0) {
          return interaction.reply({ content: "❌ Tiada pemain yang di-tag! Sila tag sekurang-kurangnya seorang pemain (cth: `@ali @abu`).", ephemeral: true });
        }

        const isAdd = action === "add";
        const actionTitle = isAdd ? "❀ Petals Added (Bulk)" : "❀ Petals Deducted (Bulk)";
        const logChannel = findChannel(interaction.guild, WALLET_LOG_CHANNEL_NAME);

        for (const uid of userIds) {
          const w = getWallet(uid);
          w.petals = isAdd ? (w.petals || 0) + amount : Math.max(0, (w.petals || 0) - amount);

          if (logChannel) {
            const targetUser = (await client.users.fetch(uid).catch(() => null)) || { id: uid, toString: () => `<@${uid}>` };
            const desc = `Berjaya ${isAdd ? "menambah" : "menolak"} **${amount.toLocaleString()} ❀ Petals** ${isAdd ? "kepada" : "daripada"} ${targetUser}.`;
            await logChannel
              .send({
                components: [
                  walletLogBox({ actionTitle, target: targetUser, admin: interaction.user, details: desc, reason, w }),
                ],
                flags: V2,
                allowedMentions: NO_PING,
              })
              .catch(() => {});
          }
        }

        const mentionList = userIds.map((id) => `<@${id}>`).join(", ");
        return interaction.reply({
          content: `✅ Berjaya ${isAdd ? "menambah" : "menolak"} **${amount.toLocaleString()} ❀ Petals** ${isAdd ? "kepada" : "daripada"} **${userIds.length} pemain**: ${mentionList}`,
          ephemeral: true,
          allowedMentions: NO_PING,
        });
      }

      if (name === "setup-shop") {
        if (!isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        }
        const bannerUrl = interaction.options.getString("banner_url");
        if (bannerUrl && !isUrl(bannerUrl)) {
          return interaction.reply({ content: "❌ Link gambar tidak sah. Mesti bermula dengan https://", ephemeral: true });
        }
        await interaction.channel.send({ components: [buildShopPanel(bannerUrl)], flags: V2 });
        return interaction.reply({ content: "✅ Panel Petals Shop berjaya dihantar!", ephemeral: true });
      }

      if (name === "admin-wallet") {
        if (!isAdmin(interaction)) {
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
          actionDesc = `Berjaya menambah **${amount.toLocaleString()} Plato Coins** kepada ${targetUser}.`;
        } else if (action === "deduct_coins") {
          targetWallet.coins = Math.max(0, targetWallet.coins - amount);
          actionTitle = "🪙 Plato Coins Deducted";
          actionDesc = `Berjaya menolak **${amount.toLocaleString()} Plato Coins** daripada ${targetUser}.`;
        } else if (action === "add_pips") {
          targetWallet.pips += amount;
          actionTitle = "💠 Pips Added";
          actionDesc = `Berjaya menambah **${amount.toLocaleString()} Pips** kepada ${targetUser}.`;
        } else if (action === "deduct_pips") {
          targetWallet.pips = Math.max(0, targetWallet.pips - amount);
          actionTitle = "💠 Pips Deducted";
          actionDesc = `Berjaya menolak **${amount.toLocaleString()} Pips** daripada ${targetUser}.`;
        } else if (action === "add_petals") {
          targetWallet.petals = (targetWallet.petals || 0) + amount;
          actionTitle = "❀ Petals Added";
          actionDesc = `Berjaya menambah **${amount.toLocaleString()} ❀ Petals** kepada ${targetUser}.`;
        } else if (action === "deduct_petals") {
          targetWallet.petals = Math.max(0, (targetWallet.petals || 0) - amount);
          actionTitle = "❀ Petals Deducted";
          actionDesc = `Berjaya menolak **${amount.toLocaleString()} ❀ Petals** daripada ${targetUser}.`;
        } else if (action === "add_sponsor") {
          const sponsorCurrency = interaction.options.getString("sponsor_currency") || "coins";
          const coinValue = sponsorCurrency === "pips" ? amount * COINS_PER_PIP : amount;
          targetWallet.sponsorTotal += coinValue;
          targetWallet.sponsorMonthly = (targetWallet.sponsorMonthly || 0) + coinValue;
          actionTitle = "🌸 Total Sponsor Added";
          actionDesc =
            sponsorCurrency === "pips"
              ? `Berjaya menambah sponsor **${amount.toLocaleString()} Pips** (dikira **${coinValue.toLocaleString()} Plato Coins**) kepada ${targetUser}.`
              : `Berjaya menambah sponsor **${coinValue.toLocaleString()} Plato Coins** kepada ${targetUser}.`;
        } else if (action === "check") {
          actionTitle = "📊 Wallet Checked";
          actionDesc = `Menyemak baki wallet ${targetUser}.`;
        }

        await interaction.reply({ content: `✅ Tindakan berjaya dilaksana untuk ${targetUser}!`, ephemeral: true });

        const logChannel = findChannel(interaction.guild, WALLET_LOG_CHANNEL_NAME);
        if (logChannel) {
          await logChannel
            .send({
              components: [
                walletLogBox({ actionTitle, target: targetUser, admin: interaction.user, details: actionDesc, reason, w: targetWallet }),
              ],
              flags: V2,
              allowedMentions: NO_PING,
            })
            .catch(() => {});
        }
        return;
      }

      if (name === "setup-trading") {
        if (!isAdmin(interaction)) return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        const listChannel = findChannel(interaction.guild, TRADING_LIST_CHANNEL_NAME);
        const listRef = listChannel ? `<#${listChannel.id}>` : "#🛍️・trading-list";
        await interaction.channel.send({ components: [buildTradePanel(listRef)], flags: V2 });
        return interaction.reply({ content: "✅ Trading panel sent!", ephemeral: true });
      }

      if (name === "setup-birthday") {
        if (!isAdmin(interaction)) return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const chatChannel = interaction.options.getChannel("chat_channel") || interaction.channel;
        const bData = await getBirthdayData();
        bData.config = { channelId: interaction.channel.id, chatChannelId: chatChannel.id, messageId: null };
        const msg = await interaction.channel.send({ components: [buildBirthdayCornerBox(bData)], flags: V2, allowedMentions: NO_PING });
        await saveBirthdayConfig(interaction.channel.id, chatChannel.id, msg.id);
        await runDailyBirthdayRoutine(client).catch(() => {});
        return interaction.editReply({
          content: `✅ **PlatoMy Birthday Corner** berjaya ditetapkan di <#${interaction.channel.id}> (disimpan ke Neon) dan akan auto-refresh setiap jam 12:00 malam!`,
        });
      }

      if (name === "setup-leaderboard") {
        if (!isAdmin(interaction)) return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const category = interaction.options.getString("category");
        const meta = LEADERBOARD_CATEGORIES[category] || LEADERBOARD_CATEGORIES.exp;
        const msg = await interaction.channel.send({ components: [txt(`📊 **${meta.label} sedang dijana... Sila tunggu sebentar.**`)], flags: V2 });
        await saveLeaderboardConfig(category, interaction.channel.id, msg.id);
        try {
          const attachment = await generateLeaderboardImage(category);
          await msg.edit({ components: [buildLeaderboardBox(category)], files: [attachment], attachments: [], flags: V2 });
          return interaction.editReply({
            content: `✅ **${meta.label}** berjaya ditetapkan di <#${interaction.channel.id}> (disimpan ke Neon) dan akan auto-update setiap 10 minit!`,
          });
        } catch (err) {
          console.error("Leaderboard generation error:", err);
          return interaction.editReply({ content: `❌ Ralat semasa menjana gambar leaderboard: ${err.message}` });
        }
      }

      if (name === "reset-leaderboard") {
        if (!isAdmin(interaction)) return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        for (const [, data] of wallets.entries()) data.exp = 0;
        const configs = await getLeaderboardConfigs();
        const expCfg = configs.exp;
        if (expCfg?.channelId && expCfg?.messageId) {
          const channel = await client.channels.fetch(expCfg.channelId).catch(() => null);
          const message = await channel?.messages.fetch(expCfg.messageId).catch(() => null);
          if (message) {
            const attachment = await generateLeaderboardImage("exp");
            await message.edit({
              components: [buildLeaderboardBox("exp", "EXP telah diset semula ke 0")],
              files: [attachment],
              attachments: [],
              flags: V2,
            });
          }
        }
        return interaction.editReply({ content: "✅ Berjaya mereset semua EXP ahli kepada 0 dan mengemaskini paparan EXP Leaderboard!" });
      }

      if (name === "embed-builder") {
        if (!isAdmin(interaction)) return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        const targetChannel = interaction.options.getChannel("channel");
        const modal = new ModalBuilder().setCustomId(`embed_builder:${targetChannel.id}`).setTitle("🎨 PlatoMy Container Builder");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("eb_title").setLabel("Tajuk (pilihan)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(256)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("eb_desc").setLabel("Mesej / Penerangan").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(3500)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("eb_color").setLabel("Warna Hex (pilihan, cth: #ff69b4)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(7).setPlaceholder("#ff69b4")
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("eb_image").setLabel("URL gambar (pilihan)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500).setPlaceholder("https://...")
          )
        );
        return interaction.showModal(modal);
      }

      if (name === "embed-image") {
        if (!isAdmin(interaction)) return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        const targetChannel = interaction.options.getChannel("channel");
        const imageUrl = interaction.options.getString("image_url");
        const colorInput = interaction.options.getString("color");
        if (!isUrl(imageUrl)) return interaction.reply({ content: "❌ Link gambar tidak sah. Mesti bermula dengan https://", ephemeral: true });
        const imageBox = new ContainerBuilder();
        const ac = accent(colorInput);
        if (ac !== null) imageBox.setAccentColor(ac);
        imageBox.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl.trim())));
        await targetChannel.send({ components: [imageBox], flags: V2 });
        return interaction.reply({ content: "✅ Gambar berjaya dihantar!", ephemeral: true });
      }

      if (name === "giveaway") {
        if (!isAdmin(interaction)) return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        const imageUrl = interaction.options.getString("image_url");
        if (imageUrl && !isUrl(imageUrl)) return interaction.reply({ content: "❌ Link gambar tidak sah. Mesti bermula dengan https://", ephemeral: true });
        await createGiveaway(interaction.channel, {
          prize: interaction.options.getString("prize"),
          durationMins: interaction.options.getInteger("duration"),
          winnersCount: interaction.options.getInteger("winners") ?? 1,
          requiredRoleId: interaction.options.getRole("required_role")?.id || null,
          imageUrl,
          hostId: interaction.user.id,
        });
        return interaction.reply({ content: "✅ Giveaway berjaya dimulakan!", ephemeral: true });
      }

      if (name === "giveaway-reroll") {
        if (!isAdmin(interaction)) return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const result = await rerollGiveaway(interaction.options.getString("message_id").trim(), interaction.options.getInteger("count") ?? 1);
        return interaction.editReply({ content: result.ok ? `✅ Berjaya reroll ${result.count} pemenang!` : `❌ ${result.error}` });
      }

      if (name === "spin") {
        if (!isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Hanya Administrator boleh mulakan Wheel Spin!", ephemeral: true });
        }
        const title = interaction.options.getString("title") || "Wheel Spin";
        const winnersCount = interaction.options.getInteger("winners") ?? 1;

        const game = {
          title,
          winnersCount,
          hostId: interaction.user.id,
          participants: [],
          ended: false,
        };

        const msg = await interaction.channel.send({
          components: [buildSpinLobbyBox(game)],
          flags: V2,
          allowedMentions: NO_PING,
        });

        spinGames.set(msg.id, game);
        return interaction.reply({ content: "✅ Lobby Wheel Spin dibuka! Tekan **Spin Now** bila sedia.", ephemeral: true });
      }

      if (name === "plato-arena") {
        if (!isAdmin(interaction)) return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        const currencyType = interaction.options.getString("currency");
        const totalPrize = interaction.options.getInteger("prize");
        const durationMins = interaction.options.getInteger("duration");
        const winnersCount = interaction.options.getInteger("winners") ?? 1;
        const bountyTarget = interaction.options.getUser("bounty_target");
        const bountyPrize = interaction.options.getInteger("bounty_prize") ?? 0;

        if (totalPrize < winnersCount) {
          return interaction.reply({ content: "❌ Hadiah mesti sekurang-kurangnya sama dengan bilangan pemenang.", ephemeral: true });
        }
        if ((bountyTarget && !bountyPrize) || (!bountyTarget && bountyPrize > 0)) {
          return interaction.reply({
            content: "❌ Sila isi kedua-dua `bounty_target` dan `bounty_prize` jika mahu aktifkan Bounty.",
            ephemeral: true,
          });
        }

        await createRumble(interaction.channel, currencyType, totalPrize, durationMins, winnersCount, bountyTarget?.id || null, bountyPrize);
        return interaction.reply({ content: "✅ Plato Arena berjaya dimulakan!", ephemeral: true });
      }
    }

    // ===== BUTANG =====
    if (interaction.isButton()) {
      const id = interaction.customId;

      if (id === "shop_buy_coins" || id === "shop_buy_pips") {
        const type = id === "shop_buy_coins" ? "coins" : "pips";
        const w = getWallet(interaction.user.id);
        return interaction.showModal(buildShopModal(type, w.petals || 0));
      }

      if (id === "shop_calculator") {
        return interaction.showModal(buildCalcModal());
      }

      if (id.startsWith("wallet_admin:")) {
        if (!isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Hanya Administrator boleh ubah baki wallet!", ephemeral: true });
        }
        const [, mode, targetId] = id.split(":");
        const modal = new ModalBuilder()
          .setCustomId(`wallet_admin_modal:${mode}:${targetId}`)
          .setTitle(mode === "add" ? "➕ Add Wallet Balance" : "➖ Deduct Wallet Balance");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("wa_currency")
              .setLabel("Jenis (coins / pips / petals / sponsor)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder("coins")
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("wa_amount")
              .setLabel("Jumlah")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder("cth: 100")
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("wa_reason")
              .setLabel("Sebab (pilihan)")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setPlaceholder("cth: Hadiah event")
          )
        );
        return interaction.showModal(modal);
      }

      if (id === "open_birthday_modal") {
        const modal = new ModalBuilder().setCustomId("birthday_modal").setTitle("🎂 Register / Update Birthday");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("bday_day").setLabel("Day (1 - 31)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2).setPlaceholder("cth: 20")
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("bday_month").setLabel("Month (1 - 12)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2).setPlaceholder("cth: 11")
          )
        );
        return interaction.showModal(modal);
      }

      if (id === "join_giveaway") {
        await interaction.deferReply({ ephemeral: true });
        const game = giveawayGames.get(interaction.message.id);
        if (!game || game.ended) return interaction.editReply({ content: "❌ Giveaway ini sudah tamat." });
        if (game.requiredRoleId && !interaction.member?.roles?.cache?.has(game.requiredRoleId)) {
          return interaction.editReply({ content: `❌ Anda perlukan role <@&${game.requiredRoleId}> untuk menyertai giveaway ini.` });
        }
        if (game.participants.includes(interaction.user.id)) return interaction.editReply({ content: "⚠️ Anda sudah menyertai giveaway ini!" });
        game.participants.push(interaction.user.id);
        saveGiveaways();
        await interaction.message.edit({ components: [giveawayBox(game)], flags: V2, allowedMentions: NO_PING }).catch(() => {});
        return interaction.editReply({ content: "✅ Berjaya menyertai giveaway!" });
      }

      if (id === "join_spin") {
        await interaction.deferReply({ ephemeral: true });
        const game = spinGames.get(interaction.message.id);
        if (!game || game.ended) {
          return interaction.editReply({ content: "❌ Wheel Spin ini sudah tamat." });
        }
        if (game.participants.includes(interaction.user.id)) {
          return interaction.editReply({ content: "⚠️ Anda sudah menyertai Wheel Spin ini!" });
        }
        game.participants.push(interaction.user.id);
        await interaction.message
          .edit({ components: [buildSpinLobbyBox(game)], flags: V2, allowedMentions: NO_PING })
          .catch(() => {});
        return interaction.editReply({ content: "✅ Anda berjaya menyertai Wheel Spin!" });
      }

      if (id === "start_spin") {
        const game = spinGames.get(interaction.message.id);
        if (!game || game.ended) {
          return interaction.reply({ content: "❌ Wheel Spin ini sudah tamat.", ephemeral: true });
        }
        if (interaction.user.id !== game.hostId) {
          return interaction.reply({ content: "❌ Hanya Host sahaja boleh menekan butang Spin Now!", ephemeral: true });
        }
        if (game.participants.length < 2) {
          return interaction.reply({ content: "❌ Perlukan sekurang-kurangnya **2 peserta** untuk pusing roda.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        game.ended = true;
        await interaction.message
          .edit({ components: [buildSpinLobbyBox(game)], flags: V2, allowedMentions: NO_PING })
          .catch(() => {});

        const nameMap = new Map();
        for (const uid of game.participants) {
          const u = await client.users.fetch(uid).catch(() => null);
          nameMap.set(uid, u ? u.displayName || u.username : uid);
        }

        const shuffled = [...game.participants].sort(() => Math.random() - 0.5);
        const winners = shuffled.slice(0, Math.min(game.winnersCount, shuffled.length));
        let currentPool = [...game.participants];

        await interaction.editReply({ content: "🎡 Memulakan pusingan roda..." });

        for (let i = 0; i < winners.length; i++) {
          const winnerId = winners[i];
          const names = currentPool.map((uid) => nameMap.get(uid));
          const winnerName = nameMap.get(winnerId);

          const gifBuffer = await generateWheelGif(names, winnerName, {
            title: "Wheel Spin",
            subtitle: `PlatoMy • ${game.title}`,
          });
          const file = new AttachmentBuilder(gifBuffer, { name: "wheel-spin.gif" });

          const spinBox = new ContainerBuilder()
            .addTextDisplayComponents(txt("### ˚ · . ꒰ა 🎡 Wheel Spin 🎡 ໒꒱ . · ˚"))
            .addSeparatorComponents(sep())
            .addMediaGalleryComponents(
              new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL("attachment://wheel-spin.gif"))
            )
            .addTextDisplayComponents(
              txt(
                winners.length > 1
                  ? `🎁 **${game.title}**${NL}✨ *Pusingan ${i + 1} / ${winners.length}...*`
                  : `🎁 **${game.title}**${NL}✨ *Memusing roda... tunggu sebentar!*`
              )
            );

          await interaction.channel.send({ components: [spinBox], files: [file], flags: V2 }).catch(() => {});
          await sleep(4500);
          currentPool = currentPool.filter((uid) => uid !== winnerId);
        }

        const mentions = winners.map((uid) => `<@${uid}>`).join(", ");
        const resultBox = new ContainerBuilder()
          .addTextDisplayComponents(txt("### 🎉 Keputusan Wheel Spin 🎉"))
          .addSeparatorComponents(sep())
          .addTextDisplayComponents(txt(`Tahniah ${mentions}!${NL}Anda memenangi **${game.title}**!`));

        await interaction.channel
          .send({ components: [resultBox], flags: V2, allowedMentions: { users: winners } })
          .catch(() => {});
        return;
      }

      if (id.startsWith("join_rumble_")) {
        await interaction.deferReply({ ephemeral: true });
        const game = rumbleMap.get(interaction.message.id);
        if (!game || game.ended) return interaction.editReply({ content: "❌ Plato Arena ini sudah tamat." });
        if (game.participants.includes(interaction.user.id)) return interaction.editReply({ content: "⚠️ Anda sudah menyertai Plato Arena!" });
        game.participants.push(interaction.user.id);
        await interaction.message.edit({ components: [rumbleOpenBox(game)], flags: V2, allowedMentions: NO_PING }).catch(() => {});
        return interaction.editReply({ content: "✅ Berjaya menyertai Plato Arena!" });
      }

      if (id === "open_trading_modal") {
        const modal = new ModalBuilder().setCustomId("trading_modal").setTitle("🛍️ PlatoMy Trading");
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("trading_text").setLabel("Item details").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
          )
        );
        return interaction.showModal(modal);
      }

      if (id.startsWith("accept_trade:")) {
        const requesterId = id.split(":")[1];
        const hasTradeRole = interaction.member?.roles?.cache?.some((r) => r.name.toLowerCase().includes(TRADE_ROLE_NAME));
        if (!hasTradeRole) return interaction.reply({ content: "❌ You need the Trade role to accept trades.", ephemeral: true });
        if (interaction.user.id === requesterId) return interaction.reply({ content: "⚠️ You can't accept your own trade.", ephemeral: true });
        if (acceptedTrades.has(interaction.message.id)) return interaction.reply({ content: "❌ This trade has already been accepted.", ephemeral: true });

        acceptedTrades.add(interaction.message.id);
        await interaction.deferUpdate();

        const infoText = collectText(interaction.message.components).find((t) => t.includes("**Item Details:**")) || "";
        const item = infoText.split("**Item Details:**")[1]?.trim() || "-";
        const tradeChannel = await createTradeChannel(interaction.guild, requesterId, interaction.user, item);

        await interaction.editReply({
          components: [buildTradeList({ requesterId, details: item, accepterId: interaction.user.id })],
          flags: V2,
        });

        if (tradeChannel) {
          await interaction.channel
            .send({
              content: `🤝 <@${requesterId}>, your trade was accepted by ${interaction.user}. Head to ${tradeChannel} to complete the trade!`,
              allowedMentions: { users: [requesterId] },
            })
            .catch(() => {});
        } else {
          await interaction.followUp({ content: "❌ I couldn't create the trade channel. Please check the bot's permissions on the trade category.", ephemeral: true }).catch(() => {});
          await interaction.channel.send(`🤝 <@${requesterId}>, your trade was accepted by ${interaction.user}. Please contact each other to complete the trade!`).catch(() => {});
        }

        const logChannel = findChannel(interaction.guild, TRADING_LOG_CHANNEL_NAME);
        if (logChannel) {
          const logLines = [
            `📥 **Requester:** <@${requesterId}> (\`${requesterId}\`)`,
            `🤝 **Accepted by:** ${interaction.user} (\`${interaction.user.id}\`)`,
            ...(tradeChannel ? [`📍 **Trade Channel:** ${tradeChannel}`] : []),
            "",
            "📝 **Item:**",
            item,
          ];
          await logChannel
            .send({
              components: [info("🛍️ Trading Log: Trade Accepted", logLines.join(NL), `Trading Log • Today at ${getMalaysiaTime()}`)],
              flags: V2,
              allowedMentions: NO_PING,
            })
            .catch(() => {});
        }
        return;
      }

      if (id.startsWith("close_trade:")) {
        const accepterId = id.split(":")[1];
        if (interaction.channel?.parentId !== TRADE_CATEGORY_ID) {
          return interaction.reply({ content: "❌ This button only works inside a trade channel.", ephemeral: true });
        }
        if (interaction.user.id !== accepterId && !isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Only the person who accepted this trade can close this channel.", ephemeral: true });
        }
        const channelName = interaction.channel.name;
        await interaction.reply({ content: `🔒 Trade closed by ${interaction.user}. This channel will be deleted in 5 seconds...`, allowedMentions: NO_PING });

        const logChannel = findChannel(interaction.guild, TRADING_LOG_CHANNEL_NAME);
        if (logChannel) {
          const closeLines = [
            `🔒 **Closed by:** ${interaction.user} (\`${interaction.user.id}\`)`,
            `🤝 **Accepted by:** <@${accepterId}>`,
            `📍 **Channel:** ${channelName}`,
          ].join(NL);
          await logChannel
            .send({
              components: [info("🛍️ Trading Log: Trade Closed", closeLines, `Trading Log • Today at ${getMalaysiaTime()}`)],
              flags: V2,
              allowedMentions: NO_PING,
            })
            .catch(() => {});
        }

        await sleep(5000);
        await interaction.channel.delete(`Trade closed by ${interaction.user.tag}`).catch((e) => console.error("Gagal padam channel trade:", e));
        return;
      }
    }

    // ===== MODAL =====
    if (interaction.isModalSubmit()) {
      if (interaction.customId === "shop_calc_modal") {
        const rawType = interaction.fields.getTextInputValue("calc_type").trim().toLowerCase();
        const amount = parseFloat(interaction.fields.getTextInputValue("calc_amount").trim());

        let type = null;
        if (["petal", "petals"].includes(rawType)) type = "petals";
        else if (["coin", "coins", "plato coin", "plato coins"].includes(rawType)) type = "coins";
        else if (["pip", "pips"].includes(rawType)) type = "pips";

        if (!type) {
          return interaction.reply({ content: "❌ Jenis tidak sah! Sila taip `petals`, `coins`, atau `pips`.", ephemeral: true });
        }
        if (isNaN(amount) || amount <= 0) {
          return interaction.reply({ content: "❌ Jumlah mesti nombor lebih daripada 0.", ephemeral: true });
        }

        const w = getWallet(interaction.user.id);
        return interaction.reply({
          components: [buildCalcResultBox(type, amount, w.petals || 0)],
          flags: V2_EPHEMERAL,
          allowedMentions: NO_PING,
        });
      }

      if (interaction.customId.startsWith("shop_modal:")) {
        const type = interaction.customId.split(":")[1];
        const amount = parseInt(interaction.fields.getTextInputValue("shop_amount").trim(), 10);
        if (isNaN(amount) || amount <= 0) {
          return interaction.reply({ content: "❌ Jumlah tidak sah! Sila masukkan nombor lebih daripada 0.", ephemeral: true });
        }

        const rate = type === "coins" ? PETALS_PER_COIN : PETALS_PER_PIP;
        const cost = amount * rate;
        const w = getWallet(interaction.user.id);

        if ((w.petals || 0) < cost) {
          return interaction.reply({
            content: [
              "❌ **❀ Petals tidak mencukupi!**",
              `Anda perlukan **${cost.toLocaleString()} ❀ Petals**, tetapi baki anda cuma **${(w.petals || 0).toLocaleString()} ❀ Petals**.`,
            ].join(NL),
            ephemeral: true,
          });
        }

        w.petals -= cost;
        if (type === "coins") w.coins += amount;
        else w.pips += amount;

        await interaction.reply({
          components: [buildShopReceiptBox({ type, amount, cost, w })],
          flags: V2_EPHEMERAL,
          allowedMentions: NO_PING,
        });

        const logChannel = findChannel(interaction.guild, WALLET_LOG_CHANNEL_NAME);
        if (logChannel) {
          const itemStr =
            type === "coins"
              ? `**${amount.toLocaleString()}** ${SHOP_COINS_EMOJI} **Plato Coins**`
              : `**${amount.toLocaleString()}** ${SHOP_PIPS_EMOJI} **Pips**`;
          await logChannel
            .send({
              components: [
                walletLogBox({
                  actionTitle: "❀ Petals Shop Redeem",
                  target: interaction.user,
                  admin: interaction.user,
                  details: `Tebus ${itemStr} dengan **${cost.toLocaleString()} ❀ Petals**.`,
                  reason: "Petals Shop Exchange",
                  w,
                }),
              ],
              flags: V2,
              allowedMentions: NO_PING,
            })
            .catch(() => {});
        }
        return;
      }

      if (interaction.customId.startsWith("wallet_admin_modal:")) {
        if (!isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Hanya Administrator boleh ubah baki wallet!", ephemeral: true });
        }
        const [, mode, targetId] = interaction.customId.split(":");
        const currency = interaction.fields.getTextInputValue("wa_currency").trim().toLowerCase();
        const amount = parseInt(interaction.fields.getTextInputValue("wa_amount").trim(), 10);
        const reason = interaction.fields.getTextInputValue("wa_reason").trim() || "Tiada sebab dinyatakan";

        if (!["coins", "pips", "petals", "sponsor"].includes(currency)) {
          return interaction.reply({ content: "❌ Jenis tidak sah! Sila taip `coins`, `pips`, `petals`, atau `sponsor`.", ephemeral: true });
        }
        if (isNaN(amount) || amount <= 0) {
          return interaction.reply({ content: "❌ Jumlah mesti nombor lebih daripada 0.", ephemeral: true });
        }

        const targetUser = (await client.users.fetch(targetId).catch(() => null)) || { id: targetId, toString: () => `<@${targetId}>` };
        const w = getWallet(targetId);
        let actionTitle = "";
        let actionDesc = "";

        if (currency === "coins") {
          w.coins = mode === "add" ? w.coins + amount : Math.max(0, w.coins - amount);
          actionTitle = mode === "add" ? "🪙 Plato Coins Added" : "🪙 Plato Coins Deducted";
          actionDesc = `Berjaya ${mode === "add" ? "menambah" : "menolak"} **${amount.toLocaleString()} Plato Coins** ${mode === "add" ? "kepada" : "daripada"} ${targetUser}.`;
        } else if (currency === "pips") {
          w.pips = mode === "add" ? w.pips + amount : Math.max(0, w.pips - amount);
          actionTitle = mode === "add" ? "💠 Pips Added" : "💠 Pips Deducted";
          actionDesc = `Berjaya ${mode === "add" ? "menambah" : "menolak"} **${amount.toLocaleString()} Pips** ${mode === "add" ? "kepada" : "daripada"} ${targetUser}.`;
        } else if (currency === "petals") {
          w.petals = mode === "add" ? (w.petals || 0) + amount : Math.max(0, (w.petals || 0) - amount);
          actionTitle = mode === "add" ? "❀ Petals Added" : "❀ Petals Deducted";
          actionDesc = `Berjaya ${mode === "add" ? "menambah" : "menolak"} **${amount.toLocaleString()} ❀ Petals** ${mode === "add" ? "kepada" : "daripada"} ${targetUser}.`;
        } else if (currency === "sponsor") {
          if (mode === "add") {
            w.sponsorTotal += amount;
            w.sponsorMonthly = (w.sponsorMonthly || 0) + amount;
          } else {
            w.sponsorTotal = Math.max(0, w.sponsorTotal - amount);
            w.sponsorMonthly = Math.max(0, (w.sponsorMonthly || 0) - amount);
          }
          actionTitle = mode === "add" ? "🌸 Sponsor Added" : "🌸 Sponsor Deducted";
          actionDesc = `Berjaya ${mode === "add" ? "menambah" : "menolak"} sponsor **${amount.toLocaleString()} Plato Coins** ${mode === "add" ? "kepada" : "daripada"} ${targetUser}.`;
        }

        await interaction.reply({
          components: [walletBox(w, targetId !== interaction.user.id ? targetUser : null, targetId)],
          flags: V2_EPHEMERAL,
          allowedMentions: NO_PING,
        });

        const logChannel = findChannel(interaction.guild, WALLET_LOG_CHANNEL_NAME);
        if (logChannel) {
          await logChannel
            .send({
              components: [
                walletLogBox({ actionTitle, target: targetUser, admin: interaction.user, details: actionDesc, reason, w }),
              ],
              flags: V2,
              allowedMentions: NO_PING,
            })
            .catch(() => {});
        }
        return;
      }

      if (interaction.customId === "birthday_modal") {
        const day = parseInt(interaction.fields.getTextInputValue("bday_day").trim(), 10);
        const month = parseInt(interaction.fields.getTextInputValue("bday_month").trim(), 10);
        const maxDaysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (isNaN(month) || month < 1 || month > 12 || isNaN(day) || day < 1 || day > maxDaysInMonth[month - 1]) {
          return interaction.reply({ content: "❌ Tarikh tidak sah! Sila masukkan Day (1–31) dan Month (1–12) yang betul.", ephemeral: true });
        }
        const bData = await getBirthdayData();
        const prev = bData.users[interaction.user.id];
        const celebratedYear = prev && prev.day === day && prev.month === month ? prev.celebratedYear : null;
        await saveUserBirthday(interaction.user.id, day, month, celebratedYear);

        const replyMsg = prev
          ? `🎂 Tarikh hari lahir anda telah dikemas kini dari **${formatDayMonth(prev.day, prev.month)}** kepada **${formatDayMonth(day, month)}**!`
          : `🎂 Hari lahir anda telah didaftarkan pada **${formatDayMonth(day, month)}**!`;
        await interaction.reply({ content: replyMsg, ephemeral: true });
        await runDailyBirthdayRoutine(client).catch(() => refreshBirthdayBoard(client));
        return;
      }

      if (interaction.customId === "trading_modal") {
        const details = interaction.fields.getTextInputValue("trading_text").trim();
        if (!details) return interaction.reply({ content: "❌ Please fill in the item details.", ephemeral: true });
        const listChannel = findChannel(interaction.guild, TRADING_LIST_CHANNEL_NAME);
        if (!listChannel) return interaction.reply({ content: "❌ The trading-list channel was not found.", ephemeral: true });

        const traderRole = interaction.guild.roles.cache.find((r) => r.name.toLowerCase().includes(TRADER_ROLE_NAME));
        const sent = await listChannel
          .send({
            components: [...(traderRole ? [txt(`<@&${traderRole.id}>`)] : []), buildTradeList({ requesterId: interaction.user.id, details })],
            flags: V2,
            allowedMentions: traderRole ? { roles: [traderRole.id] } : NO_PING,
          })
          .catch(() => null);
        if (!sent) {
          return interaction.reply({ content: "❌ The bot can't send to the trading-list channel. Please check the bot's permissions.", ephemeral: true });
        }

        await interaction.reply({ content: "✅ Your item details have been sent!", ephemeral: true });

        const logChannel = findChannel(interaction.guild, TRADING_LOG_CHANNEL_NAME);
        if (logChannel) {
          const reqLines = [`👤 **Requester:** ${interaction.user} (\`${interaction.user.id}\`)`, "", "📝 **Item:**", details].join(NL);
          await logChannel
            .send({
              components: [info("🛍️ Trading Log: New Request", reqLines, `Trading Log • Today at ${getMalaysiaTime()}`)],
              flags: V2,
              allowedMentions: NO_PING,
            })
            .catch(() => {});
        }
        return;
      }

      if (interaction.customId.startsWith("embed_builder:")) {
        const channelId = interaction.customId.split(":")[1];
        const targetChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
        if (!targetChannel || !targetChannel.isTextBased()) return interaction.reply({ content: "❌ Channel tidak dijumpai.", ephemeral: true });

        const title = interaction.fields.getTextInputValue("eb_title").trim();
        const desc = interaction.fields.getTextInputValue("eb_desc").trim();
        const color = interaction.fields.getTextInputValue("eb_color");
        const image = interaction.fields.getTextInputValue("eb_image").trim();
        if (!title && !desc && !isUrl(image)) return interaction.reply({ content: "❌ Isi sekurang-kurangnya tajuk, mesej atau gambar.", ephemeral: true });

        const box = new ContainerBuilder();
        const ac = accent(color);
        if (ac !== null) box.setAccentColor(ac);
        if (title) box.addTextDisplayComponents(txt(`## ${title}`));
        if (title && desc) box.addSeparatorComponents(sep());
        if (desc) box.addTextDisplayComponents(txt(desc));
        if (isUrl(image)) box.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(image)));

        await targetChannel.send({ components: [box], flags: V2 });
        return interaction.reply({ content: `✅ Container berjaya dihantar ke <#${targetChannel.id}>!`, ephemeral: true });
      }
    }
  } catch (err) {
    console.error("Ralat interaction:", err);
    const msg = { content: "❌ Ralat berlaku. Cuba lagi.", ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(msg).catch(() => {});
    else await interaction.reply(msg).catch(() => {});
  }
});

client.login(token).catch((err) => {
  console.error("GAGAL LOGIN:", err);
});
