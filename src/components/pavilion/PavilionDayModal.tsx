'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/modal';
import { ActivitiesTab } from '@/components/pavilion/ActivitiesTab';
import { PdfTab } from '@/components/pavilion/PdfTab';
import { fetchDayDetailAction } from '@/app/staff/actividades/actions';
import { createClient } from '@/utils/supabase/client';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import type { DayDetail } from '@/app/staff/actividades/actions';

type PavilionDayModalProps = {
  open: boolean;
  onClose: () => void;
  date: string | null;
  onNavigateDay: (delta: -1 | 1) => void;
};

function parseLocalSafe(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Chrome de cabecera Modal (36px). No es Button. */
const dayChromeBtn =
  'flex h-full w-[var(--modal-header-height)] max-h-full min-h-0 shrink-0 items-center justify-center border-0 bg-transparent text-white/90 shadow-none outline-none transition-opacity hover:opacity-100 active:opacity-70';

export function PavilionDayModal({
  open,
  onClose,
  date,
  onNavigateDay,
}: PavilionDayModalProps) {
  const router = useRouter();
  const [isHector, setIsHector] = useState(false);
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPdf, setShowPdf] = useState(false);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const MIN_SWIPE = 50;

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      setIsHector(isMasterDashboardUser(session?.user?.email ?? ''));
    }
    void checkAuth();
  }, []);

  const loadDay = useCallback(async () => {
    if (!open || !date) return;
    setLoading(true);
    setError(null);
    setShowPdf(false);
    const res = await fetchDayDetailAction({ date });
    if (!res.success) {
      setError(res.error);
      setDayDetail(null);
      setLoading(false);
      return;
    }
    setDayDetail(res.data);
    setLoading(false);
  }, [open, date]);

  useEffect(() => {
    void loadDay();
  }, [loadDay]);

  useEffect(() => {
    setSwipeOffset(0);
  }, [date]);

  const formattedDate = date
    ? (() => {
        const d = parseLocalSafe(date);
        const dayName = format(d, 'EEEE', { locale: es });
        const dd = format(d, 'dd');
        const MM = format(d, 'MM');
        return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${dd}/${MM}`;
      })()
    : '';

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dx) < 10) {
      touchStartX.current = null;
      setSwipeOffset(0);
      return;
    }
    setSwipeOffset(dx);
  }

  function handleTouchEnd() {
    if (touchStartX.current === null) return;
    if (swipeOffset < -MIN_SWIPE) {
      onNavigateDay(1);
    } else if (swipeOffset > MIN_SWIPE) {
      onNavigateDay(-1);
    }
    touchStartX.current = null;
    touchStartY.current = null;
    setSwipeOffset(0);
  }

  return (
    <Modal
      open={open && Boolean(date)}
      onClose={onClose}
      title={formattedDate}
      variant="day"
      layer="base"
      instance="pavilion-day"
      headerTone="petroleum"
      headerCompact
      onBack={() => onNavigateDay(-1)}
      usageId="pavilion-day"
      usageLabel="Pavelló dia"
      scrollContent={false}
      headerTrailing={
        <>
          <button
            type="button"
            onClick={() => onNavigateDay(1)}
            className={dayChromeBtn}
            aria-label="Dia següent"
          >
            <ChevronRight className="h-[clamp(0.875rem,2.8vw,1rem)] w-[clamp(0.875rem,2.8vw,1rem)]" strokeWidth={2.5} />
          </button>
          {dayDetail?.hasPdf ? (
            <button
              type="button"
              onClick={() => setShowPdf((p) => !p)}
              className={dayChromeBtn}
              aria-label={showPdf ? 'Veure activitats' : 'Veure PDF original'}
            >
              <span className="text-[10px] font-black uppercase tracking-wider">
                {showPdf ? 'ACT' : 'PDF'}
              </span>
            </button>
          ) : null}
          {isHector ? (
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams({ date: date! });
                if (dayDetail?.pdfFilePath) {
                  params.set('filePath', dayDetail.pdfFilePath);
                }
                router.push(`/staff/actividades/revision?${params.toString()}`);
              }}
              className={dayChromeBtn}
              aria-label="Editar horario"
            >
              <Edit2 size={16} />
            </button>
          ) : null}
        </>
      }
      footer={
        <div className="flex w-full items-center justify-center gap-[6px] day-modal-dots">
          <div className="h-[7px] w-[7px] rounded-full bg-[#36606F]/25" />
          <div className="h-[9px] w-[9px] rounded-full bg-[#36606F]" />
          <div className="h-[7px] w-[7px] rounded-full bg-[#36606F]/25" />
        </div>
      }
    >
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden day-modal-body"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <LoadingSpinner className="text-[#36606F]" />
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
            <p className="text-sm font-black text-zinc-700">Error en carregar el dia</p>
            <p className="text-xs font-bold text-zinc-400">{error}</p>
          </div>
        ) : showPdf ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <PdfTab filePath={dayDetail?.pdfFilePath ?? null} />
          </div>
        ) : (
          <ActivitiesTab
            activities={dayDetail?.barActivities ?? []}
            date={date}
            isHector={isHector}
          />
        )}
      </div>
    </Modal>
  );
}
