// ─────────────────────────────────────────────────────────────────────────
//  Single source of truth for emanuel.antablin.com.
//  All copy is grounded in Emanuel's résumé / interview material — no
//  invented metrics, companies, or credentials.
// ─────────────────────────────────────────────────────────────────────────

export const identity = {
  name: "Emanuel Antablin",
  role: "AI Engineer",
  subRole: "Lead Software Engineer · Walmart Global Tech",
  location: "Irvine, California",
  email: "eantablin@protonmail.com",
  github: "https://github.com/eantablin",
  linkedin: "https://www.linkedin.com/in/eantablin",
  blog: "https://eantablin.github.io/blog",
  url: "https://emanuel.antablin.com",
};

export const hero = {
  kicker: "AI ENGINEER · AGENTIC SYSTEMS · LLM INFRASTRUCTURE",
  // rotating typed phrases under the name
  phrases: [
    "agentic systems that page SREs before humans notice",
    "RAG pipelines wired into production",
    "LLM infrastructure at enterprise scale",
    "AI that ships, not just demos",
  ],
  blurb:
    "I design and ship agentic AI, RAG, and LLM systems that run in production at Walmart Global Tech — across global logistics. The kind of AI that cuts incident response from hours to minutes and saves millions, not the kind that lives in a slide deck.",
};

export interface Stat {
  value: number;
  prefix?: string;
  suffix?: string;
  label: string;
  sub: string;
}

export const stats: Stat[] = [
  { value: 30, prefix: "<", suffix: " min", label: "Incident MTTR", sub: "down from ~4 hrs" },
  { value: 1, prefix: "$", suffix: "M+", label: "Saved per year", sub: "workflow automation" },
  { value: 40, suffix: "%", label: "Throughput lift", sub: "team velocity" },
  { value: 20, prefix: ">", suffix: "%", label: "Platform perf", sub: "global messaging path" },
];

export interface Pillar {
  id: string;
  index: string;
  title: string;
  tagline: string;
  body: string;
  points: string[];
  accent: string;
}

// "How I build intelligent systems" — the deep AI-expertise section.
export const pillars: Pillar[] = [
  {
    id: "agentic",
    index: "01",
    title: "Agentic AI",
    tagline: "Systems that observe, reason, and act — on their own.",
    body: "I build autonomous agents that close the loop: they watch live signals, reason over them with an LLM grounded in real context, and take action — paging the right humans with a pre-analyzed diagnosis instead of a bare alert.",
    points: [
      "Observe → reason → act loops (ReAct-style) with tool calling and planning",
      "Structured, reliable outputs through deliberate prompt design",
      "Confidence scoring + human-in-the-loop override on every decision",
      "Deployed across distribution-center server fleets at Walmart scale",
    ],
    accent: "#2ee6ff",
  },
  {
    id: "rag",
    index: "02",
    title: "Retrieval-Augmented Generation",
    tagline: "Grounding models in the truth that actually matters.",
    body: "Agents are only as good as the context they reason over. I wire RAG pipelines that turn operational systems — ServiceNow history, internal APIs, runbooks — into live, queryable knowledge the model can cite at inference time.",
    points: [
      "Chunk → embed → vector search → top-k retrieval → grounded generation",
      "ServiceNow tickets + internal APIs as real-time LLM knowledge sources",
      "Retrieval tuned against known incidents (cosine threshold, top-k)",
      "RAG over fine-tuning where data is dynamic and must stay current",
    ],
    accent: "#a855f7",
  },
  {
    id: "llm",
    index: "03",
    title: "LLMs as Infrastructure",
    tagline: "The intelligence lives in the pipeline, not the endpoint.",
    body: "I treat models as components, not products — reasoning engines wired into larger systems through clean interfaces, tool access, and the Model Context Protocol. Model-agnostic by design, swappable as the field moves.",
    points: [
      "Prompt engineering for deterministic, structured machine-readable output",
      "Model Context Protocol (MCP) for standardized tool + context access",
      "FastAPI services exposing models behind concurrent, async interfaces",
      "Provider-agnostic: hosted APIs or self-hosted, chosen per constraint",
    ],
    accent: "#36f9b3",
  },
  {
    id: "production",
    index: "04",
    title: "Production & Evaluation",
    tagline: "Demos are easy. Production is the job.",
    body: "A model that works in a notebook is the start, not the finish. I ship intelligence that survives contact with real traffic — measured, observable, containerized, and tuned against the failure modes that actually matter.",
    points: [
      "Precision/recall weighted for false-positive cost in high-stakes domains",
      "Per-host threshold tuning to keep agents trustworthy, not noisy",
      "Observability with Prometheus / OpenObserve; containerized on Docker + K8s",
      "Security baked in — OWASP Top 10 enforced across customer-facing services",
    ],
    accent: "#ff7ac6",
  },
];

export interface CaseStudy {
  id: string;
  tag: string;
  org: string;
  title: string;
  problem: string;
  built: string;
  result: string;
  metric: { value: string; label: string };
  stack: string[];
  accent: string;
}

export const caseStudies: CaseStudy[] = [
  {
    id: "agentic-monitoring",
    tag: "AGENTIC AI · SRE",
    org: "Walmart Global Tech",
    title: "Distributed Agentic Monitoring System",
    problem:
      "SRE teams discovered incidents reactively — paged with a bare alert, they still had to diagnose from scratch. The discover → escalate → troubleshoot loop ate hours of downtime.",
    built:
      "A fleet of autonomous agents across DC server infrastructure. Each watches its host (memory, CPU, storage), detects anomalies, writes diagnostic notes with an LLM, and pages SRE with a pre-analyzed summary — not just an alert.",
    result:
      "Engineers now arrive already knowing what's wrong. Idle discovery time was eliminated and incident response collapsed from a half-day to minutes.",
    metric: { value: "~4 hrs → <30 min", label: "Mean time to resolution" },
    stack: ["Agentic AI", "LLM", "Python", "Kubernetes", "Prometheus"],
    accent: "#2ee6ff",
  },
  {
    id: "rag-pipeline",
    tag: "RAG · KNOWLEDGE",
    org: "Walmart Global Tech",
    title: "RAG Knowledge Pipeline",
    problem:
      "The agents could detect anomalies but not diagnose them — they lacked the historical context, known failure patterns, and runbooks that make an alert actionable.",
    built:
      "A RAG pipeline that ingests ServiceNow ticket history and internal API data, chunks and embeds it, and makes it queryable by agents at inference time — retrieving the relevant past incidents to ground each diagnosis.",
    result:
      "Agents surface actionable findings instead of raw alerts, citing the historical signal behind every recommendation. The reasoning layer for the whole monitoring system.",
    metric: { value: "Real-time", label: "Operational context to every agent" },
    stack: ["RAG", "Vector Search", "FastAPI", "ServiceNow", "LLM"],
    accent: "#a855f7",
  },
  {
    id: "ptsd-model",
    tag: "APPLIED ML · NLP",
    org: "Founding Technical Lead · Stealth Startup",
    title: "PTSD Symptom-Analysis Model",
    problem:
      "Clinical PTSD symptom tracking is hard to scale. The goal: detect symptom signals automatically from language patterns in user input — applied ML with real human stakes.",
    built:
      "An end-to-end pipeline I owned from scratch — web-crawler data collection, cleaning and normalization, train/test set preparation, and training of a language-pattern-recognition model.",
    result:
      "A working, applied-research ML system where I owned the full stack: the data infrastructure and the model that ran on it, evaluated with false-positives treated as the cost that matters.",
    metric: { value: "10×", label: "Relevant sample size, via data pipeline" },
    stack: ["NLP", "SciKit-Learn", "Python", "Data Pipeline"],
    accent: "#36f9b3",
  },
  {
    id: "energy-model",
    tag: "ML · DATA ENGINEERING",
    org: "simuwatt",
    title: "Building Energy-Auditing Model",
    problem:
      "A PyTorch model to benchmark buildings and recommend cost-reduction improvements was starved for training data — and the existing data wasn't being fully used.",
    built:
      "The training-data infrastructure behind it: web-scraping pipelines, Python parsers that surfaced overlooked datasets, and Selenium QA automation — plus model-fitting alongside the Data Science lead.",
    result:
      "The model shipped and worked: data volume grew sharply and end-of-year user retention rose. A packed early-ML proof point in a four-month tenure.",
    metric: { value: "+20%", label: "User retention · +30% dataset" },
    stack: ["PyTorch", "pandas", "Selenium", "Python"],
    accent: "#ff7ac6",
  },
];

export interface SkillGroup {
  title: string;
  icon: string;
  skills: string[];
}

export const skillGroups: SkillGroup[] = [
  {
    title: "AI / ML",
    icon: "brain",
    skills: ["LLMs", "RAG", "Agentic AI", "Prompt Engineering", "MCP", "PyTorch", "SciKit-Learn", "TensorFlow", "pandas"],
  },
  {
    title: "Languages",
    icon: "code",
    skills: ["Python", "TypeScript", "JavaScript", "SQL", "Bash", "Go", "C++"],
  },
  {
    title: "Frameworks & Serving",
    icon: "stack",
    skills: ["FastAPI", "Flask", "React", "PostgreSQL", "MongoDB", "Prometheus"],
  },
  {
    title: "Cloud & Infra",
    icon: "cloud",
    skills: ["AWS", "Azure", "GCP", "Kubernetes", "Docker", "Jenkins", "Linux"],
  },
];

export interface TimelineItem {
  org: string;
  role: string;
  period: string;
  current?: boolean;
  points: string[];
}

export const timeline: TimelineItem[] = [
  {
    org: "Walmart Global Tech",
    role: "Lead Software Engineer",
    period: "2022 — Present",
    current: true,
    points: [
      "Deployed a distributed agentic monitoring system across DC server infrastructure; autonomous agents detect anomalies, log diagnostics, and page SREs with pre-analyzed findings.",
      "Engineered RAG pipelines integrating ServiceNow and internal APIs as live LLM knowledge sources.",
      "Led an enterprise agentic-AI initiative across global logistics, reporting architecture and outcomes to director-level stakeholders.",
      "Re-architected a legacy messaging platform's recipient resolution as concurrent FastAPI calls — >20% global gain, adopted across all North American distribution centers.",
      "Saved the division $1M+/yr by automating technician workflows (+40% throughput); enforced OWASP Top 10 across customer-facing services.",
    ],
  },
  {
    org: "Stealth Startup",
    role: "Founding Technical Lead",
    period: "2018 — 2022",
    points: [
      "Trained a language-pattern-recognition model as the core of an AI-led PTSD symptom-analysis pipeline.",
      "Built end-to-end data collection, cleaning, and training-set preparation from raw sources.",
      "Architected full-stack applications from requirements through deployment; owned the technical roadmap.",
      "Implemented OWASP Top 10 countermeasures and penetration testing across servers and web apps.",
    ],
  },
  {
    org: "simuwatt",
    role: "Software Engineer",
    period: "Aug — Dec 2018",
    points: [
      "Built scraping + parsing pipelines feeding a PyTorch energy-auditing model — expanded the dataset 30% and doubled viable in-house data.",
      "Automated QA and internal workflows with Selenium, freeing engineering time for model development.",
      "Contributed to model fitting with the Data Science lead — raised end-of-year retention +20%.",
    ],
  },
  {
    org: "Volunteer",
    role: "Computer Science Tutor",
    period: "2016 — Present",
    points: [
      "Teach C++ through Python OOP via pair programming, a structured syllabus, and project-based milestones.",
    ],
  },
];

export const education = {
  school: "Full Sail University",
  degree: "B.S. Computer Science — Salutatorian",
  detail: "Orlando, FL · 2018",
};

export interface Project {
  title: string;
  blurb: string;
  tags: string[];
}

export const projects: Project[] = [
  {
    title: "Mental State Recognition",
    blurb:
      "Applied-research NLP pipeline for PTSD symptom analysis — data collection through model training, owned end to end.",
    tags: ["NLP", "SciKit-Learn", "Data Pipeline"],
  },
  {
    title: "Weather Pattern Analysis",
    blurb:
      "Data-engineering pipeline: external API → ingestion → PostgreSQL → analysis. Clean, reproducible, queryable.",
    tags: ["Data Eng", "PostgreSQL", "Python"],
  },
  {
    title: "Titanic Passenger Risk Prediction",
    blurb:
      "Classic supervised-learning project showcasing feature engineering, model selection, and evaluation discipline.",
    tags: ["SciKit-Learn", "Classification"],
  },
];

// ── Arcade layer config ──────────────────────────────────────────────────
export const arcade = {
  // Banjo-Kazooie style collectathon: hidden golden "jiggies" across the page.
  jiggiesTotal: 5,
  // Rampage-style hidden mini-game.
  miniGameName: "MONOLITH SMASH",
};
