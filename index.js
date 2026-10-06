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

// --- LAMAN WEB DASHBOARD LENGKAP PLATOMY ---
const server = http.createServer((req, res) => {
  // 1. Leaderboard Data
  const sortedWallets = [...wallets.entries()]
    .sort((a, b) => b[1].serverPoints - a[1].serverPoints)
    .slice(0, 5);

  let leaderboardRows = "";
  if (sortedWallets.length === 0) {
    leaderboardRows = "<tr><td colspan='3' style='color: #888;'>Belum ada rekod EXP lagi.</td></tr>";
  } else {
    const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
    sortedWallets.forEach(([userId, data], index) => {
      const medalIcon = medals[index] || `#${index + 1}`;
      const estimatedLevel = Math.floor(data.serverPoints / 100) + 1;
      leaderboardRows += `
        <tr>
          <td>${medalIcon}</td>
          <td><@${userId}></td>
          <td><b>Lvl ${estimatedLevel}</b> (${data.serverPoints.toLocaleString()} pts)</td>
        </tr>
      `;
    });
  }

  // 2. Giveaway Aktif Data
  let giveawayRows = "";
  if (giveawaysMap.size === 0) {
    giveawayRows = "<tr><td colspan='2' style='color: #888;'>Tiada giveaway aktif buat masa ini.</td></tr>";
  } else {
    for (const [_, gw] of giveawaysMap.entries()) {
      giveawayRows += `
        <tr>
          <td>🎁 <b>${gw.prize}</b></td>
          <td>👥 ${gw.participants.length} Penyertaan</td>
        </tr>
      `;
    }
  }

  // 3. Birthday Corner Data
  let birthdayRows = "";
  if (birthdaysMap.size === 0) {
    birthdayRows = "<tr><td colspan='2' style='color: #888;'>Tiada tarikh lahir direkodkan lagi.</td></tr>";
  } else {
    for (const [userId, bData] of birthdaysMap.entries()) {
      birthdayRows += `
        <tr>
          <td>🌸 <b>${bData.dateStr}</b></td>
          <td><@${userId}></td>
        </tr>
      `;
    }
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`
    <!DOCTYPE html>
    <html lang="ms">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PlatoMy • Complete Dashboard</title>
        <style>
            body {
                background-color: #fff0f3;
                color: #59484b;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                text-align: center;
                padding: 20px 10px;
            }
            .container {
                max-width: 700px;
                margin: 0 auto;
            }
            .card {
                background: white;
                padding: 25px;
                border-radius: 20px;
                box-shadow: 0 10px 25px rgba(255, 182, 193, 0.4);
                border: 2px solid #ffb6c1;
                margin-bottom: 20px;
            }
            h1 {
                color: #ff69b4;
                font-size: 24px;
                margin-bottom: 5px;
            }
            h3 {
                color: #ff69b4;
                font-size: 18px;
                margin-top: 20px;
                margin-bottom: 10px;
            }
            p {
                font-size: 14px;
                line-height: 1.5;
            }
            .badge {
                display: inline-block;
                background-color: #ffb6c1;
                color: white;
                padding: 5px 12px;
                border-radius: 50px;
                font-weight: bold;
                font-size: 13px;
                margin-bottom: 15px;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                background: #fff8f9;
                border-radius: 10px;
                overflow: hidden;
                margin-bottom: 10px;
            }
            th, td {
                padding: 8px 10px;
                border-bottom: 1px solid #ffe4e6;
                font-size: 13px;
                text-align: center;
            }
            th {
                background-color: #ffb6c1;
                color: white;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="card">
                <h1>🌸 PlatoMy Community Hub 🌸</h1>
                <div class="badge">✨ Status: Online & Running</div>
                <p>Selamat datang ke pusat pemantauan rasmi komuniti PlatoMy! Semua aktiviti server terpapar di sini secara langsung. ♡</p>
            </div>

            <div class="card">
                <h3>📊 Top 5 Live Leaderboard (EXP)</h3>
                <table>
                    <tr><th>Rank</th><th>User</th><th>Level & Points</th></tr>
                    ${leaderboardRows}
                </table>
            </div>

            <div class="card">
                <h3>🎉 Giveaway Aktif Sekarang</h3>
                <table>
                    <tr><th>Hadiah</th><th>Penyertaan</th></tr>
                    ${giveawayRows}
                </table>
            </div>

            <div class="card">
                <h3>🎂 Birthday Corner</h3>
                <table>
                    <tr><th>Tarikh Lahir</th><th>Ahli</th></tr>
                    ${birthdayRows}
                </table>
            </div>
        </div>
    </body>
    </html>
  `);
});
server.listen(process.env.PORT || 3000);
