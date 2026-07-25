'use client';

import { Suspense, useEffect, useState } from 'react';
import { UsagePageTracker } from '@/components/usage/UsagePageTracker';
import { createClient } from '@/utils/supabase/client';

function UsageAuthGate() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setEnabled(!!data.session?.user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEnabled(!!session?.user);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (!enabled) return null;
  return <UsagePageTracker />;
}

/** Tracking de uso solo con sesión; auth en cliente para no bloquear el layout. */
export function UsageAuthenticatedTracker() {
  return (
    <Suspense fallback={null}>
      <UsageAuthGate />
    </Suspense>
  );
}
