// ─────────────────────────────────────────────────────────────────────────
//  Case studies — grounded in Emanuel's résumé / interview material.
//  No invented metrics. Entries with `deep: true` get their own page at
//  /portfolio/<slug>; the rest render as complete cards on the index.
// ─────────────────────────────────────────────────────────────────────────

export interface CaseStudy {
  slug: string;
  deep: boolean;
  domain: string;
  org: string;
  title: string;
  metric: string;
  metricSub: string;
  problem: string;
  approach: string;
  impact: string;
  stack: string[];
  accent: string;
  /** deep-dive sections (only for deep: true) */
  detail?: { heading: string; body: string }[];
}

export const caseStudies: CaseStudy[] = [
  {
    slug: "agentic-monitoring",
    deep: true,
    domain: "Agentic AI",
    org: "Walmart Global Tech",
    title: "Distributed Agentic Monitoring System",
    metric: "4h → <30m",
    metricSub: "mean time to resolution",
    problem:
      "SRE teams discovered DC infrastructure incidents reactively — burning hours in the discover → escalate → troubleshoot chain before a human even understood what broke.",
    approach:
      "Deployed autonomous agents across server infrastructure that continuously track memory, CPU, and storage, detect anomalies, log diagnostic notes, and page SRE teams with pre-analyzed findings.",
    impact:
      "Idle discovery time eliminated. SREs now arrive at anomaly onset with full context — collapsing MTTR from ~4 hours to under 30 minutes.",
    stack: ["Python", "Multi-agent", "Anomaly Detection", "SRE", "Observability"],
    accent: "#2ee6ff",
    detail: [
      {
        heading: "The reactive loop that ate hours",
        body: "Before the system existed, an incident's life looked like this: something degrades on a distribution-center server, monitoring eventually trips a coarse threshold, a ticket gets cut, an SRE picks it up cold and starts diagnosing from scratch. The discovery and hand-off alone could burn most of the ~4-hour MTTR — the actual fix was rarely the slow part.",
      },
      {
        heading: "Agents that reason, not just alert",
        body: "The replacement is a distributed swarm of autonomous agents deployed across DC server infrastructure. Each agent tracks its host's memory, CPU, and storage utilization, and compares live state against historical baselines to detect anomalies. The key architectural choice: agents don't just fire an alert — they reason over the anomaly, write diagnostic notes, and page the SRE team with pre-analyzed findings attached.",
      },
      {
        heading: "Tuning out the noise",
        body: "False positives were managed with per-host-type threshold tuning, and agents log a confidence signal with each finding so SREs can calibrate trust and override when needed. Pages carry context, so even an imperfect diagnosis still saves the from-scratch investigation.",
      },
      {
        heading: "Outcome",
        body: "SREs are alerted at anomaly onset and arrive with full context instead of starting cold. MTTR collapsed from roughly 4 hours to under 30 minutes, and idle discovery time was eliminated entirely. The initiative was led across global logistics operations and reported to director-level stakeholders.",
      },
    ],
  },
  {
    slug: "rag-diagnostics",
    deep: true,
    domain: "RAG",
    org: "Walmart Global Tech",
    title: "RAG Diagnostics Pipeline",
    metric: "Real-time",
    metricSub: "context for every agent decision",
    problem:
      "Monitoring agents could see telemetry but lacked the operational and historical context to diagnose why something was failing.",
    approach:
      "Engineered retrieval-augmented pipelines integrating ServiceNow and internal APIs as LLM knowledge sources, surfacing real-time operational context and prior incident signal at inference time.",
    impact:
      "Agents reason over live operational state and institutional memory — producing diagnoses grounded in what's actually happening, not just raw metrics.",
    stack: ["RAG", "LLMs", "ServiceNow", "FastAPI", "Vector Retrieval"],
    accent: "#a855f7",
    detail: [
      {
        heading: "Detection without diagnosis is half a system",
        body: "The agentic monitoring layer could spot anomalies, but an anomaly without context is just a louder alarm. Diagnosing why a host is failing requires what experienced SREs carry in their heads: historical incidents, known failure patterns, runbooks. That institutional memory had to become queryable.",
      },
      {
        heading: "ServiceNow as a knowledge source",
        body: "The pipeline ingests ServiceNow ticket history and internal API data, chunks it — by ticket, then by resolution notes and symptom description — embeds it, and makes it retrievable at inference time. When an agent detects an anomaly, it queries with the current context (host, metrics, error signature) and retrieves the most relevant prior incidents and runbook snippets.",
      },
      {
        heading: "Retrieval quality is the product",
        body: "Top-k retrieval gated by a similarity threshold, validated against known historical incidents — if retrieval is wrong, the diagnosis is confidently wrong, which is worse than no diagnosis. RAG was the right call over fine-tuning here: incident data changes constantly, and re-indexing is cheap while re-training is not.",
      },
      {
        heading: "Outcome",
        body: "The LLM produces grounded, pre-analyzed diagnostic notes instead of generic summaries. Agents surface actionable findings with citations into the incident history — SREs arrive knowing what's wrong and what worked last time.",
      },
    ],
  },
  {
    slug: "ptsd-model",
    deep: true,
    domain: "Machine Learning",
    org: "Stealth Startup",
    title: "PTSD Symptom Analysis Model",
    metric: "End-to-end",
    metricSub: "raw data → trained model",
    problem:
      "An AI-led PTSD symptom analysis product needed a model that could recognize meaningful language patterns from messy, real-world input.",
    approach:
      "Trained a language pattern-recognition model and built the full pipeline around it — data collection, cleaning, and training-set preparation from raw sources.",
    impact:
      "Became the core of the analysis pipeline; architecture and decisions were documented for reproducibility and onboarding.",
    stack: ["NLP", "Data Pipelines", "Model Training", "Python"],
    accent: "#36f9b3",
    detail: [
      {
        heading: "Clinical signal in everyday language",
        body: "PTSD symptom tracking is hard to scale clinically. The product's bet was that language patterns in user input carry detectable symptom signals — if a model could recognize them reliably, screening could reach people a clinic never would.",
      },
      {
        heading: "Owning the whole pipeline",
        body: "This wasn't model work on a prepared dataset. The pipeline started at raw sources — web crawlers and manual collection — through cleaning and normalization, training/test set preparation, and finally model training for language pattern recognition. As founding technical lead, the data engineering and the model were the same job.",
      },
      {
        heading: "Evaluation where stakes are high",
        body: "In a mental-health domain, a false positive isn't a rounding error. Evaluation prioritized precision and recall trade-offs over raw accuracy, with the false-positive rate treated as the gating metric.",
      },
      {
        heading: "Outcome",
        body: "The model became the core of the AI-led symptom analysis pipeline. Architecture and pipeline decisions were documented for reproducibility, which made onboarding junior contributors possible — the system outlived any single person's memory of it.",
      },
    ],
  },
  {
    slug: "messaging-rearchitecture",
    deep: false,
    domain: "Platform",
    org: "Walmart Global Tech",
    title: "Messaging Platform Re-architecture",
    metric: "20%+",
    metricSub: "performance gain · every NA DC",
    problem:
      "A legacy messaging platform resolved recipients sequentially, creating a hard latency ceiling as the audience grew.",
    approach:
      "Re-architected recipient resolution as concurrent FastAPI calls, removing the serial bottleneck without changing the platform's external contract.",
    impact:
      "20%+ performance improvement, adopted across all North American distribution centers and supporting teams.",
    stack: ["FastAPI", "Concurrency", "Distributed Systems", "Performance"],
    accent: "#ffd25a",
  },
  {
    slug: "energy-auditing",
    deep: false,
    domain: "Machine Learning",
    org: "simuwatt",
    title: "Energy-Auditing Model & Data Pipeline",
    metric: "+30% data",
    metricSub: "training set · +20% retention",
    problem:
      "A PyTorch energy-auditing model — built to benchmark buildings and recommend cost reductions — was starved for quality training data.",
    approach:
      "Acquired and cleaned building-energy datasets via web-scraping pipelines and Python parsing; automated QA and user workflows with Selenium to free engineering time for modeling.",
    impact:
      "Expanded the training database 30%, doubled viable in-house data, and contributed to model fitting that raised year-end retention 20%.",
    stack: ["PyTorch", "Web Scraping", "Selenium", "Data Engineering"],
    accent: "#ff7ac6",
  },
];

export const deepStudies = caseStudies.filter((c) => c.deep);
export const studyBySlug = (slug: string) => caseStudies.find((c) => c.slug === slug);
