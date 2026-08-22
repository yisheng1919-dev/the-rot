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
3. Set the `CORS_ORIGINS` environment variable on your **server** host to
   your deployed client's exact origin (e.g.
   `https://your-app.netlify.app`) — comma-separate multiple origins if
   you have more than one. Without this set, the server defaults to
   allowing any origin, which is fine for testing but shouldn't be left
   that way for a real event.

### Running an event on free-tier hosting

Free Render web services spin down after a period of inactivity and take
up to ~50 seconds to wake back up on the next request. The client now
shows a "waking up the server" message if the initial connection takes
more than a few seconds, so people won't think it's just broken — but you
should still visit your server's `/health` URL yourself a few minutes
before an event starts to warm it up in advance. If you're running this
for a real crowd, consider upgrading to a paid instance for the day.

### The Host can leave and come back

If the person running the booth screen refreshes the page, loses their
connection, or switches devices mid-game, they can reopen the site and
will be automatically reconnected to the same room (same reconnect flow
players get) as long as they're on the same browser that created it —
the room isn't lost.

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
2. **Manual "meeting" button.** Living players can call a meeting any time
   during `ROUND_START` or `DISCUSSION` (i.e. whenever they're free to walk
   around with the power on). Calling one during Discussion cuts the
   remaining time down to a 60-second countdown before voting opens, rather
   than waiting out the full 3 minutes.
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
7. **Movement / anti-cheat**: the client reports its own position; the
   server independently re-validates every reported position against the
   same room/corridor collision map (see below) and rejects anything that
   falls outside it, in addition to the existing zone/steal-range checks.
   A client could still misreport coordinates within a legal area faster
   than physically possible — a production build would add server-side
   speed-limiting to close that last gap.
8. **Visual style / map collision**: the map is a 2D top-down canvas
   (`client/src/scenes/GameScene2D.js`) — flat colored rooms connected by
   narrow corridors, camera-follows-player, name tags over each character.
   Movement is **wall-constrained on both sides**: `client/src/rooms.js`
   and `server/src/constants.js` each define the exact same set of room +
   corridor rectangles (the *only* walkable area on the whole map), and a
   move is only accepted if the destination falls inside one of them —
   walking "through" a wall into the gap between two unconnected rooms is
   rejected client-side (so it feels instant) *and* server-side (so it
   can't be faked). If you reshape the map, update both files identically
   — a mismatch causes visible rubber-banding.
9. **Host-only role monitor.** The Host never appears to players and
   never affects gameplay, so giving the person running the booth a
   private live view of everyone's true role/cards (`host:roles` event,
   shown in `HostLobbyView`) doesn't leak anything between players — their
   secrecy from *each other* is untouched. Toggle this off by simply not
   rendering that panel if you'd rather the Host stay fully blind too.
10. **Netlify's free-tier badge.** It renders bottom-right with a very
    high z-index that would otherwise sit on top of (and hide) any UI you
    put in that corner. The contextual action buttons (Restore Power /
    Steal / Meeting / Map) are deliberately positioned higher up the
    right edge (`bottom: 150px` in `styles.css`) to stay clear of it.

## What's intentionally not built

Per the spec's "strictly do not add" list: no vents, tasks, sabotage,
weapons, combat, shops, XP, extra roles, or extra rounds. Also not built,
because they're beyond a first playable prototype: sound design, a full
tutorial animation sequence (the tutorial is a static checklist on the
player's waiting screen), and production-grade anti-cheat.
