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
import { useErpRouter } from '../../context/RouterContext';

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
  const { traceDocument } = useErpRouter();
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
      className={`rounded-md border transition ${
        overlaps.length > 0
          ? 'bg-[#FFF4E5] border-[#F5CBA7]'
          : 'bg-white border-[#D9DFE5]'
      }`}
      dir="rtl"
    >
      {/* SAP Fiori Object Message Strip */}
      <div className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 flex-wrap">
          {overlaps.length > 0 ? (
            <ShieldAlert className="w-4 h-4 text-[#E9730C] shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-[#107E3E] shrink-0" />
          )}
          <span className="font-semibold text-[#1D2D3E]">
            پایش تداخل ظرفیت ایستگاه‌ها:
          </span>
          {overlaps.length === 0 ? (
            <span className="text-[#556B82]">
              بدون تداخل زمانی ({toPersianDigits(totalWorkOrdersChecked)} دستور کار ·{' '}
              {toPersianDigits(totalOperationsScheduled)} مرحله)
            </span>
          ) : (
            <span className="text-[#8A4400] font-medium">
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
              className="sap-btn-standard px-2.5 py-1 text-[11px]"
            >
              {expanded ? 'بستن جزئیات' : 'مشاهده جزئیات تداخل'}
            </button>
          )}
          {onNavigateToCapacity && (
            <button
              type="button"
              onClick={onNavigateToCapacity}
              className="sap-btn-emphasized px-2.5 py-1 text-[11px]"
            >
              تقویم ظرفیت
            </button>
          )}
          <button
            type="button"
            onClick={fetchOverlaps}
            className="sap-btn-standard p-1"
            title="بروزرسانی"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3.5 py-2 border-t border-[#F5B7B1] bg-[#FFECEC] text-[#BB0000] text-xs">
          {error}
        </div>
      )}

      {/* Clean SAP ALV Breakdown when Expanded */}
      {expanded && overlaps.length > 0 && (
        <div className="border-t border-[#f5cba7] bg-[#ffffff] overflow-x-auto">
          <table className="sap-table-compact w-full text-right text-xs">
            <thead className="bg-[#f5f5f5] border-b border-[#d9d9d9] text-[#666666] font-semibold">
              <tr>
                <th>ایستگاه کاری / دستگاه</th>
                <th>دستور کار اول</th>
                <th>دستور کار دوم</th>
                <th>میزان تداخل</th>
                <th>پیشنهاد اصلاح برنامه</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e8e8] tabular-nums">
              {overlaps.map(ov => (
                <tr key={ov.id} className="hover:bg-[#f5f5f5]">
                  <td className="whitespace-nowrap">
                    <span className="font-bold text-[#333333]">{ov.workCenterName}</span>
                    <span className="text-[#666666] font-mono text-[11px] mr-1.5">
                      ({ov.workCenterCode})
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => traceDocument(ov.orderA.orderNumber, 'WIP_TRACEABILITY')}
                      className="sap-doc-link font-mono font-bold"
                    >
                      {ov.orderA.orderNumber}
                    </button>
                    <span className="text-[#666666] mx-1">·</span>
                    <span className="font-mono text-[#333333]">{ov.orderA.opCode}</span>
                    <span className="text-[#666666] text-[11px] mr-1.5 font-mono">
                      ({toPersianDigits(ov.orderA.startTime)}–{toPersianDigits(ov.orderA.endTime)})
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => traceDocument(ov.orderB.orderNumber, 'WIP_TRACEABILITY')}
                      className="sap-doc-link font-mono font-bold"
                    >
                      {ov.orderB.orderNumber}
                    </button>
                    <span className="text-[#666666] mx-1">·</span>
                    <span className="font-mono text-[#333333]">{ov.orderB.opCode}</span>
                    <span className="text-[#666666] text-[11px] mr-1.5 font-mono">
                      ({toPersianDigits(ov.orderB.startTime)}–{toPersianDigits(ov.orderB.endTime)})
                    </span>
                  </td>
                  <td className="whitespace-nowrap font-mono font-bold text-[#bb0000]">
                    {toPersianDigits(ov.overlapHours)} ساعت ({toPersianDigits(ov.overlapMinutes)} دقیقه)
                  </td>
                  <td className="text-[#666666]">{ov.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
