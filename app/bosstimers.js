// The Boss timers screen of the side window: field bosses per map (live from the game's boss list), events,
// your reminders, and the Discord dashboard setup. details.js owns the window; this builds the screen's HTML
// and handles its clicks.
import { EVENTS, eventState } from "./timers.js";
import { EVENT_ICONS } from "./icons.js";
import { LEADS, leadLabel, reminders, reminderOpts, setReminderOpts, toggleLead, clearLeads, bossKey, eventKey, reminderText } from "./reminders.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clock = t => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const HOURGLASS = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12M6 22h12M7 2c0 5 10 7 10 10S7 17 7 22M17 2c0 5-10 7-10 10s10 5 10 10"/></svg>`;
const BELL = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7v4l-2 3v1h18v-1l-2-3V9a7 7 0 0 0-7-7zm0 21a3 3 0 0 0 3-3H9a3 3 0 0 0 3 3z"/></svg>`;
const NOPIC = `<span class="bt-pic bt-nopic"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6z"/></svg></span>`;

export const state = { lists: [], webhook: null, hookMsg: "", open: null };

/** "12m 04s" / "1h 05m" until a time; "" once it's passed */
export function countdown(at, now = Date.now()) {
  const s = Math.round((at - now) / 1000);
  if (s <= 0) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor(s % 3600 / 60)).padStart(2, "0")}m`;
}
export const tickCountdowns = root => root.querySelectorAll("[data-at]").forEach(el => { el.textContent = countdown(+el.dataset.at); });

export function tabs() {
  return [...state.lists.map(l => [`map:${l.list}`, esc(l.label || `Map ${l.list}`)]), ["events", "Events"], ["alerts", "Alerts &amp; Discord"]];
}

export function cardsFor(now = Date.now()) {
  const all = state.lists.flatMap(l => l.spawns);
  const timed = all.filter(s => !s.alive && s.next > now).sort((a, b) => a.next - b.next);
  return [["Up now", all.filter(s => s.alive).length], ["Next hour", timed.filter(s => s.next - now <= 3600e3).length],
          ["On timers", timed.length], ["Next", timed[0] ? `<small>${esc(timed[0].name)}</small>` : "–"]];
}

/** What a screen depends on (it's only rebuilt when this changes; countdowns tick in place) */
export function screenKey(tab, now = Date.now()) {
  const l = state.lists.find(x => `map:${x.list}` === tab);
  const sp = l ? l.spawns.map(s => [s.id, s.alive, s.next, s.hp, s.name, s.next && s.next <= now]) : [];
  const ev = tab === "events" ? EVENTS.map(e => eventState(e, now).state + Math.floor(eventState(e, now).opensAt / 60e3)) : [];
  return JSON.stringify([tab, sp, ev, reminders(), state.open, tab === "alerts" ? [state.webhook, state.hookMsg, reminderOpts()] : 0]);
}

function bell(key) {
  const leads = reminders()[key] || [];
  const label = leads.length ? leads.map(m => m ? `${m}m` : "spawn").join(" · ") : "";
  return `<button class="bt-bell ${leads.length ? "on" : ""}" data-bell="${esc(key)}" title="Remind me (pick how long before)">${BELL}${label ? `<span>${label}</span>` : ""}</button>`;
}
function editor(key, what) {
  if (state.open !== key) return "";
  const leads = new Set(reminders()[key] || []);
  return `<div class="bt-edit"><span class="muted">Pop up over the game</span>
    ${LEADS.map(m => `<button class="bt-chip ${leads.has(m) ? "on" : ""}" data-lead="${m}" data-key="${esc(key)}">${m === 0 ? (what === "event" ? "When it opens" : "On spawn") : leadLabel(m) + " before"}</button>`).join("")}
    ${leads.size ? `<button class="bt-chip clear" data-clear="${esc(key)}">Off</button>` : ""}</div>`;
}

function spawnRow(s, now) {
  const key = bossKey(s.name);
  const pic = s.portrait ? `<img class="bt-pic" src="img/spawns/${esc(s.portrait)}" alt="" loading="lazy">` : NOPIC;
  let st;
  if (s.alive) {
    const hp = s.hp != null && s.hp < 0.995 ? `<span class="bt-hp"><i style="width:${Math.round(s.hp * 100)}%"></i></span><small>HP ${Math.round(s.hp * 100)}%</small>` : "<small>full HP</small>";
    st = `<span class="bt-state up"><b>Up</b>${hp}</span>`;
  } else if (s.next && s.next > now) {
    st = `<span class="bt-state ${s.next - now <= 3600e3 ? "soon" : ""}"><b class="num" data-at="${s.next}">${countdown(s.next, now)}</b><small>at ${clock(s.next)}</small></span>`;
  } else {
    st = `<span class="bt-state due" title="Its timer has run out, but the game hasn't shown it up yet: open your map to refresh"><b>Due</b><small>${s.next ? `since ${clock(s.next)}` : ""}</small></span>`;
  }
  return `<div class="bt-row">${pic}
    <span class="bt-main"><span class="bt-name">${esc(s.name)}${s.level ? ` <small>Lv${s.level}</small>` : ""}</span><span class="bt-sub">${esc(s.region || "")}</span></span>
    ${st}${bell(key)}<button class="mini-btn bt-ren" data-rename="${s.id}" data-name="${esc(s.name)}" title="Rename this spawn">✎</button></div>${editor(key, "boss")}`;
}

export function screenHtml(tab, now = Date.now()) {
  if (tab === "events") return eventsHtml(now);
  if (tab === "alerts") return alertsHtml();
  const l = state.lists.find(x => `map:${x.list}` === tab);
  if (!l) return `<div class="dempty">No boss timers yet. Open your world map in game: Nova Meter reads the boss list the game sends
    and shows every field boss here, with exact respawn times.</div>`;
  const timed = l.spawns.filter(s => !s.alive && s.next > now).sort((a, b) => a.next - b.next);
  const due = l.spawns.filter(s => !s.alive && !(s.next > now));
  const up = l.spawns.filter(s => s.alive).sort((a, b) => (b.upAt || 0) - (a.upAt || 0));
  const seen = Math.max(...l.spawns.map(s => s.seen || 0));
  const sec = (title, list) => list.length ? `<div class="h-day">${title} · ${list.length}</div>${list.map(s => spawnRow(s, now)).join("")}` : "";
  return sec("Respawning", timed) + sec("Due: not seen up yet", due) + sec("Up now", up) +
    `<p class="muted run-note">Updated ${clock(seen)} from the game's boss list (open the map in game to refresh).
     Names and portraits from <a class="link" data-href="https://aion2hub.com/maps">aion2hub.com</a>. Set the same reminder for a boss on any map.</p>`;
}

function eventsHtml(now) {
  return `<div class="h-day">Events</div>` + EVENTS.map(ev => {
    const st = eventState(ev, now), key = eventKey(ev.key);
    const status = st.state === "open" ? `<span class="bt-state up"><b>Open</b><small>${st.closesAt ? `closes ${clock(st.closesAt)}` : ""}</small></span>`
      : `<span class="bt-state ${st.state === "soon" ? "soon" : ""}"><b class="num" data-at="${st.opensAt}">${countdown(st.opensAt, now)}</b><small>at ${clock(st.opensAt)}</small></span>`;
    return `<div class="bt-row"><span class="bt-pic bt-ev" style="--ev:${ev.color}"><svg viewBox="0 0 24 24" fill="currentColor">${EVENT_ICONS[ev.key] || ""}</svg></span>
      <span class="bt-main"><span class="bt-name">${esc(ev.name)}</span><span class="bt-sub">${ev.everyH ? `Every ${ev.everyH === 1 ? "hour" : ev.everyH + " hours"}` : "Scheduled"}</span></span>
      ${status}${bell(key)}<span></span></div>${editor(key, "event")}`;
  }).join("") + `<p class="muted run-note">Event times follow the game's schedule (check them after big patches).</p>`;
}

function alertsHtml() {
  const o = reminderOpts(), rs = reminders();
  const names = Object.keys(rs);
  const w = state.webhook;
  return `<div class="h-day">In-game pop-ups</div><div class="form bt-form">
      <label>Pop-up</label><label class="check"><input type="checkbox" data-opt="popup" ${o.popup ? "checked" : ""}> Show reminders over the game (top of the screen)</label>
      <label>Sound</label><label class="check"><input type="checkbox" data-opt="sound" ${o.sound ? "checked" : ""}> Play a chime</label>
      <label></label><div><button class="mini-btn" data-act="test-remind">Test pop-up</button></div>
    </div>
    <div class="h-day">Your reminders · ${names.length}</div>
    ${names.length ? names.map(k => `<div class="bt-row bt-mini"><span class="bt-main"><span class="bt-name">${esc(k.replace(/^(boss|event):/, "").replace(/^(\w+)$/, m => EVENTS.find(e => e.key === m)?.name || m))}</span>
        <span class="bt-sub">${rs[k].map(m => m ? leadLabel(m) + " before" : "on spawn").join(", ")}</span></span>
        <button class="mini-btn" data-clear="${esc(k)}" title="Remove">✕</button></div>`).join("")
      : `<p class="muted">None yet. Click the bell next to any boss or event and pick when you want the pop-up.</p>`}
    <div class="h-day">Discord dashboard</div>
    <p class="muted">Paste a channel webhook (Discord: channel settings → Integrations → Webhooks → Copy URL). Nova Meter keeps one
      message per map up to date there: who's up, what's next with portraits, the full schedule. Pin it. The link stays on this PC.</p>
    <div class="form bt-form">
      <label>Status</label><div>${w ? `<b class="ok">Connected</b> <span class="muted">(${esc(w.host)}${w.discord ? ", live dashboard" : ", JSON feed"})</span>` : `<span class="muted">Not set</span>`}</div>
      <label>Webhook URL</label><div class="bt-hook"><input type="password" id="hookurl" placeholder="https://discord.com/api/webhooks/…" autocomplete="off" spellcheck="false">
        <button class="mini-btn" data-act="hook-save">Save</button></div>
      <label></label><div>${w ? `<button class="mini-btn" data-act="hook-test">Send test + dashboard</button> <button class="mini-btn" data-act="hook-off">Disconnect</button>` : ""}
        ${state.hookMsg ? `<span class="bt-msg">${esc(state.hookMsg)}</span>` : ""}</div>
    </div>
    <p class="muted run-note">Channel-wide reminders with commands (/remind Gartua 15) come with the Nova bot.</p>`;
}

/** Clicks inside the screen. → true when handled. send: websocket send; rerender: redraw now. */
export function onClick(e, { send, rerender, askText, nova }) {
  const t = e.target;
  const b = t.closest("[data-bell]");
  if (b) { state.open = state.open === b.dataset.bell ? null : b.dataset.bell; rerender(); return true; }
  const lead = t.closest("[data-lead]");
  if (lead) { toggleLead(lead.dataset.key, +lead.dataset.lead); rerender(); return true; }
  const clr = t.closest("[data-clear]");
  if (clr) { clearLeads(clr.dataset.clear); rerender(); return true; }
  const ren = t.closest("[data-rename]");
  if (ren) {
    askText("Name this boss spawn (empty = the database name)", ren.dataset.name).then(name => {
      if (name !== null) send({ type: "name_spawn", id: +ren.dataset.rename, name: name.trim() });
    });
    return true;
  }
  const act = t.closest("[data-act]")?.dataset.act;
  if (act === "hook-save") {
    const url = document.getElementById("hookurl").value.trim();
    if (!/^https:\/\/(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(url) && !/^https?:\/\//.test(url)) {
      state.hookMsg = "That doesn't look like a webhook URL."; rerender(); return true;
    }
    send({ type: "settings", spawn_webhook: url }); state.hookMsg = "Saved."; rerender(); return true;
  }
  if (act === "hook-test") { send({ type: "spawn_webhook_test" }); state.hookMsg = "Sending…"; rerender(); return true; }
  if (act === "hook-off") { send({ type: "settings", spawn_webhook: "" }); state.hookMsg = "Disconnected."; rerender(); return true; }
  if (act === "test-remind") {
    const all = state.lists.flatMap(l => l.spawns.map(s => ({ ...s, map: l.label })));
    const s = all.find(x => x.portrait) || { name: "Immortal Gartua", region: "Immortal Isle", map: "Altgard" };
    const info = { text: reminderText({ name: s.name, lead: 15, kind: "boss" }), sub: [s.map, s.region].filter(Boolean).join(" · "),
                   at: Date.now() + 15 * 60e3, portrait: s.portrait, sound: reminderOpts().sound, seconds: 9 };
    if (nova?.remind) nova.remind(info); else window.open("reminder.html", "_blank");
    return true;
  }
  return false;
}

export function onChange(e, rerender) {
  const opt = e.target.closest("[data-opt]");
  if (!opt) return false;
  setReminderOpts({ [opt.dataset.opt]: opt.checked });
  rerender();
  return true;
}
