'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
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
  /** Si va, muestra «Añadir nota» / «Ver nota» en el pie (p. ej. mosaico Staff). */
  userId?: string | null;
  onOpenNote?: (ymd: string) => void;
};

function parseLocalSafe(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Chrome de cabecera Modal (36px visual + hit ≥48). No es Button. Cabecera = superficie. */
const dayChromeBtn =
  "relative flex h-full w-[var(--modal-header-height)] max-h-full min-h-0 shrink-0 items-center justify-center border-0 bg-transparent text-zinc-500 shadow-none outline-none transition-opacity hover:opacity-80 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']";

export function PavilionDayModal({
  open,
  onClose,
  date,
  onNavigateDay,
  userId,
  onOpenNote,
}: PavilionDayModalProps) {
  const router = useRouter();
  const [isHector, setIsHector] = useState(false);
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPdf, setShowPdf] = useState(false);
  const [hasNote, setHasNote] = useState(false);

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
    setHasNote(false);

    const noteTask =
      userId && onOpenNote
        ? (async () => {
            const supabase = createClient();
            const startIso = `${date}T00:00:00`;
            const endIso = `${date}T23:59:59`;
            const { data } = await supabase
              .from('shifts')
              .select('notes')
              .eq('user_id', userId)
              .eq('is_published', true)
              .gte('start_time', startIso)
              .lte('start_time', endIso)
              .limit(1)
              .maybeSingle();
            const raw = data?.notes?.trim() ?? '';
            setHasNote(Boolean(raw) && raw !== '{}' && raw !== 'null');
          })()
        : Promise.resolve();

    const [res] = await Promise.all([fetchDayDetailAction({ date }), noteTask]);
    if (!res.success) {
      setError(res.error);
      setDayDetail(null);
      setLoading(false);
      return;
    }
    setDayDetail(res.data);
    setLoading(false);
  }, [open, date, userId, onOpenNote]);

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
      headerCompact
      usageId="pavilion-day"
      usageLabel="Pavelló dia"
      scrollContent={false}
      headerTrailing={
        <>
          <button
            type="button"
            onClick={() => onNavigateDay(-1)}
            className={dayChromeBtn}
            aria-label="Dia anterior"
          >
            <ChevronLeft className="h-[clamp(0.875rem,2.8vw,1rem)] w-[clamp(0.875rem,2.8vw,1rem)]" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => onNavigateDay(1)}
            className={dayChromeBtn}
            aria-label="Dia següent"
          >
            <ChevronRight className="h-[clamp(0.875rem,2.8vw,1rem)] w-[clamp(0.875rem,2.8vw,1rem)]" strokeWidth={1.75} />
          </button>
          {dayDetail?.hasPdf ? (
            <button
              type="button"
              onClick={() => setShowPdf((p) => !p)}
              className={dayChromeBtn}
              aria-label={showPdf ? 'Veure activitats' : 'Veure PDF original'}
            >
              <span className="text-[10px] font-medium uppercase tracking-wider">
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
              <Edit2 className="h-[clamp(0.875rem,2.8vw,1rem)] w-[clamp(0.875rem,2.8vw,1rem)]" strokeWidth={1.75} />
            </button>
          ) : null}
        </>
      }
      footer={
        onOpenNote && date ? (
          <div className="flex w-full items-center justify-center">
            <Button
              type="button"
              variant="tertiary"
              instance="pavilion-day-note"
              onClick={() => onOpenNote(date)}
            >
              {hasNote ? 'Ver nota' : 'Añadir nota'}
            </Button>
          </div>
        ) : (
          <div className="flex w-full items-center justify-center gap-[6px] day-modal-dots">
            <div className="h-[7px] w-[7px] rounded-full bg-zinc-300" />
            <div className="h-[9px] w-[9px] rounded-full bg-zinc-500" />
            <div className="h-[7px] w-[7px] rounded-full bg-zinc-300" />
          </div>
        )
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
            <LoadingSpinner className="text-ds-marca" />
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center">
            <p className="text-sm font-medium text-zinc-700">Error en carregar el dia</p>
            <p className="text-xs font-medium text-zinc-400">{error}</p>
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
