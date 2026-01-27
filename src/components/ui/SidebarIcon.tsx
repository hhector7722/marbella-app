"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface SidebarIconProps {
    icon: ReactNode;
    active?: boolean;
    href?: string;
}

export function SidebarIcon({ icon, active, href }: SidebarIconProps) {
    const content = (
        <div
            className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer",
                active
                    ? "bg-white text-[#3F51B5] shadow-lg scale-110"
                    : "text-white/60 hover:text-white hover:bg-white/10"
            )}
        >
            {icon}
        </div>
    );

    if (href) {
        return (
            <Link href={href}>
                {content}
            </Link>
        );
    }

    return content;
}
