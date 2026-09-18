# 10 — Scalability

Framing: this is a **personal project** currently running a single API instance, a single realtime
instance, and MongoDB Atlas. The question is how the architecture would **evolve** — and each change
must fix a **specific bottleneck**, not just be a buzzword.

---

## Current bottlenecks (honest list) [Confirmed]

1. **Single realtime process, in-memory rooms** — can't add instances without a shared backend.
2. **In-memory OAuth state + rate-limit stores** — per-instance; breaks when API scales out.
3. **Unpaginated list queries** — sidebar/comments/search return full sets.
4. **Local-disk uploads on one host** — not shared, ephemeral on Render.
5. **Search likely a scan** — O(docs) without a text index.
6. **No caching layer** — every read hits Mongo.
7. **Two sources of truth (Mongo/Yjs)** — reconciliation cost grows with concurrency.

---

## Scenario: 10× traffic — what breaks first?

- **First to break:** the **realtime instance** (WebSocket connections + in-memory Y.Docs are
  memory-bound) and **unpaginated queries** (sidebar/search).
- **Fixes:**
  - Paginate list endpoints (cursor on `{createdAt,_id}`) and lazy-load the sidebar tree.
  - Add a **text index** (Mongo `$text` or Atlas Search) for search.
  - Vertically scale the realtime process; add connection limits + backpressure.
  - Move OAuth state + rate-limit counters to **Redis** so you can run 2+ API instances behind a
    load balancer.

## Scenario: 100× traffic — architecture changes

- **API tier:** run **N stateless API instances** behind a load balancer. Prereq: externalize all
  in-memory state (Redis for rate limits/OAuth state), keep JWT stateless (already is).
- **Realtime tier:** the hard part. Introduce a **shared document backend** (Redis pub/sub via a
  Hocuspocus scaling extension or `y-redis`) so **any** realtime instance can serve **any** room;
  route WebSocket upgrades by `hash(documentName)` with **sticky sessions**. This removes the
  single-instance ceiling.
- **Database:** enable **read replicas** for read-heavy paths (sidebar, search, page loads); keep
  writes on primary. Add **Redis cache** for hot reads (page metadata, membership/permission
  resolution) with careful invalidation on writes.
- **Uploads:** switch `storageDriver` to **S3** + CloudFront/**CDN** (abstraction already exists).
- **Compression + CDN** for API responses and assets.

## Scenario: 1,000,000 users — how it evolves

- **Sharding:** shard MongoDB on **`workspaceId`** — most queries are already workspace-scoped, so
  the shard key gives good locality and avoids scatter-gather. Blocks/pages/comments co-locate by
  workspace.
- **Realtime at scale:** a fleet of realtime nodes with a consistent-hash router keyed on pageId;
  room ownership + presence via Redis; consider moving Yjs persistence to an append-only update log
  and periodic snapshot compaction instead of a single snapshot doc.
- **Search:** dedicated engine (Elasticsearch/OpenSearch or Atlas Search) fed by change streams.
- **Async work:** a **queue** (BullMQ/SQS) for emails, notifications fan-out, image processing,
  history archiving, trash purge — off the request path.
- **Multi-region:** CDN for the SPA (already on Vercel), regional API + realtime, geo-routed;
  Mongo global clusters for locality.
- **Observability:** metrics (Prometheus/Grafana), tracing (OpenTelemetry), structured logs, alerts.

---

## Component-by-component scaling table

| Component | Today | 100× | 1M users |
|---|---|---|---|
| SPA | Vercel static | same (CDN) | multi-region CDN |
| API | 1 Node instance | N behind LB + Redis | autoscaling + read replicas |
| Realtime | 1 Hocuspocus | sharded + Redis pub/sub, sticky | consistent-hash fleet, update-log persistence |
| DB | Atlas single | replicas + cache | sharded on workspaceId |
| Search | Mongo scan/index | `$text`/Atlas Search | dedicated cluster via change streams |
| Uploads | local disk | S3 + CDN | S3 + CDN multi-region |
| Async | inline/interval | queue workers | queue + autoscaling workers |
| Sessions/limits | in-memory | Redis | Redis cluster |

---

## What I would NOT do (and why)
- **No microservices split** beyond REST/realtime yet — premature; the two-process boundary already
  matches the real scaling axis (request/response vs long-lived sockets).
- **No Kafka** unless there's a real event-streaming need — a job queue covers async work.
- **No premature sharding** — add replicas + caching + pagination first; shard only when a single
  primary's write throughput is the proven limit.

## Likely questions
1. "100× traffic — what breaks first and why?" *(realtime memory + unpaginated queries.)*
2. "How do you scale WebSockets horizontally?" *(shared pub/sub + sticky routing by pageId.)*
3. "Pick a shard key and justify it." *(`workspaceId` — query locality.)*
4. "Where would a cache help most, and how do you invalidate it?" *(permission/membership +
   page metadata; invalidate on write / short TTL.)*
5. "What moves off the request path first?" *(emails, notification fan-out, image processing.)*
