import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ContainerBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  AttachmentBuilder,
} from "discord.js";
import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import cron from "node-cron";
import { registerDashboardApi } from "./dashboard-api.js";
import { loadWallets, startAutosave } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NL = String.fromCharCode(10);

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
const giveawaysMap = new Map();
const rumbleMap = new Map();
const acceptedTrades = new Set();

function getWallet(id) {
  if (!wallets.has(id)) wallets.set(id, { coins: 0, pips: 0, exp: 0, sponsorTotal: 0 });
  return wallets.get(id);
}

await loadWallets(wallets);
startAutosave(wallets);

// --- TETAPAN BOT ---
const WALLET_LOG_CHANNEL_NAME = "wallet-log";
const TRADING_LIST_CHANNEL_NAME = "trading-list";
const TRADING_LOG_CHANNEL_NAME = "trading-log";
const TRADE_ROLE_NAME = "trade";
const TRADER_ROLE_NAME = "trader";
const TRADE_CATEGORY_ID = "1567527038368223332";

const LEVEL_UP_CHANNEL_ID = "1552249117621747782";
const LOW_EXP_CHANNEL_IDS = new Set(["1548984832263065640"]);

const LOG_CHANNEL_IDS = {
  [WALLET_LOG_CHANNEL_NAME]: "1569585830224461884",
  [TRADING_LOG_CHANNEL_NAME]: "1569585956439461908",
};

const URL_1 =
  "https://cdn.discordapp.com/attachments/1556946394239991848/" +
  "1562348900705374259/IMG_6986.gif?ex=6aeec24c&is=6aed70cc&" +
  "hm=b4094237e998531634199814f373fd7d8827c9aa8dbb8d0ec626aeb70ca092e5&";

const URL_2 =
  "https://cdn.discordapp.com/attachments/1556946394239991848/" +
  "1567858191537279016/20261105_190812_0000.png?ex=6aee5dfa&" +
  "is=6aed0c7a&hm=703dd68300d271f1087bbbc0b932f49a379a78b33f00cdbef8a9f4ac80fd74c0&";

const TRADE_MEDIA_URLS = [URL_1, URL_2, URL_1];

// --- TETAPAN LEVEL (MAX 100) & EXP BERPERINGKAT ---
const MAX_LEVEL = 100;
const NORMAL_EXP_COOLDOWN_MS = 30 * 1000;  // 30 saat (channel biasa)
const LOW_EXP_COOLDOWN_MS = 60 * 1000;     // 60 saat (channel bot/game)
const expCooldowns = new Map();

const LEVEL_ROLES = [
  { level: 100, keyword: "diamond", label: "Diamond" },
  { level: 75, keyword: "ruby", label: "Ruby" },
  { level: 50, keyword: "sapphire", label: "Sapphire" },
  { level: 25, keyword: "emerald", label: "Emerald" },
  { level: 10, keyword: "amethyst", label: "Amethyst" },
];

function getExpNeededForLevel(lvl) {
  if (lvl <= 10) return 300;   // Senang (Lvl 1-10)
  if (lvl <= 40) return 800;   // Sederhana (Lvl 11-40)
  if (lvl <= 75) return 1500;  // Susah (Lvl 41-75)
  return 2500;                 // Sangat Susah (Lvl 76-100)
}

function getLevelInfo(exp) {
  let remaining = Math.max(0, Number(exp) || 0);
  let level = 1;

  while (level < MAX_LEVEL) {
    const needed = getExpNeededForLevel(level);
    if (remaining >= needed) {
      remaining -= needed;
      level++;
    } else {
      break;
    }
  }

  const isMax = level >= MAX_LEVEL;
  const neededForNext = isMax ? getExpNeededForLevel(MAX_LEVEL - 1) : getExpNeededForLevel(level);
  const currentLevelExp = isMax ? neededForNext : remaining;
  const expToNext = isMax ? 0 : neededForNext - currentLevelExp;
  const progressPct = isMax ? 100 : Math.min(100, Math.floor((currentLevelExp / neededForNext) * 100));
  const tier = LEVEL_ROLES.find((r) => level >= r.level)?.label || "Unranked";

  return { level, isMax, currentLevelExp, neededForNext, expToNext, progressPct, tier };
}

async function syncLevelRoles(member, level) {
  if (!member?.guild) return;
  const targetTier = LEVEL_ROLES.find((r) => level >= r.level) || null;

  for (const tier of LEVEL_ROLES) {
    const role = member.guild.roles.cache.find((r) => r.name.toLowerCase().includes(tier.keyword));
    if (!role) continue;

    const shouldHave = targetTier && targetTier.keyword === tier.keyword;
    const hasRole = member.roles.cache.has(role.id);

    if (shouldHave && !hasRole) {
      await member.roles.add(role).catch(() => {});
    } else if (!shouldHave && hasRole) {
      await member.roles.remove(role).catch(() => {});
    }
  }
}

// --- TETAPAN MURAI YAPPERS (Aktif Seminggu, Auto-Remove 3 Hari Tak Aktif) ---
const YAPPER_DATA_PATH = "./yapper-activity.json";
const YAPPER_ROLE_KEYWORD = "murai yappers";
const YAPPER_MSG_THRESHOLD = 50;                     // 50 mesej dalam 7 hari
const YAPPER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;    // 7 hari (1 minggu)
const YAPPER_INACTIVE_MS = 3 * 24 * 60 * 60 * 1000;  // 3 hari tak aktif -> auto remove

function loadYapperActivity() {
  if (!fs.existsSync(YAPPER_DATA_PATH)) return new Map();
  try {
    const obj = JSON.parse(fs.readFileSync(YAPPER_DATA_PATH, "utf8"));
    return new Map(Object.entries(obj || {}));
  } catch {
    return new Map();
  }
}

const yapperActivity = loadYapperActivity();
let yapperSaveTimer = null;

function scheduleSaveYapperActivity() {
  if (yapperSaveTimer) return;
  yapperSaveTimer = setTimeout(() => {
    yapperSaveTimer = null;
    try {
      const obj = Object.fromEntries(yapperActivity.entries());
      fs.writeFileSync(YAPPER_DATA_PATH, JSON.stringify(obj));
    } catch (err) {
      console.error("Gagal simpan yapper-activity.json:", err);
    }
  }, 15000);
}

async function handleYapperActivity(member) {
  if (!member?.guild) return;
  const now = Date.now();
  const data = yapperActivity.get(member.id) || { timestamps: [], lastActive: now, guildId: member.guild.id };

  data.timestamps = (data.timestamps || []).filter((t) => now - t <= YAPPER_WINDOW_MS);
  data.timestamps.push(now);
  data.lastActive = now;
  data.guildId = member.guild.id;
  yapperActivity.set(member.id, data);
  scheduleSaveYapperActivity();

  if (data.timestamps.length >= YAPPER_MSG_THRESHOLD) {
    const yapperRole = member.guild.roles.cache.find((r) =>
      r.name.toLowerCase().includes(YAPPER_ROLE_KEYWORD)
    );
    if (yapperRole && !member.roles.cache.has(yapperRole.id)) {
      await member.roles.add(yapperRole).catch(() => {});
    }
  }
}

// --- UTILITI ---
const isAdmin = (i) => i.member?.permissions?.has(PermissionFlagsBits.Administrator);
const isUrl = (u) => /^https?:\/\/\S+$/i.test(String(u || "").trim());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const findChannel = (guild, part) => {
  const byId = guild.channels.cache.get(LOG_CHANNEL_IDS[part]);
  if (byId?.isTextBased()) return byId;
  return guild.channels.cache.find((c) => c.name.toLowerCase().includes(part) && c.isTextBased());
};

const accent = (c) => {
  const v = String(c || "").trim().replace("#", "");
  return /^[0-9a-fA-F]{6}$/.test(v) ? parseInt(v, 16) : null;
};

function getMalaysiaTime() {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getMalaysiaDateParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());

  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 1);
  return { year: get("year"), month: get("month"), day: get("day") };
}

// ================= CONTAINER (Components V2) =================
const V2 = MessageFlags.IsComponentsV2;
const V2_EPHEMERAL = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const NO_PING = { parse: [] };
const sep = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
const txt = (content) => new TextDisplayBuilder().setContent(content);

function info(title, body, footer = null) {
  const box = new ContainerBuilder()
    .addTextDisplayComponents(txt(`## ${title}`))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(body));
  if (footer) box.addTextDisplayComponents(txt(`-# ${footer}`));
  return box;
}

function collectText(components, out = []) {
  for (const c of components || []) {
    const t = c.content ?? c.data?.content;
    if (typeof t === "string") out.push(t);
    if (c.components) collectText(c.components, out);
  }
  return out;
}

// ================= LEVEL UP CONTAINER =================
function buildLevelUpBox(member, newLevel, totalExp) {
  const avatarUrl = member.user.displayAvatarURL({ extension: "png", size: 256 });
  const headerAndBody = [
    "### ˚₊‧꒰ა <a:PinkCrown:1549417235393683681> 𝐿𝐸𝑉𝐸𝐿 𝑈𝑃! <a:PinkCrown:1549417235393683681> ໒꒱‧₊˚",
    `<a:a_sparkle7:1563423627263877200> ╰┈➤ Congratulations ${member}! You just advanced to Level ${newLevel} with ${totalExp.toLocaleString()} XP!`,
  ].join(NL);

  const section = new SectionBuilder()
    .addTextDisplayComponents(txt(headerAndBody))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));

  return new ContainerBuilder()
    .addSectionComponents(section)
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      txt("-# ⋆˚࿔ <:pinkbow:1563423584624582779> Keep being active in the Plato MY community! <:HrtPinkYellow:1549418195516129291> 𝜗𝜚˚⋆")
    );
}

// ================= BIRTHDAY CORNER =================
const BIRTHDAY_DATA_PATH = "./birthdays.json";
const BIRTHDAY_ROLE_KEYWORD = "it's my birthday";
const PARTY_ROLE_KEYWORD = "mypartycrashers";
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function loadBirthdayData() {
  if (!fs.existsSync(BIRTHDAY_DATA_PATH)) {
    return { config: null, users: {} };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(BIRTHDAY_DATA_PATH, "utf8"));
    return { config: raw?.config || null, users: raw?.users || {} };
  } catch {
    return { config: null, users: {} };
  }
}

function saveBirthdayData(data) {
  fs.writeFileSync(BIRTHDAY_DATA_PATH, JSON.stringify(data, null, 2));
}

function formatDayMonth(day, month) {
  return `${String(day).padStart(2, "0")} ${MONTH_NAMES[month - 1] || ""}`;
}

function getBirthdayDiffDays(day, month, today) {
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  const thisYearUtc = Date.UTC(today.year, month - 1, day);
  const diffThisYear = Math.round((thisYearUtc - todayUtc) / 86400000);

  let daysUntil = diffThisYear;
  if (daysUntil < 0) {
    const nextYearUtc = Date.UTC(today.year + 1, month - 1, day);
    daysUntil = Math.round((nextYearUtc - todayUtc) / 86400000);
  }

  let daysAgo = -diffThisYear;
  if (daysAgo < 0) {
    const prevYearUtc = Date.UTC(today.year - 1, month - 1, day);
    daysAgo = Math.round((todayUtc - prevYearUtc) / 86400000);
  }

  return { isToday: diffThisYear === 0, daysUntil, daysAgo };
}

function buildBirthdayCornerBox(data) {
  const today = getMalaysiaDateParts();
  const chatChannelId = data.config?.chatChannelId || data.config?.channelId || "1552249117621747782";

  const todayList = [];
  const upcomingList = [];
  const recentList = [];

  for (const [userId, b] of Object.entries(data.users || {})) {
    const { isToday, daysUntil, daysAgo } = getBirthdayDiffDays(b.day, b.month, today);
    if (isToday) {
      todayList.push(`<@${userId}> 🌸`);
    } else {
      if (daysUntil > 0 && daysUntil <= 30) {
        upcomingList.push({ userId, day: b.day, month: b.month, daysUntil });
      }
      if (daysAgo > 0 && daysAgo <= 14) {
        recentList.push({ userId, day: b.day, month: b.month, daysAgo });
      }
    }
  }

  upcomingList.sort((a, b) => a.daysUntil - b.daysUntil);
  recentList.sort((a, b) => a.daysAgo - b.daysAgo);

  const todayText =
    todayList.length > 0
      ? todayList.map((u) => `<a:PinkArrow:1549417772726095973> ${u}`).join(NL)
      : "<a:PinkArrow:1549417772726095973> No birthdays today — check back tomorrow!";

  const upcomingText =
    upcomingList.length > 0
      ? upcomingList
          .slice(0, 5)
          .map((u) => `• ${formatDayMonth(u.day, u.month)} — <@${u.userId}> (in ${u.daysUntil} day${u.daysUntil === 1 ? "" : "s"})`)
          .join(NL)
      : "• No upcoming birthdays in the next 30 days.";

  const recentText =
    recentList.length > 0
      ? recentList
          .slice(0, 5)
          .map((u) => `• ${formatDayMonth(u.day, u.month)} — <@${u.userId}> (${u.daysAgo} day${u.daysAgo === 1 ? "" : "s"} ago)`)
          .join(NL)
      : "• No recent birthdays in the last 14 days.";

  const headerBody = [
    "### ˚₊‧꒰ა <a:PinkCrown:1549417235393683681> 𝑃𝐿𝐴𝑇𝑂𝑀𝑌 𝐵𝐼𝑅𝑇𝐻𝐷𝐴𝑌 𝐶𝑂𝑅𝑁𝐸𝑅 <a:PinkCrown:1549417235393683681> ໒꒱‧₊˚",
    `<a:a_sparkle7:1563423627263877200> Every day is magical when we celebrate together! Spot a name below? Send them your sweetest wishes in <#${chatChannelId}>!`,
  ].join(NL);

  const listBody = [
    "🎂 𝗧𝗢𝗗𝗔𝗬'𝗦 𝗕𝗜𝗥𝗧𝗛𝗗𝗔𝗬 𝗦𝗧𝗔𝗥",
    todayText,
    "",
    "🎀 𝗨𝗣𝗖𝗢𝗠𝗜𝗡𝗚 𝗖𝗘𝗟𝗘𝗕𝗥𝗔𝗧𝗜𝗢𝗡𝗦",
    upcomingText,
    "",
    "🌷 𝗥𝗘𝗖𝗘𝗡𝗧𝗟𝗬 𝗖𝗘𝗟𝗘𝗕𝗥𝗔𝗧𝗘𝗗",
    recentText,
  ].join(NL);

  const registerBtn = new ButtonBuilder()
    .setCustomId("open_birthday_modal")
    .setLabel("Register Birthday")
    .setEmoji("🎂")
    .setStyle(ButtonStyle.Secondary);

  return new ContainerBuilder()
    .addTextDisplayComponents(txt(headerBody))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(listBody))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      txt("-# ⋆˚࿔ <:pinkbow:1563423584624582779> Click the button below to register your birthday! Auto-refreshes daily. 𝜗𝜚˚⋆")
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(registerBtn));
}

async function refreshBirthdayBoard(data = null) {
  const bData = data || loadBirthdayData();
  if (!bData.config?.channelId || !bData.config?.messageId) return;

  const channel = await client.channels.fetch(bData.config.channelId).catch(() => null);
  const message = await channel?.messages.fetch(bData.config.messageId).catch(() => null);
  if (!message) return;

  await message
    .edit({
      components: [buildBirthdayCornerBox(bData)],
      flags: V2,
      allowedMentions: NO_PING,
    })
    .catch(() => {});
}

async function runDailyBirthdayRoutine() {
  const bData = loadBirthdayData();
  if (!bData.config?.channelId) return;

  const today = getMalaysiaDateParts();
  const channel = await client.channels.fetch(bData.config.channelId).catch(() => null);
  if (!channel?.guild) return;

  const guild = channel.guild;
  const birthdayRole = guild.roles.cache.find((r) => r.name.toLowerCase().includes(BIRTHDAY_ROLE_KEYWORD));
  const partyRole = guild.roles.cache.find((r) => r.name.toLowerCase().includes(PARTY_ROLE_KEYWORD));

  const todayBirthdayIds = new Set();
  for (const [userId, b] of Object.entries(bData.users || {})) {
    if (b.day === today.day && b.month === today.month) {
      todayBirthdayIds.add(userId);
    }
  }

  if (birthdayRole) {
    await guild.members.fetch().catch(() => {});
    for (const [memberId, member] of birthdayRole.members) {
      if (!todayBirthdayIds.has(memberId)) {
        await member.roles.remove(birthdayRole).catch(() => {});
      }
    }
  }

  let changed = false;
  for (const userId of todayBirthdayIds) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;

    if (birthdayRole && !member.roles.cache.has(birthdayRole.id)) {
      await member.roles.add(birthdayRole).catch(() => {});
    }

    const userRecord = bData.users[userId];
    if (userRecord && userRecord.celebratedYear !== today.year) {
      try {
        const threadName = `🎂・Happy Birthday ${member.user.username}!`.slice(0, 100);
        const thread = await channel.threads.create({
          name: threadName,
          autoArchiveDuration: 1440,
          type: ChannelType.PublicThread,
          reason: `Birthday celebration for ${member.user.tag}`,
        });

        const pingLine = partyRole ? `<@&${partyRole.id}> <@${userId}>` : `<@${userId}>`;
        const wishBox = new ContainerBuilder()
          .addTextDisplayComponents(
            txt(
              [
                "### ˚₊‧꒰ა <a:PinkCrown:1549417235393683681> 𝐻𝐴𝑃𝑃𝑌 𝐵𝐼𝑅𝑇𝐻𝐷𝐴𝑌! <a:PinkCrown:1549417235393683681> ໒꒱‧₊˚",
                `<a:a_sparkle7:1563423627263877200> Wishing the happiest birthday to <@${userId}>! Drop your sweetest wishes below! 🎂🌸`,
              ].join(NL)
            )
          )
          .addSeparatorComponents(sep())
          .addTextDisplayComponents(
            txt("-# ⋆˚࿔ <:pinkbow:1563423584624582779> PlatoMy Birthday Celebration <:HrtPinkYellow:1549418195516129291> 𝜗𝜚˚⋆")
          );

        await thread.send({
          components: [txt(pingLine), wishBox],
          flags: V2,
          allowedMentions: {
            users: [userId],
            roles: partyRole ? [partyRole.id] : [],
          },
        });

        userRecord.celebratedYear = today.year;
        changed = true;
      } catch (err) {
        console.error(`Gagal buka thread birthday untuk ${userId}:`, err);
      }
    }
  }

  if (changed) saveBirthdayData(bData);
  await refreshBirthdayBoard(bData);
}

// ================= WALLET =================
const BANK_FOOTER = "⋆˚࿔ 🎀 PlatoMy Bank 𝜗𝜚˚⋆";
const bankFooter = () => `${BANK_FOOTER} • Today at ${getMalaysiaTime()}`;

function balanceLines(w) {
  return [
    `╰┈➤ 🪙 Plato Coins: ${w.coins.toLocaleString()}`,
    `╰┈➤ 💠 Pips: ${w.pips.toLocaleString()}`,
    `╰┈➤ 🌸 Total Sponsor: ${w.sponsorTotal.toLocaleString()}`,
  ].join(NL);
}

function walletBox(w) {
  return new ContainerBuilder()
    .addTextDisplayComponents(txt("# ˚₊‧꒰ാ 👛 𝑃𝐿𝐴𝑇𝑂𝑀𝑌 𝑊𝐴𝐿𝐿𝐸𝑇 ໒꒱‧₊˚"))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(balanceLines(w)))
    .addTextDisplayComponents(txt(`-# ${bankFooter()}`));
}

function walletLogBox({ actionTitle, target, admin, details, reason, w }) {
  const logBody = [
    `╰┈➤ 📌 **Action:** ${actionTitle}`,
    `╰┈➤ 👤 **Target:** ${target} (\`${target.id}\`)`,
    `╰┈➤ 🛡️ **Admin:** ${admin}`,
    `╰┈➤ 📝 **Details:** ${details}`,
    `╰┈➤ 💬 **Reason:** ${reason}`,
  ].join(NL);

  return new ContainerBuilder()
    .addTextDisplayComponents(txt("# ˚₊‧꒰ാ 👛 𝑊𝐴𝐿𝐿𝐸𝑇 𝐿𝑂𝐺 ໒꒱‧₊˚"))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(logBody))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(`**Current Balances**${NL}${balanceLines(w)}`))
    .addTextDisplayComponents(txt(`-# ${bankFooter()}`));
}

// ================= TRADING =================
function buildTradePanel(listRef) {
  const btn = new ButtonBuilder()
    .setCustomId("open_trading_modal")
    .setLabel("Trading Ticket")
    .setEmoji("🤝")
    .setStyle(ButtonStyle.Secondary);

  const box = new ContainerBuilder();
  const mediaUrls = TRADE_MEDIA_URLS.filter(isUrl).slice(0, 10);
  for (const u of mediaUrls) {
    box.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(u.trim()))
    );
  }

  const panelBody = [
    "╰┈➤ Click the **Trading Ticket** button below to look for or trade your Plato items.",
    `╰┈➤ Your trade request will be posted automatically in ${listRef}.`,
  ].join(NL);

  return box
    .addTextDisplayComponents(txt("# ˚₊‧꒰ാ 🛍️ 𝑃𝐿𝐴𝑇𝑂𝑀𝑌 𝑇𝑅𝐴𝐷𝐼𝑁𝐺 ໒꒱‧₊˚"))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(panelBody))
    .addActionRowComponents(new ActionRowBuilder().addComponents(btn));
}

function buildTradeList({ requesterId, details, accepterId = null }) {
  const accepted = Boolean(accepterId);
  const btn = new ButtonBuilder()
    .setCustomId(`accept_trade:${requesterId}`)
    .setLabel(accepted ? "Trade Accepted" : "Accept Trade")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(accepted);

  const listBody = [
    `╰┈➤ **Requester:** <@${requesterId}>`,
    `╰┈➤ **Item Details:** ${details}`,
  ].join(NL);

  const box = new ContainerBuilder()
    .addTextDisplayComponents(txt("# ˚₊‧꒰ാ 📋 𝑇𝑅𝐴𝐷𝐼𝑁𝐺 𝐿𝐼𝑆𝑇 ໒꒱‧₊˚"))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(listBody))
    .addSeparatorComponents(sep());

  if (accepted) {
    box.addTextDisplayComponents(txt(`✅ **Accepted by:** <@${accepterId}>`));
  } else {
    box.addTextDisplayComponents(
      txt("╰┈➤ Click **Accept Trade** if you are interested in trading with the requester.")
    );
  }
  return box.addActionRowComponents(new ActionRowBuilder().addComponents(btn));
}

function buildTradeChatBox({ requesterId, accepterId, details }) {
  const btn = new ButtonBuilder()
    .setCustomId(`close_trade:${accepterId}`)
    .setLabel("Close Trade")
    .setEmoji("🔒")
    .setStyle(ButtonStyle.Secondary);

  const chatBody = [
    `╰┈➤ **Requester:** <@${requesterId}>`,
    `╰┈➤ **Accepted by:** <@${accepterId}>`,
    `╰┈➤ **Item Details:** ${details}`,
  ].join(NL);

  return new ContainerBuilder()
    .addTextDisplayComponents(txt("# ˚₊‧꒰ാ 🤝 𝑇𝑅𝐴𝐷𝐸 𝐶𝐻𝐴𝑇 ໒꒱‧₊˚"))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(chatBody))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      txt(`╰┈➤ Discuss and complete your trade here. Only <@${accepterId}> (or an admin) can close this channel.`)
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(btn));
}

async function createTradeChannel(guild, requesterId, accepter, details) {
  try {
    const safe = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20) || "user";
    const requesterMember = await guild.members.fetch(requesterId).catch(() => null);
    const requesterName = requesterMember?.user?.username;

    const memberPerms = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.EmbedLinks,
    ];

    const overwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: accepter.id, allow: memberPerms },
      {
        id: guild.client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
        ],
      },
    ];
    if (requesterMember) overwrites.push({ id: requesterId, allow: memberPerms });

    const channel = await guild.channels.create({
      name: `🤝・trade-${safe(requesterName)}-${safe(accepter.username)}`,
      type: ChannelType.GuildText,
      parent: TRADE_CATEGORY_ID,
      topic: `Trade chat • Accepted by ${accepter.username}`,
      permissionOverwrites: overwrites,
      reason: `Trade accepted by ${accepter.tag}`,
    });

    await channel.send({
      components: [buildTradeChatBox({ requesterId, accepterId: accepter.id, details })],
      flags: V2,
      allowedMentions: { users: [requesterId, accepter.id] },
    });

    return channel;
  } catch (err) {
    console.error("Gagal cipta channel trade:", err);
    return null;
  }
}

// ================= RUMBLE (battle royale) =================
const KILL_SCENES = [
  (a, b) => `🔫 ${a} shot ${b} right in the chest!`,
  (a, b) => `💥 ${a} blasted ${b} with a shotgun!`,
  (a, b) => `🏹 ${a} sniped ${b} from across the arena!`,
  (a, b) => `🗡️ ${a} stabbed ${b} in the back!`,
  (a, b) => `💣 ${a} tossed a grenade at ${b}!`,
  (a, b) => `🪓 ${a} chopped ${b} down with an axe!`,
  (a, b) => `🧨 ${a} blew up ${b} with dynamite!`,
  (a, b) => `🥊 ${a} knocked out ${b} with one punch!`,
  (a, b) => `🍌 ${b} slipped on a banana peel thrown by ${a}!`,
  (a, b) => `⚡ ${a} zapped ${b} with a lightning bolt!`,
  (a, b) => `🕳️ ${a} pushed ${b} into a trap pit!`,
  (a, b) => `☄️ ${a} called a meteor down on ${b}!`,
  (a, b) => `🔥 ${a} torched ${b} with a flamethrower!`,
];
const SOLO_SCENES = [
  (b) => `🌋 ${b} fell into the lava!`,
  (b) => `🦈 ${b} got eaten by a shark!`,
  (b) => `💨 ${b} ran into a poison cloud!`,
  (b) => `🪤 ${b} stepped on a hidden mine!`,
  (b) => `🧊 ${b} froze solid in the storm!`,
];

function rumbleLabel(currencyType) {
  return currencyType === "coins" ? "🪙 Plato Coins" : "💠 Pips";
}

function rumbleOpenBox(game) {
  const joinBtn = new ButtonBuilder()
    .setCustomId(`join_rumble_${game.currencyType}_${game.totalPrize}`)
    .setLabel("🎟️ Join Rumble")
    .setStyle(ButtonStyle.Secondary);

  const body = [
    `🎁 **Total Prize:** ${game.totalPrize.toLocaleString()} ${rumbleLabel(game.currencyType)}`,
    `🏆 **Winners:** ${game.winnersCount}`,
    `⏳ **Ends:** <t:${game.endTimeSeconds}:R>`,
    "",
    `👥 **Players:** ${game.participants.length}`,
  ].join(NL);

  return info("🌸・PlatoMy Rumble Arena", body).addActionRowComponents(
    new ActionRowBuilder().addComponents(joinBtn)
  );
}

async function createRumble(channel, currencyType, totalPrize, durationMins, winnersCount = 1) {
  const game = {
    currencyType,
    totalPrize,
    winnersCount: Math.max(1, Math.floor(Number(winnersCount)) || 1),
    participants: [],
    ended: false,
    endTimeSeconds: Math.floor((Date.now() + durationMins * 60 * 1000) / 1000),
  };

  const msg = await channel.send({ components: [rumbleOpenBox(game)], flags: V2 });
  rumbleMap.set(msg.id, game);
  setTimeout(() => runRumbleBattle(channel, msg.id), durationMins * 60 * 1000);
  return msg;
}

async function runRumbleBattle(channel, msgId) {
  const game = rumbleMap.get(msgId);
  if (!game || game.ended) return;
  game.ended = true;

  const label = rumbleLabel(game.currencyType);
  const prizeText = `${game.totalPrize.toLocaleString()} ${label}`;
  const winnersCount = game.winnersCount || 1;
  const msg = await channel.messages.fetch(msgId).catch(() => null);
  const edit = (box) => (msg ? msg.edit({ components: [box], flags: V2 }).catch(() => {}) : null);

  const players = [...game.participants];

  if (players.length === 0) {
    await edit(
      info(
        "🌸・Rumble Ended",
        [`🎁 **Prize:** ${prizeText}`, "🏆 **Winners:** No participants", "", "👥 **Players:** 0"].join(NL)
      )
    );
    await channel.send("😢 Rumble ended with no participants.").catch(() => {});
    return;
  }

  let alive = [...players];

  if (alive.length > winnersCount) {
    const startLines = [
      "🔥 **The battle begins!**",
      `${players.length} players have entered the arena...`,
    ];
    if (winnersCount > 1) startLines.push(`🏆 Last **${winnersCount}** standing win!`);

    await edit(info("🌸・PlatoMy Rumble Arena", startLines.join(NL)));
    await sleep(5000);

    let round = 0;
    while (alive.length > winnersCount) {
      round++;
      const kills = Math.max(1, Math.min(alive.length - winnersCount, Math.ceil(alive.length * 0.35)));
      const lines = [];

      for (let i = 0; i < kills; i++) {
        const [victim] = alive.splice(Math.floor(Math.random() * alive.length), 1);
        const v = `<@${victim}>`;
        if (alive.length > 0 && Math.random() > 0.15) {
          const killer = `<@${pick(alive)}>`;
          lines.push(pick(KILL_SCENES)(killer, v));
        } else {
          lines.push(pick(SOLO_SCENES)(v));
        }
      }

      const shown = lines.slice(0, 8);
      if (lines.length > shown.length) shown.push(`...and ${lines.length - shown.length} more fell in the chaos.`);

      const roundBody = [
        `⚔️ **Round ${round}**`,
        "",
        shown.join(NL),
        "",
        `👥 **Players left:** ${alive.length}`,
      ].join(NL);

      await edit(info("🌸・PlatoMy Rumble Arena", roundBody));
      if (alive.length > winnersCount) await sleep(5000);
    }
    await sleep(2000);
  }

  const winners = alive;
  const share = Math.floor(game.totalPrize / winners.length);
  const remainder = game.totalPrize - share * winners.length;

  winners.forEach((id, i) => {
    const w = getWallet(id);
    const amount = share + (i === 0 ? remainder : 0);
    if (game.currencyType === "coins") w.coins += amount;
    else w.pips += amount;
  });

  const winnerMentions = winners.map((id) => `<@${id}>`).join(", ");
  const shareText =
    winners.length > 1
      ? ` (${share.toLocaleString()} ${label} each${remainder > 0 ? `, +${remainder.toLocaleString()} to <@${winners[0]}>` : ""})`
      : "";

  const endBody = [
    `🎁 **Prize:** ${prizeText}${shareText}`,
    `🏆 **Winner${winners.length > 1 ? "s" : ""}:** ${winnerMentions}`,
    "",
    `👥 **Players:** ${players.length}`,
  ].join(NL);

  await edit(info("🌸・Rumble Ended", endBody));

  if (winners.length === 1) {
    await channel.send(`🏆 <@${winners[0]}> won **${prizeText}** in PlatoMy Rumble!`).catch(() => {});
  } else {
    await channel.send(`🏆 ${winnerMentions} won **${prizeText}** in PlatoMy Rumble!${shareText}`).catch(() => {});
  }
}

// ================= LEADERBOARD & RANK CARD (@napi-rs/canvas) =================
const LEADERBOARD_CONFIG_PATH = "./leaderboard-config.json";

const LEADERBOARD_CATEGORIES = {
  exp: {
    label: "Monthly EXP Leaderboard",
    fancyTitle: "𝑀𝑂𝑁𝑇𝐻𝐿𝑌 𝐿𝐸𝐴𝐷𝐸𝑅𝐵𝑂𝐴𝑅𝐷",
    title: "EXP & LEVELS LEADERBOARD",
    subtitle: "TOP 10 COMMUNITY ACTIVITY RANKINGS",
    field: "exp",
    barLabel: "XP Progress",
    subText: (val) => `${val.toLocaleString()} EXP`,
    badgeText: (val, hasUser) => `LVL ${String(hasUser ? getLevelInfo(val).level : 0).padStart(2, "0")}`,
    progressPct: (val) => getLevelInfo(val).progressPct,
  },
  sponsor: {
    label: "Monthly Sponsor Leaderboard",
    fancyTitle: "𝑆𝑃𝑂𝑁𝑆𝑂𝑅 𝐿𝐸𝐴𝐷𝐸𝑅𝐵𝑂𝐴𝑅𝐷",
    title: "SPONSOR LEADERBOARD",
    subtitle: "TOP 10 COMMUNITY SPONSORS",
    field: "sponsorTotal",
    barLabel: "Contribution",
    subText: (val) => `${val.toLocaleString()} Sponsor`,
    badgeText: (val) => `${val.toLocaleString()}`,
    progressPct: (val, topVal) => (val > 0 ? Math.min(100, Math.round((val / Math.max(1, topVal)) * 100)) : 0),
  },
  coins: {
    label: "Plato Coins Leaderboard",
    fancyTitle: "𝐶𝑂𝐼𝑁𝑆 𝐿𝐸𝐴𝐷𝐸𝑅𝐵𝑂𝐴𝑅𝐷",
    title: "PLATO COINS LEADERBOARD",
    subtitle: "TOP 10 RICHEST COIN HOLDERS",
    field: "coins",
    barLabel: "Coin Share",
    subText: (val) => `${val.toLocaleString()} Coins`,
    badgeText: (val) => `${val.toLocaleString()}`,
    progressPct: (val, topVal) => (val > 0 ? Math.min(100, Math.round((val / Math.max(1, topVal)) * 100)) : 0),
  },
  pips: {
    label: "Pips Leaderboard",
    fancyTitle: "𝑃𝐼𝑃𝑆 𝐿𝐸𝐴𝐷𝐸𝑅𝐵𝑂𝐴𝑅𝐷",
    title: "PIPS LEADERBOARD",
    subtitle: "TOP 10 RICHEST PIPS HOLDERS",
    field: "pips",
    barLabel: "Pips Share",
    subText: (val) => `${val.toLocaleString()} Pips`,
    badgeText: (val) => `${val.toLocaleString()}`,
    progressPct: (val, topVal) => (val > 0 ? Math.min(100, Math.round((val / Math.max(1, topVal)) * 100)) : 0),
  },
};

function loadLeaderboardConfigs() {
  if (!fs.existsSync(LEADERBOARD_CONFIG_PATH)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(LEADERBOARD_CONFIG_PATH, "utf8"));
    if (raw && raw.channelId && raw.messageId) {
      return { exp: { channelId: raw.channelId, messageId: raw.messageId } };
    }
    return raw || {};
  } catch {
    return {};
  }
}

function saveLeaderboardConfigs(configs) {
  fs.writeFileSync(LEADERBOARD_CONFIG_PATH, JSON.stringify(configs, null, 2));
}

function drawRoundRect(ctx, x, y, w, h, r, fill = true, stroke = false) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

async function generateLeaderboardImage(category = "exp") {
  const meta = LEADERBOARD_CATEGORIES[category] || LEADERBOARD_CATEGORIES.exp;
  const width = 680;
  const height = 840;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, "#12121a");
  bgGrad.addColorStop(1, "#09090d");
  ctx.fillStyle = bgGrad;
  drawRoundRect(ctx, 10, 10, width - 20, height - 20, 26, true, false);

  const orb1 = ctx.createRadialGradient(width - 90, 90, 10, width - 90, 90, 260);
  orb1.addColorStop(0, "rgba(249, 150, 177, 0.2)");
  orb1.addColorStop(1, "rgba(249, 150, 177, 0)");
  ctx.fillStyle = orb1;
  ctx.fillRect(10, 10, width - 20, height - 20);

  const orb2 = ctx.createRadialGradient(90, height - 90, 10, 90, height - 90, 240);
  orb2.addColorStop(0, "rgba(249, 150, 177, 0.14)");
  orb2.addColorStop(1, "rgba(249, 150, 177, 0)");
  ctx.fillStyle = orb2;
  ctx.fillRect(10, 10, width - 20, height - 20);

  ctx.strokeStyle = "rgba(249, 150, 177, 0.4)";
  ctx.lineWidth = 2;
  drawRoundRect(ctx, 10, 10, width - 20, height - 20, 26, false, true);

  // Header bersih (tanpa logo/badge atas)
  const titleGrad = ctx.createLinearGradient(width / 2 - 220, 0, width / 2 + 220, 0);
  titleGrad.addColorStop(0, "#FFFFFF");
  titleGrad.addColorStop(0.5, "#F996B1");
  titleGrad.addColorStop(1, "#FFFFFF");
  ctx.fillStyle = titleGrad;
  ctx.font = "900 28px serif";
  ctx.textAlign = "center";
  ctx.fillText(meta.title, width / 2, 62);

  ctx.fillStyle = "rgba(255, 255, 255, 0.58)";
  ctx.font = "bold 11px sans-serif";
  ctx.fillText(meta.subtitle, width / 2, 84);

  const divGrad = ctx.createLinearGradient(60, 0, width - 60, 0);
  divGrad.addColorStop(0, "rgba(249, 150, 177, 0)");
  divGrad.addColorStop(0.5, "rgba(249, 150, 177, 0.55)");
  divGrad.addColorStop(1, "rgba(249, 150, 177, 0)");
  ctx.strokeStyle = divGrad;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(60, 102);
  ctx.lineTo(width - 60, 102);
  ctx.stroke();

  const allWallets = [...wallets.entries()].map(([id, data]) => ({ id, ...data }));
  const sorted = [...allWallets]
    .sort((a, b) => (b[meta.field] || 0) - (a[meta.field] || 0))
    .slice(0, 10);

  while (sorted.length < 10) {
    sorted.push({ id: null, coins: 0, pips: 0, exp: 0, sponsorTotal: 0 });
  }

  const topVal = Math.max(1, sorted[0]?.[meta.field] || 1);

  const fetchPlayerInfo = async (entry) => {
    if (!entry.id) return { username: "Empty Slot", initials: "--", avatarUrl: null };
    try {
      const user = await client.users.fetch(entry.id);
      const name = user.username || "User";
      return {
        username: name,
        initials: name.substring(0, 2).toUpperCase(),
        avatarUrl: user.displayAvatarURL({ extension: "png", size: 64 }),
      };
    } catch {
      return { username: "Unknown", initials: "UN", avatarUrl: null };
    }
  };

  const startX = 36;
  const rowW = width - 72;
  const rowH = 58;
  let y = 122;

  for (let i = 0; i < 10; i++) {
    const rank = i + 1;
    const entry = sorted[i];
    const val = entry[meta.field] || 0;
    const infoData = await fetchPlayerInfo(entry);

    if (rank === 1) {
      const r1Grad = ctx.createLinearGradient(startX, y, startX + rowW, y);
      r1Grad.addColorStop(0, "rgba(249, 150, 177, 0.22)");
      r1Grad.addColorStop(0.65, "rgba(20, 20, 28, 0.78)");
      ctx.fillStyle = r1Grad;
      ctx.strokeStyle = "#F996B1";
      ctx.lineWidth = 1.5;
    } else if (rank <= 3) {
      ctx.fillStyle = "rgba(24, 24, 34, 0.7)";
      ctx.strokeStyle = "rgba(249, 150, 177, 0.35)";
      ctx.lineWidth = 1;
    } else {
      ctx.fillStyle = "rgba(20, 20, 28, 0.55)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
    }
    drawRoundRect(ctx, startX, y, rowW, rowH, 13, true, true);

    ctx.font = rank === 1 ? "900 18px sans-serif" : "bold 15px sans-serif";
    ctx.fillStyle = rank === 1 ? "#F996B1" : rank <= 3 ? "#FFFFFF" : "rgba(255, 255, 255, 0.45)";
    ctx.textAlign = "center";
    ctx.fillText(`#${rank}`, startX + 30, y + 35);

    const avX = startX + 76;
    const avY = y + rowH / 2;
    const avR = 19;

    ctx.beginPath();
    ctx.arc(avX, avY, avR + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "#F996B1";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(avX, avY, avR, 0, Math.PI * 2);
    ctx.fillStyle = "#181822";
    ctx.fill();

    let drewAvatar = false;
    if (infoData.avatarUrl) {
      try {
        const img = await loadImage(infoData.avatarUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(avX, avY, avR, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, avX - avR, avY - avR, avR * 2, avR * 2);
        ctx.restore();
        drewAvatar = true;
      } catch {}
    }

    if (!drewAvatar) {
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(infoData.initials, avX, avY + 4);
    }

    ctx.textAlign = "left";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 15px sans-serif";
    const displayName = infoData.username.length > 15 ? infoData.username.slice(0, 15) + "..." : infoData.username;
    ctx.fillText(displayName, startX + 108, y + 25);

    ctx.fillStyle = "#F996B1";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(meta.subText(val), startX + 108, y + 43);

    const pct = meta.progressPct(val, topVal);
    const barX = startX + 275;
    const barW = 195;
    const barY = y + 32;

    ctx.fillStyle = "rgba(255, 255, 255, 0.62)";
    ctx.font = "11px sans-serif";
    ctx.fillText(meta.barLabel, barX, y + 23);
    ctx.textAlign = "right";
    ctx.fillText(`${pct}%`, barX + barW, y + 23);

    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    drawRoundRect(ctx, barX, barY, barW, 8, 4, true, false);

    if (pct > 0) {
      const fillGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      fillGrad.addColorStop(0, "#F996B1");
      fillGrad.addColorStop(1, "#ffd1df");
      ctx.fillStyle = fillGrad;
      drawRoundRect(ctx, barX, barY, Math.max(8, (barW * pct) / 100), 8, 4, true, false);
    }

    const badgeW = 108;
    const badgeX = startX + rowW - badgeW - 14;
    ctx.fillStyle = "rgba(249, 150, 177, 0.14)";
    ctx.strokeStyle = "rgba(249, 150, 177, 0.45)";
    ctx.lineWidth = 1;
    drawRoundRect(ctx, badgeX, y + 15, badgeW, 28, 8, true, true);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(meta.badgeText(val, Boolean(entry.id)), badgeX + badgeW / 2, y + 33);

    y += rowH + 8;
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("AUTO-UPDATE SETIAP 10 MINIT", 36, height - 24);

  ctx.textAlign = "right";
  ctx.fillStyle = "#F996B1";
  ctx.fillText("POWERED BY PLATOMY", width - 36, height - 24);

  const imageBuffer = canvas.toBuffer("image/png");
  return new AttachmentBuilder(imageBuffer, { name: `leaderboard-${category}.png` });
}

// Container Components V2 tanpa warna untuk setiap Leaderboard
function buildLeaderboardBox(category = "exp", extraNote = null) {
  const meta = LEADERBOARD_CATEGORIES[category] || LEADERBOARD_CATEGORIES.exp;
  const ts = Math.floor(Date.now() / 1000);
  const fileName = `leaderboard-${category}.png`;

  const lines = [
    `### ˚₊‧꒰ა <a:PinkCrown:1549417235393683681> ${meta.fancyTitle} <a:PinkCrown:1549417235393683681> ໒꒱‧₊˚`,
    `<a:a_sparkle7:1563423627263877200> ╰┈➤ **Last Update:** <t:${ts}:R>`,
  ];
  if (extraNote) lines.push(`-# ${extraNote}`);

  return new ContainerBuilder()
    .addTextDisplayComponents(txt(lines.join(NL)))
    .addSeparatorComponents(sep())
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${fileName}`)
      )
    );
}

// ================= RANK CARD GENERATOR (/myrank) =================
async function generateRankCard(user) {
  const w = getWallet(user.id);
  const lvl = getLevelInfo(w.exp);

  const allSorted = [...wallets.entries()]
    .map(([id, data]) => ({ id, exp: data.exp || 0 }))
    .sort((a, b) => b.exp - a.exp);
  const rankIdx = allSorted.findIndex((x) => x.id === user.id);
  const rankNum = rankIdx >= 0 ? rankIdx + 1 : allSorted.length + 1;

  const width = 760;
  const height = 250;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, "#12121a");
  bgGrad.addColorStop(1, "#09090d");
  ctx.fillStyle = bgGrad;
  drawRoundRect(ctx, 8, 8, width - 16, height - 16, 24, true, false);

  const orb1 = ctx.createRadialGradient(width - 80, 60, 10, width - 80, 60, 200);
  orb1.addColorStop(0, "rgba(249, 150, 177, 0.25)");
  orb1.addColorStop(1, "rgba(249, 150, 177, 0)");
  ctx.fillStyle = orb1;
  ctx.fillRect(8, 8, width - 16, height - 16);

  ctx.strokeStyle = "rgba(249, 150, 177, 0.5)";
  ctx.lineWidth = 2;
  drawRoundRect(ctx, 8, 8, width - 16, height - 16, 24, false, true);

  const avX = 105;
  const avY = height / 2;
  const avR = 58;

  ctx.beginPath();
  ctx.arc(avX, avY, avR + 4, 0, Math.PI * 2);
  ctx.fillStyle = "#F996B1";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(avX, avY, avR, 0, Math.PI * 2);
  ctx.fillStyle = "#181822";
  ctx.fill();

  try {
    const avUrl = user.displayAvatarURL({ extension: "png", size: 256 });
    const img = await loadImage(avUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(avX, avY, avR, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, avX - avR, avY - avR, avR * 2, avR * 2);
    ctx.restore();
  } catch {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 30px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText((user.username || "U").substring(0, 2).toUpperCase(), avX, avY + 10);
  }

  const infoX = 195;
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 26px sans-serif";
  const uName = (user.username || "User").length > 18 ? user.username.slice(0, 18) + "..." : user.username;
  ctx.fillText(uName, infoX, 74);

  ctx.fillStyle = "#F996B1";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText(`TIER: ${lvl.tier.toUpperCase()}  |  TOTAL: ${w.exp.toLocaleString()} EXP`, infoX, 100);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText("RANK", width - 165, 58);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 26px sans-serif";
  ctx.fillText(`#${rankNum}`, width - 165, 88);

  ctx.fillStyle = "rgba(249, 150, 177, 0.85)";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText("LEVEL", width - 45, 58);
  ctx.fillStyle = "#F996B1";
  ctx.font = "900 26px sans-serif";
  ctx.fillText(`${lvl.level}/${MAX_LEVEL}`, width - 45, 88);

  const barX = infoX;
  const barW = width - infoX - 45;
  const barY = 152;
  const barH = 18;

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.font = "bold 13px sans-serif";
  const nextText = lvl.isMax
    ? "MAX LEVEL REACHED!"
    : `${lvl.expToNext.toLocaleString()} EXP to Level ${lvl.level + 1}`;
  ctx.fillText(nextText, barX, barY - 12);

  ctx.textAlign = "right";
  ctx.fillStyle = "#F996B1";
  ctx.fillText(
    `${lvl.currentLevelExp.toLocaleString()} / ${lvl.neededForNext.toLocaleString()} EXP (${lvl.progressPct}%)`,
    barX + barW,
    barY - 12
  );

  ctx.fillStyle = "rgba(255, 255, 255, 0.09)";
  drawRoundRect(ctx, barX, barY, barW, barH, 9, true, false);

  if (lvl.progressPct > 0) {
    const fillGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    fillGrad.addColorStop(0, "#F996B1");
    fillGrad.addColorStop(1, "#ffd1df");
    ctx.fillStyle = fillGrad;
    drawRoundRect(ctx, barX, barY, Math.max(18, (barW * lvl.progressPct) / 100), barH, 9, true, false);
  }

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  ctx.font = "bold 11px sans-serif";
  ctx.fillText("PLATOMY RANK SYSTEM", width - 45, height - 26);

  return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "myrank.png" });
}

// --- WEB DASHBOARD & PASSPORT ---
const app = express();
const PORT = process.env.PORT || 8080;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "platomy_y2k_secret_key_123",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

const CLIENT_ID = process.env.CLIENT_ID || "1556578779437072546";
const CLIENT_SECRET = process.env.CLIENT_SECRET || "XIfRq23FWQttp-5E9JSgRLfizc03Io_9";
const CALLBACK_URL = process.env.CALLBACK_URL || "https://platomy-production.up.railway.app/discord/callback";

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(
  new DiscordStrategy(
    {
      clientID: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      callbackURL: CALLBACK_URL,
      scope: ["identify", "guilds"],
    },
    (accessToken, refreshToken, profile, done) => {
      process.nextTick(() => done(null, profile));
    }
  )
);

app.get("/login", passport.authenticate("discord"));
app.get("/discord/callback", passport.authenticate("discord", { failureRedirect: "/" }), (req, res) => {
  res.redirect("/");
});
app.get("/logout", (req, res) => {
  req.logout(() => {
    res.redirect("/");
  });
});

app.get("/logo.jpg", (req, res) => res.sendFile(path.join(__dirname, "public:logo.jpg.jpg")));

registerDashboardApi({ app, client, wallets, getWallet, giveawaysMap, rumbleMap, createRumble });

app.listen(PORT, () => {
  console.log(`Web Dashboard PlatoMy berjalan di port ${PORT}!`);
});

// --- SLASH COMMANDS ---
const commands = [
  new SlashCommandBuilder().setName("wallet").setDescription("Semak baki akaun PlatoMy • Wallet anda! 🏦"),

  new SlashCommandBuilder()
    .setName("myrank")
    .setDescription("Semak kad rank, level & baki EXP ke level seterusnya! 👑")
    .addUserOption((opt) => opt.setName("user").setDescription("Semak rank ahli lain (pilihan)").setRequired(false)),

  new SlashCommandBuilder()
    .setName("admin-wallet")
    .setDescription("Urus baki akaun PlatoMy • Wallet ahli (Admin sahaja)")
    .addStringOption((opt) =>
      opt
        .setName("action")
        .setDescription("Tindakan")
        .setRequired(true)
        .addChoices(
          { name: "Add Sponsor", value: "add_sponsor" },
          { name: "Add Coins", value: "add_coins" },
          { name: "Deduct Coins", value: "deduct_coins" },
          { name: "Add Pips", value: "add_pips" },
          { name: "Deduct Pips", value: "deduct_pips" },
          { name: "Check", value: "check" }
        )
    )
    .addUserOption((opt) => opt.setName("target").setDescription("Ahli / Penaja").setRequired(true))
    .addIntegerOption((opt) => opt.setName("amount").setDescription("Jumlah").setRequired(true))
    .addStringOption((opt) => opt.setName("reason").setDescription("Sebab / Nota").setRequired(false)),

  new SlashCommandBuilder().setName("setup-trading").setDescription("Hantar panel PlatoMy Trading (Admin sahaja)"),

  new SlashCommandBuilder()
    .setName("setup-birthday")
    .setDescription("Hantar panel PlatoMy Birthday Corner di channel ini (Admin sahaja)")
    .addChannelOption((opt) =>
      opt.setName("chat_channel").setDescription("Channel chat untuk ahli hantar ucapan (pilihan)").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("setup-leaderboard")
    .setDescription("Hantar papan Leaderboard mengikut kategori di channel ini (Admin sahaja)")
    .addStringOption((opt) =>
      opt
        .setName("category")
        .setDescription("Pilih kategori leaderboard")
        .setRequired(true)
        .addChoices(
          { name: "✨ EXP & Levels", value: "exp" },
          { name: "🌸 Total Sponsor", value: "sponsor" },
          { name: "🪙 Plato Coins", value: "coins" },
          { name: "💠 Pips", value: "pips" }
        )
    ),

  new SlashCommandBuilder().setName("reset-leaderboard").setDescription("Set semula (reset) semua EXP ahli kepada 0 (Admin sahaja)"),

  new SlashCommandBuilder()
    .setName("embed-builder")
    .setDescription("Cipta custom container interaktif (Admin sahaja)")
    .addChannelOption((opt) => opt.setName("channel").setDescription("Pilih channel").setRequired(true)),

  new SlashCommandBuilder()
    .setName("embed-image")
    .setDescription("Hantar gambar sahaja dengan kod warna Hex (Admin sahaja)")
    .addChannelOption((opt) => opt.setName("channel").setDescription("Pilih channel").setRequired(true))
    .addStringOption((opt) => opt.setName("image_url").setDescription("Link URL gambar").setRequired(true))
    .addStringOption((opt) => opt.setName("color").setDescription("Kod warna Hex (cth: #ffb6c1)").setRequired(false)),

  new SlashCommandBuilder()
    .setName("rumble")
    .setDescription("Mula permainan PlatoMy Rumble (Admin sahaja)")
    .addStringOption((opt) =>
      opt
        .setName("currency")
        .setDescription("Jenis mata wang")
        .setRequired(true)
        .addChoices(
          { name: "🪙 Plato Coins", value: "coins" },
          { name: "💠 Pips", value: "pips" }
        )
    )
    .addIntegerOption((opt) => opt.setName("prize").setDescription("Jumlah Hadiah Utama").setRequired(true).setMinValue(1))
    .addIntegerOption((opt) => opt.setName("duration").setDescription("Tempoh masa (minit)").setRequired(true).setMinValue(1).setMaxValue(10080))
    .addIntegerOption((opt) =>
      opt.setName("winners").setDescription("Berapa ramai pemenang (hadiah dibahagi sama rata, default 1)").setRequired(false).setMinValue(1).setMaxValue(25)
    ),
].map((c) => c.toJSON());

client.once(Events.ClientReady, async (c) => {
  console.log(`Bot telah berjaya log masuk sebagai ${c.user.tag}!`);
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    await rest.put(Routes.applicationCommands(c.user.id), { body: commands });
    console.log("Slash commands berjaya di-register!");
  } catch (error) {
    console.error("Gagal mendaftarkan slash commands:", error);
  }

  // --- AUTO-UPDATE SEMUA CHANNEL LEADERBOARD (Setiap 10 minit) ---
  cron.schedule("*/10 * * * *", async () => {
    const configs = loadLeaderboardConfigs();
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
  });

  // --- AUTO-REMOVE ROLE MURAI YAPPERS BILA 3 HARI TAK AKTIF (Semak setiap 1 jam) ---
  cron.schedule("0 * * * *", async () => {
    const now = Date.now();
    let modified = false;

    for (const [userId, data] of yapperActivity.entries()) {
      if (now - (data.lastActive || 0) >= YAPPER_INACTIVE_MS) {
        try {
          const guild = client.guilds.cache.get(data.guildId);
          if (guild) {
            const yapperRole = guild.roles.cache.find((r) =>
              r.name.toLowerCase().includes(YAPPER_ROLE_KEYWORD)
            );
            if (yapperRole) {
              const member = await guild.members.fetch(userId).catch(() => null);
              if (member && member.roles.cache.has(yapperRole.id)) {
                await member.roles.remove(yapperRole).catch(() => {});
              }
            }
          }
        } catch {}
        yapperActivity.delete(userId);
        modified = true;
      }
    }

    if (modified) scheduleSaveYapperActivity();
  });

  // --- AUTO-REFRESH BIRTHDAY CORNER + ROLE + THREAD HARIAN (12:00 malam waktu Malaysia) ---
  cron.schedule(
    "0 0 * * *",
    async () => {
      try {
        console.log("Menjalankan semakan harian Birthday Corner...");
        await runDailyBirthdayRoutine();
      } catch (err) {
        console.error("Ralat semakan harian Birthday Corner:", err);
      }
    },
    { timezone: "Asia/Kuala_Lumpur" }
  );

  // --- AUTO-RESET EXP BULANAN (Setiap 1 hari bulan jam 12:00 malam waktu Malaysia) ---
  cron.schedule(
    "0 0 1 * *",
    async () => {
      try {
        console.log("Memulakan proses auto-reset EXP bulanan...");
        for (const [, data] of wallets.entries()) {
          data.exp = 0;
        }
        console.log("✅ Semua EXP ahli dalam memori berjaya di-reset ke 0!");

        const configs = loadLeaderboardConfigs();
        const expCfg = configs.exp;
        if (expCfg?.channelId && expCfg?.messageId) {
          const channel = await client.channels.fetch(expCfg.channelId).catch(() => null);
          if (channel) {
            await channel.send(
              "🎉 **Monthly EXP Leaderboard telah tamat! Semua EXP ahli telah diset semula ke 0 untuk bulan baharu. Semoga berjaya!** 🌸"
            );
            const attachment = await generateLeaderboardImage("exp");
            const message = await channel.messages.fetch(expCfg.messageId).catch(() => null);
            if (message) {
              await message.edit({
                components: [buildLeaderboardBox("exp", "Bulan Baharu • Semua EXP telah diset semula ke 0")],
                files: [attachment],
                attachments: [],
                flags: V2,
              });
            }
          }
        }
      } catch (err) {
        console.error("Ralat semasa auto-reset bulanan:", err);
      }
    },
    { timezone: "Asia/Kuala_Lumpur" }
  );
});

// --- MESSAGE CREATE: !wallet, EXP + LEVEL UP + ROLES, & MURAI YAPPERS ---
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  const content = message.content.trim().toLowerCase();

  if (content === "!wallet" || content === "!bank") {
    await message.reply({ components: [walletBox(getWallet(message.author.id))], flags: V2 });
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

    const gain = isLowExpChannel
      ? Math.floor(Math.random() * 4) + 3
      : Math.floor(Math.random() * 11) + 15;

    w.exp += gain;
    const newLvl = getLevelInfo(w.exp).level;

    if (newLvl > oldLvl && message.member) {
      if (newLvl >= 10) {
        syncLevelRoles(message.member, newLvl).catch(() => {});
      }

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

// --- INTERACTIONS ---
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;

      if (name === "wallet") {
        await interaction.reply({ components: [walletBox(getWallet(interaction.user.id))], flags: V2_EPHEMERAL });
        return;
      }

      if (name === "myrank") {
        await interaction.deferReply();
        const target = interaction.options.getUser("user") || interaction.user;
        const card = await generateRankCard(target);
        await interaction.editReply({ files: [card] });
        return;
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
          actionDesc = `Berjaya menambah **${amount.toLocaleString()} Coins** kepada ${targetUser}.`;
        } else if (action === "deduct_coins") {
          targetWallet.coins = Math.max(0, targetWallet.coins - amount);
          actionTitle = "🪙 Plato Coins Deducted";
          actionDesc = `Berjaya menolak **${amount.toLocaleString()} Coins** daripada ${targetUser}.`;
        } else if (action === "add_pips") {
          targetWallet.pips += amount;
          actionTitle = "💠 Pips Added";
          actionDesc = `Berjaya menambah **${amount.toLocaleString()} Pips** kepada ${targetUser}.`;
        } else if (action === "deduct_pips") {
          targetWallet.pips = Math.max(0, targetWallet.pips - amount);
          actionTitle = "💠 Pips Deducted";
          actionDesc = `Berjaya menolak **${amount.toLocaleString()} Pips** daripada ${targetUser}.`;
        } else if (action === "add_sponsor") {
          targetWallet.sponsorTotal += amount;
          actionTitle = "🌸 Total Sponsor Added";
          actionDesc = `Berjaya menambah **${amount.toLocaleString()} Total Sponsor** kepada ${targetUser}.`;
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
                walletLogBox({
                  actionTitle,
                  target: targetUser,
                  admin: interaction.user,
                  details: actionDesc,
                  reason,
                  w: targetWallet,
                }),
              ],
              flags: V2,
              allowedMentions: NO_PING,
            })
            .catch(() => {});
        }
        return;
      }

      if (name === "setup-trading") {
        if (!isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        }
        const listChannel = findChannel(interaction.guild, TRADING_LIST_CHANNEL_NAME);
        const listRef = listChannel ? `<#${listChannel.id}>` : "#🛍️・trading-list";

        await interaction.channel.send({
          components: [buildTradePanel(listRef)],
          flags: V2,
        });
        await interaction.reply({ content: "✅ Trading panel sent!", ephemeral: true });
        return;
      }

      if (name === "setup-birthday") {
        if (!isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });

        const chatChannel = interaction.options.getChannel("chat_channel") || interaction.channel;
        const bData = loadBirthdayData();
        bData.config = {
          channelId: interaction.channel.id,
          chatChannelId: chatChannel.id,
          messageId: null,
        };

        const msg = await interaction.channel.send({
          components: [buildBirthdayCornerBox(bData)],
          flags: V2,
          allowedMentions: NO_PING,
        });

        bData.config.messageId = msg.id;
        saveBirthdayData(bData);

        await runDailyBirthdayRoutine().catch(() => {});

        await interaction.editReply({
          content: `✅ **PlatoMy Birthday Corner** berjaya ditetapkan di <#${interaction.channel.id}>! Ia akan auto-refresh dan auto-buka thread setiap jam 12:00 malam.`,
        });
        return;
      }

      if (name === "setup-leaderboard") {
        if (!isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });

        const category = interaction.options.getString("category");
        const meta = LEADERBOARD_CATEGORIES[category] || LEADERBOARD_CATEGORIES.exp;

        const msg = await interaction.channel.send({
          components: [txt(`📊 **${meta.label} sedang dijana... Sila tunggu sebentar.**`)],
          flags: V2,
        });

        const configs = loadLeaderboardConfigs();
        configs[category] = {
          channelId: interaction.channel.id,
          messageId: msg.id,
        };
        saveLeaderboardConfigs(configs);

        try {
          const attachment = await generateLeaderboardImage(category);
          await msg.edit({
            components: [buildLeaderboardBox(category)],
            files: [attachment],
            attachments: [],
            flags: V2,
          });
          await interaction.editReply({
            content: `✅ **${meta.label}** berjaya ditetapkan di <#${interaction.channel.id}> dalam Container V2 dan akan auto-update setiap 10 minit!`,
          });
        } catch (err) {
          console.error("Leaderboard generation error:", err);
          await interaction.editReply({
            content: `❌ Ralat semasa menjana gambar leaderboard: ${err.message}`,
          });
        }
        return;
      }

      if (name === "reset-leaderboard") {
        if (!isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });

        for (const [, data] of wallets.entries()) {
          data.exp = 0;
        }

        const configs = loadLeaderboardConfigs();
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

        await interaction.editReply({
          content: "✅ Berjaya mereset semua EXP ahli kepada 0 dan mengemaskini paparan EXP Leaderboard!",
        });
        return;
      }

      if (name === "embed-builder") {
        if (!isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        }
        const targetChannel = interaction.options.getChannel("channel");

        const modal = new ModalBuilder()
          .setCustomId(`embed_builder:${targetChannel.id}`)
          .setTitle("🎨 PlatoMy Container Builder");

        const titleInput = new TextInputBuilder()
          .setCustomId("eb_title")
          .setLabel("Tajuk (pilihan)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(256);
        const descInput = new TextInputBuilder()
          .setCustomId("eb_desc")
          .setLabel("Mesej / Penerangan")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(3500);
        const colorInput = new TextInputBuilder()
          .setCustomId("eb_color")
          .setLabel("Warna Hex (pilihan, cth: #ff69b4)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(7)
          .setPlaceholder("#ff69b4");
        const imageInput = new TextInputBuilder()
          .setCustomId("eb_image")
          .setLabel("URL gambar (pilihan)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(500)
          .setPlaceholder("https://...");

        modal.addComponents(
          new ActionRowBuilder().addComponents(titleInput),
          new ActionRowBuilder().addComponents(descInput),
          new ActionRowBuilder().addComponents(colorInput),
          new ActionRowBuilder().addComponents(imageInput)
        );
        await interaction.showModal(modal);
        return;
      }

      if (name === "embed-image") {
        if (!isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        }
        const targetChannel = interaction.options.getChannel("channel");
        const imageUrl = interaction.options.getString("image_url");
        const colorInput = interaction.options.getString("color");

        if (!isUrl(imageUrl)) {
          return interaction.reply({ content: "❌ Link gambar tidak sah. Mesti bermula dengan https://", ephemeral: true });
        }

        const imageBox = new ContainerBuilder();
        const ac = accent(colorInput);
        if (ac !== null) imageBox.setAccentColor(ac);
        imageBox.addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl.trim()))
        );

        await targetChannel.send({ components: [imageBox], flags: V2 });
        await interaction.reply({ content: "✅ Gambar berjaya dihantar!", ephemeral: true });
        return;
      }

      if (name === "rumble") {
        if (!isAdmin(interaction)) {
          return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
        }
        const currencyType = interaction.options.getString("currency");
        const totalPrize = interaction.options.getInteger("prize");
        const durationMins = interaction.options.getInteger("duration");
        const winnersCount = interaction.options.getInteger("winners") ?? 1;

        if (totalPrize < winnersCount) {
          return interaction.reply({
            content: "❌ Hadiah mesti sekurang-kurangnya sama dengan bilangan pemenang.",
            ephemeral: true,
          });
        }

        await createRumble(interaction.channel, currencyType, totalPrize, durationMins, winnersCount);
        await interaction.reply({ content: "✅ PlatoMy Rumble berjaya dimulakan!", ephemeral: true });
        return;
      }
    }

    // ===== BUTANG =====
    if (interaction.isButton()) {
      const id = interaction.customId;

      if (id === "open_birthday_modal") {
        const modal = new ModalBuilder()
          .setCustomId("birthday_modal")
          .setTitle("🎂 Register Your Birthday");

        const dayInput = new TextInputBuilder()
          .setCustomId("bday_day")
          .setLabel("Day (1 - 31)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(2)
          .setPlaceholder("cth: 20");

        const monthInput = new TextInputBuilder()
          .setCustomId("bday_month")
          .setLabel("Month (1 - 12)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(2)
          .setPlaceholder("cth: 11");

        modal.addComponents(
          new ActionRowBuilder().addComponents(dayInput),
          new ActionRowBuilder().addComponents(monthInput)
        );
        await interaction.showModal(modal);
        return;
      }

      if (id.startsWith("join_rumble_")) {
        await interaction.deferReply({ ephemeral: true });
        const game = rumbleMap.get(interaction.message.id);
        if (!game || game.ended) return interaction.editReply({ content: "❌ This rumble has ended." });
        if (game.participants.includes(interaction.user.id)) {
          return interaction.editReply({ content: "⚠️ You've already joined!" });
        }
        game.participants.push(interaction.user.id);

        await interaction.message.edit({ components: [rumbleOpenBox(game)], flags: V2 }).catch(() => {});
        await interaction.editReply({ content: "✅ Successfully joined PlatoMy Rumble!" });
        return;
      }

      if (id === "open_trading_modal") {
        const modal = new ModalBuilder().setCustomId("trading_modal").setTitle("🛍️ PlatoMy Trading");
        const itemInput = new TextInputBuilder()
          .setCustomId("trading_text")
          .setLabel("Item details")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000);
        modal.addComponents(new ActionRowBuilder().addComponents(itemInput));
        await interaction.showModal(modal);
        return;
      }

      if (id.startsWith("accept_trade:")) {
        const requesterId = id.split(":")[1];
        const hasTradeRole = interaction.member?.roles?.cache?.some((r) =>
          r.name.toLowerCase().includes(TRADE_ROLE_NAME)
        );

        if (!hasTradeRole) {
          return interaction.reply({ content: "❌ You need the Trade role to accept trades.", ephemeral: true });
        }
        if (interaction.user.id === requesterId) {
          return interaction.reply({ content: "⚠️ You can't accept your own trade.", ephemeral: true });
        }
        if (acceptedTrades.has(interaction.message.id)) {
          return interaction.reply({ content: "❌ This trade has already been accepted.", ephemeral: true });
        }
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
          await interaction
            .followUp({
              content: "❌ I couldn't create the trade channel. Please check the bot's permissions on the trade category.",
              ephemeral: true,
            })
            .catch(() => {});
          await interaction.channel
            .send(
              `🤝 <@${requesterId}>, your trade was accepted by ${interaction.user}. Please contact each other to complete the trade!`
            )
            .catch(() => {});
        }

        const logChannel = findChannel(interaction.guild, TRADING_LOG_CHANNEL_NAME);
        if (logChannel) {
          const logLines = [
            `📥 **Requester:** <@${requesterId}> (\`${requesterId}\`)`,
            `🤝 **Accepted by:** ${interaction.user} (\`${interaction.user.id}\`)`,
          ];
          if (tradeChannel) logLines.push(`📍 **Trade Channel:** ${tradeChannel}`);
          logLines.push("", "📝 **Item:**", item);

          await logChannel
            .send({
              components: [
                info("🛍️ Trading Log: Trade Accepted", logLines.join(NL), `Trading Log • Today at ${getMalaysiaTime()}`),
              ],
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
          return interaction.reply({
            content: "❌ Only the person who accepted this trade can close this channel.",
            ephemeral: true,
          });
        }

        const channelName = interaction.channel.name;
        await interaction.reply({
          content: `🔒 Trade closed by ${interaction.user}. This channel will be deleted in 5 seconds...`,
          allowedMentions: NO_PING,
        });

        const logChannel = findChannel(interaction.guild, TRADING_LOG_CHANNEL_NAME);
        if (logChannel) {
          const closeLines = [
            `🔒 **Closed by:** ${interaction.user} (\`${interaction.user.id}\`)`,
            `🤝 **Accepted by:** <@${accepterId}>`,
            `📍 **Channel:** ${channelName}`,
          ].join(NL);

          await logChannel
            .send({
              components: [
                info("🛍️ Trading Log: Trade Closed", closeLines, `Trading Log • Today at ${getMalaysiaTime()}`),
              ],
              flags: V2,
              allowedMentions: NO_PING,
            })
            .catch(() => {});
        }

        await sleep(5000);
        await interaction.channel.delete(`Trade closed by ${interaction.user.tag}`).catch((e) => {
          console.error("Gagal padam channel trade:", e);
        });
        return;
      }
    }

    // ===== MODAL =====
    if (interaction.isModalSubmit()) {
      if (interaction.customId === "birthday_modal") {
        const day = parseInt(interaction.fields.getTextInputValue("bday_day").trim(), 10);
        const month = parseInt(interaction.fields.getTextInputValue("bday_month").trim(), 10);

        const maxDaysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (isNaN(month) || month < 1 || month > 12 || isNaN(day) || day < 1 || day > maxDaysInMonth[month - 1]) {
          return interaction.reply({
            content: "❌ Tarikh tidak sah! Sila masukkan Day (1–31) dan Month (1–12) yang betul.",
            ephemeral: true,
          });
        }

        const bData = loadBirthdayData();
        const prev = bData.users[interaction.user.id];
        bData.users[interaction.user.id] = {
          day,
          month,
          celebratedYear: prev?.day === day && prev?.month === month ? prev.celebratedYear : null,
        };
        saveBirthdayData(bData);

        await interaction.reply({
          content: `🎂 Hari lahir anda telah didaftarkan pada **${formatDayMonth(day, month)}**!`,
          ephemeral: true,
        });

        await runDailyBirthdayRoutine().catch(() => refreshBirthdayBoard(bData));
        return;
      }

      if (interaction.customId === "trading_modal") {
        const details = interaction.fields.getTextInputValue("trading_text").trim();
        if (!details) {
          return interaction.reply({ content: "❌ Please fill in the item details.", ephemeral: true });
        }

        const listChannel = findChannel(interaction.guild, TRADING_LIST_CHANNEL_NAME);
        if (!listChannel) {
          return interaction.reply({ content: "❌ The trading-list channel was not found.", ephemeral: true });
        }

        const traderRole = interaction.guild.roles.cache.find((r) => r.name.toLowerCase().includes(TRADER_ROLE_NAME));

        const sent = await listChannel
          .send({
            components: [
              ...(traderRole ? [txt(`<@&${traderRole.id}>`)] : []),
              buildTradeList({ requesterId: interaction.user.id, details }),
            ],
            flags: V2,
            allowedMentions: traderRole ? { roles: [traderRole.id] } : NO_PING,
          })
          .catch(() => null);
        if (!sent) {
          return interaction.reply({
            content: "❌ The bot can't send to the trading-list channel. Please check the bot's permissions.",
            ephemeral: true,
          });
        }

        await interaction.reply({ content: "✅ Your item details have been sent!", ephemeral: true });

        const logChannel = findChannel(interaction.guild, TRADING_LOG_CHANNEL_NAME);
        if (logChannel) {
          const reqLines = [
            `👤 **Requester:** ${interaction.user} (\`${interaction.user.id}\`)`,
            "",
            "📝 **Item:**",
            details,
          ].join(NL);

          await logChannel
            .send({
              components: [
                info("🛍️ Trading Log: New Request", reqLines, `Trading Log • Today at ${getMalaysiaTime()}`),
              ],
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
        if (!targetChannel || !targetChannel.isTextBased()) {
          return interaction.reply({ content: "❌ Channel tidak dijumpai.", ephemeral: true });
        }

        const title = interaction.fields.getTextInputValue("eb_title").trim();
        const desc = interaction.fields.getTextInputValue("eb_desc").trim();
        const color = interaction.fields.getTextInputValue("eb_color");
        const image = interaction.fields.getTextInputValue("eb_image").trim();

        if (!title && !desc && !isUrl(image)) {
          return interaction.reply({ content: "❌ Isi sekurang-kurangnya tajuk, mesej atau gambar.", ephemeral: true });
        }

        const box = new ContainerBuilder();
        const ac = accent(color);
        if (ac !== null) box.setAccentColor(ac);
        if (title) box.addTextDisplayComponents(txt(`## ${title}`));
        if (title && desc) box.addSeparatorComponents(sep());
        if (desc) box.addTextDisplayComponents(txt(desc));
        if (isUrl(image)) {
          box.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(image))
          );
        }

        await targetChannel.send({ components: [box], flags: V2 });
        await interaction.reply({ content: `✅ Container berjaya dihantar ke <#${targetChannel.id}>!`, ephemeral: true });
        return;
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
