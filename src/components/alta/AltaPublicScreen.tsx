import type { ReactNode } from 'react';
import Image from 'next/image';
import { PageScreen } from '@/components/dashboard/DashboardDetailLayout';

function AltaPublicLogo() {
  return (
    <Image
      src="/icons/logo-white.png"
      alt="Bar La Marbella"
      width={80}
      height={80}
      className="h-12 w-auto object-contain object-right"
      priority
    />
  );
}

export function AltaPublicScreen({
  children,
  footerSlot,
}: {
  children: ReactNode;
  footerSlot?: ReactNode;
}) {
  return (
    <PageScreen
      title="Alta laboral"
      titleFace="display"
      titleAlign="center"
      showBackButton={false}
      template="form"
      fillViewport
      className="alta-public-screen"
      maxWidthClass="w-full"
      cardClassName="mx-auto max-w-lg"
      rightSlot={<AltaPublicLogo />}
      footerSlot={footerSlot}
    >
      {children}
    </PageScreen>
  );
}
