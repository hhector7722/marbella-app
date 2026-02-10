'use client';

import { X, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalOption {
    label: string;
    icon: LucideIcon;
    onClick: () => void;
    color?: string;
}

interface StandardModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    options: ModalOption[];
}

export default function StandardModal({
    isOpen,
    onClose,
    title,
    subtitle,
    options
}: StandardModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* HEADER (Detail View Style) */}
                <div className="bg-[#36606F] px-8 py-4 flex items-center justify-between text-white relative">
                    <div className="flex flex-col">
                        <h2 className="text-lg font-black tracking-wider uppercase leading-none">{title}</h2>
                        {subtitle && (
                            <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em] mt-1">{subtitle}</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90"
                    >
                        <X size={20} strokeWidth={3} />
                    </button>
                </div>

                {/* OPTIONS LIST (Floating Style - No BG/Border) */}
                <div className="p-8 space-y-1">
                    {options.map((option, idx) => {
                        const Icon = option.icon;
                        return (
                            <button
                                key={idx}
                                onClick={() => {
                                    option.onClick();
                                    onClose();
                                }}
                                className={cn(
                                    "w-full flex items-center gap-5 p-4 rounded-2xl transition-all active:scale-95 group min-h-[56px]",
                                    "text-gray-600 hover:text-[#36606F] hover:bg-transparent" // El hover no añade caja sólida
                                )}
                            >
                                <div className={cn(
                                    "p-3 rounded-xl transition-all group-hover:bg-gray-50", // Feedback sutil en el icono
                                    option.color || "text-gray-400 group-hover:text-[#36606F]"
                                )}>
                                    <Icon size={24} strokeWidth={2.5} />
                                </div>
                                <span className="font-bold text-base tracking-tight text-left flex-1">
                                    {option.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
