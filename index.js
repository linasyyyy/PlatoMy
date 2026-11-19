import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  AttachmentBuilder,
} from "discord.js";
import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import puppeteer from "puppeteer-core"; // Ditukar kepada puppeteer-core untuk kestabilan Wispbyte
import cron from "node-cron";
import { registerDashboardApi } from "./dashboard-api.js";
import { loadWallets, startAutosave } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("RALAT: DISCORD_TOKEN tidak ditemui di dalam Environment Variables!");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const wallets = new Map();
const giveawaysMap = new Map(); // kosong, diperlukan oleh dashboard-api.js
const rumbleMap = new Map();
const acceptedTrades = new Set();

function getWallet(id) {
  if (!wallets.has(id)) wallets.set(id, { coins: 0, pips: 0, exp: 0, sponsorTotal: 0 });
  return wallets.get(id);
}

// Muat data dari PostgreSQL dan autosave (perlu DATABASE_URL di Railway)
await loadWallets(wallets);
startAutosave(wallets);

// --- TETAPAN BOT ---
const WALLET_LOG_CHANNEL_NAME = "wallet-log";
const TRADING_LIST_CHANNEL_NAME = "trading-list"; // channel permintaan item (private untuk role Trade)
const TRADING_LOG_CHANNEL_NAME = "trading-log";   // log: requester + accepter
const TRADE_ROLE_NAME = "trade";                  // role yang boleh Accept Trade (nama mengandungi perkataan ini)
const TRADER_ROLE_NAME = "trader";                // role yang di-ping bila ada trading list baru
const TRADE_CATEGORY_ID = "1567527038368223332";  // category untuk channel trade sementara

// ID channel log baharu (kalau ID tak dijumpai, bot cari ikut nama channel seperti dulu)
const LOG_CHANNEL_IDS = {
  [WALLET_LOG_CHANNEL_NAME]: "1569585830224461884",  // wallet log baharu
  [TRADING_LOG_CHANNEL_NAME]: "1569585956439461908", // ticket (trading) log baharu
};

const TRADE_MEDIA_URLS = [
  "https://cdn.discordapp.com/attachments/1556946394239991848/1562348900705374259/IMG_6986.gif?ex=6aeec24c&is=6aed70cc&hm=b4094237e998531634199814f373fd7d8827c9aa8dbb8d0ec626aeb70ca092e5&",
  "https://cdn.discordapp.com/attachments/1556946394239991848/1567858191537279016/20261105_190812_0000.png?ex=6aee5dfa&is=6aed0c7a&hm=703dd68300d271f1087bbbc0b932f49a379a78b33f00cdbef8a9f4ac80fd74c0&",
  "https://cdn.discordapp.com/attachments/1556946394239991848/1562348900705374259/IMG_6986.gif?ex=
