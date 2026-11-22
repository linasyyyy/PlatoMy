import fs from "fs";
import { ContainerBuilder, SectionBuilder, ThumbnailBuilder } from "discord.js";
import { NL, sep, txt } from "./utils.js";

// --- TETAPAN LEVEL (MAX 100) & EXP BERPERINGKAT ---
export const MAX_LEVEL = 100;
export const NORMAL_EXP_COOLDOWN_MS = 30 * 1000; // 30 saat (channel biasa)
export const LOW_EXP_COOLDOWN_MS = 60 * 1000;    // 60 saat (channel bot/game)
export const expCooldowns = new Map();

export const LEVEL_ROLES = [
  { level: 100, keyword: "diamond", label: "Diamond" },
  { level: 75, keyword: "ruby", label: "Ruby" },
  { level: 50, keyword: "sapphire", label: "Sapphire" },
  { level: 25, keyword: "emerald", label: "Emerald" },
  { level: 10, keyword: "amethyst", label: "Amethyst" },
];

export function getExpNeededForLevel(lvl) {
  if (lvl <= 10) return 300;
  if (lvl <= 40) return 800;
  if (lvl <= 75) return 1500;
  return 2500;
}

export function getLevelInfo(exp) {
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

export async function syncLevelRoles(member, level) {
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

export function buildLevelUpBox(member, newLevel, totalExp) {
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

// --- MURAI YAPPERS (Aktif Seminggu, Auto-Remove 3 Hari Tak Aktif) ---
const YAPPER_DATA_PATH = "./yapper-activity.json";
const YAPPER_ROLE_KEYWORD = "murai yappers";
const YAPPER_MSG_THRESHOLD = 50;
const YAPPER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const YAPPER_INACTIVE_MS = 3 * 24 * 60 * 60 * 1000;

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

export async function handleYapperActivity(member) {
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

export async function cleanupInactiveYappers(client) {
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
}
