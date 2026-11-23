import { Telegraf, Markup } from "telegraf";
import { NL } from "./utils.js";

const DEFAULT_ADMINS = ["7268897584", "413778891", "8780849175"];
const adminIds = new Set([
  ...DEFAULT_ADMINS,
  ...(process.env.TELEGRAM_ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
]);

const CLAIM_CHAT_ID = process.env.TELEGRAM_CLAIM_CHAT_ID || "-5377781855";

const isTgAdmin = (ctx) => adminIds.has(String(ctx.from?.id));
const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const mention = (id, name) => `<a href="tg://user?id=${id}">${esc(name)}</a>`;

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

export function startTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("ℹ️ TELEGRAM_BOT_TOKEN tiada, bot Telegram tidak dimulakan.");
    return;
  }

  const bot = new Telegraf(token);
  const giveaways = new Map(); // msgId -> game
  const claims = new Map();

  bot.catch((err) => console.error("Ralat Bot Telegram:", err));

  // ================= MENU / HELP =================
  const helpText = [
    `🎁 <b>Giveaway — Senarai Command</b>`,
    ``,
    `👤 <b>Ahli:</b>`,
    `• /claim <code>Link_Plato Item</code> — Claim hadiah anda`,
    `• /help — Papar panduan command`,
    ``,
    `🛡️ <b>Admin:</b>`,
    `• /giveaway <code>5 1 1000 Coins</code> — Mula giveaway`,
    `• /chatid — Semak ID group`,
  ].join(NL);

  bot.start((ctx) => ctx.reply(helpText, { parse_mode: "HTML" }));
  bot.help((ctx) => ctx.reply(helpText, { parse_mode: "HTML" }));

  bot.command("chatid", (ctx) => {
    if (!isTgAdmin(ctx)) return;
    return ctx.reply(`🆔 Chat ID group ini: <code>${ctx.chat.id}</code>`, { parse_mode: "HTML" });
  });

  // ================= CLAIM (AUTO-HANTAR KE GROUP ADMIN) =================
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
      originChatId: ctx.chat.id,
      userId: ctx.from.id,
      userName: ctx.from.first_name || ctx.from.username || String(ctx.from.id),
      platoLink,
      item,
      done: false,
    };
    claims.set(id, claim);

    const text = [
      `🎁 <b>GIVEAWAY CLAIM REQUEST</b>`,
      `──────────────────`,
      `👤 <b>Pemain:</b> ${mention(claim.userId, claim.userName)}`,
      `🔗 <b>Link Plato:</b> ${esc(claim.platoLink)}`,
      `📦 <b>Item:</b> <b>${esc(claim.item)}</b>`,
      `📌 <b>Status:</b> ⏳ Menunggu Admin`,
    ].join(NL);

    const targetChatId = CLAIM_CHAT_ID || ctx.chat.id;
    const sent = await bot.telegram
      .sendMessage(targetChatId, text, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ Selesai", `tg_claim:approve:${id}`),
            Markup.button.callback("❌ Tolak", `tg_claim:reject:${id}`),
          ],
        ]),
      })
      .catch((err) => {
        console.error("Gagal hantar claim ke group admin:", err);
        return null;
      });

    if (!sent) {
      return ctx.reply("❌ Gagal hantar claim ke group Admin. Pastikan bot sudah masuk group tersebut.");
    }

    if (String(targetChatId) !== String(ctx.chat.id)) {
      await ctx.reply(
        `✅ ${mention(claim.userId, claim.userName)}, permohonan claim untuk <b>${esc(claim.item)}</b> telah dihantar kepada Admin!`,
        { parse_mode: "HTML", reply_to_message_id: ctx.message.message_id }
      );
    }
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
          `🎁 <b>GIVEAWAY CLAIM REQUEST</b>`,
          `──────────────────`,
          `👤 <b>Pemain:</b> ${mention(claim.userId, claim.userName)}`,
          `🔗 <b>Link Plato:</b> ${esc(claim.platoLink)}`,
          `📦 <b>Item:</b> <b>${esc(claim.item)}</b>`,
          `📌 <b>Status:</b> ${statusText}`,
        ].join(NL),
        { parse_mode: "HTML", disable_web_page_preview: true }
      )
      .catch(() => {});

    await bot.telegram
      .sendMessage(
        claim.originChatId,
        status === "approve"
          ? `✅ ${mention(claim.userId, claim.userName)}, claim anda untuk <b>${esc(claim.item)}</b> telah <b>dihantar / selesai</b>!`
          : `❌ ${mention(claim.userId, claim.userName)}, maaf claim anda untuk <b>${esc(claim.item)}</b> telah <b>ditolak</b>. Sila hubungi Admin.`,
        { parse_mode: "HTML" }
      )
      .catch(() => {});
  });

  // ================= GIVEAWAY (REPLY ID PLATO + TIMER + UMUM BIASA) =================
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
      const winnerLines = winners
        .map(([uid, p]) => `• ${mention(uid, p.name)} (ID Plato: <code>${esc(p.platoId)}</code>)`)
        .join(NL);

      await bot.telegram
        .sendMessage(
          game.chatId,
          [
            `🏆 <b>Tahniah Pemenang Giveaway!</b>`,
            winnerLines,
            ``,
            `🎁 Hadiah: <b>${esc(prize)}</b>`,
          ].join(NL),
          { parse_mode: "HTML" }
        )
        .catch(() => {});
    }, mins * 60 * 1000);
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
      { command: "claim", description: "Claim hadiah (/claim Link_Plato Item)" },
      { command: "help", description: "Lihat senarai command" },
      { command: "giveaway", description: "[Admin] Mulakan Giveaway" },
    ])
    .catch(() => {});

  bot.launch().then(() => console.log("✅ Bot Telegram Giveaway berjaya dihidupkan!"));
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
