import {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} from "discord.js";
import pkg from 'pg';
const { Pool } = pkg;

// Sambungkan ke Neon menggunakan DATABASE_URL dari Railway
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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
    GatewayIntentBits.GuildVoiceStates
  ] 
});

const tempVoiceOwners = new Map();

// --- INISIALISASI DATABASE NEON ---
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        user_id TEXT PRIMARY KEY,
        coins INT DEFAULT 0,
        pips INT DEFAULT 0,
        exp INT DEFAULT 0
      );
    `);
    console.log("Database Neon berjaya dihubungkan & table disahkan!");
  } catch (err) {
    console.error("Ralat membina table database:", err);
  }
}

const WELCOME_CHANNEL_NAME = "selamat-datang";

const commands = [
  new SlashCommandBuilder().setName("wallet").setDescription("Semak baki akaun PlatoMy • Wallet anda! 🏦"),
  new SlashCommandBuilder().setName("leaderboard").setDescription("Papar papan pendahulu (Leaderboard EXP) 📊"),
  new SlashCommandBuilder().setName("admin-wallet").setDescription("Urus baki akaun PlatoMy • Wallet ahli (Admin sahaja)")
    .addStringOption(opt => opt.setName("action").setDescription("Tindakan").setRequired(true).addChoices(
      { name: "Add Sponsor", value: "add_sponsor" },
      { name: "Add Coins", value: "add_coins" }, 
      { name: "Deduct Coins", value: "deduct_coins" },
      { name: "Add Pips", value: "add_pips" }, 
      { name: "Deduct Pips", value: "deduct_pips" }, 
      { name: "Check", value: "check" }
    ))
    .addUserOption(opt => opt.setName("target").setDescription("Ahli / Penaja").setRequired(true))
    .addIntegerOption(opt => opt.setName("amount").setDescription("Jumlah").setRequired(true))
    .addStringOption(opt => opt.setName("reason").setDescription("Sebab / Nota").setRequired(false)),
  new SlashCommandBuilder().setName("embed-image").setDescription("Hantar embed gambar ke channel pilihan (Admin sahaja)")
    .addChannelOption(opt => opt.setName("channel").setDescription("Pilih channel tujuan").setRequired(true))
    .addStringOption(opt => opt.setName("image_url").setDescription("Link URL gambar/GIF").setRequired(true))
    .addStringOption(opt => opt.setName("title").setDescription("Tajuk ringkas").setRequired(false)),
].map(c => c.toJSON());

client.once(Events.ClientReady, async (c) => {
  console.log(`Bot telah berjaya log masuk sebagai ${c.user.tag}!`);
  await initDatabase();

  const rest = new REST({ version: "10" }).setToken(token);
  try {
    await rest.put(Routes.applicationCommands(c.user.id), { body: commands });
    console.log("Slash commands berjaya di-register!");
  } catch (error) {
    console.error("Gagal mendaftarkan slash commands:", error);
  }
});

// Sistem Voice Channel Dinamik
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const member = newState.member;
  if (!member || member.user.bot) return;

  const creatorChannelName = "➕ Create Voice";

  if (newState.channel && newState.channel.name.toLowerCase() === creatorChannelName.toLowerCase()) {
    const guild = newState.guild;
    const parentCategory = newState.channel.parent;

    try {
      const userVc = await guild.channels.create({
        name: `ʚ₊˚🔊・${member.user.username}'s Room`,
        type: ChannelType.GuildVoice,
        parent: parentCategory ? parentCategory.id : null,
        permissionOverwrites: [
          { id: guild.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
          { id: member.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers] }
        ]
      });

      await member.voice.setChannel(userVc);
      tempVoiceOwners.set(userVc.id, member.id);
    } catch (err) {
      console.error("Gagal mencipta voice channel:", err);
    }
  }

  if (oldState.channel) {
    const leftChannel = oldState.channel;
    if (tempVoiceOwners.has(leftChannel.id) && leftChannel.members.size === 0) {
      tempVoiceOwners.delete(leftChannel.id);
      await leftChannel.delete().catch(() => {});
    }
  }
});

// Sistem Selamat Datang (Welcome)
client.on(Events.GuildMemberAdd, async (member) => {   
  const channel = member.guild.channels.cache.find(c => c.name.includes(WELCOME_CHANNEL_NAME) && c.isTextBased());   
  if (!channel || !("send" in channel)) return;    
  const welcomeEmbed = new EmbedBuilder()     
    .setColor("#F996B1")     
    .setTitle("🌸 SELAMAT DATANG!")     
    .setDescription(`Hai ${member}! 👤💕 Selamat datang ke Plato MY!`)
    .setTimestamp();    
  await channel.send({ embeds: [welcomeEmbed] }); 
});  

// Sistem EXP & Tracking Mesej Masuk (Simpan terus ke Neon)
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  const userId = message.author.id;

  try {
    await pool.query(`
      INSERT INTO wallets (user_id, exp) VALUES ($1, 2)
      ON CONFLICT (user_id) 
      DO UPDATE SET exp = wallets.exp + 2;
    `, [userId]);
  } catch (err) {
    console.error("Gagal kemas kini EXP ke database:", err);
  }

  const content = message.content.trim().toLowerCase();
  if (content === "!wallet" || content === "!bank") {
    try {
      const res = await pool.query("SELECT * FROM wallets WHERE user_id = $1", [userId]);
      const w = res.rows[0] || { coins: 0, pips: 0 };
      
      const embed = new EmbedBuilder()
        .setColor("#F996B1")
        .setTitle("💳 PlatoMy • Wallet")
        .setDescription(`🪙 **Plato Coins:** ${w.coins.toLocaleString()}\n💠 **Pips:** ${w.pips.toLocaleString()}`);
      await message.reply({ embeds: [embed] });
    } catch (err) {
      console.error("Ralat semak wallet:", err);
    }
  }
});

// Sistem Perintah Slash (Interactions)
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "wallet") {
    try {
      const res = await pool.query("SELECT * FROM wallets WHERE user_id = $1", [interaction.user.id]);
      const w = res.rows[0] || { coins: 0, pips: 0 };

      const embed = new EmbedBuilder()
        .setColor("#F996B1")
        .setTitle("💳 PlatoMy • Wallet")
        .setDescription(`🪙 **Plato Coins:** ${w.coins.toLocaleString()}\n💠 **Pips:** ${w.pips.toLocaleString()}`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error("Ralat command wallet:", err);
    }
  }

  if (interaction.commandName === "leaderboard") {
    try {
      const result = await pool.query("SELECT user_id, exp FROM wallets ORDER BY exp DESC LIMIT 10;");
      
      const desc = result.rows.length === 0 
        ? "Belum ada rekod EXP." 
        : result.rows.map((row, idx) => `${idx + 1}. <@${row.user_id}> — **${row.exp}** EXP`).join("\n");
      
      const embed = new EmbedBuilder()
        .setColor("#F996B1")
        .setTitle("📊 PlatoMy Leaderboard (Top 10 Crystal Masters)")
        .setDescription(desc)
        .setFooter({ text: "Tema: Hitam & Pink Y2K Crystal" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error("Gagal ambil leaderboard:", err);
      await interaction.reply({ content: "❌ Ralat mengambil data leaderboard.", ephemeral: true });
    }
  }

  if (interaction.commandName === "admin-wallet") {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
    }

    const action = interaction.options.getString("action");
    const target = interaction.options.getUser("target");
    const amount = interaction.options.getInteger("amount");
    const targetId = target.id;

    try {
      // Pastikan rekod user wujud dalam database
      await pool.query(`
        INSERT INTO wallets (user_id, coins, pips, exp) VALUES ($1, 0, 0, 0)
        ON CONFLICT (user_id) DO NOTHING;
      `, [targetId]);

      if (action === "add_coins") {
        await pool.query("UPDATE wallets SET coins = coins + $1 WHERE user_id = $2", [amount, targetId]);
        await interaction.reply({ content: `✅ Berjaya tambah **${amount}** Coins kepada ${target}!`, ephemeral: true });
      } else if (action === "deduct_coins") {
        await pool.query("UPDATE wallets SET coins = GREATEST(0, coins - $1) WHERE user_id = $2", [amount, targetId]);
        await interaction.reply({ content: `✅ Berjaya potong **${amount}** Coins daripada ${target}!`, ephemeral: true });
      } else if (action === "add_pips") {
        await pool.query("UPDATE wallets SET pips = pips + $1 WHERE user_id = $2", [amount, targetId]);
        await interaction.reply({ content: `✅ Berjaya tambah **${amount}** Pips kepada ${target}!`, ephemeral: true });
      } else if (action === "deduct_pips") {
        await pool.query("UPDATE wallets SET pips = GREATEST(0, pips - $1) WHERE user_id = $2", [amount, targetId]);
        await interaction.reply({ content: `✅ Berjaya potong **${amount}** Pips daripada ${target}!`, ephemeral: true });
      } else if (action === "check") {
        const res = await pool.query("SELECT * FROM wallets WHERE user_id = $1", [targetId]);
        const w = res.rows[0];
        await interaction.reply({ content: `🔍 **Baki ${target.username}:**\n🪙 Coins: ${w.coins}\n💠 Pips: ${w.pips}\n⚡ EXP: ${w.exp}`, ephemeral: true });
      }
    } catch (err) {
      console.error("Ralat admin-wallet:", err);
      await interaction.reply({ content: "❌ Ralat semasa memproses arahan admin wallet.", ephemeral: true });
    }
  }

  if (interaction.commandName === "embed-image") {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "❌ Anda tidak mempunyai kebenaran Administrator!", ephemeral: true });
    }
    const targetChannel = interaction.options.getChannel("channel");
    const imageUrl = interaction.options.getString("image_url");
    const title = interaction.options.getString("title") || "PlatoMy Announcement";

    const embed = new EmbedBuilder()
      .setColor("#F996B1")
      .setTitle(title)
      .setImage(imageUrl)
      .setTimestamp();

    await targetChannel.send({ embeds: [embed] });
    await interaction.reply({ content: `✅ Embed berjaya dihantar ke <#${targetChannel.id}>!`, ephemeral: true });
  }
});

client.login(token).catch(err => {
  console.error("GAGAL LOGIN KE DISCORD:", err);
});
