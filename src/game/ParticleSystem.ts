/**
 * Lightweight Particle System
 * Object-pooled to ensure zero GC pressure during 60 FPS gameplay
 */

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  alpha: number;
  active: boolean;
}

export class ParticleSystem {
  private pool: Particle[] = [];
  private activeCount = 0;

  constructor(maxParticles: number = 250) {
    for (let i = 0; i < maxParticles; i++) {
      this.pool.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        color: '#ffffff',
        size: 2,
        life: 0,
        maxLife: 30,
        alpha: 1,
        active: false,
      });
    }
  }

  public spawnSparks(x: number, y: number, color: string = '#00d9ff', count: number = 6): void {
    for (let i = 0; i < count; i++) {
      const p = this.getFreeParticle();
      if (!p) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3.5;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.color = color;
      p.size = 2 + Math.random() * 2;
      p.life = 0;
      p.maxLife = 15 + Math.random() * 10;
      p.alpha = 1;
      p.active = true;
      this.activeCount++;
    }
  }

  public spawnElimination(x: number, y: number, color: string = '#ff3366', count: number = 18): void {
    for (let i = 0; i < count; i++) {
      const p = this.getFreeParticle();
      if (!p) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = 2.0 + Math.random() * 5.0;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.color = Math.random() > 0.4 ? color : '#ffffff';
      p.size = 3 + Math.random() * 3;
      p.life = 0;
      p.maxLife = 25 + Math.random() * 20;
      p.alpha = 1;
      p.active = true;
      this.activeCount++;
    }
  }

  public spawnConfetti(x: number, y: number, count: number = 10): void {
    const colors = ['#00d9ff', '#37e89a', '#ffd700', '#ff3366', '#a855f7'];
    for (let i = 0; i < count; i++) {
      const p = this.getFreeParticle();
      if (!p) break;

      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
      const speed = 2.0 + Math.random() * 6.0;
      p.x = x + (Math.random() - 0.5) * 40;
      p.y = y + (Math.random() - 0.5) * 40;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.color = colors[Math.floor(Math.random() * colors.length)];
      p.size = 3 + Math.random() * 3;
      p.life = 0;
      p.maxLife = 40 + Math.random() * 30;
      p.alpha = 1;
      p.active = true;
      this.activeCount++;
    }
  }

  private getFreeParticle(): Particle | null {
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) {
        return this.pool[i];
      }
    }
    return null;
  }

  public update(): void {
    if (this.activeCount === 0) return;

    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life++;

      const progress = p.life / p.maxLife;
      p.alpha = Math.max(0, 1 - progress);

      if (p.life >= p.maxLife) {
        p.active = false;
        this.activeCount = Math.max(0, this.activeCount - 1);
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.activeCount === 0) return;

    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  public reset(): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].active = false;
    }
    this.activeCount = 0;
  }
}
