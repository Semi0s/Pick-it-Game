"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createAdminTournamentPlayerAction,
  fetchAdminSidePicksAction,
  recomputeAdminSidePickScoresAction,
  updateAdminSidePickOfficialPlayerResultAction,
  updateAdminSidePicksConfigAction,
  updateAdminSidePicksTriptychPreviewAction,
  updateAdminTournamentPlayerActiveAction
} from "@/app/admin/side-picks/actions";
import { SidePicksIcon } from "@/components/SidePicksIcon";
import { AdminMessage } from "@/components/admin/AdminHomeClient";
import { showAppToast } from "@/lib/app-toast";
import {
  SIDE_PICK_PUBLIC_NAME,
  formatLastChanceDeadlineLabel,
  type SidePickOfficialPlayerSuggestion,
  type SidePickPlayerDefinitionKey
} from "@/lib/side-picks";
import type {
  SidePickAuditSummary,
  SidePickDefinitionRow,
  SidePickLeaderboardRow,
  SidePicksConfig,
  TournamentPlayerRow
} from "@/lib/side-picks-data";
import type { Team } from "@/lib/types";

type AdminSidePicksData = SidePicksConfig & {
  teams: Team[];
  tournamentPlayers: TournamentPlayerRow[];
  leaderboard: SidePickLeaderboardRow[];
  triptychPreviewEnabled: boolean;
};

export function AdminSidePicksClient() {
  const [data, setData] = useState<AdminSidePicksData | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [auditSummary, setAuditSummary] = useState<SidePickAuditSummary | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await fetchAdminSidePicksAction();
      if (result.ok) {
        setData(result.data);
      } else {
        setMessage({ tone: "error", text: result.message });
      }
    });
  }, []);

  useEffect(() => {
    if (message) {
      showAppToast(message);
    }
  }, [message]);

  async function saveConfig(nextData: AdminSidePicksData) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateAdminSidePicksConfigAction({
        active: nextData.isEnabled,
        lockAt: nextData.lockAt,
        darkHorseEligibleTeamIds: getEligibleTeamIds(nextData.definitions, "dark_horse"),
        favoriteFlopEligibleTeamIds: getEligibleTeamIds(nextData.definitions, "favorite_flop")
      });

      if (result.ok) {
        setData({ ...result.data, triptychPreviewEnabled: nextData.triptychPreviewEnabled });
        setMessage({ tone: "success", text: result.message });
      } else {
        setMessage({ tone: "error", text: result.message });
      }
    });
  }

  async function recomputeScores() {
    setMessage(null);
    setAuditSummary(null);
    startTransition(async () => {
      const result = await recomputeAdminSidePickScoresAction();
      if (result.ok) {
        setAuditSummary(result.summary);
        setMessage({ tone: "success", text: result.message });
        const refreshed = await fetchAdminSidePicksAction();
        if (refreshed.ok) {
          setData(refreshed.data);
        }
      } else {
        setMessage({ tone: "error", text: result.message });
      }
    });
  }

  async function saveTriptychPreview(enabled: boolean) {
    setMessage(null);
    setData((current) => current ? { ...current, triptychPreviewEnabled: enabled } : current);
    startTransition(async () => {
      const result = await updateAdminSidePicksTriptychPreviewAction(enabled);
      if (result.ok) {
        setMessage({ tone: "success", text: result.message });
      } else {
        setData((current) => current ? { ...current, triptychPreviewEnabled: !enabled } : current);
        setMessage({ tone: "error", text: result.message });
      }
    });
  }

  async function createPlayer(input: { fullName: string; teamId: string | null }) {
    setMessage(null);
    startTransition(async () => {
      const result = await createAdminTournamentPlayerAction(input);
      if (result.ok) {
        setData((current) => current ? { ...result.data, triptychPreviewEnabled: current.triptychPreviewEnabled } : null);
        setMessage({ tone: "success", text: result.message });
      } else {
        setMessage({ tone: "error", text: result.message });
      }
    });
  }

  async function updatePlayerActive(playerId: string, active: boolean) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateAdminTournamentPlayerActiveAction({ playerId, active });
      if (result.ok) {
        setData((current) => current ? { ...result.data, triptychPreviewEnabled: current.triptychPreviewEnabled } : null);
        setMessage({ tone: "success", text: result.message });
      } else {
        setMessage({ tone: "error", text: result.message });
      }
    });
  }

  async function saveOfficialPlayerResult(input: {
    key: SidePickPlayerDefinitionKey;
    playerId: string | null;
    sourceUrl: string | null;
    sourceLabel: string | null;
  }) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateAdminSidePickOfficialPlayerResultAction(input);
      if (result.ok) {
        setData((current) => current ? { ...result.data, triptychPreviewEnabled: current.triptychPreviewEnabled } : null);
        setMessage({ tone: "success", text: result.message });
      } else {
        setMessage({ tone: "error", text: result.message });
      }
    });
  }

  function updateDefinitionEligibility(key: "dark_horse" | "favorite_flop", teamId: string, enabled: boolean) {
    setData((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        definitions: current.definitions.map((definition) => {
          if (definition.key !== key) {
            return definition;
          }

          const currentIds = new Set(definition.eligible_team_ids ?? []);
          if (enabled) {
            currentIds.add(teamId);
          } else {
            currentIds.delete(teamId);
          }

          return {
            ...definition,
            eligible_team_ids: Array.from(currentIds)
          };
        })
      };
    });
  }

  if (!data) {
    return (
      <div className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600">
        {isPending ? `Loading ${SIDE_PICK_PUBLIC_NAME}...` : `${SIDE_PICK_PUBLIC_NAME} admin data is not available.`}
      </div>
    );
  }

  const darkHorseDefinition = data.definitions.find((definition) => definition.key === "dark_horse") ?? null;
  const favoriteFlopDefinition = data.definitions.find((definition) => definition.key === "favorite_flop") ?? null;
  const goldenBootDefinition = data.definitions.find((definition) => definition.key === "golden_boot") ?? null;
  const goldenBallDefinition = data.definitions.find((definition) => definition.key === "golden_ball") ?? null;
  const lockAtInputValue = data.lockAt ? toDatetimeLocalValue(data.lockAt) : "";

  return (
    <div className="space-y-5">
      <section className="rounded-[1rem] bg-gray-100 p-5">
        <p className="text-sm font-black uppercase tracking-[0.14em] text-accent-dark">{SIDE_PICK_PUBLIC_NAME}</p>
        <h1 className="mt-2 text-3xl font-black text-gray-950">Manage late-entry bonus picks</h1>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-gray-700">
          {SIDE_PICK_PUBLIC_NAME} are scored on a separate leaderboard. Eligibility must be reviewed before this mode opens.
        </p>
      </section>

      {message ? <AdminMessage tone={message.tone} message={message.text} /> : null}

      <section className="rounded-[1rem] border border-gray-200 bg-white p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-black text-gray-800">
            <input
              type="checkbox"
              checked={data.isEnabled}
              onChange={(event) => setData({ ...data, isEnabled: event.target.checked })}
              className="h-5 w-5 accent-[var(--accent)]"
            />
            Enable {SIDE_PICK_PUBLIC_NAME}
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-black text-sky-900">
            <input
              type="checkbox"
              checked={data.triptychPreviewEnabled}
              onChange={(event) => void saveTriptychPreview(event.target.checked)}
              disabled={isPending}
              className="h-5 w-5 accent-[var(--accent)]"
            />
            <span>
              Preview dashboard triptych
              <span className="block text-xs font-bold leading-5 text-sky-700">
                Super Admin only. Does not open {SIDE_PICK_PUBLIC_NAME} for players.
              </span>
            </span>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-wide text-gray-500">Lock deadline</span>
            <input
              type="datetime-local"
              value={lockAtInputValue}
              onChange={(event) => setData({ ...data, lockAt: event.target.value ? new Date(event.target.value).toISOString() : null })}
              className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm font-bold"
            />
            <span className="block text-xs font-bold leading-5 text-gray-500">
              Suggested: {formatLastChanceDeadlineLabel(data.suggestedLockAt)} from {data.suggestedLockSource === "official_schedule" ? "official match schedule" : "manual default"}.
            </span>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={() => setData({ ...data, lockAt: data.suggestedLockAt })}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            Use suggested deadline
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => void saveConfig(data)}
            className="rounded-xl bg-accent px-5 py-3 text-sm font-black text-accent-text transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
          >
            Save {SIDE_PICK_PUBLIC_NAME} settings
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => void recomputeScores()}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-black text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            Recompute Side Picks scoring
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <EligibilityCard
          title="Dark Horse eligible teams"
          helper="Eligible underdogs. Default is outside the top 12 by FIFA rank/favorite proxy."
          definition={darkHorseDefinition}
          teams={data.teams}
          onToggle={(teamId, enabled) => updateDefinitionEligibility("dark_horse", teamId, enabled)}
        />
        <EligibilityCard
          title="Favorite Flop eligible teams"
          helper="Eligible favorites. Default is the top 12 by FIFA rank/favorite proxy."
          definition={favoriteFlopDefinition}
          teams={data.teams}
          onToggle={(teamId, enabled) => updateDefinitionEligibility("favorite_flop", teamId, enabled)}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <TournamentPlayersCard
          teams={data.teams}
          players={data.tournamentPlayers}
          isPending={isPending}
          onCreatePlayer={createPlayer}
          onTogglePlayer={updatePlayerActive}
        />
        <OfficialPlayerResultsCard
          definitions={[goldenBootDefinition, goldenBallDefinition].filter((definition): definition is SidePickDefinitionRow => Boolean(definition))}
          suggestions={data.officialPlayerSuggestions}
          players={data.tournamentPlayers.filter((player) => player.active)}
          isPending={isPending}
          onSave={saveOfficialPlayerResult}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <AdminLeaderboardCard leaderboard={data.leaderboard} />
        <section className="rounded-[1rem] border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <SidePicksIcon className="h-6 w-6 text-accent-dark" />
            <h2 className="text-lg font-black text-gray-950">Scoring audit summary</h2>
          </div>
          {auditSummary ? (
            <div className="mt-3 space-y-2 text-sm font-semibold leading-6 text-gray-700">
              <p>Users scored: {auditSummary.usersScored}</p>
              <p>Score rows upserted: {auditSummary.scoreRowsUpserted}</p>
              {auditSummary.warnings.length > 0 ? (
                <ul className="space-y-1">
                  {auditSummary.warnings.map((warning) => (
                    <li key={warning} className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">{warning}</li>
                  ))}
                </ul>
              ) : (
                <p>No warnings.</p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm font-semibold leading-6 text-gray-600">
              Run recompute to see deterministic Side Picks scoring rows created or updated. This does not mutate main bracket totals.
            </p>
          )}
        </section>
      </section>
    </div>
  );
}

function EligibilityCard({
  title,
  helper,
  definition,
  teams,
  onToggle
}: {
  title: string;
  helper: string;
  definition: SidePickDefinitionRow | null;
  teams: Team[];
  onToggle: (teamId: string, enabled: boolean) => void;
}) {
  const eligibleIds = useMemo(() => new Set(definition?.eligible_team_ids ?? []), [definition?.eligible_team_ids]);

  return (
    <section className="rounded-[1rem] border border-gray-200 bg-white p-4">
      <h2 className="text-lg font-black text-gray-950">{title}</h2>
      <p className="mt-1 text-sm font-semibold leading-6 text-gray-600">{helper}</p>
      <p className="mt-2 text-xs font-black uppercase tracking-wide text-gray-500">
        {eligibleIds.size} eligible
      </p>
      <div className="mt-3 grid max-h-[420px] gap-2 overflow-auto pr-1 sm:grid-cols-2">
        {teams.map((team) => (
          <label
            key={team.id}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-800"
          >
            <input
              type="checkbox"
              checked={eligibleIds.has(team.id)}
              onChange={(event) => onToggle(team.id, event.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span className="min-w-0 truncate">
              {team.flagEmoji} {team.name}
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

function TournamentPlayersCard({
  teams,
  players,
  isPending,
  onCreatePlayer,
  onTogglePlayer
}: {
  teams: Team[];
  players: TournamentPlayerRow[];
  isPending: boolean;
  onCreatePlayer: (input: { fullName: string; teamId: string | null }) => void;
  onTogglePlayer: (playerId: string, active: boolean) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);

  function handleSubmit() {
    onCreatePlayer({ fullName, teamId });
    setFullName("");
    setTeamId(null);
  }

  return (
    <section className="rounded-[1rem] border border-gray-200 bg-white p-4">
      <h2 className="text-lg font-black text-gray-950">Tournament players</h2>
      <p className="mt-1 text-sm font-semibold leading-6 text-gray-600">
        Add official player options for Golden Boot and MVP / Golden Ball picks.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
        <input
          type="text"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Player name"
          className="rounded-xl border border-gray-300 px-3 py-3 text-sm font-bold"
        />
        <select
          value={teamId ?? ""}
          onChange={(event) => setTeamId(event.target.value || null)}
          className="rounded-xl border border-gray-300 px-3 py-3 text-sm font-bold"
        >
          <option value="">Team optional</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.flagEmoji} {team.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        disabled={isPending || !fullName.trim()}
        onClick={handleSubmit}
        className="mt-3 rounded-xl bg-accent px-5 py-3 text-sm font-black text-accent-text transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
      >
        Add player
      </button>
      <div className="mt-4 max-h-[360px] space-y-2 overflow-auto pr-1">
        {players.length ? players.map((player) => (
          <div key={player.id} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-gray-950">{player.full_name}</p>
              <p className="truncate text-xs font-bold text-gray-500">
                {player.team?.flag_emoji ? `${player.team.flag_emoji} ` : ""}
                {player.team?.name ?? "No team set"} · {player.active ? "Active" : "Hidden"}
              </p>
            </div>
            <button
              type="button"
              disabled={isPending}
              onClick={() => onTogglePlayer(player.id, !player.active)}
              className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-black text-gray-700 hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-60"
            >
              {player.active ? "Hide" : "Activate"}
            </button>
          </div>
        )) : (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-600">
            No tournament players yet.
          </p>
        )}
      </div>
    </section>
  );
}

function OfficialPlayerResultsCard({
  definitions,
  suggestions,
  players,
  isPending,
  onSave
}: {
  definitions: SidePickDefinitionRow[];
  suggestions: Partial<Record<SidePickPlayerDefinitionKey, SidePickOfficialPlayerSuggestion>>;
  players: TournamentPlayerRow[];
  isPending: boolean;
  onSave: (input: {
    key: SidePickPlayerDefinitionKey;
    playerId: string | null;
    sourceUrl: string | null;
    sourceLabel: string | null;
  }) => void;
}) {
  return (
    <section className="rounded-[1rem] border border-gray-200 bg-white p-4">
      <h2 className="text-lg font-black text-gray-950">Official player awards</h2>
      <p className="mt-1 text-sm font-semibold leading-6 text-gray-600">
        Scoring for player awards only runs from these confirmed official results.
      </p>
      <div className="mt-4 space-y-4">
        {definitions.map((definition) => (
          <OfficialPlayerResultForm
            key={definition.key}
            definition={definition}
            suggestion={suggestions[definition.key as SidePickPlayerDefinitionKey] ?? null}
            players={players}
            isPending={isPending}
            onSave={onSave}
          />
        ))}
      </div>
    </section>
  );
}

function OfficialPlayerResultForm({
  definition,
  suggestion,
  players,
  isPending,
  onSave
}: {
  definition: SidePickDefinitionRow;
  suggestion: SidePickOfficialPlayerSuggestion | null;
  players: TournamentPlayerRow[];
  isPending: boolean;
  onSave: (input: {
    key: SidePickPlayerDefinitionKey;
    playerId: string | null;
    sourceUrl: string | null;
    sourceLabel: string | null;
  }) => void;
}) {
  const [playerId, setPlayerId] = useState(definition.official_player_id ?? suggestion?.playerId ?? "");
  const [sourceUrl, setSourceUrl] = useState(definition.official_result_source_url ?? "");
  const [sourceLabel, setSourceLabel] = useState(definition.official_result_source_label ?? "");

  useEffect(() => {
    setPlayerId(definition.official_player_id ?? suggestion?.playerId ?? "");
    setSourceUrl(definition.official_result_source_url ?? "");
    setSourceLabel(definition.official_result_source_label ?? "");
  }, [
    definition.official_player_id,
    definition.official_result_source_url,
    definition.official_result_source_label,
    suggestion?.playerId
  ]);

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <p className="text-sm font-black text-gray-950">{definition.label}</p>
      {suggestion ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-xs font-bold text-gray-600">
            Suggested from player picks: {suggestion.playerLabel} · {suggestion.pickCount}/{suggestion.totalPicks}
          </p>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setPlayerId(suggestion.playerId)}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-black text-gray-700 hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            Use suggestion
          </button>
        </div>
      ) : null}
      <div className="mt-2 grid gap-2">
        <select
          value={playerId}
          disabled={isPending}
          onChange={(event) => setPlayerId(event.target.value)}
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm font-bold"
        >
          <option value="">Official result not set</option>
          {players.map((player) => (
            <option key={player.id} value={player.id}>
              {formatTournamentPlayerLabel(player)}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={sourceLabel}
          disabled={isPending}
          onChange={(event) => setSourceLabel(event.target.value)}
          placeholder="Source label, e.g. FIFA"
          className="rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm font-bold"
        />
        <input
          type="url"
          value={sourceUrl}
          disabled={isPending}
          onChange={(event) => setSourceUrl(event.target.value)}
          placeholder="Source URL"
          className="rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm font-bold"
        />
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => onSave({
          key: definition.key as SidePickPlayerDefinitionKey,
          playerId: playerId || null,
          sourceUrl: sourceUrl || null,
          sourceLabel: sourceLabel || null
        })}
        className="mt-3 rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs font-black text-gray-800 hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-60"
      >
        Save official result
      </button>
      {definition.official_result_confirmed_at ? (
        <p className="mt-2 text-xs font-bold text-gray-500">
          Confirmed {new Date(definition.official_result_confirmed_at).toLocaleDateString()}
        </p>
      ) : null}
    </div>
  );
}

function AdminLeaderboardCard({ leaderboard }: { leaderboard: SidePickLeaderboardRow[] }) {
  return (
    <section className="rounded-[1rem] border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <SidePicksIcon className="h-6 w-6 text-accent-dark" />
        <h2 className="text-lg font-black text-gray-950">Side Picks leaderboard</h2>
      </div>
      <p className="mt-1 text-sm font-semibold leading-6 text-gray-600">
        Separate from the main bracket leaderboard.
      </p>
      <div className="mt-3 space-y-2">
        {leaderboard.length ? leaderboard.slice(0, 12).map((row) => (
          <div key={row.userId} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-sm font-black text-gray-950">#{row.rank} {row.name}</p>
            <p className="text-sm font-black text-accent-dark">{row.totalPoints}</p>
          </div>
        )) : (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-600">
            No Side Picks scores yet.
          </p>
        )}
      </div>
    </section>
  );
}

function getEligibleTeamIds(definitions: SidePickDefinitionRow[], key: "dark_horse" | "favorite_flop") {
  return definitions.find((definition) => definition.key === key)?.eligible_team_ids ?? [];
}

function formatTournamentPlayerLabel(player: TournamentPlayerRow) {
  const teamLabel = player.team?.short_name ?? player.team?.name ?? null;
  return teamLabel ? `${player.full_name} — ${teamLabel}` : player.full_name;
}

function toDatetimeLocalValue(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
