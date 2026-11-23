import fs from "fs";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
} from "discord.js";
import { NL, WINNER_EMOJI, V2, NO_PING, isUrl, sleep, sep, txt } from "./utils.js";
import { generateWheelGif } from "./wheelspin.js";

const GIVEAWAY_DATA_PATH = "./giveaways.json";
const GIFT_EMOJI = "<a:pinkgift:1574295305996869702>";
const PARTY_BTN_EMOJI = { id: "1574309471520297050", name: "partymy", animated: true };
const WHEEL_ACCENT = 0xff7eb6;
// Tukar ke "./platomy-logo.PNG" jika anda sudah rename fail di GitHub (Cara 2)
const WHEEL_LOGO_PATH = "./:assets:platomy-logo.png.PNG";

function loadGiveaways() {
  if (!fs.existsSync(GIVEAWAY_DATA_PATH)) return new Map();
  try {
    return new Map(Object.entries(JSON.parse(fs.readFileSync(GIVEAWAY_DATA_PATH, "utf8")) || {}));
  } catch {
    return new Map();
  }
}

function pickRandom(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function wheelBox(prize, roundText = null) {
  const desc = [
    `🎁 **Prize:** ${prize}`,
    roundText || "✨ *Memusing roda... tunggu sebentar!*",
  ].join(NL);

  return new ContainerBuilder()
    .setAccentColor(WHEEL_ACCENT)
    .addTextDisplayComponents(txt("### ˚ · . ꒰ა 🎡 Wheel Spin 🎡 ໒꒱ . · ˚"))
    .addSeparatorComponents(sep())
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL("attachment://wheel-spin.gif")
      )
    )
    .addTextDisplayComponents(txt(desc));
}

function winnerBox(prize, mentions, isReroll = false) {
  const title = isReroll
    ? `### 🔄 ${WINNER_EMOJI} Giveaway Reroll ${WINNER_EMOJI}`
    : `### ${WINNER_EMOJI} Giveaway Winner ${WINNER_EMOJI}`;
  const body = isReroll
    ? `Pemenang baharu: ${mentions}${NL}Tahniah, anda memenangi **${prize}**!`
    : `Tahniah ${mentions}!${NL}Anda memenangi **${prize}**!`;

  return new ContainerBuilder()
    .setAccentColor(WHEEL_ACCENT)
    .addTextDisplayComponents(txt(title))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(body));
}

export function createGiveawaySystem({ client }) {
  const giveawayGames = loadGiveaways();

  function saveGiveaways() {
    try {
      fs.writeFileSync(GIVEAWAY_DATA_PATH, JSON.stringify(Object.fromEntries(giveawayGames.entries())));
    } catch (err) {
      console.error("Gagal simpan giveaways.json:", err);
    }
  }

  async function resolveNames(userIds) {
    const map = new Map();
    for (const id of userIds) {
      const user = await client.users.fetch(id).catch(() => null);
      map.set(id, user ? user.displayName || user.username : id);
    }
    return map;
  }

  async function spinAndSendWheel(channel, poolIds, winnerIds, prize) {
    const nameMap = await resolveNames(poolIds);
    let currentPool = [...poolIds];

    for (let i = 0; i < winnerIds.length; i++) {
      const winnerId = winnerIds[i];
      const names = currentPool.map((id) => nameMap.get(id));
      const winnerName = nameMap.get(winnerId);

      const gifBuffer = await generateWheelGif(names, winnerName, {
        title: "Wheel Spin",
        subtitle: `PlatoMy • ${prize}`,
        logoPath: WHEEL_LOGO_PATH,
      });

      const file = new AttachmentBuilder(gifBuffer, { name: "wheel-spin.gif" });
      const roundText =
        winnerIds.length > 1
          ? `✨ *Pusingan ${i + 1} / ${winnerIds.length}...*`
          : null;

      await channel
        .send({
          components: [wheelBox(prize, roundText)],
          files: [file],
          flags: V2,
          allowedMentions: NO_PING,
        })
        .catch(() => {});

      await sleep(4500);
      currentPool = currentPool.filter((id) => id !== winnerId);
    }
  }

  function giveawayBox(game) {
    const box = new ContainerBuilder();
    if (isUrl(game.imageUrl)) {
      box.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(game.imageUrl.trim()))
      );
    }

    const lines = [
      `${WINNER_EMOJI} **Winners:** ${game.ended && game.winners.length ? game.winners.map((id) => `<@${id}>`).join(", ") : game.winnersCount}`,
    ];
    if (game.requiredRoleId) {
      lines.push(`📌 **Requirement:** <@&${game.requiredRoleId}>`);
    }
    lines.push(
      game.ended ? "⏳ **Status:** Tamat" : `⏳ **Ends:** <t:${game.endTimeSeconds}:R>`,
      `👤 **Host:** <@${game.hostId}>`,
      "",
      `👥 **Entries:** ${game.participants.length}`
    );

    const btn = new ButtonBuilder()
      .setCustomId("join_giveaway")
      .setLabel(game.ended ? "Giveaway Ended" : "Join Giveaway")
      .setEmoji(PARTY_BTN_EMOJI)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(game.ended);

    const title = `## ${GIFT_EMOJI} ${game.prize} ${GIFT_EMOJI}${game.ended ? " (Ended)" : ""}`;

    return box
      .addTextDisplayComponents(txt(title))
      .addSeparatorComponents(sep())
      .addTextDisplayComponents(txt(lines.join(NL)))
      .addActionRowComponents(new ActionRowBuilder().addComponents(btn));
  }

  async function endGiveaway(msgId) {
    const game = giveawayGames.get(msgId);
    if (!game || game.ended) return;

    game.ended = true;
    game.winners = pickRandom(game.participants, game.winnersCount);
    saveGiveaways();

    const channel = await client.channels.fetch(game.channelId).catch(() => null);
    if (!channel) return;

    if (game.winners.length === 0) {
      const msg = await channel.messages.fetch(msgId).catch(() => null);
      if (msg) {
        await msg.edit({ components: [giveawayBox(game)], flags: V2, allowedMentions: NO_PING }).catch(() => {});
      }
      await channel.send("😢 Giveaway tamat tanpa peserta.").catch(() => {});
      return;
    }

    // 1. Pusing roda dahulu dalam Container V2
    await spinAndSendWheel(channel, game.participants, game.winners, game.prize);

    // 2. Kemas kini kotak giveaway asal
    const msg = await channel.messages.fetch(msgId).catch(() => null);
    if (msg) {
      await msg.edit({ components: [giveawayBox(game)], flags: V2, allowedMentions: NO_PING }).catch(() => {});
    }

    // 3. Umum pemenang dalam Container V2
    const mentions = game.winners.map((id) => `<@${id}>`).join(", ");
    await channel
      .send({
        components: [winnerBox(game.prize, mentions, false)],
        flags: V2,
        allowedMentions: { users: game.winners },
      })
      .catch(() => {});
  }

  async function createGiveaway(channel, { prize, durationMins, winnersCount, requiredRoleId, imageUrl, hostId }) {
    const game = {
      channelId: channel.id,
      prize,
      winnersCount,
      requiredRoleId: requiredRoleId || null,
      imageUrl: imageUrl || null,
      hostId,
      participants: [],
      winners: [],
      ended: false,
      endTimeSeconds: Math.floor((Date.now() + durationMins * 60 * 1000) / 1000),
    };

    const msg = await channel.send({
      components: [giveawayBox(game)],
      flags: V2,
      allowedMentions: NO_PING,
    });

    giveawayGames.set(msg.id, game);
    saveGiveaways();
    setTimeout(() => endGiveaway(msg.id), durationMins * 60 * 1000);
    return msg;
  }

  async function rerollGiveaway(msgId, count) {
    const game = giveawayGames.get(msgId);
    if (!game) return { ok: false, error: "Giveaway tidak dijumpai. Pastikan Message ID betul." };
    if (!game.ended) return { ok: false, error: "Giveaway ini belum tamat." };

    const pool = game.participants.filter((id) => !game.winners.includes(id));
    if (pool.length === 0) return { ok: false, error: "Tiada peserta lain untuk di-reroll." };

    const newWinners = pickRandom(pool, count);
    game.winners.push(...newWinners);
    saveGiveaways();

    const channel = await client.channels.fetch(game.channelId).catch(() => null);
    if (channel) {
      await spinAndSendWheel(channel, pool, newWinners, game.prize);

      const msg = await channel.messages.fetch(msgId).catch(() => null);
      if (msg) {
        await msg.edit({ components: [giveawayBox(game)], flags: V2, allowedMentions: NO_PING }).catch(() => {});
      }

      const mentions = newWinners.map((id) => `<@${id}>`).join(", ");
      await channel
        .send({
          components: [winnerBox(game.prize, mentions, true)],
          flags: V2,
          allowedMentions: { users: newWinners },
        })
        .catch(() => {});
    }

    return { ok: true, count: newWinners.length };
  }

  function resumeGiveaways() {
    for (const [msgId, game] of giveawayGames) {
      if (game.ended) continue;
      setTimeout(() => endGiveaway(msgId), Math.max(0, game.endTimeSeconds * 1000 - Date.now()));
    }
  }

  return { giveawayGames, saveGiveaways, giveawayBox, createGiveaway, endGiveaway, rerollGiveaway, resumeGiveaways };
}
