const UA = "jobscout-mcp/0.1 (+https://github.com/ianfloresfdez/jobscout-mcp)";

export async function fetchJson<T>(url: string, init: { timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(init.timeoutMs ?? 12_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} from ${new URL(url).host}${body ? `: ${body.slice(0, 160)}` : ""}`);
  }
  return (await res.json()) as T;
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#x27": "'", "#x2F": "/", "#47": "/",
  euro: "€", pound: "£", mdash: "—", ndash: "–", hellip: "…", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (ENTITIES[k] !== undefined) return ENTITIES[k];
    if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16));
    if (k.startsWith("#")) return String.fromCodePoint(parseInt(k.slice(1), 10));
    return m;
  });
}

/** Turns posting HTML into readable plain text: keeps paragraph and list breaks, drops tags. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr)>/gi, "\n")
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Lowercase, strip accents, collapse spaces: "Málaga, ESPAÑA" -> "malaga, espana". */
export function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

export function daysAgo(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.floor((now - t) / 86_400_000);
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Simple in-memory TTL cache so repeated tool calls in one conversation do not refetch. */
export class TtlCache<V> {
  private map = new Map<string, { at: number; value: V }>();
  constructor(private ttlMs: number) {}
  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > this.ttlMs) { this.map.delete(key); return undefined; }
    return hit.value;
  }
  set(key: string, value: V): void { this.map.set(key, { at: Date.now(), value }); }
}
