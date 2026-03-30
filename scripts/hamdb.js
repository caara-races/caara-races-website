import {
  readCache as libReadCache,
  writeCache as libWriteCache,
} from "./lib/cache.js";
import { escapeHtml } from "./lib/escape.js";

const CACHE_DIR = ".cache/hamdb";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const LICENSE_CLASSES = {
  T: "Technician",
  G: "General",
  E: "Extra",
  A: "Advanced",
};

export async function readCache(callsign) {
  return libReadCache(CACHE_DIR, callsign.toUpperCase(), CACHE_TTL_MS);
}

export async function writeCache(callsign, data) {
  return libWriteCache(CACHE_DIR, callsign.toUpperCase(), data);
}

export async function lookupHamDb(callsign) {
  const cached = await readCache(callsign);
  if (cached !== null) return cached;

  const response = await fetch(
    `http://api.hamdb.org/${callsign}/json/caara-races`,
  );
  if (!response.ok) return null;

  const json = await response.json();
  const data = json?.hamdb?.callsign;
  const status = json?.hamdb?.messages?.status;
  if (!data || status !== "OK") return null;

  await writeCache(callsign, data);
  return data;
}

export function buildTooltip(callsign, data) {
  if (!data) return callsign;

  const cls = LICENSE_CLASSES[data.class] ?? data.class;
  const name = escapeHtml(`${data.fname} ${data.name}`.trim());
  const city = escapeHtml(data.addr2 ?? "");
  const state = escapeHtml(data.state ?? "");
  const location = `${city}, ${state}`;

  const lines = [`${callsign} (${escapeHtml(cls)})`, name, location].join(
    "&#10;",
  );

  return `<abbr title="${lines}">${callsign}</abbr>`;
}

export async function hamDbTooltip(callsign) {
  if (!callsign) return callsign;
  try {
    const data = await lookupHamDb(callsign);
    return buildTooltip(callsign, data);
  } catch {
    return callsign;
  }
}
