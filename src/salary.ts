import type { Salary } from "./types.js";

const CURRENCY: Array<[RegExp, string]> = [
  [/€|\beur(os?)?\b/i, "EUR"],
  [/£|\bgbp\b/i, "GBP"],
  [/\$|\busd\b/i, "USD"],
];

/** Builds a Salary from boards that already give numbers (Himalayas, Jobicy); null when there is no amount. */
export function structuredSalary(min: unknown, max: unknown, currency: unknown, period: unknown): Salary | null {
  const lo = Number(min) || null, hi = Number(max) || null;
  if (!lo && !hi) return null;
  const p = String(period ?? "").toLowerCase();
  return {
    min: lo ?? hi, max: hi ?? lo,
    currency: typeof currency === "string" && currency ? currency.toUpperCase() : null,
    period: /year|annual/.test(p) ? "year" : /month/.test(p) ? "month" : /hour/.test(p) ? "hour" : null,
  };
}

function toNumber(raw: string, kSuffix: boolean): number {
  // "70.000" (es) and "70,000" (en) are both thousands separators here; we never see cents in salaries.
  const n = parseFloat(raw.replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
  return kSuffix ? n * 1000 : n;
}

/**
 * Pulls a salary range out of free text such as "$120k - $150k", "€55.000-65.000 / year",
 * "70-90k EUR", "£500/day" or "45€/h". Returns null when no plausible salary is found.
 */
export function parseSalary(text: string | null | undefined): Salary | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, " ");
  const re = /([$€£]\s?)?(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s?(k|K)?\s?(?:[-–—]|to|a|hasta)\s?([$€£]\s?)?(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s?(k|K)?|([$€£]\s?)(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s?(k|K)?|(\d{1,3}(?:[.,]\d{3})+|\d+)\s?(k|K)?\s?(€|eur|usd|gbp|\$|£)/i;
  const m = t.match(re);
  if (!m) return null;

  let min: number, max: number;
  if (m[2] !== undefined) {
    const kBoth = Boolean(m[6]);
    min = toNumber(m[2], Boolean(m[3]) || kBoth);
    max = toNumber(m[5], kBoth || Boolean(m[3]));
  } else if (m[8] !== undefined) {
    min = max = toNumber(m[8], Boolean(m[9]));
  } else {
    min = max = toNumber(m[10], Boolean(m[11]));
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min > max) [min, max] = [max, min];

  const window = t.slice(Math.max(0, (m.index ?? 0) - 12), (m.index ?? 0) + m[0].length + 24);
  let currency: string | null = null;
  for (const [r, code] of CURRENCY) if (r.test(window)) { currency = code; break; }

  let period: Salary["period"] = null;
  if (/\/\s?(h|hr|hour)\b|per hour|hourly|\/hora|por hora|€\/h/i.test(window)) period = "hour";
  else if (/\/\s?(mo|month)\b|per month|monthly|\/mes|al mes|mensual/i.test(window)) period = "month";
  else if (/\/\s?(yr|year|y)\b|per year|annual|yearly|\/a[nñ]o|anual|bruto|gross|\bk\b/i.test(window) || max >= 10_000) period = "year";

  // Reject things that are clearly not salaries (years like 2026, team sizes, tiny numbers).
  if (period === "year" && max < 8_000) return null;
  if (period === null && max < 1_000) return null;
  if (max > 1_000_000) return null;
  if (min >= 1900 && max <= 2100 && min === max) return null;

  return { min, max, currency, period, raw: m[0].trim() };
}

/** Annualised value of the range midpoint, for comparing postings. Null when the period is unknown. */
export function annualMid(s: Salary): number | null {
  const mid = s.min !== null && s.max !== null ? (s.min + s.max) / 2 : s.min ?? s.max;
  if (mid === null) return null;
  switch (s.period) {
    case "year": return mid;
    case "month": return mid * 12;
    case "hour": return mid * 1760; // 220 working days x 8h
    default: return null;
  }
}
