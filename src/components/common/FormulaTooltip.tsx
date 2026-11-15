import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Calculator, HelpCircle } from 'lucide-react';

interface FormulaTooltipProps {
  title: string;
  formula: string;
  description?: string;
  badgeColor?: string;
  variables?: {
    name?: string;
    symbol?: string;
    meaning?: string;
    description?: string;
    value?: string | number;
  }[];
  interpretation?: string;
  note?: string;
  variant?: 'light' | 'dark';
}

export const FormulaTooltip: React.FC<FormulaTooltipProps> = ({
  title,
  formula,
  description,
  variables,
  interpretation,
  note,
  variant = 'light',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; openAbove: boolean }>({
    top: 0,
    left: 0,
    openAbove: false,
  });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const popupWidth = 320;
    const popupEstimatedHeight = 250;
    const margin = 12;

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openAbove = spaceBelow < popupEstimatedHeight && spaceAbove > spaceBelow;

    const top = openAbove ? Math.max(margin, rect.top - 8) : Math.min(window.innerHeight - margin, rect.bottom + 8);
    let left = rect.left + rect.width / 2 - popupWidth / 2;
    if (left < margin) left = margin;
    if (left + popupWidth > window.innerWidth - margin) {
      left = window.innerWidth - popupWidth - margin;
    }

    setCoords({ top, left, openAbove });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        popupRef.current &&
        !popupRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  return (
    <div className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onMouseEnter={() => {
          updatePosition();
          setIsOpen(true);
        }}
        onMouseLeave={() => setIsOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          updatePosition();
          setIsOpen(!isOpen);
        }}
        className={`p-1 rounded transition-colors focus:outline-none cursor-pointer ${
          variant === 'dark'
            ? 'text-[#666666] hover:text-[#007cc0] hover:bg-[#e5f3fa]'
            : 'text-[#666666] hover:text-[#007cc0] hover:bg-[#e5f3fa]'
        }`}
        aria-label={`فرمول محاسبه: ${title}`}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popupRef}
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              transform: coords.openAbove ? 'translateY(-100%)' : 'none',
              width: '320px',
              maxWidth: 'calc(100vw - 24px)',
              zIndex: 9999,
            }}
            className="p-3.5 bg-white text-[#333333] rounded-md shadow-xl border border-[#d9d9d9] text-right animate-in fade-in duration-150 font-sans"
            dir="rtl"
          >
            <div className="flex items-center gap-1.5 text-[#007cc0] font-bold text-xs mb-2 pb-1.5 border-b border-[#e8e8e8]">
              <Calculator className="w-3.5 h-3.5 shrink-0" />
              <span>منطق محاسبه: {title}</span>
            </div>

            <div className="bg-[#f7f7f7] border border-[#d9d9d9] rounded p-2 mb-2.5 font-mono text-[11px] text-[#333333] text-center leading-relaxed" dir="ltr">
              {formula}
            </div>

            {description && (
              <div className="text-[11px] text-[#666666] leading-relaxed mb-2">
                {description}
              </div>
            )}

            {variables && variables.length > 0 && (
              <div className="space-y-1.5 mb-2">
                <div className="text-[10px] font-bold text-[#666666]">اجزای فرمول:</div>
                {variables.map((v, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-2 text-[11px] bg-[#f7f7f7] border border-[#e8e8e8] px-2 py-1 rounded">
                    <div>
                      <span className="font-mono font-bold text-[#007cc0] ml-1">
                        {v.name || v.symbol}:
                      </span>
                      <span className="text-[#333333]">{v.description || v.meaning}</span>
                    </div>
                    {v.value !== undefined && (
                      <span className="font-mono font-bold text-[#107e3e] shrink-0">{v.value}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {(interpretation || note) && (
              <div className="text-[10px] text-[#666666] leading-relaxed pt-1.5 border-t border-[#e8e8e8]">
                {interpretation || note}
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};
