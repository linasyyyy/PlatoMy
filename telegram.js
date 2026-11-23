// Command sementara untuk Admin dapatkan ID group
  bot.command("chatid", (ctx) => {
    if (!isTgAdmin(ctx)) return;
    return ctx.reply(`🆔 Chat ID group ini: <code>${ctx.chat.id}</code>`, { parse_mode: "HTML" });
  });

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
      originChatId: ctx.chat.id,
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

    // Hantar notifikasi keputusan balik ke group asal pemain
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
