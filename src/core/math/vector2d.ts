export type Vector2D = {
  x: number;
  y: number;
};

export function dot2d(a: Vector2D, b: Vector2D): number {
  return a.x * b.x + a.y * b.y;
}

export function diff2d(a: Vector2D, b: Vector2D): Vector2D {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  };
}
