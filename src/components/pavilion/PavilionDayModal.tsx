'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, FileText, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { TabBar, type Tab } from '@/components/pavilion/TabBar';
import { ActivitiesTab } from '@/components/pavilion/ActivitiesTab';

import { PdfTab } from '@/components/pavilion/PdfTab';
import { fetchDayDetailAction } from '@/app/staff/actividades/actions';
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

const headerIconBtn =
  'min-h-[48px] min-w-[48px] flex items-center justify-center text-white hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50 shrink-0';

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

  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('activities');

  const loadDay = useCallback(async () => {
    if (!open || !date) return;
    setLoading(true);
    setError(null);
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

  const tabs: Tab[] = useMemo(() => [
    { id: 'activities', label: 'Activitats' },
    {
      id: 'pdf',
      label: 'PDF original',
      icon: <FileText size={14} />,
      disabled: !dayDetail?.hasPdf,
    },
  ], [dayDetail?.hasPdf]);

  const formattedDate = date
    ? (() => {
        const d = parseLocalSafe(date);
        const raw = format(d, 'EEEE d MMMM yyyy', { locale: es });
        return raw.charAt(0).toUpperCase() + raw.slice(1);
      })()
    : '';

  if (!open || !date) return null;

  return typeof document !== 'undefined'
    ? createPortal(
        <div
          className="fixed inset-0 z-[10050] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          role="presentation"
        >
          <div
            className="bg-white rounded-[2rem] w-full max-w-lg max-h-[92vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ---- Header ---- */}
            <div className="bg-[#36606F] px-2 py-2 text-white shrink-0 flex items-center gap-0.5">
              <div className="flex items-center justify-center gap-0 shrink-0 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onNavigateDay(-1)}
                  className="min-h-[48px] min-w-[36px] flex items-center justify-center hover:bg-white/10 rounded-full transition-colors shrink-0"
                  aria-label="Dia anterior"
                >
                  <ChevronLeft size={20} />
                </button>
                <h3 className="text-sm sm:text-base font-black uppercase tracking-tight text-center capitalize px-0.5 truncate">
                  {formattedDate}
                </h3>
                <button
                  type="button"
                  onClick={() => onNavigateDay(1)}
                  className="min-h-[48px] min-w-[36px] flex items-center justify-center hover:bg-white/10 rounded-full transition-colors shrink-0"
                  aria-label="Dia següent"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              <div className="flex items-center shrink-0">
                {dayDetail?.hasPdf && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('pdf')}
                    className={headerIconBtn}
                    aria-label="Veure PDF original"
                    title="Veure PDF original"
                  >
                    <FileText size={20} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className={headerIconBtn}
                  aria-label="Tancar"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* ---- Tabs ---- */}
            <TabBar
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />

            {/* ---- Content ---- */}
            <div className="flex flex-col min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <LoadingSpinner className="text-[#36606F]" />
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center px-4">
                  <p className="text-sm font-black text-zinc-700">
                    Error en carregar el dia
                  </p>
                  <p className="text-xs font-bold text-zinc-400">{error}</p>
                </div>
              ) : activeTab === 'activities' ? (
                <ActivitiesTab
                  activities={dayDetail?.barActivities ?? []}
                />
              ) : activeTab === 'pdf' ? (
                <PdfTab filePath={dayDetail?.pdfFilePath ?? null} />
              ) : null}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;
}
