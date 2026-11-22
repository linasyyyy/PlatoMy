import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { NL, TRADE_CATEGORY_ID, TRADE_MEDIA_URLS, V2, isUrl, sep, txt } from "./utils.js";

export const acceptedTrades = new Set();

export function buildTradePanel(listRef) {
  const btn = new ButtonBuilder()
    .setCustomId("open_trading_modal")
    .setLabel("Trading Ticket")
    .setEmoji("🤝")
    .setStyle(ButtonStyle.Secondary);

  const box = new ContainerBuilder();
  const mediaUrls = TRADE_MEDIA_URLS.filter(isUrl).slice(0, 10);
  for (const u of mediaUrls) {
    box.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(u.trim()))
    );
  }

  const panelBody = [
    "╰┈➤ Click the **Trading Ticket** button below to look for or trade your Plato items.",
    `╰┈➤ Your trade request will be posted automatically in ${listRef}.`,
  ].join(NL);

  return box
    .addTextDisplayComponents(txt("# ˚₊‧꒰ാ 🛍️ 𝑃𝐿𝐴𝑇𝑂𝑀𝑌 𝑇𝑅𝐴𝐷𝐼𝑁𝐺 ໒꒱‧₊˚"))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(panelBody))
    .addActionRowComponents(new ActionRowBuilder().addComponents(btn));
}

export function buildTradeList({ requesterId, details, accepterId = null }) {
  const accepted = Boolean(accepterId);
  const btn = new ButtonBuilder()
    .setCustomId(`accept_trade:${requesterId}`)
    .setLabel(accepted ? "Trade Accepted" : "Accept Trade")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(accepted);

  const listBody = [
    `╰┈➤ **Requester:** <@${requesterId}>`,
    `╰┈➤ **Item Details:** ${details}`,
  ].join(NL);

  const box = new ContainerBuilder()
    .addTextDisplayComponents(txt("# ˚₊‧꒰ാ 📋 𝑇𝑅𝐴𝐷𝐼𝑁𝐺 𝐿𝐼𝑆𝑇 ໒꒱‧₊˚"))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(listBody))
    .addSeparatorComponents(sep());

  if (accepted) {
    box.addTextDisplayComponents(txt(`✅ **Accepted by:** <@${accepterId}>`));
  } else {
    box.addTextDisplayComponents(
      txt("╰┈➤ Click **Accept Trade** if you are interested in trading with the requester.")
    );
  }

  return box.addActionRowComponents(new ActionRowBuilder().addComponents(btn));
}

export function buildTradeChatBox({ requesterId, accepterId, details }) {
  const btn = new ButtonBuilder()
    .setCustomId(`close_trade:${accepterId}`)
    .setLabel("Close Trade")
    .setEmoji("🔒")
    .setStyle(ButtonStyle.Secondary);

  const chatBody = [
    `╰┈➤ **Requester:** <@${requesterId}>`,
    `╰┈➤ **Accepted by:** <@${accepterId}>`,
    `╰┈➤ **Item Details:** ${details}`,
  ].join(NL);

  return new ContainerBuilder()
    .addTextDisplayComponents(txt("# ˚₊‧꒰ാ 🤝 𝑇𝑅𝐴𝐷𝐸 𝐶𝐻𝐴𝑇 ໒꒱‧₊˚"))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(txt(chatBody))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      txt(`╰┈➤ Discuss and complete your trade here. Only <@${accepterId}> (or an admin) can close this channel.`)
    )
    .addActionRowComponents(new ActionRowBuilder().addComponents(btn));
}

export async function createTradeChannel(guild, requesterId, accepter, details) {
  try {
    const safe = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20) || "user";
    const requesterMember = await guild.members.fetch(requesterId).catch(() => null);
    const requesterName = requesterMember?.user?.username;

    const memberPerms = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.EmbedLinks,
    ];

    const overwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: accepter.id, allow: memberPerms },
      {
        id: guild.client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
        ],
      },
    ];
    if (requesterMember) overwrites.push({ id: requesterId, allow: memberPerms });

    const channel = await guild.channels.create({
      name: `🤝・trade-${safe(requesterName)}-${safe(accepter.username)}`,
      type: ChannelType.GuildText,
      parent: TRADE_CATEGORY_ID,
      topic: `Trade chat • Accepted by ${accepter.username}`,
      permissionOverwrites: overwrites,
      reason: `Trade accepted by ${accepter.tag}`,
    });

    await channel.send({
      components: [buildTradeChatBox({ requesterId, accepterId: accepter.id, details })],
      flags: V2,
      allowedMentions: { users: [requesterId, accepter.id] },
    });
    return channel;
  } catch (err) {
    console.error("Gagal cipta channel trade:", err);
    return null;
  }
}
