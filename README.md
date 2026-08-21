# THE ROT

A mobile-first, server-authoritative 3D multiplayer social deduction game.
Node.js + Socket.IO backend, React + Three.js frontend.

This is a **real, runnable codebase** — not a mockup. It implements the full
rule set from the design spec: room/host lobby, secret role assignment,
30-second power outages with limited vision, card stealing, the secret
corruption choice, card-death, ghosts, the Map Room, discussion, anonymous
voting with the two-stage tie system, exactly 3 rounds, both win conditions,
and reconnect support.

## Project layout

```
the-rot/
  server/     Node.js + Socket.IO — the authoritative game engine
  client/     React + Three.js — mobile UI and 3D scene
```

## Running it locally

You'll need Node.js 18+.

**1. Start the server**

```bash
cd server
npm install
npm start
```

It listens on `http://localhost:4000` by default (override with `PORT`).

**2. Start the client** (in a second terminal)

```bash
cd client
npm install
npm run dev
```

Open the printed local URL (usually `http://localhost:5173`). By default the
client talks to `http://localhost:4000` — no `.env` needed for local dev.

**3. Try it**

- Open one browser tab, click **HOST A ROOM**, create a room, note the code.
- Open 3–11 more tabs (or real phones on the same network — see below),
  click **JOIN A GAME**, enter the code and a name.
- Once you have at least the minimum players, hit **START GAME** on the
  host tab.

To test from an actual phone on the same Wi‑Fi during development, start the
Vite dev server with `npm run dev -- --host`, then visit
`http://<your-computer's-LAN-IP>:5173` on the phone, and set
`VITE_SERVER_URL` (see `client/.env.example`) to
`http://<your-computer's-LAN-IP>:4000`.

## Deploying so people can play from their own phones

The server needs to run somewhere persistent (Render, Railway, Fly.io,
a VPS, etc. — anywhere that supports long-lived WebSocket connections).
The client is a static site (Vercel, Netlify, GitHub Pages, or the same
host).

1. Deploy `server/` to something like Render as a Node web service
   (`npm install && npm start`, expose the port it listens on).
2. Deploy `client/` as a static build: `npm run build` produces `dist/`.
   Set the `VITE_SERVER_URL` environment variable at build time to your
   deployed server's URL.
3. In `server/src/index.js`, tighten the Socket.IO `cors.origin` from `"*"`
   to your deployed client's exact origin before going live for real.

## How the rules map to the code

| Spec section | Where it lives |
|---|---|
| Room/Host, min/max players | `server/src/Room.js` (`addPlayer`, config) |
| Secret OC + card assignment | `Room.startGame()` |
| 30s power outage + arrow | `Room._startPowerOutage/_restorePower`, client `PowerOutageOverlay.jsx` |
| Card stealing + cooldown/history | `Room.handleStealCard` |
| Secret corruption choice | `Room.handleCorruptionChoice`, client `CorruptionPrompt.jsx` |
| Card death → Ghost | `Room._handleCardDeath` |
| Map Room | `Room.handleMove` zone check + `maproom:data`, client `MapRoomPanel.jsx` |
| Discussion + manual meeting | `Room._startDiscussion` / `handleCallMeeting` |
| Anonymous voting + tie system | `Room._startVoting` / `_tallyVotes` / `_startTieClarify` / `_startTieVote` |
| 3-round loop, win conditions | `Room._afterElimination` / `_checkEndOfRound3` / `_endGame` |
| Reconnect | `Room.reconnectPlayer`, client `App.jsx` (localStorage session) |

## Design assumptions made explicit

The original spec is thorough but a few points were genuinely ambiguous or
silent. Rather than guess silently, here's exactly what this build does and
why, so you can change any of it:

1. **End-of-Round-3 edge case the spec doesn't cover.** The spec defines
   Innocent-win as "OC eliminated" and Corrupted-win as "living Corrupted >
   living Innocent at end of Round 3" — but never says what happens if
   Round 3 ends with the OC *still alive* and Corrupted *not* outnumbering
   Innocents (i.e. neither condition is technically met). This build
   resolves that gap as an **Innocent win** (`Room._checkEndOfRound3`),
   since the Corrupted's one stated win condition wasn't achieved. If you
   want different behavior here, this is the one place to change.
2. **Manual "meeting" button.** Interpreted as: during Discussion, any
   living player can call a meeting that cuts the remaining discussion time
   down to a 60-second countdown before voting opens, rather than waiting
   out the full 3 minutes.
3. **Voting duration.** The spec doesn't give a time limit for the main
   vote or the second (tie) vote. Defaults: 45s for the main vote, 30s for
   the tie vote, both auto-advancing early once everyone has voted. Change
   these in `server/src/Room.js` (`_startVoting`, `_startTieVote`).
4. **Self-voting** isn't restricted, since the spec doesn't mention it.
5. **Card-death vs. an in-progress vote**: resolved as agreed earlier —
   death is immediate and silent (no identity reveal), any vote already
   cast *for* the now-dead player is discarded, votes already cast *by*
   them remain valid, and the current vote stage re-evaluates rather than
   restarting.
6. **Power restoration** is available to *any* living player in the Power
   Room, not just the OC, with a 30-second auto-restore failsafe so a
   round can never stall.
7. **Movement / anti-cheat**: the client reports its own position, and the
   server validates zone membership (Power Room, Map Room, steal range)
   against that reported position, clamped to world bounds. This is enough
   to stop the specific exploits the spec lists (remote power restore,
   faking roles/cards, double actions), but a client could still lie about
   its exact coordinates. A production build would want server-side
   movement simulation with speed limits to close that gap fully.
8. **Visual style**: "3D, low-poly, cute but mysterious" is implemented
   with genuine Three.js 3D (capsule/sphere characters, boxed rooms, real
   lighting incl. emergency red light during outages) using primitive
   geometry rather than modeled/rigged/animated character assets — there's
   no art pipeline here, so it reads as low-poly by construction rather
   than by a deliberate art pass. Swapping in real character models later
   is a matter of loading a `.glb` in `GameScene3D.js` instead of building
   the capsule group.

## What's intentionally not built

Per the spec's "strictly do not add" list: no vents, tasks, sabotage,
weapons, combat, shops, XP, extra roles, or extra rounds. Also not built,
because they're beyond a first playable prototype: sound design, a full
tutorial animation sequence (the tutorial is a static checklist on the
player's waiting screen), and production-grade anti-cheat.
