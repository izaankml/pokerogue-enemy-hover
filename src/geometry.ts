/** An axis-aligned area in game coordinates, either on the canvas or local to a game object. */
export interface GameRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isInside(area: GameRectangle, x: number, y: number): boolean {
  return x >= area.x && y >= area.y && x < area.x + area.width && y < area.y + area.height;
}
