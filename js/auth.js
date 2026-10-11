import { CONFIG } from "./config.js";

let client = null;
export const configured = !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);

export async function db() {
  if (!configured) return null;
  if (!client) {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
    client = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  }
  return client;
}

export async function currentUser() {
  const c = await db();
  if (!c) return null;
  const { data } = await c.auth.getUser();
  return data.user ?? null;
}

export async function signIn() {
  const c = await db();
  if (!c) return toast("Discord sign-in isn't switched on yet. It goes live once the Supabase project is set up.");
  await c.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: location.href } });
}

export async function signOut() {
  const c = await db();
  await c?.auth.signOut();
  location.reload();
}

export function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 4500);
}

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmt = n => { const a = Math.abs(n); return a >= 1e6 ? (n / 1e6).toFixed(2) + "M" : a >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n)); };
export const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const DISCORD_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.3 4.4A19.7 19.7 0 0 0 15.4 3l-.6 1.3a18.3 18.3 0 0 0-5.6 0L8.6 3a19.6 19.6 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1a19.8 19.8 0 0 0 6 3l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14.1 14.1 0 0 0 12.2 0l.5.4-2 1 1.3 2a19.7 19.7 0 0 0 6-3c.5-5.2-.9-9.7-3.6-13.7zM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.5 8 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z"/></svg>`;
export { DISCORD_ICON };

/** Newest installer from GitHub releases: { url, version } or null. Cached for the session. */
let latest = null;
export function latestInstaller() {
  if (!CONFIG.githubRepo) return Promise.resolve(null);
  latest ??= fetch(`https://api.github.com/repos/${CONFIG.githubRepo}/releases/latest`)
    .then(r => r.ok ? r.json() : null)
    .then(rel => {
      const exe = rel?.assets?.find(a => a.name.endsWith(".exe"));
      return exe ? { url: exe.browser_download_url, version: rel.tag_name.replace(/^v/, "") } : null;
    })
    .catch(() => null);
  return latest;
}

/** Point every [data-download] link at the newest installer once GitHub answers. */
export async function wireDownloads() {
  const inst = await latestInstaller();
  for (const a of document.querySelectorAll("[data-download]")) {
    if (inst) { a.href = inst.url; a.title = `Nova-Meter-Setup-${inst.version}.exe`; }
    else if (CONFIG.downloadUrl) a.href = CONFIG.downloadUrl;
    if (a.dataset.download === "label" && inst) a.textContent = `Download v${inst.version} for Windows`;
  }
}

/** Shared top bar. `active` = "home" | "fights" | "rankings" */
export async function mountNav(active) {
  const nav = document.createElement("header");
  nav.className = "nav";
  // Account pages only appear in the nav once sign-in is switched on (see config.js).
  nav.innerHTML = `<div class="wrap">
    <a class="logo" href="index.html">NOVA<small> METER</small></a>
    <nav class="nav-links">
      <a class="hide-m" href="index.html#setup">Setup</a>
      <a class="hide-m" href="index.html#faq">FAQ</a>
      ${configured ? `<a href="fights.html" class="${active === "fights" ? "on" : ""}">My fights</a>
      <a href="rankings.html" class="${active === "rankings" ? "on" : ""}">Rankings</a>` : ""}
      ${CONFIG.discordInvite ? `<a class="hide-m" href="${esc(CONFIG.discordInvite)}" target="_blank" rel="noopener">Discord</a>` : ""}
      <a class="btn primary sm" data-download href="${esc(CONFIG.downloadUrl || "index.html#download")}">Download</a>
      <span id="nav-user"></span>
    </nav></div>`;
  document.body.prepend(nav);
  wireDownloads();
  const slot = nav.querySelector("#nav-user");
  if (!configured) return null;
  const user = await currentUser().catch(() => null);
  if (user) {
    const m = user.user_metadata || {};
    slot.innerHTML = `<span class="user">${m.avatar_url ? `<img src="${esc(m.avatar_url)}" alt="">` : ""}<span>${esc(m.full_name || m.name || "Signed in")}</span><button id="signout">Sign out</button></span>`;
    slot.querySelector("#signout").onclick = signOut;
  } else {
    slot.innerHTML = `<button class="btn discord sm" id="signin">${DISCORD_ICON}Sign in</button>`;
    slot.querySelector("#signin").onclick = signIn;
  }
  return user;
}
