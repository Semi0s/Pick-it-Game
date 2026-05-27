# FIFA 2026 Knockout Seeding

## Why This Exists

The 2026 FIFA World Cup sends 32 teams into the knockout stage:

- 12 group winners
- 12 group runners-up
- 8 best third-place teams

The eight third-place teams are not seeded as a simple ranked block. FIFA assigns them to specific Round of 32 slots through the official Annexe C permutation table based on which 8 of the 12 groups produce qualifying third-place teams.

The old placeholder model placed ranked third-place teams at the end of the bracket, which could create third-place-vs-third-place matches. That is not a valid 2026 bracket.

## Canonical Table

The static Annexe C lookup lives in:

- `lib/fifa-2026-third-place-permutations.ts`

It contains all 495 possible combinations of 8 qualifying third-place groups from Groups A-L. Each row maps the official target columns:

- `1A`
- `1B`
- `1D`
- `1E`
- `1G`
- `1I`
- `1K`
- `1L`

to a third-place source such as `3E` or `3J`.

Example:

If the best third-place groups are `E F G H I J K L`, the row maps:

- `1A -> 3E`
- `1B -> 3J`
- `1D -> 3I`
- `1E -> 3F`
- `1G -> 3H`
- `1I -> 3G`
- `1K -> 3L`
- `1L -> 3K`

The table was generated from the public FIFA 2026 third-place table reference, which cites FIFA tournament regulations Annexe C. It is static at runtime.

## Canonical Builder

The Round of 32 builder lives in:

- `lib/fifa-2026-knockout-seeding.ts`

Primary entry points:

- `rankFifa2026ThirdPlaceTeams(...)`
- `getFifa2026ThirdPlacePermutation(...)`
- `buildFifa2026RoundOf32(...)`
- `buildFifa2026RoundOf32FromSeeds(...)`

The builder returns official match IDs `M73` through `M88`, source slots, placeholders, and resolved team IDs when available.

## Official Round Of 32

The official fixed sources are:

- `M73: 2A vs 2B`
- `M74: 1E vs assigned third-place team`
- `M75: 1F vs 2C`
- `M76: 1C vs 2F`
- `M77: 1I vs assigned third-place team`
- `M78: 2E vs 2I`
- `M79: 1A vs assigned third-place team`
- `M80: 1L vs assigned third-place team`
- `M81: 1D vs assigned third-place team`
- `M82: 1G vs assigned third-place team`
- `M83: 2K vs 2L`
- `M84: 1H vs 2J`
- `M85: 1B vs assigned third-place team`
- `M86: 1J vs 2H`
- `M87: 1K vs assigned third-place team`
- `M88: 2D vs 2G`

No Round of 32 match should pair two third-place teams.

## Third-Place Ranking

The helper ranks the 12 group third-place teams using modeled FIFA criteria:

1. points
2. goal difference
3. goals scored
4. team conduct score, if available
5. FIFA ranking, if available
6. stable group/team ID fallback for deterministic app behavior

Current app standings do not fully model fair-play/team-conduct data for every team. If that data is missing, the engine uses FIFA ranking if available and then a stable fallback. This is deterministic but should be revisited if official conduct scores become available.

## Unresolved Placeholders

When group predictions/results are incomplete and the eight third-place qualifiers cannot be known, the builder does not guess. It returns official placeholders:

- `M74: Best 3rd from A/B/C/D/F`
- `M77: Best 3rd from C/D/F/G/H`
- `M79: Best 3rd from C/E/F/H/I`
- `M80: Best 3rd from E/H/I/J/K`
- `M81: Best 3rd from B/E/F/I/J`
- `M82: Best 3rd from A/E/H/I/J`
- `M85: Best 3rd from E/F/G/I/J`
- `M87: Best 3rd from D/E/I/J/L`

UI can localize the visible label, but bracket logic must continue to use stable source IDs and match IDs.

## Scoring Impact

Visualization and scoring now share the canonical Round of 32 builder through `lib/knockout-seeding.ts`.

Scoring and seeding should use:

- official match IDs (`M73`-`M104`)
- source slots (`1A`, `2B`, `3E`)
- team IDs
- round/stage IDs

They must not use:

- translated display labels
- visible UI text
- visual theme or home-team localization
- array position in a rendered bracket

## Migration Notes

The migration:

- `supabase/migrations/20260527_fifa_2026_official_knockout_seeding.sql`

resets pre-launch knockout test data by deleting existing knockout matches and cascading related knockout predictions/scores/events. It then inserts the official FIFA match skeleton `M73` through `M104`.

This intentionally invalidates old internal/test knockout picks because the previous matchups could be wrong. Group-stage predictions are not touched.

Fresh local seeds were updated in:

- `supabase/seed.sql`

## Verification

Focused coverage lives in:

- `tests/fifa-2026-knockout-seeding.test.ts`

The tests verify:

- the table contains 495 combinations
- every permutation row is internally valid
- the `EFGHIJKL` known example maps correctly
- official R32 fixed slots are emitted
- no R32 third-place-vs-third-place match exists
- placeholders render when third-place qualifiers are unresolved
- third-place ranking uses deterministic criteria

