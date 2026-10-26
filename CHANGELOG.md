# Changelog

## v0.4 — Frontier

- Increased the playable world from a small arena to a 2,000 × 2,000 terrain.
- Batched rocks, pylons, vegetation and ruin pieces into instanced meshes to reduce draw calls.
- Added nearby-only 3D models for resources, enemies, players and structures.
- Added adaptive render scale, lower mobile pixel ratio, disabled real-time shadows on touch devices, and a lower render cap for mobile.
- Added responsive touch joystick, independent right-side look zone, hold-to-fire, aim toggle, jump, sprint, gathering, reload, healing, repair and building buttons.
- Added Telegram Mini App initialization, viewport updates, expand/fullscreen requests and orientation hinting/locking fallback.
- Added PWA manifest requesting fullscreen display and landscape orientation for installed launches.
- Added PvP damage, kill/death counters, delayed PvP respawn, plus buildable walls and automated turrets.
- Expanded server world limits and seeded resources/enemies across the larger terrain.
- Added automated coverage for PvP and construction.
- Added a walk-in shelter buildable with a doorway, pitched roof, windows, interior light, high durability and collision that preserves the entrance.
- Added server-side overlap checks for construction and movement collision for house walls.
