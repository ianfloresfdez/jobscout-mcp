import type { Job, SearchParams, Source, SourceId, SourceResult } from "./types.js";
import { remotive } from "./sources/remotive.js";
import { arbeitnow } from "./sources/arbeitnow.js";
import { hn } from "./sources/hn.js";
import { adzuna } from "./sources/adzuna.js";
import { daysAgo, norm, TtlCache } from "./util.js";
import { queryTokens, tokenHits } from "./query.js";

export const SOURCES: Record<SourceId, Source> = { remotive, arbeitnow, hn, adzuna };

/** Every job any search has returned in this session, so get_job can answer without refetching. */
export const seen = new Map<string, Job>();

const cache = new TtlCache<Job[]>(10 * 60 * 1000);

/** Sources that search server-side return loose matches; boards without search return everything. */
const CLIENT_FILTERED: SourceId[] = ["arbeitnow", "remotive"];

export { queryTokens } from "./query.js";

/** All query words must appear (as whole words) in the title, tags or description. */
export function matchesQuery(job: Job, query: string): boolean {
  const tokens = queryTokens(query);
  if (!tokens.length) return true;
  return tokenHits(`${job.title} ${job.tags.join(" ")} ${job.description}`, tokens) === tokens.length;
}

const SPAIN = ["spain", "espana", "es", "barcelona", "madrid", "valencia", "sevilla", "malaga", "bilbao", "zaragoza", "catalonia", "cataluna"];
const OPEN_TO_SPAIN = /\b(europe|european union|eu|emea|cet|cest|worldwide|anywhere|global|spain|espana)\b/;

/**
 * True when the job is in the asked-for place, or is remote and open to people there.
 * "Barcelona" also accepts remote roles open to Spain, Europe or anywhere.
 */
export function matchesLocation(job: Job, location: string): boolean {
  const want = norm(location);
  if (!want) return true;
  const where = norm(job.location);
  if (where.includes(want)) return true;
  if (/^(remote|remoto|teletrabajo)$/.test(want)) return job.remote === true;
  if (/^(europe|eu|europa)$/.test(want)) return /\b(europe|eu|emea|worldwide|anywhere|global)\b/.test(where) || (job.remote === true && /\b(germany|deutschland|berlin|netherlands|france|spain|portugal|poland|ireland)\b/.test(where));
  const wantsSpain = SPAIN.some((s) => want === s || want.includes(s));
  if (wantsSpain && job.remote === true && OPEN_TO_SPAIN.test(where)) return true;
  if (wantsSpain && /\b(spain|espana)\b/.test(where) && want !== "madrid" && want !== "barcelona") return true;
  return false;
}

export interface AggregateResult {
  jobs: Job[];
  perSource: SourceResult[];
}

export async function searchJobs(
  params: SearchParams & { sources?: SourceId[] },
): Promise<AggregateResult> {
  const ids = params.sources?.length ? params.sources : (Object.keys(SOURCES) as SourceId[]);
  const perSource: SourceResult[] = await Promise.all(
    ids.map(async (id): Promise<SourceResult> => {
      const src = SOURCES[id];
      const why = src.unavailable();
      if (why) return { source: id, jobs: [], skipped: why };
      const key = `${id}|${norm(params.query)}|${norm(params.location ?? "")}|${params.maxAgeDays ?? ""}`;
      const hit = cache.get(key);
      if (hit) return { source: id, jobs: hit };
      try {
        const jobs = await src.search(params);
        cache.set(key, jobs);
        return { source: id, jobs };
      } catch (e) {
        return { source: id, jobs: [], error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );

  const now = Date.now();
  const dedupe = new Set<string>();
  const jobs: Job[] = [];
  for (const r of perSource) {
    const kept: Job[] = [];
    for (const job of r.jobs) {
      if (CLIENT_FILTERED.includes(job.source) && !matchesQuery(job, params.query)) continue;
      if (params.remoteOnly && job.remote !== true) continue;
      if (params.location && !matchesLocation(job, params.location)) continue;
      if (params.maxAgeDays) {
        const age = daysAgo(job.postedAt, now);
        if (age !== null && age > params.maxAgeDays) continue;
      }
      const k = `${norm(job.company)}|${norm(job.title)}`;
      if (dedupe.has(k)) continue;
      dedupe.add(k);
      seen.set(job.id, job);
      kept.push(job);
    }
    r.jobs = kept;
    jobs.push(...kept);
  }
  jobs.sort((a, b) => (Date.parse(b.postedAt ?? "") || 0) - (Date.parse(a.postedAt ?? "") || 0));
  return { jobs, perSource };
}
