import { CLASSES, CLASS_IMG, classIcon, skillIcon, EVENT_ICONS, UI_ICONS, makeDraggable, knownSkill, skillBase, askText } from "./icons.js";
const CLASS_IMG_READY = cls => !!CLASS_IMG[cls];
import { Fight, MODES, value, cumulative, mergeSnapshots, filteredDamage, skillRows } from "./model.js";
import { EVENTS, eventState, describe, fmtWait, chime } from "./timers.js";
import { DUNGEONS, bossPortrait, bossDifficulty } from "./runs.js";
import { dueReminders, reminderOpts, reminderText } from "./reminders.js";
// Personal bests are kept per boss AND difficulty ("Vakron (Conquest)"). Bests saved before that were keyed by name
// only; nearly all of those are Conquest kills, so they still count for Conquest (and for bosses of unknown difficulty).
const bestKey = tg => {
  const d = tg ? bossDifficulty({ template: tg.template, name: tg.name, maxHp: tg.maxHp }) : null;
  return d ? `${tg.name} (${d.difficulty})` : tg?.name;
};
function findBest(tg, who) {
  const k = bestKey(tg);
  const legacyOk = k === tg.name || /\(Conquest/.test(k);
  return bests[`${k}|${who}`] || bests[k] || (legacyOk ? bests[`${tg.name}|${who}`] || bests[tg.name] : null);
}
import { rate, ratingClass } from "./ratings.js";
import { startDemo, demoBest } from "./demo.js";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const short = n => { const a = Math.abs(n); return a >= 1e6 ? (n / 1e6).toFixed(2) + "M" : a >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n)); };
const fmt = n => settings.numbers === "full" ? Math.round(n).toLocaleString() : short(n);
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const params = new URLSearchParams(location.search);
const nova = window.nova;                 // set by the Electron shell (preload.js)
const isElectron = !!nova;
const isApp = params.has("app") || isElectron;
const problem = params.get("problem");

// ---------- storage (best effort: the page works without it) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem("nova." + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("nova." + k, JSON.stringify(v)); } catch { /* full or blocked */ } },
};

// ---------- settings ----------
const DEFAULTS = {
  mode: "DPS", segment: "current",
  barStyle: "classic", palette: "meter", font: "segoe", fontSize: 14, rowHeight: 30, accent: "#f3c25a",
  scale: 0.8, opacity: 0.38, showIcons: true, showRank: false, showSummary: true, numbers: "short",
  cols: { total: true, dps: true, pct: true, crit: true },
  countdowns: false, chime: true, compact: false, locked: false,
  idleEnd: 12, bossHp: 3000000, scope: "all", targetFilter: "all",
  pbShow: true, pbSound: true, pbVolume: 0.5, cp: "", cpAt: 0,
};
const saved = store.get("settings", {});
if (saved.partyOnly !== undefined) { saved.scope = saved.partyOnly ? "party" : "all"; delete saved.partyOnly; }
if ((saved.layout || 1) < 2) {            // one-time move to the redesigned layout (Oct 2026)
  for (const k of ["cols", "showRank", "rowHeight", "opacity"]) delete saved[k];
}
if ((saved.layout || 1) < 4) {            // one-time move to the 0.6.3 defaults, for values nobody changed
  if (saved.opacity === 0.6) delete saved.opacity;
  if (saved.scale === 1) delete saved.scale;
  if (saved.scope === "party") delete saved.scope;
}
saved.layout = 4;
// Only these can be changed (Settings, header buttons); everything else always uses the defaults.
const USER_KEYS = ["mode", "segment", "compact", "locked", "chime", "fontSize", "opacity", "scale", "accent", "scope", "pbShow", "pbSound", "pbVolume", "cp", "cpAt"];
const settings = { ...DEFAULTS, ...Object.fromEntries(USER_KEYS.filter(k => k in saved).map(k => [k, saved[k]])), layout: 4 };
store.set("settings", settings);          // saves the layout number too, so the steps above run only once
const FONTS = {
  segoe: ["Segoe UI", '"Segoe UI", system-ui, sans-serif'],
  bahn: ["Bahnschrift", 'Bahnschrift, "Segoe UI", sans-serif'],
  calibri: ["Calibri", 'Calibri, "Segoe UI", sans-serif'],
  candara: ["Candara", 'Candara, "Segoe UI", sans-serif'],
  tahoma: ["Tahoma", 'Tahoma, "Segoe UI", sans-serif'],
  trebuchet: ["Trebuchet MS", '"Trebuchet MS", "Segoe UI", sans-serif'],
  verdana: ["Verdana", 'Verdana, "Segoe UI", sans-serif'],
  narrow: ["Arial Narrow", '"Arial Narrow", Arial, sans-serif'],
  georgia: ["Georgia", 'Georgia, serif'],
  mono: ["Consolas", '"Cascadia Mono", Consolas, monospace'],
};
const ACCENTS = ["#f3c25a", "#ff8a5c", "#ff5c8a", "#b98cff", "#5ca8ff", "#4fd1c5", "#7ee07e", "#ffffff"];
const BAR_STYLES = ["classic", "slim", "gradient", "outline", "minimal"];
const MODE_LABEL = { DPS: "DPS", rDPS: "rDPS", nDPS: "nDPS", HPS: "HPS", DTPS: "DTPS" };
const TITLE = { DPS: "Damage", rDPS: "Damage · r", nDPS: "Damage · n", HPS: "Healing", DTPS: "Taken" };
const TOTAL_LABEL = { DPS: "Damage", rDPS: "Damage", nDPS: "Damage", HPS: "Healing", DTPS: "Taken" };

function applySettings() {
  const m = $("meter"), root = document.documentElement.style;
  for (const s of BAR_STYLES) m.classList.toggle("style-" + s, settings.barStyle === s);
  m.classList.toggle("compact", settings.compact);
  m.classList.toggle("locked", settings.locked);
  m.classList.toggle("no-icons", !settings.showIcons);
  m.classList.toggle("no-rank", !settings.showRank);
  root.setProperty("--scale", settings.scale);
  // Electron windows are truly see-through, so the background alpha is just CSS; the older
  // pywebview window can only fade the whole window, so it gets the opacity sent to it instead.
  root.setProperty("--bg-a", isApp && !isElectron ? 1 : settings.opacity);
  if (isApp && !isElectron) sendLive({ type: "app", action: "opacity", value: settings.opacity });
  root.setProperty("--font", (FONTS[settings.font] || FONTS.segoe)[1]);
  root.setProperty("--fs", settings.fontSize + "px");
  root.setProperty("--row-h", Math.round(settings.fontSize * 2 + 2) + "px");     // rows follow the text size
  root.setProperty("--accent", settings.accent);
  const c = settings.cols;
  gridSig = "";                         // recomputed on the next render from the columns that fit
  $("mode").textContent = MODE_LABEL[settings.mode];
  $("segment").textContent = settings.segment === "overall" ? "Overall" : "Current";
  $("segment").classList.toggle("overall", settings.segment === "overall");
  $("title").textContent = TITLE[settings.mode];
  $("sound").innerHTML = settings.chime ? UI_ICONS.soundOn : UI_ICONS.soundOff;
  $("sound").classList.toggle("on", settings.chime);
  $("lock").innerHTML = settings.locked ? UI_ICONS.lock : UI_ICONS.unlock;
  $("lock").classList.toggle("on", settings.locked);
  $("compact").innerHTML = settings.compact ? UI_ICONS.expand : UI_ICONS.compact;
  store.set("settings", settings);
}
// Columns that fit the meter's current width; the rest are dropped (and give their space to names).
let gridSig = "";
function activeCols() {
  const w = $("meter").clientWidth, c = settings.cols;
  return { dps: c.dps, pct: c.pct && w >= 285, crit: c.crit && w >= 360, total: c.total && w >= 440 };
}
function applyGrid(ac) {
  const sig = JSON.stringify([ac, settings.showRank]);
  if (sig === gridSig) return;
  gridSig = sig;
  document.documentElement.style.setProperty("--grid", [settings.showRank ? "16px" : null, "minmax(0, 1fr)", ac.dps ? "60px" : null,
    ac.pct ? "48px" : null, ac.total ? "60px" : null, ac.crit ? "40px" : null].filter(Boolean).join(" "));
}
const classColor = cls => CLASSES[cls]?.[settings.palette] || "#7a7f8c";
// skill names are learned from the player in the breakdown window (the game only sends ids)
let skillNames = store.get("skillNames", {});
const skillName = label => skillNames[label] || skillNames[skillBase(label)] || knownSkill(label) || label;
addEventListener("storage", e => { if (e.key === "nova.skillNames") skillNames = store.get("skillNames", {}); });

// ---------- history, session segments, personal bests ----------
let history = store.get("history", []);
let bests = store.get("best", {});
const session = [];                      // fights finished since the meter started (for "Overall")

let serverHistory = null;                 // fight summaries from the capture service (saved on disk)

function onFightEnd(snap) {
  if (!snap.players.length || snap.duration < 5) return;
  // Freeze the rating with the fight: your Combat Power at the time and each player's Nova Rating as calculated now,
  // so a later CP update or a refreshed reference never changes a fight that's already in your history.
  const cp = +settings.cp > 0 ? +settings.cp : null;
  const t = Math.max(snap.duration, 1);
  const frozen = p => {
    if (!snap.target?.boss || !snap.target.template) return null;
    const r = rate({ template: snap.target.template, cls: p.cls, dps: p.dmg / t, cp: p.self ? cp : 0 });
    return r && { rating: Math.round(r.rating * 10) / 10, expected: Math.round(r.expected), ratio: Math.round(r.ratio * 1000) / 1000,
                  n: r.n, cpAdjusted: r.cpAdjusted, healer: r.healer, cp: p.self ? cp : null };
  };
  const slim = { ...snap, cp, players: snap.players.map(({ log, ...p }) => ({ ...p, nova: frozen(p) })) };   // hit logs stay out of storage
  session.push(slim);
  if (session.length > 300) { session.splice(0, session.length - 300); mergedCache = null; }
  if (source === "live") sendLive({ type: "history_save", fight: slim });
  else { history.unshift(slim); history = history.slice(0, 30); store.set("history", history); }
  const me = snap.players.find(p => p.self);
  const guessed = / or |\?$/.test(snap.target?.name || "");          // "Vakron?" / "Tiere or Thamon": not sure which boss
  if (snap.killed && me && snap.target && !guessed) {
    const len = Math.ceil(snap.duration);
    const rec = { dps: {}, cum: {}, date: snap.date, cls: me.cls, name: me.name };
    for (const m of ["DPS", "nDPS", "rDPS"]) { rec.cum[m] = cumulative(me, m, len); rec.dps[m] = value(me, m) / snap.duration; }
    const key = `${bestKey(snap.target)}|${me.name}`;
    const old = findBest(snap.target, me.name);
    if (!old || !old.dps || rec.dps.DPS > old.dps.DPS) {
      bests[key] = rec; store.set("best", bests);
      celebratePB({ boss: bestKey(snap.target), dps: rec.dps.DPS, prev: old?.dps?.DPS || 0, first: !old?.dps?.DPS,
                    name: me.name, cls: me.cls, color: classColor(me.cls), bossFight: !!snap.target.boss });
    }
  }
}

function celebratePB(info) {
  const msg = info.first ? `First kill recorded on ${info.boss}: ${fmt(info.dps)} DPS`
                         : `New personal best on ${info.boss}: ${fmt(info.dps)} DPS (+${((info.dps / info.prev - 1) * 100).toFixed(1)}%)`;
  // the big screen celebration is for bosses; personal bests on regular enemies just get the toast
  if (settings.pbShow && nova?.celebrate && (info.bossFight || info.preview)) {
    nova.celebrate({ ...info, sound: settings.pbSound, volume: +settings.pbVolume });
  } else {
    toast(msg);
    if (settings.pbSound && (info.bossFight || info.preview)) chime();
  }
}

function toast(text) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = text;
  $("meter").append(t);
  setTimeout(() => t.classList.add("out"), 4200);
  setTimeout(() => t.remove(), 4800);
}

const fight = new Fight(onFightEnd);

// ---------- network / capture status ----------
const net = { ping: null, jitter: 0, loss: 0, pps: 0, health: null, badSince: null, goodSince: null, warn: null };
function updateNet(e) {
  Object.assign(net, { ping: e.ping, jitter: e.jitter ?? 0, loss: e.loss ?? 0, pps: e.pps ?? 0, health: e.health ?? net.health });
  const now = Date.now();
  const issue = net.loss > 1 ? `Losing packets (${net.loss}%)` : net.jitter > 30 ? `Unstable connection (±${net.jitter} ms)` : net.ping > 150 ? `High ping (${net.ping} ms)` : null;
  if (issue) { net.goodSince = null; net.badSince ??= now; if (now - net.badSince > 5000) net.warn = issue; }
  else { net.badSince = null; net.goodSince ??= now; if (now - net.goodSince > 5000) net.warn = null; }
}

// ---------- event intake ----------
let source = "demo";
let demo = null;
let spawnLists = [];                      // field boss timers from the capture service (the map's boss list)
const push = e => { if (e.t === "net") updateNet(e); else if (e.t === "spawns") spawnLists = e.lists || []; else if (e.t !== "spawnhook") fight.push(e); };

function connectLive() {
  let ws;
  const port = params.get("ws") || 8765;
  try { ws = new WebSocket(`ws://127.0.0.1:${port}`); } catch { return; }
  ws.onmessage = msg => {
    const m = JSON.parse(msg.data);
    if (source === "demo") {         // first real data: drop the demo (a reconnect keeps the session)
      demo?.stop(); demo = null;
      fight.roster.clear(); fight.reset(); fight.lastFinished = null; session.length = 0; mergedCache = null;
    } else if (ws._hello) fight.reset();   // a reconnect replays the fight in progress: don't count it twice
    ws._hello = false;
    source = "live";
    if (m.type === "events") m.events.forEach(push);
    else if (m.type === "event") push(m.event);
    else if (m.type === "history") { serverHistory = m.items; if (panel.kind === "history") renderPanel(true); }
    else if (m.type === "history_saved") { serverHistory = [m.item, ...(serverHistory || []).filter(x => x.id !== m.item.id)]; if (panel.kind === "history") renderPanel(true); }
    else if (m.type === "fight" && m.fight) openPanel("details", m.fight, { tab: "skills" });
  };
  ws.onopen = () => { ws._hello = true; sendFightSettings(); sendLive({ type: "history_list" }); if (isApp && !isElectron) { sendRegions(); sendLive({ type: "app", action: "opacity", value: settings.opacity }); } };
  ws.onclose = () => { if (source === "live") source = "offline"; setTimeout(connectLive, 3000); };
  window.liveSocket = ws;
}
const sendLive = msg => { const ws = window.liveSocket; if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const sendFightSettings = () => sendLive({ type: "settings", idle_end_s: +settings.idleEnd, boss_hp: +settings.bossHp });

// ---------- segments ----------
// the meter never shows individual hits, so its 4-per-second snapshots skip the hit logs
const currentSnap = () => fight.start == null && fight.lastFinished ? fight.lastFinished : fight.snapshot(undefined, false);
let mergedCache = null;                   // finished fights merged once, not on every refresh
function segmentSnap() {
  if (settings.segment !== "overall") return currentSnap();
  if (session.length && mergedCache?.n !== session.length) mergedCache = { n: session.length, snap: mergeSnapshots(session) };
  const parts = mergedCache && session.length ? [mergedCache.snap] : [];
  if (fight.start != null) parts.push(fight.snapshot(undefined, false));
  if (!parts.length) return currentSnap();
  return parts.length === 1 && fight.start == null ? { ...parts[0], overall: true } : mergeSnapshots(parts);
}

// ---------- boss race against the enrage timer ----------
// Only for bosses that enrage: the capture service sends each boss version's enrage timer (meter/service/enrage.json,
// or the game's Enrage flag looked up for bosses not in it). The track shows the fight so far, a ghost bar out to the
// projected kill (green: before enrage, amber: tight, red: after) and the enrage marker.
const isFinalBoss = name => DUNGEONS.some(d => d.bosses.some(b => b.role === "Final Boss" && b.name === (name || "").replace(/\?$/, "")));
const hpTrack = { id: null, pts: [] };          // (fight seconds, hp) samples for the current target: recent kill speed

function killRate(snap, tg) {
  const avg = snap.duration > 2 ? (tg.maxHp - tg.hp) / snap.duration : 0;
  const key = `${fight.start}|${tg.name}`;
  if (hpTrack.id !== key) { hpTrack.id = key; hpTrack.pts = []; }
  const last = hpTrack.pts[hpTrack.pts.length - 1];
  if (!last || last[1] !== tg.hp) hpTrack.pts.push([snap.duration, tg.hp]);
  while (hpTrack.pts.length > 2 && snap.duration - hpTrack.pts[0][0] > 20) hpTrack.pts.shift();
  const [t0, h0] = hpTrack.pts[0];
  const recent = snap.duration - t0 >= 8 ? (h0 - tg.hp) / (snap.duration - t0) : 0;
  return recent > 0 && avg > 0 ? (avg + recent) / 2 : avg;     // steady, but follows burn phases and downtime
}

function renderBossClock(snap, tg) {
  const known = tg && typeof tg.hp === "number" && tg.maxHp > 0;
  const limit = tg?.enrage || 0;
  const final = !!(tg && tg.boss && isFinalBoss(tg.name));
  $("target").classList.toggle("final", final);
  $("tboss").textContent = final ? "FINAL BOSS" : "BOSS";
  const show = !!(known && tg.boss && limit > 0 && !settings.compact && !snap.overall);
  $("bclock").hidden = !show;
  if (!show) return;
  const t = snap.duration;
  const rate = killRate(snap, tg);
  const kill = snap.killed ? t : rate > 0 ? t + tg.hp / rate : null;      // projected time of death (fight seconds)
  const span = Math.max(limit, kill || 0, t, 1) * 1.08;
  const pct = x => `${Math.min(100, x / span * 100).toFixed(2)}%`;
  $("bcel").style.width = pct(t);
  $("bcghost").style.left = pct(t);
  $("bcghost").style.width = kill ? `${Math.max(0, Math.min(100, (kill - t) / span * 100)).toFixed(2)}%` : "0";
  $("bcen").style.left = pct(limit);
  $("bcen").hidden = false;
  $("bcenlabel").textContent = fmtTime(limit);
  let verdict = "", cls = "";
  if (snap.killed) {
    verdict = t <= limit ? `Killed with <b>${fmtTime(limit - t)}</b> to spare` : `Killed <b>${fmtTime(t - limit)}</b> after enrage`;
    cls = t <= limit ? "ok" : "bad";
  } else if (!kill) {
    verdict = `Enrage at <b>${fmtTime(limit)}</b>`;
  } else if (t >= limit) {
    verdict = `<b>Enraged</b> · kill in ${fmtTime(kill - t)}`; cls = "bad";
  } else {
    const need = tg.hp / (limit - t);                         // kill speed needed to beat enrage
    const margin = rate / need - 1;
    if (kill <= limit) {
      cls = margin > 0.12 ? "ok" : "close";
      verdict = `<b>${fmtTime(limit - kill)}</b> before enrage` + (cls === "close" ? " · tight" : "");
    } else {
      verdict = `<b>${fmtTime(kill - limit)}</b> short of enrage · need <b>+${Math.ceil(-margin * 100 / (1 + margin))}%</b> DPS`;
      cls = margin > -0.1 ? "close" : "bad";
    }
  }
  $("bctrack").className = `bc-track ${cls}`;
  $("bcverdict").innerHTML = verdict;
  $("bcverdict").className = cls;
  $("bcsrc").textContent = `enrage ${fmtTime(limit)}`;
}

// ---------- main render ----------
function rowsFor(snap, mode) {
  const t = Math.max(snap.duration, 1);
  const rd = mode === "rDPS";
  // "My party": the party list decides; without one, hide unnamed strangers unless they keep fighting with you
  const inScope = p => settings.scope === "all" || p.self || (settings.scope === "party" &&
    (p.party === true || (p.party == null && (!/^#\d+$/.test(p.name) || p.regular))));
  const filtering = settings.targetFilter !== "all" && ["DPS", "nDPS", "rDPS"].includes(mode);
  const ps = snap.players.filter(inScope).map(p => {
    if (filtering) { const v = filteredDamage(p, snap, settings.targetFilter); return { ...p, v, perSec: v / t, own: v, full: v }; }
    const v = value(p, mode);
    const own = rd ? p.dmg - p.taken : v;
    const full = rd ? own + p.given + p.heal : v;
    return { ...p, v, perSec: v / t, own, full };
  }).filter(p => p.full > 0 || mode === "DPS").sort((a, b) => b.full - a.full || b.v - a.v);
  const sum = ps.reduce((s, p) => s + Math.max(0, p.v), 0) || 1;
  const max = Math.max(1, ...ps.map(p => p.full));
  return { ps, sum, max };
}

function vsBest(snap, me, mode) {
  if (!me || !snap.target || snap.overall || !["DPS", "rDPS", "nDPS"].includes(mode)) return null;
  const best = findBest(snap.target, me.name);
  const i = Math.floor(snap.duration);
  if (!best?.cum?.[mode] || i < 5) return null;
  const ref = best.cum[mode][Math.min(i, best.cum[mode].length - 1)];
  if (!ref) return null;
  return (cumulative(me, mode, i + 1)[i] / ref - 1) * 100;
}

let lastRows = new Map();                // pid -> row data, for tooltips and clicks
let lastSnap = null;

function render() {
  const snap = segmentSnap();
  lastSnap = snap;
  const mode = settings.mode;
  const t = Math.max(snap.duration, 1);
  $("timer").textContent = fmtTime(snap.duration);

  // target
  const tg = snap.target;
  renderBossClock(snap, tg);
  if (tg) {
    const known = typeof tg.hp === "number" && tg.maxHp > 0;
    const pct = known ? tg.hp / tg.maxHp * 100 : 0;
    $("tname").textContent = tg.name;
    const diff = tg.boss ? bossDifficulty({ template: tg.template, name: tg.name, maxHp: tg.maxHp }) : null;
    $("tdiff").textContent = diff ? diff.difficulty : "";
    $("tdiff").hidden = !diff;
    const portrait = tg.boss ? bossPortrait(tg.name) : null;
    if ($("tportrait").getAttribute("src") !== portrait) { if (portrait) $("tportrait").src = portrait; else $("tportrait").removeAttribute("src"); }
    $("tportrait").hidden = !portrait;
    $("target").classList.toggle("boss", !!tg.boss);
    $("tboss").hidden = !tg.boss;
    const tn = $("tname");
    tn.classList.toggle("renamable", !!tg.template && source === "live");
    tn.dataset.template = tg.template ?? "";
    tn.title = tg.template && source === "live" ? "Click to name this enemy (remembered next time)" : "";
    $("thp").parentElement.hidden = !known;
    const info = $("tinfo");
    info.className = "target-info";
    info.textContent = known ? "" : snap.overall || !snap.duration ? "" : fmtTime(snap.duration);   // no HP: just the fight time
    $("target").classList.toggle("has-hp", known);
    if (known) {
      // bosses: the same kill speed as the enrage race (whole fight blended with the last 20 s)
      const rate = tg.boss && !snap.overall ? killRate(snap, tg) : snap.duration > 2 ? (tg.maxHp - tg.hp) / snap.duration : 0;
      $("thpct").textContent = snap.killed ? "Killed" : `${pct.toFixed(1)}%`;
      $("thpinfo").innerHTML = snap.killed ? ` · ${fmtTime(snap.duration)}`
        : `<span class="ti-hp"> · ${fmt(tg.hp)} HP</span>` + (rate > 0 ? ` · ${fmtTime(tg.hp / rate)}<span class="ti-ttk"> to kill</span>` : "");
    }
    $("thp").style.width = pct + "%";
  } else {
    $("thpct").textContent = ""; $("thpinfo").textContent = ""; $("target").classList.remove("has-hp");
    $("tname").textContent = "Waiting for a fight…"; $("tinfo").textContent = ""; $("thp").style.width = "0";
    $("thp").parentElement.hidden = false;
    $("target").classList.remove("boss"); $("tboss").hidden = true; $("tportrait").hidden = true; $("tdiff").hidden = true;
  }

  // rows
  const { ps, sum, max } = rowsFor(snap, mode);
  lastRows = new Map(ps.map((p, i) => [p.id, { ...p, rank: i + 1, share: Math.max(0, p.v) / sum * 100 }]));

  // summary strip: party totals + your standing
  const me = ps.find(p => p.self);
  const meRank = me ? ps.indexOf(me) + 1 : 0;
  $("summary").hidden = !settings.showSummary;
  const filterNote = settings.targetFilter !== "all" ? `<span class="flt">${settings.targetFilter === "boss" ? "Bosses only" : "Current target"}</span>` : "";
  const fightsNote = snap.overall ? ` · ${session.length + (fight.start != null ? 1 : 0)} fights` : "";
  $("sumLeft").innerHTML = ps.length ? `Total ${TOTAL_LABEL[mode]} <b>${fmt(sum)}</b>${fightsNote}${filterNote}` : `No ${TOTAL_LABEL[mode].toLowerCase()} yet${filterNote}`;
  $("sumRight").innerHTML = `<b>${ps.length ? fmt(sum / t) : "0"}</b> ${MODE_LABEL[mode]}`;
  $("sumRight").title = me ? `You: #${meRank} · ${fmt(me.perSec)} ${MODE_LABEL[mode]} · ${(Math.max(0, me.v) / sum * 100).toFixed(1)}%` : "";

  const c = activeCols();
  applyGrid(c);
  curCols = c;
  $("cols").innerHTML = [settings.showRank ? `<span>#</span>` : "", `<span>Player</span>`,
    c.dps ? `<span class="num sorted">${MODE_LABEL[mode]} ↓</span>` : "", c.pct ? `<span class="num h-pct">Share</span>` : "",
    c.total ? `<span class="num h-total">${TOTAL_LABEL[mode]}</span>` : "", c.crit ? `<span class="num h-crit">Crit</span>` : ""].join("");

  const deadIds = new Set(snap.deaths.map(d => d.id));
  renderRows(ps.map((p, i) => {
    const rd = mode === "rDPS";
    const segs = rd
      ? [["own", p.own], ["sup", p.given], ["heal", p.heal]].filter(([, x]) => x > 0)
          .map(([k, x]) => `<i class="${k}" style="width:${(x / p.full * 100).toFixed(2)}%"></i>`).join("")
      : `<i class="own" style="width:100%"></i>`;
    let note = "";
    if (rd && p.given >= 1) note = `<span class="note up">+${fmt(p.given / t)} buffs</span>`;
    else if (p.self) {
      const d = vsBest(snap, p, mode);
      if (d != null) note = `<span class="note ${d >= 0 ? "up" : "down"}">${d >= 0 ? "+" : ""}${d.toFixed(1)}% vs best</span>`;
    }
    const skull = deadIds.has(p.id) && !snap.overall ? `<button class="skull" data-recap="${p.id}" title="Death recap">${UI_ICONS.skull}</button>` : "";
    const critPct = p.hits ? p.crits / p.hits * 100 : null;
    return {
      id: p.id, cls: p.cls, name: p.name, rank: i + 1,
      className: `row${p.self ? " self" : ""}${p.dead ? " dead" : ""}${p.party === false && !p.self ? " other" : ""}`,
      color: classColor(p.cls), width: (p.full / max * 100).toFixed(2) + "%", segs,
      tags: (p.badge ? `<span class="badge">${esc(p.badge)}</span>` : "") + note + skull,
      dps: fmt(p.perSec), pct: (Math.max(0, p.v) / sum * 100).toFixed(1) + "%", total: fmt(p.v),
      crit: critPct == null ? "–" : critPct.toFixed(0) + "%", critHi: critPct >= 50,
    };
  }));
  $("legend").hidden = mode !== "rDPS";

  // footer: connection + capture performance
  const live = source === "live";
  $("dot").classList.toggle("off", source === "offline" || !!problem);
  let status = problem ? problem : live ? (net.pps ? "Connected" : "Connected · waiting for game traffic") : source === "offline" ? "Waiting for the capture service…"
    : isApp ? "Waiting for Aion 2…" : "Demo fight";
  if (settings.locked && isApp) status += " · Ctrl+Shift+L to unlock";
  $("status").textContent = status;
  const h = net.health;
  const issues = h ? h.gaps + h.failures : 0;
  // a few hiccups over hours of play are normal: only warn when they are a noticeable share of traffic
  const shaky = h && issues > 3 && issues / Math.max(h.packets, 1) > 0.002;
  $("health").textContent = h && h.packets ? (shaky ? `Capture: ${issues} issues` : "Capture OK") : "";
  $("health").className = "perf " + (h ? (shaky ? "warn" : "good") : "");
  $("health").dataset.tip = h ? `${h.packets.toLocaleString()} packets · ${h.gaps} gaps · ${h.lost} lost bytes · ${h.desyncs} resyncs · ${h.failures} decode failures` : "";
  $("pps").textContent = net.pps ? `${net.pps} pkt/s` : "";
  $("ping").textContent = net.ping != null ? `${net.ping} ms` : "";
  $("ping").className = "num perf ping " + (net.ping == null ? "" : net.ping > 150 ? "bad" : net.ping > 90 ? "warn" : "good");
  $("netchip").hidden = !net.warn;
  $("netchip").textContent = net.warn || "";

  if (panel.kind === "details" && !panel.arg) renderPanel(true);
  if (tipRow != null) showRowTip(tipRow);
}


// ---------- rows: built once per player and updated in place ----------
// (Rebuilding them every frame re-created the class-icon images, which made them flicker.)
const rowEls = new Map();
let rowLayout = "";
function setText(el, v) { if (el && el.textContent !== v) el.textContent = v; }
function setHtml(el, v) { if (el && el._html !== v) { el.innerHTML = v; el._html = v; } }

let curCols = settings.cols;
function rowElement(r) {
  const c = curCols;
  const el = document.createElement("div");
  el.dataset.row = r.id;
  el.innerHTML = `<div class="bar"></div><div class="row-content">
    ${settings.showRank ? `<span class="rank"></span>` : ""}
    <span class="who"><span class="ico"></span><span class="name"></span><span class="tags"></span></span>
    ${c.dps ? `<span class="num c-val"></span>` : ""}${c.pct ? `<span class="num c-pct"></span>` : ""}
    ${c.total ? `<span class="num c-total"></span>` : ""}${c.crit ? `<span class="num c-crit"></span>` : ""}</div>`;
  el._ = { bar: el.querySelector(".bar"), rank: el.querySelector(".rank"), ico: el.querySelector(".ico"), name: el.querySelector(".name"),
           tags: el.querySelector(".tags"), dps: el.querySelector(".c-val"), pct: el.querySelector(".c-pct"),
           total: el.querySelector(".c-total"), crit: el.querySelector(".c-crit") };
  return el;
}

function renderRows(rows) {
  const box = $("rows");
  const layout = JSON.stringify([settings.showRank, curCols]);
  if (layout !== rowLayout || !rows.length) {          // column set changed (or nothing to show): start over
    rowLayout = layout; rowEls.clear();
    box.innerHTML = rows.length ? "" : `<div class="empty">Hit something and the party shows up here.</div>`;
    if (!rows.length) return;
  }
  box.querySelector(".empty")?.remove();
  const keep = new Set(rows.map(r => r.id));
  for (const [id, el] of rowEls) if (!keep.has(id)) { el.remove(); rowEls.delete(id); }
  rows.forEach((r, i) => {
    let el = rowEls.get(r.id);
    if (!el) { el = rowElement(r); rowEls.set(r.id, el); }
    if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null);
    const x = el._;
    if (el.className !== r.className) el.className = r.className;
    if (el._color !== r.color) { el.style.setProperty("--cc", r.color); el._color = r.color; }
    if (x.bar.style.width !== r.width) x.bar.style.width = r.width;
    setHtml(x.bar, r.segs);
    if (x.ico._cls !== r.cls || !x.ico.firstChild || (x.ico.firstChild.tagName === "svg" && CLASS_IMG_READY(r.cls))) {
      x.ico.innerHTML = classIcon(r.cls); x.ico._cls = r.cls;          // only when the class (or its image) changes
    }
    setText(x.rank, String(r.rank)); setText(x.name, r.name); setHtml(x.tags, r.tags);
    setText(x.dps, r.dps); setText(x.pct, r.pct); setText(x.total, r.total); setText(x.crit, r.crit);
    x.crit?.classList.toggle("hi", r.critHi);
  });
}

// ---------- event timers ----------
const evState = {};
const EVENT_LEAD = 15 * 60 * 1000;
$("events").innerHTML = EVENTS.map(ev => `<span class="ev" data-ev="${ev.key}" style="--ev:${ev.color}"><svg viewBox="0 0 24 24" fill="currentColor">${EVENT_ICONS[ev.key]}</svg><b></b></span>`).join("");
function renderEvents() {
  const now = Date.now();
  for (const ev of EVENTS) {
    const st = eventState(ev, now);
    const el = document.querySelector(`[data-ev="${ev.key}"]`);
    el.className = "ev " + st.state;
    el.hidden = st.state === "later" && st.opensAt - now > EVENT_LEAD;      // only shown when it's about to start or running
    el.dataset.tip = describe(ev, st, now);
    el.querySelector("b").textContent = st.state === "open" ? (st.closesAt ? fmtWait(st.closesAt - now) : "") : fmtWait(st.opensAt - now);
    if (st.state === "soon" && evState[ev.key] === "later" && settings.chime) chime();
    evState[ev.key] = st.state;
  }
}

// ---------- tooltips (plain + rich player breakdown) ----------
let tipRow = null;
function placeTip(anchor) {
  const tip = $("tip"), r = anchor.getBoundingClientRect();
  const left = Math.min(Math.max(8, r.left + 40), innerWidth - tip.offsetWidth - 8);
  let top = r.bottom + 4;
  if (top + tip.offsetHeight > innerHeight - 4) top = Math.max(4, r.top - tip.offsetHeight - 4);
  tip.style.left = left + "px"; tip.style.top = top + "px";
}
// Nova Rating in the row tooltip (boss fights with reference data only)
function ratingLine(p) {
  const tg = lastSnap?.target;
  const t = Math.max(lastSnap?.duration || 1, 1);
  if (!tg?.boss || !tg.template || lastSnap?.overall) return "";
  const r = rate({ template: tg.template, cls: p.cls, dps: p.dmg / t, cp: p.self ? +settings.cp : 0 });
  return r ? `<div class="tt-sub">Nova Rating <b class="rating ${ratingClass(r.rating)}">${Math.round(r.rating)}</b> · ${Math.round(r.ratio * 100)}% of a typical ${CLASSES[p.cls]?.label ?? p.cls}${r.cpAdjusted ? " at your CP" : ""} (${fmt(r.expected)})</div>` : "";
}

function showRowTip(pid) {
  const p = lastRows.get(pid), el = document.querySelector(`[data-row="${pid}"]`);
  if (!p || !el) { $("tip").hidden = true; tipRow = null; return; }
  const total = p.dmg || 1;
  const t = Math.max(lastSnap?.duration || 1, 1);
  const top = skillRows(p).slice(0, 6);
  const tipHtml = `<div class="tt-head" style="--cc:${classColor(p.cls)}">${classIcon(p.cls)}${esc(p.name)}</div>
    <div class="tt-sub">${CLASSES[p.cls]?.label ?? "Class unknown"} · #${p.rank} · ${p.share.toFixed(1)}% of party</div>
    <div class="tt-sub">${fmt(p.dmg)} damage · ${fmt(p.dmg / t)} DPS${p.heal ? ` · ${fmt(p.heal)} healing` : ""}${p.inc ? ` · ${fmt(p.inc)} taken` : ""} · ${p.hits ? (p.crits / p.hits * 100).toFixed(1) : 0}% crit</div>
    ${top.map(s => `<div class="tt-skill" style="--cc:${classColor(p.cls)}"><span class="nm">${s.name === "Summons" ? classIcon(p.cls, 14) : skillIcon(s.name, 14)}${esc(skillName(s.name))}</span><span class="num">${fmt(s.dmg)}</span><span class="num muted">${(s.dmg / total * 100).toFixed(0)}%</span><div class="tt-bar" style="width:${(s.dmg / top[0].dmg * 100).toFixed(0)}%"></div></div>`).join("")}
    ${ratingLine(p)}
    <div class="tt-foot">Click for the full breakdown</div>`;
  if ($("tip")._html !== tipHtml) { $("tip").innerHTML = tipHtml; $("tip")._html = tipHtml; }
  $("tip").hidden = false;
  placeTip(el);
}
document.addEventListener("mouseover", e => {
  const row = e.target.closest("[data-row]");
  if (row && !settings.locked) { tipRow = +row.dataset.row; showRowTip(tipRow); return; }
  tipRow = null;
  const t = e.target.closest("[data-tip]");
  const tip = $("tip");
  if (!t || !t.dataset.tip) { tip.hidden = true; return; }
  tip.textContent = t.dataset.tip; tip._html = null; tip.hidden = false;
  placeTip(t);
});
document.addEventListener("mouseleave", () => { $("tip").hidden = true; tipRow = null; });

// ---------- panels ----------
const panel = { kind: null, arg: null, tab: "skills", pid: null };

function openPanel(kind, arg = null, extra = {}) {
  if (!panel.kind) nova?.panelOpen?.();      // small meter: the app grows the window while a panel is open
  Object.assign(panel, { kind, arg, ...extra });
  $("menu").hidden = true; $("tip").hidden = true; tipRow = null;
  $("panel").hidden = false;
  renderPanel();
}
function closePanel() { panel.kind = null; panel.arg = null; $("panel").hidden = true; nova?.panelClose?.(); }

function renderPanel(refresh = false) {
  const body = $("panel-body");
  const scroll = body.scrollTop;
  if (panel.kind === "settings") { $("panel-title").textContent = "Settings"; body.innerHTML = settingsHtml(); }
  if (panel.kind === "history") { $("panel-title").textContent = "History"; body.innerHTML = historyHtml(); }
  if (panel.kind === "details") {
    const snap = panel.arg || segmentSnap();
    $("panel-title").textContent = `${snap.target?.name ?? "Fight"} · ${fmtTime(snap.duration)}${snap.killed ? " · Kill" : ""}`;
    body.innerHTML = detailsHtml(snap);
  }
  if (panel.kind === "recap") {
    const snap = panel.arg?.snap || currentSnap();
    const d = snap.deaths.filter(x => x.id === panel.arg.id).pop();
    $("panel-title").textContent = `Death recap · ${d?.name ?? ""}`;
    body.innerHTML = d ? recapHtml(d) : `<p class="muted">No death recorded.</p>`;
  }
  if (refresh) body.scrollTop = scroll;
}

function detailsHtml(snap) {
  if (!snap.players.length) return `<p class="muted">Nothing recorded yet.</p>`;
  const mode = ["HPS", "DTPS"].includes(settings.mode) ? "DPS" : settings.mode;
  if (!snap.players.some(p => p.id === panel.pid)) panel.pid = (snap.players.find(p => p.self) || snap.players[0]).id;
  const p = snap.players.find(x => x.id === panel.pid);
  const t = Math.max(snap.duration, 1);
  const nameOf = id => snap.players.find(x => x.id === id)?.name ?? `#${id}`;
  const order = [...snap.players].sort((a, b) => b.dmg - a.dmg);

  const chips = `<div class="chips">${order.map(x =>
    `<button data-pid="${x.id}" class="${x.id === p.id ? "on" : ""}" style="--cc:${classColor(x.cls)}">${classIcon(x.cls, 16)}${esc(x.name)}</button>`).join("")}</div>`;
  const tabs = `<div class="tabs">${[["skills", "Skills"], ["chart", "Damage over time"], ["buffs", "Healing & buffs"], ["taken", "Damage taken"], ["deaths", `Deaths (${snap.deaths.length})`]]
    .map(([k, l]) => `<button data-tab="${k}" class="${panel.tab === k ? "on" : ""}">${l}</button>`).join("")}</div>`;

  let content = "";
  if (panel.tab === "skills") {
    const total = p.dmg || 1;
    content = `<h4>${esc(p.name)} · ${fmt(p.dmg)} damage · ${fmt(p.dmg / t)} DPS · ${p.hits} hits · ${p.hits ? (p.crits / p.hits * 100).toFixed(1) : 0}% crit</h4>
    <table class="t" style="--cc:${classColor(p.cls)}"><tr><th>Skill</th><th class="n">Damage</th><th class="n">%</th><th class="n">DPS</th><th class="n">Hits</th><th class="n">Avg</th><th class="n">Max</th><th class="n">Crit</th></tr>
    ${skillRows(p).map((s, i, all) => `<tr><td>${skillIcon(s.name, 16)}${esc(skillName(s.name))}<div class="mini" style="width:${s.dmg / all[0].dmg * 100}%"></div></td>
      <td class="n">${fmt(s.dmg)}</td><td class="n">${(s.dmg / total * 100).toFixed(1)}%</td><td class="n">${fmt(s.dmg / t)}</td>
      <td class="n">${s.hits}</td><td class="n">${fmt(s.dmg / s.hits)}</td><td class="n">${fmt(s.max)}</td><td class="n crit">${(s.crits / s.hits * 100).toFixed(0)}%</td></tr>`).join("")}</table>`;
  }
  if (panel.tab === "chart") content = chartHtml(snap, p, mode);
  if (panel.tab === "buffs") {
    const list = (arr, label, empty) => `<h4>${label}</h4>` + (arr?.length
      ? `<table class="t"><tr><th>Player</th><th class="n">Amount</th><th class="n">Per second</th></tr>${[...arr].sort((a, b) => b[1] - a[1]).map(([id, v]) =>
          `<tr><td>${esc(nameOf(id))}</td><td class="n">${fmt(v)}</td><td class="n">${fmt(v / t)}</td></tr>`).join("")}</table>`
      : `<p class="muted">${empty}</p>`);
    content = list(p.healTo, "Healing on others", "No healing on other players.")
            + list(p.givenTo, "Buff credit given", "No buff credit given.") + list(p.takenFrom, "Buff credit received", "None.");
  }
  if (panel.tab === "taken") {
    content = `<h4>${esc(p.name)} · ${fmt(p.inc || 0)} damage taken</h4>` + (p.incFrom?.length
      ? `<table class="t"><tr><th>Ability · from</th><th class="n">Damage</th><th class="n">%</th></tr>${p.incFrom.map(([k, v]) =>
          `<tr><td>${esc(k)}</td><td class="n">${fmt(v)}</td><td class="n">${(v / (p.inc || 1) * 100).toFixed(1)}%</td></tr>`).join("")}</table>`
      : `<p class="muted">No damage taken recorded.</p>`);
  }
  if (panel.tab === "deaths") {
    content = snap.deaths.length ? `<table class="t"><tr><th>Time</th><th>Player</th><th>Killing blow</th><th></th></tr>${snap.deaths.map(d => {
      const last = d.hits[d.hits.length - 1];
      return `<tr class="click" data-recap="${d.id}"><td>${fmtTime(d.at)}</td><td>${esc(d.name)}</td><td>${last ? `${esc(last.skill)} · ${fmt(last.dmg)}` : "–"}</td><td class="muted">Recap ›</td></tr>`;
    }).join("")}</table>` : `<p class="muted">Nobody died.</p>`;
  }
  const copy = `<button class="mini-btn copy" data-act="copy-summary" title="Copy a one-line summary to paste into game chat">Copy summary</button>`;
  return copy + chips + tabs + content;
}

function chartHtml(snap, p, mode) {
  const len = Math.max(2, Math.ceil(snap.duration));
  const W = 600, H = 170, L = 44, B = 18, T = 8;
  const rolling = cum => cum.map((c, i) => (c - (cum[i - 5] ?? 0)) / Math.min(i + 1, 5));
  const cur = rolling(cumulative(p, mode, len));
  const best = p.self && snap.target && !snap.overall && findBest(snap.target, p.name)?.cum?.[mode];
  const ref = best ? rolling(best.slice(0, len)) : [];
  const yMax = Math.max(1, ...cur, ...ref) * 1.1;
  const x = i => L + (i / (len - 1)) * (W - L - 6);
  const y = v => T + (1 - v / yMax) * (H - T - B);
  const line = arr => arr.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const grid = [0, .25, .5, .75, 1].map(f => `<line class="grid" x1="${L}" x2="${W}" y1="${y(yMax * f)}" y2="${y(yMax * f)}"/><text x="${L - 6}" y="${y(yMax * f) + 3}" text-anchor="end">${short(yMax * f)}</text>`).join("");
  const xt = [0, .5, 1].map(f => `<text x="${x((len - 1) * f)}" y="${H - 4}" text-anchor="${f === 0 ? "start" : f === 1 ? "end" : "middle"}">${fmtTime((len - 1) * f)}</text>`).join("");
  const color = classColor(p.cls);
  return `<h4>${esc(p.name)} · ${mode} over time (5 s rolling)${best ? " · dashed = your best kill" : ""}</h4>
  <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}${xt}
    ${ref.length ? `<polyline class="best" points="${line(ref)}"/>` : ""}
    <polygon class="area" fill="${color}" points="${x(0)},${y(0)} ${line(cur)} ${x(len - 1)},${y(0)}"/>
    <polyline class="cur" stroke="${color}" points="${line(cur)}"/>
  </svg>`;
}

function recapHtml(d) {
  if (!d.hits.length) return `<p class="muted">No hits recorded in the last 6 seconds.</p>`;
  return `<h4>Last ${d.hits.length} hits before death at ${fmtTime(d.at)}</h4>` + d.hits.map(h => {
    const head = `<span class="num muted">-${((d.ts - h.ts) / 1000).toFixed(1)}s</span>
      <span>${esc(h.skill)} <span class="muted">from ${esc(h.from)}</span></span><span class="num bad">-${fmt(h.dmg)}</span>`;
    if (h.hpAfter == null) return `<div class="recap-hit">${head}<span></span></div>`;
    const pct = h.maxHp ? h.hpAfter / h.maxHp * 100 : 0;
    return `<div class="recap-hit">${head}<span><div class="hpbar"><div class="${pct < 25 ? "low" : ""}" style="width:${pct}%"></div></div><span class="muted" style="font-size:11px">${fmt(h.hpAfter)} HP</span></span></div>`;
  }).join("");
}

function historyHtml() {
  if (serverHistory) return serverHistoryHtml();
  if (!history.length) return `<p class="muted">Fights save here on their own once they last 5 seconds or more.</p>`;
  return `<table class="t"><tr><th>When</th><th>Enemy</th><th class="n">Time</th><th>Result</th><th class="n">Party DPS</th><th class="n">Your DPS</th><th>Deaths</th></tr>
  ${history.map((f, i) => {
    const party = f.players.reduce((s, p) => s + p.dmg, 0) / Math.max(f.duration, 1);
    const me = f.players.find(p => p.self);
    const deaths = [...new Set(f.deaths.map(d => d.name))].join(", ");
    return `<tr class="click" data-hist="${i}"><td>${new Date(f.date).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
      <td>${f.target?.boss ? '<span class="boss-badge">BOSS</span> ' : ""}${esc(f.target?.name ?? "–")}</td><td class="n">${fmtTime(f.duration)}</td><td class="${f.killed ? "ok" : "muted"}">${f.killed ? "Kill" : "Ended"}</td>
      <td class="n">${fmt(party)}</td><td class="n">${me ? fmt(me.dmg / Math.max(f.duration, 1)) : "–"}</td><td>${esc(deaths) || '<span class="muted">none</span>'}</td></tr>`;
  }).join("")}</table>
  <p><button data-act="clear-history" style="margin-top:12px;background:none;border:1px solid var(--line);color:var(--muted);padding:6px 12px;border-radius:6px;cursor:pointer">Clear history</button></p>`;
}

function serverHistoryHtml() {
  const items = serverHistory;
  if (!items.length) return `<p class="muted">Fights save here on their own when they end (5 seconds or longer).</p>`;
  const day = d => new Date(d).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  let html = "", last = "";
  html += `<table class="t"><tr><th>Time</th><th>Enemy</th><th class="n">Length</th><th>Result</th><th class="n">Party DPS</th><th class="n">Your DPS</th><th></th></tr>`;
  for (const f of items.slice(0, 200)) {
    const d = day(f.date);
    if (d !== last) { html += `<tr><td colspan="7" class="day">${d}</td></tr>`; last = d; }
    html += `<tr class="click" data-fight="${esc(f.id)}"><td>${new Date(f.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
      <td>${f.boss ? '<span class="boss-badge">BOSS</span> ' : ""}${esc(f.target ?? "–")}</td><td class="n">${fmtTime(f.duration)}</td>
      <td class="${f.killed ? "ok" : "muted"}">${f.killed ? "Kill" : "Ended"}</td><td class="n">${fmt(f.partyDps)}</td>
      <td class="n">${f.self ? fmt(f.self.dps) : "–"}</td><td><button class="mini-btn" data-del="${esc(f.id)}" title="Delete this fight">✕</button></td></tr>`;
  }
  return html + `</table><p class="muted" style="font-size:12px;margin-top:10px">Saved on this PC in %APPDATA%\\NovaMeter\\fights</p>`;
}

function fightSummaryText(f) {
  const t = Math.max(f.duration, 1);
  const ps = [...f.players].sort((a, b) => b.dmg - a.dmg);
  const total = ps.reduce((s, p) => s + p.dmg, 0) || 1;
  return `[Nova Meter] ${f.target?.name ?? "Fight"} · ${fmtTime(f.duration)}${f.killed ? " · Kill" : ""} · Party ${short(total / t)} DPS | ` +
    ps.slice(0, 8).map((p, i) => `${i + 1}. ${p.name} ${short(p.dmg / t)} (${(p.dmg / total * 100).toFixed(0)}%)`).join(" ");
}

function settingsHtml() {
  const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-set="${key}" data-val="${v}" class="${String(settings[key]) === String(v) ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const check = (key, label, on) => `<label class="switch"><input type="checkbox" data-set="${key}" ${on ? "checked" : ""}> ${label}</label>`;
  const range = (key, label, min, max, step, shown) => `<label data-label="${key}">${label} · ${shown}</label><input type="range" data-set="${key}" min="${min}" max="${max}" step="${step}" value="${settings[key]}">`;
  return `<h4>Look</h4><div class="form">
    ${range("fontSize", "Text size", 11, 18, 1, settings.fontSize + "px")}
    <label>Accent colour</label><div class="swatches">${ACCENTS.map(c => `<button data-accent="${c}" class="${settings.accent === c ? "on" : ""}" style="--sw:${c}" title="${c}"></button>`).join("")}</div>
    ${range("opacity", "Background", 0.3, 1, 0.02, Math.round(settings.opacity * 100) + "%")}
    ${range("scale", "Scale", 0.7, 1.5, 0.05, Math.round(settings.scale * 100) + "%")}
  </div>
  <h4>Fights</h4><div class="form">
    <label>Show</label>${seg("scope", [["me", "Only me"], ["party", "My party"], ["all", "Everyone"]])}
    <label>Your Combat Power</label><div><input type="number" data-set="cp" min="0" step="100" placeholder="e.g. 76000" value="${esc(settings.cp || "")}" style="width:110px">
      <div class="muted" style="font-size:12px;margin-top:4px">Used for your Nova Rating: you're compared with your class at your Combat Power. Others are compared at the boss's typical Combat Power.</div></div>
  </div>
  <h4>Personal bests</h4><div class="form">
    <label>Celebration</label>${check("pbShow", "Show a celebration on screen when you beat your best on a boss", settings.pbShow)}
    <label>Sound</label>${check("pbSound", "Play a fanfare", settings.pbSound)}
    ${range("pbVolume", "Volume", 0.1, 1, 0.05, Math.round(settings.pbVolume * 100) + "%")}
    <label></label><div><button class="mini-btn" data-act="pb-preview">Preview celebration</button></div>
  </div>
  <h4>Event timers</h4><div class="form">
    <label>Chime</label>${check("chime", "Soft chime when an event is about to open", settings.chime)}
    <label></label><div class="muted" style="font-size:12px">Event icons appear in the title bar 15 minutes before an event starts.</div>
  </div>
  <h4>About</h4><div class="form">
    <label>Version</label><div>Nova Meter ${esc(params.get("v") || "dev")} <span class="muted">· beta</span>
      <button class="mini-btn" data-act="help" style="margin-left:8px">Help & setup</button></div>
    <label>Support</label><div><button class="mini-btn" data-act="coffee">☕ Buy me a coffee</button>
      <div class="muted" style="font-size:12px;margin-top:6px">Nova Meter is free. If it helps your raids, a coffee keeps it going.</div></div>
    <label></label><div><button class="mini-btn" data-act="reset-settings">Reset settings to default</button></div>
  </div>`;
}
const RANGE_TEXT = {
  fontSize: v => `Text size · ${v}px`, rowHeight: v => `Row height · ${v}px`, opacity: v => `Background · ${Math.round(v * 100)}%`,
  scale: v => `Scale · ${Math.round(v * 100)}%`, idleEnd: v => `Auto-reset · ${v}s idle`, pbVolume: v => `Volume · ${Math.round(v * 100)}%`,
};

const COFFEE_URL = "https://buymeacoffee.com/odenness";
// A new GitHub issue with the version and a short template filled in (nothing personal is added).
function reportBug() {
  const body = [`**Nova Meter** v${params.get("v") || "dev"} · ${navigator.userAgent.match(/Windows NT [\d.]+/)?.[0] || "Windows"}`, "",
    "**What happened?**", "", "", "**What did you expect?**", "", "", "**Where / when?** (zone, boss, party size)", "", "",
    "_Screenshots help a lot: paste them straight into this box._"].join("\n");
  const url = `https://github.com/odenness/nova-meter/issues/new?labels=bug&title=${encodeURIComponent("[Bug] ")}&body=${encodeURIComponent(body)}`;
  nova ? nova.openExternal(url) : open(url, "_blank", "noopener");
}
function openCoffee() { nova ? nova.openExternal(COFFEE_URL) : open(COFFEE_URL, "_blank", "noopener"); }

// ---------- wiring ----------
$("reset").innerHTML = UI_ICONS.reset;
$("quit").innerHTML = UI_ICONS.close;
$("min").innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 17h12"/></svg>`;
$("more").innerHTML = UI_ICONS.more;
$("bug").innerHTML = UI_ICONS.bug;
$("bug").onclick = reportBug;
$("coffee").innerHTML = UI_ICONS.coffee;
$("coffee").onclick = openCoffee;
$("panel-close").innerHTML = UI_ICONS.close;

$("mode").onclick = () => { settings.mode = MODES[(MODES.indexOf(settings.mode) + 1) % MODES.length]; applySettings(); render(); };
$("segment").onclick = () => { settings.segment = settings.segment === "overall" ? "current" : "overall"; applySettings(); render(); };
$("reset").onclick = () => { fight.finish(false); fight.lastFinished = null; sendLive({ type: "reset" }); demo?.restart(); render(); };
$("sound").onclick = () => { settings.chime = !settings.chime; applySettings(); };
$("lock").onclick = () => {
  settings.locked = !settings.locked; applySettings();
  if (nova) nova.setLock(settings.locked); else sendLive({ type: "lock", on: settings.locked });
};
// the desktop app calls this when the lock hotkey (Ctrl+Shift+L) is pressed
window.novaLocked = on => { settings.locked = !!on; applySettings(); render(); };
// Locked = clicks go to the game, but the lock button itself stays clickable (mouse moves still reach the page).
let overLock = false;
document.addEventListener("mousemove", e => {
  const over = settings.locked && !!e.target.closest?.("#lock, .cp-prompt");
  if (over !== overLock && nova?.setClickable) { overLock = over; nova.setClickable(over); }
});
document.addEventListener("mouseleave", () => { if (overLock && nova?.setClickable) { overLock = false; nova.setClickable(false); } });
$("quit").onclick = () => nova ? nova.quit() : sendLive({ type: "app", action: "quit" });
$("min").onclick = () => nova ? nova.minimize() : sendLive({ type: "app", action: "minimize" });
// Electron: transparent windows can't be edge-resized, so the corner grip resizes via the shell
// The desktop app moves/resizes the window itself; it only needs to know where the header and grip are.
const rectOf = el => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; };
function sendRegions() {
  if (!isApp || isElectron) return;
  sendLive({ type: "app", action: "regions", dpr: devicePixelRatio,
    drag: [rectOf($("head"))], noDrag: [...$("head").querySelectorAll("button, .ev")].map(rectOf), grip: rectOf($("grip")) });
}
addEventListener("resize", sendRegions);
setInterval(sendRegions, 2000);          // cheap, and keeps up with layout changes from settings
$("head").addEventListener("mousedown", e => { if (!e.target.closest("button")) e.preventDefault(); });
$("compact").onclick = () => { settings.compact = !settings.compact; applySettings(); };
$("more").onclick = e => { e.stopPropagation(); $("menu").hidden = !$("menu").hidden; };
document.addEventListener("click", e => { if (!e.target.closest("#menu")) $("menu").hidden = true; });
$("menu").onclick = e => {
  const b = e.target.closest("[data-open]");
  if (b && b.dataset.open === "help") { $("menu").hidden = true; nova ? nova.openHelp() : open("help.html", "_blank"); return; }
  if (b && b.dataset.open === "timers") {
    $("menu").hidden = true;
    const ws = params.get("ws") || 8765;
    nova ? nova.openDetails({ view: "timers", ws }) : open(`details.html?view=timers&ws=${ws}`, "_blank");
    return;
  }
  if (b && b.dataset.open === "history" && nova) { $("menu").hidden = true; nova.openDetails({ view: "history", ws: params.get("ws") || 8765 }); return; }
  if (b) { if (b.dataset.open === "history") sendLive({ type: "history_list" }); openPanel(b.dataset.open); return; }
  const a = e.target.closest("[data-act]"); if (!a) return;
  $("menu").hidden = true;
  ({ segment: () => $("segment").click(), reset: () => $("reset").click(), compact: () => $("compact").click(), sound: () => $("sound").click(),
     mode: () => $("mode").click(), coffee: openCoffee, bug: reportBug })[a.dataset.act]?.();
};
$("panel-close").onclick = () => { if (panel.kind === "recap" && panel.back) { const b = panel.back; panel.back = null; openPanel(...b); } else closePanel(); };

$("tname").addEventListener("click", () => {
  const tpl = $("tname").dataset.template;
  if (!tpl || source !== "live") return;
  askText("Name this enemy (Nova Meter remembers it next time)", $("tname").textContent.replace(/^(Boss|Enemy|Target) #\d+$/, ""))
    .then(name => { if (name && name.trim()) sendLive({ type: "name_npc", template: +tpl, name: name.trim() }); });
});

$("rows").addEventListener("click", e => {
  const s = e.target.closest("[data-recap]");
  if (s) { openPanel("recap", { id: +s.dataset.recap }); return; }
  const row = e.target.closest("[data-row]");
  if (!row) return;
  const pid = +row.dataset.row;
  // Electron: open the breakdown in its own window beside the meter; elsewhere use the in-meter panel
  if (nova && settings.segment !== "overall") nova.openDetails({ pid, name: lastRows.get(pid)?.name, ws: params.get("ws") || 8765 });
  else openPanel("details", settings.segment === "overall" ? lastSnap : null, { pid, tab: "skills" });
});

$("panel-body").addEventListener("click", e => {
  const t = e.target;
  const pid = t.closest("[data-pid]"), tab = t.closest("[data-tab]"), hist = t.closest("[data-hist]"), rc = t.closest("[data-recap]"),
        set = t.closest("button[data-set]"), acc = t.closest("[data-accent]");
  if (pid) { panel.pid = +pid.dataset.pid; renderPanel(true); }
  else if (tab) { panel.tab = tab.dataset.tab; renderPanel(); }
  else if (hist) openPanel("details", history[+hist.dataset.hist], { tab: "skills" });
  else if (rc) { const back = [panel.kind, panel.arg, { tab: panel.tab }]; openPanel("recap", { id: +rc.dataset.recap, snap: panel.arg || currentSnap() }); panel.back = back; }
  else if (t.closest("[data-act=help]")) { nova ? nova.openHelp() : open("help.html", "_blank"); }
  else if (t.closest("[data-act=coffee]")) openCoffee();
  else if (t.closest("[data-act=reset-settings]")) {
    for (const k of ["fontSize", "opacity", "scale", "accent", "scope", "pbShow", "pbSound", "pbVolume", "chime"]) settings[k] = DEFAULTS[k];
    applySettings(); render(); renderPanel();
  }
  else if (t.closest("[data-act=pb-preview]")) {
    const me = lastSnap?.players.find(p => p.self);
    celebratePB({ boss: lastSnap?.target?.name || "Vakron", dps: me ? me.dmg / Math.max(lastSnap.duration, 1) : 128400, prev: me ? me.dmg / Math.max(lastSnap.duration, 1) * 0.94 : 120900,
                  first: false, name: me?.name || "Your character", cls: me?.cls || "gladiator", color: classColor(me?.cls || "gladiator"), preview: true, bossFight: true });
  }
  else if (t.closest("[data-act=clear-history]")) { history = []; store.set("history", history); renderPanel(); }
  else if (t.closest("[data-del]")) { e.stopPropagation(); sendLive({ type: "history_delete", id: t.closest("[data-del]").dataset.del }); }
  else if (t.closest("[data-fight]")) sendLive({ type: "history_get", id: t.closest("[data-fight]").dataset.fight });
  else if (t.closest("[data-act=copy-summary]")) {
    const snap = panel.arg || segmentSnap();
    navigator.clipboard.writeText(fightSummaryText(snap)).then(() => toast("Summary copied — paste it into game chat")).catch(() => toast("Couldn't copy to the clipboard"));
  }
  else if (acc) { settings.accent = acc.dataset.accent; applySettings(); renderPanel(true); render(); }
  else if (set) {
    const v = set.dataset.val;
    settings[set.dataset.set] = v === "true" ? true : v === "false" ? false : v;
    applySettings(); renderPanel(true); render();
  }
});
$("panel-body").addEventListener("input", e => {
  const el = e.target.closest("[data-set]"); if (!el || el.tagName === "BUTTON") return;
  const k = el.dataset.set;
  const v = el.type === "checkbox" ? el.checked : el.type === "range" ? +el.value : el.value;
  if (k.startsWith("cols.")) settings.cols[k.slice(5)] = v; else settings[k] = v;
  applySettings(); sendRegions();
  const label = el.previousElementSibling;
  if (RANGE_TEXT[k] && label) label.textContent = RANGE_TEXT[k](v);
  if (k === "idleEnd" || k === "bossHp") sendFightSettings();
  if (k === "cp") settings.cpAt = Date.now();
  render();
});

// ---------- Combat Power check on startup ----------
// Your Nova Rating compares you with your class at your Combat Power, which the game doesn't send: ask for it when the
// meter starts (pre-filled, so an unchanged CP is one click), and get out of the way once a fight starts.
const parseCP = v => {
  const m = /^\s*([\d.,]+)\s*(k?)\s*$/i.exec(String(v || ""));
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1);
  return n >= 1000 && n <= 10_000_000 ? Math.round(n) : null;
};
const ago = ms => { const d = Math.floor((Date.now() - ms) / 86400000); return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`; };

function cpPrompt() {
  if (document.querySelector(".cp-prompt")) return;
  const had = parseCP(settings.cp);
  const el = document.createElement("form");
  el.className = "cp-prompt";
  el.innerHTML = `<div class="cp-row"><b>Your Combat Power</b>
      <input type="text" inputmode="numeric" placeholder="e.g. 76000" value="${had ?? ""}" aria-label="Your Combat Power">
      <button type="submit" class="cp-save">Save</button>${had ? `<button type="button" class="cp-same" title="Keep ${had.toLocaleString()}">Same</button>` : ""}
      <button type="button" class="cp-x" title="Not now">×</button></div>
    <div class="cp-sub">${had ? `Last updated ${ago(settings.cpAt || 0)} · ` : ""}used for your Nova Rating · change it any time in Settings</div>`;
  const input = el.querySelector("input");
  const close = () => { el.classList.add("out"); clearInterval(watch); setTimeout(() => el.remove(), 300); if (overLock && nova?.setClickable) { overLock = false; nova.setClickable(false); } };
  const keep = v => { settings.cp = String(v); settings.cpAt = Date.now(); applySettings(); render(); close(); };
  el.onsubmit = e => {
    e.preventDefault();
    const v = parseCP(input.value);
    if (v) keep(v);
    else { input.classList.add("bad"); input.focus(); }
  };
  el.querySelector(".cp-same")?.addEventListener("click", () => keep(had));
  el.querySelector(".cp-x").onclick = close;
  input.addEventListener("input", () => input.classList.remove("bad"));
  input.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  $("meter").append(el);
  const shown = Date.now();
  // gone after 30 s untouched, or as soon as a fight starts (unless you're typing in it)
  const watch = setInterval(() => {
    if (document.activeElement === input) return;
    if (Date.now() - shown > 30000 || (fight.start != null && source === "live")) close();
  }, 500);
}
if (isApp || params.has("live")) setTimeout(() => { if (fight.start == null) cpPrompt(); }, 1500);

// ---------- start ----------
if (params.has("overlay")) document.body.classList.add("overlay");
if (isApp) { document.body.classList.add("app"); settings.locked = false; }   // the window always starts clickable
$("ver").textContent = params.get("v") ? `v${params.get("v")}` : "";
if (nova?.onUpdate) nova.onUpdate(u => {
  const b = $("upd");
  b.hidden = false;
  b.classList.toggle("ready", u.state === "ready");
  b.textContent = u.state === "ready" ? `Update ${u.version} · restart` : `Updating ${u.percent || 0}%`;
  b.disabled = u.state !== "ready";
});
$("upd").onclick = () => nova?.installUpdate();
if (isElectron) { document.body.classList.add("electron"); nova.onLock?.(on => window.novaLocked(on)); makeDraggable($("head"), nova); makeDraggable($("grip"), nova, "resize"); }
applySettings();
if (!params.has("live")) {
  demo = startDemo(push);
  if (!bests["Ancient Guardian"]) {
    const b = demoBest();
    bests["Ancient Guardian"] = { dps: { DPS: b.dps, nDPS: b.dps * .95, rDPS: b.dps }, cum: { DPS: b.cum, nDPS: b.cum.map(v => v * .95), rDPS: b.cum } };
  }
}
if (!params.has("demo")) connectLive();
render(); renderEvents();
new ResizeObserver(() => render()).observe($("meter"));
setInterval(render, 250);
setInterval(renderEvents, 1000);

// ---------- your boss & event reminders (set in the Boss timers window) ----------
function popReminder(r) {
  const opts = reminderOpts();
  const info = { text: reminderText(r), sub: r.sub || "", at: r.at, portrait: r.portrait, event: r.event, color: r.color,
                 sound: opts.sound, seconds: 9 };
  if (!opts.popup) { if (opts.sound) chime(); return; }
  if (nova?.remind) { nova.remind(info); return; }
  // no desktop app (browser): a toast inside the meter
  const el = document.createElement("div");
  el.className = "remind-toast";
  el.style.setProperty("--c", r.color || "#f0b232");
  el.innerHTML = `${r.portrait ? `<img src="img/spawns/${esc(r.portrait)}" alt="">` : ""}<div><b>${esc(info.text)}</b><small>${esc(info.sub)}</small></div>`;
  document.body.append(el);
  if (opts.sound) chime();
  setTimeout(() => el.remove(), 9000);
}
setInterval(() => { for (const r of dueReminders(spawnLists)) popReminder(r); }, 1000);
