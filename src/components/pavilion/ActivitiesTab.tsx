import type { TimelineCardData } from './ActivityTimelineCard';
import { ActivityTimelineCard } from './ActivityTimelineCard';

interface Props {
  activities: TimelineCardData[];
}

export function ActivitiesTab({ activities }: Props) {
  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="text-2xl mb-2">{'\uD83C\uDF1E'}</span>
        <p className="text-sm font-black text-zinc-500">
          No hi ha activitats que afectin el bar avui
        </p>
        <p className="mt-1 text-xs font-bold text-zinc-400">
          Totes les activitats són en espais sense impacte al bar
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 px-4 py-4">
      {activities.map((act, i) => (
        <ActivityTimelineCard key={`${act.startTime}-${act.activityName}-${i}`} activity={act} />
      ))}
    </div>
  );
}
