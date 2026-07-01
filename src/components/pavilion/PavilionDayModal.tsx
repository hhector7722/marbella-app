'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { X, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
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

const headerBtn =
  'min-h-[48px] min-w-[48px] flex items-center justify-center text-white hover:bg-white/10 rounded-xl transition-colors shrink-0';

export function PavilionDayModal({
  open,
  onClose,
  date,
  onNavigateDay,
}: PavilionDayModalProps) {
  useModalUsageTracking({
    open,
    usageId: 'pavilion-day',
    usageLabel: 'Pavelló dia',
  });

  const router = useRouter();
  const [isHector, setIsHector] = useState(false);
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPdf, setShowPdf] = useState(false);

  // Swipe state
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
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

  // Reset swipe on date change
  useEffect(() => {
    setSwipeOffset(0);
    setIsSwiping(false);
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
    setIsSwiping(true);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    // Only track horizontal swipes (not vertical scrolls)
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dx) < 10) {
      touchStartX.current = null;
      setIsSwiping(false);
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
    setIsSwiping(false);
  }

  if (!open || !date) return null;

  // Clamp offset for visual rubber-band feel
  const clampedOffset = Math.sign(swipeOffset) * Math.min(Math.abs(swipeOffset) * 0.4, 60);

  return typeof document !== 'undefined'
    ? createPortal(
        <div
          className="fixed inset-0 z-[10050] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          role="presentation"
        >
          <div
            className="bg-white rounded-t-[2rem] sm:rounded-[2rem] w-full max-w-full sm:max-w-lg shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300 touch-pan-y"
            style={{
              height: 'min(88vh, 700px)',
              transform: `translateX(${clampedOffset}px)`,
              transition: isSwiping ? 'none' : 'transform 0.25s cubic-bezier(0.25,0.46,0.45,0.94)',
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ---- Header ---- */}
            <div className="bg-[#36606F] px-2 py-2 text-white shrink-0 flex items-center gap-0.5">
              {/* Left: prev arrow — no fill, just icon */}
              <button
                type="button"
                onClick={() => onNavigateDay(-1)}
                className="min-h-[48px] min-w-[36px] flex items-center justify-center text-white/70 hover:text-white transition-colors shrink-0"
                aria-label="Dia anterior"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              {/* Center: date title */}
              <h3 className="flex-1 text-sm sm:text-base font-black uppercase tracking-tight text-center capitalize px-0.5 truncate">
                {formattedDate}
              </h3>

              {/* Right: PDF / edit / close */}
              <div className="flex items-center shrink-0">
                {/* Next arrow — no fill */}
                <button
                  type="button"
                  onClick={() => onNavigateDay(1)}
                  className="min-h-[48px] min-w-[36px] flex items-center justify-center text-white/70 hover:text-white transition-colors shrink-0"
                  aria-label="Dia següent"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>

                {dayDetail?.hasPdf && (
                  <button
                    type="button"
                    onClick={() => setShowPdf((p) => !p)}
                    className={headerBtn}
                    aria-label={showPdf ? 'Veure activitats' : 'Veure PDF original'}
                  >
                    <span className="text-[10px] font-black uppercase tracking-wider">
                      {showPdf ? 'ACT' : 'PDF'}
                    </span>
                  </button>
                )}
                {isHector && (
                  <button
                    type="button"
                    onClick={() => {
                      const params = new URLSearchParams({ date: date! });
                      if (dayDetail?.pdfFilePath) {
                        params.set('filePath', dayDetail.pdfFilePath);
                      }
                      router.push(`/staff/actividades/revision?${params.toString()}`);
                    }}
                    className={headerBtn}
                    aria-label="Editar horario"
                  >
                    <Edit2 size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className={headerBtn}
                  aria-label="Tancar"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* ---- Content ---- */}
            <div className="flex flex-col flex-1 overflow-hidden min-h-0">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <LoadingSpinner className="text-[#36606F]" />
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center px-4">
                  <p className="text-sm font-black text-zinc-700">Error en carregar el dia</p>
                  <p className="text-xs font-bold text-zinc-400">{error}</p>
                </div>
              ) : showPdf ? (
                <PdfTab filePath={dayDetail?.pdfFilePath ?? null} />
              ) : (
                <ActivitiesTab
                  activities={dayDetail?.barActivities ?? []}
                  date={date}
                  isHector={isHector}
                />
              )}
            </div>

            {/* ---- iOS-style page dots ---- */}
            <div className="flex justify-center items-center gap-[6px] py-2.5 bg-white shrink-0">
              <div className="w-[7px] h-[7px] rounded-full bg-[#36606F]/25" />
              <div className="w-[9px] h-[9px] rounded-full bg-[#36606F]" />
              <div className="w-[7px] h-[7px] rounded-full bg-[#36606F]/25" />
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;
}
