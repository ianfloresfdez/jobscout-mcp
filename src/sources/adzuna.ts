import type { Job, Source } from "../types.js";
import { fetchJson, htmlToText } from "../util.js";

interface AdzunaJob {
  id: string;
  title: string;
  description?: string;
  redirect_url: string;
  created?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string | number;
  contract_time?: string;
  contract_type?: string;
  category?: { label?: string };
}

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  es: "EUR", de: "EUR", fr: "EUR", it: "EUR", nl: "EUR", at: "EUR", be: "EUR", pl: "PLN",
  gb: "GBP", us: "USD", ca: "CAD", au: "AUD", in: "INR", br: "BRL", mx: "MXN", ch: "CHF",
};

export function mapAdzuna(j: AdzunaJob, country: string): Job {
  const description = htmlToText(j.description);
  const title = htmlToText(j.title);
  const predicted = String(j.salary_is_predicted ?? "0") === "1";
  const hasSalary = !predicted && (j.salary_min || j.salary_max);
  return {
    id: `adzuna:${j.id}`,
    source: "adzuna",
    title,
    company: j.company?.display_name?.trim() || "Unknown",
    location: j.location?.display_name?.trim() || country.toUpperCase(),
    remote: /\b(remote|teletrabajo|remoto|en remoto|100% remote)\b/i.test(`${title} ${description}`) ? true : null,
    url: j.redirect_url,
    postedAt: j.created ? new Date(j.created).toISOString() : null,
    salary: hasSalary
      ? { min: j.salary_min ?? null, max: j.salary_max ?? null, currency: CURRENCY_BY_COUNTRY[country] ?? null, period: "year" }
      : null,
    tags: [j.category?.label, j.contract_time?.replace(/_/g, " "), j.contract_type].filter((x): x is string => Boolean(x)),
    description,
  };
}

/**
 * Adzuna: aggregator with strong coverage of Spain (and 15+ other countries). Needs a free key from
 * https://developer.adzuna.com. Set ADZUNA_APP_ID and ADZUNA_APP_KEY; ADZUNA_COUNTRY defaults to "es".
 */
export const adzuna: Source = {
  id: "adzuna",
  label: "Adzuna (Spain and 15+ countries)",
  unavailable: () =>
    process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY
      ? null
      : "needs ADZUNA_APP_ID and ADZUNA_APP_KEY (free at developer.adzuna.com)",
  async search({ query, location, maxAgeDays }) {
    const country = (process.env.ADZUNA_COUNTRY || "es").toLowerCase();
    const params = new URLSearchParams({
      app_id: process.env.ADZUNA_APP_ID!,
      app_key: process.env.ADZUNA_APP_KEY!,
      what: query,
      results_per_page: "50",
      "content-type": "application/json",
    });
    // Remote-style locations are not places Adzuna understands; filter those client-side instead.
    if (location && !/remote|europe|eu|worldwide|anywhere/i.test(location)) params.set("where", location);
    if (maxAgeDays) params.set("max_days_old", String(maxAgeDays));
    const pages = await Promise.all(
      [1, 2].map((p) =>
        fetchJson<{ results: AdzunaJob[] }>(`https://api.adzuna.com/v1/api/jobs/${country}/search/${p}?${params}`)
          .catch((e) => (p === 1 ? Promise.reject(e) : { results: [] })),
      ),
    );
    return pages.flatMap((p) => p.results ?? []).map((j) => mapAdzuna(j, country));
  },
};
