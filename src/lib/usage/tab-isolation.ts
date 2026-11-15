export type UsageTabSignal =
  | { kind: 'claim'; sessionId: string; runtimeId: string }
  | { kind: 'occupied'; sessionId: string; targetId: string };

/** Contestamos solamente a otras pestañas que reclamen nuestra sesión. */
export function shouldAcknowledgeTabClaim(
  signal: UsageTabSignal,
  ownSessionId: string,
  ownRuntimeId: string,
): signal is Extract<UsageTabSignal, { kind: 'claim' }> {
  return signal.kind === 'claim'
    && signal.sessionId === ownSessionId
    && signal.runtimeId !== ownRuntimeId;
}

/** Sólo la pestaña nueva con el ID duplicado necesita rotar su sesión. */
export function isTabSessionOccupied(
  signal: UsageTabSignal,
  ownSessionId: string,
  ownRuntimeId: string,
): boolean {
  return signal.kind === 'occupied'
    && signal.sessionId === ownSessionId
    && signal.targetId === ownRuntimeId;
}
