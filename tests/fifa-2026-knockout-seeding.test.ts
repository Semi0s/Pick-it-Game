import test from "node:test";
import assert from "node:assert/strict";
import {
  FIFA_2026_GROUP_LETTERS,
  FIFA_2026_THIRD_PLACE_ASSIGNMENT_TARGETS,
  FIFA_2026_THIRD_PLACE_PERMUTATIONS,
  buildThirdPlaceCombinationKey,
  getFifa2026ThirdPlacePermutation,
  type Fifa2026GroupLetter
} from "../lib/fifa-2026-third-place-permutations.ts";
import {
  buildFifa2026RoundOf32,
  buildFifa2026RoundOf32StoredMatchIdLookup,
  formatBestThirdPlaceholder,
  rankFifa2026ThirdPlaceTeams,
  sourceToGroupLetter,
  type Fifa2026StandingsTeam
} from "../lib/fifa-2026-knockout-seeding.ts";
import { scoreBracketPrediction } from "../lib/bracket-scoring.ts";
import {
  assertCanonicalScoreBreakdownInvariant,
  calculateCanonicalLeaderboardScores
} from "../lib/canonical-scoring.ts";

test("FIFA 2026 third-place permutation table is complete and internally valid", () => {
  const keys = Object.keys(FIFA_2026_THIRD_PLACE_PERMUTATIONS);

  assert.equal(keys.length, 495);

  for (const key of keys) {
    const keyGroups = key.split("");
    const uniqueKeyGroups = new Set(keyGroups);
    const assignment = FIFA_2026_THIRD_PLACE_PERMUTATIONS[key];
    const assignedSources = Object.values(assignment);
    const assignedGroups = assignedSources.map((source) => source.slice(1));

    assert.equal(keyGroups.length, 8, `Expected ${key} to contain eight groups.`);
    assert.equal(uniqueKeyGroups.size, 8, `Expected ${key} to contain unique groups.`);
    assert.deepEqual(
      keyGroups,
      [...keyGroups].sort((left, right) => FIFA_2026_GROUP_LETTERS.indexOf(left as Fifa2026GroupLetter) - FIFA_2026_GROUP_LETTERS.indexOf(right as Fifa2026GroupLetter)),
      `Expected ${key} to be canonical A-L order.`
    );
    assert.deepEqual(Object.keys(assignment), [...FIFA_2026_THIRD_PLACE_ASSIGNMENT_TARGETS]);
    assert.equal(new Set(assignedSources).size, 8, `Expected no duplicate third-place sources in ${key}.`);
    assert.deepEqual([...assignedGroups].sort(), [...keyGroups].sort());

    for (const source of assignedSources) {
      assert.match(source, /^3[A-L]$/);
    }
  }
});

test("FIFA 2026 Annexe C example maps EFGHIJKL into the official R32 slots", () => {
  assert.deepEqual(getFifa2026ThirdPlacePermutation(["L", "F", "E", "K", "J", "I", "H", "G"]), {
    "1A": "3E",
    "1B": "3J",
    "1D": "3I",
    "1E": "3F",
    "1G": "3H",
    "1I": "3G",
    "1K": "3L",
    "1L": "3K"
  });
  assert.equal(buildThirdPlaceCombinationKey(["L", "F", "E", "K", "J", "I", "H", "G"]), "EFGHIJKL");
});

test("FIFA 2026 Round of 32 builder uses official match slots and prevents third-place-vs-third-place matches", () => {
  const matches = buildFifa2026RoundOf32({
    groupStandings: buildStandingsWithBestThirdGroups(new Set(["E", "F", "G", "H", "I", "J", "K", "L"]))
  });
  const byId = new Map(matches.map((match) => [match.matchId, match]));

  assert.equal(byId.get("M73")?.sideA.source, "2A");
  assert.equal(byId.get("M73")?.sideB.source, "2B");
  assert.equal(byId.get("M74")?.sideA.source, "1E");
  assert.equal(byId.get("M74")?.sideB.source, "3F");
  assert.equal(byId.get("M77")?.sideA.source, "1I");
  assert.equal(byId.get("M77")?.sideB.source, "3G");
  assert.equal(byId.get("M79")?.sideA.source, "1A");
  assert.equal(byId.get("M79")?.sideB.source, "3E");
  assert.equal(byId.get("M80")?.sideA.source, "1L");
  assert.equal(byId.get("M80")?.sideB.source, "3K");
  assert.equal(byId.get("M81")?.sideA.source, "1D");
  assert.equal(byId.get("M81")?.sideB.source, "3I");
  assert.equal(byId.get("M82")?.sideA.source, "1G");
  assert.equal(byId.get("M82")?.sideB.source, "3H");
  assert.equal(byId.get("M85")?.sideA.source, "1B");
  assert.equal(byId.get("M85")?.sideB.source, "3J");
  assert.equal(byId.get("M87")?.sideA.source, "1K");
  assert.equal(byId.get("M87")?.sideB.source, "3L");

  for (const match of matches) {
    assert.notEqual(
      match.sideA.source?.startsWith("3") && match.sideB.source?.startsWith("3"),
      true,
      `${match.matchId} should not pair third-place teams against each other.`
    );

    if (match.sideA.source && match.sideB.source) {
      assert.notEqual(
        sourceToGroupLetter(match.sideA.source),
        sourceToGroupLetter(match.sideB.source),
        `${match.matchId} should not pair teams from the same group.`
      );
    }
  }
});

test("FIFA 2026 Round of 32 third-place matchups score by official match ID and team ID", () => {
  const matches = buildFifa2026RoundOf32({
    groupStandings: buildStandingsWithBestThirdGroups(new Set(["E", "F", "G", "H", "I", "J", "K", "L"]))
  });
  const byId = new Map(matches.map((match) => [match.matchId, match]));
  const match = byId.get("M79");

  assert.ok(match);
  assert.equal(match.sideA.source, "1A");
  assert.equal(match.sideB.source, "3E");
  assert.equal(match.sideA.teamId, "a1");
  assert.equal(match.sideB.teamId, "e3");

  const correct = scoreBracketPrediction(
    {
      stage: "r32",
      status: "final",
      homeScore: 1,
      awayScore: 2,
      winnerTeamId: match.sideB.teamId
    },
    {
      predictedWinnerTeamId: match.sideB.teamId,
      predictedHomeScore: 1,
      predictedAwayScore: 2
    }
  );
  const wrong = scoreBracketPrediction(
    {
      stage: "r32",
      status: "final",
      homeScore: 1,
      awayScore: 2,
      winnerTeamId: match.sideB.teamId
    },
    {
      predictedWinnerTeamId: match.sideA.teamId,
      predictedHomeScore: 2,
      predictedAwayScore: 1
    }
  );

  assert.equal(correct.points, 8);
  assert.equal(wrong.points, 0);

  const leaderboard = calculateCanonicalLeaderboardScores({
    users: ["user-correct", "user-wrong"],
    knockoutScores: new Map([
      ["user-correct", correct.points],
      ["user-wrong", wrong.points]
    ])
  });

  assert.deepEqual(
    leaderboard.map((entry) => ({ userId: entry.user_id, totalPoints: entry.total_points, rank: entry.rank })),
    [
      { userId: "user-correct", totalPoints: 8, rank: 1 },
      { userId: "user-wrong", totalPoints: 0, rank: 2 }
    ]
  );
  assert.doesNotThrow(() => assertCanonicalScoreBreakdownInvariant(leaderboard[0].breakdown));
  assert.equal(leaderboard[0].breakdown.lineItems.find((item) => item.source === "knockout")?.points, 8);
});

test("changing the third-place combination changes official source slots before scoring", () => {
  const lateAlphabet = buildFifa2026RoundOf32({
    groupStandings: buildStandingsWithBestThirdGroups(new Set(["E", "F", "G", "H", "I", "J", "K", "L"]))
  });
  const earlyAlphabet = buildFifa2026RoundOf32({
    groupStandings: buildStandingsWithBestThirdGroups(new Set(["A", "B", "C", "D", "E", "F", "G", "H"]))
  });
  const lateM79 = lateAlphabet.find((match) => match.matchId === "M79");
  const earlyM79 = earlyAlphabet.find((match) => match.matchId === "M79");

  assert.equal(lateM79?.sideB.source, "3E");
  assert.equal(earlyM79?.sideB.source, "3H");
  assert.notEqual(lateM79?.sideB.teamId, earlyM79?.sideB.teamId);
});

test("FIFA 2026 Round of 32 builder keeps official placeholders until all third-place teams resolve", () => {
  const groupStandings = new Map<string, Fifa2026StandingsTeam[]>();
  for (const groupLetter of FIFA_2026_GROUP_LETTERS) {
    groupStandings.set(groupLetter, [team(groupLetter, 1, 9), team(groupLetter, 2, 6)]);
  }

  const matches = buildFifa2026RoundOf32({ groupStandings });
  const byId = new Map(matches.map((match) => [match.matchId, match]));

  assert.equal(byId.get("M74")?.sideB.placeholder, "Best 3rd from A/B/C/D/F");
  assert.deepEqual(byId.get("M79")?.sideB.candidateGroups, ["C", "E", "F", "H", "I"]);
  assert.equal(formatBestThirdPlaceholder(["D", "E", "I", "J", "L"]), "Best 3rd from D/E/I/J/L");
});

test("Round of 32 stored match lookup maps official FIFA IDs onto legacy R32 IDs", () => {
  const legacyMatches = Array.from({ length: 16 }, (_, index) => ({
    id: `r32-${String(index + 1).padStart(2, "0")}`,
    stage: "r32"
  }));

  const lookup = buildFifa2026RoundOf32StoredMatchIdLookup(legacyMatches);

  assert.equal(lookup.get("M73"), "r32-01");
  assert.equal(lookup.get("M88"), "r32-16");
});

test("Round of 32 stored match lookup keeps official FIFA IDs when already migrated", () => {
  const officialMatches = Array.from({ length: 16 }, (_, index) => ({
    id: `M${73 + index}`,
    stage: "r32"
  }));

  const lookup = buildFifa2026RoundOf32StoredMatchIdLookup(officialMatches);

  assert.equal(lookup.get("M73"), "M73");
  assert.equal(lookup.get("M88"), "M88");
});

test("FIFA 2026 third-place ranking uses points, goal difference, goals for, and stable fallbacks", () => {
  const groupStandings = new Map<string, Fifa2026StandingsTeam[]>([
    ["A", [team("A", 1, 9), team("A", 2, 6), team("A", 3, 4, 2, 5)]],
    ["B", [team("B", 1, 9), team("B", 2, 6), team("B", 3, 5, 0, 4)]],
    ["C", [team("C", 1, 9), team("C", 2, 6), team("C", 3, 4, 3, 3)]],
    ["D", [team("D", 1, 9), team("D", 2, 6), team("D", 3, 4, 2, 6)]]
  ]);

  const ranked = rankFifa2026ThirdPlaceTeams(groupStandings);

  assert.deepEqual(ranked.map((seed) => seed.source), ["3B", "3C", "3D", "3A"]);
});

function buildStandingsWithBestThirdGroups(bestThirdGroups: Set<Fifa2026GroupLetter>) {
  const standings = new Map<string, Fifa2026StandingsTeam[]>();
  for (const groupLetter of FIFA_2026_GROUP_LETTERS) {
    standings.set(groupLetter, [
      team(groupLetter, 1, 9, 5, 8),
      team(groupLetter, 2, 6, 2, 5),
      team(groupLetter, 3, bestThirdGroups.has(groupLetter) ? 4 : 1, bestThirdGroups.has(groupLetter) ? 1 : -6, bestThirdGroups.has(groupLetter) ? 4 : 1),
      team(groupLetter, 4, 0, -8, 0)
    ]);
  }

  return standings;
}

function team(
  groupLetter: Fifa2026GroupLetter,
  seed: number,
  points: number,
  goalDifference = 0,
  goalsFor = 0
): Fifa2026StandingsTeam {
  return {
    teamId: `${groupLetter.toLowerCase()}${seed}`,
    teamName: `Group ${groupLetter} Team ${seed}`,
    teamShortName: `${groupLetter}${seed}`,
    points,
    goalDifference,
    goalsFor,
    fifaRanking: seed
  };
}
