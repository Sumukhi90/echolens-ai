export type DemoEvidence = {
  excerpt: string;
  speaker: string;
  timestamp: string;
  segment_id: number;
  meeting_id: number;
  meeting_title: string;
};

type DemoSegment = {
  id: number;
  timestamp: string;
  duration_seconds: number | null;
  speaker: string;
  text: string;
};

type DemoFinding = {
  text: string;
  evidence: DemoEvidence;
};

type DemoDecision = DemoFinding & {
  id: number;
  classification: "confirmed" | "suggestion";
};

export type DemoAction = {
  id: number;
  meeting_id: number;
  meeting_title: string;
  task: string;
  owner: string;
  due_date: string;
  status: string;
  evidence: DemoEvidence;
};

export type DemoMeeting = {
  id: number;
  title: string;
  meeting_date: string;
  source_filename: string;
  processing_status: "ready";
  created_at: string;
  segment_count: number;
  action_count: number;
  transcript: string;
  segments: DemoSegment[];
  summary: {
    overview: string;
    topics: string[];
    discussion_points: DemoFinding[];
    decisions: DemoDecision[];
    unresolved_questions: DemoFinding[];
    follow_ups: Array<Omit<DemoAction, "id" | "meeting_id" | "meeting_title" | "status">>;
    risks_and_blockers: DemoFinding[];
    mode: "local deterministic analysis";
  };
  decisions: DemoDecision[];
  action_items: DemoAction[];
};

const evidence = (
  meeting_id: number,
  meeting_title: string,
  segment: DemoSegment,
): DemoEvidence => ({
  excerpt: segment.text,
  speaker: segment.speaker,
  timestamp: segment.timestamp,
  segment_id: segment.id,
  meeting_id,
  meeting_title,
});

function createMeeting(
  id: number,
  title: string,
  meeting_date: string,
  lines: Array<{ speaker: string; text: string }>,
  topics: string[],
  decisionLines: Array<{ segment: number; classification: "confirmed" | "suggestion" }>,
  followUps: Array<{ segment: number; owner: string; due_date: string }>,
  openQuestionLines: number[],
  blockerLines: number[],
): DemoMeeting {
  const segments: DemoSegment[] = lines.map((line, index) => ({
    id: id * 100 + index + 1,
    timestamp: "",
    duration_seconds: null,
    speaker: line.speaker,
    text: line.text,
  }));
  const sourceFor = (index: number) => evidence(id, title, segments[index]);
  const decisions = decisionLines.map(({ segment, classification }, index) => ({
    id: id * 1000 + index + 1,
    text: segments[segment].text,
    classification,
    evidence: sourceFor(segment),
  }));
  const action_items = followUps.map(({ segment, owner, due_date }, index) => ({
    id: id * 10000 + index + 1,
    meeting_id: id,
    meeting_title: title,
    task: segments[segment].text,
    owner,
    due_date,
    status: "open" as const,
    evidence: sourceFor(segment),
  }));
  const discussion_points = segments
    .filter((segment) => segment.text.length > 20)
    .map((segment) => ({
      text: segment.text,
      evidence: sourceFor(segments.indexOf(segment)),
    }))
    .slice(0, 6);
  const unresolved_questions = openQuestionLines.map((segment) => ({
    text: segments[segment].text,
    evidence: sourceFor(segment),
  }));
  const risks_and_blockers = blockerLines.map((segment) => ({
    text: segments[segment].text,
    evidence: sourceFor(segment),
  }));

  return {
    id,
    title,
    meeting_date,
    source_filename: "echolens-demo.txt",
    processing_status: "ready",
    created_at: `${meeting_date}T12:00:00`,
    segment_count: segments.length,
    action_count: action_items.length,
    transcript: lines.map((line) => `${line.speaker}: ${line.text}`).join("\n"),
    segments,
    summary: {
      overview: discussion_points[0]?.text ?? "No discussion was available.",
      topics,
      discussion_points,
      decisions,
      unresolved_questions,
      follow_ups: action_items.map(({ task, owner, due_date, evidence: source }) => ({
        task,
        owner,
        due_date,
        evidence: source,
      })),
      risks_and_blockers,
      mode: "local deterministic analysis",
    },
    decisions,
    action_items,
  };
}

export const DEMO_MEETINGS: DemoMeeting[] = [
  createMeeting(
    1,
    "Product planning — Q3 onboarding",
    "2026-10-28",
    [
      { speaker: "Maya", text: "We reviewed the onboarding drop-off and agreed to simplify the first-run checklist." },
      { speaker: "Leo", text: "I will prepare a revised checklist by Friday." },
      { speaker: "Maya", text: "Maybe we could add a guided tour later, but let's test the checklist first." },
      { speaker: "Leo", text: "The analytics event names are still unclear, and we need to clarify ownership." },
      { speaker: "Maya", text: "We decided to run the checklist test with the next cohort." },
    ],
    ["onboarding", "checklist", "analytics", "guided tour"],
    [
      { segment: 0, classification: "confirmed" },
      { segment: 2, classification: "suggestion" },
      { segment: 4, classification: "confirmed" },
    ],
    [
      { segment: 1, owner: "Leo", due_date: "by Friday" },
      { segment: 3, owner: "", due_date: "" },
    ],
    [3],
    [3],
  ),
  createMeeting(
    2,
    "Customer research synthesis",
    "2026-10-24",
    [
      { speaker: "Nina", text: "Three interview participants mentioned setup friction during their first session." },
      { speaker: "Omar", text: "I will share the interview clips tomorrow." },
      { speaker: "Nina", text: "We agreed to review the setup flow before changing the help center." },
      { speaker: "Omar", text: "The migration timeline could be a risk if the event schema changes." },
    ],
    ["customer research", "setup friction", "interviews", "migration"],
    [{ segment: 2, classification: "confirmed" }],
    [
      { segment: 1, owner: "Omar", due_date: "tomorrow" },
      { segment: 2, owner: "", due_date: "" },
    ],
    [],
    [3],
  ),
];

const STOP_WORDS = new Set([
  "about", "after", "all", "and", "are", "did", "does", "for", "from", "how",
  "into", "is", "it", "maybe", "our", "please", "said", "that", "the", "their",
  "them", "there", "this", "was", "what", "when", "where", "which", "who", "with",
  "would", "you", "your",
]);

function words(value: string): Set<string> {
  return new Set(
    value.toLocaleLowerCase().match(/[a-z0-9'-]{3,}/g)?.filter((word) => !STOP_WORDS.has(word)) ?? [],
  );
}

function eligibleMeetings(params: URLSearchParams, meetingIds?: number[]): DemoMeeting[] {
  const ids = meetingIds ?? params.getAll("meeting_ids").map(Number).filter(Number.isFinite);
  const dateFrom = params.get("date_from") || "";
  const dateTo = params.get("date_to") || "";
  return DEMO_MEETINGS.filter((meeting) =>
    (!ids.length || ids.includes(meeting.id))
    && (!dateFrom || meeting.meeting_date >= dateFrom)
    && (!dateTo || meeting.meeting_date <= dateTo),
  );
}

function answerQuestion(question: string, meetings: DemoMeeting[]) {
  const queryTerms = words(question);
  const expandedTerms = new Set(queryTerms);
  const lowerQuestion = question.toLocaleLowerCase();
  if (/\b(who|owner|assigned|responsible)\b/.test(lowerQuestion)) {
    ["prepare", "send", "share", "assigned", "owner"].forEach((term) => expandedTerms.add(term));
  }
  if (/\b(decid|decision|agree|agreed)\w*\b/.test(lowerQuestion)) {
    ["decided", "agreed", "approved", "confirmed"].forEach((term) => expandedTerms.add(term));
  }
  if (/\b(risk|blocker|blocked|problem)\w*\b/.test(lowerQuestion)) {
    ["risk", "blocker", "blocked", "unclear"].forEach((term) => expandedTerms.add(term));
  }
  if (/\b(unresolved|remain|unclear|open question)\b/.test(lowerQuestion)) {
    ["unclear", "clarify", "question"].forEach((term) => expandedTerms.add(term));
  }

  const ranked = meetings.flatMap((meeting) =>
    meeting.segments.map((segment) => {
      const segmentTerms = words(segment.text);
      const overlap = [...expandedTerms].filter((term) =>
        [...segmentTerms].some((candidate) =>
          candidate === term || candidate.startsWith(term) || term.startsWith(candidate),
        ),
      );
      return { meeting, segment, score: overlap.length };
    }),
  )
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .filter((item) => item.score >= 2)
    .slice(0, 5);

  if (!ranked.length) {
    return {
      answer: "The bundled sample transcripts do not contain enough evidence to answer this question.",
      supported: false,
      mode: "bundled demo evidence",
      notice: "This read-only demo searches only its bundled sample meetings. No backend or external AI service is contacted.",
      evidence: [],
    };
  }

  return {
    answer: "These exact excerpts are relevant to your question; review the source wording rather than treating this as a generated conclusion.",
    supported: true,
    mode: "bundled demo evidence",
    notice: "This read-only demo searches only its bundled sample meetings. No backend or external AI service is contacted.",
    evidence: ranked.map(({ meeting, segment }) => ({
      ...evidence(meeting.id, meeting.title, segment),
    })),
  };
}

function inspectClaim(meeting: DemoMeeting, claim: string) {
  const claimTerms = words(claim);
  const ranked = meeting.segments
    .map((segment) => ({
      segment,
      shared: [...claimTerms].filter((term) => words(segment.text).has(term)),
    }))
    .filter((item) => item.shared.length > 0)
    .sort((left, right) => right.shared.length - left.shared.length);
  const candidate = ranked[0];
  if (!candidate || candidate.shared.length < Math.max(1, Math.floor(claimTerms.size / 3))) {
    return {
      claim,
      classification: "insufficient_evidence",
      explanation: "No sufficiently relevant sample excerpt was found. Human review is recommended.",
      review_status: "unreviewed",
      evidence: null,
    };
  }
  const lower = candidate.segment.text.toLocaleLowerCase();
  const negated = /\b(not|never|no|didn't|doesn't|won't)\b/.test(lower);
  const tentative = /\b(maybe|perhaps|suggest|could|might|tentative)\b/.test(lower);
  const classification = negated
    ? "contradicted"
    : tentative
      ? "needs_human_review"
      : "supported";
  return {
    claim,
    classification,
    explanation: "This heuristic found overlapping terms in the excerpt. Review the full context; it is not a validated truth or hallucination detector.",
    review_status: "unreviewed",
    evidence: evidence(meeting.id, meeting.title, candidate.segment),
  };
}

export function getDemoApiResponse(path: string, init?: RequestInit): unknown {
  const url = new URL(path, "https://demo.invalid");
  const method = (init?.method ?? "GET").toLocaleUpperCase();
  const pathname = url.pathname;
  const readOnlyError = () => {
    throw new Error("This public portfolio demo is read-only and does not accept uploads or changes.");
  };

  if (method === "GET" && pathname === "/api/meetings") {
    return DEMO_MEETINGS.map(({ transcript: _transcript, segments: _segments, summary: _summary, decisions: _decisions, action_items: _actions, ...item }) => item);
  }
  if (method === "GET" && pathname === "/api/settings/provider") {
    return {
      mode: "public_demo",
      provider: null,
      configured: false,
      live_ai_enabled: false,
      model: null,
      semantic_search_enabled: false,
      semantic_search_requested: false,
      semantic_search_available: false,
      semantic_model: "disabled",
      audio_transcription_available: false,
      privacy: "This public demo contains only bundled sample data. It does not store personal data or contact an application API.",
    };
  }
  if (method === "GET" && pathname === "/api/search") {
    const query = (url.searchParams.get("q") ?? "").trim().toLocaleLowerCase();
    if (!query) return [];
    const meetingId = Number(url.searchParams.get("meeting_id"));
    const dateFrom = url.searchParams.get("date_from") || "";
    const dateTo = url.searchParams.get("date_to") || "";
    const sortBy = url.searchParams.get("sort_by");
    const results = DEMO_MEETINGS.filter((meeting) =>
      (!Number.isFinite(meetingId) || meetingId <= 0 || meeting.id === meetingId)
      && (!dateFrom || meeting.meeting_date >= dateFrom)
      && (!dateTo || meeting.meeting_date <= dateTo)
      && (`${meeting.title}\n${meeting.transcript}`).toLocaleLowerCase().includes(query),
    );
    if (sortBy === "title") results.sort((left, right) => left.title.localeCompare(right.title));
    else results.sort((left, right) => right.meeting_date.localeCompare(left.meeting_date));
    return results.map(({ transcript: _transcript, segments: _segments, summary: _summary, decisions: _decisions, action_items: _actions, ...item }) => item);
  }
  if (method === "GET" && pathname === "/api/actions") {
    const status = url.searchParams.get("status");
    const query = (url.searchParams.get("q") ?? "").toLocaleLowerCase();
    return DEMO_MEETINGS.flatMap((meeting) => meeting.action_items)
      .filter((action) =>
        (!status || status === "open" || status === "pending")
        && (!query || `${action.task} ${action.owner} ${action.meeting_title}`.toLocaleLowerCase().includes(query)),
      );
  }
  if (method === "GET" && pathname === "/api/analytics") {
    const params = url.searchParams;
    const meetings = DEMO_MEETINGS.filter((meeting) =>
      (!params.get("date_from") || meeting.meeting_date >= params.get("date_from")!)
      && (!params.get("date_to") || meeting.meeting_date <= params.get("date_to")!),
    );
    const speakers = new Map<string, number>();
    const topics = new Map<string, Set<number>>();
    for (const meeting of meetings) {
      for (const segment of meeting.segments) {
        if (segment.speaker) speakers.set(segment.speaker, (speakers.get(segment.speaker) ?? 0) + 1);
      }
      for (const topic of meeting.summary.topics) {
        const key = topic.toLocaleLowerCase();
        if (!topics.has(key)) topics.set(key, new Set());
        topics.get(key)!.add(meeting.id);
      }
    }
    return {
      meeting_count: meetings.length,
      speaker_participation: [...speakers].map(([speaker, segment_count]) => ({ speaker, segment_count })),
      speaking_time: { available: false, reason: "Bundled sample transcripts do not include speaker-attributed durations." },
      frequent_topics: [...topics].map(([topic, ids]) => ({ topic, meeting_count: ids.size })),
      topic_trends: meetings.map((meeting) => ({
        meeting_id: meeting.id,
        meeting_title: meeting.title,
        meeting_date: meeting.meeting_date,
        topics: meeting.summary.topics,
      })),
      recurring_blockers: [],
      unresolved_questions: meetings.flatMap((meeting) =>
        meeting.summary.unresolved_questions.map((item) => ({
          meeting_id: meeting.id,
          meeting_title: meeting.title,
          text: item.text,
          evidence: item.evidence,
        })),
      ),
    };
  }
  if (pathname.startsWith("/api/meetings/")) {
    const [, , , rawId, action] = pathname.split("/");
    const meeting = DEMO_MEETINGS.find((item) => item.id === Number(rawId));
    if (!meeting) throw new Error("Sample meeting not found.");
    if (!action && method === "GET") return meeting;
    if (action === "ask" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { question?: string };
      return answerQuestion(body.question ?? "", [meeting]);
    }
  }
  if (method === "POST" && pathname === "/api/ask") {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      question?: string;
      meeting_ids?: number[];
      date_from?: string | null;
      date_to?: string | null;
    };
    const params = new URLSearchParams();
    if (body.date_from) params.set("date_from", body.date_from);
    if (body.date_to) params.set("date_to", body.date_to);
    return answerQuestion(body.question ?? "", eligibleMeetings(params, body.meeting_ids));
  }
  if (method === "POST" && pathname.startsWith("/api/meetings/") && pathname.endsWith("/inspect")) {
    const meetingId = Number(pathname.split("/")[3]);
    const meeting = DEMO_MEETINGS.find((item) => item.id === meetingId);
    if (!meeting) throw new Error("Sample meeting not found.");
    const body = JSON.parse(String(init?.body ?? "{}")) as { claim?: string };
    return inspectClaim(meeting, body.claim ?? "");
  }
  return readOnlyError();
}

function safeCsv(value: string): string {
  const text = String(value ?? "");
  return /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function downloadFile(filename: string, content: string, contentType: string): void {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadDemoMeeting(meeting: DemoMeeting, format: "markdown" | "txt" | "csv"): void {
  if (format === "csv") {
    const lines = [
      ["Task", "Owner", "Due date", "Status", "Evidence"].map(safeCsv),
      ...meeting.action_items.map((action) => [
        action.task, action.owner, action.due_date, action.status, action.evidence.excerpt,
      ].map(safeCsv)),
    ];
    downloadFile(`meeting-${meeting.id}-actions.csv`, lines.map((row) => row.map(quoteCsv).join(",")).join("\r\n"), "text/csv;charset=utf-8");
    return;
  }
  const heading = format === "markdown" ? "## " : "";
  const body = [
    `${format === "markdown" ? "# " : ""}${meeting.title}`,
    `Date: ${meeting.meeting_date}`,
    "",
    `${heading}Overview`,
    meeting.summary.overview,
    "",
    `${heading}Key topics`,
    meeting.summary.topics.join(", "),
    "",
    `${heading}Decisions`,
    ...meeting.decisions.map((item) => `- [${item.classification}] ${item.text} — Evidence: “${item.evidence.excerpt}”`),
    "",
    `${heading}Action items`,
    ...meeting.action_items.map((item) => `- ${item.task} (Owner: ${item.owner || "Unassigned"}; Due: ${item.due_date || "Not specified"}) — Evidence: “${item.evidence.excerpt}”`),
    "",
    `${heading}Transcript`,
    meeting.transcript,
  ].join("\n");
  downloadFile(`meeting-${meeting.id}.${format === "markdown" ? "md" : "txt"}`, body, format === "markdown" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8");
}

export function downloadDemoActions(actions: DemoAction[]): void {
  const rows = [
    ["Meeting", "Task", "Owner", "Due date", "Status", "Evidence"].map(safeCsv),
    ...actions.map((action) => [
      action.meeting_title,
      action.task,
      action.owner,
      action.due_date,
      action.status,
      action.evidence.excerpt,
    ].map(safeCsv)),
  ];
  downloadFile("echolens-demo-actions.csv", rows.map((row) => row.map(quoteCsv).join(",")).join("\r\n"), "text/csv;charset=utf-8");
}

function quoteCsv(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
