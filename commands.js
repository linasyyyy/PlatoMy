import { SlashCommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("wallet")
    .setDescription("Semak baki akaun PlatoMy • Wallet anda! 🏦")
    .addUserOption((opt) =>
      opt.setName("player").setDescription("Semak baki pemain lain (Admin sahaja)").setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("myrank")
    .setDescription("Semak kad rank, level & baki EXP ke level seterusnya! 👑")
    .addUserOption((opt) => opt.setName("user").setDescription("Semak rank ahli lain (pilihan)").setRequired(false)),
  new SlashCommandBuilder()
    .setName("admin-wallet")
    .setDescription("Urus baki akaun PlatoMy • Wallet ahli (Admin sahaja)")
    .addStringOption((opt) =>
      opt
        .setName("action")
        .setDescription("Tindakan")
        .setRequired(true)
        .addChoices(
          { name: "Add Sponsor (Coins / Pips)", value: "add_sponsor" },
          { name: "Add Coins", value: "add_coins" },
          { name: "Deduct Coins", value: "deduct_coins" },
          { name: "Add Pips", value: "add_pips" },
          { name: "Deduct Pips", value: "deduct_pips" },
          { name: "Check", value: "check" }
        )
    )
    .addUserOption((opt) => opt.setName("target").setDescription("Ahli / Penaja").setRequired(true))
    .addIntegerOption((opt) => opt.setName("amount").setDescription("Jumlah").setRequired(true))
    .addStringOption((opt) => opt.setName("reason").setDescription("Sebab / Nota").setRequired(false))
    .addStringOption((opt) =>
      opt
        .setName("sponsor_currency")
        .setDescription("Untuk Add Sponsor: guna Coins atau Pips (default Coins)")
        .setRequired(false)
        .addChoices(
          { name: "🪙 Coins", value: "coins" },
          { name: "💠 Pips (750 Coins = 1 Pip)", value: "pips" }
        )
    ),
  new SlashCommandBuilder().setName("setup-trading").setDescription("Hantar panel PlatoMy Trading (Admin sahaja)"),
  new SlashCommandBuilder()
    .setName("setup-birthday")
    .setDescription("Hantar panel PlatoMy Birthday Corner di channel ini (Admin sahaja)")
    .addChannelOption((opt) =>
      opt.setName("chat_channel").setDescription("Channel chat untuk ahli hantar ucapan (pilihan)").setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("setup-leaderboard")
    .setDescription("Hantar papan Leaderboard mengikut kategori di channel ini (Admin sahaja)")
    .addStringOption((opt) =>
      opt
        .setName("category")
        .setDescription("Pilih kategori leaderboard")
        .setRequired(true)
        .addChoices(
          { name: "✨ Monthly EXP", value: "exp" },
          { name: "✨ Lifetime EXP", value: "exp_all" },
          { name: "🌸 Monthly Sponsor", value: "sponsor" },
          { name: "🌸 Lifetime Sponsor", value: "sponsor_all" },
          { name: "🪙 Plato Coins", value: "coins" },
          { name: "💠 Pips", value: "pips" }
        )
    ),
  new SlashCommandBuilder()
    .setName("reset-leaderboard")
    .setDescription("Set semula (reset) semua EXP ahli kepada 0 (Admin sahaja)"),
  new SlashCommandBuilder()
    .setName("embed-builder")
    .setDescription("Cipta custom container interaktif (Admin sahaja)")
    .addChannelOption((opt) => opt.setName("channel").setDescription("Pilih channel").setRequired(true)),
  new SlashCommandBuilder()
    .setName("embed-image")
    .setDescription("Hantar gambar sahaja dengan kod warna Hex (Admin sahaja)")
    .addChannelOption((opt) => opt.setName("channel").setDescription("Pilih channel").setRequired(true))
    .addStringOption((opt) => opt.setName("image_url").setDescription("Link URL gambar").setRequired(true))
    .addStringOption((opt) => opt.setName("color").setDescription("Kod warna Hex (cth: #ffb6c1)").setRequired(false)),
  new SlashCommandBuilder()
    .setName("rumble")
    .setDescription("Mula permainan PlatoMy Rumble (Admin sahaja)")
    .addStringOption((opt) =>
      opt
        .setName("currency")
        .setDescription("Jenis mata wang")
        .setRequired(true)
        .addChoices(
          { name: "🪙 Plato Coins", value: "coins" },
          { name: "💠 Pips", value: "pips" }
        )
    )
    .addIntegerOption((opt) => opt.setName("prize").setDescription("Jumlah Hadiah Utama").setRequired(true).setMinValue(1))
    .addIntegerOption((opt) =>
      opt.setName("duration").setDescription("Tempoh masa (minit)").setRequired(true).setMinValue(1).setMaxValue(10080)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("winners")
        .setDescription("Berapa ramai pemenang (hadiah dibahagi sama rata, default 1)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(25)
    ),
  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Mula giveaway (Admin sahaja)")
    .addStringOption((opt) => opt.setName("prize").setDescription("Hadiah").setRequired(true))
    .addIntegerOption((opt) =>
      opt.setName("duration").setDescription("Tempoh masa (minit)").setRequired(true).setMinValue(1).setMaxValue(10080)
    )
    .addIntegerOption((opt) =>
      opt.setName("winners").setDescription("Bilangan pemenang (default 1)").setRequired(false).setMinValue(1).setMaxValue(25)
    )
    .addRoleOption((opt) =>
      opt.setName("required_role").setDescription("Role yang dibenarkan join (pilihan)").setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName("image_url").setDescription("Link gambar / GIF (pilihan)").setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("giveaway-reroll")
    .setDescription("Reroll pemenang giveaway (Admin sahaja)")
    .addStringOption((opt) => opt.setName("message_id").setDescription("Message ID giveaway").setRequired(true))
    .addIntegerOption((opt) =>
      opt.setName("count").setDescription("Berapa pemenang baharu (default 1)").setRequired(false).setMinValue(1).setMaxValue(25)
    ),
].map((c) => c.toJSON());
