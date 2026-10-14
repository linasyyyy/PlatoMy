import {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  StringSelectMenuBuilder,
} from "discord.js";
import http from "http";
import url from "url";
import querystring from "querystring";

// 1. HIDUPKAN WEB SERVER UNTUK RENDER DULU
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<h1>PlatoMy Bot is Online!</h1>");
});

server.listen(PORT, () => {
  console.log(`Web server sedang berjalan pada port ${PORT}`);
});

// 2. SEMAK TOKEN DISCORD
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("RALAT: DISCORD_TOKEN tiada di environment variables!");
}

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMembers
  ] 
});

const wallets = new Map();
const eventsMap = new Map();
const birthdaysMap = new Map(); 
const giveawaysMap = new Map(); 
const rumbleMap = new Map(); 

const VERIFY_CHANNEL_ID = ""; 
const WALLET_LOG_ID = "";     
const BIRTHDAY_CHANNEL_ID = ""; 
const LEVEL_LOG_CHANNEL_NAME = "level-up";       
const TRADING_LOG_CHANNEL_NAME = "trading-log"; 
const REPORT_LOG_CHANNEL_NAME = "report-log";         
const WELCOME_CHANNEL_NAME = "selamat-datang";
const SERVER_LOGS_CHANNEL_NAME = "server-logs";
const UPDATE_CHANNEL_NAME = "plato-update";
const VERIFIED_ROLE_NAME = "Member";
const LOGO_URL = "https://cdn.discordapp.com/attachments/1549051773438787724/1549403998686281808/IMG_5614.png";

let lastPostedUpdateId = null;

const commands = [
  new SlashCommandBuilder().setName("wallet").setDescription("Semak baki akaun PlatoMy • Wallet anda! 🏦"),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Papar papan pendahulu (Leaderboard EXP & Server Points) 📊"),
  new SlashCommandBuilder().setName("setup-verify").setDescription("Hantar panel sahkan Plato ID (Admin sahaja)"),
  new SlashCommandBuilder().setName("setup-birthday").setDescription("Hantar panel Birthday Corner yang aesthetic (Admin sahaja)"),
  new SlashCommandBuilder().setName("setup-trading").setDescription("Hantar panel Trading Ticket sahaja (Admin sahaja)"),
  new SlashCommandBuilder().setName("setup-report").setDescription("Hantar panel Report Ticket sahaja (Admin sahaja)"),
  new SlashCommandBuilder().setName("setup-role-plato").setDescription("Hantar menu dropdown game role Plato (Admin sahaja)"),
].map(c => c.toJSON());

client.once(Events.ClientReady, async (c) => {
  console.log(`Bot berjaya login sebagai ${c.user.tag}!`);
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    await rest.put(Routes.applicationCommands(c.user.id), { body: commands });
    console.log("Slash commands berjaya di-register!");
  } catch (error) {
    console.error("Gagal mendaftarkan slash commands:", error);
  }
});

function getWallet(id) {
  if (!wallets.has(id)) wallets.set(id, { coins: 0, pips: 0, serverPoints: 0, sponsorTotal: 0 });
  return wallets.get(id);
}

client.on(Events.GuildMemberAdd, async (member) => {   
  const channel = member.guild.channels.cache.find(     
    (candidate) => candidate.name.includes(WELCOME_CHANNEL_NAME) && candidate.isTextBased()   
  );   
  if (!channel || !("send" in channel)) return;    

  const welcomeEmbed = new EmbedBuilder()     
    .setColor("#ffb6c1")     
    .setTitle("🌸SELAMAT DATANG!")     
    .setDescription(`Hai ${member}! 🖐️💕\nSelamat datang ke Plato MY!`)
    .setTimestamp();    

  await channel.send({ embeds: [welcomeEmbed] }); 
});  

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "wallet") {
      const w = getWallet(interaction.user.id);
      await interaction.reply({ content: `Coins: ${w.coins}`, ephemeral: true });
      return;
    }
  }
});

// 3. LOGIN KE DISCORD DENGAN PENGESAHAN RALAT
client.login(token).catch(err => {
  console.error("GAGAL LOGIN KE DISCORD:", err);
});
