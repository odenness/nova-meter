// In-game event timers shown in the header.
// Schedules (UTC unless a time zone is given). Check these against the game after patches.
const tzLocal = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
const serverTz = /^Europe\//.test(tzLocal) ? "Europe/Berlin"
  : /Los_Angeles|Vancouver|Tijuana|Phoenix|Denver|Edmonton|Boise/.test(tzLocal) ? "America/Los_Angeles"
  : "America/New_York";

export const EVENTS = [
  { key: "rift",  name: "Spacetime Rift",           color: "#b794f6", everyH: 3,  offMin: 0,   openMin: 10, soonMin: 2 },
  { key: "shugo", name: "Shugo Festival",           color: "#7dd3fc", everyH: 1,  offMin: 0,   openMin: 3,  soonMin: 2 },
  { key: "raid",  name: "Beritra Air Raid",         color: "#facc15", everyH: 1,  offMin: 30,  openMin: 3,  soonMin: 2 },
  { key: "arena", name: "Arena of Tactics (10v10)", color: "#f87171", windows: [[660, 840], [1140, 1260]], tz: serverTz, soonMin: 2 },
  { key: "reset", name: "Daily reset",              color: "#86efac", everyH: 24, offMin: 420, openMin: 0,  soonMin: 60 },
];

const MIN = 60e3;

function minutesInTz(now, tz) {
  const [h, m, s] = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .format(now).split(":").map(Number);
  return h * 60 + m + s / 60;
}

/** → { state: "open"|"soon"|"later", opensAt, closesAt? } */
export function eventState(ev, now = Date.now()) {
  if (ev.windows) {
    const m = minutesInTz(now, ev.tz);
    const cur = ev.windows.find(([a, b]) => m >= a && m < b);
    if (cur) return { state: "open", closesAt: now + (cur[1] - m) * MIN };
    const wait = Math.min(...ev.windows.map(([a]) => ((a - m) % 1440 + 1440) % 1440));
    const opensAt = now + wait * MIN;
    return { state: wait <= ev.soonMin ? "soon" : "later", opensAt };
  }
  const period = ev.everyH * 60 * MIN;
  const phase = (((now - ev.offMin * MIN) % period) + period) % period;
  if (phase < ev.openMin * MIN) return { state: "open", closesAt: now - phase + ev.openMin * MIN };
  const opensAt = now - phase + period;
  return { state: opensAt - now <= ev.soonMin * MIN ? "soon" : "later", opensAt };
}

export function fmtWait(ms) {
  const m = Math.ceil(ms / MIN);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function describe(ev, st, now = Date.now()) {
  const clock = t => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (ev.key === "reset") return `${ev.name} at ${clock(st.opensAt)} (in ${fmtWait(st.opensAt - now)})`;
  if (st.state === "open") return `${ev.name}: open now, closes in ${fmtWait(st.closesAt - now)}`;
  return `${ev.name}: opens at ${clock(st.opensAt)} (in ${fmtWait(st.opensAt - now)})`;
}

let audio;
export function chime() {
  try {
    audio ||= new AudioContext();
    const t = audio.currentTime;
    for (const [i, f] of [880, 1320].entries()) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * .14);
      g.gain.linearRampToValueAtTime(.08, t + i * .14 + .02);
      g.gain.exponentialRampToValueAtTime(.0001, t + i * .14 + .6);
      o.connect(g).connect(audio.destination);
      o.start(t + i * .14); o.stop(t + i * .14 + .65);
    }
  } catch { /* audio unavailable */ }
}
