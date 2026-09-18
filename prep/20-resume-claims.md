# 20 — Resume Claims Verification

**Purpose:** every Notion bullet on your resume, checked against the actual code, with an
interview-risk rating and safe wording. **Bottom line: your resume is accurate and, if anything,
conservative.** Defend it confidently; the notes below are how to back each phrase with code.

Legend: ✅ accurate · ⚠️ defensible but clarify · ❌ would not survive scrutiny (none here).

---

## Bullet 1 — "Architected and deployed a full-stack collaborative workspace (React, TS, Zustand, Node, MongoDB, Yjs, WebSockets); TypeScript/Express backend exposing 40+ REST endpoints across 11+ data models."

| Phrase | Evidence in code | Accurate? | Risk | Wording guidance |
|---|---|---|---|---|
| React, TS, Zustand, Node, MongoDB, Yjs, WebSockets | all present (client+server) | ✅ | none | — |
| "Architected and deployed" | solo design + live on Vercel/Render/Atlas | ✅ | none | true; own it as solo end-to-end |
| **"40+ REST endpoints"** | actual count ≈ **65** across modules | ✅ (conservative) | none | you can say "over 40" or "around 60"; either is safe |
| **"11+ data models"** | actual ≈ **15–17** Mongoose models | ✅ (conservative) | none | "11+" undersells; comfortable saying "~15" |
| "TypeScript/Express backend" | Express + TS, run via `tsx` | ✅ | low | if asked about build: honest `tsx`-runtime story (`13`) |

**Verdict:** ✅ Accurate and understated. Be ready to name models (`04`) and count endpoints by module.

---

## Bullet 2 — "Real-time collaborative editing using Yjs CRDTs + Hocuspocus over WebSockets — conflict-free sync, live presence tracking, offline-first document editing."

| Phrase | Evidence | Accurate? | Risk | Guidance |
|---|---|---|---|---|
| Yjs CRDTs | `Y.Doc` per page, `Y.XmlFragment` per block | ✅ | none | — |
| Hocuspocus over WebSockets | `@hocuspocus/server` + `@hocuspocus/provider` | ✅ | none | — |
| "conflict-free sync" | CRDT convergence via y-prosemirror | ✅ | none | explain determinism (`06`) |
| "live presence tracking" | Yjs **awareness** → cursors/avatars | ✅ | low | clarify it's awareness-based, ephemeral (not persisted) |
| **"offline-first"** | **y-indexeddb hydrates before connect** | ✅ | low | strong claim — back it: IndexedDB persistence + reconnect |

**Verdict:** ✅ Fully supported. This is your strongest, most impressive bullet — lead with it.

---

## Bullet 3 — "Recursive block-based editor with normalised Zustand state, O(1) block lookups, 600ms debounced autosave; responsive for large documents."

| Phrase | Evidence | Accurate? | Risk | Guidance |
|---|---|---|---|---|
| "recursive block-based editor" | pages = trees of blocks, nested rendering | ✅ | none | — |
| "normalised Zustand state" | `byId` / `childrenOf` / `rootByPage` | ✅ | none | describe the normalized shape (`07`) |
| **"O(1) block lookups"** | map access by id | ✅ | low | true for lookup; note reorder/child ops are O(children), not O(1) — don't overclaim whole-tree ops |
| **"600ms debounced autosave"** | debounce = 600 ms in code | ✅ | none | exact match; also mention 400 ms HTML projection |
| **"responsive for large documents"** | per-block PM + memo + uncontrolled inputs | ⚠️ | medium | **not load-tested with real users**; say "designed for responsiveness" — react-window is installed but **not yet wired**. Don't claim benchmarked numbers. |

**Verdict:** ✅ Accurate; only soften "responsive for large documents" to a design claim, and never
invent a benchmark. Volunteer that virtualization is installed-but-unwired if pressed — it reads as
honesty.

---

## Bullet 4 — "Hierarchical authorisation: workspace roles, inherited page-level permissions, guest access, secure public sharing, invitation workflows."

| Phrase | Evidence | Accurate? | Risk | Guidance |
|---|---|---|---|---|
| workspace roles | guest < member < admin < owner | ✅ | none | — |
| "inherited page-level permissions" | ancestor-walk resolver + cache | ✅ | none | explain inheritance + bulk guard (`05`) |
| guest access | guest role + guest grants | ✅ | none | — |
| "secure public sharing" | ShareLinks (password/expiry) | ✅ | low | describe the gate; mention 404-not-403 as a security touch |
| invitation workflows | invitations module + store | ✅ | none | — |

**Verdict:** ✅ Fully supported. Pair with the "404 not 403" detail to sound security-aware.

---

## Skills line spot-check

| Skill claimed | In this project? | Note |
|---|---|---|
| React, TS, JS ES6+ | ✅ | core |
| Tailwind | ✅ | styling + theme tokens |
| Zustand | ✅ | 11 stores |
| **Redux/RTK** | ⚠️ not in this repo | true skill, just **not used here** — say "chose Zustand for this project; used Redux/RTK elsewhere." Don't imply this app uses Redux. |
| Yjs, Hocuspocus, WebSockets | ✅ | realtime layer |
| Node, Express, REST | ✅ | backend |
| MongoDB, Mongoose | ✅ | data layer |
| **MySQL** | ⚠️ not in this repo | fine as a general skill; this project is Mongo only |
| Jest, RTL | ✅ | ~51 client tests |
| Vite | ✅ | bundler |
| **CI/CD** | ⚠️ **no pipeline in this repo** | deploys are push-to-deploy via Vercel/Render. If asked "CI/CD in the Notion project?" answer honestly: "platform auto-deploy on push; no GitHub Actions yet — that's my top DevOps improvement." You hold GH-300/GH-500 certs, so CI/CD as a *skill* is legitimate. |

---

## The only 3 things to be careful about (and exact safe phrasing)

1. **"Responsive for large documents"** → *"Architected for responsiveness with per-block editors and
   a normalized store; I haven't load-tested it with real users, and virtualization is wired-in-code
   but not yet enabled."*
2. **Redux/RTK & MySQL** are on your **skills** line, not the project — if an interviewer conflates
   them, clarify: *"This project uses Zustand and MongoDB; Redux and MySQL are skills from other
   work."*
3. **CI/CD** → *"For this project, deployment is push-to-deploy on Vercel/Render; a CI gate with
   server tests is my next step."*

**Everything else on the resume is backed by code — often understated. Go in confident.**
