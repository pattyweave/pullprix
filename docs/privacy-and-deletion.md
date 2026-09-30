# PP-080 / PP-081: pilot policies and data deletion

Public routes `/privacy` and `/terms` describe the implemented pilot. Sign-in,
installation setup and the connected dashboard link to them. The pages disclose
raw GitHub payloads and review-comment content (including possible code excerpts),
team visibility, hosted Supabase/GitHub processing, browser session storage,
retention, deletion and the limited meaning of scores.

The user approved “Pull Prix” as the operator display name and proceeding with
the existing founder contact path. Both policies identify Patrick as the person
handling support/privacy requests through the private onboarding conversation.
No LLC or other legal entity suffix is asserted. New mail aliases are optional
until verified; their absence does not block internal implementation. Confirm
the registered legal identity when formed and add monitored domain addresses
when available. Confirm frontend hosting and actual log/export retention before
outside onboarding, using `pilot-onboarding.md`.
These are pilot drafts grounded in our implementation, not a certification of
legal compliance or a substitute for jurisdiction-specific review.

Reference guidance used in drafting:
- FTC: https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business
- Supabase backup behavior: https://supabase.com/docs/guides/platform/backups

## Actual deletion behavior

The existing worker invokes `process_data_deletions()` after each authorized
batch. It purges at most five organizations with `status='deleted'`. Last-app
uninstall already makes organization access inactive and stops new API work;
the subsequent maintenance transaction erases the stored organization. A
replacement active/suspended installation prevents automatic organization purge.
Operational target: within 24 hours of processing the last uninstall; failures
must be investigated, not silently treated as completion.

`delete_organization_data(uuid,bigint,text)` is service-only. It requires the exact
organization UUID and GitHub account ID. Reasons are `uninstalled` (requires all
installations deleted) or `verified_request` (operator has verified an admin).
The function removes:

- Raw webhook deliveries and related jobs, including jobs with no org FK.
- Active queue and archived queue messages associated with those jobs.
- Import/reconciliation cursors and errors.
- PR/review facts, score components/change history, scoring state and observations.
- Memberships, participants, repositories, installations and saved season results.
- Roster identities no longer used by another team or an authentication identity.

Minimal private records retain GitHub account/installation IDs, an opaque former
organization UUID, reason and completion timestamp. No repository names, review
content or score data survive in these records. They are retained for event
suppression and deletion verification. Old installation IDs stay blocked forever;
a genuinely new installation created after deletion can start fresh.

Webhook acceptance and lifecycle application serialize against deletion.
Suppressed events are acknowledged without payload persistence or queued work.
Stale workers cannot restore the deleted parent records. Shared GitHub identity
rows and Supabase Auth accounts remain independently usable by other teams.
Organization deletion does not remove anything from GitHub.

## Founder-operated request procedure

1. Verify the requester is an administrator of the precise GitHub organization,
   using the existing authenticated GitHub setup check or independent verified
   organization ownership. A claimed name/email or knowledge of a UUID is not
   authorization. Confirm they want all team data, including saved seasons,
   permanently removed. Ask them to uninstall; an existing installation is
   suppressed even if they leave it installed.
2. Look up the organization UUID and numeric GitHub account ID read-only. Check
   the organization name and installations with the requester. Do not copy raw
   payloads into support messages. Retain the authorization in restricted support
   records, not in a free-text database deletion reason.
3. Run this through the authenticated management connection, with reviewed exact
   values (never expose a service key to the browser):

   ```sql
   select public.delete_organization_data(
     '<verified-organization-uuid>'::uuid,
     <verified-github-account-id>::bigint,
     'verified_request'
   );
   ```

4. Verify the RPC returns `deleted: true`, the org no longer exists, and
   `private.deletion_audit` has a completion record. Repeated requests are safe.
   Tell the requester the active-data deletion completed and distinguish any
   independently retained account, support record, operational log or backup.
5. For an individual account request, verify the person separately. Supabase
   Auth account deletion is separate from organization deletion; do not erase
   another team's entire organization to fulfill an individual request. Inspect
   the specific person's team data and required rights with the organization
   before a scoped correction/deletion. No self-service personal opt-out is
   introduced by this ticket.

## Failure and recovery

Worker errors emit `data_deletion_failed` and retry next tick. Inspect the count
and age of `organizations.status='deleted'` without dumping private payloads.
Do not mark a request done until the transaction commits. Partial deletes roll
back together. A failing organization can block the bounded maintenance batch;
resolve its failure promptly and rerun. Ordinary scoring/ingestion still runs.

The database function cannot erase provider logs or copies already exported.
Maintain an inventory of manual exports and provider retention. For a deletion
request, remove affected operator-controlled exports or expire them according
to the communicated schedule; restrict any remaining recovery copies. Before a
restore, preserve the latest suppression/audit records outside the old backup,
restore in isolation, and reapply every subsequent deletion before enabling
webhooks, workers, sign-in or reads. Never restore an old backup directly into
an accessible service and allow erased data to reappear.

## Verification

Local regression tests exercise exact-target confirmation, cross-team isolation,
shared/unshared identities, full canonical and archived data cascades, import-job
references, service-only privileges, duplicate deletion, late known/unknown
installation events, and intentional new installation. Fixtures roll back; no
real customer or sandbox organization is used as a deletion test.
