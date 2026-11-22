import {
  PermissionFlagsBits,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from "discord.js";

export const NL = String.fromCharCode(10);

// --- TETAPAN BOT ---
export const WALLET_LOG_CHANNEL_NAME = "wallet-log";
export const TRADING_LIST_CHANNEL_NAME = "trading-list";
export const TRADING_LOG_CHANNEL_NAME = "trading-log";
export const TRADE_ROLE_NAME = "trade";
export const TRADER_ROLE_NAME = "trader";
export const TRADE_CATEGORY_ID = "1567527038368223332";
export const LEVEL_UP_CHANNEL_ID = "1552249117621747782";
export const LOW_EXP_CHANNEL_IDS = new Set(["1548984832263065640"]);

export const LOG_CHANNEL_IDS = {
  [WALLET_LOG_CHANNEL_NAME]: "1569585830224461884",
  [TRADING_LOG_CHANNEL_NAME]: "1569585956439461908",
};

// --- EMOJI & KADAR TUKARAN ---
export const PIPS_EMOJI = "<:Pips:1549739800884551710>";
export const COINS_EMOJI = "<:PlatoCoins:1549740441682059385>";
export const WINNER_EMOJI = "<a:trophee:1563423570720329749>";
export const PLATO_EMOJI = "<:Plato:1549414525038760069>";
export const COINS_PER_PIP = 750;

const URL_1 =
  "https://cdn.discordapp.com/attachments/1556946394239991848/" +
  "1562348900705374259/IMG_6986.gif?ex=6aeec24c&is=6aed70cc&" +
  "hm=b4094237e998531634199814f373fd7d8827c9aa8dbb8d0ec626aeb70ca092e5&";
const URL_2 =
  "https://cdn.discordapp.com/attachments/1556946394239991848/" +
  "1567858191537279016/20261105_190812_0000.png?ex=6aee5dfa&" +
  "is=6aed0c7a&hm=703dd68300d271f1087bbbc0b932f49a379a78b33f00cdbef8a9f4ac80fd74c0&";
export const TRADE_MEDIA_URLS = [URL_1, URL_2, URL_1];

// --- UTILITI ---
export const isAdmin = (i) => i.member?.permissions?.has(PermissionFlagsBits.Administrator);
export const isUrl = (u) => /^https?:\/\/\S+$/i.test(String(u || "").trim());
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const findChannel = (guild, part) => {
  const byId = guild.channels.cache.get(LOG_CHANNEL_IDS[part]);
  if (byId?.isTextBased()) return byId;
  return guild.channels.cache.find((c) => c.name.toLowerCase().includes(part) && c.isTextBased());
};

export const accent = (c) => {
  const v = String(c || "").trim().replace("#", "");
  return /^[0-9a-fA-F]{6}$/.test(v) ? parseInt(v, 16) : null;
};

export function getMalaysiaTime() {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function getMalaysiaDateParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 1);
  return { year: get("year"), month: get("month"), day: get("day") };
}

// --- CONTAINER (Components V2) ---
export const V2 = MessageFlags.IsComponentsV2;
export const V2_EPHEMERAL = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
export const NO_PING = { parse: [] };

export const sep = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
export const txt = (content) => new TextDisplayBuilder().setContent(content);

export function info(title, body, footer = null) {
  const box = new ContainerBuilder()
    .addTextDisplayComponents(txt(`## ${title}`))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(body));
  if (footer) box.addTextDisplayComponents(txt(`-# ${footer}`));
  return box;
}

export function collectText(components, out = []) {
  for (const c of components || []) {
    const t = c.content ?? c.data?.content;
    if (typeof t === "string") out.push(t);
    if (c.components) collectText(c.components, out);
  }
  return out;
}
