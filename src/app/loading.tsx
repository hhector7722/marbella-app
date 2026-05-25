import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export default function Loading() {
    return (
        <div className="fixed inset-0 bg-white/40 backdrop-blur-sm flex flex-col items-center justify-center z-[9999]">
            <LoadingSpinner size="xl" className="text-[#5B8FB9]" />
        </div>
    );
}
