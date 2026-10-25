/* OpenSky accent colour (server side) — opensky.json → look.accent: "peach" (the default), a palette colour name, or a
 * colour code. The screen (lib/client/opensky-client.js → OpenSkyAccent) and config/config.js use the same rule.
 *   normalize("Teal") → "teal"   normalize("#3B82F6") → "#3b82f6"   normalize("#abc") → "#aabbcc"   normalize("red;x") → null
 */
const NAMES = ["peach", "pink", "green", "blue", "orange", "yellow", "emerald", "purple", "red", "teal", "indigo", "tan", "gray"];

/** A palette name, "#rrggbb" (from #rgb or #rrggbb, any case), or null when it's neither. */
function normalize(v) {
  const s = String(v == null ? "" : v).trim().toLowerCase();
  if (NAMES.includes(s)) return s;
  const m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  return m ? `#${m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1]}` : null;
}

module.exports = { normalize, NAMES };
