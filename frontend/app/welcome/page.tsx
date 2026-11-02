import Link from "next/link";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default function WelcomePage() {
  return (
    <main className="landing">
      <header className="landing-nav">
        <Link className="brand" href="/"><span className="brand-mark">e</span><span>echolens<span className="brand-ai">.ai</span></span></Link>
        <Link className="landing-nav-link" href="/">Open workspace <span>↗</span></Link>
      </header>
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow"><span className="landing-dot" /> {DEMO_MODE ? "INTERACTIVE BROWSER WORKSPACE" : "CONVERSATION INTELLIGENCE, WITH RECEIPTS"}</p>
          <h1>Good meetings<br />deserve <span>good memory.</span></h1>
          <p className="landing-lede">{DEMO_MODE ? "Import TXT, Markdown, or WebVTT transcripts, explore evidence-linked analysis, and manage action items. Your data stays in this browser profile." : "Turn transcripts into clear decisions, thoughtful follow-ups, and answers you can trace back to the conversation."}</p>
          <div className="landing-actions"><Link className="button button-dark" href="/">Open your workspace <span>→</span></Link><a className="landing-secondary" href="#approach">See how it works <span>↓</span></a></div>
          <div className="landing-assurance"><span>◈</span> {DEMO_MODE ? "Browser-local processing" : "Local by default"} <i /> No API key needed <i /> Evidence-linked insights</div>
        </div>
        <div className="landing-preview" aria-label="Preview of evidence linked meeting notes">
          <div className="preview-window">
            <div className="preview-window-top"><div className="preview-dots"><i /><i /><i /></div><span>MEETING BRIEF</span><span className="preview-local">LOCAL ANALYSIS</span></div>
            <div className="preview-window-body"><span className="preview-kicker">PRODUCT PLANNING · SAMPLE</span><h2>Onboarding, made clearer.</h2><p className="preview-paragraph">The team agreed to simplify the first-run checklist and test it with the next cohort.</p>            <div className="preview-evidence"><span>✳ SOURCE EXCERPT · MAYA · SAMPLE</span><p>“We decided to run the checklist test with the next cohort.”</p></div><div className="preview-task"><span>○</span><div><strong>Prepare a revised checklist</strong><small>Leo · Due Friday</small></div><b>↗</b></div><div className="preview-proof"><span>✓</span> Claim linked to a transcript excerpt</div></div>
          </div>
          <div className="preview-note"><span>✦</span><div><strong>Evidence, not guesswork.</strong><small>Every insight keeps the source in view.</small></div></div>
        </div>
      </section>
      <section className="landing-principles" id="approach">{DEMO_MODE ? <><div><span>01</span><strong>Bring a transcript</strong><p>Import TXT, Markdown, or WebVTT files up to 2 MB.</p></div><div><span>02</span><strong>Explore the evidence</strong><p>Review deterministic summaries, decisions, tasks, search, and cited Q&A.</p></div><div><span>03</span><strong>Keep control</strong><p>Workspace data stays in this browser profile and can be reset at any time.</p></div></> : <><div><span>01</span><strong>Bring the conversation</strong><p>Import TXT, Markdown, or WebVTT transcripts. Preview before saving.</p></div><div><span>02</span><strong>Find the signal</strong><p>Review topics, decisions, action items, questions, and risks.</p></div><div><span>03</span><strong>Check the source</strong><p>Open the supporting excerpt—or get a clear “not enough evidence.”</p></div></>}</section>
      <footer className="landing-footer"><span>echolens.ai</span><span>{DEMO_MODE ? "Browser-local storage · No application API or external AI" : "Local-first meeting intelligence · No external AI calls"}</span><Link href="/">{DEMO_MODE ? "Open workspace →" : "Enter workspace →"}</Link></footer>
    </main>
  );
}
