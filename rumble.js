import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { NL, COINS_EMOJI, PIPS_EMOJI, WINNER_EMOJI, PLATO_EMOJI, V2, NO_PING, sleep, pick, info } from "./utils.js";

// --- SCENE MALAM (WEREWOLF PLATO ROLES) ---
const NIGHT_KILL_SCENES = [
  (a, b) => `🐺 **Alpha Wolf** ${a} menyelinap dalam gelap dan membaham ${b}!`,
  (a, b) => `🧛 **Vampire** ${a} menghalang Doctor lalu menyedut tenaga ${b}!`,
  (a, b) => `🧙‍♀️ **Witch** ${a} mencampakkan ramuan beracun tepat ke arah ${b}!`,
  (a, b) => `🧜‍♀️ **Siren** ${a} memukau ${b} dengan nyanyian maut hingga lemas!`,
  (a, b) => `🎭 **Shapeshifter** ${a} menyamar jadi kawan rapat lalu menikam belakang ${b}!`,
  (a, b) => `🌑 **Nightmare** ${a} memerangkap ${b} dalam mimpi ngeri tanpa jalan keluar!`,
  (a, b) => `🔮 **Wolf Shaman** ${a} menyumpah ${b} hingga hilang ditelan kabus malam!`,
  (a, b) => `🗡️ **Assassin** ${a} melancarkan serangan senyap dan menyingkirkan ${b}!`,
  (a, b) => `🏹 **Hunter** ${a} melepaskan tembakan terakhir tepat ke dada ${b}!`,
  (a, b) => `💔 Sumpahan **Lovers**! Kerana ${a} tercedera, ${b} turut rebah patah hati!`,
];

// --- SCENE SIANG (VOTE KAMPUNG & GAME PLATO) ---
const DAY_KILL_SCENES = [
  (a, b) => `⚖️ **Mayor** ${a} guna undi berganda — seluruh kampung sepakat gantung ${b}!`,
  (a, b) => `👁️ **Seer** ${a} dedahkan identiti sebenar ${b}! Kampung terus menghalaunya!`,
  (a, b) => `📢 **Town Crier** ${a} buat kecoh menuduh ${b} — akhirnya ${b} tersingkir!`,
  (a, b) => `🤡 **Jester** ${a} berjaya psiko satu lobby sampai ${b} kena vote keluar!`,
  (a, b) => `👑 **King** ${a} menjatuhkan hukuman buang daerah ke atas ${b}!`,
  (a, b) => `🃏 **Ocho:** ${a} timbun kad **+4** berturut-turut — ${b} terus *rage quit*!`,
  (a, b) => `🎲 **Ludo:** ${a} sepak buah ${b} betul-betul depan garisan tamat!`,
  (a, b) => `🎱 **8-Ball Pool:** ${a} buat *bank shot* padu — ${b} terkedu lalu tersingkir!`,
  (a, b) => `🥤 **Cup Pong:** ${a} lempar bola masuk cawan terakhir, ${b} kalah teruk!`,
  (a, b) => `🎳 **Bowling:** ${a} baling *strike* 3 kali berturut-turut, ${b} tercampak keluar!`,
  (a, b) => `💰 **Bankroll:** ${b} terbeliak kena bayar sewa hotel ${a} sampai muflis!`,
  (a, b) => `👾 **Match Monsters:** ${a} lepaskan *combo* 5x — monster ${b} terus K.O.!`,
  (a, b) => `⛳ **Mini Golf:** ${a} pukul bola langgar ${b} sampai masuk kolam air!`,
  (a, b) => `⚽ **Table Soccer:** ${a} rembat gol roket yang menyingkirkan ${b}!`,
];

// --- SCENE SOLO ---
const SOLO_SCENES = [
  (b) => `🌕 **Lycan** ${b} disalah anggap sebagai Werewolf oleh Seer lalu diusir!`,
  (b) => `🚪 **Harlot** ${b} tersalah ketuk pintu rumah Werewolf pada waktu malam!`,
  (b) => `🕵️ **Thief** ${b} tersalah curi kad beracun lalu rebah serta-merta!`,
  (b) => `💣 **Minesweepers:** ${b} tertekan petak bom tepat pada langkah pertama!`,
  (b) => `🎱 **8-Ball Pool:** ${b} termasuk bola hitam (8-ball) awal sangat — terus kalah!`,
  (b) => `📶 **Plato Lag:** ${b} terputus sambungan (*AFK*) terlalu lama dan ditendang keluar!`,
  (b) => `🌋 ${b} tergelincir masuk ke dalam kawah lava Plato Arena!`,
];

// --- SCENE REVIVE ---
const REVIVE_SCENES = [
  (helper, target) => `✨ **Necromancer** ${helper} menyeru roh ${target} kembali ke arena!`,
  (helper, target) => `💉 **Doctor** ${helper} sempat merawat ${target} pada saat akhir — kembali hidup!`,
  (helper, target) => `🌿 **Druid** ${helper} guna magis hutan untuk membangkitkan semula ${target}!`,
  (helper, target) => `🔮 **Mystic** ${helper} memutar balik masa dan membawa ${target} masuk semula!`,
  (helper, target) => `🎵 **Bard** ${helper} memainkan lagu semangat — ${target} bangkit semula!`,
  (helper, target) => `🎲 **Ludo Luck:** ${target} dapat nombor **6** dan masuk balik ke arena dengan bantuan ${helper}!`,
  (helper, target) => `📶 **Reconnect!** ${target} berjaya masuk balik ke lobby Plato tepat pada masanya!`,
];

// --- SCENE DRAMA / SELAMAT ---
const DRAMA_SCENES = [
  (a, b) => `🛡️ **Knight** ${a} berjaya menepis serangan Werewolf terhadap ${b}!`,
  (a, b) => `💉 **Doctor** ${a} lindungi ${b} malam ini — serangan gagal!`,
  (a, b) => `🔄 **Ocho Reverse!** ${b} pantulkan balik serangan ${a} — dua-dua masih selamat!`,
  (a, b) => `👁️ **Seer** ${a} mengintip ${b} secara senyap... suspek makin mencurigakan!`,
  (a, b) => `🧜‍♀️ **Siren** ${a} cuba memukau ${b}, tapi ${b} sempat tutup telinga!`,
  (a, b) => `🤝 ${a} dan ${b} buat pakatan rahsia di tepi meja **Table Soccer**!`,
  (a, b) => `👑 **Princess** ${a} beri amaran keras kepada ${b} di hadapan orang kampung!`,
];

function rumbleLabel(currencyType) {
  return currencyType === "coins" ? `${COINS_EMOJI} Plato Coins` : `${PIPS_EMOJI} Pips`;
}

export function createRumbleSystem({ getWallet }) {
  const rumbleMap = new Map();

  function rumbleOpenBox(game) {
    const joinBtn = new ButtonBuilder()
      .setCustomId(`join_rumble_${game.currencyType}_${game.totalPrize}`)
      .setLabel("Join Plato Arena")
      .setEmoji({ id: "1549414525038760069" })
      .setStyle(ButtonStyle.Secondary);

    const lines = [
      `🎁 **Total Prize:** ${game.totalPrize.toLocaleString()} ${rumbleLabel(game.currencyType)}`,
      `${WINNER_EMOJI} **Winners:** ${game.winnersCount}`,
    ];

    if (game.bountyTargetId && game.bountyPrize > 0) {
      lines.push(
        `🎯 **Bounty Target:** <@${game.bountyTargetId}> *(+${game.bountyPrize.toLocaleString()} ${rumbleLabel(game.currencyType)} untuk yang menumpaskannya!)*`
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
    const edit = (box) =>
      msg ? msg.edit({ components: [box], flags: V2, allowedMentions: NO_PING }).catch(() => {}) : null;

    const players = [...game.participants];
    if (players.length === 0) {
      await edit(
        info(
          `${PLATO_EMOJI}・Plato Arena Ended`,
          [`🎁 **Prize:** ${prizeText}`, `${WINNER_EMOJI} **Winners:** No participants`, "", "👥 **Players:** 0"].join(NL)
        )
      );
      await channel.send("😢 Plato Arena tamat tanpa peserta.").catch(() => {});
      return;
    }

    let alive = [...players];
    let dead = [];
    let totalRevives = 0;
    let bountyClaimedBy = null;
    const maxRevives = Math.max(4, Math.floor(players.length * 0.75));
    const MAX_ROUNDS_BEFORE_SUDDEN_DEATH = 16;

    if (alive.length > winnersCount) {
      const startLines = [
        `🐺 **Malam pertama bermula di Plato Arena...**`,
        `👥 **${players.length}** pemain telah menerima kad role rahsia dan memasuki arena!`,
        "🎮 Bersedia untuk aksi Werewolf, *revive*, dan kekecohan game Plato!",
      ];
      if (hasBounty) {
        startLines.push(
          `🎯 **BOUNTY AKTIF!** Sesiapa yang menumpaskan <@${game.bountyTargetId}> akan merangkul **${game.bountyPrize.toLocaleString()} ${label}**!`
        );
      }
      if (winnersCount > 1) startLines.push(`${WINNER_EMOJI} Hanya **${winnersCount}** terakhir yang bertahan akan menang!`);
      await edit(info(`${PLATO_EMOJI}・Plato Arena`, startLines.join(NL)));
      await sleep(5000);

      let round = 0;
      while (alive.length > winnersCount) {
        round++;
        const isNight = round % 2 === 1;
        const cycleNum = Math.ceil(round / 2);
        const suddenDeath = round >= MAX_ROUNDS_BEFORE_SUDDEN_DEATH;
        const phaseTitle = suddenDeath
          ? `🔥 **Sudden Death — Round ${round}**`
          : isNight
          ? `🌙 **Night ${cycleNum}** *(Fasa Werewolf)*`
          : `☀️ **Day ${cycleNum}** *(Undian Kampung & Game Plato)*`;

        const lines = [];

        // 1) Aksi Revive
        if (!suddenDeath && dead.length > 0 && totalRevives < maxRevives && Math.random() < 0.55) {
          const reviveCount = dead.length >= 3 && Math.random() < 0.35 ? 2 : 1;
          for (let r = 0; r < reviveCount && dead.length > 0 && totalRevives < maxRevives; r++) {
            const [revived] = dead.splice(Math.floor(Math.random() * dead.length), 1);
            const helper = alive.length > 0 ? `<@${pick(alive)}>` : `<@${revived}>`;
            alive.push(revived);
            totalRevives++;
            lines.push(pick(REVIVE_SCENES)(helper, `<@${revived}>`));
          }
        }

        // 2) Aksi Drama / Selamat
        if (!suddenDeath && alive.length >= 2 && Math.random() < 0.65) {
          const a = pick(alive);
          const others = alive.filter((id) => id !== a);
          if (others.length > 0) {
            lines.push(pick(DRAMA_SCENES)(`<@${a}>`, `<@${pick(others)}>`));
          }
        }

        // 3) Penyingkiran & Semakan Bounty
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
                `🎯 **BOUNTY CLAIMED!** ${killer} menumpaskan sasaran bounty ${v} dan merangkul **${game.bountyPrize.toLocaleString()} ${label}**!`
              );
            }
          } else {
            lines.push(pick(SOLO_SCENES)(v));
          }
        }

        const shown = lines.slice(0, 8);
        if (lines.length > shown.length) {
          shown.push(`...dan ${lines.length - shown.length} lagi kejadian berlaku dalam kekecohan.`);
        }

        const roundBody = [
          phaseTitle,
          "",
          shown.join(NL),
          "",
          `👥 **Masih hidup:** ${alive.length}  •  💀 **Tersingkir:** ${dead.length}`,
        ].join(NL);

        await edit(info(`${PLATO_EMOJI}・Plato Arena`, roundBody));
        if (alive.length > winnersCount) await sleep(6000);
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
          `🎯 **Bounty Hunter:** <@${bountyClaimedBy}> *(+${game.bountyPrize.toLocaleString()} ${label} kerana menumpaskan <@${game.bountyTargetId}>)*`
        );
      } else if (winners.includes(game.bountyTargetId)) {
        endLines.push(`🎯 **Bounty:** <@${game.bountyTargetId}> berjaya bertahan hingga tamat!`);
      } else {
        endLines.push(`🎯 **Bounty:** Tidak dituntut *(sasaran tersingkir secara solo / tidak menyertai)*`);
      }
    }

    endLines.push("", `👥 **Players:** ${players.length}  •  ✨ **Total Revives:** ${totalRevives}`);

    await edit(info(`${PLATO_EMOJI}・Plato Arena Ended`, endLines.join(NL)));

    const announceLines = [
      winners.length === 1
        ? `${WINNER_EMOJI} <@${winners[0]}> memenangi **${prizeText}** di **Plato Arena**!`
        : `${WINNER_EMOJI} ${winnerMentions} memenangi **${prizeText}** di **Plato Arena**!${shareText}`,
    ];
    if (bountyClaimedBy) {
      announceLines.push(
        `🎯 <@${bountyClaimedBy}> turut merangkul hadiah bounty **${game.bountyPrize.toLocaleString()} ${label}** kerana menumpaskan <@${game.bountyTargetId}>!`
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
