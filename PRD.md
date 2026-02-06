# World Model Agent — PRD
## Moltiverse Hackathon | Agent + Token Track + World Model Bounty

**Last updated:** 2026-02-04
**Author:** Jidra
**Deadline:** Feb 15, 2026 23:59 ET (11 days)
**Target prizes:** $10K World Model Bounty + $10K Open Winner + $40K Liquidity Boost

**Links:**
- Hackathon: https://moltiverse.dev
- World Model Agent PRD (official): https://docs.google.com/document/d/1RSHc5bY0nXF9rtZKj60SsJB5fqxJgTPUkrGYmfkj_08/edit?usp=sharing
- Submission: https://forms.moltiverse.dev/submit
- Registration: https://forms.moltiverse.dev/register
- Discord: https://discord.gg/monaddev

### Official Bounty PRD (verbatim)

> **World Model Agent**
> **Bounty Amount: $10,000**
>
> **Objective:** Build an agent that simulates a persistent virtual world where other agents can enter, interact, and participate in activities by paying an entry fee in MON tokens.
>
> **Core Requirements:**
> - Create a stateful world environment with defined rules, locations, and mechanics (e.g., economy, resource systems, social dynamics)
> - Implement MON token-gated entry system where agents pay to access the world
> - Provide API/interface for external agents to query world state and submit actions
> - Maintain persistent world state that evolves based on agent interactions
> - Generate meaningful responses to agent actions that affect world state
>
> **Success Criteria:**
> - At least 3 external agents can successfully enter and interact with the world
> - World state persists and changes logically based on agent actions
> - Clear documentation of world rules, entry costs, and interaction protocols
> - Demonstrates emergent behavior or interesting dynamics from multi-agent interaction
>
> **Bonus Points:**
> - Economic systems where agents can earn back MON or other resources
> - Complex world mechanics (politics, trade, combat, exploration)
> - Visualization or logging dashboard showing world activity

---

## 1. Vision

A persistent 3D virtual world (Three.js) where AI agents pay MON to enter, explore, gather resources, trade, fight, and form alliances. The world runs 24/7, evolves based on agent actions, and has its own token economy on nad.fun.

**One-liner:** *A living 3D world where AI agents pay to enter, compete for resources, and shape the economy — all visible in real-time.*

---

## 2. Why This Wins

| Judge Criteria | How We Hit It |
|---|---|
| Weird & creative | 3D world you can watch agents live in |
| Actually works | Deterministic rules engine, not a simulation |
| Pushes boundaries | Agents with spatial awareness + economy |
| A2A coordination | Agents trade, ally, compete in shared space |
| Demo moment | Open browser → watch agents moving, trading, fighting in 3D |

**Key insight:** Most competitors will build text-only or API-only. A **visual 3D world** is an instant demo winner — judges can SEE it.

---

## 3. Architecture

```
┌─────────────────────────────────────┐
│         Three.js Frontend           │
│  (3D world visualization, live)     │
└──────────────┬──────────────────────┘
               │ WebSocket (real-time state)
┌──────────────▼──────────────────────┐
│          Backend Server             │
│  (Node.js / Express + WS)          │
│                                     │
│  ┌─────────────┐ ┌───────────────┐  │
│  │ World Engine │ │ Agent Gateway │  │
│  │ (rules,     │ │ (REST API for │  │
│  │  state,     │ │  external     │  │
│  │  tick loop) │ │  agents)      │  │
│  └─────────────┘ └───────────────┘  │
│                                     │
│  ┌─────────────┐ ┌───────────────┐  │
│  │ Persistence │ │ Token Gate    │  │
│  │ (SQLite/    │ │ (MON verify + │  │
│  │  JSON)      │ │  nad.fun)     │  │
│  └─────────────┘ └───────────────┘  │
└─────────────────────────────────────┘
               │
┌──────────────▼──────────────────────┐
│        Monad Blockchain             │
│  (MON entry fee, world token)       │
└─────────────────────────────────────┘
```

---

## 4. World Design

### 4.1 World Map
- **Grid-based** — e.g. 32x32 tiles
- **Zones:** Spawn, Forest (resources), Market (trading), Arena (combat), Shrine (quests)
- **Fog of war** optional — agents only see nearby tiles
- Each tile has: terrain type, resources, occupants

### 4.2 Agent Actions (keep it tight)
| Action | Description | Cost |
|---|---|---|
| `enter` | Pay MON, spawn into world | Entry fee |
| `move` | Move to adjacent tile | Free |
| `gather` | Collect resource from tile | 1 tick |
| `trade` | Exchange resources with another agent | Negotiated |
| `attack` | Combat another agent on same tile | Risk HP |
| `build` | Place structure on tile | Resources |
| `speak` | Broadcast message (visible to nearby) | Free |
| `ally` | Form alliance with another agent | Mutual |

### 4.3 Resources & Economy
- **3 resources:** Wood, Stone, Gold
- Resources spawn on tiles, deplete, regenerate slowly
- Agents carry inventory (limited capacity)
- **World Token (nad.fun):** Earned by completing quests, winning combat, trading. Spent on upgrades, land claims, influence.

### 4.4 World Tick
- World advances in **ticks** (e.g. every 5 seconds)
- Each tick: process queued actions → update state → broadcast
- Deterministic — same inputs = same outputs
- Resources regenerate, HP recovers slowly

### 4.5 Emergent Behavior (cheap but effective)
- **Scarcity:** Limited resources → competition → conflict
- **Alliances:** Agents can team up → collective advantage
- **Territory:** Building on tiles → control zones
- **Market dynamics:** Supply/demand from agent trading
- **Reputation:** Track agent history → trust signals

---

## 5. Token Design (nad.fun)

**Token name:** TBD (e.g. $WORLD, $REALM, $GRID)

| Mechanic | Detail |
|---|---|
| Earn | Complete quests, win combat, trade profits |
| Spend | Upgrades, land claims, special abilities |
| Burn | Entry to premium zones, respawn after death |
| Supply | Minted by world engine based on activity |

**Why judges care:** Token has real utility inside the world. More agents → more demand → price signal reflects world activity.

---

## 6. API Design (for external agents)

```
POST   /api/enter          — Pay MON, join world
GET    /api/state           — Get visible world state
GET    /api/agent/:id       — Get agent status
POST   /api/action          — Submit action (move, gather, trade, etc.)
GET    /api/leaderboard     — Rankings
WS     /ws/stream           — Real-time world updates
```

**Auth:** Agent registers with wallet address. Entry verified on-chain.

**Action payload:**
```json
{
  "agent_id": "0x...",
  "action": "move",
  "params": { "direction": "north" },
  "signature": "0x..."
}
```

---

## 7. Three.js Frontend

### What to show:
- Top-down or isometric 3D view of the grid
- Agents as colored cubes/spheres moving in real-time
- Resources as objects on tiles
- Buildings/structures placed by agents
- Activity log sidebar (who did what)
- Leaderboard overlay
- Token price / supply widget

### Keep it simple:
- Low-poly / voxel aesthetic (fast to build, looks intentional)
- No complex models — geometric shapes + colors
- Real-time via WebSocket updates
- Camera controls (pan, zoom)

---

## 8. Demo Agents (minimum 3)

| Agent | Strategy | Personality |
|---|---|---|
| **Gatherer** | Collects resources, avoids conflict, trades at market | Peaceful capitalist |
| **Warrior** | Hunts other agents, steals resources | Aggressive raider |
| **Builder** | Claims territory, builds structures, forms alliances | Strategic planner |

These run as separate processes, interact via the public API (same as any external agent would).

---

## 9. Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Three.js + Vite |
| Backend | Node.js + Express + ws |
| Persistence | SQLite (simple, file-based, persistent) |
| Blockchain | ethers.js → Monad RPC |
| Token | nad.fun API for token creation |
| Hosting | Single VPS or local for demo |

---

## 10. Build Plan (11 days)

| Day | Focus | Deliverable |
|---|---|---|
| **1** (Feb 4) | World design finalized, project scaffold | Repo, schema, rules doc |
| **2** (Feb 5) | World engine core — state, ticks, actions | Working state machine |
| **3** (Feb 6) | Persistence + action queue | State survives restarts |
| **4** (Feb 7) | REST API + WebSocket | Agents can connect & act |
| **5** (Feb 8) | Three.js frontend — grid, agents, resources | Visual world renders |
| **6** (Feb 9) | Token gate (MON entry) + nad.fun token | On-chain integration |
| **7** (Feb 10) | Demo agents (3 bots) | Agents running in world |
| **8** (Feb 11) | Economy tuning + emergent behavior | Interesting dynamics |
| **9** (Feb 12) | Dashboard, leaderboard, activity log | Polish the demo |
| **10** (Feb 13) | Documentation + submission prep | Clear docs |
| **11** (Feb 14) | Buffer, bug fixes, submit early | 🚀 SHIP |

---

## 11. Success Criteria (from PRD)

- [x] Stateful world with rules, locations, mechanics
- [ ] MON token-gated entry
- [ ] API for external agents to query + act
- [ ] Persistent state that evolves
- [ ] Meaningful responses to agent actions
- [ ] 3+ external agents interacting
- [ ] Clear documentation
- [ ] Emergent behavior demo
- [ ] **BONUS:** Earn-back economy
- [ ] **BONUS:** Complex mechanics
- [ ] **BONUS:** Visualization dashboard ← Three.js = automatic win here

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Scope creep | Strict 8-action limit, no new features after day 8 |
| Three.js time sink | Low-poly geometric style, no complex assets |
| Blockchain integration issues | Use testnet first, mainnet day 10 |
| Economy imbalance | Simple rules, tune on day 8 |
| Solo dev burnout | Buffer day built in, ship MVP early |

---

## 13. What Makes This Stand Out

1. **Visual** — Judges open a URL, see a living 3D world. Nobody else will have this.
2. **Dual prize eligibility** — Bounty ($10K) + Open Winner ($10K) + Liquidity Boost ($40K)
3. **Actually multi-agent** — Not fake A2A, real agents competing in shared space
4. **Token has real utility** — Earned and spent inside the world
5. **Demo in 5 seconds** — No explanation needed, you see agents moving and trading

---

*Build a judgeable system that looks like a world. Not a world that happens to be judgeable.*
