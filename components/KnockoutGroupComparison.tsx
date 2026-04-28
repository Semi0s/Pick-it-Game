import Link from "next/link";
import type { GroupBracketComparisonView, BracketHealthStatus } from "@/lib/bracket-predictions";

type KnockoutGroupComparisonProps = {
  view: GroupBracketComparisonView;
};

export function KnockoutGroupComparison({ view }: KnockoutGroupComparisonProps) {
  if (view.groups.length === 0) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Group Standings</p>
        <h2 className="mt-2 text-2xl font-black leading-tight">No group bracket view yet.</h2>
        <p className="mt-3 text-base leading-7 text-gray-600">
          Join a group to compare knockout picks with other players once bracket selections are available.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Group Bracket Comparison</p>
        <h2 className="mt-2 text-2xl font-black leading-tight">{view.selectedGroupName ?? "Your group"}</h2>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {view.groups.map((group) => {
            const isActive = group.id === view.selectedGroupId;
            return (
              <Link
                key={group.id}
                href={`/knockout?group=${encodeURIComponent(group.id)}`}
                className={`whitespace-nowrap rounded-md border px-3 py-2 text-sm font-bold ${
                  isActive ? "border-accent bg-accent-light text-accent-dark" : "border-gray-300 bg-white text-gray-700"
                }`}
              >
                {group.name}
              </Link>
            );
          })}
        </div>
        {view.mostPickedChampion ? (
          <p className="mt-4 text-sm font-semibold text-gray-700">
            Most-picked champion: <span className="font-black text-gray-950">{view.mostPickedChampion.name}</span>{" "}
            <span className="text-gray-500">({view.mostPickedChampion.count} picks)</span>
          </p>
        ) : (
          <p className="mt-4 text-sm font-semibold text-gray-700">
            No champion picks have been saved for this group yet.
          </p>
        )}
      </div>

      <div className="space-y-3">
        {view.members.map((member) => {
          const badge = getStatusBadge(member.status);
          const finalistsLabel = member.finalistNames.length > 0 ? member.finalistNames.join(" vs ") : "No finalists yet";
          return (
            <Link
              key={member.userId}
              href={`/knockout?group=${encodeURIComponent(view.selectedGroupId ?? "")}&player=${encodeURIComponent(member.userId)}`}
              className={`block rounded-lg border p-4 transition ${
                member.userId === view.selectedPlayerId
                  ? "border-accent bg-accent-light/40"
                  : "border-gray-200 bg-white hover:border-accent-light hover:bg-gray-50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-black text-gray-950">{member.name}</h3>
                  <p className="mt-1 text-sm font-semibold text-gray-700">
                    Champion: <span className="font-black text-gray-950">{member.championPickName ?? "Not picked yet"}</span>
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-600">Finalists: {finalistsLabel}</p>
                  {member.championPickName ? (
                    <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                      {member.isUniqueChampionPick ? "Unique pick" : `${member.championPickCount} players picked this champion`}
                    </p>
                  ) : null}
                </div>
                <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-black ${badge.className}`}>
                  <span aria-hidden>{badge.icon}</span>
                  {badge.label}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {view.selectedPlayerBracket ? (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Full Bracket</p>
              <h3 className="mt-1 text-2xl font-black leading-tight text-gray-950">{view.selectedPlayerBracket.name}</h3>
              <p className="mt-2 text-sm font-semibold text-gray-700">
                Champion:{" "}
                <span className="font-black text-gray-950">
                  {view.selectedPlayerBracket.championPickName ?? "No champion pick yet"}
                </span>
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-600">
                Finalists: {view.selectedPlayerBracket.finalistNames.length > 0 ? view.selectedPlayerBracket.finalistNames.join(" vs ") : "No finalists yet"}
              </p>
            </div>
            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-black ${getStatusBadge(view.selectedPlayerBracket.status).className}`}>
              <span aria-hidden>{getStatusBadge(view.selectedPlayerBracket.status).icon}</span>
              {getStatusBadge(view.selectedPlayerBracket.status).label}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {view.selectedPlayerBracket.matches.map((match) => (
              <div key={match.matchId} className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{match.stageLabel}</p>
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                    {match.status === "scheduled" ? "Scheduled" : match.status === "live" ? "Live" : "Final"}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-gray-700">
                  {match.homeTeamName} vs {match.awayTeamName}
                </p>
                <p className="mt-2 text-sm font-semibold text-gray-700">
                  Picked winner: <span className="font-black text-gray-950">{match.predictedWinnerName ?? "No pick yet"}</span>
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-600">
                  Actual winner: {match.actualWinnerName ?? "Not decided yet"}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function getStatusBadge(status: BracketHealthStatus) {
  if (status === "alive") {
    return {
      icon: "🔥",
      label: "Alive",
      className: "bg-emerald-100 text-emerald-900"
    };
  }

  if (status === "eliminated") {
    return {
      icon: "❌",
      label: "Eliminated",
      className: "bg-rose-100 text-rose-900"
    };
  }

  return {
    icon: "⚠️",
    label: "At Risk",
    className: "bg-amber-100 text-amber-900"
  };
}
