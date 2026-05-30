import test from "node:test";
import assert from "node:assert/strict";
import { teams } from "../lib/mock-data.ts";
import {
  getAppAccentCssVars,
  getLocalizedCardCssVars,
  getLocalizedCardTheme,
  getLocalizedCardThemeForUserSurface,
  isLightLocalizedCardTheme,
  resolveLocalizedCardThemeId,
  type LocalizedCardThemeInput
} from "../lib/localized-card-themes.ts";
import {
  getVisualThemeSelectOptions,
  getVisualThemeSelectValue,
  parseVisualThemeSelectValue
} from "../lib/visual-theme-options.ts";

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

test("localized card theme resolves canada and england directly from their home team ids", () => {
  assert.equal(resolveLocalizedCardThemeId({ homeTeamId: "can", preferredLanguage: "fr" }), "canada");
  assert.equal(resolveLocalizedCardThemeId({ homeTeamId: "eng", preferredLanguage: "es" }), "england");
});

test("oranjekoorts resolves as an explicit visual theme without changing language behavior", () => {
  const theme = getLocalizedCardThemeForUserSurface({
    visualThemeId: "oranjekoorts",
    preferredLanguage: "de"
  });

  assert.equal(theme.id, "oranjekoorts");
  assert.equal(theme.label, "Oranjekoorts");
  assert.equal(theme.mainBackground, "#F97316");
  assert.equal(theme.colors[0], "#FF7900");
  assert.equal(theme.accent, "#FF7900");
  assert.equal(resolveLocalizedCardThemeId({ preferredLanguage: "de" }), "generic");
});

test("visual theme menu options place Oranjekoorts after Netherlands and preserve special visual theme selection", () => {
  const options = getVisualThemeSelectOptions(teams);
  const labels = options.map((option) => option.label);
  const oranjekoortsIndex = options.findIndex((option) => option.id === "oranjekoorts");
  const netherlandsIndex = options.findIndex((option) => option.id === "ned");

  assert.notEqual(oranjekoortsIndex, -1);
  assert.notEqual(netherlandsIndex, -1);
  assert.equal(oranjekoortsIndex, netherlandsIndex + 1);
  assert.deepEqual(parseVisualThemeSelectValue("visual:oranjekoorts"), {
    homeTeamId: null,
    visualThemeId: "oranjekoorts"
  });
  assert.equal(getVisualThemeSelectValue({ homeTeamId: "ned", visualThemeId: null }), "team:ned");
  assert.equal(getVisualThemeSelectValue({ homeTeamId: "ned", visualThemeId: "oranjekoorts" }), "visual:oranjekoorts");
});

test("localized card theme falls back from country to market to locale", () => {
  assert.equal(resolveLocalizedCardThemeId({ countryCode: "japan", preferredLanguage: "es" }), "japan");
  assert.equal(resolveLocalizedCardThemeId({ marketCode: "de", preferredLanguage: "es" }), "germany");
  assert.equal(resolveLocalizedCardThemeId({ preferredLanguage: "pt" }), "generic");
});

test("localized card theme returns the generic fallback when nothing matches", () => {
  assert.equal(resolveLocalizedCardThemeId({ countryCode: "unknown" }), "generic");
  assert.equal(getLocalizedCardTheme({}).id, "generic");
});

test("ecuador and colombia keep a light-surface render mode with blue-led top bands and red lower bands", () => {
  for (const id of ["ecuador", "colombia"] as const) {
    const theme = getLocalizedCardTheme({ homeTeamId: id === "ecuador" ? "ecu" : "col" });
    const cssVars = getLocalizedCardCssVars(theme) as Record<string, string | undefined>;

    assert.equal(theme.mainBackground, "#FCD116");
    assert.equal(theme.textColor, "#FFFFFF");
    assert.equal(isLightLocalizedCardTheme(theme), true);
    assert.equal(cssVars["--localized-card-accent-1"], "#003893");
    assert.equal(cssVars["--localized-card-accent-2"], "#CE1126");
    assert.equal(cssVars["--localized-card-accent-3"], "#003893");
    assert.equal(cssVars["--localized-card-accent-4"], "#003893");
    assert.equal(cssVars["--localized-card-accent-5"], "#CE1126");
  }
});

test("generic theme keeps the current green accent fallback", () => {
  const theme = getLocalizedCardTheme({});
  const accentVars = getAppAccentCssVars(theme) as Record<string, string | undefined>;

  assert.equal(theme.id, "generic");
  assert.equal(accentVars["--app-accent"], "#56A24F");
  assert.equal(accentVars["--app-accent-light"], "#CADCC7");
  assert.equal(accentVars["--app-accent-dark"], "#3F8C39");
  assert.equal(accentVars["--app-accent-text"], "#111111");
  assert.equal(accentVars["--app-accent-fill"], "#437E3E");
  assert.equal(accentVars["--app-accent-fill-text"], "#FFFFFF");
});

test("user-owned surfaces stay generic when no home team is selected", () => {
  const genericTheme = getLocalizedCardThemeForUserSurface({ preferredLanguage: "fr" });
  const explicitTheme = getLocalizedCardThemeForUserSurface({ countryCode: "ecu", preferredLanguage: "fr" });

  assert.equal(genericTheme.id, "generic");
  assert.equal(explicitTheme.id, "ecuador");
});

test("localized app accents stay explicit for cooled yellow themes and quiet red-outline themes", () => {
  const germanyTheme = getLocalizedCardTheme({ homeTeamId: "ger" });
  const ecuadorTheme = getLocalizedCardTheme({ homeTeamId: "ecu" });
  const brazilTheme = getLocalizedCardTheme({ homeTeamId: "bra" });
  const austriaTheme = getLocalizedCardTheme({ homeTeamId: "aut" });
  const canadaTheme = getLocalizedCardTheme({ homeTeamId: "can" });
  const japanTheme = getLocalizedCardTheme({ homeTeamId: "jpn" });
  const koreaTheme = getLocalizedCardTheme({ homeTeamId: "kor" });

  assert.equal(germanyTheme.accent, "#DD0000");
  assert.equal(germanyTheme.accentText, "#FFFFFF");
  assert.equal(ecuadorTheme.accent, "#003893");
  assert.equal(brazilTheme.accent, "#56A24F");
  assert.equal(austriaTheme.useNeutralAccent, true);
  assert.equal(canadaTheme.accent, "#D80621");
  assert.equal(japanTheme.accent, "#D0002F");
  assert.equal(koreaTheme.accent, "#CD2E3A");
  assert.equal(canadaTheme.useNeutralAccent, true);
  assert.equal(japanTheme.useNeutralAccent, true);
  assert.equal(koreaTheme.useNeutralAccent, true);
  assert.equal(canadaTheme.flagAccent, "#D80621");
});

test("quiet red-accent themes keep red identity while softening button fills", () => {
  for (const teamId of ["can", "aut", "jpn", "kor", "sui", "tun", "tur"] as const) {
    const theme = getLocalizedCardTheme({ homeTeamId: teamId });
    const accentVars = getAppAccentCssVars(theme) as Record<string, string | undefined>;

    assert.equal(theme.useNeutralAccent, true);
    assert.notEqual(accentVars["--app-accent"], accentVars["--app-accent-fill"]);
    assert.equal(accentVars["--app-accent-fill"], accentVars["--app-accent-light"]);
    assert.equal(accentVars["--app-accent-fill-hover"], theme.borderColor);
  }
});

test("theme light accents stay visible against the Group Stage empty LED gray", () => {
  for (const team of teams) {
    const theme = getLocalizedCardTheme({ homeTeamId: team.id });
    const accentVars = getAppAccentCssVars(theme) as Record<string, string | undefined>;
    const accentLight = accentVars["--app-accent-light"];

    assert.ok(accentLight, `Expected ${team.id} to produce a light accent`);
    assert.ok(
      getContrastRatioForTest(accentLight!, "#F3F4F6") >= 1.3,
      `Light accent for ${team.id} is too close to gray-100: ${accentLight}`
    );
  }
});

test("every supported tournament team resolves to a non-generic localized theme", () => {
  for (const team of teams) {
    const theme = getLocalizedCardTheme({ homeTeamId: team.id });
    assert.notEqual(
      theme.id,
      "generic",
      `Expected ${team.id} (${team.name}) to resolve to a dedicated localized theme`
    );
  }
});

test("resolved app accents stay away from near-white button fills", () => {
  for (const team of teams) {
    const theme = getLocalizedCardTheme({ homeTeamId: team.id });
    const accentVars = getAppAccentCssVars(theme) as Record<string, string | undefined>;
    const accent = accentVars["--app-accent"];
    assert.ok(accent, `Expected ${team.id} to produce an accent color`);
    assert.ok(getRelativeLuminanceForTest(accent!) < 0.94, `Accent for ${team.id} is too light: ${accent}`);
  }
});

test("resolved app accent fills always keep readable text contrast", () => {
  for (const team of teams) {
    const theme = getLocalizedCardTheme({ homeTeamId: team.id });
    const accentVars = getAppAccentCssVars(theme) as Record<string, string | undefined>;
    const fill = accentVars["--app-accent-fill"];
    const fillText = accentVars["--app-accent-fill-text"];

    assert.ok(fill, `Expected ${team.id} to produce a fill color`);
    assert.ok(fillText, `Expected ${team.id} to produce a fill text color`);
    assert.ok(
      getContrastRatioForTest(fill!, fillText!) >= 4.5,
      `Fill contrast for ${team.id} is too low: ${fill} vs ${fillText}`
    );
  }
});

test("argentina and uruguay keep their light-blue accent identity while using white text on darker filled buttons", () => {
  for (const teamId of ["arg", "uru"] as const) {
    const theme = getLocalizedCardTheme({ homeTeamId: teamId });
    const accentVars = getAppAccentCssVars(theme) as Record<string, string | undefined>;

    assert.equal(theme.accentText, "#FFFFFF");
    assert.equal(accentVars["--app-accent-fill-text"], "#FFFFFF");
    assert.notEqual(accentVars["--app-accent"], accentVars["--app-accent-fill"]);
    assert.ok(
      getContrastRatioForTest(accentVars["--app-accent-fill"]!, "#FFFFFF") >= 4.5,
      `Expected ${teamId} fill to support white text`
    );
  }
});

test("curated emblem assets are wired for the first upgraded countries while ecuador stays asset-backed", () => {
  const ecuadorTheme = getLocalizedCardTheme({ homeTeamId: "ecu" });
  assert.equal(ecuadorTheme.emblemAsset, "/patterns/Ecuador-Seal.svg");

  const upgradedAssetThemes = [
    ["mex", "/patterns/Mexico-Coat-of-Arms.svg"],
    ["por", "/patterns/Portugal-Coat-of-Arms.svg"],
    ["cro", "/patterns/Croatia-Coat-of-Arms.svg"],
    ["egy", "/patterns/Egypt-Coat-of-Arms.svg"],
    ["par", "/patterns/Paraguay-Coat-of-Arms.svg"]
  ] as const;

  for (const [teamId, emblemAsset] of upgradedAssetThemes) {
    const theme = getLocalizedCardTheme({ homeTeamId: teamId });
    assert.equal(theme.emblemAsset, emblemAsset);
  }
});

test("brazil now uses the simpler in-code diamond-and-globe emblem instead of the coat-of-arms asset", () => {
  const brazilTheme = getLocalizedCardTheme({ homeTeamId: "bra" });
  assert.equal(brazilTheme.emblemKind, "brazil");
  assert.equal(brazilTheme.emblemAsset, undefined);
});

test("france now uses the provided fleur-de-lis asset", () => {
  const franceTheme = getLocalizedCardTheme({ homeTeamId: "fra" });
  assert.equal(franceTheme.emblemAsset, "/patterns/France-Fleur-de-lis.png");
});

test("canada now uses the provided maple leaf asset", () => {
  const canadaTheme = getLocalizedCardTheme({ homeTeamId: "can" });
  assert.equal(canadaTheme.emblemAsset, "/patterns/Canada-Maple-Leaf.png");
});

test("spain now uses the Wikimedia coat-of-arms asset", () => {
  const spainTheme = getLocalizedCardTheme({ homeTeamId: "esp" });
  assert.equal(spainTheme.emblemAsset, "/patterns/Spain-Coat-of-Arms.svg");
});

test("selected blob-prone countries now fall back to cleaner pattern-only localization", () => {
  for (const teamId of ["col", "ger", "hai", "civ", "irn", "irq"] as const) {
    const theme = getLocalizedCardTheme({ homeTeamId: teamId });
    assert.equal(theme.emblemKind, "none");
    assert.equal(theme.emblemAsset, undefined);
  }
});

function getRelativeLuminanceForTest(color: string) {
  const rgb = parseHexColorForTest(color);
  assert.ok(rgb, `Unsupported test color: ${color}`);

  const [r, g, b] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatioForTest(left: string, right: string) {
  const leftLuminance = getRelativeLuminanceForTest(left);
  const rightLuminance = getRelativeLuminanceForTest(right);
  const lighter = Math.max(leftLuminance, rightLuminance);
  const darker = Math.min(leftLuminance, rightLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseHexColorForTest(color: string) {
  const normalized = color.trim().replace("#", "");
  if (normalized.length !== 3 && normalized.length !== 6) {
    return null;
  }

  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : normalized;

  const value = Number.parseInt(expanded, 16);
  if (Number.isNaN(value)) {
    return null;
  }

  return [(value >> 16) & 255, (value >> 8) & 255, value & 255] as const;
}
