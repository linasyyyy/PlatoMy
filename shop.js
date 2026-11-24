import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { NL, isUrl, getMalaysiaTime, sep, txt } from "./utils.js";

export const PETALS_PER_COIN = 10;
export const PETALS_PER_PIP = 7500;
export const COINS_PER_PIP_SHOP = 750;

export const SHOP_COINS_EMOJI = "<:PlatoCoins:1549740441682059385>";
export const SHOP_PIPS_EMOJI = "<:Pips:1549739800884551710>";

const PLATO_COINS_BTN_EMOJI = { id: "1549740441682059385", name: "PlatoCoins" };
const PIPS_BTN_EMOJI = { id: "1549739800884551710", name: "Pips" };

const fmt = (n) => Number(n.toFixed(2)).toLocaleString();

export function buildShopPanel(bannerUrl = null) {
  const box = new ContainerBuilder();

  if (isUrl(bannerUrl)) {
    box.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(bannerUrl.trim())
      )
    );
  }

  const content = [
    "### ˚₊‧꒰ა ❀ 𝑃𝐸𝑇𝐴𝐿𝑆 𝑆𝐻𝑂𝑃 ❀ ໒꒱‧₊˚",
    "<:Invi:1567026814143041607>",
    "<a:a_sparkle7:1563423627263877200> Redeem **❀ Petals** anda daripada *quest & event* kepada <:PlatoCoins:1549740441682059385> **Plato Coins** atau <:Pips:1549739800884551710> **Pips**!",
    "<:Invi:1567026814143041607>",
    "────────────────────────",
    "<:Invi:1567026814143041607>",
    "<a:PinkArrow:1549417772726095973> **𝗘𝗫𝗖𝗛𝗔𝗡𝗚𝗘 𝗥𝗔𝗧𝗘:**",
    "<:Invi:1567026814143041607>",
    "<:no1:1563423652379369535> **10 ❀ Petals** ╰┈➤ **1** <:PlatoCoins:1549740441682059385> **Plato Coin**",
    "<:no2:1563423657144094761> **1,000 ❀ Petals** ╰┈➤ **100** <:PlatoCoins:1549740441682059385> **Plato Coins**",
    "<:no3:1563423660964974603> **7,500 ❀ Petals** ╰┈➤ **1** <:Pips:1549739800884551710> **Pip**",
    "<:Invi:1567026814143041607>",
    "────────────────────────",
    "<:Invi:1567026814143041607>",
    "-# ⋆˚࿔ <:pinkbow:1563423584624582779> *Tekan button di bawah untuk redeem.* 𝜗𝜚˚⋆",
  ].join(NL);

  const buyCoinsBtn = new ButtonBuilder()
    .setCustomId("shop_buy_coins")
    .setLabel("Plato Coins")
    .setEmoji(PLATO_COINS_BTN_EMOJI)
    .setStyle(ButtonStyle.Secondary);

  const buyPipsBtn = new ButtonBuilder()
    .setCustomId("shop_buy_pips")
    .setLabel("Pips")
    .setEmoji(PIPS_BTN_EMOJI)
    .setStyle(ButtonStyle.Secondary);

  const calcBtn = new ButtonBuilder()
    .setCustomId("shop_calculator")
    .setLabel("Calculator")
    .setEmoji("🧮")
    .setStyle(ButtonStyle.Secondary);

  return box
    .addTextDisplayComponents(txt(content))
    .addActionRowComponents(new ActionRowBuilder().addComponents(buyCoinsBtn, buyPipsBtn, calcBtn));
}

export function buildShopModal(type, currentPetals = 0) {
  const isCoins = type === "coins";
  const modal = new ModalBuilder()
    .setCustomId(`shop_modal:${type}`)
    .setTitle(isCoins ? "Redeem Plato Coins" : "Redeem Pips");

  const label = isCoins
    ? "Jumlah Plato Coins (10 Petals = 1 Coin)"
    : "Jumlah Pips (7,500 Petals = 1 Pip)";

  const maxBuy = Math.floor(currentPetals / (isCoins ? PETALS_PER_COIN : PETALS_PER_PIP));

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("shop_amount")
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder(`Baki anda: ${currentPetals.toLocaleString()} Petals (Maks: ${maxBuy.toLocaleString()})`)
    )
  );

  return modal;
}

export function buildShopReceiptBox({ type, amount, cost, w }) {
  const itemLabel =
    type === "coins"
      ? `**${amount.toLocaleString()}** ${SHOP_COINS_EMOJI} **Plato Coins**`
      : `**${amount.toLocaleString()}** ${SHOP_PIPS_EMOJI} **Pips**`;

  const lines = [
    `✅ Berjaya redeem ${itemLabel}!`,
    `╰┈➤ ❀ **Petals Ditolak:** -${cost.toLocaleString()} ❀ Petals`,
    `╰┈➤ ❀ **Baki Petals:** ${(w.petals || 0).toLocaleString()}`,
    `╰┈➤ ${SHOP_COINS_EMOJI} **Plato Coins:** ${w.coins.toLocaleString()}`,
    `╰┈➤ ${SHOP_PIPS_EMOJI} **Pips:** ${w.pips.toLocaleString()}`,
  ].join(NL);

  return new ContainerBuilder()
    .addTextDisplayComponents(txt("### ˚₊‧꒰ა ❀ 𝑅𝐸𝐷𝐸𝐸𝑀 𝐵𝐸𝑅𝐽𝐴𝑌𝐴 ❀ ໒꒱‧₊˚"))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(lines))
    .addTextDisplayComponents(txt(`-# ⋆˚࿔ <:pinkbow:1563423584624582779> Petals Shop • Today at ${getMalaysiaTime()} 𝜗𝜚˚⋆`));
}

export function buildCalcModal() {
  const modal = new ModalBuilder()
    .setCustomId("shop_calc_modal")
    .setTitle("🧮 Petals Calculator");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("calc_type")
        .setLabel("Jenis (petals / coins / pips)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder("cth: petals")
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("calc_amount")
        .setLabel("Jumlah")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder("cth: 7500")
    )
  );

  return modal;
}

export function buildCalcResultBox(type, amount, currentPetals = 0) {
  let petals = 0;
  let coins = 0;
  let pips = 0;

  if (type === "petals") {
    petals = amount;
    coins = amount / PETALS_PER_COIN;
    pips = amount / PETALS_PER_PIP;
  } else if (type === "coins") {
    coins = amount;
    petals = amount * PETALS_PER_COIN;
    pips = amount / COINS_PER_PIP_SHOP;
  } else {
    pips = amount;
    coins = amount * COINS_PER_PIP_SHOP;
    petals = amount * PETALS_PER_PIP;
  }

  const cukup =
    currentPetals >= petals
      ? "✅ Baki Petals anda **mencukupi**!"
      : `⚠️ Kurang **${Math.ceil(petals - currentPetals).toLocaleString()} ❀ Petals** lagi.`;

  const lines = [
    `╰┈➤ ❀ **Petals:** ${fmt(petals)}`,
    `╰┈➤ ${SHOP_COINS_EMOJI} **Plato Coins:** ${fmt(coins)}`,
    `╰┈➤ ${SHOP_PIPS_EMOJI} **Pips:** ${fmt(pips)}`,
    "",
    `-# Baki anda: **${currentPetals.toLocaleString()} ❀ Petals** • ${cukup}`,
  ].join(NL);

  return new ContainerBuilder()
    .addTextDisplayComponents(txt("### ˚₊‧꒰ა 🧮 𝑃𝐸𝑇𝐴𝐿𝑆 𝐶𝐴𝐿𝐶𝑈𝐿𝐴𝑇𝑂𝑅 🧮 ໒꒱‧₊˚"))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(lines));
}
