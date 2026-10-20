// Side window: a player's breakdown, fight history, and saved fight reports.
// Live views follow the same event stream as the meter; history comes from the capture service (saved on disk).
import { CLASSES, classIcon, skillIcon, UI_ICONS, makeDraggable, knownSkill, skillBase, askText } from "./icons.js";
import { Fight, skillRows } from "./model.js";
import { startDemo, demoSpawns, demoPets } from "./demo.js";
import * as BT from "./bosstimers.js";
import * as PF from "./petfarm.js";
import * as PV from "./petview.js";
PF.ready.then(() => view === "pets" && render(true));
import { buildRuns, DUNGEONS, artReady, dungeonArt, bossPortrait, dungeonOfBoss, diffReady, bossDifficulty, difficultyLabel } from "./runs.js";
artReady.then(() => render(true));
diffReady.then(() => { runsCache.items = null; render(true); });
// a boss's picture: its portrait, else its dungeon's artwork; "" when there's neither
const bossPic = (name, cls = "pic") => {
  const src = bossPortrait(name) || dungeonArt(dungeonOfBoss(name)?.slug);
  return src ? `<img class="${cls}" src="${src}" alt="" loading="lazy">` : "";
};
const EXPEDITION_ICON = `<img class="expedition-icon" src="img/expedition.svg" alt="">`;   // stone gate + portal, like the game's
import { rate, ratingClass, ratingSource, ratingsReady } from "./ratings.js";
ratingsReady.then(() => render(true));
const myCP = () => +(store.get("settings", {}).cp || 0);
// rating for a player in a fight (snapshot or summary): only boss fights whose NPC id has reference data
// A saved fight keeps the rating it got when it ended (p.nova); the live fight uses your CP from Settings; fights saved
// before ratings were frozen use the CP stored with them if any, else the boss's typical CP, so they never move.
const ratingOf = (f, p, dpsVal) => {
  if (p?.nova) return p.nova;
  if (!(f?.target?.boss || f?.boss)) return null;
  const live = !report && (view === "player" || view === "live");   // the fight in progress (or just finished), not a saved one
  const cp = p.self ? (live ? myCP() : +(f.cp || 0)) : 0;
  return rate({ template: f.target?.template ?? f.template, cls: p.cls, dps: dpsVal, cp });
};
const ratingCell = r => r ? `<span class="rating ${ratingClass(r.rating)}" title="Nova Rating: ${Math.round(r.ratio * 100)}% of a typical player of this class${r.cpAdjusted ? ` at ${r.cp ? Math.round(r.cp).toLocaleString() + " " : "your "}Combat Power` : " at the boss's typical Combat Power"} (${fmt(r.expected)} DPS) on this boss, from ${r.n} character-weeks${r.healer ? ". Healers are rated on their damage only." : ""}">${Math.round(r.rating)}</span>` : `<span class="muted">–</span>`;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const params = new URLSearchParams(location.search);
const nova = window.nova;
const store = {
  get(k, d) { try { const v = localStorage.getItem("nova." + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("nova." + k, JSON.stringify(v)); } catch { /* ignore */ } },
};
const settings = { palette: "meter", accent: "#f3c25a", opacity: 0.38, font: "segoe", numbers: "short", ...store.get("settings", {}) };
const FONTS = { segoe: '"Segoe UI", system-ui, sans-serif', bahn: 'Bahnschrift, "Segoe UI", sans-serif', calibri: 'Calibri, "Segoe UI", sans-serif',
  candara: 'Candara, "Segoe UI", sans-serif', tahoma: 'Tahoma, "Segoe UI", sans-serif', trebuchet: '"Trebuchet MS", "Segoe UI", sans-serif',
  verdana: 'Verdana, "Segoe UI", sans-serif', narrow: '"Arial Narrow", Arial, sans-serif', georgia: 'Georgia, serif', mono: '"Cascadia Mono", Consolas, monospace' };
const short = n => { const a = Math.abs(n); return a >= 1e6 ? (n / 1e6).toFixed(a >= 1e8 ? 0 : 1) + "M" : a >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n)); };
const fmt = n => settings.numbers === "full" ? Math.round(n).toLocaleString() : short(n);
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const classColor = cls => CLASSES[cls]?.[settings.palette] || "#7a7f8c";
const STAR = `<svg class="icon" viewBox="0 0 24 24"><path d="M12 1.5l2.3 8.2 8.2 2.3-8.2 2.3L12 22.5l-2.3-8.2L1.5 12l8.2-2.3z" style="fill:var(--accent)"/></svg>`;

// skill names: from the bundled skill database, or ones the player typed (click a skill to rename it)
let skillNames = store.get("skillNames", {});
const skillName = label => skillNames[label] || skillNames[skillBase(label)] || knownSkill(label) || label;
const initials = label => { const n = skillName(label); return /^Skill \d+/.test(n) ? "?" : n.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase(); };
// the skill's icon, or its initials when there isn't one; a player's merged summons show their class emblem
const badge = (label, cls) => label === "Summons" ? `<span class="sk-icon cls">${classIcon(cls)}</span>`
  : skillIcon(label) ? `<span class="sk-icon has-img">${skillIcon(label)}</span>` : `<span class="sk-icon">${esc(initials(label))}</span>`;

function applyLook() {
  const r = document.documentElement.style;
  r.setProperty("--accent", settings.accent);
  r.setProperty("--bg-a", nova ? settings.opacity : 1);
  r.setProperty("--font", FONTS[settings.font] || FONTS.segoe);
}

// ---------- state ----------
const fight = new Fight(() => {});
let view = params.get("view") || "player";      // "player" | "history" | "fight"
let pid = +params.get("pid") || null;
let wantName = params.get("name") || "";
let tab = view === "history" ? "runs" : view === "timers" ? "" : view === "pets" ? "farm" : "skills";
let report = null;                               // a saved fight being viewed (view "fight", or a player inside it)
let historyItems = null;
let run = null;                                  // the expedition run being viewed (view "run")
let fromRun = false;                             // a fight report opened from a run: "back" returns to it
let runsCache = { items: null, names: "", runs: [] };
const runNames = () => store.get("runNames", {});
function allRuns() {
  const names = JSON.stringify(runNames()) + DUNGEONS.length;   // rebuilt once the dungeon list has loaded
  if (runsCache.items !== historyItems || runsCache.names !== names) {
    runsCache = { items: historyItems, names, runs: buildRuns(historyItems || [], { names: runNames() }) };
  }
  return runsCache.runs;
}
const runType = r => r.difficultyLabel || "Expedition";       // worked out from the bosses' NPC ids (or HP)
const diffChip = label => label ? `<span class="diff-chip diff-${label.split(" ")[0].toLowerCase()}">${esc(label).replace(/(★+)/, '<span class="stars">$1</span>')}</span>` : "";
let ws = null;
const liveSnap = () => fight.start == null && fight.lastFinished ? fight.lastFinished : fight.snapshot();
const snapNow = () => report || liveSnap();
const send = m => ws && ws.readyState === 1 && ws.send(JSON.stringify(m));

function connect() {
  try { ws = new WebSocket(`ws://127.0.0.1:${params.get("ws") || 8765}`); } catch { return; }
  let hello = false;
  ws.onopen = () => { hello = true; send({ type: "history_list" }); };
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (hello && d.type === "events") { hello = false; fight.reset(); }   // a reconnect replays the fight in progress
    if (d.type === "events") d.events.forEach(e => {
      if (!e || e.t === "net") return;
      if (e.t === "spawns") { BT.state.lists = e.lists || []; BT.state.webhook = e.webhook || null; BT.state.guild = e.guild || null; if (view === "timers") render(true); }
      else if (e.t === "pets" || e.t === "petsoul" || e.t === "petkill") { PF.onEvent(e); if (view === "pets") render(true); }
      else if (e.t === "spawnhook") { BT.state.hookMsg = e.ok ? "Sent: check the channel." : `Failed: ${e.error}`; if (view === "timers") render(true); }
      else fight.push(e);
    });
    else if (d.type === "history") { historyItems = d.items; if (view === "history") render(true); }
    else if (d.type === "history_saved") { historyItems = [d.item, ...(historyItems || []).filter(x => x.id !== d.item.id)]; if (view === "history") render(true); }
    else if (d.type === "fight" && d.fight) { report = d.fight; fromRun = view === "run"; view = "fight"; tab = "damage"; render(true); }
  };
  ws.onclose = () => setTimeout(connect, 3000);
}

// the meter can point us at another player / view without reopening the window
function show(info) {
  if (info.view === "history") { view = "history"; tab = "runs"; report = null; run = null; send({ type: "history_list" }); }
  else if (info.view === "timers") { view = "timers"; tab = ""; report = null; run = null; }
  else if (info.view === "pets") { view = "pets"; tab = "farm"; report = null; run = null; }
  else { view = "player"; report = null; pid = +info.pid; wantName = info.name || ""; tab = "skills"; }
  render(true);
}
window.novaShow = show;
if (nova?.onShow) nova.onShow(show);

// ---------- render ----------
let lastKey = "";
function setTabs(list) {
  const html = list.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? "on" : ""}">${l}</button>`).join("");
  if ($("dtabs").innerHTML !== html) $("dtabs").innerHTML = html;
}
function header({ emblem, name, cc, sub, me = false, back = false, picker = "" }) {
  document.documentElement.style.setProperty("--cc", cc);
  const em = (back ? `<button class="back" data-act="back" title="Back">‹</button>` : "") + emblem;
  if ($("demblem")._html !== em) { $("demblem").innerHTML = em; $("demblem")._html = em; }   // no flicker: only when it changes
  $("dname").textContent = name;
  $("dme").hidden = !me;
  $("dsub").textContent = sub;
  $("dsub").title = sub;                                          // the subtitle is one line: the full text on hover
  if ($("dplayer").dataset.opts !== picker) { $("dplayer").innerHTML = picker; $("dplayer").dataset.opts = picker; }
  $("dplayer").hidden = !picker;
}
const cards = list => {
  const html = list.map(([k, v]) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
  if ($("cards")._html !== html) { $("cards").innerHTML = html; $("cards")._html = html; }
};
function body(key, html, force) {
  if (!force && key === lastKey) return;
  const screen = k => k.split("|").slice(0, 2).join("|");      // e.g. "run|<id>", "report|<id>", "skills|<pid>"
  const same = screen(key) === screen(lastKey);
  lastKey = key;
  const b = $("dbody"), sc = b.scrollTop;
  b.innerHTML = html();
  b.scrollTop = same ? sc : 0;                                  // refreshes keep your place; a new screen starts at the top
}

function render(force = false) {
  if (view === "timers") return renderTimers(force);
  if (view === "pets") return renderPets(force);
  if (view === "history") return renderHistory(force);
  if (view === "run") return renderRun(force);
  if (view === "live") return renderReport(force, liveSnap());
  if (view === "fight") return renderReport(force);
  renderPlayer(force);
}

// ----- player breakdown (live, or from a saved report) -----
function renderPlayer(force) {
  const snap = snapNow();
  const ps = [...snap.players].sort((a, b) => b.dmg - a.dmg);
  // by name first: a new zone hands entity ids out again, so the old id may be someone else now
  let p = (wantName && !wantName.startsWith("#") && ps.find(x => x.name === wantName)) || ps.find(x => x.id === pid);
  if (p) { pid = p.id; wantName = p.name; }
  const t = Math.max(snap.duration, 1);
  const party = ps.reduce((s, x) => s + x.dmg, 0) || 1;
  if (report && (tab === "hits" || tab === "rotation")) tab = "skills";
  setTabs(report ? [["skills", "Skills"], ["defense", "Defense"]] : [["skills", "Skills"], ["hits", "Hits"], ["defense", "Defense"], ["rotation", "Rotation"]]);
  const picker = ps.map(x => `<option value="${x.id}" ${p && x.id === p.id ? "selected" : ""}>${esc(x.name)}</option>`).join("");
  if (!p) {
    header({ emblem: STAR, name: wantName || "Waiting for a fight…", cc: settings.accent, sub: "Their numbers appear here as soon as they deal damage.", back: true, picker });
    cards([]); body("empty", () => `<div class="dempty">No data for this player yet.</div>`, force);
    return;
  }
  const crit = p.hits ? p.crits / p.hits * 100 : 0;
  header({ emblem: classIcon(p.cls), name: p.name, cc: classColor(p.cls), me: p.self, back: true, picker,
           sub: `#${ps.indexOf(p) + 1} · ${CLASSES[p.cls]?.label ?? "Class unknown"} · ${crit.toFixed(1)}% crit · ${snap.target?.name ?? ""}` });
  const active = (p.sec?.dmg || []).filter(Boolean).length;
  const pr = ratingOf(snap, p, p.dmg / t);
  cards([["DPS", fmt(p.dmg / t)], pr ? ["Nova Rating", `<span class="rating ${ratingClass(pr.rating)}">${Math.round(pr.rating)}</span><small> ${Math.round(pr.ratio * 100)}% of typical</small>`] : ["Damage", fmt(p.dmg)], ["Contribution", (p.dmg / party * 100).toFixed(1) + "%"],
         ["Active", `${fmtTime(Math.min(active, t))} <small>/ ${fmtTime(t)}</small>`]]);
  body(`${tab}|${p.id}|${p.hits}|${p.inc}|${p.healIn}|${Math.floor(t)}|${!!report}`,
    () => tab === "skills" ? skillsHtml(p, t) : tab === "hits" ? hitsHtml(p) : tab === "defense" ? defenseHtml(p, snap, t) : rotationHtml(p), force);
}

function skillsHtml(p, t) {
  const skills = skillRows(p);
  if (!skills.length) return `<div class="dempty">No damage yet.</div>`;
  const total = p.dmg || 1, top = skills[0].dmg;
  return `<div class="sk-head"><span></span><span>Skill</span><span class="num">Damage</span><span class="num h-dps">DPS</span><span class="num">Crit</span></div>` +
    skills.map(s => `<div class="sk-row" title="${s.hits} hits · avg ${fmt(s.dmg / s.hits)} · max ${fmt(s.max)} · ${(s.dmg / total * 100).toFixed(1)}% of damage">
      <div class="fill" style="width:${(s.dmg / top * 100).toFixed(1)}%"></div>
      ${badge(s.name, p.cls)}
      <span class="sk-name"${s.name === "Summons" ? ' title="Everything this player\'s summons did"' : ` data-skill="${esc(s.name)}" title="Click to rename"`}>${/^Skill \d+/.test(skillName(s.name))
        ? `<span class="muted">Unnamed skill · ${esc(s.name.replace(/^Skill (\d{4})\d+/, "$1"))}</span> <span class="sk-sub">click to name</span>`
        : esc(skillName(s.name))} <span class="sk-sub">${(s.dmg / total * 100).toFixed(1)}%</span></span>
      <span class="num dmg">${fmt(s.dmg)}</span><span class="num dps">${fmt(s.dmg / t)}</span><span class="num">${(s.crits / s.hits * 100).toFixed(0)}%</span>
    </div>`).join("") +
    (Object.keys(skillNames).length ? `<div class="sk-share"><button class="link" data-act="share-skills">Share your skill names with everyone</button></div>` : "");
}

// Opens a GitHub issue with the names this player typed, so they can be added to the shared list for everyone.
function shareSkillNames() {
  const named = Object.entries(skillNames).filter(([k]) => /^Skill \d+$/.test(k))
    .map(([k, v]) => `"${k.replace("Skill ", "")}": "${v.replace(/"/g, "'")}"`);
  if (!named.length) return;
  const body = ["Skill names I've used in Nova Meter (skill id: name):", "", "```json", "{", named.join(",\n"), "}", "```"].join("\n");
  const url = `https://github.com/odenness/nova-meter/issues/new?labels=skill-names&title=${encodeURIComponent("Skill names")}&body=${encodeURIComponent(body)}`;
  nova?.openExternal ? nova.openExternal(url) : open(url, "_blank", "noopener");
}

function hitsHtml(p) {
  const log = (p.log || []).slice(-150).reverse();
  if (!log.length) return `<div class="dempty">${report ? "Individual hits aren't kept in saved fights." : "No hits yet."}</div>`;
  return log.map(h => `<div class="hit${h.crit ? " crit" : ""}"><span class="num muted">${fmtTime(h.t)}.${String(Math.floor((h.t % 1) * 10))}</span>
    <span class="hit-skill">${skillIcon(h.skill, 18)}${esc(skillName(h.skill))}${h.crit ? '<span class="crit-tag">CRIT</span>' : ""}</span><span class="num">${fmt(h.dmg)}</span></div>`).join("");
}

function defenseHtml(p, snap, t) {
  const deaths = snap.deaths.filter(d => d.id === p.id);
  const c = [["Damage taken", fmt(p.inc || 0)], ["Taken per sec", fmt((p.inc || 0) / t)], ["Healing received", fmt(p.healIn || 0)]]
    .map(([k, v]) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
  const rows = (p.incFrom || []).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${fmt(v)}</td><td class="n">${(v / (p.inc || 1) * 100).toFixed(1)}%</td></tr>`).join("");
  return `<div class="def-grid">${c}</div>` +
    (rows ? `<table class="t"><tr><th>Ability · from</th><th class="n">Damage</th><th class="n">%</th></tr>${rows}</table>` : `<div class="dempty">No damage taken.</div>`) +
    (deaths.length ? `<h4 class="sec">Deaths</h4>` + deaths.map(d => { const h = d.hits[d.hits.length - 1];
      return `<div class="hit"><span class="num muted">${fmtTime(d.at)}</span><span>${h ? esc(h.skill) + " from " + esc(h.from) : "Died"}</span><span class="num bad">${h ? fmt(h.dmg) : ""}</span></div>`; }).join("") : "");
}

function rotationHtml(p) {
  // one cast = hits of the same skill landing within 0.5 s of each other (AoE, multi-hit)
  const casts = [];
  for (const h of p.log || []) {
    const last = casts[casts.length - 1];
    if (last && last.skill === h.skill && h.t - last.end < 0.5) { last.end = h.t; last.dmg += h.dmg; }
    else casts.push({ skill: h.skill, t: h.t, end: h.t, dmg: h.dmg });
  }
  if (!casts.length) return `<div class="dempty">${report ? "Rotations aren't kept in saved fights." : "No casts yet."}</div>`;
  const recent = casts.slice(-60);
  const idle = casts.reduce((s, c, i) => s + (i && c.t - casts[i - 1].end > 1.5 ? c.t - casts[i - 1].end : 0), 0);
  let html = `<div class="rot-legend">${casts.length} casts · ${idle.toFixed(1)} s idle (gaps over 1.5 s) · last ${recent.length}, oldest first</div><div class="rot">`;
  recent.forEach((c, i) => {
    const gap = i ? c.t - recent[i - 1].end : 0;
    if (gap > 1.5) html += `<span class="gap">${gap.toFixed(1)}s</span>`;
    html += `<div class="cast" title="${esc(skillName(c.skill))} · ${fmt(c.dmg)}">${badge(c.skill, p.cls)}<span class="t">${fmtTime(c.t)}</span></div>`;
  });
  return html + "</div>";
}

// ----- boss timers & reminders (bosstimers.js) -----
function renderTimers(force) {
  const list = BT.tabs();
  if (!list.some(([k]) => k === tab)) tab = list[0][0];
  setTabs(list);
  header({ emblem: BT.HOURGLASS, name: "Boss timers", cc: settings.accent,
           sub: "Live from the game: open your world map to refresh. Click a bell to get a pop-up before a boss or event." });
  cards(BT.cardsFor());
  body(`timers|${tab}|${BT.screenKey(tab)}`, () => BT.screenHtml(tab), force);
  BT.tickCountdowns($("dbody"));
}

// ----- pet farming (petview.js) -----
function renderPets(force) {
  const list = PV.tabs();
  if (!list.some(([k]) => k === tab)) tab = list[0][0];
  setTabs(list);
  header({ emblem: PV.PAW, name: "Pet farming", cc: settings.accent,
           sub: "Your pets' levels and souls, live from the game. Put pets on your target farm to watch them on the meter." });
  cards(PV.cardsFor());
  body(`pets|${tab}|${PV.screenKey(tab)}`, () => PV.screenHtml(tab), force);
  PV.applyFilter($("dbody"));
}

// ----- history -----
function renderHistory(force) {
  const items = historyItems || [];
  setTabs([["runs", "Expeditions"], ["fights", "Fights"], ["bests", "Personal bests"]]);
  if (tab === "runs") return renderRuns(force);
  header({ emblem: STAR, name: "Fight history", cc: settings.accent, sub: "Saved on this PC when each fight ends. Click one for the full report." });
  const kills = items.filter(f => f.killed).length;
  const time = items.reduce((s, f) => s + (f.duration || 0), 0);
  const bestDps = Math.max(0, ...items.map(f => f.self?.dps || 0));
  cards([["Fights", items.length], ["Kills", kills], ["Your best DPS", fmt(bestDps)], ["Time in combat", fmtTime(time)]]);
  body(`history|${tab}|${items.length}|${items[0]?.id}|${historyItems === null}`, () => tab === "bests" ? bestsHtml() : historyListHtml(items), force);
}

function historyListHtml(items) {
  if (historyItems === null) return `<div class="dempty">Loading…</div>`;
  if (!items.length) return `<div class="dempty">No fights saved yet. They appear here as soon as a fight ends.</div>`;
  const day = d => new Date(d).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  let html = "", last = "";
  for (const f of items.slice(0, 300)) {
    const d = day(f.date);
    if (d !== last) { html += `<div class="h-day">${d}</div>`; last = d; }
    const lead = (f.players || []).slice(0, 4).map(p => `<span style="--cc:${classColor(p.cls)}" class="h-p">${esc(p.name)}</span>`).join("");
    html += `<div class="h-row" data-fight="${esc(f.id)}">
      <span class="h-time num">${new Date(f.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      <span class="h-main"><span class="h-name">${f.boss ? bossPic(f.target, "pic") || '<span class="boss-badge">BOSS</span> ' : ""}${esc(f.target ?? "Fight")} ${f.boss ? diffChip(difficultyLabel(bossDifficulty(f))) : ""}</span><span class="h-sub">${lead}</span></span>
      <span class="h-res ${f.killed ? "ok" : "muted"}">${f.killed ? "Kill" : "Ended"}<small class="num">${fmtTime(f.duration)}</small></span>
      <span class="h-dps num">${f.self ? fmt(f.self.dps) : "–"}<small>you</small></span>
      <span class="h-dps num">${fmt(f.partyDps)}<small>party</small></span>
      <button class="mini-btn" data-del="${esc(f.id)}" title="Delete this fight">✕</button>
    </div>`;
  }
  return html;
}

// ----- expedition runs (a dungeon visit: its boss fights, clear time, deaths) -----
function renderRuns(force) {
  const runs = allRuns();
  header({ emblem: `<span class="emblem-gate">${EXPEDITION_ICON}</span>`, name: "Expeditions", cc: settings.accent,
           sub: "Each dungeon visit as one run: clear time, deaths and every boss. Click one for the details." });
  const clears = runs.filter(r => r.completed);
  const recent = runs.filter(r => r.me).slice(0, 10);
  cards([["Runs", runs.length], ["Full clears", clears.length],
         ["Deaths / run", runs.length ? (runs.reduce((s, r) => s + r.deaths, 0) / runs.length).toFixed(1) : "–"],
         ["Boss DPS (last 10)", recent.length ? fmt(recent.reduce((s, r) => s + r.myDps, 0) / recent.length) : "–"]]);
  body(`runs|${historyItems === null}|${runs.length}|${runs[0]?.id}|${runsCache.names}|${runs[0]?.difficultyLabel}`, () => {
    if (historyItems === null) return `<div class="dempty">Loading…</div>`;
    if (!runs.length) return `<div class="dempty">No runs yet. A run appears here once you've fought a boss in a dungeon.</div>`;
    const day = d => new Date(d).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
    let html = "", last = "";
    for (const r of runs.slice(0, 200)) {
      const d = day(r.start);
      if (d !== last) { html += `<div class="h-day">${d}</div>`; last = d; }
      // the list stays a summary: difficulty + bosses killed; every fight and wipe is in the run view
      const plainName = n => (n || "").replace(/\?$/, "");
      const total = r.dungeon ? r.dungeon.bosses.length : new Set(r.bosses.map(f => plainName(f.target))).size;
      const killed = new Set(r.bosses.filter(f => f.killed).map(f => plainName(f.target))).size;
      const chips = `<span class="run-count">Bosses ${killed}/${total}</span>`;
      const thumb = dungeonArt(r.dungeon?.slug) || bossPortrait(r.bosses[r.bosses.length - 1]?.target);
      html += `<div class="h-row run-row" data-run="${esc(r.id)}">
        <span class="run-thumb">${thumb ? `<img src="${thumb}" alt="" loading="lazy">` : EXPEDITION_ICON}<span class="num">${new Date(r.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></span>
        <span class="h-main"><span class="h-name">${esc(r.name)}${r.isBest ? ' <span class="run-best" title="Your fastest full clear">BEST</span>' : ""}</span><span class="h-sub">${diffChip(r.difficultyLabel)}${chips}</span></span>
        <span class="h-res ${r.completed ? "ok" : "muted"}">${r.completed ? "Clear" : "Not cleared"}<small class="num">${fmtTime(r.clear)}</small></span>
        <span class="h-dps num">${r.me ? fmt(r.myDps) : "–"}<small>you</small></span>
        <span class="h-dps num">${fmt(r.partyDps)}<small>party</small></span>
        <span class="h-dps num ${r.deaths ? "bad" : "muted"}">${r.deaths}<small>deaths</small></span>
      </div>`;
    }
    return html + `<p class="muted run-note">Runs from before Nova Meter 0.6.7 are worked out from fight times, so they can be off.
      Dungeon boss lists from <a class="link" data-href="https://aion2hub.com/database">aion2hub.com</a>.</p>`;
  }, force);
}

function renderRun(force) {
  const r = (run && allRuns().find(x => x.id === run.id)) || run;
  if (!r) { view = "history"; tab = "runs"; return render(true); }
  run = r;
  setTabs([["bosses", "Bosses"], ["party", "Party"], ["fights", `All fights (${r.fights.length})`]]);
  const when = new Date(r.start).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const finalBoss = r.dungeon?.bosses.find(b => b.role === "Final Boss")?.name || r.bosses[r.bosses.length - 1]?.target;
  header({ emblem: bossPic(finalBoss, "emblem-img") || STAR, name: r.name, cc: settings.accent, back: true,
           sub: `${runType(r)} · ${when} · ${r.completed ? "Cleared" : "Not cleared"}${r.estimated ? " · estimated from fight times" : ""}` });
  const plain = n => (n || "").replace(/\?$/, "");
  const total = r.dungeon ? r.dungeon.bosses.length : new Set(r.bosses.map(f => plain(f.target))).size;
  const killed = new Set(r.bosses.filter(f => f.killed).map(f => plain(f.target))).size;
  cards([["Clear time", fmtTime(r.clear) + (r.isBest ? "<small> best</small>" : r.best ? `<small> best ${fmtTime(r.best)}</small>` : "")],
         ["Bosses", `${killed}/${total}` + (r.wipes ? `<small> ${r.wipes} wipe${r.wipes === 1 ? "" : "s"}</small>` : "")],
         ["Deaths", r.deaths], ["Your boss DPS", r.me ? fmt(r.myDps) : "–"]]);
  const art = dungeonArt(r.dungeon?.slug);
  const banner = art ? `<div class="run-banner" style="background-image:url('${art}')"><span>${esc(r.dungeon?.name ?? r.name)}${r.dungeon?.partySize ? ` · ${r.dungeon.partySize}-player` : ""}${r.dungeon?.itemLevel ? ` · item level ${r.dungeon.itemLevel}+` : ""}</span></div>` : "";
  body(`run|${r.id}|${tab}|${r.name}|${runType(r)}|${!!art}`, () => banner + (() => {
    const tools = `<div class="run-tools"><button class="mini-btn" data-act="run-rename">Rename</button></div>`;
    if (tab === "party") {
      if (!r.players.length) return `<div class="dempty">Nothing recorded.</div>` + tools;
      const top = r.players[0].dmg || 1, sum = r.players.reduce((s, p) => s + p.dmg, 0) || 1;
      return `<div class="sk-head"><span></span><span>Player (boss fights)</span><span class="num">Damage</span><span class="num h-dps">DPS</span><span class="num">%</span></div>` +
        r.players.map(p => `<div class="sk-row" style="--cc:${classColor(p.cls)}">
          <div class="fill" style="width:${(p.dmg / top * 100).toFixed(1)}%"></div>
          <span class="sk-icon cls">${classIcon(p.cls)}</span><span class="sk-name">${esc(p.name)}${p.self ? ' <span class="me">ME</span>' : ""}</span>
          <span class="num dmg">${fmt(p.dmg)}</span><span class="num dps">${fmt(p.dps)}</span><span class="num">${(p.dmg / sum * 100).toFixed(1)}%</span>
        </div>`).join("") + tools;
    }
    if (tab === "fights") return historyListHtml([...r.fights].reverse()) + tools;
    // the bosses in the order you met them, then any the dungeon has that you didn't reach
    const at = f => fmtTime((f.date - r.start) / 1000);
    let html = r.bosses.map(f => `<div class="h-row" data-fight="${esc(f.id)}">
        <span class="h-time num" title="Time into the run">${at(f)}</span>
        <span class="h-main"><span class="h-name">${bossPic(f.target, "pic")}${esc(f.target)}</span><span class="h-sub muted">${esc(r.dungeon?.bosses.find(b => b.name === plain(f.target))?.role ?? "Boss")}${f.deathCount ? ` · ${f.deathCount} death${f.deathCount === 1 ? "" : "s"}` : ""}</span></span>
        <span class="h-res ${f.killed ? "ok" : "bad"}">${f.killed ? "Kill" : "Wipe"}<small class="num">${fmtTime(f.duration)}</small></span>
        <span class="h-dps num">${f.self ? fmt(f.self.dps) : "–"}<small>you</small></span>
        <span class="h-dps num">${fmt(f.partyDps)}<small>party</small></span>
        <span class="h-dps num">${f.self ? ratingCell(ratingOf(f, { ...f.self, self: true }, f.self.dps)) : "–"}<small>rating</small></span>
      </div>`).join("");
    const met = new Set(r.bosses.map(f => plain(f.target)));
    for (const b of r.dungeon?.bosses.filter(b => !met.has(b.name)) || []) {
      html += `<div class="h-row run-missing"><span class="h-time num">–</span><span class="h-main"><span class="h-name">${bossPic(b.name, "pic")}${esc(b.name)}</span><span class="h-sub muted">${esc(b.role)} · not fought</span></span><span></span><span></span><span></span><span></span></div>`;
    }
    return html + tools;
  })(), force);
}

function bestsHtml() {
  const bests = store.get("best", {});
  const rows = Object.entries(bests).filter(([k, v]) => k.includes("|") && v?.dps?.DPS)
    .map(([k, v]) => ({ boss: k.split("|")[0], name: v.name || k.split("|")[1], cls: v.cls, dps: v.dps.DPS, date: v.date }))
    .sort((a, b) => a.boss.localeCompare(b.boss) || b.dps - a.dps);
  if (!rows.length) return `<div class="dempty">Personal bests are recorded when you kill a boss.</div>`;
  return `<table class="t"><tr><th>Boss</th><th>Character</th><th class="n">Best DPS</th><th>When</th></tr>` +
    rows.map(r => `<tr><td>${esc(r.boss)}</td><td style="color:${classColor(r.cls)}">${esc(r.name)}</td><td class="n">${fmt(r.dps)}</td>
      <td class="muted">${r.date ? new Date(r.date).toLocaleDateString() : "–"}</td></tr>`).join("") + `</table>`;
}

// ----- saved fight report -----
function renderReport(force, live = null) {
  const f = live || report, t = Math.max(f.duration, 1);
  const ps = [...f.players].sort((a, b) => b.dmg - a.dmg);
  const total = ps.reduce((s, p) => s + p.dmg, 0) || 1;
  setTabs([["damage", "Damage"], ["healing", "Healing"], ["taken", "Damage taken"], ["deaths", `Deaths (${f.deaths.length})`]]);
  header({ emblem: (f.target?.boss && bossPic(f.target.name, "emblem-img")) || STAR, name: f.target?.name ?? (live ? "Waiting for a fight…" : "Fight"), cc: settings.accent, back: !live,
           sub: live ? `Current fight · ${fmtTime(f.duration)}${f.killed ? " · Kill" : ""} · click a player for their breakdown`
                     : `${new Date(f.date).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${f.killed ? "Kill" : "Ended"}${f.cp ? ` · your CP ${Math.round(f.cp).toLocaleString()}` : ""}` });
  cards([["Party DPS", fmt(total / t)], ["Damage", fmt(total)], ["Length", fmtTime(f.duration)], ["Deaths", f.deaths.length]]);
  body(live ? `live|${tab}|${Math.floor(f.duration)}|${f.players.length}|${total}` : `report|${f.id}|${tab}`, () => {
    if (tab === "deaths") return f.deaths.length ? f.deaths.map(d => { const h = d.hits[d.hits.length - 1];
      return `<div class="hit"><span class="num muted">${fmtTime(d.at)}</span><span>${esc(d.name)}${h ? ` · ${esc(h.skill)} from ${esc(h.from)}` : ""}</span><span class="num bad">${h ? fmt(h.dmg) : ""}</span></div>`; }).join("")
      : `<div class="dempty">Nobody died.</div>`;
    const key = tab === "healing" ? "heal" : tab === "taken" ? "inc" : "dmg";
    const rows = [...f.players].filter(p => (p[key] || 0) > 0).sort((a, b) => (b[key] || 0) - (a[key] || 0));
    if (!rows.length) return `<div class="dempty">Nothing recorded.</div>`;
    const sum = rows.reduce((s, p) => s + (p[key] || 0), 0) || 1, top = rows[0][key];
    const rated = key === "dmg" && rows.some(p => ratingOf(f, p, p.dmg / t));
    return `<div class="sk-head${rated ? " rated" : ""}"><span></span><span>Player</span><span class="num">Total</span><span class="num h-dps">Per sec</span><span class="num">%</span>${rated ? '<span class="num" title="Nova Rating: percentile vs the same class at the same Combat Power on this boss">Rating</span>' : ""}</div>` +
      rows.map(p => `<div class="sk-row player-row${rated ? " rated" : ""}" style="--cc:${classColor(p.cls)}" data-pid="${p.id}" title="Click for ${esc(p.name)}'s breakdown">
        <div class="fill" style="width:${(p[key] / top * 100).toFixed(1)}%"></div>
        <span class="sk-icon cls">${classIcon(p.cls)}</span><span class="sk-name">${esc(p.name)}${p.self ? ' <span class="me">ME</span>' : ""}</span>
        <span class="num dmg">${fmt(p[key])}</span><span class="num dps">${fmt(p[key] / t)}</span><span class="num">${(p[key] / sum * 100).toFixed(1)}%</span>
        ${rated ? `<span class="num">${ratingCell(ratingOf(f, p, p.dmg / t))}</span>` : ""}
      </div>`).join("") + (rated ? `<p class="muted run-note">Nova Rating: 50 = typical for that class (at your Combat Power, if set in Settings) on this boss, 95 = top 5%. Reference: ${esc(ratingSource())}.</p>` : "") +
      `<button class="mini-btn copy-chat" data-act="copy">Copy summary for game chat</button>`;
  }, force);
}

function summaryText(f) {
  const t = Math.max(f.duration, 1);
  const ps = [...f.players].sort((a, b) => b.dmg - a.dmg);
  const total = ps.reduce((s, p) => s + p.dmg, 0) || 1;
  return `[Nova Meter] ${f.target?.name ?? "Fight"} · ${fmtTime(f.duration)}${f.killed ? " · Kill" : ""} · Party ${short(total / t)} DPS | ` +
    ps.slice(0, 8).map((p, i) => `${i + 1}. ${p.name} ${short(p.dmg / t)} (${(p.dmg / total * 100).toFixed(0)}%)`).join(" ");
}

// ---------- wiring ----------
$("dclose").innerHTML = UI_ICONS.close;
$("dclose").onclick = () => nova ? nova.closeDetails() : window.close();
$("dplayer").onchange = e => { pid = +e.target.value; wantName = ""; render(true); };   // the id decides; render() picks up the name
$("dtabs").onclick = e => {
  const b = e.target.closest("[data-tab]"); if (!b) return;
  tab = b.dataset.tab;
  document.querySelectorAll("#dtabs button").forEach(x => x.classList.toggle("on", x === b));
  render(true);
};
$("dhead").addEventListener("click", e => {
  if (!e.target.closest("[data-act=back]")) return;
  if (view === "player" && report) { view = "fight"; tab = "damage"; }
  else if (view === "player") { view = "live"; tab = "damage"; }
  else if (view === "fight" && fromRun && run) { view = "run"; tab = "bosses"; report = null; fromRun = false; }
  else if (view === "run") { view = "history"; tab = "runs"; run = null; }
  else { view = "history"; tab = "fights"; report = null; }
  render(true);
});
// player rows open on press, not click: the live overview redraws twice a second and a redraw between press and
// release would swallow the click
$("dbody").addEventListener("pointerdown", e => {
  const pr = e.button === 0 && e.target.closest(".player-row[data-pid]");
  if (pr) { pid = +pr.dataset.pid; wantName = ""; view = "player"; tab = "skills"; render(true); }
});
$("dbody").addEventListener("click", e => {
  if (view === "timers" && BT.onClick(e, { send, rerender: () => render(true), askText, nova })) return;
  if (view === "pets" && PV.onClick(e, { rerender: () => render(true), nova })) return;
  const del = e.target.closest("[data-del]");
  if (del) { e.stopPropagation(); if (confirm("Delete this fight from your history?")) send({ type: "history_delete", id: del.dataset.del }); return; }
  const rr = e.target.closest("[data-run]");
  if (rr) { run = allRuns().find(x => x.id === rr.dataset.run) || null; if (run) { view = "run"; tab = "bosses"; render(true); } return; }
  const href = e.target.closest("[data-href]");
  if (href) { if (nova?.openExternal) nova.openExternal(href.dataset.href); else window.open(href.dataset.href); return; }
  if (e.target.closest("[data-act=run-rename]") && run) {
    const key = run.nameKey;
    askText("Name this dungeon (every run of it uses this name)", run.name).then(name => {
      if (name === null) return;
      const names = runNames();
      if (name.trim()) names[key] = name.trim(); else delete names[key];
      store.set("runNames", names); render(true);
    });
    return;
  }
  const fr = e.target.closest("[data-fight]");
  if (fr) { send({ type: "history_get", id: fr.dataset.fight }); return; }
  if (e.target.closest("[data-act=copy]")) {
    navigator.clipboard.writeText(summaryText(report || liveSnap())).then(() => { e.target.textContent = "Copied — paste it into game chat"; });
    return;
  }
  if (e.target.closest("[data-act=share-skills]")) { shareSkillNames(); return; }
  const s = e.target.closest("[data-skill]"); if (!s) return;
  const label = skillBase(s.dataset.skill);           // one name for every level of the skill
  askText(`Name this skill (${label.replace(/^Skill /, "id ")})`, skillNames[label] || (knownSkill(label) ?? "")).then(name => {
    if (name === null) return;
    if (name.trim()) skillNames[label] = name.trim(); else delete skillNames[label];
    store.set("skillNames", skillNames);
    render(true);
  });
});
$("dbody").addEventListener("change", e => { if (view === "timers") BT.onChange(e, () => render(true), send); if (view === "pets") PV.onChange(e, () => render(true)); });
$("dbody").addEventListener("input", e => { if (view === "pets") PV.onInput(e); });
addEventListener("storage", e => {
  if (e.key === "nova.reminders" && view === "timers") render(true);
  if (e.key?.startsWith("nova.pet") && view === "pets") render(true);
  if (e.key === "nova.skillNames") skillNames = store.get("skillNames", {});
  if (e.key === "nova.settings") { Object.assign(settings, store.get("settings", {})); applyLook(); }
});

if (nova) { document.body.classList.add("electron"); makeDraggable($("dhead"), nova); makeDraggable($("dgrip"), nova, "resize"); }
applyLook();
if (params.has("demo")) { startDemo(e => e.t !== "net" && fight.push(e)); BT.state.lists = demoSpawns(); PF.ready.then(() => { PF.onEvent(demoPets()); render(true); }); } else connect();
render(true);
setInterval(render, 500);
