/**
 * Auricle data pipeline — bakes REAL climate data to src/data/*.json.
 *
 * Run:  npm run fetch-data   (alias for: npx tsx scripts/fetch-data.ts)
 *
 * Every series is fetched from a real, keyless public source at build time and
 * written to disk so judges can `npm run build` with no network access.
 * NO values are hand-invented. Sources:
 *   - NASA GISTEMP v4 (keyless CSV)            https://data.giss.nasa.gov/gistemp/
 *   - Our World in Data grapher CSVs (keyless) https://ourworldindata.org/grapher/
 *   - NOAA GML Mauna Loa weekly CO₂ (keyless)  https://gml.noaa.gov/ccgg/trends/
 *
 * Each output file uses the envelope:
 *   { source, source_url, fetched_at, unit, note, ...series }
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "src", "data");
const FETCHED_AT = new Date().toISOString();

// --------------------------------------------------------------------------
// small helpers
// --------------------------------------------------------------------------

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": "auricle-data-pipeline" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function write(name: string, obj: unknown): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(resolve(DATA_DIR, name), JSON.stringify(obj, null, 2) + "\n", "utf8");
  console.log(`  ✓ wrote src/data/${name}`);
}

/** Quote-aware CSV parser (handles commas inside quoted entity names). */
function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { record.push(field); field = ""; }
    else if (c === "\n") { record.push(field); rows.push(record); field = ""; record = []; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || record.length) { record.push(field); rows.push(record); }
  const header = rows.shift() ?? [];
  return rows
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx] ?? ""])));
}

// --------------------------------------------------------------------------
// 1. HERO — NASA GISTEMP annual global mean temperature anomaly (°C)
//    The J-D column is the January–December annual mean vs the 1951–1980
//    baseline. Incomplete years print "***" and are skipped (never guessed).
// --------------------------------------------------------------------------

const GISTEMP_CSV = "https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv";

async function buildTempAnomaly() {
  console.log("[1/4] global temperature anomaly (NASA GISTEMP v4)…");
  const raw = await getText(GISTEMP_CSV);
  // First line is a human title ("Land-Ocean: Global Means"); the CSV starts at line 2.
  const csv = raw.slice(raw.indexOf("\n") + 1);
  const rows = parseCSV(csv);

  const points = rows
    .filter((r) => /^\d{4}$/.test(r.Year) && r["J-D"] && r["J-D"] !== "***")
    .map((r) => ({ x: Number(r.Year), y: Number(r["J-D"]) }))
    .filter((p) => Number.isFinite(p.y))
    .sort((a, b) => a.x - b.x);

  if (points.length < 100) throw new Error(`GISTEMP series too short (${points.length} years)`);
  const peak = points.reduce((m, p) => (p.y > m.y ? p : m));
  console.log(`      ${points.length} years ${points[0].x}–${points[points.length - 1].x}; max ${peak.y} °C in ${peak.x}`);

  await write("temp-anomaly.json", {
    source: "NASA GISS Surface Temperature Analysis (GISTEMP v4), annual global mean",
    source_url: GISTEMP_CSV,
    fetched_at: FETCHED_AT,
    unit: "°C anomaly vs the 1951–1980 average",
    note:
      `Annual (J-D) global mean land–ocean temperature anomaly, ${points[0].x}–${points[points.length - 1].x}. ` +
      `The 19th-century readings sit around −0.2 °C; the curve crosses zero in the late 1970s and accelerates, ` +
      `peaking at +${peak.y} °C in ${peak.x} — the warmest year in the instrumental record. Incomplete years are omitted, not estimated.`,
    points,
  });
}

// --------------------------------------------------------------------------
// 2. CO₂ emitters — OWID annual fossil CO₂: global total series + latest-year
//    values for the six biggest emitting economies. The grapher "filtered" CSV
//    keeps the download tiny (vs the ~60 MB full owid-co2-data.csv).
// --------------------------------------------------------------------------

const EMITTER_ENTITIES = "CHN~USA~IND~OWID_EU27~RUS~JPN~OWID_WRL";
const OWID_EMITTERS_CSV =
  "https://ourworldindata.org/grapher/annual-co2-emissions-per-country.csv" +
  `?csvType=filtered&useColumnShortNames=true&country=${EMITTER_ENTITIES}`;

async function buildEmitters() {
  console.log("[2/4] CO₂ emissions by country (Our World in Data / Global Carbon Budget)…");
  const rows = parseCSV(await getText(OWID_EMITTERS_CSV));

  const toMt = (t: string) => Math.round(Number(t) / 1e6); // tonnes → million tonnes

  const world = rows
    .filter((r) => r.code === "OWID_WRL" && Number(r.year) >= 1850 && r.emissions_total)
    .map((r) => ({ x: Number(r.year), y: toMt(r.emissions_total) }))
    .sort((a, b) => a.x - b.x);
  if (world.length < 100) throw new Error(`world CO₂ series too short (${world.length} years)`);

  const latestYear = world[world.length - 1].x;
  const NAME_SHORT: Record<string, string> = {
    CHN: "China",
    USA: "United States",
    IND: "India",
    OWID_EU27: "EU-27",
    RUS: "Russia",
    JPN: "Japan",
  };
  const emitters = Object.keys(NAME_SHORT)
    .map((code) => {
      const r = rows
        .filter((row) => row.code === code && row.emissions_total)
        .sort((a, b) => Number(a.year) - Number(b.year))
        .at(-1);
      if (!r) throw new Error(`no emissions rows for ${code}`);
      return { country: NAME_SHORT[code], code, year: Number(r.year), value: toMt(r.emissions_total) };
    })
    .sort((a, b) => b.value - a.value);

  const worldLast = world[world.length - 1];
  console.log(
    `      world ${worldLast.y.toLocaleString()} Mt in ${worldLast.x}; top emitter ${emitters[0].country} ` +
    `${emitters[0].value.toLocaleString()} Mt (${emitters[0].year})`,
  );

  await write("co2-emitters.json", {
    source: "Our World in Data — Annual CO₂ emissions (Global Carbon Budget)",
    source_url: OWID_EMITTERS_CSV,
    fetched_at: FETCHED_AT,
    unit: "million tonnes of CO₂ per year (fossil fuels + industry)",
    note:
      `Global fossil CO₂ emissions ${world[0].x}–${latestYear}: from ~${world[0].y.toLocaleString()} Mt in ${world[0].x} ` +
      `to a record ${worldLast.y.toLocaleString()} Mt in ${worldLast.x} — still rising. The latest-year bars rank the six ` +
      `biggest emitting economies; ${emitters[0].country} alone emits ${emitters[0].value.toLocaleString()} Mt, ` +
      `more than the next two combined.`,
    global_series: world,
    emitters_latest: emitters,
  });
}

// --------------------------------------------------------------------------
// 3. Scatter — GDP per capita vs CO₂ per capita, latest common year, a spread
//    of ~26 countries across income levels (OWID co2-emissions-vs-gdp grapher).
//    Country SELECTION is editorial; every value is fetched, never typed in.
// --------------------------------------------------------------------------

const OWID_GDP_CSV =
  "https://ourworldindata.org/grapher/co2-emissions-vs-gdp.csv?csvType=full&useColumnShortNames=true";

/** A deliberate spread across income levels (selection, not data). */
const SCATTER_CODES = [
  "USA", "CHE", "NOR", "AUS", "CAN", "DEU", "JPN", "KOR", "GBR", "FRA",
  "POL", "RUS", "CHN", "MEX", "BRA", "TUR", "ZAF", "IDN", "IND", "VNM",
  "EGY", "NGA", "KEN", "BGD", "PAK", "ETH",
];

async function buildWealthCarbon() {
  console.log("[3/4] GDP per capita vs CO₂ per capita (Our World in Data)…");
  const rows = parseCSV(await getText(OWID_GDP_CSV));
  const wanted = new Set(SCATTER_CODES);

  // Latest year where BOTH values exist for (nearly) every selected country.
  const byYear = new Map<number, Map<string, { country: string; gdp: number; co2: number }>>();
  for (const r of rows) {
    if (!wanted.has(r.code)) continue;
    const gdp = Number(r.gdp_per_capita);
    const co2 = Number(r.emissions_total_per_capita);
    if (!r.gdp_per_capita || !r.emissions_total_per_capita) continue;
    if (!Number.isFinite(gdp) || !Number.isFinite(co2)) continue;
    const year = Number(r.year);
    if (!byYear.has(year)) byYear.set(year, new Map());
    byYear.get(year)!.set(r.code, { country: r.entity, gdp, co2 });
  }
  const year = [...byYear.entries()]
    .filter(([, m]) => m.size >= SCATTER_CODES.length - 2)
    .map(([y]) => y)
    .sort((a, b) => b - a)[0];
  if (!year) throw new Error("no common year with GDP + CO₂ per capita for the selected countries");

  const m = byYear.get(year)!;
  const points = SCATTER_CODES
    .filter((code) => m.has(code))
    .map((code) => {
      const v = m.get(code)!;
      return { country: v.country, code, x: Math.round(v.gdp), y: Number(v.co2.toFixed(2)) };
    })
    .sort((a, b) => a.x - b.x);
  if (points.length < 20) throw new Error(`scatter too sparse (${points.length} countries)`);

  const top = points.reduce((mx, p) => (p.y > mx.y ? p : mx));
  console.log(`      ${points.length} countries, year ${year}; highest per-capita ${top.country} ${top.y} t`);

  await write("wealth-carbon.json", {
    source: "Our World in Data — CO₂ emissions per capita vs GDP per capita (Global Carbon Budget; Maddison Project)",
    source_url: OWID_GDP_CSV,
    fetched_at: FETCHED_AT,
    unit: "x = GDP per capita (international-$, 2011 prices); y = tonnes CO₂ per person per year",
    note:
      `${points.length} countries across income levels in ${year} (the latest year with both series). ` +
      `Wealth and carbon are strongly linked: per-capita emissions run from under 0.5 t in the poorest economies ` +
      `to ${top.y} t (${top.country}) — but countries at similar incomes differ several-fold, so the link is not destiny.`,
    year,
    x_label: "GDP per capita (international-$)",
    y_label: "CO₂ per capita (t/year)",
    points,
  });
}

// --------------------------------------------------------------------------
// 4. LIVE — NOAA Mauna Loa weekly mean CO₂ (ppm). Comment-prefixed CSV; the
//    last ~76 valid weeks are baked and the runtime replays the latest value
//    as a clearly-labelled simulated live feed.
// --------------------------------------------------------------------------

const NOAA_WEEKLY_CSV = "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_weekly_mlo.csv";
const LIVE_WEEKS = 76;

async function buildCo2Live() {
  console.log("[4/4] CO₂ at Mauna Loa, weekly (NOAA GML)…");
  const raw = await getText(NOAA_WEEKLY_CSV);
  // Strip the "#"-prefixed license/description header lines.
  const csv = raw.split("\n").filter((l) => !l.startsWith("#")).join("\n");
  const rows = parseCSV(csv);

  const all = rows
    .filter((r) => r.year && r.average && Number(r.average) > 0) // −999.99 = missing week
    .map((r) => ({
      x: `${r.year}-${String(Number(r.month)).padStart(2, "0")}-${String(Number(r.day)).padStart(2, "0")}`,
      y: Number(Number(r.average).toFixed(2)),
    }))
    .sort((a, b) => (a.x < b.x ? -1 : 1));
  if (all.length < LIVE_WEEKS) throw new Error(`NOAA weekly series too short (${all.length})`);

  const points = all.slice(-LIVE_WEEKS);
  const last = points[points.length - 1];
  console.log(`      ${points.length} weeks ${points[0].x} → ${last.x}; latest ${last.y} ppm`);

  await write("co2-live.json", {
    source: "NOAA Global Monitoring Laboratory — Mauna Loa weekly mean CO₂",
    source_url: NOAA_WEEKLY_CSV,
    fetched_at: FETCHED_AT,
    unit: "parts per million (ppm), weekly mean at Mauna Loa Observatory",
    note:
      `The last ${points.length} real weekly means (${points[0].x} to ${last.x}), latest ${last.y} ppm — ` +
      `versus ~280 ppm pre-industrial. The sawtooth is the Northern Hemisphere's breathing (May peak, ` +
      `September trough) on a relentless upward trend. The runtime replays tiny perturbations from the ` +
      `real latest value as a clearly-labelled simulated live feed.`,
    live_simulated: true,
    points,
  });
}

// --------------------------------------------------------------------------

async function main() {
  console.log(`Auricle data pipeline — writing to ${DATA_DIR}`);
  console.log(`fetched_at = ${FETCHED_AT}\n`);
  await buildTempAnomaly();
  await buildEmitters();
  await buildWealthCarbon();
  await buildCo2Live();
  console.log("\nDone. All four climate datasets baked to src/data/.");
}

main().catch((err) => {
  console.error("\nfetch-data FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
