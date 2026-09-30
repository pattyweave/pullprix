# Product states — PP-064

Implemented for the connected dashboard. No backend/schema changes or production
frontend deployment; existing authorization and score calculations are unchanged.

| Condition | Explanation and recovery |
| --- | --- |
| Initial load | Loading status; no cached private team is displayed |
| Import waiting/queued/running | Visible completion count and incomplete-data notice; automatic setup recheck within a minute |
| Failed import | Visible attention notice; setup link opens repository details; only verified managers can retry |
| Cancelled import | Explain that import stopped; review repository selection or ask an owner |
| No selected repositories | Explain that none are connected and removed repositories stop importing new activity; setup action |
| Repository removed during this visit | Compare successive authorized setup results, show selection-change notice, never invent a removal reason |
| No participants | Explain how PR authors/formal reviewers enter the roster; use import/setup-specific copy when needed |
| Participants with zero points | Explain eligible formal reviews and point to the existing scoring rules |
| Partial review data | Explicitly label verified data so far; unavailable metrics remain unavailable; refresh/setup action |
| No active season | Explicit authorized `season: null` response gets a no-season state and retry; no invented empty scores |
| Missing permissions | Explain Members read-only approval; owner settings link and retry |
| Unavailable/suspended installation | Ask the owner to resume/reconnect the installation; settings link and retry |
| Membership/repository access denied | Clear private data; scoped account-check link and owner guidance |
| GitHub busy/unavailable | Specific explanation and retry; automatic rate-limit retries wait at least a minute |
| Backend unavailable/invalid data | Clear data, show retry, no fallback to demo values |

The current global calendar always supplies a season; the no-season handler is
forward-compatible defensive behavior, not a new season pause/publishing feature.
The API only returns currently selected repositories. A fresh session with no
repositories cannot distinguish removal from never having selected one, so the UI
uses neutral copy. Removal comparison is per mounted dashboard only. Earned points
remain governed by existing server scoring rules.

Manual refresh now forces both setup verification and snapshot refresh. Normal
verification remains every four minutes; incomplete imports use one minute.
Permission, access, signed-out, suspended/unavailable installation and verification-
limit failures pause timer retries until focus/manual recovery. They do not show
stale team data. Transient errors retain ordinary polling; GitHub rate-limit errors
back off for one minute. User-triggered retries remain available.

Browser auth exchange/refresh, installation setup and product requests have
20-second transport timeouts. Existing per-team scope checks, pagination bounds,
session behavior and replay semantics remain in force.

Validation: 432 application tests, production build, lint and diff checks pass
(existing bundle/Fast Refresh warnings). New cases cover explanations/recovery,
import progress/failure/stoppage, manager vs spectator controls, empty/zero-point
states, partial metrics, removed repository detection, manual setup recheck,
no-season scope checking and automatic retry pauses/backoff. Previous backend
coverage remains 618 assertions; no DB changes warranted rerunning it.
Visual browser QA remains unverified due to the previously encountered localhost
URL-policy block. No alternate browser or automation workaround was attempted.
