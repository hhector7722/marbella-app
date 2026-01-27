"use client";

import { cn } from "@/lib/utils";

interface ActionButtonProps {
    label: string;
    onClick: () => void;
    variant: "primary" | "danger" | "ghost";
    className?: string;
    disabled?: boolean;
}

export function ActionButton({
    label,
    onClick,
    variant,
    className,
    disabled,
}: ActionButtonProps) {
    const variants = {
        primary: "bg-[#5E35B1] text-white hover:bg-[#5E35B1]/90",
        danger: "bg-red-500 text-white font-black hover:bg-red-600",
        ghost: "bg-white/40 text-white border border-white/50 hover:bg-white/50 backdrop-blur-sm",
    };

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "px-4 py-2 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                "text-[10px] md:text-xs uppercase tracking-wider",
                variants[variant],
                className
            )}
        >
            {label}
        </button>
    );
}
