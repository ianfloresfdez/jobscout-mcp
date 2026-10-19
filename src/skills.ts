import { norm } from "./util.js";

/**
 * Canonical skill name -> patterns that count as a mention. Patterns run against normalised
 * text (lowercase, no accents) and are wrapped in word boundaries that allow symbols like + and #.
 */
export const SKILLS: Record<string, { group: SkillGroup; patterns: string[] }> = {
  // languages
  Python: { group: "language", patterns: ["python"] },
  TypeScript: { group: "language", patterns: ["typescript", "ts(?=,| |/|\\))"] },
  JavaScript: { group: "language", patterns: ["javascript", "js(?=,| |/|\\))", "es6"] },
  Java: { group: "language", patterns: ["java(?!script)"] },
  Kotlin: { group: "language", patterns: ["kotlin"] },
  Go: { group: "language", patterns: ["golang", "go(?= developer| engineer|,|/| \\(|lang)"] },
  Rust: { group: "language", patterns: ["rust"] },
  "C#": { group: "language", patterns: ["c#", "\\.net", "dotnet"] },
  "C++": { group: "language", patterns: ["c\\+\\+"] },
  PHP: { group: "language", patterns: ["php"] },
  Ruby: { group: "language", patterns: ["ruby"] },
  Scala: { group: "language", patterns: ["scala"] },
  Swift: { group: "language", patterns: ["swift"] },
  SQL: { group: "language", patterns: ["sql"] },
  // AI / ML
  LLMs: { group: "ai", patterns: ["llms?", "large language models?", "gpt-?\\d", "generative ai", "genai", "gen ai"] },
  "AI agents": { group: "ai", patterns: ["ai agents?", "agentic", "(llm|langgraph|autonomous|coding|tool-using) agents?", "multi-agent", "agent (framework|orchestration|workflows?)s?"] },
  RAG: { group: "ai", patterns: ["rag", "retrieval[- ]augmented"] },
  MCP: { group: "ai", patterns: ["mcp", "model context protocol"] },
  LangChain: { group: "ai", patterns: ["langchain"] },
  LangGraph: { group: "ai", patterns: ["langgraph"] },
  LlamaIndex: { group: "ai", patterns: ["llamaindex", "llama index"] },
  "OpenAI API": { group: "ai", patterns: ["openai"] },
  Claude: { group: "ai", patterns: ["claude", "anthropic"] },
  "Vector databases": { group: "ai", patterns: ["vector (db|database|store|search)s?", "pinecone", "weaviate", "qdrant", "pgvector", "chroma(db)?", "milvus"] },
  Embeddings: { group: "ai", patterns: ["embeddings?"] },
  Evals: { group: "ai", patterns: ["evals?", "evaluation (framework|harness|pipeline)s?", "llm evaluation"] },
  "Prompt engineering": { group: "ai", patterns: ["prompt engineering", "context engineering"] },
  "Fine-tuning": { group: "ai", patterns: ["fine[- ]?tun(e|ing)", "lora", "rlhf"] },
  PyTorch: { group: "ai", patterns: ["pytorch", "torch"] },
  TensorFlow: { group: "ai", patterns: ["tensorflow", "keras"] },
  "Hugging Face": { group: "ai", patterns: ["hugging ?face", "transformers"] },
  "Machine learning": { group: "ai", patterns: ["machine learning", "\\bml\\b", "deep learning"] },
  MLOps: { group: "ai", patterns: ["mlops", "mlflow", "kubeflow"] },
  "Computer vision": { group: "ai", patterns: ["computer vision", "\\bocr\\b", "opencv"] },
  NLP: { group: "ai", patterns: ["nlp", "natural language processing"] },
  // backend frameworks
  FastAPI: { group: "backend", patterns: ["fastapi"] },
  Django: { group: "backend", patterns: ["django"] },
  Flask: { group: "backend", patterns: ["flask"] },
  "Node.js": { group: "backend", patterns: ["node\\.?js", "node(?= |,|/)"] },
  NestJS: { group: "backend", patterns: ["nestjs", "nest\\.js"] },
  Express: { group: "backend", patterns: ["express(\\.js)?(?= |,|/)"] },
  Laravel: { group: "backend", patterns: ["laravel"] },
  Symfony: { group: "backend", patterns: ["symfony"] },
  Spring: { group: "backend", patterns: ["spring( boot)?"] },
  Rails: { group: "backend", patterns: ["rails", "ruby on rails"] },
  GraphQL: { group: "backend", patterns: ["graphql"] },
  gRPC: { group: "backend", patterns: ["grpc"] },
  Kafka: { group: "backend", patterns: ["kafka"] },
  Celery: { group: "backend", patterns: ["celery"] },
  // frontend
  React: { group: "frontend", patterns: ["react(\\.js|js)?(?! native)"] },
  "React Native": { group: "frontend", patterns: ["react native"] },
  "Next.js": { group: "frontend", patterns: ["next\\.?js"] },
  Vue: { group: "frontend", patterns: ["vue(\\.js|js)?", "nuxt"] },
  Angular: { group: "frontend", patterns: ["angular"] },
  Svelte: { group: "frontend", patterns: ["svelte(kit)?"] },
  Tailwind: { group: "frontend", patterns: ["tailwind"] },
  // data
  PostgreSQL: { group: "data", patterns: ["postgres(ql)?"] },
  MySQL: { group: "data", patterns: ["mysql", "mariadb"] },
  MongoDB: { group: "data", patterns: ["mongo(db)?"] },
  Redis: { group: "data", patterns: ["redis"] },
  Elasticsearch: { group: "data", patterns: ["elastic ?search", "opensearch"] },
  Spark: { group: "data", patterns: ["spark", "pyspark", "databricks"] },
  Airflow: { group: "data", patterns: ["airflow", "dagster", "prefect"] },
  dbt: { group: "data", patterns: ["dbt"] },
  Snowflake: { group: "data", patterns: ["snowflake", "bigquery", "redshift"] },
  Pandas: { group: "data", patterns: ["pandas", "numpy", "polars"] },
  // cloud / infra
  AWS: { group: "infra", patterns: ["aws", "amazon web services", "lambda", "bedrock", "sagemaker"] },
  GCP: { group: "infra", patterns: ["gcp", "google cloud", "vertex ai"] },
  Azure: { group: "infra", patterns: ["azure"] },
  Docker: { group: "infra", patterns: ["docker", "containers?"] },
  Kubernetes: { group: "infra", patterns: ["kubernetes", "k8s", "helm"] },
  Terraform: { group: "infra", patterns: ["terraform", "pulumi", "infrastructure as code", "\\biac\\b"] },
  "CI/CD": { group: "infra", patterns: ["ci/cd", "github actions", "gitlab ci", "jenkins", "circleci"] },
  Linux: { group: "infra", patterns: ["linux", "bash"] },
  // practices
  Testing: { group: "practice", patterns: ["tdd", "unit tests?", "pytest", "jest", "vitest", "test automation"] },
  Playwright: { group: "practice", patterns: ["playwright", "cypress", "selenium"] },
  Microservices: { group: "practice", patterns: ["microservices?"] },
  "System design": { group: "practice", patterns: ["system design", "distributed systems?", "scalab(le|ility)"] },
};

export type SkillGroup = "language" | "ai" | "backend" | "frontend" | "data" | "infra" | "practice";

const COMPILED: Array<{ name: string; re: RegExp }> = Object.entries(SKILLS).map(([name, { patterns }]) => ({
  name,
  re: new RegExp(`(?<![a-z0-9+#.])(?:${patterns.join("|")})(?![a-z0-9+#])`, "i"),
}));

/** Canonical skills mentioned in a text, in dictionary order. */
export function extractSkills(text: string): string[] {
  const t = norm(text);
  return COMPILED.filter(({ re }) => re.test(t)).map(({ name }) => name);
}

/** Maps free-form skills the user typed ("react.js", "LLM", "aws lambda") onto canonical names. */
export function canonicalizeSkills(input: string[]): { known: string[]; unknown: string[] } {
  const known = new Set<string>();
  const unknown: string[] = [];
  for (const raw of input) {
    const s = raw.trim();
    if (!s) continue;
    const exact = Object.keys(SKILLS).find((k) => norm(k) === norm(s));
    if (exact) { known.add(exact); continue; }
    const hits = extractSkills(s);
    if (hits.length) hits.forEach((h) => known.add(h));
    else unknown.push(s);
  }
  return { known: [...known], unknown };
}

export function skillGroup(name: string): SkillGroup | null {
  return SKILLS[name]?.group ?? null;
}
