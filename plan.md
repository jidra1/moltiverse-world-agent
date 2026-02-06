# Moltiverse — Feature Plan

## Current State

### Chat (Feature 1) — ALREADY EXISTS
- `speak` action: server (`actions.js:130-171`) — 200-char limit, 5-tile hearing radius
- Client renders chat bubbles floating above agents (`effects.js:27-67`)
- Activity log shows messages in sidebar (`ui.js:114-115`)
- All 3 demo bots already use `speak` (warrior taunts, gatherer reports, builder advertises)
- **No work needed** — chat is fully functional for agents

### Human Play (Feature 2) — NOT YET
The client is spectator-only. No way to join the world, move, or interact from the browser. All input comes through REST API calls from bot scripts.

---

## Feature 2: Human Player Mode

### What it adds
A human opens the browser and can:
1. **Join** the world (pick a name + class, enter)
2. **Move** with WASD/arrow keys
3. **Gather** resources on their tile (press G or click button)
4. **Attack** nearby agents (click agent + press F, or click button)
5. **Chat** (type message in input, press Enter)
6. **Trade** (propose/accept via UI panel)
7. **Build** walls (press B if builder class)
8. **Pick up** dropped loot (press E)

### Implementation Plan

#### Step 1 — Join Screen (client)
- Add a modal/overlay over the 3D scene: name input, class picker (warrior/gatherer/builder), "Enter World" button
- On submit: `POST /api/enter { agentId, class }`
- On success: hide modal, store `myAgentId` in client state, switch from spectator to player mode
- On failure: show error message

#### Step 2 — Player Controls (client)
- When `myAgentId` is set, rebind WASD from camera-pan to move actions:
  - W/Up → `POST /api/action { agentId, type: "move", direction: "up" }`
  - S/Down → `POST /api/action { agentId, type: "move", direction: "down" }`
  - A/Left → `POST /api/action { agentId, type: "move", direction: "left" }`
  - D/Right → `POST /api/action { agentId, type: "move", direction: "right" }`
- Camera auto-follows the player's agent (reuse existing follow logic)
- Hold Shift + WASD for camera pan (so player can still look around)
- Rate limit on client side to match server's 1 action/sec

#### Step 3 — Action Hotkeys (client)
- **G** — Gather resource on current tile
- **F** — Attack (requires target selection — click an agent first, then F)
- **E** — Pick up dropped loot on current tile
- **B** — Build wall (builder class only)
- **Enter** — Focus chat input

#### Step 4 — Chat Input (client)
- Add a chat input bar at the bottom of the sidebar (or below the 3D canvas)
- On Enter: `POST /api/action { agentId, type: "speak", message }`
- Show own messages in the activity log like other agents

#### Step 5 — HUD for Player (client)
- Show player's own stats persistently: HP bar, inventory counts, score, class
- Highlight player's agent with a different color/glow
- Show current tile info (zone, resource available, nearby agents)
- Show action feedback: "Gathered wood!", "Too far to attack", etc.

#### Step 6 — Trade UI (client)
- When near another agent in a Market zone, show "Trade" button
- Opens a trade panel: select what to offer, what to request
- Accept/reject incoming trade proposals via popup

### Server Changes Needed
**Minimal.** The server already handles everything via the REST API. Human players use the exact same endpoints as bot agents. The only consideration:
- The current inactivity pruning (120 ticks = ~10 min) should probably exempt agents that have an active WebSocket connection (human players may idle while watching)
- OR: send a periodic heartbeat from the client to reset `lastActionTick`

### File Changes Summary
| File | Change |
|---|---|
| `client/index.html` | Add join modal, chat input, HUD elements, action buttons |
| `client/main.js` | Add player state, rebind WASD, action hotkeys, camera follow, API calls |
| `client/ui.js` | Add HUD update methods, trade panel, join modal logic |
| `client/player.js` | **NEW** — Player controller class (input → API calls, state management) |
| `server/index.js` | Optional: heartbeat for human players to prevent pruning |

### Priority Order
1. Join screen + enter API call (gets humans into the world)
2. WASD movement + camera follow (core gameplay loop)
3. Gather + attack hotkeys (interaction)
4. Chat input (social)
5. HUD stats display (polish)
6. Trade UI (nice-to-have, complex)
