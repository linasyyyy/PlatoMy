import { ContainerBuilder } from "discord.js";
import { NL, COINS_EMOJI, PIPS_EMOJI, getMalaysiaTime, sep, txt } from "./utils.js";

const BANK_FOOTER = "⋆˚࿔ 🎀 PlatoMy Bank 𝜗𝜚˚⋆";
const bankFooter = () => `${BANK_FOOTER} • Today at ${getMalaysiaTime()}`;

export function balanceLines(w) {
  return [
    `╰┈➤ ${COINS_EMOJI} Plato Coins: ${w.coins.toLocaleString()}`,
    `╰┈➤ ${PIPS_EMOJI} Pips: ${w.pips.toLocaleString()}`,
    `╰┈➤ 🌸 Sponsor (Monthly): ${COINS_EMOJI} ${(w.sponsorMonthly || 0).toLocaleString()}`,
    `╰┈➤ 🌸 Sponsor (Lifetime): ${COINS_EMOJI} ${w.sponsorTotal.toLocaleString()}`,
  ].join(NL);
}

export function walletBox(w, target = null) {
  const box = new ContainerBuilder().addTextDisplayComponents(txt("# ˚₊‧꒰ാ 𝑃𝐿𝐴𝑇𝑂𝑀𝑌 𝑊𝐴𝐿𝐿𝐸𝑇 ໒꒱‧₊˚"));
  if (target) {
    box.addTextDisplayComponents(txt(`╰┈➤ 👤 **Player:** ${target} (\`${target.id}\`)`));
  }
  return box
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(balanceLines(w)))
    .addTextDisplayComponents(txt(`-# ${bankFooter()}`));
}

export function walletLogBox({ actionTitle, target, admin, details, reason, w }) {
  const logBody = [
    `╰┈➤ 📌 **Action:** ${actionTitle}`,
    `╰┈➤ 👤 **Target:** ${target} (\`${target.id}\`)`,
    `╰┈➤ 🛡️ **Admin:** ${admin}`,
    `╰┈➤ 📝 **Details:** ${details}`,
    `╰┈➤ 💬 **Reason:** ${reason}`,
  ].join(NL);

  return new ContainerBuilder()
    .addTextDisplayComponents(txt("# ˚₊‧꒰ാ 𝑊𝐴𝐿𝐿𝐸𝑇 𝐿𝑂𝐺 ໒꒱‧₊˚"))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(logBody))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(`**Current Balances**${NL}${balanceLines(w)}`))
    .addTextDisplayComponents(txt(`-# ${bankFooter()}`));
}
