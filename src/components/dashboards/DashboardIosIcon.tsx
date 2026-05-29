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
    className?: string;
    children?: React.ReactNode;
};

export default function DashboardIosIcon({
    label,
    onClick,
    img,
    icon: Icon,
    iconColor = 'bg-white',
    className,
    children,
}: DashboardIosIconProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'bg-white rounded-2xl p-2 md:p-3 shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-1.5 md:gap-2 active:scale-95 transition-all group',
                'w-full aspect-square min-w-0 min-h-[48px] touch-manipulation',
                className
            )}
        >
            {children ?? (
                <div className="w-12 h-12 md:w-14 md:h-14 flex items-center justify-center transition-transform group-hover:scale-110 overflow-hidden shrink-0">
                    {img ? (
                        <Image
                            src={img}
                            alt={label}
                            width={48}
                            height={48}
                            className="w-full h-full object-contain"
                        />
                    ) : Icon ? (
                        <div className={cn('w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center text-white shadow-sm', iconColor)}>
                            <Icon size={28} strokeWidth={2.5} className="w-6 h-6 md:w-8 md:h-8" />
                        </div>
                    ) : null}
                </div>
            )}
            <span className="text-[9px] md:text-[11px] font-black text-gray-800 uppercase tracking-wider text-center line-clamp-2 leading-tight px-0.5 shrink-0">
                {label}
            </span>
        </button>
    );
}
