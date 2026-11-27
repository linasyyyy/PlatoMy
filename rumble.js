import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { NL, COINS_EMOJI, PIPS_EMOJI, WINNER_EMOJI, PLATO_EMOJI, V2, NO_PING, sleep, pick, info } from "./utils.js";

// --- NIGHT SCENES (WEREWOLF PLATO ROLES) ---
const NIGHT_KILL_SCENES = [
  (a, b) => `🐺 **Alpha Wolf** ${a} crept through the shadows and ambushed ${b}!`,
  (a, b) => `🧛 **Vampire** ${a} blocked the Doctor and drained all of ${b}'s energy!`,
  (a, b) => `🧙‍♀️ **Witch** ${a} hurled a deadly poison potion straight at ${b}!`,
  (a, b) => `🧜‍♀️ **Siren** ${a} lured ${b} with a hypnotic song until they vanished into the deep!`,
  (a, b) => `🎭 **Shapeshifter** ${a} disguised as a close ally and backstabbed ${b}!`,
  (a, b) => `🌑 **Nightmare** ${a} trapped ${b} in an endless nightmare with no escape!`,
  (a, b) => `🔮 **Wolf Shaman** ${a} placed a dark curse on ${b} until they faded into the mist!`,
  (a, b) => `🗡️ **Assassin** ${a} struck silently from behind and eliminated ${b}!`,
  (a, b) => `🏹 **Hunter** ${a} fired a final lethal shot straight through ${b}!`,
  (a, b) => `💔 **Lovers' Curse!** When ${a} took a hit, ${b} collapsed from heartbreak!`,
];

// --- DAY SCENES (VILLAGE VOTE & PLATO GAMES) ---
const DAY_KILL_SCENES = [
  (a, b) => `⚖️ **Mayor** ${a} used their double vote — the entire village voted out ${b}!`,
  (a, b) => `👁️ **Seer** ${a} exposed ${b}'s true identity! The village immediately exiled them!`,
  (a, b) => `📢 **Town Crier** ${a} stirred up chaos accusing ${b} — and got ${b} eliminated!`,
  (a, b) => `🤡 **Jester** ${a} mind-gamed the whole lobby into voting out ${b}!`,
  (a, b) => `👑 **King** ${a} sentenced ${b} to permanent exile from the arena!`,
  (a, b) => `🃏 **Ocho:** ${a} stacked **+4** cards back-to-back — ${b} immediately *rage quit*!`,
  (a, b) => `🎲 **Ludo:** ${a} kicked ${b}'s token right before the finish line!`,
  (a, b) => `🎱 **8-Ball Pool:** ${a} pulled off a filthy *bank shot* — ${b} was stunned and knocked out!`,
  (a, b) => `🥤 **Cup Pong:** ${a} sank the final cup and completely destroyed ${b}!`,
  (a, b) => `🎳 **Bowling:** ${a} rolled 3 strikes in a row and sent ${b} flying out of the lane!`,
  (a, b) => `💰 **Bankroll:** ${b} went totally bankrupt paying rent on ${a}'s hotel!`,
  (a, b) => `👾 **Match Monsters:** ${a} unleashed a 5x combo — ${b}'s monster got K.O.'d!`,
  (a, b) => `⛳ **Mini Golf:** ${a} smashed the ball into ${b} and knocked them into the water hazard!`,
  (a, b) => `⚽ **Table Soccer:** ${a} fired a rocket goal that blasted ${b} out of the arena!`,
];

// --- SOLO SCENES ---
const SOLO_SCENES = [
  (b) => `🌕 **Lycan** ${b} was mistaken for a Werewolf by the Seer and got exiled!`,
  (b) => `🚪 **Harlot** ${b} knocked on the Werewolf's door in the middle of the night!`,
  (b) => `🕵️ **Thief** ${b} accidentally stole a poisoned card and collapsed instantly!`,
  (b) => `💣 **Minesweepers:** ${b} clicked a bomb on their very first move!`,
  (b) => `🎱 **8-Ball Pool:** ${b} potted the black 8-ball way too early — instant loss!`,
  (b) => `📶 **Plato Lag:** ${b} disconnected (*AFK*) for too long and got kicked out!`,
  (b) => `🌋 ${b} slipped and fell straight into the Plato Arena lava pit!`,
];

// --- REVIVE SCENES ---
const REVIVE_SCENES = [
  (helper, target) => `✨ **Necromancer** ${helper} summoned ${target}'s spirit back into the arena!`,
  (helper, target) => `💉 **Doctor** ${helper} healed ${target} just in time — they're back alive!`,
  (helper, target) => `🌿 **Druid** ${helper} used forest magic to resurrect ${target}!`,
  (helper, target) => `🔮 **Mystic** ${helper} rewound time and brought ${target} back into the fight!`,
  (helper, target) => `🎵 **Bard** ${helper} played a revival melody — ${target} rose from the ashes!`,
  (helper, target) => `🎲 **Ludo Luck:** ${target} rolled a **6** and jumped right back in with ${helper}'s help!`,
  (helper, target) => `📶 **Reconnected!** ${target} rejoined the Plato lobby right in the nick of time!`,
];

// --- DRAMA / SAFE SCENES ---
const DRAMA_SCENES = [
  (a, b) => `🛡️ **Knight** ${a} parried a Werewolf ambush aimed at ${b}!`,
  (a, b) => `💉 **Doctor** ${a} protected ${b} tonight — the attack completely failed!`,
  (a, b) => `🔄 **Ocho Reverse!** ${b} reflected ${a}'s attack — both survived!`,
  (a, b) => `👁️ **Seer** ${a} quietly investigated ${b}... looking pretty suspicious!`,
  (a, b) => `🧜‍♀️ **Siren** ${a} tried to charm ${b}, but ${b} covered their ears just in time!`,
  (a, b) => `🤝 ${a} and ${b} formed a secret alliance beside the **Table Soccer** table!`,
  (a, b) => `👑 **Princess** ${a} gave ${b} a stern warning in front of the whole village!`,
  (a, b) => `💨 ${a} lunged at ${b}, but ${b} dodged at the last second!`,
];

function rumbleLabel(currencyType) {
  return currencyType === "coins" ? `${COINS_EMOJI} Plato Coins` : `${PIPS_EMOJI} Pips`;
}

export function createRumbleSystem({ getWallet }) {
  const rumbleMap = new Map();

  function rumbleOpenBox(game) {
    const joinBtn = new ButtonBuilder()
      .setCustomId(`join_rumble_${game.currencyType}_${game.totalPrize}`)
      .setLabel(game.ended ? "Battle Started" : "Join Plato Arena")
      .setEmoji({ id: "1549414525038760069" })
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(game.ended);

    const lines = [
      `🎁 **Total Prize:** ${game.totalPrize.toLocaleString()} ${rumbleLabel(game.currencyType)}`,
      `${WINNER_EMOJI} **Winners:** ${game.winnersCount}`,
    ];

    if (game.bountyTargetId && game.bountyPrize > 0) {
      lines.push(
        `🎯 **Bounty Target:** <@${game.bountyTargetId}> *(+${game.bountyPrize.toLocaleString()} ${rumbleLabel(game.currencyType)} for whoever eliminates them!)*`
      );
    }

    lines.push(`⏳ **Ends:** <t:${game.endTimeSeconds}:R>`, "", `👥 **Players:** ${game.participants.length}`);

    return info(`${PLATO_EMOJI}・Plato Arena`, lines.join(NL)).addActionRowComponents(
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
    const hasBounty = Boolean(game.bountyTargetId && game.bountyPrize > 0);
    const msg = await channel.messages.fetch(msgId).catch(() => null);

    // Disable Join button on the original lobby message
    if (msg) {
      await msg.edit({ components: [rumbleOpenBox(game)], flags: V2, allowedMentions: NO_PING }).catch(() => {});
    }

    const sendScene = (title, body) =>
      channel.send({ components: [info(title, body)], flags: V2, allowedMentions: NO_PING }).catch(() => {});

    const players = [...game.participants];
    if (players.length === 0) {
      await sendScene(
        `${PLATO_EMOJI}・Plato Arena Ended`,
        [`🎁 **Prize:** ${prizeText}`, `${WINNER_EMOJI} **Winners:** No participants`, "", "👥 **Players:** 0"].join(NL)
      );
      return;
    }

    let alive = [...players];
    let dead = [];
    let totalRevives = 0;
    let bountyClaimedBy = null;
    const maxRevives = Math.max(4, Math.floor(players.length * 0.9));
    const MAX_ROUNDS_BEFORE_SUDDEN_DEATH = 14;

    if (alive.length > winnersCount) {
      const startLines = [
        `🐺 **The first night falls over Plato Arena...**`,
        `👥 **${players.length}** players have received their secret roles and entered the arena!`,
        `🎮 Get ready for Werewolf betrayals, epic revives, and Plato game chaos!`,
      ];
      if (hasBounty) {
        startLines.push(
          `🎯 **BOUNTY ACTIVE!** Whoever eliminates <@${game.bountyTargetId}> claims **${game.bountyPrize.toLocaleString()} ${label}**!`
        );
      }
      if (winnersCount > 1) {
        startLines.push(`${WINNER_EMOJI} Only the last **${winnersCount}** survivors will win!`);
      }
      await sendScene(`${PLATO_EMOJI}・Plato Arena Started`, startLines.join(NL));
      await sleep(4500);

      let round = 0;
      while (alive.length > winnersCount) {
        round++;
        const isNight = round % 2 === 1;
        const cycleNum = Math.ceil(round / 2);
        const suddenDeath = round >= MAX_ROUNDS_BEFORE_SUDDEN_DEATH;
        const phaseTitle = suddenDeath
          ? `🔥 **Sudden Death — Round ${round}**`
          : isNight
          ? `🌙 **Round ${round} • Night ${cycleNum}** *(Werewolf Phase)*`
          : `☀️ **Round ${round} • Day ${cycleNum}** *(Village Vote & Plato Games)*`;

        const lines = [];

        // 1) Revive Check (higher chance when few players remain)
        const reviveChance = alive.length <= winnersCount + 1 ? 0.75 : 0.65;
        if (!suddenDeath && dead.length > 0 && totalRevives < maxRevives && Math.random() < reviveChance) {
          const reviveCount = dead.length >= 3 && Math.random() < 0.35 ? 2 : 1;
          for (let r = 0; r < reviveCount && dead.length > 0 && totalRevives < maxRevives; r++) {
            const [revived] = dead.splice(Math.floor(Math.random() * dead.length), 1);
            const helper = alive.length > 0 ? `<@${pick(alive)}>` : `<@${revived}>`;
            alive.push(revived);
            totalRevives++;
            lines.push(pick(REVIVE_SCENES)(helper, `<@${revived}>`));
          }
        }

        // 2) Drama / Safe Action
        const dramaChance = alive.length <= 4 ? 0.8 : 0.65;
        if (!suddenDeath && alive.length >= 2 && Math.random() < dramaChance) {
          const a = pick(alive);
          const others = alive.filter((id) => id !== a);
          if (others.length > 0) {
            lines.push(pick(DRAMA_SCENES)(`<@${a}>`, `<@${pick(others)}>`));
          }
        }

        // 3) Eliminations & Bounty Check (30% chance of a safe/suspense round if drama or revive already happened)
        const skipKillThisRound = !suddenDeath && lines.length > 0 && Math.random() < 0.3;

        if (!skipKillThisRound) {
          const maxCanKill = alive.length - winnersCount;
          const targetKills = suddenDeath
            ? Math.max(1, Math.min(maxCanKill, Math.ceil(alive.length * 0.35)))
            : Math.max(1, Math.min(maxCanKill, Math.ceil(alive.length * 0.2)));

          for (let i = 0; i < targetKills && alive.length > winnersCount; i++) {
            const [victim] = alive.splice(Math.floor(Math.random() * alive.length), 1);
            dead.push(victim);
            const v = `<@${victim}>`;

            if (alive.length > 0 && Math.random() > 0.18) {
              const killerId = pick(alive);
              const killer = `<@${killerId}>`;
              const pool = isNight ? NIGHT_KILL_SCENES : DAY_KILL_SCENES;
              lines.push(pick(pool)(killer, v));

              if (hasBounty && !bountyClaimedBy && victim === game.bountyTargetId) {
                bountyClaimedBy = killerId;
                const kw = getWallet(killerId);
                if (game.currencyType === "coins") kw.coins += game.bountyPrize;
                else kw.pips += game.bountyPrize;
                lines.push(
                  `🎯 **BOUNTY CLAIMED!** ${killer} eliminated the bounty target ${v} and won **${game.bountyPrize.toLocaleString()} ${label}**!`
                );
              }
            } else {
              lines.push(pick(SOLO_SCENES)(v));
            }
          }
        }

        const shown = lines.slice(0, 8);
        if (lines.length > shown.length) {
          shown.push(`...and ${lines.length - shown.length} more chaotic events unfolded.`);
        }

        const roundBody = [
          phaseTitle,
          "",
          shown.join(NL),
          "",
          `👥 **Alive:** ${alive.length}  •  💀 **Eliminated:** ${dead.length}`,
        ].join(NL);

        await sendScene(`${PLATO_EMOJI}・Plato Arena`, roundBody);
        if (alive.length > winnersCount) await sleep(5500);
      }
      await sleep(2500);
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

    const endLines = [
      `🎁 **Prize:** ${prizeText}${shareText}`,
      `${WINNER_EMOJI} **Winner${winners.length > 1 ? "s" : ""}:** ${winnerMentions}`,
    ];

    if (hasBounty) {
      if (bountyClaimedBy) {
        endLines.push(
          `🎯 **Bounty Hunter:** <@${bountyClaimedBy}> *(+${game.bountyPrize.toLocaleString()} ${label} for eliminating <@${game.bountyTargetId}>)*`
        );
      } else if (winners.includes(game.bountyTargetId)) {
        endLines.push(`🎯 **Bounty:** <@${game.bountyTargetId}> survived until the very end!`);
      } else {
        endLines.push(`🎯 **Bounty:** Unclaimed *(target was eliminated solo / did not join)*`);
      }
    }

    endLines.push("", `👥 **Players:** ${players.length}  •  ✨ **Total Revives:** ${totalRevives}`);

    await sendScene(`${PLATO_EMOJI}・Plato Arena Ended`, endLines.join(NL));

    const announceLines = [
      winners.length === 1
        ? `${WINNER_EMOJI} <@${winners[0]}> won **${prizeText}** in **Plato Arena**!`
        : `${WINNER_EMOJI} ${winnerMentions} won **${prizeText}** in **Plato Arena**!${shareText}`,
    ];
    if (bountyClaimedBy) {
      announceLines.push(
        `🎯 <@${bountyClaimedBy}> also claimed the **${game.bountyPrize.toLocaleString()} ${label}** bounty for eliminating <@${game.bountyTargetId}>!`
      );
    }

    await channel.send(announceLines.join(NL)).catch(() => {});
  }

  async function createRumble(
    channel,
    currencyType,
    totalPrize,
    durationMins,
    winnersCount = 1,
    bountyTargetId = null,
    bountyPrize = 0
  ) {
    const game = {
      currencyType,
      totalPrize,
      winnersCount: Math.max(1, Math.floor(Number(winnersCount)) || 1),
      bountyTargetId: bountyTargetId || null,
      bountyPrize: Math.max(0, Math.floor(Number(bountyPrize)) || 0),
      participants: [],
      ended: false,
      endTimeSeconds: Math.floor((Date.now() + durationMins * 60 * 1000) / 1000),
    };

    const msg = await channel.send({
      components: [rumbleOpenBox(game)],
      flags: V2,
      allowedMentions: NO_PING,
    });
    rumbleMap.set(msg.id, game);
    setTimeout(() => runRumbleBattle(channel, msg.id), durationMins * 60 * 1000);
    return msg;
  }

  return { rumbleMap, rumbleOpenBox, createRumble };
}
