import type { NavigationDirection } from '@/lib/motion/constants';

let pendingDirection: NavigationDirection = 'fade';

export function markNavigationBack(): void {
  pendingDirection = 'back';
}

export function markNavigationForward(): void {
  pendingDirection = 'forward';
}

export function consumeNavigationDirection(
  prevPath: string,
  nextPath: string
): NavigationDirection {
  const direction = pendingDirection;
  pendingDirection = 'fade';

  if (direction === 'back' || direction === 'forward') {
    return direction;
  }

  const prevDepth = prevPath.split('/').filter(Boolean).length;
  const nextDepth = nextPath.split('/').filter(Boolean).length;

  if (nextDepth > prevDepth) return 'forward';
  if (nextDepth < prevDepth) return 'back';
  return 'fade';
}
