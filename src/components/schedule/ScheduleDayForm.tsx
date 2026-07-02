'use client';

import { ScheduleDayEditor } from '@/components/schedule/ScheduleDayEditor';
import { type ReactNode } from 'react';

/**
 * A lightweight wrapper that presents the ScheduleDayEditor as a standalone form.
 * It is used by the new `/schedule` page. The editor is rendered in "embedded"
 * mode so that no modal dialog is shown – only the inner form UI.
 */
export default function ScheduleDayForm({ initialDate }: { initialDate: string }): ReactNode {
  return (
    <ScheduleDayEditor
      initialDate={initialDate}
      // The editor expects an onClose callback; in page context we simply
      // provide a no‑op. The onSuccess callback can also be a no‑op because the
      // page does not need special handling after save.
      onClose={() => {}}
      onSuccess={() => {}}
      embedded={true}
    />
  );
}
