import { PilotContact } from '../legal/LegalPages'
import { ScoringSummary } from '../setup/ScoringSummary'
export function PilotGuide() {
  return <main className="mx-auto max-w-2xl px-6 py-12 leading-relaxed">
    <p className="text-sm text-accent">Founder-supported private pilot</p>
    <h1 className="mt-3 text-3xl font-semibold">Get your team started</h1>
    <p className="mt-4">Pull Prix turns qualifying GitHub reviews into team standings. Keep reviewing in GitHub; use Pull Prix to follow the season. Patrick will help your team connect and check that real activity is coming through.</p>
    <section className="mt-8"><h2 className="text-xl font-semibold">For the organization owner</h2>
      <ol className="mt-3 list-decimal space-y-3 pl-6">
        <li>Arrange a kickoff with Patrick. Choose a small set of repositories and tell your team what information will be visible. Review the <a className="underline" href="/privacy">privacy policy</a> and <a className="underline" href="/terms">pilot terms</a>.</li>
        <li>Open the GitHub App installation link provided during kickoff. Select your organization and the repositories to include. An organization owner may need to approve installation or permissions.</li>
        <li>Return to Pull Prix and sign in with GitHub. Check the repository import status. Initial imports can take longer than the setup itself; you can enter the dashboard while they finish.</li>
        <li>Copy the private team link from your dashboard and share it with your team. There is no separate roster to maintain or season to launch.</li>
      </ol>
    </section>
    <section className="mt-8"><h2 className="text-xl font-semibold">What GitHub access allows</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li>Metadata and pull requests: identify selected repositories and read PR/review activity.</li>
        <li>Contents, read-only: check branch and review-rule metadata. GitHub grants a broader permission, but Pull Prix does not fetch source files or clone repositories. Webhooks and review comments may contain code excerpts.</li>
        <li>Organization members, read-only: verify who may enter the private team.</li>
      </ul>
      <p className="mt-3">Pull Prix does not write code, post reviews, or merge PRs. GitHub sign-in identifies each viewer separately from the app installation.</p>
    </section>
    <section className="mt-8"><h2 className="text-xl font-semibold">For developers and spectators</h2>
      <p className="mt-3">Open your team link and sign in with the GitHub account that has access. Verified organization members and collaborators on selected repositories can view the team. The activity-derived roster includes human PR authors and formal reviewers; authorized viewers without that activity can spectate.</p>
      <p className="mt-3">The import looks back 60 days to build the roster. Old activity does not earn retroactive championship points. A participant with no qualifying points starts on the start line. Scores describe review activity, not overall engineering performance.</p>
      <ScoringSummary />
    </section>
    <section className="mt-8"><h2 className="text-xl font-semibold">If something looks wrong</h2>
      <dl className="mt-3 space-y-4">
        <div><dt className="font-semibold">No team access</dt><dd>Check which GitHub account you used. Ask an owner to confirm organization membership or access to a selected repository.</dd></div>
        <div><dt className="font-semibold">Import unfinished or failed</dt><dd>Check repository setup on the dashboard. Managers can retry a failed import; email <a className="underline" href="mailto:support@pullprix.com">support@pullprix.com</a> if it fails again.</dd></div>
        <div><dt className="font-semibold">A score is missing</dt><dd>Allow processing time, refresh, and check the scoring rules. If it still looks wrong, email the PR link and approximate review time to <a className="underline" href="mailto:support@pullprix.com">support@pullprix.com</a>. Do not create extra reviews to test for points.</dd></div>
        <div><dt className="font-semibold">Leaving the pilot</dt><dd>An owner can uninstall the app in GitHub. Uninstalling the last installation starts team-data cleanup. For a verified deletion request or personal-data question, email <a className="underline" href="mailto:privacy@pullprix.com">privacy@pullprix.com</a>. See the <a className="underline" href="/privacy">retention and deletion policy</a>.</dd></div>
      </dl>
    </section>
    <section className="mt-8 rounded border border-line p-5"><h2 className="mb-3 text-xl font-semibold">Pilot support</h2><PilotContact />
      <p className="mt-3">Patrick handles onboarding and support directly. Agree on response hours and an urgent contact method during kickoff; this pilot does not include round-the-clock support or a guaranteed response time.</p>
      <p className="mt-3">We will check in after setup, at the season midpoint, and after the final results to hear what helped, what felt unfair, and whether your team wants another season.</p>
    </section>
    <a className="mt-8 inline-block rounded border border-line px-4 py-2" href="/sign-in">Sign in with GitHub</a>
  </main>
}
