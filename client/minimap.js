// Minimap - Shows the full world grid with agents and mobs

const GRID_SIZE = 64;
const MINIMAP_SIZE = 200; // px
const ZONE_COLORS = {
  spawn:  '#5a5075',
  forest: '#3a8a40', 
  market: '#8a7a38',
  arena:  '#8a3838',
  shrine: '#8a7840'
};

class Minimap {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.container = null;
    this.agents = {};
    this.mobs = {};
    this.playerAgent = null;
    this.init();
  }

  init() {
    // Create minimap container
    this.container = document.createElement('div');
    this.container.id = 'minimap';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: ${MINIMAP_SIZE}px;
      height: ${MINIMAP_SIZE}px;
      background: rgba(0, 0, 0, 0.8);
      border: 2px solid #444;
      border-radius: 8px;
      z-index: 1000;
      overflow: hidden;
    `;

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = MINIMAP_SIZE;
    this.canvas.height = MINIMAP_SIZE;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.ctx = this.canvas.getContext('2d');

    this.container.appendChild(this.canvas);
    document.body.appendChild(this.container);

    // Draw the zone grid (static background)
    this.drawZoneBackground();
  }

  drawZoneBackground() {
    const cellSize = MINIMAP_SIZE / GRID_SIZE;
    
    // Define zones manually (from world.js ZONES array)
    const zones = [
      // Row 0
      { type: 'forest', x1: 0,  y1: 0,  x2: 12, y2: 12 },
      { type: 'forest', x1: 13, y1: 0,  x2: 25, y2: 12 },
      { type: 'shrine', x1: 26, y1: 0,  x2: 37, y2: 12 },
      { type: 'forest', x1: 38, y1: 0,  x2: 50, y2: 12 },
      { type: 'forest', x1: 51, y1: 0,  x2: 63, y2: 12 },
      // Row 1
      { type: 'forest', x1: 0,  y1: 13, x2: 12, y2: 25 },
      { type: 'arena',  x1: 13, y1: 13, x2: 25, y2: 25 },
      { type: 'market', x1: 26, y1: 13, x2: 37, y2: 25 },
      { type: 'arena',  x1: 38, y1: 13, x2: 50, y2: 25 },
      { type: 'forest', x1: 51, y1: 13, x2: 63, y2: 25 },
      // Row 2  
      { type: 'shrine', x1: 0,  y1: 26, x2: 12, y2: 37 },
      { type: 'market', x1: 13, y1: 26, x2: 25, y2: 37 },
      { type: 'spawn',  x1: 26, y1: 26, x2: 37, y2: 37 },
      { type: 'market', x1: 38, y1: 26, x2: 50, y2: 37 },
      { type: 'shrine', x1: 51, y1: 26, x2: 63, y2: 37 },
      // Row 3
      { type: 'forest', x1: 0,  y1: 38, x2: 12, y2: 50 },
      { type: 'arena',  x1: 13, y1: 38, x2: 25, y2: 50 },
      { type: 'market', x1: 26, y1: 38, x2: 37, y2: 50 },
      { type: 'arena',  x1: 38, y1: 38, x2: 50, y2: 50 },
      { type: 'forest', x1: 51, y1: 38, x2: 63, y2: 50 },
      // Row 4
      { type: 'forest', x1: 0,  y1: 51, x2: 12, y2: 63 },
      { type: 'forest', x1: 13, y1: 51, x2: 25, y2: 63 },
      { type: 'shrine', x1: 26, y1: 51, x2: 37, y2: 63 },
      { type: 'forest', x1: 38, y1: 51, x2: 50, y2: 63 },
      { type: 'forest', x1: 51, y1: 51, x2: 63, y2: 63 }
    ];

    // Draw zones
    for (const zone of zones) {
      this.ctx.fillStyle = ZONE_COLORS[zone.type] || '#333';
      const x = (zone.x1 / GRID_SIZE) * MINIMAP_SIZE;
      const y = (zone.y1 / GRID_SIZE) * MINIMAP_SIZE;
      const w = ((zone.x2 - zone.x1 + 1) / GRID_SIZE) * MINIMAP_SIZE;
      const h = ((zone.y2 - zone.y1 + 1) / GRID_SIZE) * MINIMAP_SIZE;
      this.ctx.fillRect(x, y, w, h);
    }

    // Draw grid lines
    this.ctx.strokeStyle = '#222';
    this.ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_SIZE; i++) {
      const pos = (i / GRID_SIZE) * MINIMAP_SIZE;
      // Vertical lines
      this.ctx.beginPath();
      this.ctx.moveTo(pos, 0);
      this.ctx.lineTo(pos, MINIMAP_SIZE);
      this.ctx.stroke();
      // Horizontal lines
      this.ctx.beginPath();
      this.ctx.moveTo(0, pos);
      this.ctx.lineTo(MINIMAP_SIZE, pos);
      this.ctx.stroke();
    }
  }

  update(agents, mobs, playerAgentId) {
    // Clear previous agents/mobs (redraw background)
    this.drawZoneBackground();
    
    const cellSize = MINIMAP_SIZE / GRID_SIZE;
    
    // Draw mobs first (so agents appear on top)
    for (const [mobId, mob] of Object.entries(mobs || {})) {
      if (!mob.alive) continue;
      
      const x = (mob.x / GRID_SIZE) * MINIMAP_SIZE;
      const y = (mob.y / GRID_SIZE) * MINIMAP_SIZE;
      
      // Different colors/shapes for different mob types
      const mobColors = {
        wolf: '#8B4513',
        golem: '#696969', 
        bandit: '#4B0082',
        wraith: '#9370DB'
      };
      
      this.ctx.fillStyle = mobColors[mob.type] || '#ff0000';
      this.ctx.fillRect(x - 1, y - 1, 3, 3); // Small squares for mobs
    }
    
    // Draw agents
    for (const [agentId, agent] of Object.entries(agents || {})) {
      if (!agent.alive) continue;
      
      const x = (agent.x / GRID_SIZE) * MINIMAP_SIZE;
      const y = (agent.y / GRID_SIZE) * MINIMAP_SIZE;
      
      // Highlight player agent
      if (agentId === playerAgentId) {
        this.ctx.fillStyle = '#ffff00'; // Bright yellow for player
        this.ctx.fillRect(x - 2, y - 2, 5, 5);
      } else {
        this.ctx.fillStyle = '#00ff00'; // Green for other agents
        this.ctx.fillRect(x - 1, y - 1, 3, 3);
      }
    }

    // Draw legend in corner
    this.drawLegend();
  }

  drawLegend() {
    const legendX = 5;
    const legendY = MINIMAP_SIZE - 60;
    
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(legendX - 2, legendY - 2, 60, 55);
    
    this.ctx.font = '10px monospace';
    this.ctx.fillStyle = '#fff';
    this.ctx.fillText('Legend:', legendX, legendY + 8);
    
    // Player
    this.ctx.fillStyle = '#ffff00';
    this.ctx.fillRect(legendX, legendY + 12, 3, 3);
    this.ctx.fillStyle = '#fff';
    this.ctx.fillText('You', legendX + 6, legendY + 16);
    
    // Agents
    this.ctx.fillStyle = '#00ff00';
    this.ctx.fillRect(legendX, legendY + 22, 3, 3);
    this.ctx.fillStyle = '#fff';
    this.ctx.fillText('Agent', legendX + 6, legendY + 26);
    
    // Mobs
    this.ctx.fillStyle = '#ff4444';
    this.ctx.fillRect(legendX, legendY + 32, 3, 3);
    this.ctx.fillStyle = '#fff';
    this.ctx.fillText('Mob', legendX + 6, legendY + 36);
  }

  setPlayerAgent(agentId) {
    this.playerAgent = agentId;
  }

  hide() {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  show() {
    if (this.container) {
      this.container.style.display = 'block';
    }
  }

  dispose() {
    if (this.container) {
      document.body.removeChild(this.container);
    }
  }
}

export { Minimap };