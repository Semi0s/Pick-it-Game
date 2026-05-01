import { AppShell } from "@/components/AppShell";

const HELP_SECTIONS = [
  {
    title: "Make Your Picks",
    bullets: [
      "Predict the score for each match",
      "Review the score and save to confirm each pick",
      "Your picks lock when the match starts"
    ],
    tip: "You can use Auto Pick for the next open unsaved match, then review before saving."
  },
  {
    title: "How You Score Points",
    bullets: [
      "Correct winner or draw: +3 points",
      "Exact goal difference with the right outcome: +1 more point",
      "Exact score with the right outcome: +5 more points"
    ],
    tip: "The closer your prediction, the more you earn."
  },
  {
    title: "Knockout Bracket Scoring",
    bullets: [
      "Knockout picks score the correct winner only",
      "Round of 32 and third-place picks do not award points",
      "Round of 16: +5 points",
      "Quarterfinals: +10 points",
      "Semifinals: +15 points",
      "Final: +20 points",
      "Champion: +25 bonus points from your Final winner pick"
    ],
    tip: "Bracket points are tracked separately from your group-stage leaderboard total for now."
  },
  {
    title: "Play in Groups",
    bullets: [
      "You can join one group or multiple groups",
      "Each group has its own leaderboard",
      "Use group and team filters to focus your picks",
      "See how you rank against your friends"
    ]
  },
  {
    title: "See Your Results",
    bullets: [
      "Check global standings and group standings",
      "Use the leaderboard view controls to change focus"
    ]
  },
  {
    title: "Track Your Predictions",
    bullets: [
      "Review saved picks once matches lock",
      "See social picks after kickoff",
      "Watch your score grow over time"
    ]
  },
  {
    title: "Your Profile",
    bullets: [
      "See your name, role, and home team",
      "Manage notifications and password settings"
    ]
  },
  {
    title: "Need Another Invite?",
    bullets: [
      "Didn’t get in properly? Try the invite link again",
      "Still stuck? Ask your group admin for a new invite"
    ]
  }
] as const;

const QUICK_TIPS = [
  "Make your picks before a match starts",
  "Auto Pick suggests a score but never saves it for you",
  "Use the group table on My Picks to preview how your saved scores affect a group",
  "Bracket points are separate from the main leaderboard for now",
  "Create and manage groups to build different pools"
] as const;

export default function HelpPage() {
  return (
    <AppShell>
      <div className="space-y-5">
        <section className="rounded-lg bg-gray-100 p-5">
          <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Help</p>
          <h1 className="mt-2 text-3xl font-black leading-tight text-gray-950">
            Welcome to PICK-IT! <span aria-hidden="true">⚽</span>
          </h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-gray-600">
            Predict match scores, compete with friends, and climb the leaderboard.
          </p>
        </section>

        <div className="space-y-3">
          {HELP_SECTIONS.map((section, index) => (
            <section key={section.title} className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                {index + 1}. {section.title}
              </p>
              <div className="mt-3 space-y-2">
                {section.bullets.map((bullet) => (
                  <p key={bullet} className="text-sm font-semibold leading-6 text-gray-800">
                    • {bullet}
                  </p>
                ))}
              </div>
              {"tip" in section && section.tip ? (
                <p className="mt-3 rounded-md bg-accent-light px-3 py-2 text-sm font-semibold text-accent-dark">
                  Tip: {section.tip}
                </p>
              ) : null}
            </section>
          ))}
        </div>

        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Quick Tips</p>
          <div className="mt-3 space-y-2">
            {QUICK_TIPS.map((tip) => (
              <p key={tip} className="text-sm font-semibold leading-6 text-gray-800">
                • {tip}
              </p>
            ))}
          </div>
        </section>

        <section className="rounded-lg bg-gray-100 p-4">
          <p className="text-sm font-semibold leading-6 text-gray-800">
            That’s it. Simple, competitive, and fun. Now go make your picks <span aria-hidden="true">⚽🔥</span>
          </p>
        </section>
      </div>
    </AppShell>
  );
}
