import { describe, expect, it, vi, beforeEach } from "vitest";
import { parseSalary, annualMid } from "../src/salary.js";
import { extractSkills, canonicalizeSkills } from "../src/skills.js";
import { matchesLocation, matchesQuery, searchJobs, seen } from "../src/search.js";
import { mapHnComment } from "../src/sources/hn.js";
import { mapRemotive } from "../src/sources/remotive.js";
import { marketSnapshot, rankForProfile } from "../src/analysis.js";
import { htmlToText } from "../src/util.js";
import type { Job } from "../src/types.js";

const job = (o: Partial<Job>): Job => ({
  id: "x:1", source: "remotive", title: "Engineer", company: "Acme", location: "Remote", remote: true,
  url: "https://example.com", postedAt: new Date().toISOString(), salary: null, tags: [], description: "", ...o,
});

describe("parseSalary", () => {
  it.each([
    ["$120k - $150k", { min: 120000, max: 150000, currency: "USD", period: "year" }],
    ["€55.000-65.000 / year", { min: 55000, max: 65000, currency: "EUR", period: "year" }],
    ["70-90k EUR", { min: 70000, max: 90000, currency: "EUR", period: "year" }],
    ["£500/day contract, £60/hour", { currency: "GBP" }],
    ["Salario: 45.000 € brutos anuales", { min: 45000, max: 45000, currency: "EUR", period: "year" }],
    ["$4,000 - $6,000 per month", { min: 4000, max: 6000, currency: "USD", period: "month" }],
  ])("%s", (input, expected) => {
    expect(parseSalary(input)).toMatchObject(expected);
  });

  it("ignores years and team sizes", () => {
    expect(parseSalary("Founded in 2019, team of 12-15 engineers")).toBeNull();
    expect(parseSalary("no salary here")).toBeNull();
  });

  it("annualises monthly and hourly ranges", () => {
    expect(annualMid({ min: 4000, max: 6000, currency: "EUR", period: "month" })).toBe(60000);
    expect(annualMid({ min: 50, max: 50, currency: "EUR", period: "hour" })).toBe(88000);
  });
});

describe("skills", () => {
  it("finds canonical skills and avoids false friends", () => {
    const s = extractSkills("Senior Python engineer: FastAPI, LangGraph agents, RAG on pgvector, AWS Bedrock, React. JavaScript a plus.");
    expect(s).toEqual(expect.arrayContaining(["Python", "FastAPI", "LangGraph", "AI agents", "RAG", "Vector databases", "AWS", "React", "JavaScript"]));
    expect(s).not.toContain("Java");
    expect(extractSkills("We use React Native")).toEqual(["React Native"]);
  });

  it("maps what the user types onto canonical names", () => {
    const { known, unknown } = canonicalizeSkills(["react.js", "LLM", "aws lambda", "Model Context Protocol", "Juggling"]);
    expect(known).toEqual(expect.arrayContaining(["React", "LLMs", "AWS", "MCP"]));
    expect(unknown).toEqual(["Juggling"]);
  });
});

describe("filters", () => {
  it("requires every query word as a whole word", () => {
    const j = job({ title: "AI Engineer", description: "Build LLM agents in Python" });
    expect(matchesQuery(j, "ai engineer")).toBe(true);
    expect(matchesQuery(j, "python agents")).toBe(true);
    expect(matchesQuery(job({ title: "Email marketer" }), "ai")).toBe(false);
  });

  it("counts remote roles open to Europe as available from Barcelona", () => {
    expect(matchesLocation(job({ location: "Barcelona, Spain", remote: false }), "barcelona")).toBe(true);
    expect(matchesLocation(job({ location: "Europe", remote: true }), "Barcelona")).toBe(true);
    expect(matchesLocation(job({ location: "USA only", remote: true }), "Barcelona")).toBe(false);
    expect(matchesLocation(job({ location: "Berlin", remote: false }), "Spain")).toBe(false);
    expect(matchesLocation(job({ location: "Madrid, España", remote: false }), "spain")).toBe(true);
  });
});

describe("source mapping", () => {
  it("parses a Hacker News posting header", () => {
    const j = mapHnComment(
      {
        objectID: "41", parent_id: 40, story_id: 40, author: "x", created_at: "2026-10-01T10:00:00Z",
        comment_text: "Acme AI | Senior AI Engineer | Barcelona or REMOTE (EU) | €80k-110k<p>We build agents for logistics. Python, LangGraph, AWS. Email jobs@acme.ai</p>",
      },
      "Ask HN: Who is hiring? (October 2026)",
    )!;
    expect(j).toMatchObject({ company: "Acme AI", title: "Senior AI Engineer", remote: true, salary: { min: 80000, max: 110000, currency: "EUR" } });
    expect(j.location).toMatch(/Barcelona/);
  });

  it.each([
    ['<a href="https://x.ai">Xai Labs</a> | AI Application Engineer + Product Engineer | San Francisco (hybrid / remote available) | VISA | $80-120K USD (Negotiable)<p>We are hiring engineers to build agent products.</p>',
      { title: "AI Application Engineer + Product Engineer", remote: true, salary: { min: 80000, max: 120000, currency: "USD", period: "year" } }],
    ["StartupHakk | AI Engineer Apprentice | Remote (UT or ID residents only) | Full-time | $7.25–$10/hr | startuphakk.com/jobs<p>Learn to build AI apps with mentors.</p>",
      { company: "StartupHakk", title: "AI Engineer Apprentice", remote: true, salary: { min: 7.25, max: 10, period: "hour" } }],
    ["Mastra | AI Engineer | REMOTE (AMER or EMEA time zones) | Full-time<p>Open-source TypeScript agent framework. We need people who love DX.</p>",
      { company: "Mastra", title: "AI Engineer", remote: true, salary: null }],
  ])("parses real HN headers (%#)", (comment_text, expected) => {
    const j = mapHnComment({ objectID: "1", parent_id: 0, story_id: 0, author: "a", created_at: "2026-10-12T21:00:23Z", comment_text }, "Ask HN: Who is hiring? (October 2026)");
    expect(j).toMatchObject(expected);
  });

  it("picks the role that matches the search when a posting lists several", () => {
    const c = { objectID: "2", parent_id: 0, story_id: 0, author: "a", created_at: "2026-10-12T21:00:23Z",
      comment_text: "Irash Tech | Business Development Manager | AI Engineer | REMOTE (Worldwide)<p>We build RAG products with Python and LLMs.</p>" };
    expect(mapHnComment(c, "Ask HN", "ai engineer")!.title).toBe("AI Engineer");
    expect(mapHnComment(c, "Ask HN")!.title).toBe("Business Development Manager");
  });

  it("ranks postings whose title matches the search first", () => {
    const sales = job({ id: "s", title: "Sales Manager", description: "Python, LLMs, RAG" });
    const eng = job({ id: "e", title: "AI Engineer", description: "Python, LLMs, Kubernetes, Go" });
    const { ranked } = rankForProfile([sales, eng], ["Python", "LLMs", "RAG"], "ai engineer");
    expect(ranked[0].job.id).toBe("e");
  });

  it("maps Remotive fields and strips HTML", () => {
    const j = mapRemotive({
      id: 7, url: "https://remotive.com/7", title: "LLM Engineer", company_name: "Beta", tags: ["python"],
      publication_date: "2026-10-15T08:00:00", candidate_required_location: "Europe", salary: "$100k - $130k",
      description: "<p>Ship <b>RAG</b> features</p><ul><li>Python</li></ul>",
    });
    expect(j.description).toBe("Ship RAG features\n\n- Python");
    expect(j.salary).toMatchObject({ min: 100000, max: 130000, currency: "USD" });
    expect(j.postedAt).toBe("2026-10-15T08:00:00.000Z");
  });

  it("decodes entities", () => {
    expect(htmlToText("R&amp;D &#x2F; 5&euro;")).toBe("R&D / 5€");
  });
});

describe("analysis", () => {
  const jobs = [
    job({ id: "a", title: "AI Engineer", description: "Python, LLMs, RAG, AWS", salary: { min: 60000, max: 80000, currency: "EUR", period: "year" } }),
    job({ id: "b", title: "Python Backend Engineer", description: "Python, FastAPI, PostgreSQL, Docker", salary: { min: 50000, max: 60000, currency: "EUR", period: "year" } }),
    job({ id: "c", title: "ML Engineer", description: "PyTorch, Kubernetes, Python", remote: false, salary: { min: 4000, max: 5000, currency: "EUR", period: "month" } }),
    job({ id: "d", title: "Frontend Engineer", description: "React, TypeScript, Next.js" }),
  ];

  it("summarises skills, remote share and salaries", () => {
    const s = marketSnapshot(jobs);
    expect(s.topSkills[0]).toMatchObject({ skill: "Python", count: 3 });
    expect(s.remote).toEqual({ yes: 3, no: 1, unknown: 0 });
    expect(s.salaries[0]).toMatchObject({ currency: "EUR", n: 3, median: 55000 });
  });

  it("ranks by weighted overlap and reports gaps", () => {
    const { ranked, gaps } = rankForProfile(jobs, ["Python", "LLMs", "RAG", "AWS", "FastAPI", "Docker"]);
    expect(ranked[0].job.id).toBe("a");
    expect(ranked[0].score).toBe(100);
    expect(ranked.at(-1)!.job.id).toBe("d");
    expect(gaps.map((g) => g.skill)).toContain("PostgreSQL");
  });
});

describe("searchJobs", () => {
  beforeEach(() => { vi.unstubAllGlobals(); seen.clear(); });

  it("merges sources, keeps going when one fails, and remembers ids", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("remotive.com")) {
        return new Response(JSON.stringify({ jobs: [
          { id: 1, url: "https://r/1", title: "AI Engineer", company_name: "Gamma", tags: [], publication_date: new Date().toISOString(), candidate_required_location: "Europe", description: "Python agents and RAG" },
          { id: 2, url: "https://r/2", title: "Sales Rep", company_name: "Gamma", tags: [], publication_date: new Date().toISOString(), candidate_required_location: "USA", description: "Sell things" },
        ] }));
      }
      if (url.includes("arbeitnow")) return new Response("boom", { status: 500 });
      if (url.includes("search_by_date")) return new Response(JSON.stringify({ hits: [{ objectID: "900", title: "Ask HN: Who is hiring? (October 2026)", created_at: "2026-10-01" }] }));
      if (url.includes("hn.algolia.com/api/v1/search")) {
        return new Response(JSON.stringify({ hits: [
          { objectID: "901", parent_id: 900, story_id: 900, author: "a", created_at: new Date().toISOString(), comment_text: "Delta | AI Engineer | REMOTE (Europe) | €90k<p>LLM agents with Python and MCP servers. Apply at delta.dev/jobs</p>" },
          { objectID: "902", parent_id: 901, story_id: 900, author: "b", created_at: new Date().toISOString(), comment_text: "Is this open to juniors? Asking because the AI engineer role sounds great" },
        ] }));
      }
      throw new Error("unexpected " + url);
    }));

    const { jobs, perSource } = await searchJobs({ query: "ai engineer", location: "Barcelona", maxAgeDays: 30 });
    expect(jobs.map((j) => j.id).sort()).toEqual(["hn:901", "remotive:1"]);
    expect(perSource.find((p) => p.source === "arbeitnow")?.error).toMatch(/500/);
    expect(perSource.find((p) => p.source === "adzuna")?.skipped).toMatch(/ADZUNA_APP_ID/);
    expect(seen.has("hn:901")).toBe(true);
  });
});
