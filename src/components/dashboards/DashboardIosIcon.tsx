'use client';

import Image from 'next/image';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type DashboardIosIconProps = {
    label: string;
    onClick?: () => void;
    href?: string;
    img?: string;
    icon?: LucideIcon;
    iconColor?: string;
    iconClassName?: string;
    className?: string;
    labelClassName?: string;
    contentClassName?: string;
    badgeCount?: number;
    children?: React.ReactNode;
};

export default function DashboardIosIcon({
    label,
    onClick,
    img,
    icon: Icon,
    iconColor = 'bg-white',
    iconClassName,
    className,
    labelClassName,
    contentClassName,
    badgeCount,
    children,
}: DashboardIosIconProps) {
    const showBadge = typeof badgeCount === 'number' && badgeCount > 0;
    const badgeLabel = showBadge ? (badgeCount > 99 ? '99+' : String(badgeCount)) : null;

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'relative bg-white rounded-2xl p-2 shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all group',
                'w-full aspect-square min-w-0 min-h-[48px] touch-manipulation',
                'md:aspect-auto md:w-[4.75rem] md:max-w-full md:p-1.5 md:gap-0.5 md:rounded-xl',
                className
            )}
        >
            {showBadge ? (
                <span
                    className="absolute -top-1 -right-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black leading-none text-white shadow-sm ring-2 ring-white"
                    aria-label={`${badgeCount} pendientes`}
                >
                    {badgeLabel}
                </span>
            ) : null}
            <div data-studio-target="bg" className={cn('flex-1 flex items-center justify-center w-full min-h-0 min-w-0 md:flex-none md:h-11 md:w-11', contentClassName)}>
                <div data-studio-target="icon" className="w-full h-full flex items-center justify-center">
                    {children ?? (
                        <div className="w-12 h-12 md:w-11 md:h-11 flex items-center justify-center transition-transform group-hover:scale-110 overflow-hidden shrink-0">
                            {img ? (
                                <Image
                                    src={img}
                                    alt={label}
                                    width={48}
                                    height={48}
                                    className="w-full h-full object-contain"
                                />
                            ) : Icon ? (
                                <div className={cn('w-12 h-12 md:w-11 md:h-11 rounded-xl flex items-center justify-center shadow-sm', iconColor, !iconClassName && 'text-white')}>
                                    <Icon size={28} strokeWidth={2.5} className={cn('w-6 h-6 md:w-7 md:h-7', iconClassName)} />
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>
            <span data-studio-target="text" className={cn('text-[9px] md:text-[8px] font-black text-gray-800 uppercase tracking-wider text-center line-clamp-2 leading-tight px-0.5 shrink-0', labelClassName)}>
                {label}
            </span>
        </button>
    );
}
