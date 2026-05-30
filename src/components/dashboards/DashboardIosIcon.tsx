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
    labelClassName?: string;
    contentClassName?: string;
    children?: React.ReactNode;
};

export default function DashboardIosIcon({
    label,
    onClick,
    img,
    icon: Icon,
    iconColor = 'bg-white',
    className,
    labelClassName,
    contentClassName,
    children,
}: DashboardIosIconProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'bg-white rounded-2xl p-2 shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all group',
                'w-full aspect-square min-w-0 min-h-[48px] touch-manipulation',
                'md:aspect-auto md:w-[4.75rem] md:max-w-full md:p-1.5 md:gap-0.5 md:rounded-xl',
                className
            )}
        >
            <div className={cn('flex-1 flex items-center justify-center w-full min-h-0 min-w-0 md:flex-none md:h-11 md:w-11', contentClassName)}>
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
                            <div className={cn('w-12 h-12 md:w-11 md:h-11 rounded-xl flex items-center justify-center text-white shadow-sm', iconColor)}>
                                <Icon size={28} strokeWidth={2.5} className="w-6 h-6 md:w-7 md:h-7" />
                            </div>
                        ) : null}
                    </div>
                )}
            </div>
            <span className={cn('text-[9px] md:text-[8px] font-black text-gray-800 uppercase tracking-wider text-center line-clamp-2 leading-tight px-0.5 shrink-0', labelClassName)}>
                {label}
            </span>
        </button>
    );
}
