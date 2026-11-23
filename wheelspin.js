import { createCanvas, loadImage } from "@napi-rs/canvas";
import GIFEncoder from "gif-encoder-2";

// Palet warna disesuaikan dengan Logo PlatoMy (Glossy Pink, Berry & Dark Plum)
const COLORS = [
  "#FF7EB6", // Glossy Pink (warna utama logo)
  "#261024", // Dark Plum (warna kad leaderboard)
  "#D94E8A", // Vibrant Berry Pink
  "#140915", // Deep Black-Plum
  "#FFA6CE", // Soft Pastel Pink (highlight logo)
  "#5E2346", // Rich Plum
];

function cleanLabel(name) {
  const normalized = String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const safe = normalized || "Player";
  return safe.length > 14 ? safe.slice(0, 13) + "..." : safe;
}

export async function generateWheelGif(entries, winnerName, options = {}) {
  const {
    title = "Wheel Spin",
    subtitle = "PlatoMy • Event",
    logoPath = "./:assets:platomy-logo.png.PNG",
  } = options;

  const logo = logoPath ? await loadImage(logoPath).catch(() => null) : null;

  let slices = [...entries];
  if (slices.length > 20) {
    const others = slices.filter((n) => n !== winnerName).slice(0, 19);
    slices = [winnerName, ...others].sort(() => Math.random() - 0.5);
  }

  const winnerIndex = slices.indexOf(winnerName);
  const width = 720;
  const height = 820;
  const centerX = width / 2;
  const centerY = 450;
  const radius = 270;
  const sliceAngle = (Math.PI * 2) / slices.length;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const encoder = new GIFEncoder(width, height);
  encoder.setRepeat(-1);
  encoder.setDelay(65);
  encoder.setQuality(5);
  encoder.start();

  const totalFrames = 55;
  const fullSpins = 4 * Math.PI * 2;
  const randomOffset = (Math.random() - 0.5) * sliceAngle * 0.7;
  const targetAngle = -(winnerIndex + 0.5) * sliceAngle + randomOffset;
  const finalRotation =
    fullSpins + (((targetAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));

  const fontSize = slices.length > 12 ? 18 : 22;

  for (let f = 0; f <= totalFrames; f++) {
    const progress = f / totalFrames;
    const ease = 1 - Math.pow(1 - progress, 3);
    const rotation = finalRotation * ease;

    // 1. Latar belakang gradien kad (Gaya Leaderboard)
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, "#3A1530");
    bgGrad.addColorStop(0.5, "#1E0D20");
    bgGrad.addColorStop(1, "#0D060E");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Glow merah jambu di bahagian atas
    const glow = ctx.createRadialGradient(centerX, 95, 16, centerX, 95, 380);
    glow.addColorStop(0, "rgba(255, 126, 182, 0.25)");
    glow.addColorStop(1, "rgba(255, 126, 182, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    // Bingkai kad nipis
    ctx.strokeStyle = "rgba(255, 153, 204, 0.35)";
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, width - 28, height - 28);

    // 2. Tajuk (Gaya Leaderboard)
    ctx.textAlign = "center";
    ctx.fillStyle = "#FF99C8";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(subtitle, centerX, 62);

    ctx.fillStyle = "#FFD6EB";
    ctx.font = "italic bold 48px Georgia, serif";
    ctx.fillText(title, centerX, 118);

    // 3. Bingkai luar roda
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 12, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 126, 182, 0.5)";
    ctx.lineWidth = 5;
    ctx.stroke();

    // 4. Lukis setiap bahagian roda
    for (let i = 0; i < slices.length; i++) {
      const start = rotation + i * sliceAngle;
      const end = start + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();
      ctx.strokeStyle = "#140915";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Nama peserta (teks gelap untuk warna pastel cerah, putih untuk warna gelap)
      const isLightSlice = i % COLORS.length === 0 || i % COLORS.length === 4;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(start + sliceAngle / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = isLightSlice ? "#1E091A" : "#FFF0F6";
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillText(cleanLabel(slices[i]), radius - 22, Math.round(fontSize / 3));
      ctx.restore();
    }

    // 5. Bulatan tengah hitam pekat supaya sebati dengan latar logo PlatoMy
    const hubRadius = 62;
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, hubRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = "#000000";
    ctx.fill();
    if (logo) {
      ctx.clip();
      const pad = 6;
      ctx.drawImage(
        logo,
        centerX - hubRadius + pad,
        centerY - hubRadius + pad,
        (hubRadius - pad) * 2,
        (hubRadius - pad) * 2
      );
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(centerX, centerY, hubRadius, 0, Math.PI * 2);
    ctx.strokeStyle = "#FF85C0";
    ctx.lineWidth = 5;
    ctx.stroke();

    // 6. Penunjuk (Pointer) warna emas lembut
    ctx.beginPath();
    ctx.moveTo(centerX + radius + 26, centerY - 18);
    ctx.lineTo(centerX + radius + 26, centerY + 18);
    ctx.lineTo(centerX + radius - 16, centerY);
    ctx.closePath();
    ctx.fillStyle = "#F4C27F";
    ctx.fill();
    ctx.strokeStyle = "#140915";
    ctx.lineWidth = 3;
    ctx.stroke();

    // 7. Footer kecil
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 153, 200, 0.75)";
    ctx.font = "18px sans-serif";
    ctx.fillText("PlatoMy • Wheel Spin", centerX, height - 32);

    if (f === totalFrames) encoder.setDelay(2000);
    encoder.addFrame(ctx);
  }

  encoder.finish();
  return encoder.out.getData();
}
