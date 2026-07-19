import test from "node:test";
import assert from "node:assert/strict";

import { normalizeKnockoutStageForMatch } from "../lib/match-stage.ts";
import {
  collapseFifa2026KnockoutAliasRows,
  normalizeFifa2026KnockoutStoredMatchId
} from "../lib/fifa-2026-knockout-seeding.ts";

test("normalizeKnockoutStageForMatch infers third-place and final stages from canonical ids", () => {
  assert.equal(normalizeKnockoutStageForMatch({ stage: "final", matchId: "third-01" }), "third");
  assert.equal(normalizeKnockoutStageForMatch({ stage: "third", matchId: "final-01" }), "final");
  assert.equal(normalizeKnockoutStageForMatch({ stage: null, matchId: "M103" }), "third");
  assert.equal(normalizeKnockoutStageForMatch({ stage: null, matchId: "M104" }), "final");
});

test("normalizeKnockoutStageForMatch falls back to stage aliases when the id is unknown", () => {
  assert.equal(normalizeKnockoutStageForMatch({ stage: "round_of_16", matchId: "custom-r16" }), "r16");
  assert.equal(normalizeKnockoutStageForMatch({ stage: "third", matchId: "custom-third" }), "third");
  assert.equal(normalizeKnockoutStageForMatch({ stage: "group", matchId: "g-01" }), null);
});

test("normalizeFifa2026KnockoutStoredMatchId handles legacy, lowercase, and hyphenated official ids", () => {
  assert.equal(normalizeFifa2026KnockoutStoredMatchId("third-01"), "M103");
  assert.equal(normalizeFifa2026KnockoutStoredMatchId(" Third_01 "), "M103");
  assert.equal(normalizeFifa2026KnockoutStoredMatchId("m103"), "M103");
  assert.equal(normalizeFifa2026KnockoutStoredMatchId("M-104"), "M104");
});

test("collapseFifa2026KnockoutAliasRows keeps the richer bronze-match row when aliases collide", () => {
  const collapsed = collapseFifa2026KnockoutAliasRows([
    {
      id: "third-01",
      stage: "third",
      status: "scheduled",
      home_team_id: null,
      away_team_id: null,
      updated_at: "2026-07-15T10:00:00.000Z"
    },
    {
      id: "M103",
      stage: "final",
      status: "scheduled",
      home_team_id: "loser-a",
      away_team_id: "loser-b",
      home_source: "Loser of M101",
      away_source: "Loser of M102",
      updated_at: "2026-07-15T10:05:00.000Z"
    }
  ]);

  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0]?.id, "M103");
  assert.equal(collapsed[0]?.home_team_id, "loser-a");
  assert.equal(collapsed[0]?.away_team_id, "loser-b");
});

test("collapseFifa2026KnockoutAliasRows repairs a bronze row from canonical source labels when the id is custom", () => {
  const collapsed = collapseFifa2026KnockoutAliasRows([
    {
      id: "bronze-match",
      stage: "final",
      status: "scheduled",
      home_source: "Loser of sf-01",
      away_source: "Loser of sf-02",
      kickoff_time: null,
      updated_at: "2026-07-15T10:10:00.000Z"
    }
  ]);

  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0]?.id, "bronze-match");
  assert.equal(collapsed[0]?.stage, "third");
  assert.equal(collapsed[0]?.home_source, "Loser of M101");
  assert.equal(collapsed[0]?.away_source, "Loser of M102");
  assert.equal(collapsed[0]?.kickoff_time, "2026-07-18T17:00:00-04:00");
  assert.equal(
    normalizeKnockoutStageForMatch({
      stage: collapsed[0]?.stage ?? null,
      matchId: collapsed[0]?.id ?? null
    }),
    "third"
  );
});

test("normalizeKnockoutStageForMatch accepts legacy third-place stage aliases", () => {
  assert.equal(normalizeKnockoutStageForMatch({ stage: "third_place", matchId: "legacy-bronze" }), "third");
});

test("collapseFifa2026KnockoutAliasRows can rescue a bronze row even when the stored stage is blank", () => {
  const collapsed = collapseFifa2026KnockoutAliasRows([
    {
      id: "bronze-match",
      stage: null,
      status: "scheduled",
      home_source: "Loser of sf-01",
      away_source: "Loser of sf-02",
      kickoff_time: null,
      updated_at: "2026-07-15T10:10:00.000Z"
    }
  ]);

  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0]?.stage, "third");
  assert.equal(
    normalizeKnockoutStageForMatch({
      stage: collapsed[0]?.stage ?? null,
      matchId: collapsed[0]?.id ?? null
    }),
    "third"
  );
});
