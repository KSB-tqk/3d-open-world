# Anime Grassland — React Three Fiber

A first playable 1 km × 1 km anime-style browser terrain prototype.

The authored 1 km × 1 km reference map is **Sunmeadow Valley** (north is negative Z). The main playable route is compressed to roughly 500–650 m: spawn `(0, 260)`, bridge `(0, 140)`, village `(-20, -30)`, fort `(-220, -155)`, open field `(180, -25)`, forest `(175, 165)`, and lake `(260, -130)`. Landmark coordinates, road routes, river path, and named terrain zones are centralized in `src/world/worldConfig.js`. Decorative placements use fixed seeds inside authored zones, so all clients see the same layout after every load.

Approximate landmark travel distances at walk speed: spawn to bridge 120 m, bridge to village 171 m, village to fort 236 m, village to open field 200 m, and village to forest 276 m.

## Requirements
- Node.js 20.19+ or 22.12+
- VS Code

## Run in VS Code
1. Extract/open this folder in VS Code.
2. Open **Terminal → New Terminal**.
3. Run `npm install`.
4. Run `npm run dev` to start the Socket.IO server on port 3001 and Vite on port 3000.
5. Open `http://localhost:3000` in two browser tabs to try multiplayer.

Vite proxies `/socket.io` to the game server. To run only the server, use `npm run server`.

## Controls
- WASD / arrow keys: move
- Shift: sprint
- Right mouse drag: orbit camera
- Mouse wheel: zoom
- Development only: press `M` to toggle authored landmark labels

## Project structure
- `Terrain.jsx`: procedural 1 km terrain mesh
- `terrain.js`: deterministic terrain height, river channel, meadow, village, fort plateau, cliff shelf, and north ridge shaping
- `worldConfig.js`: fixed map coordinates, named zones, roads, river, lake, spawn, and landmarks
- `Player.jsx`: local player input, movement, terrain following
- `PlayerModel.jsx`: shared procedural player appearance, animation, and name label
- `RemotePlayer.jsx`: interpolated remote player rendering
- `Scenery.jsx`: authored roads and crossings, gabled village building variants, irregular mountain formations, cliffs, lake, forests, flowers, trees, and rocks
- `World.jsx`: scene composition and third-person orbit camera
- `src/multiplayer/socket.js`: Socket.IO client
- `src/ui/`: start screen and in-game chat
- `server/server.js`: development multiplayer server, player registry, movement relay, and validated chat

## Multiplayer prototype notes
The development server assigns Socket.IO IDs and registered display names, relays movement snapshots at roughly 13 updates per second, interpolates remote players, removes disconnected players, and validates/rate-limits plain-text chat. The client currently reports its own movement; this is a proof of concept and is not authoritative or suitable for public production deployment. A later milestone is server-side movement validation and room/interest management.
# 3d-open-world
