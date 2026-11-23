import { Telegraf, Markup } from "telegraf";
import { sleep } from "./utils.js";

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

  bot.catch((err) => console.error("Ralat Bot Telegram:", err));

  // ================= MENU / HELP =================
  const helpText = [
    `🎀 <b>PlatoMy Bot — Senarai Command</b>`,
    ``,
    `👤 <b>Ahli:</b>`,
    `• /wallet — Semak baki wallet anda`,
    `• /help — Papar panduan command`,
    ``,
    `🛡️ <b>Admin:</b>`,
    `• Reply mesej ahli + /wallet — Semak wallet ahli`,
    `• Reply mesej ahli + /add <code>coins 100</code> — Tambah baki`,
    `• Reply mesej ahli + /deduct <code>pips 50</code> — Tolak baki`,
    `• /giveaway <code>5 1 1000 Coins</code> — Mula giveaway`,
    `• /spin <code>1 Nama Event</code> — Mula Wheel Spin`,
  ].join("
");

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

  // Admin: reply mesej user dengan /add coins 100 atau /deduct pips 50
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
        `✅ Berjaya <b>${mode === "add" ? "tambah" : "tolak"} ${amount.toLocaleString()} ${currency}</b> untuk ${esc(name)}!

${formatWallet(w, name)}`,
        { parse_mode: "HTML" }
      );
    });
  }

  // ================= GIVEAWAY =================
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
      participants: new Map(),
      ended: false,
    };
    giveaways.set(id, game);

    const msg = await ctx.reply(
      `🎁 <b>GIVEAWAY: ${esc(prize)}</b>
🏆 Winners: <b>${winnersCount}</b>
⏳ Tamat dalam: <b>${mins} minit</b>
👥 Entries: <b>0</b>`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([[Markup.button.callback("🎉 Join Giveaway", `tg_gw:${id}`)]]),
      }
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
          `🎁 <b>GIVEAWAY: ${esc(prize)}</b> (Tamat)
🏆 Winners: <b>${winnersCount}</b>
👥 Entries: <b>${entries.length}</b>`,
          { parse_mode: "HTML" }
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

      const mentions = winners.map(([uid, name]) => mention(uid, name)).join(", ");
      await bot.telegram
        .sendMessage(game.chatId, `🏆 <b>Tahniah</b> ${mentions}!
Anda memenangi <b>${esc(prize)}</b>!`, {
          parse_mode: "HTML",
        })
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
        `🎁 <b>GIVEAWAY: ${esc(game.prize)}</b>
🏆 Winners: <b>${game.winnersCount}</b>
👥 Entries: <b>${game.participants.size}</b>`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([[Markup.button.callback("🎉 Join Giveaway", `tg_gw:${game.id}`)]]),
        }
      )
      .catch(() => {});
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
      `🎡 <b>PlatoMy Wheel Spin</b>
🎁 Event: <b>${esc(title)}</b>
🏆 Winners: <b>${winnersCount}</b>
👥 Peserta: <b>0</b>`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("🎡 Join Spin", `tg_spin_join:${id}`),
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
        `🎡 <b>PlatoMy Wheel Spin</b>
🎁 Event: <b>${esc(game.title)}</b>
🏆 Winners: <b>${game.winnersCount}</b>
👥 Peserta (${game.participants.size}): ${list}`,
        {
          parse_mode: "HTML",
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
      .editMessageText(
        `🎡 <b>PlatoMy Wheel Spin</b> (Tamat)
🎁 Event: <b>${esc(game.title)}</b>
👥 Peserta: <b>${game.participants.size}</b>`,
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
    await ctx.reply(`🎉 <b>Keputusan Wheel Spin</b>
Tahniah ${mentions}!
Anda memenangi <b>${esc(game.title)}</b>!`, {
      parse_mode: "HTML",
    });
  });

  // Daftar menu command dalam Telegram
  bot.telegram
    .setMyCommands([
      { command: "wallet", description: "Semak baki PlatoMy Wallet" },
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
