'use client';

import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
    className?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function LoadingSpinner({ className, size = 'md' }: LoadingSpinnerProps) {
    const sizeMap = {
        sm: 'w-4 h-4',
        md: 'w-6 h-6',
        lg: 'w-8 h-8',
        xl: 'w-12 h-12',
    };

    const spinnerSize = sizeMap[size];

    return (
        <div className={cn("relative flex items-center justify-center", spinnerSize, className)}>
            {[...Array(12)].map((_, i) => (
                <div
                    key={i}
                    className="absolute w-[10%] h-[30%] bg-current rounded-full animate-spinner-fade"
                    style={{
                        transform: `rotate(${i * 30}deg) translateY(-120%)`,
                        animationDelay: `${-1.1 + i * 0.1}s`,
                    }}
                />
            ))}
        </div>
    );
}
