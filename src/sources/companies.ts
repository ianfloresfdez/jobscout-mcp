import type { CompanyBoard, Job, Source } from "../types.js";
import { decodeEntities, fetchJson, htmlToText, TtlCache } from "../util.js";
import { parseSalary, structuredSalary } from "../salary.js";

/** "acme-labs" -> "Acme Labs", for boards that do not return the company name. */
const pretty = (slug: string) => slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

interface GreenhouseJob {
  id: number | string;
  title: string;
  absolute_url: string;
  company_name?: string;
  location?: { name?: string };
  first_published?: string;
  updated_at?: string;
  content?: string;
  departments?: Array<{ name?: string }>;
}

export function mapGreenhouse(j: GreenhouseJob, slug: string): Job {
  const location = j.location?.name?.replace(/\s*;\s*/g, "; ").trim() || "Unknown";
  // Greenhouse escapes the HTML of the description once more
  const description = htmlToText(decodeEntities(j.content ?? ""));
  return {
    id: `companies:greenhouse:${slug}:${j.id}`,
    source: "companies",
    title: j.title.trim(),
    company: j.company_name?.trim() || pretty(slug),
    location,
    remote: /\bremote\b/i.test(location) ? true : null,
    url: j.absolute_url,
    postedAt: j.first_published || j.updated_at ? new Date((j.first_published || j.updated_at)!).toISOString() : null,
    salary: parseSalary(description),
    tags: (j.departments ?? []).map((d) => d.name?.trim() ?? "").filter(Boolean),
    description,
  };
}

interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number;
  categories?: { location?: string; team?: string; department?: string; commitment?: string; allLocations?: string[] };
  workplaceType?: string;
  country?: string;
  descriptionPlain?: string;
  lists?: Array<{ text?: string; content?: string }>;
  additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
}

export function mapLever(j: LeverJob, slug: string): Job {
  const c = j.categories ?? {};
  const description = [
    j.descriptionPlain ?? "",
    ...(j.lists ?? []).map((l) => `${l.text ?? ""}\n${htmlToText(l.content)}`),
    j.additionalPlain ?? "",
  ].join("\n\n").trim();
  const wt = (j.workplaceType ?? "").toLowerCase();
  const location = (c.allLocations?.length ? c.allLocations.join("; ") : c.location)?.trim() || j.country || "Unknown";
  return {
    id: `companies:lever:${slug}:${j.id}`,
    source: "companies",
    title: j.text.trim(),
    company: pretty(slug),
    location,
    remote: wt === "remote" ? true : wt === "onsite" || wt === "hybrid" ? false : /\bremote\b/i.test(location) || null,
    url: j.hostedUrl,
    postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    salary: j.salaryRange ? structuredSalary(j.salaryRange.min, j.salaryRange.max, j.salaryRange.currency, j.salaryRange.interval) : parseSalary(description),
    tags: [c.team, c.department, c.commitment, wt].filter((t): t is string => !!t),
    description,
  };
}

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: Array<{ location?: string }>;
  department?: string;
  team?: string;
  employmentType?: string;
  isRemote?: boolean;
  workplaceType?: string;
  publishedAt?: string;
  jobUrl: string;
  descriptionPlain?: string;
  compensation?: { scrapeableCompensationSalarySummary?: string | null; compensationTierSummary?: string | null };
}

export function mapAshby(j: AshbyJob, slug: string): Job {
  const places = [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)].filter(Boolean);
  const wt = (j.workplaceType ?? "").toLowerCase();
  const description = j.descriptionPlain ?? "";
  const comp = j.compensation?.scrapeableCompensationSalarySummary || j.compensation?.compensationTierSummary;
  return {
    id: `companies:ashby:${slug}:${j.id}`,
    source: "companies",
    title: j.title.trim(),
    company: pretty(slug),
    location: places.join("; ") || "Unknown",
    // Hybrid roles need the office, so only fully remote ones count as remote; some boards leave the type empty
    // and only say "Remote" in the location
    remote: wt === "remote" ? true : wt === "hybrid" || wt === "onsite" ? false : j.isRemote ?? (/\bremote\b/i.test(places.join(" ")) || null),
    url: j.jobUrl,
    postedAt: j.publishedAt ? new Date(j.publishedAt).toISOString() : null,
    salary: parseSalary(comp) ?? parseSalary(description),
    tags: [j.department, j.team, j.employmentType, j.workplaceType].filter((t): t is string => !!t),
    description,
  };
}

/** "greenhouse:typeform, ashby:preply" -> boards; entries with an unknown ATS are dropped. */
export function parseCompanies(spec: string): CompanyBoard[] {
  return spec.split(/[,\s]+/).map((s) => s.trim().split(":")).flatMap(([ats, slug]) =>
    slug && (ats === "greenhouse" || ats === "lever" || ats === "ashby") ? [{ ats, slug }] : []);
}

// A board lists every open role and changes slowly: read each one once per half hour, whatever the query
const boards = new TtlCache<Job[]>(30 * 60 * 1000);

async function readBoard({ ats, slug }: CompanyBoard): Promise<Job[]> {
  const key = `${ats}:${slug}`;
  const hit = boards.get(key);
  if (hit) return hit;
  const s = encodeURIComponent(slug);
  let jobs: Job[];
  if (ats === "greenhouse") {
    const d = await fetchJson<{ jobs: GreenhouseJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${s}/jobs?content=true`, { timeoutMs: 20_000 });
    jobs = d.jobs.map((j) => mapGreenhouse(j, slug));
  } else if (ats === "lever") {
    const d = await fetchJson<LeverJob[]>(`https://api.lever.co/v0/postings/${s}?mode=json`, { timeoutMs: 20_000 });
    jobs = d.map((j) => mapLever(j, slug));
  } else {
    const d = await fetchJson<{ jobs: AshbyJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${s}?includeCompensation=true`, { timeoutMs: 20_000 });
    jobs = d.jobs.map((j) => mapAshby(j, slug));
  }
  boards.set(key, jobs);
  return jobs;
}

/**
 * Company career pages on Greenhouse, Lever and Ashby: first-hand postings, including on-site and hybrid roles.
 * Free public APIs with no key; you choose the companies. Boards only list open roles, so no age filter applies.
 */
export const companies: Source = {
  id: "companies",
  label: "Company career pages (Greenhouse, Lever, Ashby)",
  unavailable: () => null,
  async search({ companies: list }) {
    const wanted = list ?? parseCompanies(process.env.JOBSCOUT_COMPANIES ?? "");
    if (!wanted.length) return [];
    const settled = await Promise.allSettled(wanted.map(readBoard));
    const jobs = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
    if (!jobs.length && settled.every((s) => s.status === "rejected")) throw (settled[0] as PromiseRejectedResult).reason;
    return jobs;
  },
};
