import {
  DEMO_MEETINGS,
  DemoAction,
  DemoEvidence,
  DemoMeeting,
} from "./demo-data";

const STORAGE_KEY = "echolens.browser-workspace.v1";
const MAX_TRANSCRIPT_BYTES = 2 * 1024 * 1024;
const MAX_STORED_BYTES = 3.5 * 1024 * 1024;
const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "because", "been", "before",
  "being", "but", "can", "could", "did", "does", "during", "each", "for", "from",
  "get", "had", "has", "have", "here", "how", "into", "its", "just", "like", "make",
  "more", "most", "not", "our", "out", "please", "said", "she", "should", "that",
  "the", "their", "them", "then", "there", "they", "this", "those", "through", "was",
  "what", "when", "where", "which", "who", "will", "with", "would", "you", "your",
]);
const ACTION_RE = /\b(?:will|need to|needs to|action item|follow up|follow-up|send|share|prepare|create|schedule|review|update|deliver|own|assigned to)\b/i;
const DECISION_RE = /\b(?:decided|agreed|approved|confirmed|we will|we'll)\b/i;
const TENTATIVE_RE = /\b(?:maybe|perhaps|suggest|suggestion|could|might|tentative)\b/i;
const OWNER_RE = /\b(?:assigned to|owner is|owned by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/;
const FIRST_PERSON_RE = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?):\s*(?:I will|I'll)\b/;
const DATE_RE = /\b(?:by|due|before)\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|today|tomorrow|next week|next month|20\d{2}-\d{2}-\d{2})\b/i;

type ParsedSegment = {
  timestamp: string;
  duration_seconds: number | null;
  speaker: string;
  text: string;
};

function cloneFixtures(): DemoMeeting[] {
  return JSON.parse(JSON.stringify(DEMO_MEETINGS)) as DemoMeeting[];
}

export async function readBrowserFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("Could not read this file as text."));
    reader.onerror = () => reject(new Error("Could not read this file as text."));
    reader.readAsText(file, "UTF-8");
  });
}

function saveMeetings(meetings: DemoMeeting[]): void {
  const serialized = JSON.stringify(meetings);
  if (new TextEncoder().encode(serialized).byteLength > MAX_STORED_BYTES) {
    throw new Error("Browser storage is full. Export or remove meetings before importing more.");
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    throw new Error(
      error instanceof DOMException && error.name === "QuotaExceededError"
        ? "Browser storage is full. Export or remove meetings before importing more."
        : "Could not save this workspace in browser storage.",
    );
  }
}

function loadMeetings(): DemoMeeting[] {
  if (typeof window === "undefined") {
    throw new Error("The browser workspace is available only in a browser.");
  }
  let serialized: string | null;
  try {
    serialized = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    throw new Error("Browser storage is unavailable. Enable site storage to use this workspace.");
  }
  if (serialized === null) {
    const fixtures = cloneFixtures();
    saveMeetings(fixtures);
    return fixtures;
  }
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!Array.isArray(parsed) || !parsed.every(isMeeting)) {
      throw new Error("Stored meeting data has an unexpected shape.");
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `Could not read the saved browser workspace: ${error instanceof Error ? error.message : "invalid data"}`,
    );
  }
}

function isMeeting(value: unknown): value is DemoMeeting {
  return typeof value === "object" && value !== null
    && "id" in value && typeof value.id === "number"
    && "title" in value && typeof value.title === "string"
    && "transcript" in value && typeof value.transcript === "string"
    && "segments" in value && Array.isArray(value.segments)
    && "summary" in value && typeof value.summary === "object";
}

function tokenize(value: string): Set<string> {
  return new Set(
    value.toLocaleLowerCase().match(/[a-z0-9'-]{3,}/g)?.filter((word) => !STOP_WORDS.has(word)) ?? [],
  );
}

function timeSeconds(value: string): number {
  const parts = value.split(":");
  const seconds = Number.parseFloat(parts.pop() ?? "0");
  const minutes = Number.parseInt(parts.pop() ?? "0", 10);
  const hours = Number.parseInt(parts.pop() ?? "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

function parseTranscript(filename: string, text: string): ParsedSegment[] {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (!["txt", "md", "vtt"].includes(extension ?? "")) {
    throw new Error("Unsupported file type. Browser mode supports TXT, Markdown, and WebVTT.");
  }
  if (new TextEncoder().encode(text).byteLength > MAX_TRANSCRIPT_BYTES) {
    throw new Error("Transcript exceeds the 2 MB upload limit.");
  }
  if (!text.trim()) throw new Error("Transcript file is empty.");

  const segments: ParsedSegment[] = [];
  const timestampPattern = /(?:(\d{1,2}:)?\d{2}:\d{2}(?:\.\d{1,3})?)/;
  const vttTiming = new RegExp(`(${timestampPattern.source})\\s+-->\\s+(${timestampPattern.source})`);
  let timestamp = "";
  let duration: number | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim().replace(/^\uFEFF/, "");
    if (!line || line.toUpperCase() === "WEBVTT" || /^\d+$/.test(line)) continue;
    const timing = extension === "vtt" ? line.match(vttTiming) : null;
    if (timing) {
      timestamp = timing[1];
      duration = Math.max(0, timeSeconds(timing[3]) - timeSeconds(timing[1]));
      continue;
    }
    if (extension === "vtt" && line.includes("-->")) continue;
    const inline = line.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)\]\s*/);
    if (inline) {
      timestamp = inline[1];
      duration = null;
      line = line.slice(inline[0].length).trim();
    }
    const speakerMatch = line.match(/^([A-Za-z][\w .'-]{0,60}):\s+(.+)$/);
    const speaker = speakerMatch?.[1] ?? "";
    const content = speakerMatch?.[2] ?? line;
    if (content) segments.push({ timestamp, duration_seconds: duration, speaker, text: content });
  }
  if (!segments.length) throw new Error("No transcript text could be parsed from this file.");
  return segments;
}

function buildEvidence(meeting: DemoMeeting, segment: DemoMeeting["segments"][number]): DemoEvidence {
  return {
    excerpt: segment.text,
    speaker: segment.speaker,
    timestamp: segment.timestamp,
    segment_id: segment.id,
    meeting_id: meeting.id,
    meeting_title: meeting.title,
  };
}

function analyze(meeting: DemoMeeting): void {
  const sentences = meeting.segments.flatMap((segment) =>
    segment.text.trim().split(/(?<=[.!?])\s+/).filter(Boolean).map((text) => ({ segment, text })),
  );
  const topicCounts = new Map<string, number>();
  for (const segment of meeting.segments) {
    for (const word of segment.text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []) {
      if (!STOP_WORDS.has(word)) topicCounts.set(word, (topicCounts.get(word) ?? 0) + 1);
    }
  }
  const topics = [...topicCounts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([word]) => word);
  const decisions: DemoMeeting["decisions"] = [];
  const action_items: DemoAction[] = [];
  const unresolved_questions: DemoMeeting["summary"]["unresolved_questions"] = [];
  const discussion_points: DemoMeeting["summary"]["discussion_points"] = [];
  const risks_and_blockers: DemoMeeting["summary"]["risks_and_blockers"] = [];
  const seenActions = new Set<string>();

  for (const { segment, text } of sentences) {
    const source = buildEvidence(meeting, segment);
    const lower = text.toLowerCase();
    if (/\b(open question|unresolved|not sure|need to clarify|still unclear)\b/.test(lower)) {
      unresolved_questions.push({ text, evidence: source });
    }
    if (TENTATIVE_RE.test(text) && !/\b(risk|blocked|blocker|delay)\b/i.test(text)) {
      decisions.push({ id: 0, text, classification: "suggestion", evidence: source });
    } else if (DECISION_RE.test(text)) {
      decisions.push({ id: 0, text, classification: "confirmed", evidence: source });
    }
    if (ACTION_RE.test(text) && !seenActions.has(text.toLowerCase())) {
      seenActions.add(text.toLowerCase());
      const owner = OWNER_RE.exec(text)?.[1] ?? (
        segment.speaker && FIRST_PERSON_RE.test(`${segment.speaker}: ${text}`) ? segment.speaker : ""
      );
      action_items.push({
        id: 0,
        meeting_id: meeting.id,
        meeting_title: meeting.title,
        task: text,
        owner,
        due_date: DATE_RE.exec(text)?.[0] ?? "",
        status: "open",
        evidence: source,
      });
    }
    if (discussion_points.length < 6 && text.length > 20) discussion_points.push({ text, evidence: source });
    if (/\b(risk|blocked|blocker|delay|at risk)\b/i.test(text)) {
      risks_and_blockers.push({ text, evidence: source });
    }
  }
  decisions.forEach((item, index) => { item.id = meeting.id * 1000 + index + 1; });
  action_items.forEach((item, index) => { item.id = meeting.id * 10000 + index + 1; });
  meeting.summary = {
    overview: discussion_points[0]?.text ?? "No substantive discussion could be summarized from this transcript.",
    topics,
    discussion_points,
    decisions,
    unresolved_questions,
    follow_ups: action_items.map(({ task, owner, due_date, evidence }) => ({ task, owner, due_date, evidence })),
    risks_and_blockers,
    mode: "local deterministic analysis",
  };
  meeting.decisions = decisions;
  meeting.action_items = action_items;
  meeting.segment_count = meeting.segments.length;
  meeting.action_count = action_items.length;
}

function createMeeting(title: string, filename: string, text: string, segments: ParsedSegment[]): DemoMeeting {
  const meetings = loadMeetings();
  const id = Math.max(0, ...meetings.map((item) => item.id)) + 1;
  const meeting: DemoMeeting = {
    id,
    title: title.trim(),
    meeting_date: new Date().toISOString().slice(0, 10),
    source_filename: filename,
    processing_status: "ready",
    created_at: new Date().toISOString(),
    segment_count: segments.length,
    action_count: 0,
    transcript: text,
    segments: segments.map((segment, index) => ({
      id: id * 100 + index + 1,
      timestamp: segment.timestamp,
      duration_seconds: segment.duration_seconds,
      speaker: segment.speaker,
      text: segment.text,
    })),
    summary: {
      overview: "",
      topics: [],
      discussion_points: [],
      decisions: [],
      unresolved_questions: [],
      follow_ups: [],
      risks_and_blockers: [],
      mode: "local deterministic analysis",
    },
    decisions: [],
    action_items: [],
  };
  analyze(meeting);
  saveMeetings([...meetings, meeting]);
  return meeting;
}

function toListItem(meeting: DemoMeeting): Omit<DemoMeeting, "transcript" | "segments" | "summary" | "decisions" | "action_items"> {
  const { transcript: _transcript, segments: _segments, summary: _summary, decisions: _decisions, action_items: _actions, ...item } = meeting;
  return item;
}

function getEvidenceAnswer(question: string, meetings: DemoMeeting[]) {
  const terms = tokenize(question);
  const lower = question.toLowerCase();
  if (/\b(who|owner|assigned|responsible)\b/.test(lower)) {
    ["will", "assigned", "owner", "prepare", "send", "share", "create", "follow"].forEach((term) => terms.add(term));
  }
  if (/\b(when|deadline|due date|due)\b/.test(lower)) {
    ["by", "due", "before", "tomorrow", "today", "monday", "tuesday", "wednesday", "thursday", "friday"].forEach((term) => terms.add(term));
  }
  if (/\b(decid|decision|agree|agreed)\w*\b/.test(lower)) {
    ["decided", "agreed", "approved", "confirmed"].forEach((term) => terms.add(term));
  }
  if (/\b(problem|risk|blocker|blocked)\w*\b/.test(lower)) {
    ["risk", "blocker", "blocked", "delay", "unclear"].forEach((term) => terms.add(term));
  }
  if (/\b(unresolved|remain|open question|unclear)\b/.test(lower)) {
    ["unresolved", "clarify", "unclear", "question"].forEach((term) => terms.add(term));
  }
  const queryTermCount = tokenize(question).size;
  const minimumOverlap = Math.max(1, Math.min(2, queryTermCount));
  const ranked = meetings.flatMap((meeting) => meeting.segments.map((segment) => {
    const overlap = [...terms].filter((term) => tokenize(segment.text).has(term));
    return { meeting, segment, score: overlap.length };
  }))
    .filter((item) => item.score >= minimumOverlap)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
  if (!ranked.length) {
    return {
      answer: "The selected transcripts do not contain enough matching evidence to answer this question.",
      supported: false,
      mode: "browser-local keyword retrieval",
      notice: "No external AI or semantic model is used. Transcript text is treated as evidence, not instructions.",
      evidence: [],
    };
  }
  return {
    answer: "Relevant transcript excerpts were found. Review the exact source wording; this is not a generated conclusion.",
    supported: true,
    mode: "browser-local keyword retrieval",
    notice: "No external AI or semantic model is used. Transcript text is treated as evidence, not instructions.",
    evidence: ranked.map(({ meeting, segment }) => buildEvidence(meeting, segment)),
  };
}

function inspectClaim(meeting: DemoMeeting, claim: string) {
  const claimTerms = tokenize(claim);
  const candidate = meeting.segments.map((segment) => ({
    segment,
    overlap: [...claimTerms].filter((term) => tokenize(segment.text).has(term)),
  })).sort((left, right) => right.overlap.length - left.overlap.length)[0];
  if (!candidate || candidate.overlap.length < Math.max(1, Math.floor(claimTerms.size / 3))) {
    return {
      claim,
      classification: "insufficient_evidence",
      explanation: "No sufficiently relevant excerpt was found. Human review is recommended.",
      review_status: "unreviewed",
      evidence: null,
    };
  }
  const text = candidate.segment.text.toLowerCase();
  const classification = /\b(not|never|no|didn't|doesn't|won't)\b/.test(text)
    ? "contradicted"
    : /\b(maybe|perhaps|suggest|could|might|tentative)\b/.test(text)
      ? "needs_human_review"
      : "supported";
  return {
    claim,
    classification,
    explanation: "This heuristic found overlapping terms in the excerpt. Review the full context; it is not a validated truth or hallucination detector.",
    review_status: "unreviewed",
    evidence: buildEvidence(meeting, candidate.segment),
  };
}

function getAnalytics(meetings: DemoMeeting[]) {
  const speakers = new Map<string, number>();
  const topicMeetingCounts = new Map<string, Set<number>>();
  const blockerCounts = new Map<string, Set<number>>();
  const unresolved = [];
  let durationsAvailable = meetings.length > 0;
  const speakerSeconds = new Map<string, number>();
  for (const meeting of meetings) {
    for (const segment of meeting.segments) {
      if (segment.speaker) speakers.set(segment.speaker, (speakers.get(segment.speaker) ?? 0) + 1);
      if (!segment.speaker || segment.duration_seconds === null) durationsAvailable = false;
      if (segment.speaker && segment.duration_seconds !== null) {
        speakerSeconds.set(segment.speaker, (speakerSeconds.get(segment.speaker) ?? 0) + segment.duration_seconds);
      }
    }
    for (const topic of meeting.summary.topics) {
      const key = topic.toLowerCase();
      if (!topicMeetingCounts.has(key)) topicMeetingCounts.set(key, new Set());
      topicMeetingCounts.get(key)?.add(meeting.id);
    }
    for (const blocker of meeting.summary.risks_and_blockers) {
      const key = blocker.text.toLowerCase().replace(/\s+/g, " ").trim();
      if (!blockerCounts.has(key)) blockerCounts.set(key, new Set());
      blockerCounts.get(key)?.add(meeting.id);
    }
    unresolved.push(...meeting.summary.unresolved_questions.map((item) => ({
      meeting_id: meeting.id,
      meeting_title: meeting.title,
      text: item.text,
      evidence: item.evidence,
    })));
  }
  return {
    meeting_count: meetings.length,
    speaker_participation: [...speakers].map(([speaker, segment_count]) => ({ speaker, segment_count })),
    speaking_time: durationsAvailable
      ? { available: true, unit: "seconds", by_speaker: [...speakerSeconds].map(([speaker, seconds]) => ({ speaker, seconds })) }
      : { available: false, reason: "Speaker-attributed durations are unavailable for one or more transcript segments." },
    frequent_topics: [...topicMeetingCounts].map(([topic, ids]) => ({ topic, meeting_count: ids.size })),
    topic_trends: meetings.map((meeting) => ({
      meeting_id: meeting.id,
      meeting_title: meeting.title,
      meeting_date: meeting.meeting_date,
      topics: meeting.summary.topics,
    })),
    recurring_blockers: [...blockerCounts]
      .filter(([, ids]) => ids.size > 1)
      .map(([text, ids]) => ({ text, meeting_count: ids.size })),
    unresolved_questions: unresolved,
  };
}

function parseBody(init?: RequestInit): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(String(init?.body ?? "{}"));
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Expected an object request body.");
    }
    return value as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Invalid request body: ${error instanceof Error ? error.message : "invalid JSON"}`);
  }
}

function parseDate(value: string | null, label: string): void {
  if (!value) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be a valid YYYY-MM-DD date.`);
  }
}

function actionPayload(meeting: DemoMeeting, action: DemoAction) {
  let status = action.status;
  if (status !== "completed" && /^\d{4}-\d{2}-\d{2}$/.test(action.due_date) && action.due_date < new Date().toISOString().slice(0, 10)) {
    status = "overdue";
  }
  return { ...action, status, meeting_title: meeting.title };
}

export async function getBrowserApiResponse(path: string, init?: RequestInit): Promise<unknown> {
  const url = new URL(path, "https://browser-workspace.invalid");
  const method = (init?.method ?? "GET").toUpperCase();
  const pathname = url.pathname;
  let meetings = loadMeetings();

  if (method === "GET" && pathname === "/api/health") {
    return { status: "ok", mode: "browser-local", database: "browser storage" };
  }
  if (method === "GET" && pathname === "/api/meetings") {
    return meetings.sort((a, b) => b.created_at.localeCompare(a.created_at)).map(toListItem);
  }
  if (method === "GET" && pathname === "/api/settings/provider") {
    return {
      mode: "public_browser",
      provider: null,
      configured: false,
      live_ai_enabled: false,
      model: null,
      semantic_search_enabled: false,
      semantic_search_requested: false,
      semantic_search_available: false,
      semantic_model: "unavailable in browser-only mode",
      audio_transcription_available: false,
      privacy: "Transcripts and edits stay in this browser profile's local storage. No application API, server database, or external AI provider is contacted.",
    };
  }
  if (method === "GET" && pathname === "/api/search") {
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    if (!query) return [];
    const meetingId = Number(url.searchParams.get("meeting_id"));
    const dateFrom = url.searchParams.get("date_from") || "";
    const dateTo = url.searchParams.get("date_to") || "";
    parseDate(dateFrom, "date_from");
    parseDate(dateTo, "date_to");
    const results = meetings.filter((meeting) =>
      (!Number.isFinite(meetingId) || meetingId <= 0 || meeting.id === meetingId)
      && (!dateFrom || meeting.meeting_date >= dateFrom)
      && (!dateTo || meeting.meeting_date <= dateTo)
      && (`${meeting.title}\n${meeting.transcript}`).toLowerCase().includes(query),
    );
    if (url.searchParams.get("sort_by") === "title") results.sort((a, b) => a.title.localeCompare(b.title));
    else results.sort((a, b) => b.meeting_date.localeCompare(a.meeting_date));
    return results.map(toListItem);
  }
  if (method === "GET" && pathname === "/api/actions") {
    const status = url.searchParams.get("status");
    const query = (url.searchParams.get("q") ?? "").toLowerCase();
    return meetings.flatMap((meeting) => meeting.action_items.map((action) => actionPayload(meeting, action)))
      .filter((action) => (!status || action.status === status || (status === "pending" && action.status === "open"))
        && (!query || `${action.task} ${action.owner} ${action.meeting_title}`.toLowerCase().includes(query)));
  }
  if (method === "GET" && pathname === "/api/analytics") {
    const from = url.searchParams.get("date_from");
    const to = url.searchParams.get("date_to");
    parseDate(from, "date_from");
    parseDate(to, "date_to");
    if (from && to && from > to) throw new Error("date_from must not be after date_to.");
    return getAnalytics(meetings.filter((meeting) =>
      (!from || meeting.meeting_date >= from) && (!to || meeting.meeting_date <= to),
    ));
  }
  if (method === "POST" && pathname === "/api/demo/seed") {
    const existing = new Set(meetings.map((meeting) => meeting.id));
    const added = cloneFixtures().filter((meeting) => !existing.has(meeting.id));
    saveMeetings([...meetings, ...added]);
    return { added: added.length };
  }
  if (method === "DELETE" && pathname === "/api/workspace") {
    saveMeetings(cloneFixtures());
    return { reset: true };
  }
  if (method === "POST" && pathname === "/api/meetings/import") {
    const form = init?.body;
    if (!(form instanceof FormData)) throw new Error("Transcript upload form is missing.");
    const candidate = form.get("file");
    if (!candidate || typeof candidate === "string") throw new Error("Choose a transcript file to import.");
    const text = await readBrowserFileText(candidate);
    const segments = parseTranscript(candidate.name, text);
    const title = url.searchParams.get("title")?.trim() || candidate.name.replace(/\.[^.]+$/, "");
    if (!title) throw new Error("Meeting title cannot be empty.");
    return createMeeting(title, candidate.name, text, segments);
  }
  if (method === "POST" && pathname === "/api/meetings/audio/import") {
    throw new Error("Audio transcription is unavailable in browser-only mode. Import a TXT, Markdown, or WebVTT transcript.");
  }
  if (method === "POST" && pathname === "/api/meetings") {
    const body = parseBody(init);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const transcript = typeof body.transcript === "string" ? body.transcript : "";
    if (!title) throw new Error("Meeting title cannot be empty.");
    const segments = parseTranscript("meeting.txt", transcript);
    return createMeeting(title, "meeting.txt", transcript, segments);
  }
  if (method === "PATCH" && pathname.startsWith("/api/actions/")) {
    const id = Number(pathname.split("/").pop());
    const body = parseBody(init);
    let found: DemoAction | undefined;
    let foundMeeting: DemoMeeting | undefined;
    for (const meeting of meetings) {
      found = meeting.action_items.find((action) => action.id === id);
      if (found) {
        foundMeeting = meeting;
        break;
      }
    }
    if (!found || !foundMeeting) throw new Error("Action item not found.");
    if (typeof body.task === "string") found.task = body.task.trim();
    if (typeof body.owner === "string") found.owner = body.owner.trim();
    if (typeof body.due_date === "string") found.due_date = body.due_date.trim();
    if (body.status === "completed") found.status = "completed";
    else if (body.status === "open" || body.status === "pending") found.status = "open";
    saveMeetings(meetings);
    return actionPayload(foundMeeting, found);
  }
  if (method === "DELETE" && pathname.startsWith("/api/meetings/")) {
    const id = Number(pathname.split("/")[3]);
    const remaining = meetings.filter((meeting) => meeting.id !== id);
    if (remaining.length === meetings.length) throw new Error("Meeting not found.");
    saveMeetings(remaining);
    return undefined;
  }
  if (pathname.startsWith("/api/meetings/")) {
    const parts = pathname.split("/");
    const id = Number(parts[3]);
    const action = parts[4];
    const meeting = meetings.find((item) => item.id === id);
    if (!meeting) throw new Error("Meeting not found.");
    if (!action && method === "GET") return meeting;
    if (action === "summary" && method === "POST") {
      analyze(meeting);
      saveMeetings(meetings);
      return meeting.summary;
    }
    if (action === "actions" && method === "POST") return meeting.action_items;
    if (action === "decisions" && method === "POST") return meeting.decisions;
    if (action === "ask" && method === "POST") {
      const body = parseBody(init);
      const question = typeof body.question === "string" ? body.question.trim() : "";
      if (!question || question.length > 1000) throw new Error("Enter a question of 1–1000 characters.");
      return getEvidenceAnswer(question, [meeting]);
    }
    if (action === "inspect" && method === "POST") {
      const body = parseBody(init);
      const claim = typeof body.claim === "string" ? body.claim.trim() : "";
      if (!claim || claim.length > 4000) throw new Error("Enter a claim of 1–4000 characters.");
      return inspectClaim(meeting, claim);
    }
  }
  if (method === "POST" && pathname === "/api/ask") {
    const body = parseBody(init);
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question || question.length > 1000) throw new Error("Enter a question of 1–1000 characters.");
    const ids = Array.isArray(body.meeting_ids) ? body.meeting_ids.filter((id): id is number => typeof id === "number") : [];
    const from = typeof body.date_from === "string" ? body.date_from : "";
    const to = typeof body.date_to === "string" ? body.date_to : "";
    parseDate(from || null, "date_from");
    parseDate(to || null, "date_to");
    if (from && to && from > to) throw new Error("date_from must not be after date_to.");
    const selected = meetings.filter((meeting) =>
      (!ids.length || ids.includes(meeting.id))
      && (!from || meeting.meeting_date >= from)
      && (!to || meeting.meeting_date <= to),
    );
    return getEvidenceAnswer(question, selected);
  }
  throw new Error(`Unsupported browser workspace request: ${method} ${pathname}`);
}
