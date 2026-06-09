"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { saveSidePicksAction } from "@/app/side-picks/actions";
import { SidePicksIcon } from "@/components/SidePicksIcon";
import { showAppToast } from "@/lib/app-toast";
import {
  SIDE_PICK_PUBLIC_NAME,
  SIDE_PICK_SCORING_COPY,
  formatLastChanceDeadlineLabel,
  type SidePickDefinitionKey,
  type SidePicksSubmission
} from "@/lib/side-picks";
import type {
  SidePickDefinitionRow,
  SidePickGroupContext,
  TournamentPlayerRow
} from "@/lib/side-picks-data";
import type { Team } from "@/lib/types";

type SidePicksClientProps = {
  isEnabled: boolean;
  isLocked: boolean;
  lockAt: string | null;
  group: SidePickGroupContext | null;
  teams: Team[];
  tournamentPlayers: TournamentPlayerRow[];
  definitions: SidePickDefinitionRow[];
  initialPicks: SidePicksSubmission;
  scores: Record<SidePickDefinitionKey, { points: number; note: string } | null>;
};

export function SidePicksClient({
  isEnabled,
  isLocked,
  lockAt,
  group,
  teams,
  tournamentPlayers,
  definitions,
  initialPicks,
  scores
}: SidePicksClientProps) {
  const [picks, setPicks] = useState(initialPicks);
  const [receipt, setReceipt] = useState<SidePicksSubmission | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSemifinalistListOpen, setIsSemifinalistListOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const definitionsByKey = useMemo(() => new Map(definitions.map((definition) => [definition.key, definition])), [definitions]);
  const darkHorseTeamIds = definitionsByKey.get("dark_horse")?.eligible_team_ids ?? [];
  const favoriteFlopTeamIds = definitionsByKey.get("favorite_flop")?.eligible_team_ids ?? [];
  const darkHorseTeams = filterTeamsByIds(teams, darkHorseTeamIds);
  const favoriteFlopTeams = filterTeamsByIds(teams, favoriteFlopTeamIds);
  const canEdit = Boolean(group && isEnabled && !isLocked);
  const deadlineLabel = formatLastChanceDeadlineLabel(lockAt);
  const totalScore = Object.values(scores).reduce((sum, score) => sum + (score?.points ?? 0), 0);
  const selectedSemifinalistTeams = picks.semifinalistTeamIds
    .map((teamId) => teams.find((team) => team.id === teamId) ?? null)
    .filter((team): team is Team => Boolean(team));

  function updatePick<K extends keyof SidePicksSubmission>(key: K, value: SidePicksSubmission[K]) {
    setPicks((current) => ({ ...current, [key]: value }));
  }

  function toggleSemifinalist(teamId: string) {
    setPicks((current) => {
      const existing = current.semifinalistTeamIds;
      if (existing.includes(teamId)) {
        return { ...current, semifinalistTeamIds: existing.filter((candidate) => candidate !== teamId) };
      }

      if (existing.length >= 4) {
        showAppToast({ tone: "error", text: "Remove a Top 4 team before adding another." });
        return current;
      }

      return { ...current, semifinalistTeamIds: [...existing, teamId] };
    });
  }

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveSidePicksAction(picks);
      setMessage(result.message);
      showAppToast({ tone: result.ok ? "tip" : "error", text: result.message });
      if (result.ok) {
        setReceipt(result.receipt);
      }
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 py-4">
      <section className="overflow-hidden rounded-[1.25rem] border border-accent-light bg-accent-light/25 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.14em] text-accent-dark">{SIDE_PICK_PUBLIC_NAME}</p>
            <h1 className="mt-2 text-3xl font-black text-gray-950">Late-entry tournament picks</h1>
          </div>
          <span className="rounded-full border border-accent/30 bg-white px-3 py-1 text-xs font-black uppercase tracking-wide text-accent-dark">
            {isLocked ? "Locked" : deadlineLabel}
          </span>
        </div>
      </section>

      {!group ? (
        <StatusCard tone="error" title={`${SIDE_PICK_PUBLIC_NAME} need a default group`} body="Set the public signup default group or create FIFA 2026 Predictions first." />
      ) : null}

      {!isEnabled ? (
        <StatusCard tone="neutral" title={`${SIDE_PICK_PUBLIC_NAME} open soon`} />
      ) : null}

      {isLocked ? (
        <StatusCard tone="neutral" title={`${SIDE_PICK_PUBLIC_NAME} are locked`} body="Your picks are read-only after the configured deadline." />
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <PickCard
            index={1}
            title="Champion"
            helper="Pick the team that wins it all."
            scoring={SIDE_PICK_SCORING_COPY.champion}
          >
            <TeamSelect
              disabled={!canEdit}
              teams={teams}
              value={picks.championTeamId}
              onChange={(teamId) => updatePick("championTeamId", teamId)}
            />
          </PickCard>

          <PickCard
            index={2}
            title="Runner-up"
            helper="Pick the losing finalist."
            scoring={SIDE_PICK_SCORING_COPY.runner_up}
          >
            <TeamSelect
              disabled={!canEdit}
              teams={teams}
              value={picks.runnerUpTeamId}
              onChange={(teamId) => updatePick("runnerUpTeamId", teamId)}
            />
          </PickCard>

          <PickCard
            index={3}
            title="Top 4 teams"
            helper="Pick four semifinalists. Any order counts."
            scoring={SIDE_PICK_SCORING_COPY.semifinalists}
          >
            {selectedSemifinalistTeams.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selectedSemifinalistTeams.map((team) => (
                  <span key={team.id} className="rounded-full bg-accent-light px-3 py-1 text-xs font-black text-accent-dark">
                    <span className="mr-1">{team.flagEmoji}</span>
                    {team.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-600">
                Open the team list to choose your four semifinalists.
              </p>
            )}
            <button
              type="button"
              onClick={() => setIsSemifinalistListOpen((current) => !current)}
              className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wide text-accent-dark"
              aria-expanded={isSemifinalistListOpen}
            >
              {isSemifinalistListOpen ? <ChevronUp aria-hidden className="h-4 w-4" /> : <ChevronDown aria-hidden className="h-4 w-4" />}
              {isSemifinalistListOpen ? "Less teams" : "More teams"}
            </button>
            {isSemifinalistListOpen ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {teams.map((team) => {
                  const selected = picks.semifinalistTeamIds.includes(team.id);
                  return (
                    <button
                      key={team.id}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => toggleSemifinalist(team.id)}
                      className={`rounded-xl border px-3 py-2 text-left text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        selected
                          ? "border-accent bg-accent text-accent-text"
                          : "border-gray-200 bg-white text-gray-800 hover:border-accent hover:bg-accent-light"
                      }`}
                    >
                      <span className="mr-2">{team.flagEmoji}</span>
                      {team.name}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Selected {picks.semifinalistTeamIds.length}/4
            </p>
          </PickCard>

          <PickCard
            index={4}
            title="Dark Horse"
            helper="Pick an eligible underdog to go far."
            scoring={SIDE_PICK_SCORING_COPY.dark_horse}
          >
            <TeamSelect
              disabled={!canEdit}
              teams={darkHorseTeams.length ? darkHorseTeams : teams}
              value={picks.darkHorseTeamId}
              onChange={(teamId) => updatePick("darkHorseTeamId", teamId)}
            />
          </PickCard>

          <PickCard
            index={5}
            title="Favorite Flop"
            helper="Pick an eligible favorite to fall early."
            scoring={SIDE_PICK_SCORING_COPY.favorite_flop}
          >
            <TeamSelect
              disabled={!canEdit}
              teams={favoriteFlopTeams.length ? favoriteFlopTeams : teams}
              value={picks.favoriteFlopTeamId}
              onChange={(teamId) => updatePick("favoriteFlopTeamId", teamId)}
            />
          </PickCard>

          <PickCard
            index={6}
            title="Highest-scoring team"
            helper="Pick the team with the most total goals."
            scoring={SIDE_PICK_SCORING_COPY.highest_scoring_team}
          >
            <TeamSelect
              disabled={!canEdit}
              teams={teams}
              value={picks.highestScoringTeamId}
              onChange={(teamId) => updatePick("highestScoringTeamId", teamId)}
            />
          </PickCard>

          <PickCard
            index={7}
            title="Golden Boot"
            helper="Pick the player who wins the tournament scoring award."
            scoring={SIDE_PICK_SCORING_COPY.golden_boot}
          >
            <PlayerSelect
              disabled={!canEdit}
              players={tournamentPlayers}
              value={picks.goldenBootPlayerId}
              onChange={(playerId) => updatePick("goldenBootPlayerId", playerId)}
            />
          </PickCard>

          <PickCard
            index={8}
            title="MVP / Golden Ball"
            helper="Pick the tournament MVP / Golden Ball winner."
            scoring={SIDE_PICK_SCORING_COPY.golden_ball}
          >
            <PlayerSelect
              disabled={!canEdit}
              players={tournamentPlayers}
              value={picks.goldenBallPlayerId}
              onChange={(playerId) => updatePick("goldenBallPlayerId", playerId)}
            />
          </PickCard>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canEdit || isPending}
              className="rounded-xl bg-accent px-5 py-3 text-sm font-black text-accent-text transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
            >
              {isPending ? "Saving..." : `Save ${SIDE_PICK_PUBLIC_NAME}`}
            </button>
            {message ? <p className="text-sm font-bold text-gray-700">{message}</p> : null}
          </div>

          {receipt ? (
            <section className="rounded-[1rem] border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 aria-hidden className="h-5 w-5 text-emerald-700" />
                <h2 className="text-lg font-black text-emerald-950">{SIDE_PICK_PUBLIC_NAME} saved</h2>
              </div>
              <p className="mt-2 text-sm font-semibold leading-6 text-emerald-900">
                Receipt: your eight Side Picks are saved separately from your main bracket.
              </p>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4">
          <section className="rounded-[1rem] border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-gray-500">Your Side Picks score</p>
                <p className="mt-1 text-3xl font-black text-gray-950">{totalScore}</p>
              </div>
              <SidePicksIcon className="h-10 w-10 text-accent-dark" />
            </div>
            <div className="mt-3 space-y-2">
              {Object.entries(scores).map(([key, score]) => (
                <div key={key} className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-xs font-black uppercase tracking-wide text-gray-500">{formatDefinitionKey(key as SidePickDefinitionKey)}</p>
                  <p className="text-sm font-black text-gray-950">{score?.points ?? 0} pts</p>
                  {score?.note ? <p className="text-xs font-semibold leading-5 text-gray-600">{score.note}</p> : null}
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}

function PickCard({
  index,
  title,
  helper,
  scoring,
  children
}: {
  index: number;
  title: string;
  helper: string;
  scoring: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1rem] border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-accent bg-white text-sm font-black text-accent-dark"
        >
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black text-gray-950">{title}</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-gray-600">{helper}</p>
          <p className="mt-1 text-xs font-black uppercase tracking-wide text-gray-500">{scoring}</p>
          <div className="mt-3 space-y-3">{children}</div>
        </div>
      </div>
    </section>
  );
}

function TeamSelect({
  teams,
  value,
  disabled,
  onChange
}: {
  teams: Team[];
  value: string | null;
  disabled: boolean;
  onChange: (teamId: string | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value || null)}
      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm font-bold text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
    >
      <option value="">Choose team</option>
      {teams.map((team) => (
        <option key={team.id} value={team.id}>
          {team.flagEmoji} {team.name}
        </option>
      ))}
    </select>
  );
}

function PlayerSelect({
  players,
  value,
  disabled,
  onChange
}: {
  players: TournamentPlayerRow[];
  value: string | null;
  disabled: boolean;
  onChange: (playerId: string | null) => void;
}) {
  const inputId = useId();
  const selectedPlayer = players.find((player) => player.id === value) ?? null;
  const [query, setQuery] = useState(selectedPlayer ? formatTournamentPlayerLabel(selectedPlayer) : "");

  useEffect(() => {
    const nextSelectedPlayer = players.find((player) => player.id === value) ?? null;
    setQuery(nextSelectedPlayer ? formatTournamentPlayerLabel(nextSelectedPlayer) : "");
  }, [players, value]);

  function handleChange(nextQuery: string) {
    setQuery(nextQuery);
    if (!nextQuery.trim()) {
      onChange(null);
      return;
    }

    const matchedPlayer = players.find((player) => formatTournamentPlayerLabel(player) === nextQuery);
    if (matchedPlayer) {
      onChange(matchedPlayer.id);
    }
  }

  function handleBlur() {
    if (!query.trim()) {
      onChange(null);
      return;
    }

    const matchedPlayer = players.find((player) => formatTournamentPlayerLabel(player) === query);
    if (!matchedPlayer && value) {
      const currentPlayer = players.find((player) => player.id === value) ?? null;
      setQuery(currentPlayer ? formatTournamentPlayerLabel(currentPlayer) : "");
    }
  }

  return (
    <div className="space-y-2">
      <input
        type="search"
        list={inputId}
        value={query}
        disabled={disabled || players.length === 0}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={handleBlur}
        placeholder={players.length ? "Search player" : "Player list opens soon"}
        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm font-bold text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
      />
      <datalist id={inputId}>
        {players.map((player) => (
          <option key={player.id} value={formatTournamentPlayerLabel(player)} />
        ))}
      </datalist>
      {players.length === 0 ? (
        <p className="text-xs font-semibold leading-5 text-gray-500">
          Super Admin needs to add tournament players before this pick can be selected.
        </p>
      ) : null}
    </div>
  );
}

function formatTournamentPlayerLabel(player: TournamentPlayerRow) {
  const teamLabel = player.team?.short_name ?? player.team?.name ?? null;
  return teamLabel ? `${player.full_name} — ${teamLabel}` : player.full_name;
}

function StatusCard({ tone, title, body }: { tone: "neutral" | "error"; title: string; body?: string }) {
  return (
    <section className={`rounded-[1rem] border p-4 ${
      tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-gray-200 bg-gray-50 text-gray-700"
    }`}>
      <p className="text-sm font-black">{title}</p>
      {body ? <p className="mt-1 text-sm font-semibold leading-6">{body}</p> : null}
    </section>
  );
}

function filterTeamsByIds(teams: Team[], teamIds: string[]) {
  if (teamIds.length === 0) {
    return [];
  }

  const allowed = new Set(teamIds);
  return teams.filter((team) => allowed.has(team.id));
}

function formatDefinitionKey(key: SidePickDefinitionKey) {
  switch (key) {
    case "champion":
      return "Champion";
    case "runner_up":
      return "Runner-up";
    case "semifinalists":
      return "Top 4";
    case "dark_horse":
      return "Dark Horse";
    case "favorite_flop":
      return "Favorite Flop";
    case "highest_scoring_team":
      return "Highest-scoring";
    case "golden_boot":
      return "Golden Boot";
    case "golden_ball":
      return "MVP / Golden Ball";
  }
}
