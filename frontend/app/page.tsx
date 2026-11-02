"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getBrowserApiResponse, readBrowserFileText } from "./browser-workspace";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const API = DEMO_MODE ? "" : process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
type Meeting = {
  id: number;
  title: string;
  meeting_date: string;
  source_filename: string;
  processing_status: string;
  created_at: string;
  segment_count?: number;
  action_count?: number;
};
type Evidence = { excerpt: string; speaker: string; timestamp: string; segment_id: number; meeting_id?: number; meeting_title?: string };
type Answer = { answer: string; supported: boolean; evidence: Evidence[]; mode?: string; notice?: string };
type Action = {
  id: number; meeting_id: number; meeting_title: string; task: string; owner: string;
  due_date: string; status: string; evidence: Evidence | null;
};
type ProviderStatus = {
  mode: string; provider: string | null; configured: boolean; live_ai_enabled: boolean;
  model: string | null; semantic_search_enabled: boolean; semantic_model: string;
  semantic_search_requested: boolean; semantic_search_available: boolean;
  audio_transcription_available: boolean; privacy: string;
};
type Detail = Meeting & {
  transcript: string;
  segments: Array<{ id: number; timestamp: string; speaker: string; text: string }>;
  summary: {
    overview: string;
    topics: string[];
    discussion_points: Array<{ text: string; evidence: Evidence }>;
    decisions: Array<{ text: string; classification: string; evidence: Evidence }>;
    unresolved_questions: Array<{ text: string; evidence: Evidence }>;
    follow_ups: Array<{ task: string; owner: string; due_date: string; evidence: Evidence }>;
    risks_and_blockers: Array<{ text: string; evidence: Evidence }>;
    mode: string;
  };
  decisions: Array<{ id: number; text: string; classification: string; evidence: Evidence | null }>;
  action_items: Array<{ id: number; task: string; owner: string; due_date: string; status: string; evidence: Evidence | null }>;
};
type View = "overview" | "meetings" | "search" | "ask" | "actions" | "analytics" | "settings";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (DEMO_MODE) return await getBrowserApiResponse(path, init) as T;
  const response = await fetch(`${API}${path}`, init);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body.detail || message;
    } catch {
      // The response body may not contain JSON.
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function EvidenceCard({ evidence }: { evidence: Evidence | null }) {
  if (!evidence) return <p className="muted small">No transcript excerpt available.</p>;
  return (
    <div className="evidence">
      <span className="evidence-label">TRANSCRIPT EVIDENCE</span>
      {evidence.meeting_title && <strong className="evidence-meeting">{evidence.meeting_title}</strong>}
      <p>“{evidence.excerpt}”</p>
      <span className="muted small">{[evidence.speaker, evidence.timestamp].filter(Boolean).join(" · ") || "Source excerpt"}</span>
    </div>
  );
}

function downloadBrowserFile(filename: string, content: string, contentType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: contentType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadBrowserMeeting(detail: Detail, format: "markdown" | "txt" | "csv"): void {
  const csvCell = (value: string) => {
    const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  if (format === "csv") {
    const rows = [
      ["Task", "Owner", "Due date", "Status", "Evidence"],
      ...detail.action_items.map((item) => [item.task, item.owner, item.due_date, item.status, item.evidence?.excerpt ?? ""]),
    ];
    downloadBrowserFile(`meeting-${detail.id}-actions.csv`, rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
    return;
  }
  const heading = format === "markdown" ? "## " : "";
  const content = [
    `${format === "markdown" ? "# " : ""}${detail.title}`,
    `Date: ${detail.meeting_date}`,
    "",
    `${heading}Overview`,
    detail.summary.overview,
    "",
    `${heading}Key topics`,
    detail.summary.topics.join(", "),
    "",
    `${heading}Decisions`,
    ...detail.decisions.map((item) => `- [${item.classification}] ${item.text}${item.evidence ? ` — Evidence: “${item.evidence.excerpt}”` : ""}`),
    "",
    `${heading}Action items`,
    ...detail.action_items.map((item) => `- ${item.task} (Owner: ${item.owner || "Unassigned"}; Due: ${item.due_date || "Not specified"})${item.evidence ? ` — Evidence: “${item.evidence.excerpt}”` : ""}`),
    "",
    `${heading}Transcript`,
    detail.transcript,
  ].join("\n");
  downloadBrowserFile(`meeting-${detail.id}.${format === "markdown" ? "md" : "txt"}`, content, format === "markdown" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8");
}

function downloadBrowserActions(actions: Action[]): void {
  const rows = [
    ["Meeting", "Task", "Owner", "Due date", "Status", "Evidence"],
    ...actions.map((item) => [item.meeting_title, item.task, item.owner, item.due_date, item.status, item.evidence?.excerpt ?? ""]),
  ];
  const csvCell = (value: string) => {
    const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  downloadBrowserFile("echolens-actions.csv", rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
}

export default function Home() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [activeView, setActiveView] = useState<View>("overview");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailTab, setDetailTab] = useState("Summary");
  const [modal, setModal] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [audioMode, setAudioMode] = useState(false);
  const [preview, setPreview] = useState("");
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [searchMeetingId, setSearchMeetingId] = useState("");
  const [searchFrom, setSearchFrom] = useState("");
  const [searchTo, setSearchTo] = useState("");
  const [searchSort, setSearchSort] = useState("recent");
  const [results, setResults] = useState<Meeting[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [askMode, setAskMode] = useState<"local" | "live_ai">("local");
  const [externalConsent, setExternalConsent] = useState(false);
  const [claim, setClaim] = useState("");
  const [inspection, setInspection] = useState<{ classification: string; explanation: string; evidence: Evidence | null } | null>(null);
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshMeetings = useCallback(async () => {
    const items = await api<Meeting[]>("/api/meetings");
    setMeetings(items);
    if (selectedId && !items.some((meeting) => meeting.id === selectedId)) {
      setSelectedId(null);
      setDetail(null);
    }
  }, [selectedId]);

  useEffect(() => {
    refreshMeetings().catch((err: Error) => setError(`Could not connect to the local API: ${err.message}`));
    api<typeof provider>("/api/settings/provider").then(setProvider).catch(() => undefined);
  }, [refreshMeetings]);

  useEffect(() => {
    if (!selectedId) return;
    api<Detail>(`/api/meetings/${selectedId}`)
      .then(setDetail)
      .catch((err: Error) => setError(err.message));
    setAnswer(null);
    setInspection(null);
  }, [selectedId]);

  const stats = useMemo(() => [
    { label: "Meetings", value: meetings.length.toString(), icon: "◷" },
    { label: "Action items", value: meetings.reduce((sum, item) => sum + (item.action_count || 0), 0).toString(), icon: "↗" },
    { label: "Workspace mode", value: DEMO_MODE ? "Browser" : "Local", icon: "⌂" },
  ], [meetings]);

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setAudioMode(false);
    setPreview("");
    setTitle(selected ? selected.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") : "");
    setError("");
    if (selected) {
      const extension = selected.name.split(".").pop()?.toLowerCase();
      const isAudio = ["wav", "mp3", "m4a"].includes(extension || "");
      if (DEMO_MODE && isAudio) {
        setFile(null);
        setError("Audio transcription is unavailable in browser-only mode. Import a TXT, Markdown, or WebVTT transcript.");
        return;
      }
      if (!["txt", "md", "vtt", "wav", "mp3", "m4a"].includes(extension || "")) {
        setFile(null);
        setError("Unsupported file type. Upload TXT, Markdown, WebVTT, WAV, MP3, or M4A.");
        return;
      }
      setAudioMode(isAudio);
      if (selected.size > (isAudio ? 25 : 2) * 1024 * 1024) {
        setFile(null);
        setAudioMode(false);
        setError(isAudio ? "Audio exceeds the 25 MB upload limit." : "Transcript exceeds the 2 MB upload limit.");
        return;
      }
      if (selected.size === 0) {
        setFile(null);
        setError("Transcript file is empty.");
        return;
      }
      try {
        if (!isAudio) setPreview(await readBrowserFileText(selected));
      } catch {
        setFile(null);
        setError("Could not read this file. Choose a UTF-8 text file.");
      }
    }
  };

  const saveImport = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const endpoint = audioMode ? "/api/meetings/audio/import" : "/api/meetings/import";
      await api(`${endpoint}?title=${encodeURIComponent(title.trim())}`, { method: "POST", body: form });
      await refreshMeetings();
      setModal(false);
      setFile(null);
      setPreview("");
      setAudioMode(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const seedDemo = async () => {
    if (DEMO_MODE) {
      setActiveView("meetings");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/api/demo/seed", { method: "POST" });
      await refreshMeetings();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setBusy(true);
    try {
      const params = new URLSearchParams({ q: query.trim(), sort_by: searchSort });
      if (searchMeetingId) params.set("meeting_id", searchMeetingId);
      if (searchFrom) params.set("date_from", searchFrom);
      if (searchTo) params.set("date_to", searchTo);
      setResults(await api<Meeting[]>(`/api/search?${params}`));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const askQuestion = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail || !question.trim()) return;
    if (DEMO_MODE && askMode !== "local") {
      setError("Live AI requires a server-side provider and is unavailable in browser-only mode.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setAnswer(await api<Answer>(`/api/meetings/${detail.id}/ask`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, mode: askMode, allow_external_processing: externalConsent }),
      }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const inspectClaim = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail || !claim.trim()) return;
    setBusy(true);
    setError("");
    try {
      setInspection(await api(`/api/meetings/${detail.id}/inspect`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claim }),
      }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openMeeting = (meeting: Meeting) => {
    setSelectedId(meeting.id);
    setDetailTab("Summary");
    setActiveView("meetings");
  };

  const deleteMeeting = async () => {
    if (!detail || !window.confirm(`Delete “${detail.title}” and its associated data?`)) return;
    setBusy(true);
    try {
      await api(`/api/meetings/${detail.id}`, { method: "DELETE" });
      setSelectedId(null);
      setDetail(null);
      await refreshMeetings();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const resetBrowserWorkspace = async () => {
    if (!window.confirm("Reset this browser workspace to the bundled sample meetings? Uploaded meetings and edits will be removed.")) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/workspace", { method: "DELETE" });
      setSelectedId(null);
      setDetail(null);
      await refreshMeetings();
      setActiveView("overview");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const nav = [
    { id: "overview" as View, label: "Overview", glyph: "◫" },
    { id: "meetings" as View, label: "Meetings", glyph: "▤" },
    { id: "search" as View, label: "Search", glyph: "⌕" },
    { id: "ask" as View, label: "Ask across meetings", glyph: "✧" },
    { id: "actions" as View, label: "Action items", glyph: "↗" },
    { id: "analytics" as View, label: "Analytics", glyph: "▥" },
    { id: "settings" as View, label: "Settings", glyph: "⚙" },
  ];

  return (
    <main className="shell">
      <aside className="sidebar">
        <a className="brand" href="/welcome">
          <span className="brand-mark">e</span><span>echolens<span className="brand-ai">.ai</span></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-pill"><span className="workspace-dot" /> {DEMO_MODE ? "Browser workspace" : "Personal workspace"} <span className="chevron">⌄</span></div>
        <nav className="navigation" aria-label="Main navigation">
          {nav.map((item) => (
            <button key={item.id} className={`nav-item ${activeView === item.id && !selectedId ? "selected" : ""}`} onClick={() => { setActiveView(item.id); setSelectedId(null); }}>
              <span className="nav-glyph">{item.glyph}</span>{item.label}
              {item.id === "meetings" && <span className="nav-count">{meetings.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="privacy-card">
          <div className="privacy-icon">◈</div>
          <strong>Your conversations stay yours.</strong>
          <p>{DEMO_MODE ? "Browser mode stores transcript data in this browser profile only." : "Local mode keeps transcript data on this device."}</p>
          <button onClick={() => { setSelectedId(null); setDetail(null); setActiveView("settings"); }}>Privacy details <span>→</span></button>
        </div>
        <div className="profile"><div className="avatar">E</div><div><strong>EchoLens</strong><small>{DEMO_MODE ? "Browser workspace" : "Local workspace"}</small></div><span className="more">···</span></div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="slash">/</span><strong>{selectedId ? detail?.title || "Meeting" : nav.find((item) => item.id === activeView)?.label}</strong></div>
          <div className="top-actions">
            <span className="local-badge"><span /> {DEMO_MODE ? "BROWSER-LOCAL MODE" : "LOCAL MODE"}</span>
            <button className="button button-dark button-small" onClick={() => { setModal(true); setError(""); }}>＋ Import transcript</button>
          </div>
        </header>

        <div className="content">
          {DEMO_MODE && <div className="demo-banner" role="status">Interactive browser workspace · Your meetings stay in this browser profile and are not sent to an application API. Clearing site data removes them.</div>}
          {error && !modal && <div className="alert" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError("")}>×</button></div>}

          {!selectedId && activeView === "overview" && (
            <>
              <div className="welcome-row">
                <div><p className="eyebrow">{DEMO_MODE ? "YOUR BROWSER WORKSPACE" : new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "2-digit", year: "numeric" }).format(new Date()).toUpperCase()} <span className="eyebrow-line" /></p><h1>Your meetings,<br className="mobile-break" /> with <span>more clarity.</span></h1><p className="page-intro">{DEMO_MODE ? "Import and analyze transcripts locally in this browser." : "The details that matter, grounded in what was actually said."}</p></div>
                <button className="button button-dark" onClick={() => { setModal(true); setError(""); }}>＋ Import a meeting</button>
              </div>
              <div className="stats-grid">
                {stats.map((stat, index) => <div className="stat-card" key={stat.label}><div className={`stat-icon icon-${index}`}>{stat.icon}</div><span className="stat-label">{stat.label}</span><strong>{stat.value}</strong>{index === 2 && <span className="stat-caption">{DEMO_MODE ? "Browser-local storage" : provider?.live_ai_enabled ? "Live AI available by consent" : provider?.semantic_search_enabled ? "Local semantic search enabled" : "Keyword retrieval fallback"}</span>}</div>)}
              </div>
              <section className="section">
                <div className="section-heading"><div><h2>Recent meetings</h2><p>Your conversations, organized and ready to explore.</p></div><button className="text-button" onClick={() => setActiveView("meetings")}>View all meetings <span>→</span></button></div>
                {meetings.length ? <MeetingList meetings={meetings.slice(0, 5)} onOpen={openMeeting} /> : <div className="empty-card"><div className="empty-visual"><span>◷</span><i>✦</i></div><h3>Start with a conversation</h3><p>Import a transcript to uncover decisions, follow-ups, and the evidence behind every insight.</p><div className="empty-actions"><button className="button button-dark" onClick={() => setModal(true)}>Import transcript</button><button className="button button-light" onClick={seedDemo} disabled={busy}>Explore sample meetings</button></div></div>}
              </section>
              {meetings.length > 0 && <div className="trust-banner"><div className="trust-icon">✳</div><div><strong>Evidence before assumptions.</strong><p>Every insight links back to a source excerpt. When the transcript doesn’t say, EchoLens says so.</p></div><button onClick={() => { openMeeting(meetings[0]); setDetailTab("Inspector"); }}>Explore reliability inspector <span>→</span></button></div>}
            </>
          )}

          {!selectedId && activeView === "meetings" && (
            <section className="section page-section"><div className="section-heading"><div><p className="eyebrow">YOUR LIBRARY</p><h1>Meetings</h1><p>All meetings saved in this workspace.</p></div><button className="button button-dark" onClick={() => setModal(true)}>＋ Import transcript</button></div>{meetings.length ? <MeetingList meetings={meetings} onOpen={openMeeting} /> : <div className="empty-card"><h3>No meetings yet</h3><p>Import your first transcript or restore the synthetic sample meetings.</p><div className="empty-actions"><button className="button button-dark" onClick={() => setModal(true)}>Import transcript</button><button className="button button-light" onClick={seedDemo} disabled={busy}>Load sample meetings</button></div></div>}</section>
          )}

          {!selectedId && activeView === "search" && (
            <section className="section page-section"><p className="eyebrow">FIND THE MOMENT</p><h1>Search your conversations</h1><p className="page-intro">{DEMO_MODE ? "Keyword search runs locally across meetings saved in this browser." : "Search meeting titles and transcript text stored in your local workspace."}</p><form className="search-form" onSubmit={runSearch}><span>⌕</span><input aria-label="Search transcripts" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try a phrase, topic, or name…" /><button className="button button-dark" disabled={busy}>Search</button></form><div className="filter-row"><label>Meeting<select aria-label="Filter by meeting" value={searchMeetingId} onChange={(event) => setSearchMeetingId(event.target.value)}><option value="">All meetings</option>{meetings.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>From<input aria-label="Search from date" type="date" value={searchFrom} onChange={(event) => setSearchFrom(event.target.value)} /></label><label>To<input aria-label="Search to date" type="date" value={searchTo} onChange={(event) => setSearchTo(event.target.value)} /></label><label>Sort<select aria-label="Sort search results" value={searchSort} onChange={(event) => setSearchSort(event.target.value)}><option value="recent">Most recent</option><option value="title">Meeting title</option></select></label></div>{query && <div className="search-results"><div className="result-count">{results.length} {results.length === 1 ? "meeting" : "meetings"} found</div>{results.length ? <MeetingList meetings={results} onOpen={openMeeting} /> : <div className="no-results">No matches found. Try a different phrase or filter.</div>}</div>}</section>
          )}

          {!selectedId && activeView === "ask" && <CrossMeetingAsk meetings={meetings} provider={provider} readOnly={false} />}
          {!selectedId && activeView === "actions" && <ActionManager onError={setError} onOpen={openMeeting} meetings={meetings} readOnly={false} />}
          {!selectedId && activeView === "analytics" && <AnalyticsDashboard />}

          {!selectedId && activeView === "settings" && (
            <section className="section page-section">
              <p className="eyebrow">PREFERENCES</p>
              <h1>Settings</h1>
              <p className="page-intro">Understand how EchoLens is configured on this device.</p>
              <div className="settings-card">
                <div className="setting-icon">◈</div>
                <div><h3>Application mode</h3><p>{DEMO_MODE ? "Interactive browser-local workspace · data is saved in this browser profile." : "Local mode · deterministic transcript analysis · SQLite persistence."}</p></div>
                <span className="status-pill">ACTIVE</span>
              </div>
              {DEMO_MODE ? <>
                <div className="settings-card"><div className="setting-icon">✧</div><div><h3>AI and retrieval</h3><p>Live AI and model-backed semantic search are unavailable in this browser-only build. Keyword retrieval is active.</p><small>No provider key or transcript content is sent to a server. The authored Python evaluation suite is not executed in this browser build.</small></div><span className="status-pill neutral">KEYWORD</span></div>
                <div className="settings-card"><div className="setting-icon">♫</div><div><h3>Audio transcription</h3><p>Unavailable in browser-only mode. Import a TXT, Markdown, or WebVTT transcript instead.</p><small>No diarization or speaker identification is provided.</small></div><span className="status-pill neutral">UNAVAILABLE</span></div>
                <div className="settings-card privacy-setting"><div className="setting-icon">⌑</div><div><h3>Privacy & data</h3><p>{provider?.privacy || "Transcript data stays in this browser profile; no application API is contacted."}</p><small>Browser storage is not encrypted or synced. Other people using this same browser profile may be able to access it. Clear this site’s storage to remove all workspace data.</small></div></div>
                <button className="button button-light" disabled={busy} onClick={resetBrowserWorkspace}>Reset workspace to sample meetings</button>
              </> : <>
                <div className="settings-card"><div className="setting-icon">✧</div><div><h3>Optional AI provider</h3><p>{provider?.live_ai_enabled ? `Live ${provider.provider} is enabled (${provider.model}); each request still requires explicit external-processing consent.` : provider?.configured ? "Provider credentials are configured, but live AI is disabled on the server." : "Not configured. EchoLens works without an API key."}</p><small>Credentials are never shown in the interface. External provider requests include only retrieved transcript excerpts.</small></div><span className="status-pill neutral">{provider?.live_ai_enabled ? "ENABLED" : provider?.configured ? "CONFIGURED" : "OFFLINE"}</span></div>
                <div className="settings-card"><div className="setting-icon">⌕</div><div><h3>Local retrieval</h3><p>{provider?.semantic_search_enabled ? `Semantic search enabled with ${provider.semantic_model}.` : provider?.semantic_search_requested && !provider.semantic_search_available ? "Semantic search was requested but FastEmbed is not installed; keyword retrieval remains active." : "Keyword retrieval is active. Optional semantic retrieval can be enabled in the backend environment."}</p><small>Local embedding models may download on first use; no hosted vector service is required.</small></div><span className="status-pill neutral">{provider?.semantic_search_enabled ? "SEMANTIC" : "KEYWORD"}</span></div>
                <div className="settings-card"><div className="setting-icon">♫</div><div><h3>Local audio transcription</h3><p>{provider?.audio_transcription_available ? "Faster-Whisper is installed. Transcription runs on this machine." : "Optional Faster-Whisper/PyAV dependencies are not installed."}</p><small>First use downloads the selected speech model. Speaker identification and diarization are not available.</small></div><span className="status-pill neutral">{provider?.audio_transcription_available ? "AVAILABLE" : "OPTIONAL"}</span></div>
                <div className="settings-card privacy-setting"><div className="setting-icon">⌑</div><div><h3>Privacy & data</h3><p>{provider?.privacy || "Transcript content stays in your local database. No external provider is called."}</p><small>Data is stored in the local SQLite database. Delete a meeting to remove its associated records. This local app does not provide user authentication; do not expose it to untrusted networks.</small></div></div>
              </>}
            </section>
          )}

          {selectedId && detail && (
            <MeetingDetail detail={detail} tab={detailTab} setTab={setDetailTab} question={question} setQuestion={setQuestion} answer={answer} askQuestion={askQuestion} askMode={askMode} setAskMode={setAskMode} externalConsent={externalConsent} setExternalConsent={setExternalConsent} provider={provider} busy={busy} claim={claim} setClaim={setClaim} inspection={inspection} inspectClaim={inspectClaim} onDelete={deleteMeeting} readOnly={false} onBack={() => { setSelectedId(null); setDetail(null); }} />
          )}
          {selectedId && !detail && <div className="loading-card">Loading meeting…</div>}
        </div>
      </section>

      {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(false); }}>
        <div className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
          <div className="modal-heading">
            <div>
              <p className="eyebrow">TRANSCRIPT IMPORT</p>
              <h2 id="import-title">Bring a conversation in.</h2>
              <p>{DEMO_MODE ? "Your transcript is analyzed and saved only in this browser profile." : "Your transcript is parsed and saved on this device."}</p>
            </div>
            <button className="close-button" aria-label="Close import dialog" onClick={() => setModal(false)}>×</button>
          </div>
          {error && <p className="import-error" role="alert">{error}</p>}
          <form onSubmit={saveImport}>
            <label className="field-label" htmlFor="meeting-title">Meeting name</label>
            <input id="meeting-title" className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} placeholder="e.g. Product planning" />
            <label className="field-label" htmlFor="transcript-file">Transcript file</label>
            <input id="transcript-file" className="file-input" type="file" accept={DEMO_MODE ? ".txt,.md,.vtt,text/plain,text/markdown,text/vtt" : ".txt,.md,.vtt,.wav,.mp3,.m4a,text/plain,text/markdown,text/vtt,audio/wav,audio/mpeg,audio/mp4"} onChange={importFile} required />
            <p className="field-help">{DEMO_MODE ? "TXT, Markdown, or WebVTT · UTF-8 · Up to 2 MB" : "TXT, Markdown, or WebVTT · UTF-8 · Up to 2 MB. Optional local audio formats are also supported."}</p>
            {preview && <div className="preview-box"><div className="preview-title">PREVIEW <span>{preview.length.toLocaleString()} characters</span></div><pre>{preview.slice(0, 1800)}{preview.length > 1800 ? "\n…" : ""}</pre></div>}
            <div className="modal-footer"><span>{DEMO_MODE ? "Browser-only storage · No external AI" : "Private by default · External AI is opt-in"}</span><button type="submit" className="button button-dark" disabled={busy || !file || !title.trim()}>{busy ? "Importing…" : "Import meeting"}</button></div>
          </form>
        </div>
      </div>}
    </main>
  );
}

function MeetingList({ meetings, onOpen }: { meetings: Meeting[]; onOpen: (meeting: Meeting) => void }) {
  return <div className="meeting-list">{meetings.map((meeting, index) => {
    const isDemo = meeting.source_filename === "echolens-demo.txt";
    return <button className="meeting-row" key={meeting.id} onClick={() => onOpen(meeting)}><span className={`meeting-art art-${index % 4}`}><span>◷</span></span><span className="meeting-info"><strong>{meeting.title}</strong><small>{meeting.meeting_date || new Date(meeting.created_at).toLocaleDateString()} <span>·</span> {meeting.segment_count ?? "—"} transcript segments</small></span><span className={`meeting-status ${isDemo ? "demo" : ""}`}><i /> {isDemo ? "Demo" : "Ready"}</span><span className="row-arrow">↗</span></button>;
  })}</div>;
}

function MeetingDetail({
  detail, tab, setTab, question, setQuestion, answer, askQuestion, askMode, setAskMode, externalConsent, setExternalConsent, provider, busy, claim, setClaim, inspection, inspectClaim, onDelete, readOnly, onBack,
}: {
  detail: Detail; tab: string; setTab: (tab: string) => void; question: string; setQuestion: (value: string) => void;
  answer: Answer | null; askQuestion: (event: FormEvent) => void; askMode: "local" | "live_ai"; setAskMode: (mode: "local" | "live_ai") => void;
  externalConsent: boolean; setExternalConsent: (value: boolean) => void; provider: ProviderStatus | null; busy: boolean;
  claim: string; setClaim: (value: string) => void; inspection: { classification: string; explanation: string; evidence: Evidence | null } | null;
  inspectClaim: (event: FormEvent) => void; onDelete: () => void; readOnly: boolean; onBack: () => void;
}) {
  const tabs = ["Summary", "Transcript", "Decisions", "Action items", "Ask", "Inspector"];
  const download = (format: "markdown" | "txt" | "csv") => {
    downloadBrowserMeeting(detail, format);
  };
  return <section className="section meeting-detail"><div className="detail-back"><button onClick={onBack} aria-label="Back to meetings">←</button><span>Meetings</span><span>/</span><strong>{detail.title}</strong></div><div className="detail-heading"><div><div className="detail-kicker"><span className="status-pill">READY</span><span>{detail.meeting_date || new Date(detail.created_at).toLocaleDateString()}</span><span>·</span><span>{detail.source_filename || "Imported transcript"}</span></div><h1>{detail.title}</h1><p>{detail.segments.length} transcript segments <span>·</span> Local deterministic analysis</p></div><div className="export-actions"><a className="button button-light button-small" href={DEMO_MODE ? "#" : `${API}/api/meetings/${detail.id}/export/markdown`} onClick={DEMO_MODE ? (event) => { event.preventDefault(); download("markdown"); } : undefined}>↓ Markdown</a><a className="button button-light button-small" href={DEMO_MODE ? "#" : `${API}/api/meetings/${detail.id}/export/txt`} onClick={DEMO_MODE ? (event) => { event.preventDefault(); download("txt"); } : undefined}>↓ Text</a><button className="icon-button danger" aria-label="Delete meeting" title="Delete meeting" onClick={onDelete}>⌫</button></div></div><div className="detail-tabs" role="tablist">{tabs.map((name) => <button role="tab" aria-selected={tab === name} className={tab === name ? "active" : ""} key={name} onClick={() => setTab(name)}>{name}</button>)}</div>
    <div className="detail-content">
      {tab === "Summary" && <SummaryView detail={detail} setTab={setTab} />}
      {tab === "Transcript" && <div className="panel transcript-panel"><div className="panel-title"><span className="panel-icon violet">≡</span><div><h3>Original transcript</h3><small>Source text is preserved as imported.</small></div></div>{detail.segments.map((segment) => <div className="transcript-line" key={segment.id}><div className="transcript-meta"><strong>{segment.speaker || "Speaker"}</strong>{segment.timestamp && <span>{segment.timestamp}</span>}</div><p>{segment.text}</p></div>)}</div>}
      {tab === "Decisions" && <div className="panel list-panel"><div className="panel-title"><span className="panel-icon green">✓</span><div><h3>Decision log</h3><small>Suggestions are separated from confirmed decisions.</small></div></div>{detail.decisions.length ? detail.decisions.map((item) => <div className="decision-item" key={item.id}><div className="decision-item-head"><span className={`decision-tag ${item.classification}`}>{item.classification === "confirmed" ? "CONFIRMED" : "SUGGESTION"}</span></div><p>{item.text}</p><EvidenceCard evidence={item.evidence} /></div>) : <div className="blank-state">No explicit decisions found. This avoids treating tentative language as a commitment.</div>}</div>}
      {tab === "Action items" && <div className="panel list-panel"><div className="panel-title"><span className="panel-icon amber">↗</span><div><h3>Action items</h3><small>Owners and due dates are shown only when explicit in the transcript.</small></div></div>{detail.action_items.length ? detail.action_items.map((item) => <div className="action-card" key={item.id}><div className="action-check">○</div><div className="action-body"><p>{item.task}</p><div className="action-meta"><span>Owner <strong>{item.owner || "Unassigned"}</strong></span><span>Due <strong>{item.due_date || "Not specified"}</strong></span></div><EvidenceCard evidence={item.evidence} /></div></div>) : <div className="blank-state">No explicit follow-ups were found in this transcript.</div>}<a className="button button-light export-csv" href={DEMO_MODE ? "#" : `${API}/api/meetings/${detail.id}/export/csv`} onClick={DEMO_MODE ? (event) => { event.preventDefault(); download("csv"); } : undefined}>↓ Export actions CSV</a></div>}
      {tab === "Ask" && <div className="ask-layout"><div className="ask-intro"><span className="ask-orb">✧</span><p className="eyebrow">ASK YOUR MEETING</p><h2>Find the answer<br />in the conversation.</h2><p>Answers cite transcript evidence and abstain when it does not support a response.</p><div className="suggestion-list"><span>Try asking</span>{["What did we decide?", "Who owns the next task?", "What remains unresolved?"].map((item) => <button key={item} onClick={() => setQuestion(item)}>{item}<span>↗</span></button>)}</div></div><div className="ask-panel"><div className="ask-top"><span className="online-dot" /> Evidence-grounded answers <span className="local-mini">{readOnly ? "SAMPLE" : askMode === "local" ? "LOCAL" : "LIVE AI"}</span></div><form onSubmit={askQuestion}><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask anything about this meeting…" rows={3} />{!readOnly && <label className="field-label inline-field">Answer mode<select className="compact-select" value={askMode} onChange={(event) => setAskMode(event.target.value as "local" | "live_ai")}><option value="local">Local evidence retrieval</option><option value="live_ai" disabled={!provider?.live_ai_enabled}>Live AI {provider?.live_ai_enabled ? "(optional)" : "(not enabled)"}</option></select></label>}{!readOnly && askMode === "live_ai" && <label className="consent-label"><input type="checkbox" checked={externalConsent} onChange={(event) => setExternalConsent(event.target.checked)} /> I consent to sending retrieved excerpts from this meeting to {provider?.provider || "the configured AI provider"}.</label>}<div className="ask-form-footer"><span>{readOnly ? "Bundled sample retrieval only; no external request." : askMode === "local" ? "Local retrieval only; no external request." : "External processing requires explicit consent."}</span><button className="button button-dark button-small" disabled={busy || !question.trim() || (askMode === "live_ai" && !externalConsent)}>{busy ? "Searching…" : "Ask question ↗"}</button></div></form>{answer && <div className={`answer-card ${answer.supported ? "" : "insufficient"}`}><div className="answer-label">{answer.supported ? "RELEVANT EVIDENCE FOUND" : "INSUFFICIENT EVIDENCE"} · {answer.mode || "local evidence search"}</div><p>{answer.answer}</p>{answer.notice && <p className="muted">{answer.notice}</p>}{answer.evidence.map((item, index) => <EvidenceCard key={`${item.segment_id}-${index}`} evidence={item} />)}</div>}</div></div>}
      {tab === "Inspector" && <div className="inspector-layout"><div className="inspector-intro"><p className="eyebrow">AI RELIABILITY INSPECTOR</p><h2>Trust, but<br />trace it back.</h2><p>Check whether a statement has evidence in the transcript. Automated checks are a starting point, not a guarantee of truth.</p><div className="classification-legend"><span><i className="legend-supported" /> Supported</span><span><i className="legend-review" /> Needs human review</span><span><i className="legend-insufficient" /> Insufficient evidence</span><span><i className="legend-conflict" /> Contradicted</span></div></div><div className="inspector-panel"><div className="inspector-header"><span>✳</span><div><strong>Claim inspector</strong><small>Evaluate a statement against this transcript</small></div></div><form onSubmit={inspectClaim}><label className="field-label" htmlFor="claim">Generated claim</label><textarea id="claim" value={claim} onChange={(event) => setClaim(event.target.value)} placeholder="Paste an AI-generated statement to inspect…" rows={4} /><button className="button button-dark" disabled={busy || !claim.trim()}>{busy ? "Checking…" : "Check against transcript"}</button></form>{inspection && <div className="inspection-result"><div className="result-heading"><span className={`classification-pill ${inspection.classification}`}>{inspection.classification.replaceAll("_", " ")}</span><span className="review-status">HUMAN REVIEW ADVISED</span></div><p className="claim-text">“{claim}”</p><p>{inspection.explanation}</p><EvidenceCard evidence={inspection.evidence} /></div>}<p className="inspector-disclaimer">No numerical accuracy score. Similar wording alone does not establish truth.</p></div></div>}
    </div>
  </section>;
}

function SummaryView({ detail, setTab }: { detail: Detail; setTab: (tab: string) => void }) {
  return <>
    <div className="summary-intro"><div className="summary-spark">✳</div><div><span className="eyebrow">MEETING BRIEF <span className="mode-label">{detail.source_filename === "echolens-demo.txt" ? "BUNDLED SAMPLE" : "LOCAL ANALYSIS"}</span></span><p>{detail.summary.overview}</p></div></div>
    <div className="summary-grid">
      <div className="panel"><div className="panel-title"><span className="panel-icon violet">✦</span><div><h3>Key topics</h3><small>Recurring themes in this conversation</small></div></div><div className="topic-list">{detail.summary.topics.length ? detail.summary.topics.map((topic) => <span className="topic-chip" key={topic}>{topic}</span>) : <p className="muted">No clear topics identified.</p>}</div></div>
      <div className="panel"><div className="panel-title"><span className="panel-icon green">✓</span><div><h3>Decisions</h3><small>Confirmed vs. exploratory</small></div></div>{detail.decisions.length ? detail.decisions.slice(0, 4).map((item) => <div className="compact-item" key={item.id}><span className={`decision-dot ${item.classification}`} /><div><p>{item.text}</p><span>{item.classification === "confirmed" ? "CONFIRMED" : "SUGGESTION"}</span></div></div>) : <p className="muted">No decisions identified in this transcript.</p>}</div>
      <div className="panel panel-wide"><div className="panel-title"><span className="panel-icon amber">↗</span><div><h3>Action items</h3><small>Follow-ups from the conversation</small></div></div>{detail.action_items.length ? detail.action_items.slice(0, 4).map((item) => <ActionRow key={item.id} item={item} />) : <p className="muted">No explicit follow-ups identified.</p>}</div>
    </div>
    <div className="summary-grid summary-secondary">
      <div className="panel"><div className="panel-title"><span className="panel-icon violet">≡</span><div><h3>Discussion points</h3><small>Source-linked highlights</small></div></div>{detail.summary.discussion_points.length ? detail.summary.discussion_points.slice(0, 4).map((point, index) => <div className="summary-point" key={`${index}-${point.text}`}><p>{point.text}</p><EvidenceCard evidence={point.evidence} /></div>) : <p className="muted">No discussion highlights found.</p>}</div>
      <div className="panel"><div className="panel-title"><span className="panel-icon amber">!</span><div><h3>Open questions & risks</h3><small>Items that may need follow-up</small></div></div>
        {detail.summary.unresolved_questions.map((item, index) => <div className="summary-point" key={`question-${index}`}><p>{item.text}</p><EvidenceCard evidence={item.evidence} /></div>)}
        {detail.summary.risks_and_blockers.map((item, index) => <div className="summary-point" key={`risk-${index}`}><p>{item.text}</p><EvidenceCard evidence={item.evidence} /></div>)}
        {!detail.summary.unresolved_questions.length && !detail.summary.risks_and_blockers.length && <p className="muted">No explicit unresolved questions or risks identified.</p>}
      </div>
    </div>
    <div className="summary-footer">These notes are generated from the transcript only. <button onClick={() => setTab("Inspector")}>Inspect evidence →</button></div>
  </>;
}

function ActionRow({ item }: { item: Detail["action_items"][number] }) {
  return <div className="compact-action"><span className="action-bullet">○</span><div><p>{item.task}</p><small>{item.owner ? `Owner: ${item.owner}` : "Owner not specified"} <span>·</span> {item.due_date || "No due date"}</small></div></div>;
}

function CrossMeetingAsk({ meetings, provider, readOnly }: { meetings: Meeting[]; provider: ProviderStatus | null; readOnly: boolean }) {
  const [question, setQuestion] = useState("");
  const [meetingIds, setMeetingIds] = useState<number[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [mode, setMode] = useState<"local" | "live_ai">("local");
  const [consent, setConsent] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const ask = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setAnswer(await api<Answer>("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          meeting_ids: meetingIds,
          date_from: dateFrom || null,
          date_to: dateTo || null,
          mode,
          allow_external_processing: consent,
        }),
      }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return <section className="section page-section">
    <p className="eyebrow">EVIDENCE ACROSS YOUR WORKSPACE</p><h1>Ask across meetings</h1>
    <p className="page-intro">{readOnly ? "Search bundled sample excerpts across meetings. No backend or external AI service is contacted." : "Retrieve relevant excerpts across conversations. Every result identifies its meeting and source; unsupported questions are left unanswered."}</p>
    <div className="cross-ask-layout">
      <form className="panel cross-ask-form" onSubmit={ask}>
        <label className="field-label" htmlFor="cross-question">Your question</label>
        <textarea id="cross-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What commitments did the team make about onboarding?" rows={4} required maxLength={1000} />
        <div className="filter-row">
          <label>From<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label>To<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        </div>
        <label className="field-label" htmlFor="meeting-filter">Meetings <span className="field-help inline-help">Leave empty to search all.</span></label>
        <select id="meeting-filter" className="meeting-multiselect" multiple value={meetingIds.map(String)} onChange={(event) => setMeetingIds(Array.from(event.target.selectedOptions, (option) => Number(option.value)))} aria-label="Filter meetings for cross-meeting question">
          {meetings.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        {!readOnly && <label className="field-label inline-field">Answer mode<select className="compact-select" value={mode} onChange={(event) => setMode(event.target.value as "local" | "live_ai")}><option value="local">Local evidence retrieval</option><option value="live_ai" disabled={!provider?.live_ai_enabled}>Live AI {provider?.live_ai_enabled ? "(optional)" : "(not enabled)"}</option></select></label>}
        {mode === "live_ai" && <div className="privacy-notice"><label className="consent-label"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> I consent to sending the retrieved excerpts matching this question to {provider?.provider || "the configured AI provider"}.</label></div>}
        <div className="ask-form-footer"><span>{readOnly ? "Bundled sample excerpts only; no external request." : "Transcript text is treated as untrusted evidence, not instructions."}</span><button className="button button-dark" disabled={busy || !question.trim() || meetings.length === 0 || (mode === "live_ai" && !consent)}>{busy ? "Retrieving evidence…" : "Ask question ↗"}</button></div>
      </form>
      <div className="cross-ask-results" aria-live="polite">
        {error && <div className="alert" role="alert">{error}</div>}
        {!answer && !busy && <div className="empty-card"><div className="empty-visual"><span>✧</span></div><h3>Evidence first</h3><p>Answers are based on retrieved transcript passages. If no passage supports a response, EchoLens abstains.</p></div>}
        {busy && <div className="loading-card" role="status">Searching selected transcripts…</div>}
        {answer && <div className={`panel answer-card ${answer.supported ? "" : "insufficient"}`}><div className="answer-label">{answer.supported ? "RELEVANT EVIDENCE FOUND" : "INSUFFICIENT EVIDENCE"} · {answer.mode || "local evidence search"}</div><p>{answer.answer}</p>{answer.notice && <p className="muted">{answer.notice}</p>}{answer.evidence.map((item, index) => <EvidenceCard key={`${item.segment_id}-${index}`} evidence={item} />)}</div>}
      </div>
    </div>
  </section>;
}

function ActionManager({ onError, onOpen, meetings, readOnly }: { onError: (message: string) => void; onOpen: (meeting: Meeting) => void; meetings: Meeting[]; readOnly: boolean }) {
  const [items, setItems] = useState<Action[]>([]);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (query.trim()) params.set("q", query.trim());
      setItems(await api<Action[]>(`/api/actions${params.size ? `?${params}` : ""}`));
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status, query, onError]);

  useEffect(() => { void load(); }, [load]);

  const update = async (id: number, patch: Partial<Pick<Action, "task" | "owner" | "due_date" | "status">>) => {
    try {
      const updated = await api<Action>(`/api/actions/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      setItems((current) => current.map((item) => item.id === id ? updated : item));
    } catch (err) {
      onError((err as Error).message);
    }
  };

  const normalizedCounts = new Map<string, number>();
  for (const item of items) {
    const key = item.task.trim().toLocaleLowerCase().replace(/\s+/g, " ");
    normalizedCounts.set(key, (normalizedCounts.get(key) || 0) + 1);
  }

  const openActionMeeting = (action: Action) => {
    const meeting = meetings.find((item) => item.id === action.meeting_id);
    if (meeting) onOpen(meeting);
  };

  return <section className="section page-section">
    <div className="section-heading"><div><p className="eyebrow">FOLLOW-THROUGH</p><h1>Action items</h1><p>{DEMO_MODE ? "Editable tasks with evidence, saved in this browser profile." : "Persistent tasks linked to their originating transcript evidence."}</p></div><a className="button button-light" href={DEMO_MODE ? "#" : `${API}/api/actions/export.csv`} onClick={DEMO_MODE ? (event) => { event.preventDefault(); downloadBrowserActions(items); } : undefined}>↓ Export CSV</a></div>
    <form className="filter-row action-filters" onSubmit={(event) => { event.preventDefault(); void load(); }}>
      <label>Find tasks<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search task, owner, or meeting" /></label>
      <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="pending">Pending</option><option value="overdue">Overdue</option><option value="completed">Completed</option></select></label>
      <button className="button button-dark" disabled={loading}>Apply filters</button>
    </form>
    {loading ? <div className="loading-card" role="status">Loading action items…</div> : items.length ? <div className="action-manager-list">{items.map((item) => <ManagedAction key={item.id} item={item} readOnly={readOnly} repeated={(normalizedCounts.get(item.task.trim().toLocaleLowerCase().replace(/\s+/g, " ")) || 0) > 1} onOpenMeeting={() => openActionMeeting(item)} onSave={(patch) => update(item.id, patch)} onStatus={(next) => update(item.id, { status: next })} />)}</div> : <div className="empty-card"><h3>No action items found</h3><p>Tasks are extracted only when explicit follow-up language appears. Try another filter or import a meeting.</p></div>}
  </section>;
}

function ManagedAction({ item, repeated, readOnly, onOpenMeeting, onSave, onStatus }: {
  item: Action; repeated: boolean;
  readOnly: boolean;
  onOpenMeeting: () => void;
  onSave: (patch: Partial<Pick<Action, "task" | "owner" | "due_date">>) => void;
  onStatus: (status: string) => void;
}) {
  const [task, setTask] = useState(item.task);
  const [owner, setOwner] = useState(item.owner);
  const [dueDate, setDueDate] = useState(item.due_date);
  return <article className="panel managed-action">
    <div className="managed-action-top"><div><button className="action-meeting-link" type="button" onClick={onOpenMeeting}>{item.meeting_title}</button>{repeated && <span className="status-pill neutral">REPEATED TASK</span>}</div>{!readOnly && <select aria-label={`Status for ${item.task}`} value={item.status === "overdue" ? "open" : item.status} onChange={(event) => onStatus(event.target.value)}><option value="open">Pending</option><option value="completed">Completed</option></select>}</div>
    {item.status === "overdue" && <span className="overdue-label">OVERDUE · Due date has passed</span>}
    <label className="field-label" htmlFor={`task-${item.id}`}>Task description</label>{readOnly ? <p>{item.task}</p> : <textarea id={`task-${item.id}`} rows={2} value={task} onChange={(event) => setTask(event.target.value)} maxLength={2000} />}
    {readOnly ? <div className="action-meta"><span>Owner <strong>{item.owner || "Unassigned"}</strong></span><span>Due <strong>{item.due_date || "Not specified"}</strong></span></div> : <><div className="action-edit-grid"><label className="field-label" htmlFor={`owner-${item.id}`}>Owner<input id={`owner-${item.id}`} value={owner} onChange={(event) => setOwner(event.target.value)} maxLength={100} placeholder="Unassigned" /></label><label className="field-label" htmlFor={`due-${item.id}`}>Due date or date text<input id={`due-${item.id}`} value={dueDate} onChange={(event) => setDueDate(event.target.value)} maxLength={100} placeholder="Not specified" /></label></div><button className="button button-light button-small" disabled={task.trim() === item.task && owner === item.owner && dueDate === item.due_date} onClick={() => onSave({ task: task.trim(), owner, due_date: dueDate })}>Save changes</button></>}
    <EvidenceCard evidence={item.evidence} />
  </article>;
}

type AnalyticsData = {
  meeting_count: number;
  speaker_participation: Array<{ speaker: string; segment_count: number }>;
  speaking_time: { available: boolean; reason?: string; unit?: string; by_speaker?: Array<{ speaker: string; seconds: number }> };
  frequent_topics: Array<{ topic: string; meeting_count: number }>;
  topic_trends: Array<{ meeting_id: number; meeting_title: string; meeting_date: string; topics: string[] }>;
  recurring_blockers: Array<{ text: string; meeting_count: number }>;
  unresolved_questions: Array<{ meeting_id: number; meeting_title: string; text: string; evidence: Evidence }>;
};

function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (event?: FormEvent) => {
    event?.preventDefault();
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (from) params.set("date_from", from);
      if (to) params.set("date_to", to);
      setData(await api<AnalyticsData>(`/api/analytics${params.size ? `?${params}` : ""}`));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return <section className="section page-section">
    <p className="eyebrow">MEETING PATTERNS</p><h1>Conversation analytics</h1><p className="page-intro">Counts and trends derived from transcript content. No speaker performance scoring.</p>
    <form className="filter-row analytics-filters" onSubmit={load}><label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button className="button button-dark" disabled={loading}>Update analytics</button></form>
    {error && <div className="alert" role="alert">{error}</div>}
    {loading && <div className="loading-card" role="status">Calculating transcript-derived analytics…</div>}
    {!loading && data && <>
      <div className="analytics-summary"><div className="stat-card"><span className="stat-label">Meetings in range</span><strong>{data.meeting_count}</strong></div><div className="stat-card"><span className="stat-label">Speakers identified</span><strong>{data.speaker_participation.length}</strong></div><div className="stat-card"><span className="stat-label">Unresolved questions</span><strong>{data.unresolved_questions.length}</strong></div></div>
      <div className="summary-grid analytics-grid">
        <div className="panel"><div className="panel-title"><span className="panel-icon violet">◷</span><div><h3>Speaking-time distribution</h3><small>Shown only with complete speaker-attributed durations</small></div></div>{data.speaking_time.available ? data.speaking_time.by_speaker?.map((row) => <div className="analytics-row" key={row.speaker}><span>{row.speaker}</span><strong>{Math.round(row.seconds / 60)} min</strong></div>) : <p className="muted">{data.speaking_time.reason || "Duration data unavailable for these transcripts."}</p>}</div>
        <div className="panel"><div className="panel-title"><span className="panel-icon green">≡</span><div><h3>Speaker participation</h3><small>Transcript segments attributed to each speaker</small></div></div>{data.speaker_participation.length ? data.speaker_participation.map((row) => <div className="analytics-row" key={row.speaker}><span>{row.speaker}</span><strong>{row.segment_count} segments</strong></div>) : <p className="muted">Speaker labels are unavailable.</p>}</div>
        <div className="panel"><div className="panel-title"><span className="panel-icon violet">✦</span><div><h3>Frequently discussed topics</h3><small>Number of meetings where a topic appears</small></div></div>{data.frequent_topics.length ? data.frequent_topics.slice(0, 12).map((row) => <div className="analytics-row" key={row.topic}><span>{row.topic}</span><strong>{row.meeting_count} {row.meeting_count === 1 ? "meeting" : "meetings"}</strong></div>) : <p className="muted">No topics identified in this date range.</p>}</div>
        <div className="panel"><div className="panel-title"><span className="panel-icon amber">!</span><div><h3>Recurring blockers</h3><small>Matching blocker text across multiple meetings</small></div></div>{data.recurring_blockers.length ? data.recurring_blockers.map((row) => <div className="summary-point" key={row.text}><p>{row.text}</p><span className="muted">{row.meeting_count} meetings</span></div>) : <p className="muted">No repeated blocker text found.</p>}</div>
        <div className="panel panel-wide"><div className="panel-title"><span className="panel-icon amber">?</span><div><h3>Unresolved questions</h3><small>Evidence-linked open questions found in source transcripts</small></div></div>{data.unresolved_questions.length ? data.unresolved_questions.map((row, index) => <div className="summary-point" key={`${row.meeting_id}-${index}`}><strong className="analytics-meeting">{row.meeting_title}</strong><p>{row.text}</p><EvidenceCard evidence={row.evidence} /></div>) : <p className="muted">No unresolved questions identified.</p>}</div>
        <div className="panel panel-wide"><div className="panel-title"><span className="panel-icon violet">↗</span><div><h3>Topic trends across meetings</h3><small>Topics detected per meeting in date order</small></div></div>{data.topic_trends.length ? <div className="topic-trend-list">{data.topic_trends.map((row) => <div className="topic-trend" key={row.meeting_id}><div><strong>{row.meeting_title}</strong><small>{row.meeting_date || "Date not specified"}</small></div><div className="topic-list">{row.topics.length ? row.topics.map((topic) => <span className="topic-chip" key={topic}>{topic}</span>) : <span className="muted">No topics identified</span>}</div></div>)}</div> : <p className="muted">No meetings in this date range.</p>}</div>
      </div>
    </>}
  </section>;
}
