import type { Occupation } from '@/lib/pavilion/parser';
import type { MatchResult } from '@/lib/pavilion/matching';
import { PavilionMatchingBadge } from './PavilionMatchingBadge';
import { PavilionTimeSlot } from './PavilionTimeSlot';
import { PavilionVenueChip } from './PavilionVenueChip';

interface Props {
  occupation: Occupation;
  match: MatchResult;
}

export function ActivityReviewCard({ occupation, match }: Props) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white px-4 py-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="text-sm font-black text-zinc-900 uppercase tracking-tight leading-tight">
          {occupation.activity}
        </h3>
        <PavilionMatchingBadge
          status={match.status}
          confidence={match.confidence}
        />
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <PavilionTimeSlot
          startTime={occupation.start_time}
          endTime={occupation.end_time}
        />
        <div className="flex flex-wrap gap-1">
          {occupation.venues.map((v) => (
            <PavilionVenueChip key={v} code={v} />
          ))}
        </div>
      </div>

      <hr className="my-2 border-zinc-100" />

      <div className="text-[11px] leading-relaxed">
        <span className="font-bold text-zinc-400 uppercase tracking-wider">
          Text OCR
        </span>
        <span className="ml-2 font-bold text-zinc-500">
          {occupation.activity}
        </span>
      </div>

      {match.status === 'uncertain' && match.matchedName && (
        <div className="mt-1 text-[11px] leading-relaxed">
          <span className="font-bold text-zinc-400 uppercase tracking-wider">
            Millor coincidència
          </span>
          <span className="ml-2 font-bold text-blue-600">
            {match.matchedName}
          </span>
        </div>
      )}

      {match.status === 'existing' && match.matchedName && match.matchedName !== occupation.activity.trim() && (
        <div className="mt-1 text-[11px] leading-relaxed">
          <span className="font-bold text-zinc-400 uppercase tracking-wider">
            Existent com
          </span>
          <span className="ml-2 font-bold text-emerald-600">
            {match.matchedName}
          </span>
        </div>
      )}
    </div>
  );
}
