import fs from "fs";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
} from "discord.js";
import { loadBirthdayDataDB, saveBirthdayConfigDB, saveUserBirthdayDB } from "./db.js";
import { NL, NO_PING, V2, getMalaysiaDateParts, sep, txt } from "./utils.js";

const BIRTHDAY_DATA_PATH = "./birthdays.json";
const BIRTHDAY_THREAD_CHANNEL_ID = "1574001176758853683";
const BIRTHDAY_ROLE_KEYWORD = "it's my birthday";
const PARTY_ROLE_KEYWORD = "mypartycrashers";
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function loadBirthdayLocal() {
  if (!fs.existsSync(BIRTHDAY_DATA_PATH)) return { config: null, users: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(BIRTHDAY_DATA_PATH, "utf8"));
    return { config: raw?.config || null, users: raw?.users || {} };
  } catch {
    return { config: null, users: {} };
  }
}

function saveBirthdayLocal(data) {
  try {
    fs.writeFileSync(BIRTHDAY_DATA_PATH, JSON.stringify(data, null, 2));
  } catch {}
}

export async function getBirthdayData() {
  const local = loadBirthdayLocal();
  const db = await loadBirthdayDataDB().catch(() => ({ config: null, users: {} }));
  return {
    config: db.config || local.config || null,
    users: { ...local.users, ...db.users },
  };
}

export async function saveBirthdayConfig(channelId, chatChannelId, messageId) {
  await saveBirthdayConfigDB(channelId, chatChannelId, messageId).catch(() => {});
  const data = await getBirthdayData();
  data.config = { channelId, chatChannelId, messageId };
  saveBirthdayLocal(data);
}

export async function saveUserBirthday(userId, day, month, celebratedYear = null) {
  await saveUserBirthdayDB(userId, day, month, celebratedYear).catch(() => {});
  const data = await getBirthdayData();
  data.users[userId] = { day, month, celebratedYear };
  saveBirthdayLocal(data);
}

export function formatDayMonth(day, month) {
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

export function buildBirthdayCornerBox(data) {
  const today = getMalaysiaDateParts();
  const chatChannelId = data.config?.chatChannelId || BIRTHDAY_THREAD_CHANNEL_ID;
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
    .setLabel("Register / Update Birthday")
    .setEmoji("🎂")
    .setStyle(ButtonStyle.Secondary);

  return new ContainerBuilder()
    .addTextDisplayComponents(txt(headerBody))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(listBody))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      txt("-# ⋆˚࿔ <:pinkbow:1563423584624582779> Click the button below to register or update your birthday! Auto-refreshes daily. 𝜗𝜚˚⋆")
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(registerBtn));
}

export async function refreshBirthdayBoard(client, data = null) {
  const bData = data || (await getBirthdayData());
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

export async function runDailyBirthdayRoutine(client) {
  const bData = await getBirthdayData();
  if (!bData.config?.channelId) return;
  const today = getMalaysiaDateParts();
  const channel = await client.channels.fetch(bData.config.channelId).catch(() => null);
  if (!channel?.guild) return;

  const threadChannel =
    (await client.channels.fetch(BIRTHDAY_THREAD_CHANNEL_ID).catch(() => null)) || channel;

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
        const thread = await threadChannel.threads.create({
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
        await saveUserBirthday(userId, userRecord.day, userRecord.month, today.year);
      } catch (err) {
        console.error(`Gagal buka thread birthday untuk ${userId}:`, err);
      }
    }
  }

  await refreshBirthdayBoard(client, bData);
}
