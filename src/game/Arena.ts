/**
 * Circular Arena Boundary
 * Manages segmented wall physics bodies in Matter.js
 */

import Matter from 'matter-js';
const { Bodies, Composite } = Matter;
import type { Body as MatterBody, Engine } from 'matter-js';

export class Arena {
  public readonly centerX: number;
  public readonly centerY: number;
  public readonly radius: number;
  public readonly segments: number;
  private wallBodies: MatterBody[] = [];

  constructor(
    centerX: number,
    centerY: number,
    radius: number,
    segments: number = 32
  ) {
    this.centerX = centerX;
    this.centerY = centerY;
    this.radius = radius;
    this.segments = segments;
  }

  public build(engine: Engine, wallRestitution: number = 1.0): void {
    this.destroy(engine);

    const segmentAngle = (Math.PI * 2) / this.segments;
    const tangentLength = 2 * this.radius * Math.tan(segmentAngle / 2) * 1.15;
    const thickness = 32;

    for (let i = 0; i < this.segments; i++) {
      const angle = i * segmentAngle;
      const x = this.centerX + Math.cos(angle) * (this.radius + thickness / 2);
      const y = this.centerY + Math.sin(angle) * (this.radius + thickness / 2);

      const wall = Bodies.rectangle(x, y, tangentLength, thickness, {
        isStatic: true,
        angle: angle + Math.PI / 2,
        restitution: wallRestitution,
        friction: 0,
        frictionStatic: 0,
        label: 'ArenaWall',
      });

      this.wallBodies.push(wall);
    }

    Composite.add(engine.world, this.wallBodies);
  }

  public destroy(engine: Engine): void {
    if (this.wallBodies.length > 0) {
      Composite.remove(engine.world, this.wallBodies);
      this.wallBodies = [];
    }
  }
}
