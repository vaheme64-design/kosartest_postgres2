import React from 'react';
import { X, FileText, CheckCircle2, AlertTriangle, Layers, Calendar, User, Cpu } from 'lucide-react';
import { toPersianDigits, formatNumber } from '../../utils/formatters';
import { formatToJalali } from '../../utils/jalali';

export interface DrillDownData {
  title: string;
  subtitle?: string;
  badge?: { text: string; color: string };
  fields: { label: string; value: string | number | React.ReactNode; isMono?: boolean; isHighlight?: boolean }[];
  detailsList?: { title: string; lines: { label: string; value: string | number }[] }[];
}

interface DrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: DrillDownData | null;
}

export const DrillDownModal: React.FC<DrillDownModalProps> = ({
  isOpen,
  onClose,
  data,
}) => {
  if (!isOpen || !data) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#333333]/40 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="bg-[#ffffff] border border-[#d9d9d9] rounded-sm max-w-2xl w-full p-5 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#e8e8e8] pb-3.5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#e5f3fa] border border-[#007cc0]/25 rounded-sm text-[#007cc0]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[#333333]">{data.title}</h3>
                {data.badge && (
                  <span className={`px-2 py-0.5 rounded-sm text-[11px] font-bold ${data.badge.color}`}>
                    {data.badge.text}
                  </span>
                )}
              </div>
              {data.subtitle && (
                <p className="text-xs text-[#666666] mt-0.5">{data.subtitle}</p>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[#666666] hover:text-[#333333] hover:bg-[#f5f5f5] rounded-sm transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Fields Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {data.fields.map((f, idx) => (
            <div
              key={idx}
              className={`p-2.5 rounded-sm border text-xs ${
                f.isHighlight
                  ? 'bg-[#e5f3fa]/70 border-[#007cc0]/30 text-[#333333]'
                  : 'bg-[#f8f9fa] border-[#e8e8e8] text-[#333333]'
              }`}
            >
              <div className="text-[11px] text-[#666666] mb-0.5">{f.label}</div>
              <div
                className={`font-bold ${
                  f.isMono ? 'font-mono' : ''
                } ${f.isHighlight ? 'text-[#007cc0] text-sm' : 'text-[#333333]'}`}
              >
                {typeof f.value === 'number' ? formatNumber(f.value) : f.value}
              </div>
            </div>
          ))}
        </div>

        {/* Additional Details List if present */}
        {data.detailsList && data.detailsList.length > 0 && (
          <div className="space-y-2.5 pt-1">
            <h4 className="text-xs font-bold text-[#333333]">اقلام و مراحل سند مبدأ:</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {data.detailsList.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-[#f8f9fa] p-2.5 rounded-sm border border-[#e8e8e8] text-xs space-y-1"
                >
                  <div className="font-bold text-[#333333]">{item.title}</div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[#666666] text-[11px]">
                    {item.lines.map((l, li) => (
                      <span key={li}>
                        {l.label}:{' '}
                        <strong className="text-[#333333] font-mono">
                          {typeof l.value === 'number' ? formatNumber(l.value) : l.value}
                        </strong>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end pt-3 border-t border-[#e8e8e8]">
          <button
            onClick={onClose}
            className="sap-btn-standard px-4 py-1.5 text-xs cursor-pointer"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
};
