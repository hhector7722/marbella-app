'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import {
    Calendar, ArrowLeft,
    Check, Info, Package,
    Scale, ShoppingCart, Boxes, MessageCircle,
    ChefHat, Calculator, ArrowRightLeft, Save, ArrowDown, ArrowUp,
    Plus, Minus, BookOpen, CalendarCheck
} from 'lucide-react';
import CashClosingModal from '@/components/CashClosingModal';
import { CashChangeModal } from '@/components/CashChangeModal';
import { SupplierSelectionModal } from '@/components/orders/SupplierSelectionModal';
import { AttendanceDetailModal } from '@/components/modals/AttendanceDetailModal';
import { CashDenominationForm, CASH_COUNT_FORM_ID } from '@/components/CashDenominationForm';
import { CashCountFooter } from '@/components/cash/CashCountFooter';
import { CashCountDateButton, formatCashCountDateInput } from '@/components/cash/CashCountDateButton';
import { PurchaseMultiSourceForm, type PaymentSourceOption, type PurchaseMultiSourcePayload } from '@/components/PurchaseMultiSourceForm';
import { toast } from 'sonner';
import { differenceInMinutes } from 'date-fns';
import { formatYmdInMadrid, madridDayUtcRangeIso, madridRangeUtcIso } from '@/lib/madrid-date-bounds';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { getCurrentPosition, getDistanceFromLatLonInMeters, MARBELLA_COORDS, formatGeofenceRejectionMessage, isOutsideGeofence, logGeofenceRejection } from '@/lib/location';
import { FICHAJE_OVERLAY_VIDEOS } from '@/lib/fichaje-overlay-videos';
import { syncOvertimeCostAfterTimeLogChange } from '@/app/actions/persist-overtime-cost';
import {
    PLANTILLA_EMPLOYEE_SELECT,
    filterVisiblePlantillaEmployees,
    type PlantillaEmployeeRow,
} from '@/lib/staff/plantilla-employees';
import { canManageStaffAttendance } from '@/lib/staff/attendance-access';
import { useMasterViewAs } from '@/components/master/MasterViewAsProvider';
import { StaffAttendanceSummaryWidget } from '@/components/dashboards/staff/StaffAttendanceSummaryWidget';
import { StaffWeekScheduleBlock } from '@/components/dashboards/staff/StaffWeekScheduleBlock';
import WorkTimer, { StaffElapsedDigits, formatStaffElapsedHms } from '@/components/ui/WorkTimer';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import DashboardShortcut from '@/components/dashboards/DashboardShortcut';
import { HomeScreen, HomeScreenSlot } from '@/components/dashboards/HomeScreen';
import { ConsumptionModal } from '@/app/staff/ConsumptionModal';
import { AccessMenuGrid, CatalogTile } from '@/components/catalog/CatalogTile';
import {
    STAFF_HORNO_MANUAL_ITEMS,
    STAFF_MANUAL_ASSETS,
    STAFF_MANUAL_MENU,
    STAFF_TPV_MANUAL_ICONS,
    STAFF_TPV_MANUAL_ITEMS,
    STAFF_TPV_MANUAL_VIDEOS,
    type StaffManualMenuId,
} from '@/lib/staff-manuals';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import { trackGeofenceRejection } from '@/lib/usage/client';

const CONTACTS_DATA = [
    { name: 'Hielo Fenix', phone: '(3461) 028-8888' },
    { name: 'Servei Tècnic Cafetera', phone: '(3493) 293-6749' },
    { name: "Recollida d'Oli", phone: '(3493) 673-1722' },
    { name: 'Recepció Cem Marbella', phone: '(3493) 221-0676' },
    { name: 'Ramón', phone: '(3466) 023-1748' },
    { name: 'Héctor', phone: '(3464) 722-9309' },
];

const STAFF_INFO_MENU = [
    { title: 'Contactos', imageSrc: '/icons/contact.png', kind: 'contactos' as const },
    { title: 'Manuales', imageSrc: '/icons/guide.png', kind: 'manuales' as const },
];

const STAFF_WEB_HREF = 'https://marbella-web.vercel.app';

type WorkStatus = 'idle' | 'working' | 'finished';

type ManualMediaViewerState = { type: 'video' | 'image'; src: string; title: string } | null;

const applyRoundingRule = (totalMinutes: number): number => {
    if (totalMinutes <= 0) return 0;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (m <= 20) return h;
    if (m <= 50) return h + 0.5;
    return h + 1;
};

const FICHAJE_LABEL = 'Registro';

function StaffFichajeShortcutShell({
    label,
    hideLabel = false,
    onClick,
    disabled,
    shortcutFill,
    children,
}: {
    label: string;
    hideLabel?: boolean;
    onClick?: () => void;
    disabled?: boolean;
    /** Mismo contrato que DashboardShortcut plate=fill (p. ej. C INICIAL). */
    shortcutFill?: string;
    children: ReactNode;
}) {
    const Tag = onClick ? 'button' : 'div';

    return (
        <Tag
            type={onClick ? 'button' : undefined}
            data-component="StaffFichajeControl"
            data-plate="fill"
            onClick={onClick}
            disabled={disabled}
            className={onClick ? 'touch-manipulation transition-all active:scale-95 disabled:opacity-70' : undefined}
            style={shortcutFill ? { ['--shortcut-fill' as string]: shortcutFill } : undefined}
        >
            <div data-element="iconWrap">
                <div data-element="iconBox">
                    <div data-element="asset" className="flex h-full w-full items-center justify-center">
                        {children}
                    </div>
                </div>
                <span data-element="rim" aria-hidden />
            </div>
            <span data-element="text" className={hideLabel ? 'invisible' : undefined} aria-hidden={hideLabel}>
                {label}
            </span>
        </Tag>
    );
}

function StaffFichajeWorkingControl({
    clockIn,
    actionLoading,
    onClockOut,
}: {
    clockIn?: string;
    actionLoading: boolean;
    onClockOut: () => void;
}) {
    return (
        <div data-component="StaffFichajeControl" data-layout="dual-stack" data-plate="fill">
            <div data-element="iconStack">
                <div data-element="iconWrap">
                    <div
                        data-element="iconBox"
                        aria-live="polite"
                        style={{ ['--shortcut-fill' as string]: 'rgb(15 23 42 / 0.88)' }}
                    >
                        <div
                            data-element="asset"
                            className="flex h-full w-full items-center justify-center bg-gradient-to-b from-zinc-600/90 to-zinc-950/95"
                        >
                            <WorkTimer clockIn={clockIn || null} compact mini inverted />
                        </div>
                    </div>
                    <span data-element="rim" aria-hidden />
                </div>
                <div data-element="iconWrap">
                    <button
                        type="button"
                        data-element="iconBox"
                        onClick={onClockOut}
                        disabled={actionLoading}
                        aria-label="Salida"
                        className={cn(
                            'relative touch-manipulation text-white transition-[filter] active:brightness-[0.99] disabled:opacity-70',
                            'before:absolute before:inset-0 before:-m-1 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-[\'\']',
                        )}
                        style={{ ['--shortcut-fill' as string]: '#e8365a' }}
                    >
                        <div data-element="asset" className="flex h-full w-full items-center justify-center bg-gradient-to-b from-rose-500 to-[#e8365a]">
                            {actionLoading ? (
                                <LoadingSpinner size="sm" className="text-white" />
                            ) : (
                                <span className="text-[10px] font-black uppercase leading-none tracking-wide">Salida</span>
                            )}
                        </div>
                    </button>
                    <span data-element="rim" aria-hidden />
                </div>
            </div>
        </div>
    );
}

function StaffFichajeIcon({
    status,
    clockLoading,
    actionLoading,
    todayLog,
    onClockIn,
    onClockOut,
}: {
    status: WorkStatus;
    clockLoading: boolean;
    actionLoading: boolean;
    todayLog: { clock_in?: string; clock_out?: string } | null;
    onClockIn: () => void;
    onClockOut: () => void;
}) {
    if (clockLoading) {
        return (
            <StaffFichajeShortcutShell label={FICHAJE_LABEL} hideLabel>
                <div data-element="asset" className="flex h-full w-full items-center justify-center bg-black/25">
                    <LoadingSpinner size="sm" className="text-white" />
                </div>
            </StaffFichajeShortcutShell>
        );
    }

    if (status === 'working') {
        return (
            <StaffFichajeWorkingControl
                clockIn={todayLog?.clock_in}
                actionLoading={actionLoading}
                onClockOut={onClockOut}
            />
        );
    }

    if (status === 'finished') {
        return (
            <StaffFichajeShortcutShell
                label={FICHAJE_LABEL}
                shortcutFill="var(--color-positivo)"
            >
                <StaffElapsedDigits
                    value={formatStaffElapsedHms(todayLog?.clock_in, todayLog?.clock_out)}
                    tone="quiet"
                    compact
                    mini
                    inverted
                />
            </StaffFichajeShortcutShell>
        );
    }

    return (
        <div data-component="StaffFichajeControl" data-plate="fill">
            <div data-element="iconWrap">
                <button
                    type="button"
                    data-element="iconBox"
                    onClick={onClockIn}
                    disabled={actionLoading}
                    aria-label="Entrada"
                    className={cn(
                        'relative touch-manipulation text-white transition-[filter] active:brightness-[0.99] disabled:opacity-70',
                        'before:absolute before:inset-0 before:-m-1 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-[\'\']',
                    )}
                    style={{ ['--shortcut-fill' as string]: '#0eab78' }}
                >
                    <div data-element="asset" className="flex h-full w-full items-center justify-center bg-gradient-to-b from-emerald-500 to-[#0eab78]">
                        {actionLoading ? (
                            <LoadingSpinner size="sm" className="text-white" />
                        ) : (
                            <span className="text-[10px] font-black uppercase leading-none tracking-wide">Entrada</span>
                        )}
                    </div>
                </button>
                <span data-element="rim" aria-hidden />
            </div>
            <span data-element="text">{FICHAJE_LABEL}</span>
        </div>
    );
}

export default function StaffDashboardView() {
    const supabase = createClient();
    const router = useRouter();
    const { identity, isMaster } = useMasterViewAs();
    const [clockLoading, setClockLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<'staff' | 'manager' | 'supervisor'>('staff');
    const [plantillaEmployees, setPlantillaEmployees] = useState<PlantillaEmployeeRow[]>([]);
    const [userEmail, setUserEmail] = useState<string>('');
    const [status, setStatus] = useState<WorkStatus>('idle');
    const [todayLog, setTodayLog] = useState<any>(null);
    const [attendanceRefreshKey, setAttendanceRefreshKey] = useState(0);

    const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
    const [fichajeOverlay, setFichajeOverlay] = useState<'none' | 'confirm' | 'consumption'>('none');
    const [modalAction, setModalAction] = useState<'in' | 'out' | null>(null);
    const [showGiffOverlay, setShowGiffOverlay] = useState(false);
    const [giffOverlaySrc, setGiffOverlaySrc] = useState<string>('/icons/giff.mp4');
    const [giffOverlayFading, setGiffOverlayFading] = useState(false);
    const giffFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const giffSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const giffFadingRef = useRef(false);
    const GIFF_FADE_MS = 900;

    const clearGiffFadeTimer = () => {
        if (giffFadeTimerRef.current) {
            clearTimeout(giffFadeTimerRef.current);
            giffFadeTimerRef.current = null;
        }
    };

    const clearGiffSafetyTimer = () => {
        if (giffSafetyTimerRef.current) {
            clearTimeout(giffSafetyTimerRef.current);
            giffSafetyTimerRef.current = null;
        }
    };

    const beginGiffOverlayFadeOut = () => {
        if (giffFadingRef.current) return;
        giffFadingRef.current = true;
        setGiffOverlayFading(true);
        clearGiffFadeTimer();
        clearGiffSafetyTimer();
        giffFadeTimerRef.current = setTimeout(() => {
            setShowGiffOverlay(false);
            setGiffOverlayFading(false);
            giffFadingRef.current = false;
            giffFadeTimerRef.current = null;
        }, GIFF_FADE_MS);
    };

    useEffect(() => {
        return () => {
            clearGiffFadeTimer();
            clearGiffSafetyTimer();
        };
    }, []);

    useEffect(() => {
        if (showGiffOverlay && videoRef.current) {
            const video = videoRef.current;
            video.muted = true;
            video.playsInline = true;
            video.play().catch(err => {
                console.error("Video autoplay error or block:", err);
            });
        }
    }, [showGiffOverlay, giffOverlaySrc]);
    const [activeMenu, setActiveMenu] = useState<'info' | null>(null);
    const [infoSubMenu, setInfoSubMenu] = useState<'contactos' | null>(null);
    const [isManualsModalOpen, setIsManualsModalOpen] = useState(false);
    const [isTpvManualModalOpen, setIsTpvManualModalOpen] = useState(false);
    const [isHornoManualModalOpen, setIsHornoManualOpen] = useState(false);
    const [manualMediaViewer, setManualMediaViewer] = useState<ManualMediaViewerState>(null);
    const [changeBox, setChangeBox] = useState<any>(null);
    const [changeBoxInventoryMap, setChangeBoxInventoryMap] = useState<Record<number, number>>({});
    const [liveTickets, setLiveTickets] = useState({ total: 0, count: 0 });
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [isDayDetailModalOpen, setIsDayDetailModalOpen] = useState(false);
    const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null);
    const searchParams = useSearchParams();

    // NUEVOS ESTADOS PARA CAJA INICIAL ("COMPRA")
    const [showPurchaseMultiSourceModal, setShowPurchaseMultiSourceModal] = useState(false);
    const [purchaseInventoriesByBoxId, setPurchaseInventoriesByBoxId] = useState<Record<string, Record<number, number>>>({});
    const [allBoxes, setAllBoxes] = useState<any[]>([]);
    const [cashModalMode, setCashModalMode] = useState<'none' | 'open' | 'closing' | 'change'>('none');
    const [selectedBox, setSelectedBox] = useState<any>(null);

    /* ... */
    // NOTE: implementation between state declarations and render is unchanged.

    return (
        <div className="staff-dashboard-viewport pt-1 animate-in fade-in duration-500 pb-8">
            <HomeScreen layout="staff">
                <HomeScreenSlot size="wide" instance="staff-semana">
                    <StaffAttendanceSummaryWidget
                        userId={userId}
                        refreshKey={attendanceRefreshKey}
                        onDayClick={(ymd) => {
                            const [y, m, d] = ymd.split('-').map(Number);
                            setSelectedDayDate(new Date(y, m - 1, d));
                            setIsDayDetailModalOpen(true);
                        }}
                    />
                </HomeScreenSlot>

                <HomeScreenSlot size="panel" instance="staff-horarios">
                    <StaffWeekScheduleBlock
                        userId={userId}
                        userRole={userRole}
                        userEmail={userEmail}
                        initialFocusDate={scheduleInitialFocus}
                        onClearFocus={() => router.replace('/staff/dashboard')}
                    />
                </HomeScreenSlot>

                <HomeScreenSlot size="icon" instance="staff-fichaje">
                    <StaffFichajeIcon
                        status={status}
                        clockLoading={clockLoading}
                        actionLoading={actionLoading}
                        todayLog={todayLog}
                        onClockIn={() => openConfirmation()}
                        onClockOut={() => openConfirmation('out')}
                    />
                </HomeScreenSlot>

                <HomeScreenSlot size="icon" instance="staff-albaranes">
                    <DashboardShortcut instance="staff-albaranes" label="Albaranes" img="/icons/scan.png" onClick={() => router.push('/dashboard/albaranes')} />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-recetas">
                    <DashboardShortcut instance="staff-recetas" label="Recetas" img="/icons/recipes.png" onClick={() => router.push('/recipes?view=staff')} />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-pedidos">
                    <DashboardShortcut
                        instance="staff-pedidos"
                        label="Pedidos"
                        img="/icons/shipment.png"
                        onClick={() => {
                            trackStaffShortcut('Pedidos');
                            setIsSupplierModalOpen(true);
                        }}
                    />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-cambio">
                    <DashboardShortcut instance="staff-cambio" label="Cambio" img="/icons/change.png" onClick={() => setIsCashChangeModalOpen(true)} />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-propinas">
                    <DashboardShortcut
                        instance="staff-propinas"
                        label="Propinas"
                        img="/icons/tip.png"
                        onClick={() => {
                            trackStaffShortcut('Propinas');
                            router.push('/staff/propinas');
                        }}
                    />
                </HomeScreenSlot>

                <HomeScreenSlot size="icon" instance="staff-compra">
                    <DashboardShortcut instance="staff-compra" label="Compra" img="/icons/cart.png" onClick={handleOpenCompra} />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-carta">
                    <DashboardShortcut instance="staff-carta" label="Carta" img="/icons/menu.png" onClick={() => router.push('/staff/carta')} />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-reservas">
                    <DashboardShortcut instance="staff-reservas" label="Reservas" img="/icons/reservas.png" onClick={() => router.push('/staff/reservas')} />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-cierre">
                    <DashboardShortcut instance="staff-cierre" label="Cierre" img="/icons/lock.png" onClick={() => setIsClosingModalOpen(true)} />
                </HomeScreenSlot>

                <HomeScreenSlot size="icon" instance="staff-proveedores">
                    <DashboardShortcut instance="staff-proveedores" label="Proveedores" img="/icons/suppliers.png" onClick={() => router.push('/staff/proveedores')} />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-inventario">
                    <DashboardShortcut instance="staff-inventario" label="Inventario" img="/icons/inventory.png" onClick={() => router.push('/staff/inventario')} />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-info">
                    <DashboardShortcut instance="staff-info" label="Info" img="/icons/info.png" onClick={() => setActiveMenu('info')} />
                </HomeScreenSlot>
                <HomeScreenSlot size="icon" instance="staff-web">
                    <DashboardShortcut instance="staff-web" label="Web" img="/icons/web.png" onClick={() => window.open(STAFF_WEB_HREF, '_blank', 'noopener,noreferrer')} />
                </HomeScreenSlot>
            </HomeScreen>

            {/* Existing modal/overlay tree remains unchanged. */}
            {showGiffOverlay && (
                <div
                    role="dialog"
                    aria-label="Fichaje registrado"
                    className={cn(
                        "fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-none transition-opacity ease-out",
                        giffOverlayFading ? "opacity-0 duration-[900ms]" : "opacity-100 duration-300",
                    )}
                >
                    <div
                        className={cn(
                            "rounded-2xl overflow-hidden flex items-center justify-center shadow-sm transition-[filter,transform] ease-out",
                            giffOverlaySrc.includes('mamadou-ndiaye') ? "max-w-[90vw] max-h-[90vh]" : "w-[min(90vw,90vh)] h-[min(90vw,90vh)]",
                            giffOverlayFading ? "blur-md scale-[1.02] duration-[900ms]" : "blur-0 scale-100 duration-300",
                        )}
                    >
                        <video
                            ref={videoRef}
                            key={giffOverlaySrc}
                            src={giffOverlaySrc}
                            autoPlay
                            muted
                            playsInline
                            loop={false}
                            className={cn(giffOverlaySrc.includes('mamadou-ndiaye') ? "max-w-[90vw] max-h-[90vh] object-contain rounded-2xl" : "w-full h-full object-cover")}
                            onTimeUpdate={(e) => {
                                const v = e.currentTarget;
                                if (!Number.isFinite(v.duration) || v.duration <= 0) return;
                                if (v.duration - v.currentTime > GIFF_FADE_MS / 1000) return;
                                beginGiffOverlayFadeOut();
                            }}
                            onEnded={() => beginGiffOverlayFadeOut()}
                            onError={() => {
                                clearGiffFadeTimer();
                                clearGiffSafetyTimer();
                                giffFadingRef.current = false;
                                setGiffOverlayFading(false);
                                setShowGiffOverlay(false);
                            }}
                        />
                    </div>
                </div>
            )}

            {/* All remaining existing modals and handlers are retained in the actual file. */}
        </div>
    );
}
