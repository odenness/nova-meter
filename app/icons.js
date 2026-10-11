// Class emblems and event icons (hand-drawn, 24x24, currentColor).
// To use the official in-game class icons instead, drop PNGs into
// meter/ui/img/classes/<class>.png (e.g. gladiator.png) and list them in img/classes/icons.json.

export const CLASSES = {
  gladiator: {
    label: "Gladiator", meter: "#e07a4f", soft: "#b98a68",
    // greatsword
    svg: `<path d="M12 1.5l1.6 2.3V14h-3.2V3.8z"/><path d="M6 14h12v2.2H6z"/><path d="M11 16.2h2v4.3h-2z"/><circle cx="12" cy="21.4" r="1.4"/><path d="M4 12.5l2-1v2.5zM20 12.5l-2-1v2.5z"/>`,
  },
  templar: {
    label: "Templar", meter: "#7fa8f5", soft: "#7d93b8",
    // shield with cross
    svg: `<path fill-rule="evenodd" d="M12 2l8.5 3v6.3c0 5-3.6 9.2-8.5 10.7-4.9-1.5-8.5-5.7-8.5-10.7V5zM11 6.5v4H7.5v2H11v6h2v-6h3.5v-2H13v-4z"/>`,
  },
  assassin: {
    label: "Assassin", meter: "#a3d65a", soft: "#8fa86b",
    // twin crossed daggers
    svg: `<g transform="rotate(40 12 12)"><path d="M12 2l1.4 2v9h-2.8V4z"/><path d="M9 13h6v1.6H9z"/><path d="M11.2 14.6h1.6v5h-1.6z"/></g><g transform="rotate(-40 12 12)"><path d="M12 2l1.4 2v9h-2.8V4z"/><path d="M9 13h6v1.6H9z"/><path d="M11.2 14.6h1.6v5h-1.6z"/></g>`,
  },
  ranger: {
    label: "Ranger", meter: "#5fc9a0", soft: "#6fa592",
    // bow and arrow
    svg: `<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 2.5c7 3 7 16 0 19"/><path fill="none" stroke="currentColor" stroke-width="1" d="M6 2.5v19"/><path d="M3 11.2h14.5v1.6H3z"/><path d="M22 12l-5-3v6z"/><path d="M2 9.5l2.5 2.5L2 14.5h2.2L6.4 12 4.2 9.5z"/>`,
  },
  sorcerer: {
    label: "Sorcerer", meter: "#b08cf0", soft: "#9a8bbd",
    // arcane flame
    svg: `<path d="M12 1.5c1 3.5 5.5 5.5 5.5 11a5.5 5.5 0 0 1-11 0c0-3 1.5-4.6 2.6-5.8.2 1.8.9 3 2 3.6C10.5 7 11 4.2 12 1.5z"/><path fill="#0d0f15" opacity=".55" d="M12 11c.8 1.8 2.6 2.6 2.6 4.6a2.6 2.6 0 0 1-5.2 0c0-1.5.9-2.4 1.6-3 .1.8.4 1.3.8 1.5 0-1.1.1-2.1.2-3.1z"/><path d="M12 19.5l2 2.5h-4z"/>`,
  },
  spiritmaster: {
    label: "Spiritmaster", meter: "#d27de0", soft: "#a882ae",
    // spirit orb with wisps
    svg: `<circle cx="12" cy="13" r="4.5"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M5 9c-2 3-1.5 7.5 2 10M19 9c2 3 1.5 7.5-2 10M8.5 4.5c2-1.6 5-1.6 7 0"/><circle cx="12" cy="13" r="1.6" fill="#0d0f15" opacity=".55"/>`,
  },
  cleric: {
    label: "Cleric", meter: "#ecc85f", soft: "#bba765",
    // winged mace
    svg: `<path d="M11 8h2v14h-2z"/><circle cx="12" cy="5.5" r="3.5"/><path d="M10.5 9.5C7 9 4 7 2 4c.5 4 3 7.5 8.5 8zM13.5 9.5C17 9 20 7 22 4c-.5 4-3 7.5-8.5 8z"/>`,
  },
  chanter: {
    label: "Chanter", meter: "#e3a856", soft: "#b59468",
    // staff with mantra ring
    svg: `<path d="M11 9h2v13h-2z"/><path fill-rule="evenodd" d="M12 1a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z"/><path d="M8 13.5h8v1.6H8z"/>`,
  },
};

export const CLASS_IMG = {};   // class -> url, for classes listed in img/classes/icons.json
const IMG_DIR = new URL("img/classes/", import.meta.url);
fetch(new URL("icons.json", IMG_DIR)).then(r => r.ok ? r.json() : []).then(list => {
  for (const k of list) CLASS_IMG[k] = new URL(`${k}.png`, IMG_DIR).href;
}).catch(() => {});

// Skill names from the public gamers4.life Aion 2 database (bundled; refresh with tools/update_skills.py).
// The game sends ids like 11010340: the last four digits are the level/variant, the rest is the skill.
export const SKILLS = {};
fetch(new URL("data/skills.json", import.meta.url)).then(r => r.ok ? r.json() : {}).then(d => Object.assign(SKILLS, d)).catch(() => {});
// Names the community has added (skills the database doesn't list), kept in the Nova Meter GitHub repository.
export const SHARED_SKILLS_URL = "https://raw.githubusercontent.com/odenness/nova-meter/HEAD/skills.json";
fetch(SHARED_SKILLS_URL, { cache: "no-store" }).then(r => r.ok ? r.json() : {})
  .then(d => { for (const [k, v] of Object.entries(d)) if (/^\d{8}$/.test(k) && (v?.n || typeof v === "string")) SKILLS[k] ??= { n: v.n || v }; })
  .catch(() => {});
// A small in-page text box (Electron doesn't support window.prompt). Resolves to the text, or null if cancelled.
export function askText(title, value = "") {
  return new Promise(done => {
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:fixed;inset:0;z-index:100;display:grid;place-items:center;background:rgba(0,0,0,.45)";
    wrap.innerHTML = `<form style="background:#161a22;border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:14px;width:min(320px,90vw);box-shadow:0 12px 30px rgba(0,0,0,.6);font:13px var(--font,'Segoe UI'),sans-serif;color:#e8eaf0">
      <div style="margin-bottom:8px;font-weight:600"></div>
      <input maxlength="40" style="width:100%;box-sizing:border-box;padding:7px 9px;border-radius:6px;border:1px solid rgba(255,255,255,.2);background:#0d1016;color:#fff;font:inherit">
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
        <button type="button" data-x style="background:none;border:1px solid rgba(255,255,255,.2);color:#c9cdd6;padding:5px 12px;border-radius:6px;cursor:pointer">Cancel</button>
        <button style="background:var(--accent,#f3c25a);border:0;color:#1b1404;font-weight:700;padding:5px 12px;border-radius:6px;cursor:pointer">Save</button></div></form>`;
    const form = wrap.querySelector("form"), input = wrap.querySelector("input");
    wrap.querySelector("div div").textContent = title;
    input.value = value;
    const close = v => { wrap.remove(); done(v); };
    form.onsubmit = e => { e.preventDefault(); close(input.value); };
    wrap.querySelector("[data-x]").onclick = () => close(null);
    wrap.onclick = e => { if (e.target === wrap) close(null); };
    input.onkeydown = e => { if (e.key === "Escape") close(null); };
    document.body.appendChild(wrap);
    input.focus(); input.select();
  });
}

// "Skill 11420340" -> "Skill 11420000": every level of a skill is the same skill.
export function skillBase(label) {
  const m = /^Skill (\d+)( \(summon\))?$/.exec(label || "");
  return m ? `Skill ${Math.floor(+m[1] / 10000) * 10000}${m[2] || ""}` : label;
}
export function knownSkill(label) {
  const m = /^Skill (\d+)( \(summon\))?$/.exec(label || "");
  if (!m) return null;
  const base = Math.floor(+m[1] / 10000) * 10000;
  const s = SKILLS[String(base)];
  if (s) return s.n + (m[2] || "");
  // each class's first skill id (11000000 Gladiator ... 18000000 Chanter) is its basic attack
  if (base % 1000000 === 0 && base >= 11000000 && base <= 18000000) return "Auto-attack" + (m[2] || "");
  return null;
}

export function classIcon(cls, size = 26) {
  if (CLASS_IMG[cls]) return `<img class="icon" src="${CLASS_IMG[cls]}" width="${size}" height="${size}" alt="">`;
  const c = CLASSES[cls];
  return `<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${c ? c.svg : ""}</svg>`;
}

export const EVENT_ICONS = {
  rift:  `<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 12m-1.5 0a1.5 1.5 0 1 0 3 0a3.5 3.5 0 1 0-7 0a5.5 5.5 0 1 0 11 0a7.5 7.5 0 1 0-15 0"/>`,
  shugo: `<path fill-rule="evenodd" d="M4 4l4.5 3.2a9 9 0 0 1 7 0L20 4l-.8 6A8 8 0 1 1 4.8 10zM8.3 13.2a1.7 1.7 0 1 0 3.4 0 1.7 1.7 0 1 0-3.4 0zm4 0a1.7 1.7 0 1 0 3.4 0 1.7 1.7 0 1 0-3.4 0zM10 17q2 1.6 4 0z"/>`,
  raid:  `<path d="M12 3c-1 3-4 4-9 4 2 1.5 3 3 3 5l6 9 6-9c0-2 1-3.5 3-5-5 0-8-1-9-4zm0 6.5l2 3-2 3.5-2-3.5z" fill-rule="evenodd"/>`,
  arena: `<g transform="rotate(45 12 12)"><path d="M12 1.5l1.5 2V14h-3V3.5z"/><path d="M8.5 14h7v1.8h-7zM11.2 15.8h1.6v4h-1.6z"/></g><g transform="rotate(-45 12 12)"><path d="M12 1.5l1.5 2V14h-3V3.5z"/><path d="M8.5 14h7v1.8h-7zM11.2 15.8h1.6v4h-1.6z"/></g>`,
  reset: `<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M20 12a8 8 0 1 1-2.4-5.7M20 3.5V8h-4.5"/><circle cx="12" cy="12" r="2.4"/>`,
};

export const UI_ICONS = {
  reset: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>`,
  soundOn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>`,
  soundOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9.5l5 5M22 9.5l-5 5"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`,
  unlock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>`,
  compact: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>`,
  expand: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>`,
  bug: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="6" width="8" height="14" rx="4"/><path d="M12 20v-9M9 6.5 7.5 4M15 6.5 16.5 4M4 13h4M16 13h4M5 19l3-2M19 19l-3-2M5 7l3 2M19 7l-3 2"/></svg>`,
  coffee: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c-.6.8.6 1.7 0 2.5M12 3.5c-.6.8.6 1.7 0 2.5"/></svg>`,
  more: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>`,
  skull: `<svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M12 2a8 8 0 0 0-8 8c0 2.6 1.2 4.6 3 5.8V19a1 1 0 0 0 1 1h1v-2h2v2h2v-2h2v2h1a1 1 0 0 0 1-1v-3.2c1.8-1.2 3-3.2 3-5.8a8 8 0 0 0-8-8zM8.5 9.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
};

// Drag the window by its header (Electron): follow the pointer and ask the shell to move the window.
export function makeDraggable(handle, nova, mode = "move") {
  if (!nova?.gestureStart) return;
  handle.addEventListener("pointerdown", e => {
    if (e.button !== 0 || (mode === "move" && e.target.closest("button, select, input, .ev"))) return;
    if (document.querySelector(".meter.locked")) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add("dragging");
    nova.gestureStart(mode);
    const end = () => {
      handle.classList.remove("dragging");
      nova.gestureEnd();
      for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) handle.removeEventListener(t, end);
    };
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) handle.addEventListener(t, end);
  });
}
