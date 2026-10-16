/* MMM-OpenSky-WordGame node helper — the family's daily five-letter word game (one shared board per day).
 * - Today's word: the next one in words/answers.txt (a fixed order, one a day — the same day gives the same word on
 *   every OpenSky screen, so friends can compare). New puzzle at local midnight.
 * - Guesses are checked HERE: the page never receives the answer until the game is over.
 * - Accepted guesses: words/allowed.txt + opensky.json → wordgame.extraWords.
 * - Board + family stats in config/wordgame.json (next to opensky.json; OPENSKY_WORDGAME overrides).
 * Socket: OS_WG_INIT {extraWords} / OS_WG_SYNC → OS_WG_STATE; OS_WG_GUESS {word, date} → OS_WG_STATE | OS_WG_ERROR {message}
 */
const NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");

const WORDS = path.join(__dirname, "words");
const SETTINGS_DIR = path.dirname(process.env.OPENSKY_SETTINGS || path.join(global.root_path || process.cwd(), "config", "opensky.json"));
const STATE_FILE = process.env.OPENSKY_WORDGAME || path.join(SETTINGS_DIR, "wordgame.json");
const FIRST_DAY = "2026-01-01";   // puzzle #1
const MAX_GUESSES = 6;
const readList = (f) => fs.readFileSync(path.join(WORDS, f), "utf8").split("\n").map((w) => w.trim()).filter((w) => /^[a-z]{5}$/.test(w));

module.exports = NodeHelper.create({
  start() {
    this.answers = readList("answers.txt");
    this.allowed = new Set([...readList("allowed.txt"), ...this.answers]);
  },

  ymd(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },

  // Today's puzzle: its number and word (the same for everyone on that date)
  puzzle(date = this.ymd()) {
    const days = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${FIRST_DAY}T12:00:00Z`)) / 86400000);
    const i = ((days % this.answers.length) + this.answers.length) % this.answers.length;
    return { date, number: days + 1, answer: this.answers[i] };
  },

  readState() {
    const fresh = () => ({ today: null, stats: { played: 0, won: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0], lastWonDate: null }, history: {} });
    let raw;
    try { raw = fs.readFileSync(STATE_FILE, "utf8"); } catch (e) { return fresh(); }   // first game: no file yet
    try {
      const s = JSON.parse(raw), d = fresh();
      // fill anything missing so a partial file can't break the game
      s.stats = { ...d.stats, ...(s.stats || {}) };
      if (!Array.isArray(s.stats.dist) || s.stats.dist.length !== 6) s.stats.dist = d.stats.dist;
      s.history = s.history || {};
      if (s.today && !Array.isArray(s.today.guesses)) s.today = null;
      return s;
    } catch (e) {
      // a damaged file (e.g. a power cut): keep a copy rather than silently wiping the family's stats
      const keep = `${STATE_FILE}.damaged-${Date.now()}`;
      try { fs.copyFileSync(STATE_FILE, keep); } catch (x) { /* ignore */ }
      console.error(`[OpenSky] wordgame.json unreadable (${e.message}); a copy was kept`);
      return fresh();
    }
  },

  writeState(s) {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(`${STATE_FILE}.tmp`, JSON.stringify(s, null, 1));
    fs.renameSync(`${STATE_FILE}.tmp`, STATE_FILE);
  },

  // Standard colouring with repeated letters handled: "g" right spot, "y" elsewhere in the word, "b" not in it
  score(guess, answer) {
    const res = Array(5).fill("b"), left = {};
    for (let i = 0; i < 5; i++) {
      if (guess[i] === answer[i]) res[i] = "g";
      else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < 5; i++) {
      if (res[i] !== "g" && left[guess[i]] > 0) { res[i] = "y"; left[guess[i]]--; }
    }
    return res.join("");
  },

  today() {
    const p = this.puzzle(), s = this.readState();
    if (!s.today || s.today.date !== p.date) {
      s.today = { date: p.date, number: p.number, guesses: [], status: "playing" };
      this.writeState(s);
    }
    return { s, p };
  },

  view(s, p) {
    const t = s.today;
    return { date: t.date, number: t.number, guesses: t.guesses, status: t.status,
      answer: t.status === "playing" ? null : p.answer, stats: this.liveStats(s.stats) };
  },

  // A streak only counts if the last win was today or yesterday (skipping a day breaks it)
  liveStats(st) {
    const y = new Date(); y.setDate(y.getDate() - 1);
    const alive = st.lastWonDate === this.ymd() || st.lastWonDate === this.ymd(y);
    return { ...st, streak: alive ? st.streak : 0 };
  },

  socketNotificationReceived(n, payload) {
    if (n === "OS_WG_INIT") {
      ((payload && payload.extraWords) || []).map((w) => String(w).trim().toLowerCase()).filter((w) => /^[a-z]{5}$/.test(w)).forEach((w) => this.allowed.add(w));
    }
    if (n === "OS_WG_INIT" || n === "OS_WG_SYNC") {
      const { s, p } = this.today();
      return this.sendSocketNotification("OS_WG_STATE", this.view(s, p));
    }
    if (n !== "OS_WG_GUESS") return;
    const word = String((payload && payload.word) || "").toLowerCase();
    const { s, p } = this.today();
    const t = s.today;
    // a guess typed just before midnight must not land on the next day's puzzle
    if (payload && payload.date && payload.date !== t.date) {
      this.sendSocketNotification("OS_WG_STATE", this.view(s, p));
      return this.sendSocketNotification("OS_WG_ERROR", { message: "A new puzzle just started" });
    }
    if (t.status !== "playing") return this.sendSocketNotification("OS_WG_STATE", this.view(s, p));
    if (!/^[a-z]{5}$/.test(word)) return this.sendSocketNotification("OS_WG_ERROR", { message: "Not enough letters" });
    if (!this.allowed.has(word)) return this.sendSocketNotification("OS_WG_ERROR", { message: "Not in the word list" });
    if (t.guesses.some((g) => g.word === word)) return this.sendSocketNotification("OS_WG_ERROR", { message: "Already tried that one" });
    const pattern = this.score(word, p.answer);
    t.guesses.push({ word, pattern, at: new Date().toISOString() });
    if (pattern === "ggggg" || t.guesses.length >= MAX_GUESSES) {
      const won = pattern === "ggggg", st = s.stats;
      t.status = won ? "won" : "lost";
      st.played++;
      if (won) {
        st.won++;
        st.dist[t.guesses.length - 1]++;
        const y = new Date(`${t.date}T12:00:00`); y.setDate(y.getDate() - 1);
        st.streak = st.lastWonDate === this.ymd(y) ? st.streak + 1 : 1;
        st.maxStreak = Math.max(st.maxStreak, st.streak);
        st.lastWonDate = t.date;
      } else st.streak = 0;
      s.history[t.date] = { number: t.number, guesses: t.guesses.length, won, patterns: t.guesses.map((g) => g.pattern) };
    }
    this.writeState(s);
    this.sendSocketNotification("OS_WG_STATE", this.view(s, p));
  }
});
