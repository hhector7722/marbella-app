'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';

type MasterReservasModalProps = {
    isOpen: boolean;
    onClose: () => void;
};

export default function MasterReservasModal({ isOpen, onClose }: MasterReservasModalProps) {
    const router = useRouter();

    const go = (href: string) => {
        onClose();
        router.push(href);
    };

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Reservas y encargos"
            headerVariant="petroleum"
            className="max-h-[85vh]"
            wrapperClassName="max-w-md"
            zIndexClass="z-[200]"
            usageId="master-reservas"
            usageLabel="Reservas y encargos master"
        >
            <div className="p-4 space-y-3 bg-white overflow-y-auto">
                <button
                    type="button"
                    onClick={() => go('/staff/reservas')}
                    className="flex items-center gap-4 w-full p-4 text-gray-600 hover:text-blue-600 hover:bg-zinc-50 transition-all group active:scale-95 min-h-[56px]"
                >
                    <div className="w-12 h-12 shrink-0 flex items-center justify-center">
                        <Image
                            src="/icons/reservas.png"
                            alt="Reservas y encargos"
                            width={48}
                            height={48}
                            className="object-contain transition-transform group-hover:scale-110"
                        />
                    </div>
                    <p className="min-w-0 flex-1 text-left text-sm font-black text-gray-800">Reservas y encargos</p>
                </button>
            </div>
        </Modal>
    );
}
