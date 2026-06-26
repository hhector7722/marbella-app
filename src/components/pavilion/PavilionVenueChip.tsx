interface Props {
  code: string;
}

export function PavilionVenueChip({ code }: Props) {
  return (
    <span className="inline-block rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-zinc-600">
      {code}
    </span>
  );
}
