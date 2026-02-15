import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export default function Loading() {
    return (
        <div className="fixed inset-0 bg-[#5B8FB9] flex flex-col items-center justify-center z-[9999]">
            <div className="flex flex-col items-center gap-6">
                {/* Usamos el spinner XL para la carga inicial de página */}
                <LoadingSpinner size="xl" className="text-white" />

                <div className="flex flex-col items-center gap-1">
                    <p className="text-white font-black uppercase tracking-[0.3em] text-sm md:text-base animate-pulse">
                        LA MARBELLA
                    </p>
                    <div className="h-[2px] w-12 bg-white/20 rounded-full overflow-hidden">
                        <div className="h-full bg-white/60 w-1/2 animate-[shimmer_1.5s_infinite]" />
                    </div>
                </div>
            </div>
        </div>
    );
}
