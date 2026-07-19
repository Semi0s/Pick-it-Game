import assert from "node:assert/strict";
import test from "node:test";

import { resolveAdminMatchParticipants, type AdminResolvableMatch } from "../lib/admin-match-participants.ts";

test("admin match participants resolve semifinal losers for the third-place match", () => {
  const matches: AdminResolvableMatch[] = [
    {
      id: "sf-01",
      stage: "sf",
      status: "final",
      homeTeamId: "can",
      awayTeamId: "mar",
      winnerTeamId: "can",
      homeTeam: {
        id: "can",
        name: "Canada",
        shortName: "CAN",
        flagEmoji: "🇨🇦"
      },
      awayTeam: {
        id: "mar",
        name: "Morocco",
        shortName: "MAR",
        flagEmoji: "🇲🇦"
      }
    },
    {
      id: "sf-02",
      stage: "sf",
      status: "final",
      homeTeamId: "par",
      awayTeamId: "fra",
      winnerTeamId: "fra",
      homeTeam: {
        id: "par",
        name: "Paraguay",
        shortName: "PAR",
        flagEmoji: "🇵🇾"
      },
      awayTeam: {
        id: "fra",
        name: "France",
        shortName: "FRA",
        flagEmoji: "🇫🇷"
      }
    },
    {
      id: "M103",
      stage: "third",
      status: "scheduled",
      homeSource: "Loser of M101",
      awaySource: "Loser of M102"
    }
  ];

  const resolved = resolveAdminMatchParticipants(matches);
  const thirdPlaceMatch = resolved.find((match) => match.id === "M103");

  assert.ok(thirdPlaceMatch);
  assert.equal(thirdPlaceMatch.homeTeamId, "mar");
  assert.equal(thirdPlaceMatch.awayTeamId, "par");
  assert.deepEqual(thirdPlaceMatch.homeTeam, {
    id: "mar",
    name: "Morocco",
    shortName: "MAR",
    flagEmoji: "🇲🇦"
  });
  assert.deepEqual(thirdPlaceMatch.awayTeam, {
    id: "par",
    name: "Paraguay",
    shortName: "PAR",
    flagEmoji: "🇵🇾"
  });
});
