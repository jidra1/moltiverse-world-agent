// Activity log and leaderboard overlay

export class UI {
  constructor() {
    this.tickEl = document.getElementById('tick-count');
    this.leaderboardEl = document.getElementById('leaderboard-entries');
    this.logEl = document.getElementById('log-entries');
    this.statusEl = document.getElementById('connection-status');
    this.tooltipEl = document.getElementById('tooltip');
    this.statEls = {
      agents: document.getElementById('stat-agents'),
      gathered: document.getElementById('stat-gathered'),
      trades: document.getElementById('stat-trades'),
      kills: document.getElementById('stat-kills'),
    };
    this.stats = { gathered: 0, trades: 0, kills: 0 };
    this.maxLogEntries = 100;
  }

  setConnectionStatus(connected) {
    this.statusEl.textContent = connected ? 'Connected' : 'Disconnected';
    this.statusEl.className = connected ? 'connected' : 'disconnected';
  }

  updateTick(tick) {
    this.tickEl.textContent = tick;
  }

  updateStats(agents) {
    this.statEls.agents.textContent = Object.keys(agents).length;
    this.statEls.gathered.textContent = this.stats.gathered;
    this.statEls.trades.textContent = this.stats.trades;
    this.statEls.kills.textContent = this.stats.kills;
  }

  trackEvent(event) {
    if (event.type === 'gather') this.stats.gathered++;
    else if (event.type === 'trade') this.stats.trades++;
    else if (event.type === 'kill') this.stats.kills++;
  }

  updateLeaderboard(agents) {
    this.updateStats(agents);
    const sorted = Object.values(agents)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    this.leaderboardEl.innerHTML = sorted.map(a => {
      const total = Object.values(a.inventory || {}).reduce((s, v) => s + v, 0);
      return `<div class="lb-entry" data-agent-id="${escapeHtml(a.id)}" style="cursor:pointer">
        <span class="name">${escapeHtml(a.id)}</span>
        <span class="score">${a.score}pts</span>
        <span class="stats">HP:${a.hp} K:${a.kills} R:${total}</span>
      </div>`;
    }).join('');
  }

  // Camera follow indicator
  setFollowTarget(agentId) {
    const el = document.getElementById('follow-indicator');
    const nameEl = document.getElementById('follow-name');
    if (agentId) {
      nameEl.textContent = agentId;
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  }

  addLogEntry(event) {
    const entry = document.createElement('div');
    entry.className = `log-entry log-${event.type}`;
    entry.innerHTML = `<span class="time">[${event.tick || '?'}]</span> ${formatEvent(event)}`;
    this.logEl.prepend(entry);

    // Limit entries
    while (this.logEl.children.length > this.maxLogEntries) {
      this.logEl.removeChild(this.logEl.lastChild);
    }
  }

  addLogEntries(events) {
    for (const event of events) {
      this.addLogEntry(event);
    }
  }

  showTooltip(x, y, text) {
    this.tooltipEl.style.display = 'block';
    this.tooltipEl.style.left = x + 12 + 'px';
    this.tooltipEl.style.top = y + 12 + 'px';
    this.tooltipEl.innerHTML = text;
  }

  hideTooltip() {
    this.tooltipEl.style.display = 'none';
  }

  updatePlayerHUD(agent, worldState) {
    const pct = Math.max(0, Math.min(100, (agent.hp / (agent.maxHp || 100)) * 100));
    const hpFill = document.getElementById('hud-hp-fill');
    hpFill.style.width = pct + '%';
    // Green → yellow → red
    if (pct > 50) hpFill.style.background = '#5f5';
    else if (pct > 25) hpFill.style.background = '#fd7';
    else hpFill.style.background = '#f55';

    document.getElementById('hud-hp-text').textContent = `${agent.hp} / ${agent.maxHp || 100}`;
    document.getElementById('hud-score').textContent = agent.score + ' pts';

    const inv = agent.inventory || {};
    document.getElementById('hud-inv').textContent =
      `W:${inv.wood || 0}  S:${inv.stone || 0}  G:${inv.gold || 0}`;

    document.getElementById('hud-tile').textContent =
      `(${agent.x}, ${agent.y})  ${agent.zone || ''}`;
  }
}

function formatEvent(event) {
  switch (event.type) {
    case 'enter':
      return `<b>${esc(event.agent)}</b> entered the world`;
    case 'move':
      return `<b>${esc(event.agent)}</b> moved to (${event.x},${event.y}) [${event.zone}]`;
    case 'gather':
      return `<b>${esc(event.agent)}</b> gathered <b>${event.resource}</b>`;
    case 'trade':
      return `<b>${esc(event.agent)}</b> traded with <b>${esc(event.target)}</b>`;
    case 'combat':
      return `<b>${esc(event.attacker)}</b> hit <b>${esc(event.defender)}</b> for ${event.damage}dmg (HP:${event.defenderHp})`;
    case 'kill':
      return `<b>${esc(event.killer)}</b> killed <b>${esc(event.victim)}</b>!`;
    case 'speak':
      return `<b>${esc(event.agent)}</b>: "${esc(event.message)}"`;
    case 'pruned':
      return `<b>${esc(event.agent)}</b> was pruned (inactive)`;
    default:
      return JSON.stringify(event);
  }
}

function esc(str) {
  return escapeHtml(String(str || ''));
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
