# PICK-IT 2026 Monetization and IAP Strategy

Status: decision document only

Last updated: June 9, 2026

## Purpose

This document captures the recommended App Store / Google Play monetization strategy for PICK-IT organizer tiers. It is intentionally non-implementation guidance for future billing work.

Payments are not implemented yet. Current TestFlight and internal testing access should remain manual or Super Link based.

## Current Entitlement Model

PICK-IT already supports commercial organizer access through `users.plan_tier`.

Supported commercial tiers:

- `player`
- `captain`
- `manager`
- `director`
- `managing_director`

`users.role` is reserved for platform permissions only:

- `player`
- `admin`

Current centralized limits:

| Tier | Product label | Group limit | Members per group |
| --- | --- | ---: | ---: |
| `player` | Player | 0 managed groups | 0 |
| `captain` | Captain | 1 managed group | 20 |
| `manager` | Manager | 3 managed groups | 30 |
| `director` | Director / League | 10 managed groups | 100 |
| `managing_director` | Managing Director / League Plus | 25 managed groups | 100 |

Manual grants and Super Links / access codes can already grant tiers and avoid downgrading users who already have a higher tier.

There is currently no StoreKit, Google Billing, RevenueCat, subscription, paywall, or payment package installed.

## Recommended Direction

Use RevenueCat for v1 instead of building direct StoreKit and Google Billing integrations.

Reasons:

- PICK-IT needs one entitlement model across iOS and Android.
- RevenueCat can normalize App Store and Google Play purchase state.
- RevenueCat webhooks can sync verified entitlements into Supabase.
- Restore purchases and refund / revocation handling are simpler than building both store integrations directly.
- Supabase can remain the app's effective entitlement source of truth.

Direct StoreKit / Google Billing remains possible later, but it would require more custom lifecycle handling for purchase validation, restore, refund, revocation, and cross-platform entitlement reconciliation.

## Business Model

Use fixed-duration 2026 Tournament Passes for organizer tools.

Do not use recurring subscriptions for v1 unless PICK-IT adds clear year-round value beyond the 2026 tournament.

Player remains free.

Captain should stay out of paid IAP for v1. Captain access can continue to be granted through Captain's Pass, Super Links, access codes, or Super Admin support flows.

## Product Spec

| Product | Product ID | Entitlement key | Maps to | Suggested price |
| --- | --- | --- | --- | ---: |
| Manager Tournament Pass | `pickit_2026_manager_pass` | `organizer_manager_2026` | `plan_tier = manager` | $14.99 |
| Director Tournament Pass | `pickit_2026_director_pass` | `organizer_director_2026` | `plan_tier = director` | $49.99 |
| League Tournament Pass | `pickit_2026_league_pass` | `organizer_league_2026` | `plan_tier = managing_director` | $99.99 |

Paid value should be framed as organizer tooling:

- group creation and management
- invite tools
- higher capacity
- branding
- trophies
- Side Picks controls when enabled
- organizer reports
- league / group administration

Paid access must not be framed as a paid prediction pool, wager, betting product, prize pool, or way to improve scores.

## Server Entitlement Flow

Future purchase flow:

1. User opens the in-app organizer upgrade UI.
2. Native iOS / Android purchase is completed through RevenueCat and the platform store.
3. Client never directly updates `users.plan_tier`.
4. RevenueCat validates the purchase with Apple / Google.
5. RevenueCat sends a webhook to a server endpoint.
6. Server verifies the webhook.
7. Server maps the product ID to an internal entitlement key and `plan_tier`.
8. Server records the billing event.
9. Server updates effective entitlement state in Supabase.
10. Server updates `users.plan_tier` only if the verified entitlement is higher than the user's current effective tier.

Supabase remains the app's effective entitlement source of truth.

Important rules:

- Client-provided product IDs, tiers, and entitlement keys are not trusted.
- Product-to-tier mapping is server-side only.
- Existing higher tiers are never downgraded by lower purchases.
- Super Admin manual grants remain available permanently for support, beta access, and exceptions.
- Access code / Super Link grants continue to work.
- Entitlement changes should be auditable.

## Refund, Revocation, and Expiration

Refund or revocation should remove only the paid entitlement and then recompute the user's effective tier.

Do not delete:

- groups
- predictions
- scoring data
- leaderboard history
- uploaded media
- historical management records

If a user falls over limits after revocation or expiration:

- block new organizer actions that exceed the active tier
- prevent creating additional groups
- prevent increasing capacity beyond the active tier
- keep existing groups and historical content visible
- allow support or Super Admin to resolve ownership / transfer issues

This avoids destructive behavior and keeps support cases manageable.

## Future Tables to Consider

Possible billing-specific tables:

- `billing_customers`
- `billing_entitlements`
- `billing_events`

Possible unified entitlement table:

- `organizer_entitlements`

`organizer_entitlements` could eventually unify:

- Super Admin manual grants
- Super Links
- access codes
- RevenueCat purchases
- refunds / revocations
- fixed-duration tournament access

If added, `users.plan_tier` can remain a denormalized effective-tier cache, recomputed from active entitlements.

## Feature Flags

Recommended current defaults:

| Flag | Current default | Meaning |
| --- | --- | --- |
| `iap_payments_enabled` | `false` | No in-app purchase flow is active. |
| `iap_paywall_visible` | `false` | No upgrade paywall is shown. |
| `manual_organizer_entitlements_enabled` | `true` | Super Admin and Super Link tier grants remain available. |
| `organizer_purchase_provider` | `manual` | Current access source is manual, not store purchases. |
| `leaderboard_comments_enabled` | `false` | Free-form comments stay disabled until moderation/reporting is ready. |

Suggested future provider values:

- `manual`
- `revenuecat`
- `direct_store`

## Store-Safe Copy

Use wording like:

> Upgrade to organizer tools for creating and managing private prediction groups.

> Tournament Pass unlocks group management, invite tools, branding, trophies, reports, and higher group capacity for the 2026 tournament.

> PICK-IT is an entertainment prediction game. Purchases unlock organizer features only. Purchases do not buy picks, improve scores, create wagers, or offer cash prizes.

Avoid wording such as:

- paid pool
- buy-in
- betting
- wager
- gambling
- jackpot
- prize pool
- cash winnings

## What Can Wait Until After TestFlight

The following should not block current TestFlight or internal testing:

- RevenueCat account setup
- native purchase UI
- StoreKit integration
- Google Play Billing integration
- billing webhook
- billing tables
- entitlement reconciliation jobs
- refund / revocation automation
- public pricing screens
- App Store / Google Play IAP product setup

For TestFlight and internal testing, paid organizer tiers should remain manually granted by Super Admin or through Super Links / access codes.

## Future Implementation Phases

### Phase 1: Billing Design and Store Setup

- Choose RevenueCat as v1 billing provider.
- Create RevenueCat project and entitlement keys.
- Create Apple and Google products with matching IDs.
- Confirm product type: fixed-duration 2026 tournament access.
- Finalize store-safe product descriptions.

### Phase 2: Server Entitlement Foundation

- Add billing tables or a unified `organizer_entitlements` table.
- Add a RevenueCat webhook endpoint.
- Verify webhook authenticity.
- Map product IDs to tiers server-side.
- Add entitlement audit logging.
- Add an entitlement recompute helper that updates `users.plan_tier` without downgrading higher active access.

### Phase 3: Native Purchase and Restore

- Add RevenueCat SDK / Capacitor-compatible integration.
- Add in-app purchase UI behind feature flags.
- Add Restore Purchases in Profile / Settings.
- Add clear success, failure, and no-purchase-found states.
- Keep web/PWA behavior graceful and non-purchasing unless a compliant web strategy is explicitly approved.

### Phase 4: Lifecycle Hardening

- Handle refunds, revocations, billing issues, and expirations.
- Block new over-limit organizer actions without deleting existing content.
- Add support tooling for entitlement inspection.
- Add manual override workflows for support cases.

### Phase 5: Public Launch Readiness

- Align App Store / Google Play metadata with actual data and purchase behavior.
- Verify all pricing copy avoids gambling, wagering, paid pool, and cash-prize framing.
- Test purchase, restore, refund, and downgrade paths in sandbox.
- Confirm no external payment links appear inside the app.

## Non-Goals For Now

Do not do the following until explicitly scheduled:

- install RevenueCat packages
- add StoreKit code
- add Google Billing code
- add a paywall
- add external payment links inside the app
- change database schema for billing
- change tier limits
- change `users.role` semantics
- change production entitlement behavior
- enable paid access in production
- treat organizer purchases as betting, wagering, pools, or cash-prize participation

## Current Decision

PICK-IT can proceed to TestFlight / internal testing without payments implemented.

The future v1 monetization direction is RevenueCat-backed fixed-duration 2026 Tournament Passes for organizer tools, with Supabase remaining the effective entitlement source of truth and Super Admin manual grants preserved for support and beta exceptions.
