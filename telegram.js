import { Telegraf, Markup } from "telegraf";
import { NL, sleep } from "./utils.js";

const DEFAULT_ADMINS = ["7268897584", "413778891", "8780849175"];
const adminIds = new Set([
  ...DEFAULT_ADMINS,
  ...(process.env.TELEGRAM_ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
]);

const isTgAdmin = (ctx) => adminIds.has(String(ctx.from?.id));
const tgKey = (id) => `tg_${id}`;
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const mention = (id, name) => `<a href="tg://user?id=${id}">${esc(name)}</a>`;

function formatWallet(w, name) {
  return [
    `🎀 <b>PLATOMY WALLET</b> — ${esc(name)}`,
    `──────────────────`,
    `🪙 Plato Coins: <b>${w.coins.toLocaleString()}</b>`,
    `💠 Pips: <b>${w.pips.toLocaleString()}</b>`,
    `🌸 Sponsor (Monthly): <b>${(w.sponsorMonthly || 0).toLocaleString()}</b>`,
    `🌸 Sponsor (Lifetime): <b>${w.sponsorTotal.toLocaleString()}</b>`,
  ].join(NL);
}

function formatTimeLeft(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) return `${hrs}j ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function buildGiveawayText(game) {
  const lines = [
    `🎁 <b>GIVEAWAY: ${esc(game.prize)}</b>${game.ended ? " (Tamat)" : ""}`,
    `🏆 Winners: <b>${game.winnersCount}</b>`,
    game.ended
      ? `⏳ Status: <b>Tamat</b>`
      : `⏳ Baki Masa: <b>${formatTimeLeft(game.endTime - Date.now())}</b>`,
    `👥 Entries: <b>${game.participants.size}</b>`,
  ];
  if (!game.ended) {
    lines.push(``, `📌 <i>Reply mesej ini dengan <b>ID Plato</b> anda untuk sertai!</i>`);
  }
  return lines.join(NL);
}

function pickRandom(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

export function startTelegramBot({ getWallet, generateWheelGif }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("ℹ️ TELEGRAM_BOT_TOKEN tiada, bot Telegram tidak dimulakan.");
    return;
  }

  const bot = new Telegraf(token);
  const giveaways = new Map(); // msgId -> game
  const spins = new Map();
  const claims = new Map();

  bot.catch((err) => console.error("Ralat Bot Telegram:", err));

  // ================= MENU / HELP =================
  const helpText = [
    `🎀 <b>PlatoMy Bot — Senarai Command</b>`,
    ``,
    `👤 <b>Ahli:</b>`,
    `• /wallet — Semak baki wallet anda`,
    `• /claim <code>Link_Plato Item</code> — Claim hadiah anda`,
    `• /help — Papar panduan command`,
    ``,
    `🛡️ <b>Admin:</b>`,
    `• Reply mesej ahli + /wallet — Semak wallet ahli`,
    `• Reply mesej ahli + /add <code>coins 100</code> — Tambah baki`,
    `• Reply mesej ahli + /deduct <code>pips 50</code> — Tolak baki`,
    `• /giveaway <code>5 1 1000 Coins</code> — Mula giveaway`,
    `• /spin <code>1 Nama Event</code> — Mula Wheel Spin`,
  ].join(NL);

  bot.start((ctx) => ctx.reply(helpText, { parse_mode: "HTML" }));
  bot.help((ctx) => ctx.reply(helpText, { parse_mode: "HTML" }));

  // ================= WALLET =================
  bot.command("wallet", (ctx) => {
    const replied = ctx.message.reply_to_message?.from;
    const target = replied && isTgAdmin(ctx) ? replied : ctx.from;
    const w = getWallet(tgKey(target.id));
    const name = target.first_name || target.username || String(target.id);
    return ctx.reply(formatWallet(w, name), { parse_mode: "HTML" });
  });

  for (const mode of ["add", "deduct"]) {
    bot.command(mode, (ctx) => {
      if (!isTgAdmin(ctx)) return ctx.reply("❌ Hanya Admin boleh ubah baki wallet!");
      const target = ctx.message.reply_to_message?.from;
      if (!target) {
        return ctx.reply(`❌ Reply mesej ahli dengan: /${mode} <coins|pips|sponsor> <jumlah>`);
      }

      const [, currencyRaw, amountRaw] = ctx.message.text.trim().split(/\s+/);
      const currency = (currencyRaw || "").toLowerCase();
      const amount = parseInt(amountRaw, 10);

      if (!["coins", "pips", "sponsor"].includes(currency) || isNaN(amount) || amount <= 0) {
        return ctx.reply(`❌ Format salah. Contoh: /${mode} coins 100`);
      }

      const w = getWallet(tgKey(target.id));
      if (currency === "coins") {
        w.coins = mode === "add" ? w.coins + amount : Math.max(0, w.coins - amount);
      } else if (currency === "pips") {
        w.pips = mode === "add" ? w.pips + amount : Math.max(0, w.pips - amount);
      } else if (currency === "sponsor") {
        w.sponsorTotal = mode === "add" ? w.sponsorTotal + amount : Math.max(0, w.sponsorTotal - amount);
        w.sponsorMonthly =
          mode === "add" ? (w.sponsorMonthly || 0) + amount : Math.max(0, (w.sponsorMonthly || 0) - amount);
      }

      const name = target.first_name || target.username || String(target.id);
      return ctx.reply(
        [
          `✅ Berjaya <b>${mode === "add" ? "tambah" : "tolak"} ${amount.toLocaleString()} ${currency}</b> untuk ${esc(name)}!`,
          ``,
          formatWallet(w, name),
        ].join(NL),
        { parse_mode: "HTML" }
      );
    });
  }

  // ================= CLAIM =================
  bot.command("claim", async (ctx) => {
    const parts = ctx.message.text.trim().split(/\s+/);
    const platoLink = parts[1];
    const item = parts.slice(2).join(" ");

    if (!platoLink || !item || !/^https?:\/\//i.test(platoLink)) {
      return ctx.reply(
        [
          `❌ Format salah! Sila sertakan <b>Link Plato</b> (bermula dengan <code>https://</code>) dan <b>Item</b>.`,
          `Contoh: <code>/claim https://platoapp.com/link/xxx Pink Dice</code>`,
        ].join(NL),
        { parse_mode: "HTML" }
      );
    }

    const id = String(Date.now());
    const claim = {
      id,
      userId: ctx.from.id,
      userName: ctx.from.first_name || ctx.from.username || String(ctx.from.id),
      platoLink,
      item,
      done: false,
    };
    claims.set(id, claim);

    const text = [
      `🎁 <b>PLATOMY CLAIM REQUEST</b>`,
      `──────────────────`,
      `👤 <b>Pemain:</b> ${mention(claim.userId, claim.userName)}`,
      `🔗 <b>Link Plato:</b> ${esc(claim.platoLink)}`,
      `📦 <b>Item:</b> <b>${esc(claim.item)}</b>`,
      `📌 <b>Status:</b> ⏳ Menunggu Admin`,
    ].join(NL);

    await ctx.reply(text, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Selesai", `tg_claim:approve:${id}`),
          Markup.button.callback("❌ Tolak", `tg_claim:reject:${id}`),
        ],
      ]),
    });
  });

  bot.action(/^tg_claim:(approve|reject):(.+)$/, async (ctx) => {
    if (!isTgAdmin(ctx)) {
      return ctx.answerCbQuery("❌ Hanya Admin boleh uruskan claim!", { show_alert: true });
    }

    const [, status, id] = ctx.match;
    const claim = claims.get(id);
    if (!claim || claim.done) {
      return ctx.answerCbQuery("⚠️ Claim ini sudah diproses.", { show_alert: true });
    }

    claim.done = true;
    const adminName = ctx.from.first_name || ctx.from.username || "Admin";
    const statusText =
      status === "approve"
        ? `✅ Selesai oleh ${esc(adminName)}`
        : `❌ Ditolak oleh ${esc(adminName)}`;

    await ctx.answerCbQuery(status === "approve" ? "✅ Claim disahkan!" : "❌ Claim ditolak.");

    await ctx
      .editMessageText(
        [
          `🎁 <b>PLATOMY CLAIM REQUEST</b>`,
          `──────────────────`,
          `👤 <b>Pemain:</b> ${mention(claim.userId, claim.userName)}`,
          `🔗 <b>Link Plato:</b> ${esc(claim.platoLink)}`,
          `📦 <b>Item:</b> <b>${esc(claim.item)}</b>`,
          `📌 <b>Status:</b> ${statusText}`,
        ].join(NL),
        { parse_mode: "HTML", disable_web_page_preview: true }
      )
      .catch(() => {});

    await ctx
      .reply(
        status === "approve"
          ? `✅ ${mention(claim.userId, claim.userName)}, claim anda untuk <b>${esc(claim.item)}</b> telah <b>dihantar / selesai</b>!`
          : `❌ ${mention(claim.userId, claim.userName)}, maaf claim anda untuk <b>${esc(claim.item)}</b> telah <b>ditolak</b>. Sila hubungi Admin.`,
        { parse_mode: "HTML" }
      )
      .catch(() => {});
  });

  // ================= GIVEAWAY (REPLY ID PLATO + TIMER) =================
  bot.command("giveaway", async (ctx) => {
    if (!isTgAdmin(ctx)) return ctx.reply("❌ Hanya Admin boleh mulakan giveaway!");
    const parts = ctx.message.text.trim().split(/\s+/);
    const mins = parseInt(parts[1], 10);
    const winnersCount = parseInt(parts[2], 10);
    const prize = parts.slice(3).join(" ");

    if (isNaN(mins) || mins <= 0 || isNaN(winnersCount) || winnersCount <= 0 || !prize) {
      return ctx.reply(
        [`❌ Format: /giveaway <minit> <pemenang> <hadiah>`, `Contoh: /giveaway 5 1 1000 Coins`].join(NL)
      );
    }

    const game = {
      chatId: ctx.chat.id,
      msgId: null,
      prize,
      winnersCount,
      endTime: Date.now() + mins * 60 * 1000,
      participants: new Map(), // userId -> { name, platoId }
      ended: false,
      timer: null,
    };

    const msg = await ctx.reply(buildGiveawayText(game), { parse_mode: "HTML" });
    game.msgId = msg.message_id;
    giveaways.set(msg.message_id, game);

    // Kemas kini countdown timer setiap 10 saat
    game.timer = setInterval(async () => {
      if (game.ended || Date.now() >= game.endTime) {
        clearInterval(game.timer);
        return;
      }
      await bot.telegram
        .editMessageText(game.chatId, game.msgId, undefined, buildGiveawayText(game), {
          parse_mode: "HTML",
        })
        .catch(() => {});
    }, 10_000);

    setTimeout(async () => {
      clearInterval(game.timer);
      if (game.ended) return;
      game.ended = true;
      const entries = [...game.participants.entries()];

      await bot.telegram
        .editMessageText(game.chatId, game.msgId, undefined, buildGiveawayText(game), {
          parse_mode: "HTML",
        })
        .catch(() => {});

      if (entries.length === 0) {
        return bot.telegram.sendMessage(game.chatId, "😢 Giveaway tamat tanpa peserta.").catch(() => {});
      }

      const winners = pickRandom(entries, Math.min(game.winnersCount, entries.length));
      let pool = [...entries];

      for (const [wId, wData] of winners) {
        const gif = await generateWheelGif(
          pool.map(([, p]) => p.platoId),
          wData.platoId,
          { title: "Wheel Spin", subtitle: `PlatoMy • ${prize}` }
        );
        await bot.telegram
          .sendAnimation(game.chatId, { source: gif, filename: "wheel-spin.gif" }, { caption: `🎡 Memusing roda untuk ${prize}...` })
          .catch(() => {});
        await sleep(4500);
        pool = pool.filter(([uid]) => uid !== wId);
      }

      const winnerLines = winners
        .map(([uid, p]) => `${mention(uid, p.name)} (ID Plato: <code>${esc(p.platoId)}</code>)`)
        .join(NL);

      await bot.telegram
        .sendMessage(
          game.chatId,
          [`🏆 <b>Tahniah Pemenang Giveaway!</b>`, winnerLines, ``, `Anda memenangi <b>${esc(prize)}</b>!`].join(NL),
          { parse_mode: "HTML" }
        )
        .catch(() => {});
    }, mins * 60 * 1000);
  });

  // ================= WHEEL SPIN =================
  bot.command("spin", async (ctx) => {
    if (!isTgAdmin(ctx)) return ctx.reply("❌ Hanya Admin boleh mulakan Wheel Spin!");
    const parts = ctx.message.text.trim().split(/\s+/);
    const winnersCount = parseInt(parts[1], 10) || 1;
    const title = parts.slice(2).join(" ") || "Wheel Spin";

    const id = String(Date.now());
    const game = {
      id,
      chatId: ctx.chat.id,
      title,
      winnersCount,
      hostId: ctx.from.id,
      participants: new Map(),
      ended: false,
    };
    spins.set(id, game);

    await ctx.reply(
      [
        `🎡 <b>PlatoMy Wheel Spin</b>`,
        `🎁 Event: <b>${esc(title)}</b>`,
        `🏆 Winners: <b>${winnersCount}</b>`,
        `👥 Peserta: <b>0</b>`,
      ].join(NL),
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("🎡 Join", `tg_spin_join:${id}`),
            Markup.button.callback("▶️ Spin Now", `tg_spin_start:${id}`),
          ],
        ]),
      }
    );
  });

  bot.action(/^tg_spin_join:(.+)$/, async (ctx) => {
    const game = spins.get(ctx.match[1]);
    if (!game || game.ended) return ctx.answerCbQuery("❌ Wheel Spin sudah tamat.", { show_alert: true });
    if (game.participants.has(ctx.from.id)) return ctx.answerCbQuery("⚠️ Anda sudah sertai!", { show_alert: true });

    game.participants.set(ctx.from.id, ctx.from.first_name || ctx.from.username || String(ctx.from.id));
    await ctx.answerCbQuery("✅ Berjaya sertai Wheel Spin!");

    const list = [...game.participants.values()].slice(0, 20).map(esc).join(", ");
    await ctx
      .editMessageText(
        [
          `🎡 <b>PlatoMy Wheel Spin</b>`,
          `🎁 Event: <b>${esc(game.title)}</b>`,
          `🏆 Winners: <b>${game.winnersCount}</b>`,
          `👥 Peserta (${game.participants.size}): ${list}`,
        ].join(NL),
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback("🎡 Join", `tg_spin_join:${game.id}`),
              Markup.button.callback("▶️ Spin Now", `tg_spin_start:${game.id}`),
            ],
          ]),
        }
      )
      .catch(() => {});
  });

  bot.action(/^tg_spin_start:(.+)$/, async (ctx) => {
    const game = spins.get(ctx.match[1]);
    if (!game || game.ended) return ctx.answerCbQuery("❌ Wheel Spin sudah tamat.", { show_alert: true });
    if (ctx.from.id !== game.hostId) {
      return ctx.answerCbQuery("❌ Hanya Host sahaja boleh tekan Spin Now!", { show_alert: true });
    }
    if (game.participants.size < 2) {
      return ctx.answerCbQuery("❌ Perlukan sekurang-kurangnya 2 peserta!", { show_alert: true });
    }

    game.ended = true;
    await ctx.answerCbQuery("🎡 Memusing roda...");
    await ctx
      .editMessageText(
        [
          `🎡 <b>PlatoMy Wheel Spin</b> (Tamat)`,
          `🎁 Event: <b>${esc(game.title)}</b>`,
          `👥 Peserta: <b>${game.participants.size}</b>`,
        ].join(NL),
        { parse_mode: "HTML" }
      )
      .catch(() => {});

    const entries = [...game.participants.entries()];
    const winners = pickRandom(entries, Math.min(game.winnersCount, entries.length));
    let pool = [...entries];

    for (const [wId, wName] of winners) {
      const gif = await generateWheelGif(
        pool.map(([, n]) => n),
        wName,
        { title: "Wheel Spin", subtitle: `PlatoMy • ${game.title}` }
      );
      await ctx
        .replyWithAnimation({ source: gif, filename: "wheel-spin.gif" }, { caption: `🎡 Memusing roda untuk ${game.title}...` })
        .catch(() => {});
      await sleep(4500);
      pool = pool.filter(([uid]) => uid !== wId);
    }

    const mentions = winners.map(([uid, name]) => mention(uid, name)).join(", ");
    await ctx.reply(
      [
        `🎉 <b>Keputusan Wheel Spin</b>`,
        `Tahniah ${mentions}!`,
        `Anda memenangi <b>${esc(game.title)}</b>!`,
      ].join(NL),
      { parse_mode: "HTML" }
    );
  });

  // ================= TERIMA REPLY ID PLATO UNTUK GIVEAWAY =================
  bot.on("text", async (ctx, next) => {
    const replyMsgId = ctx.message?.reply_to_message?.message_id;
    if (!replyMsgId) return next();

    const game = giveaways.get(replyMsgId);
    if (!game) return next();

    const text = ctx.message.text.trim();
    if (!text || text.startsWith("/")) return next();

    if (game.ended) {
      return ctx.reply("❌ Giveaway ini sudah tamat.", {
        reply_to_message_id: ctx.message.message_id,
      });
    }

    if (game.participants.has(ctx.from.id)) {
      const existing = game.participants.get(ctx.from.id);
      return ctx.reply(
        `⚠️ Anda sudah menyertai giveaway ini! (ID Plato: <code>${esc(existing.platoId)}</code>)`,
        { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
      );
    }

    const platoId = text.slice(0, 50);
    const name = ctx.from.first_name || ctx.from.username || String(ctx.from.id);
    game.participants.set(ctx.from.id, { name, platoId });

    await ctx.reply(
      `✅ Berjaya sertai giveaway! (ID Plato: <code>${esc(platoId)}</code>)`,
      { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
    );

    await bot.telegram
      .editMessageText(game.chatId, game.msgId, undefined, buildGiveawayText(game), {
        parse_mode: "HTML",
      })
      .catch(() => {});
  });

  // Daftar menu command dalam Telegram
  bot.telegram
    .setMyCommands([
      { command: "wallet", description: "Semak baki PlatoMy Wallet" },
      { command: "claim", description: "Claim hadiah (/claim Link_Plato Item)" },
      { command: "help", description: "Lihat senarai command" },
      { command: "giveaway", description: "[Admin] Mulakan Giveaway" },
      { command: "spin", description: "[Admin] Mulakan Wheel Spin" },
      { command: "add", description: "[Admin] Tambah baki wallet (reply ahli)" },
      { command: "deduct", description: "[Admin] Tolak baki wallet (reply ahli)" },
    ])
    .catch(() => {});

  bot.launch().then(() => console.log("✅ Bot Telegram PlatoMy berjaya dihidupkan!"));
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
