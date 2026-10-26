# AFTERZERO v0.4 — Frontier

A large-world multiplayer sandbox prototype built with Three.js + Socket.IO. It runs as a normal HTTPS web link, can be opened in a Telegram Mini App, and includes desktop keyboard/mouse controls plus mobile touch controls.

## Run locally

Requires Node.js 18+ and internet access for the Three.js module, Telegram WebApp SDK, and fonts loaded from their CDNs.

```bash
npm install
npm start
```

Open `http://localhost:3000`. For multiplayer, open the same address in another browser tab on the same machine. Telegram itself requires a publicly reachable HTTPS address; localhost is not a usable Mini App URL for other devices.

## Mobile controls

The page occupies the full available viewport. In Telegram, the app calls `ready()` and `expand()` on launch, then requests Telegram's fullscreen mode. In a normal mobile browser, it requests browser fullscreen after the player taps **Enter** (browsers require a user gesture). If fullscreen or landscape locking is unavailable, the game remains responsive in the available viewport.

- Left virtual joystick: movement.
- Drag on the right half of the screen: camera look.
- **ОГОНЬ**: hold to fire; **ПРИЦЕЛ** toggles zoom.
- **ПРЫЖОК**, **СПРИНТ**, **СБОР**, **ЗАРЯД**, **ЛЕЧИТЬ**, **РЕМОНТ**: movement and survival actions.
- **СТЕНА**, **ТУРЕЛЬ**, **ДОМ**, **МАЯК**: build options.

## Desktop controls

- `WASD`: move relative to the camera; mouse: look; right mouse button: aim.
- `Shift`: sprint; `Space`: jump; left mouse button: fire; `R`: reload.
- `E`: collect; `H`: heal; `F`: repair a relay; `T`: build a wall; `G`: build an auto-turret; `V`: build a shelter; `B`: deploy a relay.
- `Esc`: release mouse pointer lock.

## World and gameplay

- The playable terrain is 2,000 × 2,000 world units, with procedural hills, rock fields, dry brush, ruins and distant navigation landmarks.
- The scenery uses `InstancedMesh` batches for rocks, vegetation, columns and ruins. Nearby resources, enemies, players and structures are loaded into detailed scene models while distant entity data stays lightweight.
- Rendering has separate mobile/desktop quality defaults, lower pixel density on mobile, no real-time shadows on touch devices, a capped mobile render rate and automatic render-scale reduction when frame rate dips.
- Resource gathering, enemy damage, health, ammo, relays, building, PvP damage, kills and respawn are processed by the server.
- Other players can be defeated in PvP. A lethal PvP hit pauses the player briefly before respawn; PvE knockouts return the player to the drop zone.
- Walls cost 2 Alloy + 1 Biomass. Automated turrets cost 5 Alloy + 2 Crystals. A walk-in shelter costs 6 Alloy + 3 Biomass; its doorway remains open and the walls block movement. A relay costs 3 Crystals + 2 Alloy and starts the repeatable 5-wave defense contract. Server-side checks reject overlapping construction and block players from walking through built walls.
- The world save has a version tag so saves from the earlier small-map version do not overwrite the expanded map seed.

## Telegram Mini App setup

1. Deploy this project to a public host that serves HTTPS and supports persistent WebSocket connections for Socket.IO.
2. In Telegram, create/configure a bot with `@BotFather`, set its Main Mini App URL to the deployed HTTPS URL, and use that app URL for launch links.
3. Test the Mini App inside Telegram on both iOS and Android. The app calls Telegram `expand()` and requests `requestFullscreen()`; on supported clients it also requests a landscape orientation lock. These controls depend on the Telegram client and may be unsupported. A normal browser page opened from a link cannot force fullscreen before a user gesture; the game requests browser fullscreen after the player taps Enter. Installed PWA launches can use the manifest's `display: fullscreen` mode where supported.

Telegram documentation: https://core.telegram.org/bots/webapps

## Checks

```bash
npm test
```

The automated tests cover JavaScript syntax, DOM hook existence, mobile/Telegram controls, movement/camera coordinate conventions, multiplayer joins and movement validation, PvE/PvP attacks, respawn state, ammo/reload, gathering, walls/turrets/shelter construction and collision, defense waves, repairs and contract completion. Server tests use a mocked Socket.IO transport: they are not a substitute for a real browser test over WebSockets.

## Known limits

This is still a prototype, not a production MMO. Accounts, anti-cheat, persistence of player inventory/levels, authoritative movement physics and broad load tests are not implemented. Built structures have client-predicted movement collision and server validation; natural terrain obstacle collision is currently client-side. Three.js is currently loaded from a CDN, so the page needs internet access. Browser rendering and phone hardware vary; benchmark the deployed HTTPS build on actual target devices before sharing widely.
