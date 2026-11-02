import React from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getBrowserApiResponse } from "./browser-workspace";

vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");

let Home: React.ComponentType;
beforeAll(async () => {
  Home = (await import("./page")).default;
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  window.localStorage.clear();
});

describe("interactive browser workspace", () => {
  it("uses browser-local data for search and evidence Q&A without network calls", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<Home />);

    expect(await screen.findByText("Product planning — Q3 onboarding")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Search/ }));
    fireEvent.change(screen.getByLabelText("Search transcripts"), { target: { value: "setup friction" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("Customer research synthesis")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Ask across meetings/ }));
    fireEvent.change(await screen.findByLabelText("Your question"), {
      target: { value: "What did the team decide about the checklist?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Ask question/ }));
    expect(await screen.findByText(/Relevant transcript excerpts were found/)).toBeInTheDocument();
    expect(screen.getAllByText(/TRANSCRIPT EVIDENCE/).length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("imports, analyzes, and persists a transcript in browser storage", async () => {
    const originalFetch = vi.fn();
    vi.stubGlobal("fetch", originalFetch);
    render(<Home />);
    await screen.findByText("Product planning — Q3 onboarding");

    fireEvent.click(screen.getByRole("button", { name: /Import a meeting/i }));
    fireEvent.change(screen.getByLabelText("Transcript file"), {
      target: { files: [new File(["Rae: I will send the release plan by Friday.\nMina: We decided to test the update."], "notes.txt", { type: "text/plain" })] },
    });
    expect(await screen.findByText(/PREVIEW/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Meeting name"), { target: { value: "Browser test meeting" } });
    fireEvent.submit(screen.getByRole("button", { name: "Import meeting" }).closest("form")!);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const meetings = await getBrowserApiResponse("/api/meetings") as Array<{ title: string }>;
    expect(meetings.some((meeting) => meeting.title === "Browser test meeting")).toBe(true);
    expect(await screen.findByText("Browser test meeting")).toBeInTheDocument();
    expect(originalFetch).not.toHaveBeenCalled();
  });

  it("supports task edits and reset while keeping provider-dependent features unavailable", async () => {
    render(<Home />);
    await screen.findByText("Product planning — Q3 onboarding");

    fireEvent.click(screen.getByRole("button", { name: /Action items/ }));
    expect(await screen.findAllByText("Save changes")).not.toHaveLength(0);
    const task = screen.getAllByLabelText("Task description")[0];
    fireEvent.change(task, { target: { value: "Prepare the updated checklist" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" }).find((button) => !button.hasAttribute("disabled"))!);
    await waitFor(async () => {
      const actions = await getBrowserApiResponse("/api/actions") as Array<{ task: string }>;
      expect(actions.some((item) => item.task === "Prepare the updated checklist")).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    expect(await screen.findByText(/Unavailable in browser-only mode/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reset workspace/ })).toBeInTheDocument();
  });

  it("abstains without matching evidence and rejects audio imports explicitly", async () => {
    const answer = await getBrowserApiResponse("/api/ask", {
      method: "POST",
      body: JSON.stringify({ question: "Which spacecraft reached Neptune yesterday?" }),
    }) as { supported: boolean; evidence: unknown[] };
    expect(answer.supported).toBe(false);
    expect(answer.evidence).toHaveLength(0);

    await expect(getBrowserApiResponse("/api/meetings/audio/import", { method: "POST" }))
      .rejects.toThrow(/unavailable in browser-only mode/i);
  });

  it("preserves WebVTT timing and evidence through analytics, actions, and deletion", async () => {
    const form = new FormData();
    form.append("file", new File([
      "WEBVTT\n\n00:00:00.000 --> 00:00:03.500\nRae: I will send the release plan by Friday.\n",
    ], "captions.vtt", { type: "text/vtt" }));
    const meeting = await getBrowserApiResponse("/api/meetings/import?title=VTT%20review", {
      method: "POST",
      body: form,
    }) as { id: number; segments: Array<{ timestamp: string; duration_seconds: number; speaker: string }>; action_items: Array<{ id: number; owner: string; evidence: { excerpt: string } }> };

    expect(meeting.segments[0]).toMatchObject({
      timestamp: "00:00:00.000",
      duration_seconds: 3.5,
      speaker: "Rae",
    });
    expect(meeting.action_items[0]).toMatchObject({
      owner: "Rae",
      evidence: { excerpt: "I will send the release plan by Friday." },
    });
    const analytics = await getBrowserApiResponse(`/api/analytics?date_from=${new Date().toISOString().slice(0, 10)}`) as {
      speaking_time: { available: boolean };
    };
    expect(analytics.speaking_time.available).toBe(true);

    const updated = await getBrowserApiResponse(`/api/actions/${meeting.action_items[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" }),
    }) as { status: string };
    expect(updated.status).toBe("completed");
    await getBrowserApiResponse(`/api/meetings/${meeting.id}`, { method: "DELETE" });
    await expect(getBrowserApiResponse(`/api/meetings/${meeting.id}`)).rejects.toThrow(/not found/i);
  });

  it("exports meeting Markdown, text, and action CSV with their expected contents", async () => {
    const objectUrls = new Map<string, Blob>();
    const createObjectURL = vi.fn((blob: Blob) => {
      const url = `blob:export-${objectUrls.size}`;
      objectUrls.set(url, blob);
      return url;
    });
    const originalCreateObjectURL = URL.createObjectURL;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    const clickedLinks: HTMLAnchorElement[] = [];
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedLinks.push(this);
    });
    const readBlob = (blob: Blob) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read exported content."));
      reader.readAsText(blob);
    });

    try {
      render(<Home />);
      fireEvent.click(await screen.findByRole("button", { name: /Product planning — Q3 onboarding/ }));

      fireEvent.click(await screen.findByRole("link", { name: /Markdown/ }));
      await waitFor(() => expect(clickedLinks).toHaveLength(1));
      expect(clickedLinks[0].download).toBe("meeting-1.md");
      const markdown = await readBlob(objectUrls.get(clickedLinks[0].href)!);
      expect(markdown).toContain("# Product planning — Q3 onboarding");
      expect(markdown).toContain("Evidence: “We reviewed the onboarding drop-off");

      fireEvent.click(screen.getByRole("link", { name: /Text/ }));
      await waitFor(() => expect(clickedLinks).toHaveLength(2));
      expect(clickedLinks[1].download).toBe("meeting-1.txt");
      const plainText = await readBlob(objectUrls.get(clickedLinks[1].href)!);
      expect(plainText).toContain("Product planning — Q3 onboarding");
      expect(plainText).toContain("We decided to run the checklist test with the next cohort.");

      fireEvent.click(screen.getByRole("tab", { name: "Action items" }));
      fireEvent.click(await screen.findByRole("link", { name: /Export actions CSV/ }));
      await waitFor(() => expect(clickedLinks).toHaveLength(3));
      expect(clickedLinks[2].download).toBe("meeting-1-actions.csv");
      const csv = await readBlob(objectUrls.get(clickedLinks[2].href)!);
      expect(csv).toContain('"Task","Owner","Due date","Status","Evidence"');
      expect(csv).toContain('"I will prepare a revised checklist by Friday.","Leo","by Friday","open"');
      expect(csv).toContain('"The analytics event names are still unclear, and we need to clarify ownership."');
    } finally {
      clickSpy.mockRestore();
      if (originalCreateObjectURL) {
        Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
      } else {
        Reflect.deleteProperty(URL, "createObjectURL");
      }
    }
  });
});
