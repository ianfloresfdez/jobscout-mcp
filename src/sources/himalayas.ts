import type { Job, Source } from "../types.js";
import { fetchJson, htmlToText } from "../util.js";
import { structuredSalary } from "../salary.js";

interface HimalayasJob {
  guid: string;
  title: string;
  companyName?: string;
  companySlug?: string;
  employmentType?: string;
  seniority?: string[];
  minSalary?: number | null;
  maxSalary?: number | null;
  currency?: string | null;
  salaryPeriod?: string | null;
  locationRestrictions?: string[];
  categories?: string[];
  description?: string;
  excerpt?: string;
  pubDate?: number;
  applicationLink?: string;
}

export function mapHimalayas(j: HimalayasJob): Job {
  const where = j.locationRestrictions ?? [];
  return {
    id: `himalayas:${j.guid.replace(/^https?:\/\/himalayas\.app\//, "")}`,
    source: "himalayas",
    title: j.title.trim(),
    company: j.companyName?.trim() || "Unknown",
    // No restrictions means open to any country
    location: where.length ? where.join(", ") : "Worldwide",
    remote: true,
    url: j.applicationLink || j.guid,
    postedAt: j.pubDate ? new Date(j.pubDate * 1000).toISOString() : null,
    salary: structuredSalary(j.minSalary, j.maxSalary, j.currency, j.salaryPeriod),
    tags: [...(j.categories ?? []), ...(j.seniority ?? []), ...(j.employmentType ? [j.employmentType] : [])],
    description: htmlToText(j.description || j.excerpt),
  };
}

const PAGES = 3; // 20 results per page

/** Himalayas: remote-only board with a free public API (no key) and server-side search. */
export const himalayas: Source = {
  id: "himalayas",
  label: "Himalayas (remote jobs)",
  unavailable: () => null,
  async search({ query }) {
    const settled = await Promise.allSettled(
      Array.from({ length: PAGES }, (_, i) =>
        fetchJson<{ jobs: HimalayasJob[] }>(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(query)}&page=${i + 1}`),
      ),
    );
    const all = settled.flatMap((s) => (s.status === "fulfilled" ? s.value.jobs ?? [] : []));
    if (!all.length && settled[0].status === "rejected") throw settled[0].reason;
    return all.map(mapHimalayas);
  },
};
