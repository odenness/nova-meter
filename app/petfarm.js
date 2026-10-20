// Pet farming: your pets' levels and souls (from the game, via the capture service), the pets you're farming
// ("target farm") and the kills since each one's last soul. Shared by the meter overlay and the Pet farming window.
//
// A pet's first soul unlocks it (level 1); 25 more make level 2 and 75 more level 3, the max. Pets that can't be
// farmed (shop / special) aren't listed.

const TARGETS = "nova.petTargets";        // [pet id, ...] in the order you added them
const OPTS = "nova.petOpts";
const KILLS = "nova.petKills";            // pet id -> kills of its monsters since its last soul
const DONE = "nova.petCelebrated";        // "pet:level" already celebrated

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } };

export const state = { pets: new Map(), owned: {}, souls: {}, monsters: {}, at: null };
export const ready = fetch("data/pets.json").then(r => r.json()).then(d => {
  for (const p of d.pets) state.pets.set(p.id, p);
}).catch(() => {});

export const opts = () => ({ overlay: true, auto: true, autoRemove: true, sound: true, ...read(OPTS, {}) });
export const setOpts = o => write(OPTS, { ...opts(), ...o });
export const targets = () => read(TARGETS, []);
export const isTarget = id => targets().includes(+id);
export function setTarget(id, on) {
  const t = targets().filter(x => x !== +id);
  if (on) t.push(+id);
  write(TARGETS, t);
}
export const killsSinceSoul = id => read(KILLS, {})[id] || 0;
function addKill(id) { const k = read(KILLS, {}); k[id] = (k[id] || 0) + 1; write(KILLS, k); }
function resetKills(id) { const k = read(KILLS, {}); delete k[id]; write(KILLS, k); }

/** → { level, souls, need, max, done, label } for one pet. need = souls for the next level (null at max). */
export function progress(id) {
  const p = state.pets.get(+id);
  const level = state.owned[id] || 0, souls = state.souls[id] || 0;
  const steps = p?.need || [25, 75];
  const max = steps.length + 1;
  const need = level === 0 ? 1 : level >= max ? null : steps[level - 1];
  const label = level === 0 ? (souls ? `${souls} soul${souls > 1 ? "s" : ""} · not registered` : "not unlocked")
    : need == null ? `Level ${level} · max` : `Level ${level} · ${Math.min(souls, need)}/${need}`;
  return { level, souls, need, max, done: need == null, ready: need != null && souls >= need, label };
}

export function farmable() {
  return [...state.pets.values()].filter(p => p.farmable);
}

/**
 * Events from the capture service. Returns what the page should show: [{ kind: "levelup", pet, level }] for a
 * level reached (souls full, or the game's own level going up), so each page decides how to celebrate.
 */
export function onEvent(e) {
  const out = [];
  if (e.t === "pets") {
    state.owned = numKeys(e.owned); state.souls = numKeys(e.souls); state.monsters = e.monsters || {}; state.at = e.at;
    for (const id of targets()) out.push(...check(id));
  } else if (e.t === "petsoul") {
    const id = +e.pet;
    if (e.level != null) state.owned[id] = e.level;
    state.souls[id] = e.souls;
    if (e.gain > 0) resetKills(id);
    if (opts().auto && (e.gain > 0 || (e.level || 0) > (e.prevLevel || 0)) && !isTarget(id) && state.pets.get(id)?.farmable
        && !progress(id).done) setTarget(id, true);                 // target farm mode: picked up on its own
    if ((e.level || 0) > (e.prevLevel || 0)) out.push(...celebrateOnce(id, e.level));
    out.push(...check(id));
  } else if (e.t === "petkill") {
    const id = +e.pet;
    addKill(id);
    if (opts().auto && !isTarget(id) && state.pets.get(id)?.farmable && !progress(id).done) setTarget(id, true);
  }
  return out;
}

function check(id) {
  const pr = progress(id);
  if (pr.ready && pr.level >= 1) return celebrateOnce(id, pr.level + 1);      // souls full for the next level
  if (pr.done && opts().autoRemove && isTarget(id)) setTarget(id, false);     // finished: off the target farm
  return [];
}

function celebrateOnce(id, level) {
  const done = read(DONE, {});
  const key = `${id}:${level}`;
  if (done[key]) return [];
  done[key] = Date.now();
  write(DONE, done);
  if (level >= progress(id).max && opts().autoRemove) setTarget(id, false);
  return [{ kind: "levelup", pet: state.pets.get(+id) || { id, name: `Pet ${id}` }, level }];
}

const numKeys = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [+k, v]));
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** One pet as a compact row (overlay strip, target list). */
export function petRow(id, { big = false } = {}) {
  const p = state.pets.get(+id) || { name: `Pet ${id}` };
  const pr = progress(id);
  const pct = pr.need ? Math.min(100, Math.round(Math.min(pr.souls, pr.need) / pr.need * 100)) : 100;
  const kills = killsSinceSoul(id);
  return `<div class="pet-row${big ? " big" : ""}${pr.ready ? " ready" : ""}${pr.done ? " done" : ""}" data-pet="${p.id ?? id}">
    ${p.pic ? `<img class="pet-pic" src="${esc(p.pic)}" alt="">` : `<span class="pet-pic"></span>`}
    <span class="pet-main"><span class="pet-name">${esc(p.name)}</span>
      <span class="pet-bar"><i style="width:${pct}%"></i></span></span>
    <span class="pet-count num">${pr.need ? `${Math.min(pr.souls, pr.need)}<small>/${pr.need}</small>` : "MAX"}
      <small class="pet-lv">${pr.level ? `Lv${pr.level}` : "new"}${kills ? ` · ${kills} kill${kills > 1 ? "s" : ""}` : ""}</small></span>
  </div>`;
}
