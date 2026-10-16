// Simulated boss fight that emits the same events the real decoder will.
// Only used until live data is available (or with ?demo in the URL).

const PARTY = [
  { id: 101, name: "LastOlie",  cls: "gladiator", cp: 648200, self: true, rate: 3900,
    skills: ["Ferocious Strike", "Cleave", "Seismic Wave", "Whirlwind"] },
  { id: 102, name: "Kaelith",   cls: "assassin",  cp: 722000, rate: 4300,
    skills: ["Shadow Strike", "Ambush", "Rune Carve", "Venom Edge"] },
  { id: 103, name: "Morwenna",  cls: "sorcerer",  cp: 729700, rate: 4200,
    skills: ["Flame Bolt", "Ice Chain", "Inferno", "Blaze"] },
  { id: 104, name: "Brannoc",   cls: "chanter",   cp: 635100, rate: 2700, buff: { name: "Blessing of Wind", pct: .09 },
    skills: ["Meteor Strike", "Pentacle Shock", "Hallowed Strike"] },
  { id: 105, name: "Sylvara",   cls: "cleric",    cp: 601300, rate: 1500, buff: { name: "Blessing", pct: .03 }, healer: true,
    skills: ["Smite", "Chastisement", "Holy Light"] },
];
const BOSS = { name: "Ancient Guardian", maxHp: 9.2e6, skills: ["Crushing Blow", "Stone Rain", "Guardian's Wrath", "Tremor"] };
const MAX_HP = 32000;
const SCALE = 3;          // tunes the demo to ~100K DPS rows and a ~90 s kill

export function startDemo(emit) {
  let now, hp, php, dead, deadUntil, killAt, lagUntil, nextLag, scriptedDeath;
  const TICK = 250;

  for (const p of PARTY) emit({ t: "player", id: p.id, name: p.name, cls: p.cls, cp: p.cp, self: p.self });

  function newFight() {
    now = Date.now();
    hp = BOSS.maxHp;
    php = new Map(PARTY.map(p => [p.id, MAX_HP]));
    dead = new Set(); deadUntil = new Map();
    killAt = null;
    scriptedDeath = now + 32000 + Math.random() * 15000;
    nextLag ??= now + 25000;
    emit({ t: "target", ts: now, name: BOSS.name, hp, maxHp: BOSS.maxHp, boss: true, enrage: 150 });
  }

  function hitBoss(p) {
    const big = Math.random() < .07;
    const crit = Math.random() < .28;
    const base = SCALE * p.rate * (TICK / 1000) * (big ? 7 + Math.random() * 6 : .4 + Math.random() * 1.2) * (crit ? 1.6 : 1);
    const dmg = Math.round(base);
    const credit = [];
    for (const b of PARTY) {
      if (b.buff && b.id !== p.id && !dead.has(b.id)) credit.push({ from: b.id, amount: Math.round(dmg * b.buff.pct) });
    }
    const skill = big ? p.skills[Math.floor(Math.random() * (p.skills.length - 1))] : p.skills[p.skills.length - 1 - (Math.random() < .5 ? 0 : 1)];
    emit({ t: "hit", ts: now, src: p.id, skill, dmg, crit, credit });
    return dmg;
  }

  function bossAttacks() {
    const alive = PARTY.filter(p => !dead.has(p.id));
    if (!alive.length) return;
    const forced = now >= scriptedDeath && !dead.size;
    if (!forced && Math.random() > .14) return;
    const dst = forced ? PARTY[4] : alive[Math.floor(Math.random() * alive.length)];
    const hits = forced ? 4 : 1;
    for (let i = 0; i < hits; i++) {
      const dmg = Math.round(forced ? 9000 + Math.random() * 3000 : 2000 + Math.random() * 4500);
      const after = Math.max(0, php.get(dst.id) - dmg);
      php.set(dst.id, after);
      const ts = now - (hits - 1 - i) * 900;
      emit({ t: "incoming", ts, dst: dst.id, from: BOSS.name, skill: BOSS.skills[Math.floor(Math.random() * BOSS.skills.length)], dmg, hpAfter: after, maxHp: MAX_HP });
      if (after === 0) {
        dead.add(dst.id); deadUntil.set(dst.id, now + 9000);
        emit({ t: "death", ts: now, id: dst.id });
        if (forced) scriptedDeath = Infinity;
        break;
      }
    }
  }

  function heals() {
    const healer = PARTY.find(p => p.healer);
    if (dead.has(healer.id) || Math.random() > .35) return;
    const hurt = PARTY.filter(p => p.id !== healer.id && !dead.has(p.id) && php.get(p.id) < MAX_HP)
      .sort((a, b) => php.get(a.id) - php.get(b.id))[0];
    if (!hurt) return;
    const amount = Math.min(MAX_HP - php.get(hurt.id), Math.round(2500 + Math.random() * 4000));
    php.set(hurt.id, php.get(hurt.id) + amount);
    emit({ t: "heal", ts: now, src: healer.id, dst: hurt.id, amount });
  }

  function step() {
    now += TICK;
    if (killAt) {
      if (now - killAt > 5000) newFight();
      return;
    }
    let dealt = 0;
    for (const p of PARTY) if (!dead.has(p.id)) dealt += hitBoss(p);
    bossAttacks();
    heals();
    for (const [id, t] of deadUntil) if (now >= t) {
      deadUntil.delete(id); dead.delete(id); php.set(id, MAX_HP * .6);
      emit({ t: "revive", ts: now, id });
    }
    hp = Math.max(0, hp - dealt);
    emit({ t: "target", ts: now, name: BOSS.name, hp, maxHp: BOSS.maxHp, boss: true, enrage: 150 });
    if (hp === 0) killAt = now;

    if (now >= nextLag) { lagUntil = now + 14000; nextLag = now + 70000; }
    const lag = lagUntil && now < lagUntil;
    emit({ t: "net", ping: Math.round(lag ? 210 + Math.random() * 90 : 70 + Math.random() * 18),
           jitter: Math.round(lag ? 45 + Math.random() * 30 : 3 + Math.random() * 4),
           loss: lag ? 2.5 : 0, pps: 180 + Math.floor(Math.random() * 60) });
  }

  newFight();
  const timer = setInterval(step, TICK);
  return { stop: () => clearInterval(timer), restart: newFight };
}

/** Synthetic "best pull" so the vs-best note has something to compare against on first run. */
export function demoBest() {
  const rate = PARTY[0].rate * SCALE * 1.9 * 0.97;
  return { dps: rate, cum: Array.from({ length: 400 }, (_, i) => rate * i) };
}
