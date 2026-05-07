import { createHash } from "node:crypto";
import {
  readCache as libReadCache,
  writeCache as libWriteCache,
} from "./cache.js";

const CACHE_DIR = ".cache/geocoding";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function cacheKey(address) {
  return createHash("sha256").update(address).digest("hex");
}

async function readCache(address) {
  return libReadCache(CACHE_DIR, cacheKey(address), CACHE_TTL_MS);
}

async function writeCache(address, lat, lon) {
  return libWriteCache(CACHE_DIR, cacheKey(address), { lat, lon });
}

function parseCoordinates(str) {
  const [lat, lon] = str.split(",").map((s) => parseFloat(s.trim()));
  return { lat, lon };
}

export async function resolveLocation(location, apiKey) {
  if (location.coordinates) {
    return { ...parseCoordinates(location.coordinates), source: "coordinates" };
  }

  const result = await geocode(location.address, apiKey);
  if (!result) return null;

  return {
    lat: result.lat,
    lon: result.lon,
    source: result.cached ? "cached" : "geocoded",
  };
}

export async function geocode(address, apiKey) {
  const cached = await readCache(address);
  if (cached) return { ...cached, cached: true };

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) return null;

  const json = await response.json();
  if (json.status !== "OK" || !json.results.length) {
    console.warn(
      `  WARN: geocoding API returned status ${json.status} for "${address}"`,
    );
    return null;
  }

  const { lat, lng } = json.results[0].geometry.location;
  await writeCache(address, lat, lng);
  return { lat, lon: lng, cached: false };
}
