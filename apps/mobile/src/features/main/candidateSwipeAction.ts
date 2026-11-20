type SwipeMotion = { dx: number; dy: number; vx: number };

// A gesture never sends a like. Only the explicit heart button does that.
export function candidateSwipeAction({ dx, dy, vx }: SwipeMotion, canGoBack: boolean): 'back' | 'pass' | null {
  if (Math.abs(dx) <= Math.abs(dy)) return null;
  if (dx > 60 || (dx > 35 && vx > 0.7)) return canGoBack ? 'back' : null;
  if (dx < -100 || (dx < -35 && vx < -0.7)) return 'pass';
  return null;
}
