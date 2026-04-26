import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export default function Loading() {
    return (
        <div className="fixed inset-0 bg-gradient-to-br from-[#8FAFC4] to-[#7FA1B8] flex flex-col items-center justify-center z-[9999]">
            {/* Usamos el spinner XL para la carga inicial de página */}
            <LoadingSpinner size="xl" className="text-white" />
        </div>
    );
}
