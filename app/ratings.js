// Nova Rating: how a parse compares with the same class on the same boss version, at the same Combat Power.
//
// Reference data (data/ratings.json, refreshed with tools/update_ratings.py) is AionFlex's published class standing per
// boss NPC id: the median and 95th-percentile DPS of real uploaded kills (Global, 4+ player parties, one row per character
// per week) and the median Combat Power of the players behind them.
//
//   expected median  m = median_class,boss × (CP / medianCP_boss)^K        (K: how strongly DPS follows Combat Power)
//   spread           σ = ln(p95 / median) / 1.645                          (log-normal through the median and the p95)
//   rating           = 100 × Φ( ln(DPS / m) / σ )                          (the percentile your DPS reaches)
//
// 50 = typical for your class at your Combat Power on that boss, 95 = top 5%. Without a known CP the comparison is at
// the boss's typical CP. K = 1 (DPS proportional to CP) until it can be fitted from the guild's own uploads.

export const K = 1;
const REF = { bosses: {} };
export const ratingsReady = fetch(new URL("data/ratings.json", import.meta.url)).then(r => r.ok ? r.json() : { bosses: {} })
  .then(d => Object.assign(REF, d)).catch(() => {});

// standard normal CDF (Abramowitz–Stegun 7.1.26, error < 1.5e-7)
function phi(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** → { rating 0–100, expected (median DPS for this class at this CP), ratio, n, boss } or null when there's no reference. */
export function rate({ template, cls, dps, cp }) {
  const b = REF.bosses?.[String(template)];
  const c = b?.classes?.[cls];
  if (!c || !c.median || !(dps > 0)) return null;
  const scale = cp > 0 && b.medianCP ? (cp / b.medianCP) ** K : 1;
  const m = c.median * scale;
  const top = (c.p95 && c.p95 > c.median ? c.p95 : c.median * 1.8) * scale;   // no p95 under 50 rows: a typical spread
  const sigma = Math.log(top / m) / 1.645;
  const rating = 100 * phi(Math.log(dps / m) / sigma);
  return { rating: Math.max(0, Math.min(100, rating)), expected: m, ratio: dps / m, n: c.n, boss: b.name, cpAdjusted: scale !== 1,
           healer: cls === "cleric" || cls === "chanter" };       // the reference rates them on damage too
}

/** Colour band for a rating, like other parse sites: grey, green, blue, purple, orange, gold. */
export const ratingClass = r => r >= 99 ? "r-gold" : r >= 95 ? "r-orange" : r >= 75 ? "r-purple" : r >= 50 ? "r-blue" : r >= 25 ? "r-green" : "r-grey";
export const ratingSource = () => REF.source ? `${REF.source} (updated ${REF.updated})` : "";
