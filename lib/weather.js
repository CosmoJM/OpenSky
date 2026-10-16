/* OpenSky shared weather client (server side — used by node helpers, never by the page).
 * Providers:
 *   "open-meteo"     (default) free, no key, current + 8-day daily forecast
 *   "openweathermap" needs an API key (secrets.json → weather.openweathermap.apiKey); current + ~5-day forecast
 * Every result uses OpenWeatherMap-style condition ids (800 clear, 80x clouds, 5xx rain, 6xx snow, 2xx storm, 7xx fog)
 * so modules need only one icon set.
 */
const TIMEOUT = 20000;

// Open-Meteo WMO weather codes → OpenWeatherMap-style ids
function wmoToId(code) {
  if (code == null) return null;
  if (code === 0) return 800;                                   // clear
  if (code === 1) return 801;                                   // mainly clear
  if (code === 2) return 802;                                   // partly cloudy
  if (code === 3) return 804;                                   // overcast
  if (code === 45 || code === 48) return 741;                   // fog
  if (code >= 51 && code <= 57) return 300;                     // drizzle
  if (code >= 61 && code <= 67) return code >= 65 ? 502 : 500;  // rain
  if (code >= 71 && code <= 77) return 600;                     // snow
  if (code >= 80 && code <= 82) return 521;                     // rain showers
  if (code === 85 || code === 86) return 621;                   // snow showers
  if (code >= 95) return 200;                                   // thunderstorm
  return 803;
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * @param {{provider?: string, latitude: number, longitude: number, units?: "imperial"|"metric", apiKey?: string}} o
 * @returns {Promise<{current: {temp: number, id: number}|null, daily: Object<string, {high: number, low: number, id: number}>}>}
 *          daily is keyed by local date "YYYY-MM-DD"
 */
async function fetchWeather(o) {
  if (!Number.isFinite(o.latitude) || !Number.isFinite(o.longitude)) throw new Error("no location set");
  const imperial = (o.units || "imperial") === "imperial";
  if ((o.provider || "open-meteo") === "openweathermap") {
    if (!o.apiKey) throw new Error("OpenWeatherMap needs an API key in secrets.json");
    const q = `lat=${o.latitude}&lon=${o.longitude}&units=${imperial ? "imperial" : "metric"}&appid=${encodeURIComponent(o.apiKey)}`;
    const [cur, fc] = await Promise.all([
      getJson(`https://api.openweathermap.org/data/2.5/weather?${q}`),
      getJson(`https://api.openweathermap.org/data/2.5/forecast?${q}`)
    ]);
    const daily = {};
    const tz = (fc.city && fc.city.timezone) || 0;   // seconds from UTC
    for (const it of fc.list || []) {
      const day = new Date((it.dt + tz) * 1000).toISOString().slice(0, 10);
      const d = daily[day] || (daily[day] = { high: -Infinity, low: Infinity, id: null, _midday: null });
      d.high = Math.max(d.high, it.main.temp_max); d.low = Math.min(d.low, it.main.temp_min);
      const hour = new Date((it.dt + tz) * 1000).getUTCHours();
      if (d._midday == null || Math.abs(hour - 13) < Math.abs(d._midday - 13)) { d._midday = hour; d.id = it.weather && it.weather[0] && it.weather[0].id; }
    }
    for (const k of Object.keys(daily)) { const d = daily[k]; daily[k] = { high: Math.round(d.high), low: Math.round(d.low), id: d.id }; }
    return { current: cur && cur.main ? { temp: Math.round(cur.main.temp), id: cur.weather && cur.weather[0] && cur.weather[0].id } : null, daily };
  }
  const unit = imperial ? "fahrenheit" : "celsius";
  const j = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${o.latitude}&longitude=${o.longitude}` +
    `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code` +
    `&temperature_unit=${unit}&timezone=auto&forecast_days=8`);
  const daily = {};
  (j.daily && j.daily.time || []).forEach((day, i) => {
    if (j.daily.temperature_2m_max[i] == null) return;
    daily[day] = { high: Math.round(j.daily.temperature_2m_max[i]), low: Math.round(j.daily.temperature_2m_min[i]), id: wmoToId(j.daily.weather_code[i]) };
  });
  const c = j.current;
  return { current: c ? { temp: Math.round(c.temperature_2m), id: wmoToId(c.weather_code) } : null, daily };
}

module.exports = { fetchWeather, wmoToId };
