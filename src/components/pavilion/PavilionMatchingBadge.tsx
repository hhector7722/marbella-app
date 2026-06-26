import type { MatchStatus } from '@/lib/pavilion/matching';

interface Props {
  status: MatchStatus;
  confidence?: number;
}

const config: Record<MatchStatus, { label: string; classes: string }> = {
  existing: {
    label: 'Existent',
    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  new: {
    label: 'Nova',
    classes: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  uncertain: {
    label: 'Dubosa',
    classes: 'bg-blue-50 text-blue-700 border-blue-200',
  },
};

const icons: Record<MatchStatus, string> = {
  existing: '\u2713',
  new: '\u002B',
  uncertain: '\u26A0\uFE0F',
};

export function PavilionMatchingBadge({ status, confidence }: Props) {
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${c.classes}`}
    >
      <span className="text-xs leading-none">{icons[status]}</span>
      <span>{c.label}</span>
      {confidence != null && confidence < 1 && (
        <span className="opacity-60">{Math.round(confidence * 100)}%</span>
      )}
    </span>
  );
}
