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
            scrollContent={false}
            footer={
                <div className="flex w-full min-w-0 flex-wrap items-center justify-center gap-2">
                    <Button
                        type="button"
                        variant="secondary"
                        layout="hug"
                        instance="albaranes-options-list"
                        onClick={() => {
                            onClose();
                            router.push('/dashboard/albaranes');
                        }}
                    >
                        Albaranes
                    </Button>
                    <Button
                        type="button"
                        variant="primary"
                        layout="hug"
                        instance="albaranes-options-scan"
                        onClick={() => {
                            onClose();
                            router.push('/dashboard/scanner');
                        }}
                    >
                        Escanear
                    </Button>
                </div>
            }
        >
            {null}
        </Modal>
    );
}
