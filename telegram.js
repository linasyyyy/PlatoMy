import { Telegraf, Markup } from "telegraf";
import { sleep } from "./utils.js";

const adminIds = new Set(
  (process.env.TELEGRAM_ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);
const isTgAdmin = (ctx) => adminIds.has(String(ctx.from?.id));
const tgKey = (id) => `tg_${id}`;

function formatWallet(w, name) {
  return [
    `🎀 *PLATOMY WALLET* — ${name}`,
    `──────────────────`,
    `🪙 Plato Coins: *${w.coins.toLocaleString()}*`,
    `💠 Pips: *${w.pips.toLocaleString()}*`,
    `🌸 Sponsor (Monthly): *${(w.sponsorMonthly || 0).toLocaleString()}*`,
    `🌸 Sponsor (Lifetime): *${w.sponsorTotal.toLocaleString()}*`,
  ].join("
");
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
  const giveaways = new Map();
  const spins = new Map();

  // ================= WALLET =================
  bot.command("wallet", (ctx) => {
    const replied = ctx.message.reply_to_message?.from;
    const target = replied && isTgAdmin(ctx) ? replied : ctx.from;
    const w = getWallet(tgKey(target.id));
    const name = target.first_name || target.username || target.id;
    return ctx.replyWithMarkdown(formatWallet(w, name));
  });

  // Admin: reply mesej user dengan /add coins 100 atau /deduct pips 50
  for (const mode of ["add", "deduct"]) {
    bot.command(mode, (ctx) => {
      if (!isTgAdmin(ctx)) return ctx.reply("❌ Hanya Admin boleh ubah baki wallet!");
      const target = ctx.message.reply_to_message?.from;
      if (!target) return ctx.reply(`❌ Reply mesej pemain dengan: /${mode} <coins|pips|sponsor> <jumlah>`);

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
        w.sponsorMonthly = mode === "add" ? (w.sponsorMonthly || 0) + amount : Math.max(0, (w.sponsorMonthly || 0) - amount);
      }

      const name = target.first_name || target.username || target.id;
      return ctx.replyWithMarkdown(
        `✅ Berjaya *${mode === "add" ? "tambah" : "tolak"} ${amount.toLocaleString()} ${currency}* untuk ${name}!

${formatWallet(w, name)}`
      );
    });
  }

  // ================= GIVEAWAY =================
  // Admin: /giveaway <minit> <bil_pemenang> <hadiah>
  bot.command("giveaway", async (ctx) => {
    if (!isTgAdmin(ctx)) return ctx.reply("❌ Hanya Admin boleh mulakan giveaway!");
    const parts = ctx.message.text.trim().split(/\s+/);
    const mins = parseInt(parts[1], 10);
    const winnersCount = parseInt(parts[2], 10);
    const prize = parts.slice(3).join(" ");

    if (isNaN(mins) || mins <= 0 || isNaN(winnersCount) || winnersCount <= 0 || !prize) {
      return ctx.reply("❌ Format: /giveaway <minit> <pemenang> <hadiah>
Contoh: /giveaway 5 1 1000 Coins");
    }

    const id = String(Date.now());
    const game = {
      id,
      chatId: ctx.chat.id,
      prize,
      winnersCount,
      hostName: ctx.from.first_name || "Admin",
      participants: new Map(), // userId -> name
      ended: false,
    };
    giveaways.set(id, game);

    const msg = await ctx.replyWithMarkdown(
      `🎁 *GIVEAWAY: ${prize}*
🏆 Winners: *${winnersCount}*
⏳ Tamat dalam: *${mins} minit*
👥 Entries: *0*`,
      Markup.inlineKeyboard([[Markup.button.callback("🎉 Join Giveaway", `tg_gw:${id}`)]])
    );

    setTimeout(async () => {
      if (game.ended) return;
      game.ended = true;
      const entries = [...game.participants.entries()];

      await bot.telegram
        .editMessageText(
          game.chatId,
          msg.message_id,
          undefined,
          `🎁 *GIVEAWAY: ${prize}* (Tamat)
🏆 Winners: *${winnersCount}*
👥 Entries: *${entries.length}*`,
          { parse_mode: "Markdown" }
        )
        .catch(() => {});

      if (entries.length === 0) {
        return bot.telegram.sendMessage(game.chatId, "😢 Giveaway tamat tanpa peserta.").catch(() => {});
      }

      const winners = pickRandom(entries, Math.min(game.winnersCount, entries.length));
      let pool = [...entries];

      for (const [wId, wName] of winners) {
        const gif = await generateWheelGif(
          pool.map(([, n]) => n),
          wName,
          { title: "Wheel Spin", subtitle: `PlatoMy • ${prize}` }
        );
        await bot.telegram
          .sendAnimation(game.chatId, { source: gif, filename: "wheel-spin.gif" }, { caption: `🎡 Memusing roda untuk ${prize}...` })
          .catch(() => {});
        await sleep(4500);
        pool = pool.filter(([uid]) => uid !== wId);
      }

      const mentions = winners.map(([uid, name]) => `[${name}](tg://user?id=${uid})`).join(", ");
      await bot.telegram
        .sendMessage(game.chatId, `🏆 *Tahniah* ${mentions}!
Anda memenangi *${prize}*!`, { parse_mode: "Markdown" })
        .catch(() => {});
    }, mins * 60 * 1000);
  });

  bot.action(/^tg_gw:(.+)$/, async (ctx) => {
    const game = giveaways.get(ctx.match[1]);
    if (!game || game.ended) return ctx.answerCbQuery("❌ Giveaway sudah tamat.", { show_alert: true });
    if (game.participants.has(ctx.from.id)) return ctx.answerCbQuery("⚠️ Anda sudah menyertai!", { show_alert: true });

    game.participants.set(ctx.from.id, ctx.from.first_name || ctx.from.username || String(ctx.from.id));
    await ctx.answerCbQuery("✅ Berjaya sertai giveaway!");

    await ctx
      .editMessageText(
        `🎁 *GIVEAWAY: ${game.prize}*
🏆 Winners: *${game.winnersCount}*
👥 Entries: *${game.participants.size}*`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([[Markup.button.callback("🎉 Join Giveaway", `tg_gw:${game.id}`)]]),
        }
      )
      .catch(() => {});
  });

  // ================= WHEEL SPIN =================
  // Admin: /spin <bil_pemenang> <tajuk>
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

    await ctx.replyWithMarkdown(
      `🎡 *PlatoMy Wheel Spin*
🎁 Event: *${title}*
🏆 Winners: *${winnersCount}*
👥 Peserta: *0*`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("🎡 Join Spin", `tg_spin_join:${id}`),
          Markup.button.callback("▶️ Spin Now", `tg_spin_start:${id}`),
        ],
      ])
    );
  });

  bot.action(/^tg_spin_join:(.+)$/, async (ctx) => {
    const game = spins.get(ctx.match[1]);
    if (!game || game.ended) return ctx.answerCbQuery("❌ Wheel Spin sudah tamat.", { show_alert: true });
    if (game.participants.has(ctx.from.id)) return ctx.answerCbQuery("⚠️ Anda sudah sertai!", { show_alert: true });

    game.participants.set(ctx.from.id, ctx.from.first_name || ctx.from.username || String(ctx.from.id));
    await ctx.answerCbQuery("✅ Berjaya sertai Wheel Spin!");

    const list = [...game.participants.values()].slice(0, 20).join(", ");
    await ctx
      .editMessageText(
        `🎡 *PlatoMy Wheel Spin*
🎁 Event: *${game.title}*
🏆 Winners: *${game.winnersCount}*
👥 Peserta (${game.participants.size}): ${list}`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback("🎡 Join Spin", `tg_spin_join:${game.id}`),
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
      .editMessageText(`🎡 *PlatoMy Wheel Spin* (Tamat)
🎁 Event: *${game.title}*
👥 Peserta: *${game.participants.size}*`, {
        parse_mode: "Markdown",
      })
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

    const mentions = winners.map(([uid, name]) => `[${name}](tg://user?id=${uid})`).join(", ");
    await ctx.replyWithMarkdown(`🎉 *Keputusan Wheel Spin*
Tahniah ${mentions}!
Anda memenangi *${game.title}*!`);
  });

  bot.launch().then(() => console.log("✅ Bot Telegram PlatoMy berjaya dihidupkan!"));
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
