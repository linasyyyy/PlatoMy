import fs from "fs";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
} from "discord.js";
import { NL, WINNER_EMOJI, V2, NO_PING, isUrl, sep, txt } from "./utils.js";

const GIVEAWAY_DATA_PATH = "./giveaways.json";
const GIFT_EMOJI = "<a:pinkgift:1574295305996869702>";
const PARTY_BTN_EMOJI = { id: "1574309471520297050", name: "partymy", animated: true };

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

export function createGiveawaySystem({ client }) {
  const giveawayGames = loadGiveaways();

  function saveGiveaways() {
    try {
      fs.writeFileSync(GIVEAWAY_DATA_PATH, JSON.stringify(Object.fromEntries(giveawayGames.entries())));
    } catch (err) {
      console.error("Gagal simpan giveaways.json:", err);
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

    const msg = await channel.messages.fetch(msgId).catch(() => null);
    if (msg) {
      await msg.edit({ components: [giveawayBox(game)], flags: V2, allowedMentions: NO_PING }).catch(() => {});
    }

    if (game.winners.length === 0) {
      await channel.send("😢 Giveaway tamat tanpa peserta.").catch(() => {});
      return;
    }

    const mentions = game.winners.map((id) => `<@${id}>`).join(", ");
    await channel
      .send({
        content: `${WINNER_EMOJI} Tahniah ${mentions}! Anda memenangi **${game.prize}**!`,
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
      const msg = await channel.messages.fetch(msgId).catch(() => null);
      if (msg) {
        await msg.edit({ components: [giveawayBox(game)], flags: V2, allowedMentions: NO_PING }).catch(() => {});
      }

      const mentions = newWinners.map((id) => `<@${id}>`).join(", ");
      await channel
        .send({
          content: `🔄 ${WINNER_EMOJI} Reroll! Pemenang baharu: ${mentions} — tahniah, anda memenangi **${game.prize}**!`,
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
