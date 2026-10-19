import type { Job, SourceId } from "./types.js";
import { extractSkills, skillGroup, type SkillGroup } from "./skills.js";
import { annualMid } from "./salary.js";
import { norm, quantile } from "./util.js";
import { queryTokens, tokenHits } from "./query.js";

const skillCache = new WeakMap<Job, { all: string[]; inTitle: Set<string> }>();

/** Skills a posting asks for, and which of them it names in the title (those weigh more). */
export function jobSkills(job: Job): { all: string[]; inTitle: Set<string> } {
  let hit = skillCache.get(job);
  if (!hit) {
    hit = {
      all: extractSkills(`${job.title}\n${job.tags.join(" ")}\n${job.description}`),
      inTitle: new Set(extractSkills(job.title)),
    };
    skillCache.set(job, hit);
  }
  return hit;
}

export interface SalaryStats { currency: string; n: number; p25: number; median: number; p75: number }

export interface Snapshot {
  total: number;
  bySource: Partial<Record<SourceId, number>>;
  remote: { yes: number; no: number; unknown: number };
  topSkills: Array<{ skill: string; count: number; share: number; group: SkillGroup | null }>;
  salaries: SalaryStats[];
  salaryCoverage: number;
  topCompanies: Array<{ company: string; count: number }>;
}

export function marketSnapshot(jobs: Job[], topN = 20): Snapshot {
  const bySource: Partial<Record<SourceId, number>> = {};
  const remote = { yes: 0, no: 0, unknown: 0 };
  const skillCounts = new Map<string, number>();
  const companyCounts = new Map<string, { name: string; count: number }>();
  const salaryBuckets = new Map<string, number[]>();
  let withSalary = 0;

  for (const job of jobs) {
    bySource[job.source] = (bySource[job.source] ?? 0) + 1;
    if (job.remote === true) remote.yes++; else if (job.remote === false) remote.no++; else remote.unknown++;
    for (const s of jobSkills(job).all) skillCounts.set(s, (skillCounts.get(s) ?? 0) + 1);
    const ck = norm(job.company);
    if (ck && ck !== "unknown") {
      const c = companyCounts.get(ck) ?? { name: job.company, count: 0 };
      c.count++; companyCounts.set(ck, c);
    }
    if (job.salary) {
      const v = annualMid(job.salary);
      if (v !== null && job.salary.currency) {
        withSalary++;
        const arr = salaryBuckets.get(job.salary.currency) ?? [];
        arr.push(v); salaryBuckets.set(job.salary.currency, arr);
      }
    }
  }

  const salaries: SalaryStats[] = [...salaryBuckets.entries()]
    .filter(([, v]) => v.length >= 3)
    .map(([currency, v]) => {
      const s = v.sort((a, b) => a - b);
      return { currency, n: s.length, p25: quantile(s, 0.25), median: quantile(s, 0.5), p75: quantile(s, 0.75) };
    })
    .sort((a, b) => b.n - a.n);

  return {
    total: jobs.length,
    bySource,
    remote,
    topSkills: [...skillCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([skill, count]) => ({ skill, count, share: jobs.length ? count / jobs.length : 0, group: skillGroup(skill) })),
    salaries,
    salaryCoverage: jobs.length ? withSalary / jobs.length : 0,
    topCompanies: [...companyCounts.values()]
      .filter((c) => c.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((c) => ({ company: c.name, count: c.count })),
  };
}

export interface Ranked {
  job: Job;
  /** 0-100: weighted share of the posting's skills the candidate has. */
  score: number;
  matched: string[];
  missing: string[];
}

/**
 * Scores each posting by how much of what it asks for the candidate already has.
 * Skills named in the job title count double; postings that mention fewer than two
 * known skills are skipped because there is too little signal to score them.
 */
export function rankForProfile(jobs: Job[], skills: string[], query = ""): { ranked: Ranked[]; gaps: Array<{ skill: string; count: number }> } {
  const have = new Set(skills);
  const tokens = queryTokens(query);
  const titleHits = new Map<Job, number>();
  const ranked: Ranked[] = [];
  for (const job of jobs) {
    const { all, inTitle } = jobSkills(job);
    if (all.length < 2) continue;
    let total = 0, got = 0;
    const matched: string[] = [], missing: string[] = [];
    for (const s of all) {
      const w = inTitle.has(s) ? 2 : 1;
      total += w;
      if (have.has(s)) { got += w; matched.push(s); } else missing.push(s);
    }
    ranked.push({ job, score: Math.round((got / total) * 100), matched, missing });
    titleHits.set(job, tokens.length ? tokenHits(job.title, tokens) : 0);
  }
  // Postings whose title matches the search come first; skill fit orders within each group.
  ranked.sort((a, b) =>
    (titleHits.get(b.job)! - titleHits.get(a.job)!) || b.score - a.score || b.matched.length - a.matched.length);

  const gapCounts = new Map<string, number>();
  for (const r of ranked.slice(0, 30)) for (const m of r.missing) gapCounts.set(m, (gapCounts.get(m) ?? 0) + 1);
  const gaps = [...gapCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([skill, count]) => ({ skill, count }));
  return { ranked, gaps };
}
