# Team access — PP-054

Status: implemented and deployed. User authorized the additional access rules on
2026-09-28 with the expectation that admission policy can be adjusted later.

## Pilot rules

- The account team picker remembers previously connected active teams even when
  their five-minute access lease expires. Its names/entry links are navigation,
  not authorization. Opening a dashboard rechecks GitHub through installation
  setup; protected data continues to require a current lease. Explicit local
  membership revocation, inactive installations/organizations and removed
  collaborator proof repositories hide the entry. A denied GitHub recheck can
  leave a remembered link visible but never permits dashboard data access.
  Migration `20260930010000_pp086_team_directory.sql` fixes disappearing links.

- GitHub sign-in establishes numeric identity through Supabase Auth.
- Personal installation owners and active GitHub organization admins are Pull Prix
  administrators. Repository admin permissions alone do not confer installation
  administration. Delegated GitHub App managers are not separately recognized yet.
- Active organization members may view the organization's team dashboard.
- Outside collaborators (including on personal installations) may view it when
  GitHub confirms a collaborator grant on at least one repository currently
  selected for that installation. A public repository's readability, an invitation,
  old activity or possession of a team link is not sufficient.
- An admitted viewer with an active, eligible activity-derived participant row is
  a participant. Other admitted viewers are spectators. An admin may also be an
  active participant. Admission never creates or reactivates participant records.
- Participants and spectators can view the same organization-level dashboard,
  roster and season. This does not confer GitHub repository permissions or prove
  access to every selected repository. Future PR recommendations must separately
  verify the specific repository (PP-063).
- Only freshly verified administrators may retry failed imports. GitHub controls
  installation and repository-selection changes. No role can configure seasons,
  theme, scoring, or grants through the browser.

## Enforcement

`installation-setup/github.ts` verifies the live installation and membership.
Organization membership requires matching numeric user and organization IDs,
active state, and a recognized role. Outside collaborators require both a 204
collaborator check and a matching numeric identity with read/write/admin access
from the repository permission endpoint. Repository candidates come from the
installation's live repository listing, never browser parameters.

The check uses only Metadata read and existing Members read permissions. Tokens
stay server-side in memory. Missing permissions, network/rate-limit failures and
uncertain identity fail closed. Outside-collaborator enumeration is bounded to
10 pages of 100 repositories and a 20-second work deadline (individual requests
have 10-second timeouts); reaching the limit reports an unavailable check, not
an access grant. Larger installations may need a different lookup strategy.

`complete_team_access` is service-only. It reuses the live-session, installation,
account and local-revocation checks, derives participant/spectator classification
from trusted roster rows, and records access_role plus any repository proof.
Only this role-aware entry point is callable by the service HTTP client; the old
`complete_installation_setup` function is now an internal implementation detail.

Membership leases remain five minutes. Every dashboard fetch and retry rechecks
GitHub; a failed GitHub check expires the prior lease immediately. RLS additionally
rejects removed/suspended installations, inactive proof repositories, revoked
sessions and explicit local revocations. External removal has at most the existing
five-minute lease delay for direct RLS reads when no recheck occurs. Demotion on a
forbidden retry persists the new role but never queues a job.

A failed login/access check does not rewrite scoring history or infer a participant
employment/departure date. Canonical activity and scorer access windows retain
responsibility for historical eligibility.

## Adjusting or narrowing the policy

Change the server verifier admission branches and their tests, then redeploy
`installation-setup`; no roster or score reset is needed. When restricting existing
viewers immediately, expire the affected installation-backed leases through a
service/operator migration after changing the verifier. Do not reactivate locally
revoked memberships or restore the old role-unaware HTTP entry point.

## Verification

- 357 application tests and 604 DB assertions pass; build/lint pass with existing
  warnings. Tests include ordinary members, collaborators, pending/mismatched
  identities, public non-collaborators, participant/spectator classification,
  forged browser roles, demotion, local revocation, proof repository removal,
  cross-team isolation and forbidden import retries.
- Read-only live GitHub verification confirmed pattyweave is an administrator and
  Hollistud is an ordinary organization member. It created no user sessions/grants.
- Migration `20260928080000_pp054_team_access.sql` and the updated function deployed.
- Live browser owner session verified after deployment. Additional-user complete
  OAuth sessions were not impersonated; those paths have API/DB test coverage.

References: [GitHub collaborator APIs](https://docs.github.com/en/rest/collaborators/collaborators),
[GitHub organization membership](https://docs.github.com/en/rest/orgs/members).
