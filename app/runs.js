// Expedition runs: the saved fights of one dungeon visit, put together.
//
// The game never says which dungeon you're in, so a run is recognised two ways:
//  - fights saved since 0.6.7 carry the zone visit they happened in (the capture service sees every zone change);
//  - older fights are grouped by time: a long break, or a boss you already killed showing up again, starts a new run.
// The dungeon itself comes from its bosses (data/dungeons.json, from aion2hub.com; tools/update_dungeons.py).

const GAP_MS = 20 * 60 * 1000;          // older fights: this long without a fight ends a run

export const DUNGEONS = [];
fetch(new URL("data/dungeons.json", import.meta.url)).then(r => r.ok ? r.json() : { dungeons: [] })
  .then(d => DUNGEONS.push(...(d.dungeons || []))).catch(() => {});

// Difficulty of every boss version by NPC id (Conquest, Exploration, Transcendence stage, Nightmare level...), plus HP
// per difficulty by boss name for versions we can't identify (data/difficulty.json, from tools/update_ratings.py)
const DIFF = { byTemplate: {}, hpByName: {} };
export const diffReady = fetch(new URL("data/difficulty.json", import.meta.url)).then(r => r.ok ? r.json() : {})
  .then(d => Object.assign(DIFF, d)).catch(() => {});

/** {difficulty, stars} for a fight summary / target ({template, target|name, hp|maxHp}), or null. */
export function bossDifficulty(f) {
  const d = DIFF.byTemplate?.[String(f?.template)];
  if (d) return d;
  const hp = f?.hp || f?.maxHp, list = DIFF.hpByName?.[(f?.target ?? f?.name ?? "").replace(/\?$/, "").trim()];
  if (!hp || !list) return null;
  const [best] = list.map(([h, diff]) => [Math.abs(h - hp) / h, diff]).sort((a, b) => a[0] - b[0]);
  return best && best[0] < 0.15 ? { difficulty: best[1], stars: null } : null;    // within 15% of a known version
}
export const difficultyLabel = d => d ? d.difficulty + (d.stars ? " · " + "★".repeat(d.stars) : "") : "";

// Dungeon artwork and boss portraits (AION 2 game art via metabot.gg, bundled by tools/update_dungeon_art.py)
const ART = { dungeons: new Set(), bosses: {} };
export const artReady = Promise.all([
  fetch(new URL("img/dungeons/index.json", import.meta.url)).then(r => r.ok ? r.json() : []).then(l => l.forEach(s => ART.dungeons.add(s))),
  fetch(new URL("img/bosses/index.json", import.meta.url)).then(r => r.ok ? r.json() : {}).then(m => Object.assign(ART.bosses, m)),
]).catch(() => {});
export const dungeonArt = slug => slug && ART.dungeons.has(slug) ? new URL(`img/dungeons/${slug}.webp`, import.meta.url).href : null;
export const bossPortrait = name => {
  const f = ART.bosses[(name || "").replace(/\?$/, "").trim()];
  return f ? new URL(`img/bosses/${f}`, import.meta.url).href : null;
};
/** The dungeon a boss belongs to (by name), for a picture when the boss has no portrait of its own. */
export const dungeonOfBoss = name => DUNGEONS.find(d => d.bosses.some(b => b.name === (name || "").replace(/\?$/, "").trim())) || null;

// "Vakron?" / "Tiere or Thamon" are guesses for bosses that spawned before the meter started
const bossName = n => (n || "").replace(/\?$/, "").trim();
const end = f => (f.date || 0) + (f.duration || 0) * 1000;

/** Which dungeon these boss names belong to (most bosses in common; Global client first; final boss seen). */
export function matchDungeon(names, dungeons = DUNGEONS) {
  const seen = new Set(names.map(bossName));
  let best = null, bestScore = 0;
  for (const d of dungeons) {
    const hits = d.bosses.filter(b => seen.has(b.name));
    if (!hits.length) continue;
    const score = hits.length * 10 + (hits.some(b => b.role === "Final Boss") ? 3 : 0) + (d.regionLocked ? 0 : 1);
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

function group(items, dungeons) {
  const fights = [...items].filter(f => f.date).sort((a, b) => a.date - b.date);
  const homes = new Map();                 // boss name -> dungeons it appears in
  for (const d of dungeons) for (const b of d.bosses) homes.set(b.name, [...(homes.get(b.name) || []), d]);
  const groups = [];
  let cur = null;
  for (const f of fights) {
    let fresh;
    if (f.zone != null || cur?.zone != null) fresh = !cur || cur.zone !== f.zone;
    else {                                 // older fights: no zone, so judge by time and by which bosses they are
      const last = cur?.fights[cur.fights.length - 1];
      const name = bossName(f.target);
      const repeat = f.boss && cur?.killed.has(name);                       // same boss again: the next run
      const elsewhere = f.boss && cur?.dungeon && homes.has(name) && !homes.get(name).includes(cur.dungeon);
      fresh = !cur || f.date - end(last) > GAP_MS || repeat || elsewhere || (f.boss && cur.finalDone);
    }
    if (fresh) groups.push(cur = { zone: f.zone ?? null, fights: [], killed: new Set(), dungeon: null, finalDone: false });
    cur.fights.push(f);
    if (f.boss && f.killed) {
      const name = bossName(f.target);
      cur.killed.add(name);
      cur.dungeon ||= (homes.get(name) || []).length === 1 ? homes.get(name)[0] : null;
      if (cur.dungeon?.bosses.some(b => b.name === name && b.role === "Final Boss")) cur.finalDone = true;
    }
  }
  return groups;
}

/** Fight summaries (from the history index) -> runs, newest first. Groups without a boss fight aren't runs. */
export function buildRuns(items, { dungeons = DUNGEONS, names = {} } = {}) {
  const runs = [];
  for (const g of group(items, dungeons)) {
    let bosses = g.fights.filter(f => f.boss);
    if (!bosses.length) continue;
    const dungeon = matchDungeon(bosses.filter(f => !/ or /.test(f.target || "")).map(f => f.target), dungeons);
    if (dungeon) {
      // "Nazmun or Gelcos or Siliator of Deceit" (a guess by HP): in this dungeon, the one boss not fought otherwise
      const sure = new Set(bosses.filter(f => !/ or |\?$/.test(f.target || "")).map(f => f.target));
      const narrow = f => {
        if (!/ or /.test(f.target || "")) return f;
        const opts = f.target.split(" or ").filter(n => dungeon.bosses.some(b => b.name === n) && !sure.has(n));
        return opts.length === 1 ? { ...f, target: opts[0] + "?" } : f;
      };
      bosses = bosses.map(narrow);
      g.fights = g.fights.map(f => bosses.find(b => b.id === f.id) || f);
    }
    const final = dungeon?.bosses.find(b => b.role === "Final Boss");
    const finalKill = final ? bosses.find(f => f.killed && bossName(f.target) === final.name)
                            : (bosses[bosses.length - 1].killed ? bosses[bosses.length - 1] : null);
    const start = g.fights[0].date;
    const stop = finalKill ? end(finalKill) : end(g.fights[g.fights.length - 1]);
    const bossTime = bosses.reduce((s, f) => s + (f.duration || 0), 0) || 1;
    const myDmg = bosses.reduce((s, f) => s + (f.self?.dps || 0) * (f.duration || 0), 0);
    const partyDmg = bosses.reduce((s, f) => s + (f.partyDmg ?? (f.partyDps || 0) * (f.duration || 0)), 0);
    const players = new Map();
    for (const f of bosses) for (const p of f.players || []) {
      const q = players.get(p.name) || { name: p.name, cls: p.cls, dmg: 0, time: 0, self: false };
      q.dmg += (p.dps || 0) * (f.duration || 0); q.time += f.duration || 0;
      if (p.cls && p.cls !== "unknown") q.cls = p.cls;
      if (f.self?.name === p.name) q.self = true;
      players.set(p.name, q);
    }
    const diffs = bosses.map(bossDifficulty).filter(Boolean);
    const tally = new Map();
    for (const d of diffs) tally.set(d.difficulty, (tally.get(d.difficulty) || 0) + 1);
    const top = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0];
    const diff = top ? { difficulty: top, stars: diffs.find(d => d.difficulty === top && d.stars)?.stars ?? null } : null;
    const nameKey = dungeon ? dungeon.slug : [...new Set(bosses.map(f => bossName(f.target)))].sort().join("|");
    const key = nameKey + (diff ? `|${diff.difficulty}` : "");     // a Conquest clear isn't compared with an Exploration one
    runs.push({
      id: `run_${start}`, key, zone: g.zone, estimated: g.zone == null,
      name: names[nameKey] || dungeon?.name || [...new Set(bosses.map(f => bossName(f.target)))].join(" → "), nameKey,
      difficulty: diff, difficultyLabel: difficultyLabel(diff),
      dungeon, start, end: stop, clear: (stop - start) / 1000, completed: !!finalKill,
      fights: g.fights, bosses,
      kills: bosses.filter(f => f.killed).length, wipes: bosses.filter(f => !f.killed).length,
      deaths: g.fights.reduce((s, f) => s + (f.deathCount ?? (f.deaths || []).length), 0),
      myDps: myDmg / bossTime, partyDps: partyDmg / bossTime, me: bosses.find(f => f.self)?.self?.name ?? null,
      players: [...players.values()].map(p => ({ ...p, dps: p.dmg / bossTime })).sort((a, b) => b.dmg - a.dmg),
    });
  }
  // fastest full clear of each dungeon
  const best = new Map();
  for (const r of runs) if (r.completed && (!best.has(r.key) || r.clear < best.get(r.key).clear)) best.set(r.key, r);
  for (const r of runs) { r.best = best.get(r.key)?.clear ?? null; r.isBest = best.get(r.key) === r; }
  return runs.reverse();
}
