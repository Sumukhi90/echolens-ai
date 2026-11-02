import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Home from "./page";

const meeting = {
  id: 1, title: "Planning", meeting_date: "2026-10-30",
  source_filename: "meeting.txt", processing_status: "ready",
  created_at: "2026-10-30T00:00:00Z", segment_count: 1, action_count: 1,
};

function installApiMock() {
  const action = {
    id: 8, meeting_id: 1, meeting_title: "Planning", task: "Send the revised plan",
    owner: "Rae", due_date: "by Friday", status: "open",
    evidence: { segment_id: 9, excerpt: "I will send the revised plan by Friday.", speaker: "Rae", timestamp: "00:00:02" },
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    let response: unknown = [];
    if (url.pathname === "/api/meetings") response = [meeting];
    if (url.pathname === "/api/settings/provider") response = {
      mode: "local", provider: null, configured: false, live_ai_enabled: false,
      model: null, semantic_search_enabled: false, semantic_search_requested: false,
      semantic_search_available: false, semantic_model: "local", audio_transcription_available: false,
      privacy: "Transcript content stays local.",
    };
    if (url.pathname === "/api/ask") response = {
      answer: "Rae will send the revised plan.", supported: true, mode: "local evidence search",
      evidence: [{ ...action.evidence, meeting_id: 1, meeting_title: "Planning" }],
    };
    if (url.pathname === "/api/actions") response = [action];
    if (url.pathname === "/api/actions/8" && init?.method === "PATCH") response = { ...action, ...body };
    if (url.pathname === "/api/analytics") response = {
      meeting_count: 1,
      speaker_participation: [{ speaker: "Rae", segment_count: 1 }],
      speaking_time: { available: false, reason: "Durations unavailable." },
      frequent_topics: [{ topic: "planning", meeting_count: 1 }],
      topic_trends: [{ meeting_id: 1, meeting_title: "Planning", meeting_date: "2026-10-30", topics: ["planning"] }],
      recurring_blockers: [],
      unresolved_questions: [],
    };
    return { ok: true, status: 200, json: async () => response } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("EchoLens workspace", () => {
  it("shows local-first navigation and transcript import", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    }));
    render(<Home />);
    expect(screen.getByText("echolens")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Import a meeting/i })).toBeInTheDocument();
  });

  it("rejects unsupported import files before preview", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    }));
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: /Import a meeting/i }));
    fireEvent.change(screen.getByLabelText("Transcript or audio file"), {
      target: { files: [new File(["content"], "notes.pdf")] },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Unsupported file type");
    expect(screen.getByRole("button", { name: "Import meeting" })).toBeDisabled();
  });

  it("asks across meetings and displays meeting-linked evidence", async () => {
    const fetchMock = installApiMock();
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: /Ask across meetings/ }));
    fireEvent.change(await screen.findByLabelText("Your question"), {
      target: { value: "Who will send the revised plan?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Ask question/i }));
    expect(await screen.findByText("Rae will send the revised plan.")).toBeInTheDocument();
    expect(screen.getAllByText("Planning").length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/ask"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("supports editing persistent action status", async () => {
    const fetchMock = installApiMock();
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: /Action items/ }));
    expect(await screen.findByLabelText("Task description")).toHaveValue("Send the revised plan");
    fireEvent.change(screen.getByLabelText("Status for Send the revised plan"), {
      target: { value: "completed" },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/actions/8"),
      expect.objectContaining({ method: "PATCH" }),
    ));
  });

  it("shows analytics and explicitly labels unavailable duration data", async () => {
    installApiMock();
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: /Analytics/ }));
    expect(await screen.findByText("Conversation analytics")).toBeInTheDocument();
    expect(await screen.findByText("Durations unavailable.")).toBeInTheDocument();
    expect(screen.getAllByText("planning").length).toBeGreaterThan(0);
  });
});
