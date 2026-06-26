import { cn } from '@/lib/utils';

export interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface Props {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

export function TabBar({ tabs, activeTab, onTabChange }: Props) {
  return (
    <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-100 px-3 no-scrollbar">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            disabled={tab.disabled}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-[11px] font-black uppercase tracking-wider transition-colors',
              isActive
                ? 'text-[#36606F]'
                : tab.disabled
                  ? 'cursor-not-allowed text-zinc-300'
                  : 'text-zinc-400 hover:text-zinc-600',
            )}
          >
            {tab.icon && <span className="text-sm">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.disabled && (
              <span className="ml-1 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[8px] font-black text-zinc-300 uppercase">
                Properament
              </span>
            )}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#36606F] rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
