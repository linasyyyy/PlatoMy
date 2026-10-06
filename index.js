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

// --- LAMAN WEB DASHBOARD COMEL PLATOMY ---
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`
    <!DOCTYPE html>
    <html lang="ms">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PlatoMy • Dashboard</title>
        <style>
            body {
                background-color: #fff0f3;
                color: #59484b;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                text-align: center;
                padding-top: 50px;
            }
            .card {
                background: white;
                max-width: 500px;
                margin: 0 auto;
                padding: 40px;
                border-radius: 20px;
                box-shadow: 0 10px 25px rgba(255, 182, 193, 0.4);
                border: 2px solid #ffb6c1;
            }
            h1 {
                color: #ff69b4;
                font-size: 28px;
                margin-bottom: 10px;
            }
            p {
                font-size: 16px;
                line-height: 1.6;
            }
            .badge {
                display: inline-block;
                background-color: #ffb6c1;
                color: white;
                padding: 8px 16px;
                border-radius: 50px;
                font-weight: bold;
                margin-top: 20px;
            }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>🌸 PlatoMy Community Hub 🌸</h1>
            <p>Hai! Selamat datang ke laman web rasmi / dashboard bot PlatoMy. Bot kini sedang aktif dan siap sedia menjaga server Discord kita! ♡</p>
            <div class="badge">✨ Status: Online & Running</div>
        </div>
    </body>
    </html>
  `);
});
server.listen(process.env.PORT || 3000);
