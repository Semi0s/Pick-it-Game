"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchAdminMatches, type AdminMatch } from "@/lib/admin-data";
import { scoreFinalizedGroupMatch, updateAdminMatchResultAction } from "@/app/admin/actions";
import { formatMatchStage } from "@/lib/match-stage";
import { getPredictionStateLabel } from "@/lib/prediction-state";
import type { MatchStage, MatchStatus } from "@/lib/types";
import { AdminHeader } from "@/components/admin/AdminInvitesClient";
import { getMatchDateKey } from "@/lib/tournament-calendar";

const stages: ("all" | MatchStage)[] = [
  "all",
  "group",
  "round_of_32",
  "r32",
  "round_of_16",
  "r16",
  "quarterfinal",
  "qf",
  "semifinal",
  "sf",
  "third",
  "final"
];

export function AdminMatchesClient() {
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<"all" | MatchStage>("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadMatches();
  }, []);

  useEffect(() => {
    if (!message) {
      return;
    }

    const timeout = window.setTimeout(() => setMessage(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [message]);

  async function loadMatches() {
    setIsLoading(true);
    try {
      setMatches(await fetchAdminMatches());
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setIsLoading(false);
    }
  }

  const dateOptions = useMemo(
    () => Array.from(new Set(matches.map((match) => getMatchDateKey(match.kickoffTime)))),
    [matches]
  );
  const filteredMatches = matches.filter((match) => {
    const stageMatches = stageFilter === "all" || match.stage === stageFilter;
    const dateMatches = dateFilter === "all" || getMatchDateKey(match.kickoffTime) === dateFilter;
    return stageMatches && dateMatches;
  });

  return (
    <div className="space-y-5">
      <AdminHeader eyebrow="Matches" title="Update match results." />
      {message ? <FloatingAdminToast tone={message.tone} message={message.text} onDismiss={() => setMessage(null)} /> : null}

      <section className="grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2">
        <label>
          <span className="text-sm font-bold text-gray-700">Stage</span>
          <select
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value as "all" | MatchStage)}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base"
          >
            {stages.map((stage) => (
              <option key={stage} value={stage}>
                {stage === "all" ? "All stages" : formatStage(stage)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-sm font-bold text-gray-700">Date</span>
          <select
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base"
          >
            <option value="all">All dates</option>
            {dateOptions.map((date) => (
              <option key={date} value={date}>
                {formatDateTime(`${date}T12:00:00Z`, false)}
              </option>
            ))}
          </select>
        </label>
      </section>

      {isLoading ? <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold">Loading matches...</p> : null}

      <section className="space-y-3">
        {filteredMatches.map((match) => (
          <MatchResultCard
            key={match.id}
            match={match}
            onSaved={(updatedMatch) => {
              setMatches((currentMatches) =>
                currentMatches.map((currentMatch) => (currentMatch.id === updatedMatch.id ? updatedMatch : currentMatch))
              );
              setMessage({ tone: "success", text: "Match updated." });
            }}
            onScored={(text) => setMessage({ tone: "success", text })}
            onError={(text) => setMessage({ tone: "error", text })}
          />
        ))}
      </section>
    </div>
  );
}

function FloatingAdminToast({
  tone,
  message,
  onDismiss
}: {
  tone: "success" | "error";
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-50 sm:left-auto sm:right-4 sm:w-full sm:max-w-sm">
      <div
        className={`pointer-events-auto rounded-lg border px-4 py-3 shadow-lg ${
          tone === "success"
            ? "border-green-200 bg-green-50 text-green-900"
            : "border-red-200 bg-red-50 text-red-900"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold">{message}</p>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-bold text-current/80 transition hover:bg-black/5 hover:text-current"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

type MatchResultCardProps = {
  match: AdminMatch;
  onSaved: (match: AdminMatch) => void;
  onScored: (message: string) => void;
  onError: (message: string) => void;
};

function MatchResultCard({ match, onSaved, onScored, onError }: MatchResultCardProps) {
  const router = useRouter();
  const [status, setStatus] = useState<MatchStatus>(match.status);
  const [homeScore, setHomeScore] = useState(match.homeScore?.toString() ?? "");
  const [awayScore, setAwayScore] = useState(match.awayScore?.toString() ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const isFinalized = status === "final";
  const isLive = status === "live";
  const predictionStateLabel = getPredictionStateLabel(status);
  const homeLabel = getSideLabel(match, "home");
  const awayLabel = getSideLabel(match, "away");
  const resolvedWinnerTeamId = getResolvedWinnerTeamId(match, homeScore, awayScore);
  const resolvedWinnerLabel = getResolvedWinnerLabel(match, resolvedWinnerTeamId);

  useEffect(() => {
    setStatus(match.status);
    setHomeScore(match.homeScore === undefined ? "" : String(match.homeScore));
    setAwayScore(match.awayScore === undefined ? "" : String(match.awayScore));
  }, [match]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const updateResult = await updateAdminMatchResultAction({
        id: match.id,
        status,
        homeScore: homeScore === "" ? undefined : Number(homeScore),
        awayScore: awayScore === "" ? undefined : Number(awayScore),
        winnerTeamId: resolvedWinnerTeamId
      });

      if (!updateResult.ok) {
        onError(updateResult.message);
        return;
      }

      const updatedMatch: AdminMatch = {
        ...match,
        ...updateResult.match,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam
      };

      onSaved(updatedMatch);

      if (updatedMatch.status === "final") {
        const scoringResult = await scoreFinalizedGroupMatch(updatedMatch.id);
        if (!scoringResult.ok) {
          onError(scoringResult.message);
          return;
        }

        onScored(scoringResult.message);
        router.refresh();
      }
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-lg border p-4 transition-colors ${
        isFinalized
          ? "border-gray-300 bg-gray-100"
          : isLive
            ? "border-amber-200 bg-amber-50"
            : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={`text-xs font-bold uppercase tracking-wide ${
              isFinalized ? "text-gray-600" : isLive ? "text-amber-700" : "text-gray-500"
            }`}
          >
            {formatStage(match.stage)} {match.groupName ? `- Group ${match.groupName}` : ""}
          </p>
          {isFinalized ? (
            <span className="mt-2 inline-flex items-center rounded-md bg-gray-200 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-gray-700">
              Finalized
            </span>
          ) : null}
          <h3
            className={`mt-1 text-lg font-black ${
              isFinalized ? "text-gray-800" : isLive ? "text-amber-950" : "text-gray-950"
            }`}
          >
            {homeLabel.short} vs {awayLabel.short}
          </h3>
          <p
            className={`mt-1 text-sm font-semibold ${
              isFinalized ? "text-gray-600" : isLive ? "text-amber-900" : "text-gray-700"
            }`}
          >
            {homeLabel.full} vs {awayLabel.full}
          </p>
          <p
            className={`mt-1 text-sm font-semibold ${
              isFinalized ? "text-gray-500" : isLive ? "text-amber-800" : "text-gray-500"
            }`}
          >
            {formatDateTime(match.kickoffTime)}
          </p>
          <div
            className={`mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold ${
              isFinalized ? "text-gray-500" : isLive ? "text-amber-800" : "text-gray-500"
            }`}
          >
            <span>
              Match ID: {match.id}
              {match.updatedAt ? ` / Updated ${formatDateTime(match.updatedAt)}` : ""}
            </span>
            {isFinalized ? (
              <span className="inline-flex items-center rounded-md bg-gray-200 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-gray-700">
                Finalized
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`rounded-md px-2 py-1 text-xs font-bold uppercase ${
              isFinalized
                ? "bg-gray-200 text-gray-700"
                : isLive
                  ? "bg-amber-100 text-amber-800"
                  : "bg-gray-100 text-gray-700"
            }`}
          >
            {formatMatchStatus(status)}
          </span>
          <span
            className={`rounded-md px-2 py-1 text-xs font-bold uppercase ${
              isFinalized
                ? "bg-gray-700 text-gray-100"
                : isLive
                  ? "bg-amber-200 text-amber-900"
                  : "bg-accent-light text-accent-dark"
            }`}
          >
            {predictionStateLabel}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <label>
          <span
            className={`text-sm font-bold ${
              isFinalized ? "text-gray-600" : isLive ? "text-amber-900" : "text-gray-700"
            }`}
          >
            Status
          </span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as MatchStatus)}
            className={`mt-2 w-full rounded-md border px-3 py-3 text-base ${
              isFinalized
                ? "border-gray-300 bg-gray-50 text-gray-800"
                : isLive
                  ? "border-amber-200 bg-white text-gray-900"
                  : "border-gray-300 bg-white"
            }`}
          >
            <option value="scheduled">Scheduled</option>
            <option value="live">Live</option>
            <option value="final">Final</option>
          </select>
        </label>

        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <ScoreInput label={homeLabel.short} value={homeScore} onChange={setHomeScore} isFinalized={isFinalized} />
          <span
            className={`pb-3 text-sm font-black ${
              isFinalized ? "text-gray-500" : isLive ? "text-amber-700" : "text-gray-400"
            }`}
          >
            vs
          </span>
          <ScoreInput label={awayLabel.short} value={awayScore} onChange={setAwayScore} isFinalized={isFinalized} />
        </div>

        <div
          className={`rounded-md px-3 py-2 ${
            isFinalized ? "bg-gray-200" : isLive ? "bg-amber-100" : "bg-gray-50"
          }`}
        >
          <p
            className={`text-xs font-bold uppercase tracking-wide ${
              isFinalized ? "text-gray-600" : isLive ? "text-amber-800" : "text-gray-500"
            }`}
          >
            Winner
          </p>
          <p
            className={`mt-1 text-sm font-black ${
              isFinalized ? "text-gray-800" : isLive ? "text-amber-950" : "text-gray-900"
            }`}
          >
            {resolvedWinnerLabel}
          </p>
          {homeScore !== "" && awayScore !== "" && resolvedWinnerTeamId === null ? (
            <p
              className={`mt-1 text-xs font-semibold ${
                isFinalized ? "text-gray-600" : isLive ? "text-amber-800" : "text-gray-500"
              }`}
            >
              Scores are equal. Winner will be saved as blank for a group-stage draw.
            </p>
          ) : null}
          </div>

        <button
          type="submit"
          disabled={isSaving}
          className="w-full rounded-md bg-accent px-4 py-3 text-base font-bold text-white disabled:bg-gray-300 disabled:text-gray-600"
        >
          {isSaving ? "Saving..." : "Save Match"}
        </button>
      </div>
    </form>
  );
}

function ScoreInput({
  label,
  value,
  onChange,
  isFinalized
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  isFinalized?: boolean;
}) {
  return (
    <label>
      <span className={`text-xs font-bold uppercase tracking-wide ${isFinalized ? "text-gray-600" : "text-gray-500"}`}>
        {label}
      </span>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-1 w-full rounded-md border px-3 py-3 text-center text-xl font-black ${
          isFinalized ? "border-gray-300 bg-white text-gray-800" : "border-gray-300 bg-white"
        }`}
      />
    </label>
  );
}

function getResolvedWinnerTeamId(match: AdminMatch, homeScore: string, awayScore: string) {
  if (homeScore === "" || awayScore === "") {
    return undefined;
  }

  const home = Number(homeScore);
  const away = Number(awayScore);

  if (home === away) {
    return null;
  }

  if (home > away) {
    return match.homeTeamId;
  }

  return match.awayTeamId;
}

function getResolvedWinnerLabel(match: AdminMatch, winnerTeamId: string | null | undefined) {
  if (winnerTeamId === undefined) {
    return "Enter scores to calculate winner";
  }

  if (winnerTeamId === null) {
    return "Draw";
  }

  if (winnerTeamId === match.homeTeamId) {
    return getSideLabel(match, "home").full;
  }

  if (winnerTeamId === match.awayTeamId) {
    return getSideLabel(match, "away").full;
  }

  return "Winner unavailable";
}

function getSideLabel(match: AdminMatch, side: "home" | "away") {
  const team = side === "home" ? match.homeTeam : match.awayTeam;
  const source = side === "home" ? match.homeSource : match.awaySource;
  const fallback = side === "home" ? "Home Team" : "Away Team";

  if (team) {
    const shortName = team.shortName || source || fallback;
    const fullName = team.name || shortName;

    return {
      short: `${team.flagEmoji ? `${team.flagEmoji} ` : ""}${shortName}`,
      full: fullName
    };
  }

  const label = source || fallback;

  return {
    short: label,
    full: label
  };
}

function formatStage(stage: MatchStage) {
  return formatMatchStage(stage);
}

function formatMatchStatus(status: MatchStatus) {
  if (status === "live") {
    return "Live";
  }

  if (status === "final") {
    return "Final";
  }

  return "Scheduled";
}

function formatDateTime(value: string, includeTime = true) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {})
  }).format(date);
}
