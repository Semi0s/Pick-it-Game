import test from "node:test";
import assert from "node:assert/strict";

import { resolveTeamIdByName } from "../lib/match-sync/team-resolution.ts";

const teams = [
  {
    id: "civ",
    name: "Côte d'Ivoire",
    short_name: "CIV"
  },
  {
    id: "ecu",
    name: "Ecuador",
    short_name: "ECU"
  }
];

test("team resolution maps Ivory Coast onto Côte d'Ivoire", () => {
  assert.equal(resolveTeamIdByName("Ivory Coast", teams), "civ");
});

test("team resolution keeps direct normalized Côte d'Ivoire matching", () => {
  assert.equal(resolveTeamIdByName("Cote d'Ivoire", teams), "civ");
});
