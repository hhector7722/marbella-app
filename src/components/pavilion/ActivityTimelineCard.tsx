import { PavilionTimeSlot } from './PavilionTimeSlot';
import { PavilionVenueChip } from './PavilionVenueChip';

export interface TimelineCardData {
  activityName: string;
  activityIcon: string | null;
  startTime: string;
  endTime: string;
  venueCodes: string[];
  participants?: number;
}

interface Props {
  activity: TimelineCardData;
}

export function ActivityTimelineCard({ activity }: Props) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white px-4 py-3 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-lg leading-none">
          {activity.activityIcon || '\u26AA'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <h3 className="text-sm font-black text-zinc-900 leading-tight">
              {activity.activityName}
            </h3>
            <PavilionTimeSlot
              startTime={activity.startTime}
              endTime={activity.endTime}
            />
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {activity.venueCodes.map((v) => (
              <PavilionVenueChip key={v} code={v} />
            ))}
          </div>
          {activity.participants != null && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-zinc-500">
              <span>{'\uD83D\uDC65'}</span>
              <span className="font-black text-zinc-700">{activity.participants}</span>
              <span className="font-bold text-zinc-400">participants</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
