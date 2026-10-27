// Weather from Open-Meteo (open-meteo.com): free, no key, data under CC BY 4.0.
// One shared copy per page, refreshed every 30 minutes and cached locally so the
// island shows the last known weather straight away (and while offline).

import { settings, onSettings, type Place } from "./settings";

export type Sky = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export interface Day {
  /** YYYY-MM-DD */
  date: string;
  code: number;
  max: number;
  min: number;
  /** Chance of rain, %. */
  rain: number | null;
  /** Strongest wind of the day, km/h (mph with °F). */
  wind?: number;
}

/** One hour of the forecast. */
export interface Hour {
  /** Local time, "YYYY-MM-DDTHH:00". */
  time: string;
  temp: number;
  code: number;
  day: boolean;
  humidity: number;
  rain: number;
  wind: number;
  feels: number;
}

export interface Weather {
  place: string;
  unit: "c" | "f";
  temp: number;
  feels: number;
  humidity: number;
  wind: number;
  code: number;
  day: boolean;
  days: Day[];
  /** Hour by hour for the same days (older caches may lack it). */
  hours?: Hour[];
  /** When it was fetched (ms). */
  at: number;
}

const REFRESH_MS = 30 * 60 * 1000;
const CACHE_KEY = "komori.weather";

let current: Weather | null = readCache();
let failed = false;
let timer: number | null = null;
let started = false;
const listeners = new Set<(w: Weather | null) => void>();

function readCache(): Weather | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Weather) : null;
  } catch {
    return null;
  }
}

function writeCache(w: Weather) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(w));
  } catch {
    // Storage may be unavailable; the weather still works without the cache.
  }
}

/** The last known weather for the chosen place (null until the first answer). */
export function weather(): Weather | null {
  const s = settings().weather;
  if (!current || current.place !== s.place.name || current.unit !== s.unit) return null;
  return current;
}

/** True when the last attempt failed and there is nothing to show. */
export function weatherFailed(): boolean {
  return failed && !weather();
}

/** Follow weather updates; returns a function that stops following. */
export function onWeather(fn: (w: Weather | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(weather());
}

async function fetchWeather(place: Place, unit: "c" | "f"): Promise<Weather> {
  const q = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max",
    hourly: "temperature_2m,weather_code,is_day,relative_humidity_2m,precipitation_probability,wind_speed_10m,apparent_temperature",
    timezone: "auto",
    forecast_days: "6",
  });
  if (unit === "f") {
    q.set("temperature_unit", "fahrenheit");
    q.set("wind_speed_unit", "mph");
  }
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const j = await res.json();
  const d = j.daily;
  return {
    place: place.name,
    unit,
    temp: j.current.temperature_2m,
    feels: j.current.apparent_temperature,
    humidity: j.current.relative_humidity_2m,
    wind: j.current.wind_speed_10m,
    code: j.current.weather_code,
    day: j.current.is_day === 1,
    days: (d.time as string[]).map((date, i) => ({
      date,
      code: d.weather_code[i],
      max: d.temperature_2m_max[i],
      min: d.temperature_2m_min[i],
      rain: d.precipitation_probability_max?.[i] ?? null,
      wind: d.wind_speed_10m_max?.[i],
    })),
    hours: ((j.hourly?.time ?? []) as string[]).map((time, i) => ({
      time,
      temp: j.hourly.temperature_2m[i],
      code: j.hourly.weather_code[i],
      day: j.hourly.is_day[i] === 1,
      humidity: j.hourly.relative_humidity_2m[i],
      rain: j.hourly.precipitation_probability[i] ?? 0,
      wind: j.hourly.wind_speed_10m[i],
      feels: j.hourly.apparent_temperature[i],
    })),
    at: Date.now(),
  };
}

export async function refreshWeather() {
  const s = settings().weather;
  try {
    current = await fetchWeather(s.place, s.unit);
    failed = false;
    writeCache(current);
  } catch (err) {
    console.warn("[komori] weather", err);
    failed = true;
  }
  emit();
}

/** Start following the weather (once per page). */
export function startWeather() {
  if (started) return;
  started = true;
  const fresh = weather();
  // A cache from before the hourly forecast existed is refreshed at once.
  const due = fresh?.hours ? Math.max(0, fresh.at + REFRESH_MS - Date.now()) : 0;
  const loop = () => {
    void refreshWeather();
    timer = window.setTimeout(loop, REFRESH_MS);
  };
  timer = window.setTimeout(loop, due);
  // A new place or unit: fetch at once.
  let key = placeKey();
  onSettings(() => {
    const next = placeKey();
    if (next === key) return;
    key = next;
    if (timer != null) window.clearTimeout(timer);
    emit();
    loop();
  });
}

function placeKey() {
  const w = settings().weather;
  return `${w.place.lat},${w.place.lon},${w.unit}`;
}

// ── Places ────────────────────────────────────────────────────────────────────

export async function searchPlaces(name: string): Promise<Place[]> {
  const q = new URLSearchParams({ name, count: "8", language: "es", format: "json" });
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${q}`);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const j = await res.json();
  return ((j.results ?? []) as { name: string; latitude: number; longitude: number; admin1?: string; country?: string }[])
    .map((r) => ({
      name: r.name,
      detail: [r.admin1, r.country].filter((x) => x && x !== r.name).join(", "),
      lat: r.latitude,
      lon: r.longitude,
    }));
}

// ── Words and pictures ────────────────────────────────────────────────────────

/** WMO weather codes → a sky kind and words. */
export function describe(code: number): { sky: Sky; text: string } {
  if (code === 0) return { sky: "clear", text: "Despejado" };
  if (code === 1) return { sky: "partly", text: "Casi despejado" };
  if (code === 2) return { sky: "partly", text: "Parcialmente nublado" };
  if (code === 3) return { sky: "cloudy", text: "Nublado" };
  if (code === 45 || code === 48) return { sky: "fog", text: "Neblina" };
  if (code >= 51 && code <= 57) return { sky: "drizzle", text: "Llovizna" };
  if (code === 61 || code === 80) return { sky: "rain", text: "Lluvia ligera" };
  if (code === 63 || code === 81) return { sky: "rain", text: "Lluvia" };
  if (code === 65 || code === 82) return { sky: "rain", text: "Lluvia fuerte" };
  if (code === 66 || code === 67) return { sky: "rain", text: "Lluvia helada" };
  if (code >= 71 && code <= 77) return { sky: "snow", text: "Nieve" };
  if (code === 85 || code === 86) return { sky: "snow", text: "Chubascos de nieve" };
  if (code >= 95) return { sky: "storm", text: "Tormenta" };
  return { sky: "cloudy", text: "Nublado" };
}

export function deg(n: number): string {
  return `${Math.round(n)}°`;
}

const SUN = `<circle cx="12" cy="12" r="4.6" fill="#ffc94d"/><g stroke="#ffc94d" stroke-width="1.8" stroke-linecap="round"><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></g>`;
const MOON = `<path d="M15.5 3.5a8.5 8.5 0 1 0 5 11.6A7 7 0 0 1 15.5 3.5z" fill="#c9d4ff"/>`;
const cloud = (fill: string, dy = 0) =>
  `<path transform="translate(0 ${dy})" d="M7 19.5h10.5a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6-1.2A4.6 4.6 0 0 0 7 19.5z" fill="${fill}"/>`;
const SMALL_SUN = `<g transform="translate(-3 -3) scale(.75)">${SUN}</g>`;
const SMALL_MOON = `<g transform="translate(-2 -2) scale(.7)">${MOON}</g>`;
const drops = (color: string, n: number) =>
  `<g stroke="${color}" stroke-width="1.7" stroke-linecap="round">${[7.5, 11.5, 15.5].slice(0, n).map((x) => `<path d="M${x} 19.5l-1 2.6"/>`).join("")}</g>`;

/** A small coloured weather picture. */
export function skyIcon(code: number, day: boolean, size = 24): SVGSVGElement {
  const { sky } = describe(code);
  let body: string;
  switch (sky) {
    case "clear": body = day ? SUN : MOON; break;
    case "partly": body = (day ? SMALL_SUN : SMALL_MOON) + cloud("#eef2f8", 1); break;
    case "cloudy": body = cloud("#a9b4c6", -3) + cloud("#e6ebf3", 1); break;
    case "fog": body = cloud("#d5dbe5", -3) + `<g stroke="#b9c2d0" stroke-width="1.8" stroke-linecap="round"><path d="M4 18.5h16M6 21.5h12"/></g>`; break;
    case "drizzle": body = cloud("#dfe5ee", -3) + drops("#7cc4ff", 2); break;
    case "rain": body = cloud("#c3ccd9", -3) + drops("#5aaeff", 3); break;
    case "snow": body = cloud("#e6ebf3", -3) + `<g fill="#ffffff"><circle cx="8" cy="20.5" r="1.3"/><circle cx="12" cy="22" r="1.3"/><circle cx="16" cy="20.5" r="1.3"/></g>`; break;
    case "storm": body = cloud("#8f9bb0", -3) + `<path d="M12.5 15.5l-3 4.5h2.6l-1.3 3.5 4-5h-2.7l1.4-3z" fill="#ffd34d"/>`; break;
  }
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("sky");
  // Our own static markup, no outside text in it.
  svg.innerHTML = body;
  return svg;
}
