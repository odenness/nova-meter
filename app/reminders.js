// Your own reminders for field bosses and events: pick any boss or event and how long before it you want a pop-up
// (several at once: e.g. 15 and 5 minutes before, and when it spawns). Saved on this PC, shared by the meter and
// the timers window. The meter checks them every second and shows the pop-up over the game.
import { EVENTS, eventState } from "./timers.js";

export const LEADS = [0, 1, 2, 5, 10, 15, 30, 60];          // minutes before; 0 = when it spawns / opens
export const leadLabel = m => m === 0 ? "On spawn" : m < 60 ? `${m} min` : `${m / 60} h`;
const KEY = "nova.reminders";
const OPTS = "nova.reminderOpts";

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
export const reminders = () => read(KEY, {});                // "boss:<name>" | "event:<key>" -> [minutes...]
export const reminderOpts = () => ({ popup: true, sound: true, ...read(OPTS, {}) });
export const setReminderOpts = o => localStorage.setItem(OPTS, JSON.stringify({ ...reminderOpts(), ...o }));
export const bossKey = name => `boss:${name}`;
export const eventKey = key => `event:${key}`;

export function toggleLead(key, minutes) {
  const all = reminders();
  const set = new Set(all[key] || []);
  set.has(minutes) ? set.delete(minutes) : set.add(minutes);
  if (set.size) all[key] = [...set].sort((a, b) => b - a); else delete all[key];
  localStorage.setItem(KEY, JSON.stringify(all));
  return all[key] || [];
}
export function clearLeads(key) {
  const all = reminders();
  delete all[key];
  localStorage.setItem(KEY, JSON.stringify(all));
}

/** Everything that has a time to remind about: bosses on a respawn timer, and the next opening of each event. */
export function upcoming(spawnLists, now = Date.now()) {
  const out = [];
  for (const l of spawnLists || []) {
    for (const s of l.spawns) {
      if (s.alive || !s.next) continue;
      out.push({ key: bossKey(s.name), kind: "boss", name: s.name, at: s.next, portrait: s.portrait,
                 sub: [l.label, s.region].filter(Boolean).join(" · ") });
    }
  }
  for (const ev of EVENTS) {
    const st = eventState(ev, now);
    if (st.opensAt) out.push({ key: eventKey(ev.key), kind: "event", name: ev.name, at: st.opensAt, event: ev.key, color: ev.color });
  }
  return out;
}

const fired = new Set();          // "key|time|lead": each reminder pops once
/** Reminders whose moment has come in the last minute (not ones missed while the meter was closed). */
export function dueReminders(spawnLists, now = Date.now()) {
  const rs = reminders(), out = [];
  for (const it of upcoming(spawnLists, now)) {
    for (const lead of rs[it.key] || []) {
      const at = it.at - lead * 60_000;
      const id = `${it.key}|${it.at}|${lead}`;
      if (now >= at && now - at < 60_000 && !fired.has(id)) { fired.add(id); out.push({ ...it, lead }); }
    }
  }
  return out;
}

/** "Immortal Gartua in 15 min" / "Spacetime Rift is opening" */
export function reminderText(r) {
  if (r.lead === 0) return r.kind === "boss" ? `${r.name} is spawning now` : `${r.name} is opening now`;
  return `${r.name} in ${leadLabel(r.lead)}`;
}
