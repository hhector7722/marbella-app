import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

export function AlbaranesOptionsModal({
    isOpen,
    onClose,
}: {
    isOpen: boolean;
    onClose: () => void;
}) {
    const router = useRouter();

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Opciones de Albaranes"
            variant="compact"
            layer="base"
            scheme="dark"
            instance="albaranes-options-modal"
            usageLabel="Opciones de Albaranes"
            hideHeader
            hideCloseButton
            footer={
                <div className="flex w-full min-w-0 flex-nowrap gap-3">
                    <div className="flex min-w-0 flex-1">
                        <Button
                            type="button"
                            variant="secondary"
                            layout="fill"
                            className="w-full"
                            instance="albaranes-options-list"
                            onClick={() => {
                                onClose();
                                router.push('/dashboard/albaranes');
                            }}
                        >
                            Albaranes
                        </Button>
                    </div>
                    <div className="flex min-w-0 flex-1">
                        <Button
                            type="button"
                            variant="primary"
                            layout="fill"
                            className="w-full"
                            instance="albaranes-options-scan"
                            onClick={() => {
                                onClose();
                                router.push('/dashboard/scanner');
                            }}
                        >
                            Escanear
                        </Button>
                    </div>
                </div>
            }
        >
            {null}
        </Modal>
    );
}
