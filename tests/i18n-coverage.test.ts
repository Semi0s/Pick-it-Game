import test from "node:test";
import assert from "node:assert/strict";
import { supportedLanguages } from "../lib/i18n.ts";
import { translations } from "../lib/strings.ts";

type TranslationLeaf = string | { one: string; other: string };
type FlatTranslations = Map<string, TranslationLeaf>;

function isPluralLeaf(value: unknown): value is { one: string; other: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "one" in value &&
    "other" in value &&
    typeof (value as { one?: unknown }).one === "string" &&
    typeof (value as { other?: unknown }).other === "string"
  );
}

function flattenTranslations(value: unknown, prefix = "", output: FlatTranslations = new Map()): FlatTranslations {
  if (typeof value === "string" || isPluralLeaf(value)) {
    output.set(prefix, value);
    return output;
  }

  assert.equal(typeof value, "object", `Expected translation namespace at ${prefix || "<root>"}`);
  assert.notEqual(value, null, `Expected translation namespace at ${prefix || "<root>"}`);

  for (const [key, childValue] of Object.entries(value as Record<string, unknown>)) {
    flattenTranslations(childValue, prefix ? `${prefix}.${key}` : key, output);
  }

  return output;
}

function getTemplateVariables(value: TranslationLeaf) {
  const templates = typeof value === "string" ? [value] : [value.one, value.other];
  const variables = new Set<string>();

  for (const template of templates) {
    for (const match of template.matchAll(/\{([a-zA-Z0-9_]+)\}/g)) {
      variables.add(match[1]!);
    }
  }

  return [...variables].sort();
}

function getTemplateVariablesForShape(value: TranslationLeaf) {
  if (typeof value === "string") {
    return [getTemplateVariables(value)];
  }

  return [getTemplateVariables(value.one), getTemplateVariables(value.other)];
}

function getLeafShape(value: TranslationLeaf) {
  return typeof value === "string" ? "string" : "plural";
}

test("all app language catalogs have matching keys, plural shapes, and template variables", () => {
  const baseline = flattenTranslations(translations.en);
  const baselineKeys = [...baseline.keys()].sort();

  for (const language of supportedLanguages) {
    const current = flattenTranslations(translations[language]);
    assert.deepEqual([...current.keys()].sort(), baselineKeys, `${language} translation keys must match English`);

    for (const [key, englishValue] of baseline) {
      const localizedValue = current.get(key);
      assert.ok(localizedValue, `${language}.${key} is missing`);
      assert.equal(getLeafShape(localizedValue), getLeafShape(englishValue), `${language}.${key} shape must match English`);
      assert.deepEqual(
        getTemplateVariablesForShape(localizedValue),
        getTemplateVariablesForShape(englishValue),
        `${language}.${key} template variables must match English`
      );
    }
  }
});
