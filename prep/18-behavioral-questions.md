# 18 — Behavioral Questions (STAR)

**Truthfulness rule:** the Notion app is a **solo personal project** — for "teamwork/conflict/
leadership" stories, either (a) use your **professional** experience (MAQ Software SE2, Jul 2025–
present; Accenture SE, Dec 2021–May 2025) — which I can't fabricate details of, so those are marked
*[Fill from your real experience]* — or (b) answer honestly from the project where it applies (solo
decisions, self-driven learning, debugging under uncertainty). Never invent teammates, users, or
metrics for the personal project.

Format: **Q → what it tests → STAR skeleton grounded in truth → tips.**

---

## 1. "Tell me about yourself."
Tests: framing. **Answer:** Full-stack engineer, ~4.5 years (Accenture → MAQ Software), strongest in
React/TypeScript/Node. To go deeper on system design and real-time systems I built a Notion-style
collaborative workspace end-to-end — React + Yjs on the front, Express + MongoDB on the back — which
is where a lot of my recent architecture learning is concentrated. Keep it to 60–90s; end on the
project as a bridge to technical talk.

## 2. "Tell me about a challenging technical problem you solved." *(personal project — true)*
Tests: depth, ownership. **S:** collaborative editor needed real-time text **and** a queryable,
permission-aware document model. **T:** combine a CRDT with MongoDB without one clobbering the other.
**A:** made Yjs the source of truth for text and Mongo for structure, bridged by an internal `rev`
beacon; the client refresh merges DB changes but **skips locally dirty blocks**. **R:** conflict-free
collaboration with a searchable, permission-checked tree; I can articulate the trade-off (a small
reconciliation surface). *(See `15`.)*

## 3. "Describe a bug that was hard to track down." *(personal project — true)*
**S:** Google login logged users out on refresh; email login didn't. **T:** find why only OAuth
broke. **A:** the *difference* pointed at cookies, not auth logic — the refresh cookie was being set
on the Render host, not the Vercel origin the SPA calls. **A(fix):** routed the OAuth callback through
the Vercel proxy so the cookie is same-site. **R:** persistent sessions for both flows. **Lesson:**
when two similar paths diverge, the difference *is* the clue. *(See `15`.)*

## 4. "A time you had to learn something new quickly." *(personal project — true)*
CRDTs/Yjs and ProseMirror were new to me. I learned by building the smallest working per-block
binding, then layered offline (y-indexeddb), presence (awareness), and server persistence
(Hocuspocus). **Lesson:** de-risk unfamiliar tech with a vertical slice before committing the
architecture.

## 5. "Tell me about a trade-off you made." *(personal project — true)*
Ran the server with `tsx` at runtime instead of compiling, to stop fighting the deploy host's TS
version — accepting **no deploy-time type-check** in exchange for reliable deploys, with `tsc
--noEmit` kept locally and CI as the proper fix. I can defend both sides. *(See `13`/`14`.)*

## 6. "A time you disagreed with someone / handled conflict." *[Fill from your real experience]*
Tests: collaboration, EQ. Use a real MAQ/Accenture example. STAR skeleton: *S* the disagreement,
*T* your responsibility, *A* how you sought data/aligned on goals/compromised, *R* outcome + what you
learned. **Do not** invent one for the solo project.

## 7. "A time you received difficult feedback." *[Fill from your real experience]*
Real workplace example: the feedback, how you internalized it non-defensively, the concrete change
you made, the improved result.

## 8. "Tell me about a time you led something." *[Fill from your real experience]*
Could be leading a module, mentoring a junior, or driving a technical decision at Accenture/MAQ.
STAR it. If you want a project-based angle: you owned **every** architectural decision solo — frame
as *technical* leadership/ownership, not people-leadership.

## 9. "A time you failed or made a mistake." *(can use project — true)*
**Honest project version:** I shipped without server-side tests and later found two real bugs (malformed
JSON returning 500; a rate limiter silently no-op behind the proxy). **Lesson:** security/reliability
middleware must be tested in the deployed topology — "fails open" is worse than absent. I can state
the exact fixes. Shows self-awareness + concrete remediation.

## 10. "How do you prioritize when everything is urgent?" *[Fill / project-blend]*
Project version: I sequenced by **risk × blast radius** — auth and permissions first (security),
then the reconciliation correctness, then polish; deferred nice-to-haves (virtualization is installed
but unwired). Name the framework, then the example.

## 11. "Tell me about a time you improved performance." *(personal project — true)*
Editor re-render cost on large pages: normalized Zustand store (O(1) block lookups), per-block
ProseMirror instances, memoized rows, uncontrolled inputs, and debounced autosave (600 ms). **R:**
smooth typing on large docs. Be honest it's not load-tested with real users. *(See `09`.)*

## 12. "Why should we hire you / what are you strong at?"
End-to-end ownership: I designed, built, secured, and deployed a non-trivial real-time system solo,
and I can explain **every** trade-off honestly — including what I'd do differently. Pair that with
4.5 years of production React/TS/Node.

## 13. "What's your biggest weakness?"
Pick a true, improving one (e.g., I under-invested in automated server tests early; I've since made
"test the risky server paths first + CI gate" my default). Show the correction, not just the flaw.

## 14. "Where do you see gaps in your project?"
No CI/CD, no server tests, ephemeral uploads, single-instance realtime, hand-rolled server-state
cache. Naming these unprompted signals maturity — each has a clear upgrade path (`10`/`12`/`13`).

## 15. "Why this project / why does it matter to you?"
I wanted to understand collaborative systems (CRDTs, presence, offline) and full-lifecycle ownership
(auth, permissions, deploy) beyond CRUD — so I built the hardest version of that I could reason about
end to end.

---

### Tips
- For team/conflict/leadership/feedback questions, use **real** MAQ/Accenture stories — I've left
  those as placeholders because inventing them would violate truthfulness.
- For technical-depth, ownership, learning, failure, trade-off, debugging, and prioritization
  questions, the **project stories above are true and specific** — prefer them.
- Always land STAR on **R (result) + lesson**. Keep answers ~90 seconds.
