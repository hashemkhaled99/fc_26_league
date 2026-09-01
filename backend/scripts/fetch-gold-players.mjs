/**
 * Fetch FC26 gold players (OVR 75+) from EA ratings API
 * and write a clean, validated seed file.
 *
 * Run: npm run players:fetch
 */

import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_URL =
  "https://api.msmc.cc/api/eafc/players?game=fc26&update=2&ovr%3E74";

const ALLOWED_POSITIONS = new Set([
  "GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST",
]);

function marketValueFromOvr(ovr) {
  if (ovr >= 91) return 100_000_000 + (ovr - 91) * 15_000_000;
  if (ovr >= 88) return 70_000_000 + (ovr - 88) * 10_000_000;
  if (ovr >= 85) return 45_000_000 + (ovr - 85) * 8_000_000;
  if (ovr >= 82) return 28_000_000 + (ovr - 82) * 5_000_000;
  if (ovr >= 80) return 18_000_000 + (ovr - 80) * 4_000_000;
  if (ovr >= 78) return 10_000_000 + (ovr - 78) * 3_000_000;
  return 4_000_000 + (ovr - 75) * 2_000_000;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "fc26-auction-league/1.0" } }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

function cleanPlayer(raw) {
  const ovr = parseInt(raw.ovr, 10);
  const name = String(raw.name ?? "").trim();
  const team = String(raw.team ?? "").trim();
  const position = String(raw.position ?? "").trim().toUpperCase();
  const eaId = String(raw.id ?? "").trim();

  if (!eaId || !name || !team) return null;
  if (!Number.isFinite(ovr) || ovr < 75 || ovr > 99) return null;
  if (!ALLOWED_POSITIONS.has(position)) return null;

  return {
    eaId,
    name,
    realTeam: team,
    position,
    baseRating: ovr,
    marketValue: marketValueFromOvr(ovr),
    nation: String(raw.nation ?? "").trim() || null,
    league: String(raw.league ?? "").trim() || null,
    gender: raw.gender === "F" ? "F" : "M",
    cardImage: String(raw.card ?? "").trim() || null,
  };
}

async function main() {
  console.log("Fetching FC26 gold players (OVR 75+)...");
  const raw = await fetchJson(API_URL);
  if (!Array.isArray(raw)) throw new Error("API did not return an array");

  const seen = new Set();
  const cleaned = [];
  let skipped = 0;

  for (const row of raw) {
    const p = cleanPlayer(row);
    if (!p) {
      skipped++;
      continue;
    }
    if (seen.has(p.eaId)) {
      skipped++;
      continue;
    }
    seen.add(p.eaId);
    cleaned.push(p);
  }

  cleaned.sort((a, b) => b.baseRating - a.baseRating || a.name.localeCompare(b.name));

  const outDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(outDir, { recursive: true });

  const payload = {
    source: "api.msmc.cc/api/eafc (EA FC26 ratings)",
    game: "fc26",
    update: "2",
    rarity: "gold",
    minOverall: 75,
    fetchedAt: new Date().toISOString(),
    count: cleaned.length,
    men: cleaned.filter((p) => p.gender === "M").length,
    women: cleaned.filter((p) => p.gender === "F").length,
    players: cleaned,
  };

  const outPath = path.join(outDir, "fc26-gold-players.json");
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");

  console.log(`Saved ${cleaned.length} players → data/fc26-gold-players.json`);
  console.log(`  Men: ${payload.men}  Women: ${payload.women}  Skipped: ${skipped}`);
  console.log(`  Top 5: ${cleaned.slice(0, 5).map((p) => `${p.name} (${p.baseRating})`).join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
