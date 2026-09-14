import { Button } from '@/components/ui/button';

/** Mini «Ver» bajo Horas, Propina y ajuste: abre el desglose del valor. */
export function StaffTipDetailVerButton({
  instance,
  onClick,
}: {
  instance: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="tertiary"
      layout="hug"
      instance={instance}
      onClick={onClick}
    >
      Ver
    </Button>
  );
}
