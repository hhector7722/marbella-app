interface Props {
  startTime: string;
  endTime: string;
}

export function PavilionTimeSlot({ startTime, endTime }: Props) {
  const fmt = (t: string) => {
    const [h, m] = t.split(':');
    return `${h}:${m}`;
  };
  return (
    <span className="font-black text-zinc-900 tracking-tight">
      {fmt(startTime)}
      <span className="text-zinc-300 mx-1">&ndash;</span>
      {fmt(endTime)}
    </span>
  );
}
