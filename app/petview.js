// The Pet farming screen of the side window: your target farm (what the meter shows over the game) and your whole
// collection as the game reports it, with search. details.js owns the window; this builds the screen.
import * as PF from "./petfarm.js";

const esc = PF.esc;
export const PAW = `<svg class="icon" viewBox="0 0 24 24" fill="var(--accent)"><circle cx="5.5" cy="9.5" r="2.3"/><circle cx="9.5" cy="5.5" r="2.3"/><circle cx="14.5" cy="5.5" r="2.3"/><circle cx="18.5" cy="9.5" r="2.3"/><path d="M12 11c-3.2 0-6.5 4.6-6.5 7.2 0 1.8 1.6 2.6 3.2 2.3 1.3-.3 2.2-.9 3.3-.9s2 .6 3.3.9c1.6.3 3.2-.5 3.2-2.3C18.5 15.6 15.2 11 12 11z"/></svg>`;
const GENERA = ["All", "Feral", "Nature", "Intelligent", "Transformation"];
const ui = { genus: "All", search: "" };

export const tabs = () => [["farm", "Target farm"], ["all", "Collection"]];
const clock = t => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function cardsFor() {
  const all = PF.farmable(), ids = PF.targets();
  const owned = all.filter(p => PF.progress(p.id).level > 0);
  return [["Target farm", ids.length], ["Unlocked", `${owned.length}<small>/${all.length}</small>`],
          ["Max level", all.filter(p => PF.progress(p.id).done).length],
          ["Closest", (() => {
            const c = owned.filter(p => !PF.progress(p.id).done).sort((a, b) => left(a.id) - left(b.id))[0];
            return c ? `<small>${esc(c.name)} · ${left(c.id)} to go</small>` : "–";
          })()]];
}
const left = id => { const pr = PF.progress(id); return pr.need == null ? 1e9 : Math.max(0, pr.need - pr.souls); };

export function screenKey(tab) {
  return JSON.stringify([tab, PF.state.at, PF.state.souls, PF.state.owned, PF.targets(), PF.opts(), tab === "farm" ? PF.targets().map(PF.killsSinceSoul) : 0]);
}

export function screenHtml(tab) {
  if (!PF.state.pets.size) return `<div class="dempty">Loading the pet list…</div>`;
  const synced = PF.state.at ? `Synced from the game at ${clock(PF.state.at)} (it sends your collection when you log in or change zone).`
    : "Waiting for the game: log in or change zone and your pets' levels and souls appear here.";
  return tab === "all" ? collectionHtml(synced) : farmHtml(synced);
}

function farmHtml(synced) {
  const ids = PF.targets(), o = PF.opts();
  const rows = ids.length ? ids.map(id => `<div class="pf-item">${PF.petRow(id, { big: true })}
      <button class="mini-btn" data-untarget="${id}" title="Take it off the target farm">✕</button></div>`).join("")
    : `<p class="muted">Nothing on your target farm yet. Pick pets in <b>Collection</b> (★), or keep <b>Target farm mode</b> on:
       a pet is added by itself the moment one of its souls drops.</p>`;
  return `<div class="h-day">On the meter · ${ids.length}</div>${rows}
    <p class="muted run-note">${esc(synced)} Souls count up live as they drop; the kills shown are your kills of that pet's
      monsters since its last soul (learned from the drops).</p>
    <div class="h-day">Settings</div><div class="form bt-form">
      <label>Target farm mode</label><label class="check"><input type="checkbox" data-popt="auto" ${o.auto ? "checked" : ""}> Add a pet on its own when one of its souls drops (or you kill its monsters)</label>
      <label>On the meter</label><label class="check"><input type="checkbox" data-popt="overlay" ${o.overlay ? "checked" : ""}> Show the target farm under the damage rows</label>
      <label>When finished</label><label class="check"><input type="checkbox" data-popt="autoRemove" ${o.autoRemove ? "checked" : ""}> Take a pet off once it reaches its max level</label>
      <label>Sound</label><label class="check"><input type="checkbox" data-popt="sound" ${o.sound ? "checked" : ""}> Fanfare when a pet reaches its next level</label>
      <label></label><div><button class="mini-btn" data-act="pet-test">Preview the level-up</button></div>
    </div>`;
}

function collectionHtml(synced) {
  const order = p => {
    const pr = PF.progress(p.id);
    return pr.done ? 3 : pr.level > 0 ? 0 : pr.souls > 0 ? 1 : 2;     // in progress, souls waiting, not unlocked, maxed
  };
  const list = PF.farmable().sort((a, b) => order(a) - order(b) || left(a.id) - left(b.id) || a.name.localeCompare(b.name));
  const chips = GENERA.map(g => `<button class="bt-chip ${ui.genus === g ? "on" : ""}" data-genus="${g}">${g}</button>`).join("");
  return `<div class="pf-tools"><input id="petsearch" class="pf-search" placeholder="Search pets…" value="${esc(ui.search)}" autocomplete="off" spellcheck="false">${chips}</div>
    <div id="petlist">${list.map(p => `<div class="pf-item" data-name="${esc(p.name.toLowerCase())}" data-genus="${esc(p.genus)}">
      ${PF.petRow(p.id, { big: true })}
      <button class="bt-bell ${PF.isTarget(p.id) ? "on" : ""}" data-target="${p.id}" title="${PF.isTarget(p.id) ? "On your target farm" : "Add to your target farm"}">★</button>
      </div>`).join("")}</div>
    <p class="muted run-note">${esc(synced)} Pet list and portraits from <a class="link" data-href="https://gamers4.life/aion-2/database/en/pets/">gamers4.life</a>.
      Shop and special pets can't be farmed, so they aren't listed.</p>`;
}

/** Keep the search and genus filter applied without redrawing (so typing keeps its place). */
export function applyFilter(root) {
  const q = ui.search.trim().toLowerCase();
  root.querySelectorAll("#petlist .pf-item").forEach(el => {
    el.hidden = (q && !el.dataset.name.includes(q)) || (ui.genus !== "All" && el.dataset.genus !== ui.genus);
  });
}

export function onClick(e, { rerender, nova }) {
  const t = e.target;
  const tg = t.closest("[data-target]");
  if (tg) { PF.setTarget(tg.dataset.target, !PF.isTarget(tg.dataset.target)); rerender(); return true; }
  const un = t.closest("[data-untarget]");
  if (un) { PF.setTarget(un.dataset.untarget, false); rerender(); return true; }
  const g = t.closest("[data-genus]");
  if (g) { ui.genus = g.dataset.genus; document.querySelectorAll("[data-genus]").forEach(b => b.classList.toggle("on", b === g)); applyFilter(document); return true; }
  if (t.closest("[data-act=pet-test]")) {
    const p = PF.state.pets.get(PF.targets()[0]) || PF.farmable()[0];
    const info = { kind: "pet", name: p?.name || "Agrint", level: 2, pic: p?.pic, max: false, sound: PF.opts().sound };
    if (nova?.celebrate) nova.celebrate(info); else window.open("achievement.html", "_blank");
    return true;
  }
  return false;
}

export function onInput(e) {
  if (e.target.id !== "petsearch") return false;
  ui.search = e.target.value;
  applyFilter(document);
  return true;
}

export function onChange(e, rerender) {
  const o = e.target.closest("[data-popt]");
  if (!o) return false;
  PF.setOpts({ [o.dataset.popt]: o.checked });
  rerender();
  return true;
}
