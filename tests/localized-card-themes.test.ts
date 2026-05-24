import test from "node:test";
import assert from "node:assert/strict";
import {
  getLocalizedCardTheme,
  resolveLocalizedCardThemeId,
  type LocalizedCardThemeInput
} from "../lib/localized-card-themes.ts";

test("localized card theme prefers home team over country, market, and locale", () => {
  const input: LocalizedCardThemeInput = {
    homeTeamId: "ecu",
    countryCode: "jp",
    marketCode: "de",
    preferredLanguage: "en"
  };

  assert.equal(resolveLocalizedCardThemeId(input), "ecuador");
  assert.equal(getLocalizedCardTheme(input).label, "Ecuador");
});

test("localized card theme resolves argentina directly from the home team id", () => {
  const input: LocalizedCardThemeInput = {
    homeTeamId: "arg",
    preferredLanguage: "fr"
  };

  assert.equal(resolveLocalizedCardThemeId(input), "argentina");
  assert.equal(getLocalizedCardTheme(input).label, "Argentina");
});

test("localized card theme falls back from country to market to locale", () => {
  assert.equal(resolveLocalizedCardThemeId({ countryCode: "japan", preferredLanguage: "es" }), "japan");
  assert.equal(resolveLocalizedCardThemeId({ marketCode: "de", preferredLanguage: "es" }), "germany");
  assert.equal(resolveLocalizedCardThemeId({ preferredLanguage: "pt" }), "brazil");
});

test("localized card theme returns the generic fallback when nothing matches", () => {
  assert.equal(resolveLocalizedCardThemeId({ countryCode: "unknown" }), "generic");
  assert.equal(getLocalizedCardTheme({}).id, "generic");
});
