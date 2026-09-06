'use client';

import { Modal } from '@/components/ui/modal';

interface ContactoModalProps {
    isOpen: boolean;
    onClose: () => void;
    phone: string | null;
}

function normalizePhone(phone: string | null): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('34')) return digits;
    return '34' + digits;
}

export default function ContactoModal({ isOpen, onClose, phone }: ContactoModalProps) {
    const telNumber = phone ? normalizePhone(phone) : '';
    const waNumber = telNumber;

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Contacto"
            variant="compact"
            layer="base"
            instance="profile-contact"
            headerTone="petroleum"
            usageId="profile-contact"
            usageLabel="Contacto perfil"
        >
            <div className="space-y-5">
                <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Teléfono</p>
                        <p className="text-black font-bold text-sm break-all">{phone || '—'}</p>
                    </div>
                </div>
                {phone && (
                    <div className="flex items-start justify-center gap-ds-8 pt-2 pb-ds-8">
                        <a
                            href={`tel:+${telNumber}`}
                            className="min-h-[48px] flex flex-col items-center justify-center gap-1 text-black hover:opacity-70 transition-opacity active:scale-[0.98]"
                        >
                            <img src="/icons/phone.png" alt="" className="w-6 h-6 object-contain" />
                            <span className="text-sm leading-tight">Llamar</span>
                        </a>
                        <a
                            href={`https://wa.me/${waNumber}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[48px] flex flex-col items-center justify-center gap-1 text-black hover:opacity-70 transition-opacity active:scale-[0.98]"
                        >
                            <img src="/icons/whatsapp.png" alt="" className="w-6 h-6 object-contain" />
                            <span className="text-sm leading-tight">WhatsApp</span>
                        </a>
                    </div>
                )}
            </div>
        </Modal>
    );
}