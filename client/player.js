// Player controller — human player state + API helpers

export class Player {
  constructor() {
    this.agentId = null;
    this.agentClass = null;
    this.lastActionTime = 0;
    this.actionCooldown = 1000; // ms — matches server's 1-action-per-second limit
  }

  canAct() {
    return Date.now() - this.lastActionTime >= this.actionCooldown;
  }

  async enter(agentId, agentClass) {
    try {
      const res = await fetch('/api/enter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, class: agentClass, proof: {} }),
      });
      const data = await res.json();
      if (data.success) {
        this.agentId = agentId;
        this.agentClass = agentClass;
      }
      return data;
    } catch (e) {
      return { success: false, reason: 'Network error' };
    }
  }

  async sendAction(type, params) {
    if (!this.agentId) return { success: false, reason: 'Not joined' };
    if (!this.canAct()) return { success: false, reason: 'Too fast — wait a moment' };

    this.lastActionTime = Date.now();
    try {
      const res = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: this.agentId, type, ...params }),
      });
      return await res.json();
    } catch (e) {
      return { success: false, reason: 'Network error' };
    }
  }

  async move(direction) {
    return this.sendAction('move', { direction });
  }

  async gather() {
    return this.sendAction('gather', {});
  }

  async attack(targetId) {
    return this.sendAction('attack', { targetId });
  }

  async speak(message) {
    return this.sendAction('speak', { message });
  }

  async build(direction) {
    return this.sendAction('build', { direction: direction || 'up' });
  }

  async pickup() {
    return this.sendAction('pickup', {});
  }

  getAgent(worldState) {
    return worldState.agents?.[this.agentId] || null;
  }
}
