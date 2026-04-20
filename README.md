# PICK-IT!

WORLD. CUP FIFA2026

A mobile-first private prediction game for family and friends, built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## Phase 1 Scope

- Project scaffold
- Supabase schema and seed files
- Invite-only mock auth flow
- Demo profiles and match data
- Group-stage prediction UI with kickoff locking
- LocalStorage-backed prototype state

Later phases will add result entry, scoring rollups, leaderboard, knockout bracket picks, side picks, and full Supabase data wiring.

## Getting Started

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and add your Supabase project values when you are ready to connect the app to a real backend.

## Demo Invites

Use one of these emails with any password of six or more characters:

- `alex@example.com`
- `jamie@example.com`
- `morgan@example.com`
- `admin@example.com`

The mock auth layer keeps the prototype usable before Supabase Auth is configured.
