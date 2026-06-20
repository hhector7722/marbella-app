import type { NavigationDirection } from '@/lib/motion/constants';
import { isStaffTabToTabNavigation } from '@/lib/navigation/main-tab-roots';

let pendingDirection: NavigationDirection = 'fade';
let skipNextPageMotion = false;

export function markNavigationBack(): void {
  pendingDirection = 'back';
}

export function markNavigationForward(): void {
  pendingDirection = 'forward';
}

/** Tab swipe horizontal: AppPageTransition no debe duplicar animación. */
export function markTabSwipeTransition(): void {
  skipNextPageMotion = true;
}

export function consumeSkipPageMotion(
  prevPath: string,
  nextPath: string
): boolean {
  if (skipNextPageMotion) {
    skipNextPageMotion = false;
    return true;
  }

  return isStaffTabToTabNavigation(prevPath, nextPath);
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
