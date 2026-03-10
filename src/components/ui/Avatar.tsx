'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

const SIZES = { sm: 24, md: 48, lg: 80 } as const;
type SizeKey = keyof typeof SIZES;

interface AvatarProps {
    src: string | null | undefined;
    alt: string;
    size?: SizeKey;
    className?: string;
}

/**
 * Avatar circular, tamaño fijo. La imagen se muestra entera recortada por el círculo (object-cover).
 * Placeholder usa el mismo tamaño de contenedor para que todos los avatares se vean iguales.
 */
export function Avatar({ src, alt, size = 'md', className }: AvatarProps) {
    const px = SIZES[size];
    const sizeClasses =
        size === 'sm' ? 'w-6 h-6' : size === 'md' ? 'w-12 h-12' : 'w-20 h-20';

    return (
        <div
            className={cn(
                'rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-zinc-100',
                sizeClasses,
                className
            )}
        >
            {src ? (
                <Image
                    src={src}
                    alt={alt}
                    width={px}
                    height={px}
                    className="w-full h-full object-cover"
                />
            ) : (
                <img
                    src="/icons/profile.png"
                    alt=""
                    className="w-full h-full object-contain opacity-70"
                />
            )}
        </div>
    );
}
