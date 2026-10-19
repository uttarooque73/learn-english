"use client";

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ShadowingPractice } from "@/components/shadowing-practice";

export default function PronunciationCoachPage() {
  return (
    <AppShell
      activePage="pronunciation-coach"
      title="Pronunciation Coach"
      subtitle="Practise a sentence, compare what was heard, and repeat the words that need attention."
    >
      <section className="fluency-intro shadowing-page-intro">
        <div>
          <span className="intro-label"><span className="status-dot" /> SPEAK · COMPARE · REPEAT</span>
          <h2>Make every word<br /><em>more confident.</em></h2>
          <p>Choose a target sentence, listen to the model, then speak into your microphone. Review word-level transcript differences and repeat at your own pace.</p>
          <p className="pronunciation-coach-note">
            Transcript matching is an estimate, not proof of correct pronunciation. If the optional local phoneme-assessment service is configured, the coach can provide more detailed sound feedback.
          </p>
          <Link className="text-link" href="/shadowing">Open full shadowing practice <span>→</span></Link>
        </div>
        <div className="fluency-intro-art" aria-hidden="true">
          <span>1</span><small>listen</small><i>→</i><span>2</span><small>speak</small><i>→</i><span>3</span><small>repeat</small>
        </div>
      </section>
      <ShadowingPractice />
    </AppShell>
  );
}
