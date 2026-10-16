// Fight model. Built from a stream of events that the decoder (or the demo) emits.
//
// Event contract (all timestamps `ts` in ms):
//   { t:"player",   id, name, cls, cp?, self?, badge? }       party member seen / updated
//   { t:"target",   ts, name, hp, maxHp }                       boss / main target HP
//   { t:"hit",      ts, src, skill, dmg, crit?, credit?:[{from, amount}] }
//                    damage dealt by party member `src`; `credit` = the part of `dmg`
//                    that someone else's buff added (credited to `from` in rDPS)
//   { t:"heal",     ts, src, dst, amount }                      effective healing (no overheal)
//   { t:"incoming", ts, dst, from, skill, dmg, hpAfter, maxHp } damage taken by party member
//   { t:"death",    ts, id }    { t:"revive", ts, id }
//   { t:"kill",     ts, id }    main target died     { t:"end", killed? }   fight over
//   { t:"net",      ping, jitter, loss, pps, health? }          connection quality
//   { t:"zone",     ts, id }    entered a new zone    { t:"zoneinfo", id }   the zone we're in (on connect)
// hp / maxHp / hpAfter may be null while the decoder can't read them yet.
//
// Value modes:
//   DPS  = everything you hit for
//   nDPS = DPS minus what other people's buffs added to your hits
//   rDPS = nDPS plus what your buffs added to other people's hits (party total unchanged)
//   HPS  = effective healing on other players
//   DTPS = damage taken


import { skillBase as skillKey } from "./icons.js";   // every level of a skill (11010340, 11010122...) is one row

export const MODES = ["DPS", "rDPS", "nDPS", "HPS", "DTPS"];
const RECAP_MS = 6000;

export class Fight {
  constructor(onEnd) {
    this.onEnd = onEnd;
    this.roster = new Map();      // persists across fights
    this.zone = null;             // zone visit id from the capture service: fights sharing it make up one dungeon run
    this.reset();
  }

  reset() {
    this.start = null;
    this.last = null;
    this.target = null;
    this.killedAt = null;
    this.ended = false;
    this.deaths = [];
    this.bossIds = new Set();            // targets the decoder flagged as bosses
    this.targetId = null;                // current main target
    this.stats = new Map();
    this.incoming = new Map();
  }

  /** End the current fight (saves it if anything happened) and start fresh. */
  finish(killed = false) {
    let snap = null;
    if (this.start != null && !this.ended) {
      this.ended = true;
      snap = this.snapshot(killed);
      this.onEnd?.(snap);
    }
    this.reset();
    if (snap) this.lastFinished = snap;   // stays on screen until the next fight starts
  }

  elapsed() {
    if (this.start == null) return 0;
    return Math.max(0, ((this.killedAt ?? this.last) - this.start) / 1000);
  }

  stat(id) {
    let s = this.stats.get(id);
    if (!s) {
      s = { dmg: 0, taken: 0, given: 0, heal: 0, hits: 0, crits: 0, inc: 0, incFrom: new Map(), healIn: 0, log: [], byTgt: new Map(),
            skills: new Map(), givenTo: new Map(), takenFrom: new Map(), healTo: new Map(),
            sec: { dmg: [], given: [], taken: [], heal: [], inc: [] }, dead: false };
      this.stats.set(id, s);
    }
    return s;
  }

  bucket(arr, ts, v) {
    const i = Math.floor((ts - this.start) / 1000);
    arr[i] = (arr[i] || 0) + v;
  }

  push(e) {
    switch (e.t) {
      case "zone":       // new zone: ids are reused, so drop who-is-who from the old one
        this.finish(this.killedAt != null);
        this.roster.clear();
        this.zone = e.id ?? e.ts;
        break;

      case "zoneinfo":
        this.zone = e.id ?? null;
        break;

      case "player":
        this.roster.set(e.id, { ...this.roster.get(e.id), ...e });
        break;

      case "target":
        // a new target, or the same boss back at HP after a kill, starts a new fight
        if (this.start != null && ((this.killedAt != null && e.hp > 0) || (this.target && this.target.name !== e.name && !e.sameFight))) {
          this.finish(this.killedAt != null);
        }
        if (e.id != null) { this.targetId = e.id; if (e.boss) this.bossIds.add(e.id); }
        this.target = { name: e.name, hp: e.hp ?? null, maxHp: e.maxHp ?? null,
                        boss: !!e.boss, template: e.template ?? null, named: !!e.named,
                        enrage: e.enrage ?? null };   // seconds; 0 = this boss version has none (sent with every update)
        if (typeof e.hp === "number" && e.hp <= 0 && this.start != null && this.killedAt == null) this.killedAt = e.ts;
        break;

      case "kill":     // main target died (live decoder sends this; HP may be unknown)
        if (this.start != null && this.killedAt == null) this.killedAt = e.ts;
        if (this.target && this.target.maxHp) this.target.hp = 0;
        break;

      case "end":      // decoder decided the fight is over (kill, or idle)
        this.finish(!!e.killed || this.killedAt != null);
        break;

      case "hit": {
        if (this.killedAt != null) break;
        if (this.start == null) { this.start = e.ts; this.lastFinished = null; }
        this.last = e.ts;
        const s = this.stat(e.src);
        s.dmg += e.dmg; s.hits++; if (e.crit) s.crits++;
        if (e.tgt != null) { s.byTgt.set(e.tgt, (s.byTgt.get(e.tgt) || 0) + e.dmg); if (e.boss) this.bossIds.add(e.tgt); }
        this.bucket(s.sec.dmg, e.ts, e.dmg);
        // everything a player's summons do is one "Summons" line (not a line per spirit / summoning skill)
        const sk = / \(summon\)$/.test(e.skill || "") ? "Summons" : skillKey(e.skill);
        const k = s.skills.get(sk) || { hits: 0, crits: 0, dmg: 0, max: 0 };
        k.hits++; k.dmg += e.dmg; if (e.crit) k.crits++; k.max = Math.max(k.max, e.dmg);
        s.skills.set(sk, k);
        s.log.push({ ts: e.ts, skill: e.skill, dmg: e.dmg, crit: !!e.crit });
        if (s.log.length > 3000) s.log.splice(0, 1000);
        for (const c of e.credit || []) {
          if (c.from === e.src) continue;
          s.taken += c.amount;
          this.bucket(s.sec.taken, e.ts, c.amount);
          s.takenFrom.set(c.from, (s.takenFrom.get(c.from) || 0) + c.amount);
          const g = this.stat(c.from);
          g.given += c.amount;
          this.bucket(g.sec.given, e.ts, c.amount);
          g.givenTo.set(e.src, (g.givenTo.get(e.src) || 0) + c.amount);
        }
        break;
      }

      case "heal": {
        if (this.start == null || this.killedAt != null || e.src === e.dst) break;
        this.last = Math.max(this.last, e.ts);
        const s = this.stat(e.src);
        s.heal += e.amount;
        this.bucket(s.sec.heal, e.ts, e.amount);
        s.healTo.set(e.dst, (s.healTo.get(e.dst) || 0) + e.amount);
        this.stat(e.dst).healIn += e.amount;
        break;
      }

      case "incoming": {
        if (this.start != null && this.killedAt == null) {
          const s = this.stat(e.dst);
          s.inc += e.dmg;
          this.bucket(s.sec.inc, e.ts, e.dmg);
          s.incFrom.set(e.skill + " · " + e.from, (s.incFrom.get(e.skill + " · " + e.from) || 0) + e.dmg);
        }
        const list = this.incoming.get(e.dst) || [];
        list.push(e);
        while (list.length && e.ts - list[0].ts > RECAP_MS) list.shift();
        this.incoming.set(e.dst, list);
        break;
      }

      case "death": {
        const hits = (this.incoming.get(e.id) || []).filter(h => e.ts - h.ts <= RECAP_MS);
        this.deaths.push({ id: e.id, ts: e.ts, at: this.start != null ? (e.ts - this.start) / 1000 : 0, hits });
        this.stat(e.id).dead = true;
        break;
      }

      case "revive":
        this.stat(e.id).dead = false;
        break;
    }
  }

  /** Plain, serialisable copy of the fight (used for the live view, details and history). */
  snapshot(killed = this.killedAt != null, withLog = true) {
    const duration = this.elapsed();
    const players = [...this.roster.values()].filter(p => this.stats.has(p.id)).map(p => {
      const s = this.stats.get(p.id);
      return {
        id: p.id, name: p.name, cls: p.cls, cp: p.cp, self: !!p.self, party: p.party, regular: !!p.regular, badge: p.badge, dead: s.dead,
        dmg: s.dmg, taken: s.taken, given: s.given, heal: s.heal, hits: s.hits, crits: s.crits, inc: s.inc,
        healIn: s.healIn, log: !withLog ? [] : s.log.map(h => ({ ...h, t: (h.ts - this.start) / 1000 })), byTgt: [...s.byTgt],
        incFrom: [...s.incFrom].sort((a, b) => b[1] - a[1]),
        skills: [...s.skills].map(([name, k]) => ({ name, ...k })).sort((a, b) => b.dmg - a.dmg),
        givenTo: [...s.givenTo], takenFrom: [...s.takenFrom], healTo: [...s.healTo],
        sec: { dmg: [...s.sec.dmg], given: [...s.sec.given], taken: [...s.sec.taken], heal: [...s.sec.heal], inc: [...s.sec.inc] },
      };
    });
    return {
      id: this.start, date: this.start, duration, killed, zone: this.zone,
      target: this.target ? { ...this.target } : null,
      players,
      deaths: this.deaths.map(d => ({ ...d, name: this.roster.get(d.id)?.name ?? `#${d.id}` })),
      bossIds: [...this.bossIds], targetId: this.targetId,
    };
  }
}

export function value(p, mode) {
  switch (mode) {
    case "DPS": return p.dmg;
    case "nDPS": return p.dmg - p.taken;
    case "rDPS": return p.dmg - p.taken + p.given;
    case "HPS": return p.heal;
    case "DTPS": return p.inc || 0;
  }
  return 0;
}

/** Per-second series → cumulative array for the given mode. */
export function cumulative(p, mode, len) {
  const out = []; let sum = 0;
  for (let i = 0; i < len; i++) {
    const d = p.sec.dmg[i] || 0, g = p.sec.given[i] || 0, t = p.sec.taken[i] || 0, h = p.sec.heal[i] || 0;
    sum += mode === "DPS" ? d : mode === "nDPS" ? d - t : mode === "rDPS" ? d - t + g
         : mode === "DTPS" ? (p.sec.inc?.[i] || 0) : h;
    out.push(sum);
  }
  return out;
}

/** Combine fights into one segment: players matched by name, totals and skills summed. */
export function mergeSnapshots(snaps) {
  const players = new Map();
  let duration = 0, offset = 0;
  const deaths = [];
  for (const f of snaps) {
    for (const p of f.players) {
      const key = p.name;
      let q = players.get(key);
      if (!q) {
        q = { ...p, skills: [], givenTo: [], takenFrom: [], healTo: [], incFrom: [],
              dmg: 0, taken: 0, given: 0, heal: 0, hits: 0, crits: 0, inc: 0,
              sec: { dmg: [], given: [], taken: [], heal: [], inc: [] }, _skills: new Map() };
        players.set(key, q);
      }
      for (const k of ["dmg", "taken", "given", "heal", "hits", "crits", "inc"]) q[k] += p[k] || 0;
      q.self = q.self || p.self; q.cls = p.cls !== "unknown" ? p.cls : q.cls; q.party = p.party ?? q.party; q.regular = q.regular || p.regular;
      for (const sk of p.skills) {
        const o = q._skills.get(sk.name) || { name: sk.name, hits: 0, crits: 0, dmg: 0, max: 0 };
        o.hits += sk.hits; o.crits += sk.crits; o.dmg += sk.dmg; o.max = Math.max(o.max, sk.max);
        q._skills.set(sk.name, o);
      }
      for (const k of ["dmg", "given", "taken", "heal", "inc"]) {
        (p.sec?.[k] || []).forEach((v, i) => { q.sec[k][offset + i] = (q.sec[k][offset + i] || 0) + (v || 0); });
      }
    }
    for (const d of f.deaths) deaths.push({ ...d, at: d.at + duration });
    duration += f.duration;
    offset += Math.ceil(f.duration);
  }
  for (const q of players.values()) { q.skills = [...q._skills.values()].sort((a, b) => b.dmg - a.dmg); delete q._skills; }
  return { id: "overall", date: snaps[snaps.length - 1]?.date, duration, killed: false, overall: true,
           target: { name: `Overall · ${snaps.length} fight${snaps.length === 1 ? "" : "s"}`, hp: null, maxHp: null },
           players: [...players.values()], deaths };
}

/** A player's skill rows with all summon damage as one "Summons" row (fights saved before 0.6.7 have a row per summon skill). */
export function skillRows(p) {
  const out = [], merged = { name: "Summons", hits: 0, crits: 0, dmg: 0, max: 0 };
  for (const s of p.skills || []) {
    if (s.name === "Summons" || / \(summon\)$/.test(s.name)) {
      merged.hits += s.hits; merged.crits += s.crits; merged.dmg += s.dmg; merged.max = Math.max(merged.max, s.max);
    } else out.push(s);
  }
  if (merged.hits) out.push(merged);
  return out.sort((a, b) => b.dmg - a.dmg);
}

/** Damage a player did to the targets the filter allows ("all", "boss", "current"). */
export function filteredDamage(p, snap, filter) {
  if (filter === "all" || !p.byTgt?.length) return p.dmg;
  if (filter === "current") return p.byTgt.filter(([t]) => t === snap.targetId).reduce((s, [, v]) => s + v, 0);
  const bosses = new Set(snap.bossIds || []);
  return p.byTgt.filter(([t]) => bosses.has(t)).reduce((s, [, v]) => s + v, 0);
}
