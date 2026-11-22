import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { NL, COINS_EMOJI, PIPS_EMOJI, WINNER_EMOJI, V2, sleep, pick, info } from "./utils.js";

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
  return currencyType === "coins" ? `${COINS_EMOJI} Plato Coins` : `${PIPS_EMOJI} Pips`;
}

export function createRumbleSystem({ getWallet }) {
  const rumbleMap = new Map();

  function rumbleOpenBox(game) {
    const joinBtn = new ButtonBuilder()
      .setCustomId(`join_rumble_${game.currencyType}_${game.totalPrize}`)
      .setLabel("🎟️ Join Rumble")
      .setStyle(ButtonStyle.Secondary);

    const body = [
      `🎁 **Total Prize:** ${game.totalPrize.toLocaleString()} ${rumbleLabel(game.currencyType)}`,
      `${WINNER_EMOJI} **Winners:** ${game.winnersCount}`,
      `⏳ **Ends:** <t:${game.endTimeSeconds}:R>`,
      "",
      `👥 **Players:** ${game.participants.length}`,
    ].join(NL);

    return info("🌸・PlatoMy Rumble Arena", body).addActionRowComponents(
      new ActionRowBuilder().addComponents(joinBtn)
    );
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
          [`🎁 **Prize:** ${prizeText}`, `${WINNER_EMOJI} **Winners:** No participants`, "", "👥 **Players:** 0"].join(NL)
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
      if (winnersCount > 1) startLines.push(`${WINNER_EMOJI} Last **${winnersCount}** standing win!`);
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
      `${WINNER_EMOJI} **Winner${winners.length > 1 ? "s" : ""}:** ${winnerMentions}`,
      "",
      `👥 **Players:** ${players.length}`,
    ].join(NL);

    await edit(info("🌸・Rumble Ended", endBody));

    if (winners.length === 1) {
      await channel.send(`${WINNER_EMOJI} <@${winners[0]}> won **${prizeText}** in PlatoMy Rumble!`).catch(() => {});
    } else {
      await channel.send(`${WINNER_EMOJI} ${winnerMentions} won **${prizeText}** in PlatoMy Rumble!${shareText}`).catch(() => {});
    }
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

  return { rumbleMap, rumbleOpenBox, createRumble };
}
