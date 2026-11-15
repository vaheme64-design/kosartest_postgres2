import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle,
  Clock,
  Cpu,
  RefreshCw,
  CheckCircle2,
  ShieldAlert,
  Wrench,
  Calendar,
} from 'lucide-react';
import { toPersianDigits } from '../../utils/formatters';

interface OverlapOrderDetail {
  orderNumber: string;
  itemName: string;
  opCode: string;
  startTime: string;
  endTime: string;
  setupTimeMin: number;
}

interface MachineOverlapItem {
  id: string;
  workCenterId: string;
  workCenterCode: string;
  workCenterName: string;
  hallLocation: string;
  orderA: OverlapOrderDetail;
  orderB: OverlapOrderDetail;
  overlapMinutes: number;
  overlapHours: number;
  severity: 'CRITICAL' | 'WARNING';
  message: string;
  recommendation: string;
}

interface MachineOverlapAlertWidgetProps {
  compact?: boolean;
  onNavigateToCapacity?: () => void;
}

export const MachineOverlapAlertWidget: React.FC<MachineOverlapAlertWidgetProps> = ({
  compact = false,
  onNavigateToCapacity,
}) => {
  const [overlaps, setOverlaps] = useState<MachineOverlapItem[]>([]);
  const [totalWorkOrdersChecked, setTotalWorkOrdersChecked] = useState<number>(0);
  const [totalOperationsScheduled, setTotalOperationsScheduled] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<boolean>(!compact);

  const fetchOverlaps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/erp-services/capacity-overlaps');
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'خطا در بررسی تداخل ظرفیت ماشین‌آلات');
      }
      setOverlaps(json.overlaps || []);
      setTotalWorkOrdersChecked(json.totalWorkOrdersChecked || 0);
      setTotalOperationsScheduled(json.totalOperationsScheduled || 0);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'خطای ارتباط با سرور ظرفیت‌سنجی');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverlaps();
  }, [fetchOverlaps]);

  if (loading && overlaps.length === 0) return null;

  return (
    <div
      className={`rounded-lg border transition ${
        overlaps.length > 0
          ? 'bg-amber-50/60 border-amber-200'
          : 'bg-white border-slate-200'
      }`}
      dir="rtl"
    >
      {/* Minimal Single-Line Summary Bar */}
      <div className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 flex-wrap">
          {overlaps.length > 0 ? (
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          )}
          <span className="font-bold text-slate-900">
            پایش تداخل ظرفیت ایستگاه‌ها:
          </span>
          {overlaps.length === 0 ? (
            <span className="text-slate-600">
              بدون تداخل زمانی ({toPersianDigits(totalWorkOrdersChecked)} دستور کار ·{' '}
              {toPersianDigits(totalOperationsScheduled)} مرحله)
            </span>
          ) : (
            <span className="text-rose-800 font-medium">
              {toPersianDigits(overlaps.length)} مورد هم‌پوشانی روی{' '}
              <strong>{overlaps[0]?.workCenterName}</strong> ({overlaps[0]?.orderA.orderNumber} و{' '}
              {overlaps[0]?.orderB.orderNumber} — {toPersianDigits(overlaps[0]?.overlapMinutes || 0)} دقیقه)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {overlaps.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(prev => !prev)}
              className="px-2.5 py-1 rounded bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-semibold transition cursor-pointer"
            >
              {expanded ? 'بستن جزئیات' : 'مشاهده جزئیات تداخل'}
            </button>
          )}
          {onNavigateToCapacity && (
            <button
              type="button"
              onClick={onNavigateToCapacity}
              className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold transition cursor-pointer"
            >
              تقویم ظرفیت
            </button>
          )}
          <button
            type="button"
            onClick={fetchOverlaps}
            className="p-1 rounded bg-white hover:bg-slate-100 text-slate-500 border border-slate-200 transition cursor-pointer"
            title="بروزرسانی"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3.5 py-2 border-t border-rose-200 bg-rose-50 text-rose-800 text-xs">
          {error}
        </div>
      )}

      {/* Clean Tabular Breakdown when Expanded */}
      {expanded && overlaps.length > 0 && (
        <div className="border-t border-amber-200/80 bg-white overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
              <tr>
                <th className="py-2 px-3">ایستگاه کاری / دستگاه</th>
                <th className="py-2 px-3">دستور کار اول</th>
                <th className="py-2 px-3">دستور کار دوم</th>
                <th className="py-2 px-3">میزان تداخل</th>
                <th className="py-2 px-3">پیشنهاد اصلاح برنامه</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {overlaps.map(ov => (
                <tr key={ov.id} className="hover:bg-slate-50/80">
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span className="font-bold text-slate-900">{ov.workCenterName}</span>
                    <span className="text-slate-400 font-mono text-[11px] mr-1.5">
                      ({ov.workCenterCode})
                    </span>
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span className="font-mono font-bold text-slate-800">{ov.orderA.orderNumber}</span>
                    <span className="text-slate-500 mx-1">·</span>
                    <span className="font-mono text-slate-600">{ov.orderA.opCode}</span>
                    <span className="text-slate-400 text-[11px] mr-1.5 font-mono">
                      ({toPersianDigits(ov.orderA.startTime)}–{toPersianDigits(ov.orderA.endTime)})
                    </span>
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span className="font-mono font-bold text-slate-800">{ov.orderB.orderNumber}</span>
                    <span className="text-slate-500 mx-1">·</span>
                    <span className="font-mono text-slate-600">{ov.orderB.opCode}</span>
                    <span className="text-slate-400 text-[11px] mr-1.5 font-mono">
                      ({toPersianDigits(ov.orderB.startTime)}–{toPersianDigits(ov.orderB.endTime)})
                    </span>
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap font-mono font-bold text-rose-600">
                    {toPersianDigits(ov.overlapHours)} ساعت ({toPersianDigits(ov.overlapMinutes)} دقیقه)
                  </td>
                  <td className="py-2 px-3 text-slate-600">{ov.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
