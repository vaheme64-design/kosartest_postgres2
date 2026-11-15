import React, { useState } from 'react';
import {
  Boxes,
  ArrowRightLeft,
  Clock,
  AlertTriangle,
  Layers,
  Search,
  Filter,
  CheckCircle2,
  Cpu,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { StageInventorySummary, FACTORY_STAGES, Part } from '../types/inventory';
import { formatNumber, formatWeightKg, toPersianDigits } from '../utils/formatters';
import { useErpRouter } from '../context/RouterContext';

interface WipTrackingViewProps {
  balances: StageInventorySummary[];
  parts: Part[];
  onOpenTransfer: (partId?: string, stageId?: string) => void;
  onRefresh: () => Promise<void>;
  loading: boolean;
}

export const WipTrackingView: React.FC<WipTrackingViewProps> = ({
  balances,
  parts,
  onOpenTransfer,
  onRefresh,
  loading,
}) => {
  const { traceDocument } = useErpRouter();
  const [selectedStage, setSelectedStage] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // WIP stages are 1 to 8 (excluding STAGE_RAW_STORE and STAGE_FINISHED_STORE and STAGE_SCRAP_YARD)
  const wipStageConfigs = FACTORY_STAGES.filter(
    s => s.type === 'WIP'
  );

  const wipBalances = balances.filter(b => {
    const isWipStage = wipStageConfigs.some(s => s.id === b.stageId);
    if (!isWipStage) return false;
    if (selectedStage !== 'ALL' && b.stageId !== selectedStage) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        b.partName.toLowerCase().includes(q) ||
        b.partCode.toLowerCase().includes(q) ||
        b.stageName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalWipQty = wipBalances.reduce((acc, b) => acc + b.totalQty, 0);
  const totalWipKg = wipBalances.reduce((acc, b) => acc + b.totalKg, 0);
  const totalInTransit = wipBalances.reduce((acc, b) => acc + b.inTransitQty, 0);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="sap-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="w-5 h-5 text-[#007cc0]" />
            <h2 className="text-base font-bold text-[#333333]">کنترل کار در جریان ساخت (WIP Tracking)</h2>
          </div>
          <p className="text-xs text-[#666666] mt-1">
            ثبت عملکرد هر مرحله، انتقال خودکار خروجی سالم به مرحله بعد و مشاهده موجودی واقعی WIP
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenTransfer()}
            className="sap-btn-emphasized flex items-center gap-2 px-4 py-1.5 text-xs"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>جابه‌جایی دستی / استثنایی</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sap-card p-3.5">
          <div className="flex items-center justify-between text-xs text-[#666666] mb-1">
            <span>کل موجودی کار در جریان</span>
            <Boxes className="w-4 h-4 text-[#007cc0]" />
          </div>
          <div className="text-xl font-bold text-[#333333] tabular-nums font-mono">
            {formatNumber(totalWipQty)}
            <span className="text-xs font-sans font-normal text-[#666666] mr-1.5">قطعه نیمه‌ساخته</span>
          </div>
        </div>

        <div className="sap-card p-3.5">
          <div className="flex items-center justify-between text-xs text-[#666666] mb-1">
            <span>وزن کل فلزی WIP</span>
            <Layers className="w-4 h-4 text-[#107e3e]" />
          </div>
          <div className="text-xl font-bold text-[#107e3e] tabular-nums font-mono">
            {formatWeightKg(totalWipKg)}
          </div>
        </div>

        <div className="sap-card p-3.5">
          <div className="flex items-center justify-between text-xs text-[#666666] mb-1">
            <span>انتقال‌های معلق استثنایی</span>
            <Clock className="w-4 h-4 text-[#e9730c]" />
          </div>
          <div className="text-xl font-bold text-[#e9730c] tabular-nums font-mono">
            {formatNumber(totalInTransit)}
            <span className="text-xs font-sans font-normal text-[#666666] mr-1.5">عدد</span>
          </div>
        </div>
      </div>

      {/* Visual Stage Stepper Pipeline */}
      <div className="sap-card p-4">
        <div className="text-xs font-bold text-[#666666] mb-2.5">زنجیره ایستگاه‌های ۸ گانه خطوط تولید کارخانه:</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {wipStageConfigs.map((stage, idx) => {
            const countInStage = balances
              .filter(b => b.stageId === stage.id)
              .reduce((acc, b) => acc + b.totalQty, 0);
            const isSelected = selectedStage === stage.id;
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setSelectedStage(isSelected ? 'ALL' : stage.id)}
                className={`p-2.5 rounded-sm border text-right transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#e5f3fa] border-[#007cc0] text-[#007cc0]'
                    : 'bg-[#f7f7f7] border-[#d9d9d9] text-[#333333] hover:border-[#007cc0]'
                }`}
              >
                <div className="text-[10px] font-mono text-[#666666] mb-0.5">مرحله ۰{idx + 1}</div>
                <div className="text-xs font-bold truncate text-[#333333]">{stage.name.replace(/ایستگاه \d+: /, '')}</div>
                <div className="text-sm font-bold text-[#007cc0] mt-1.5 tabular-nums font-mono">
                  {formatNumber(countInStage)} <span className="text-[10px] font-sans font-normal text-[#666666]">عدد</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="sap-card p-3 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute right-3 top-2 text-[#666666]" />
          <input
            type="text"
            placeholder="جستجوی قطعه، کد یا مرحله..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm pr-9 pl-3 py-1.5 text-xs text-[#333333] placeholder-[#888888] focus:outline-none focus:border-[#007cc0]"
          />
        </div>

        {selectedStage !== 'ALL' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#007cc0] font-semibold">فیلتر فعال روی ایستگاه انتخابی</span>
            <button
              type="button"
              onClick={() => setSelectedStage('ALL')}
              className="sap-btn-standard px-2.5 py-1 text-xs"
            >
              نمایش همه ایستگاه‌ها
            </button>
          </div>
        )}
      </div>

      {/* WIP Balances Table */}
      <div className="sap-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="sap-table-compact w-full text-right text-xs">
            <thead className="bg-[#f5f5f5] text-[#666666] border-b border-[#d9d9d9] font-semibold">
              <tr>
                <th>ایستگاه و مرحله ساخت</th>
                <th>کد قطعه</th>
                <th>نام قطعه نیمه‌ساخته</th>
                <th>موجودی فیزیکی</th>
                <th>در حال انتقال (ترانزیت)</th>
                <th>موجودی قابل استفاده</th>
                <th>وزن فلزی (kg)</th>
                <th>درصد ضایعات مرحله</th>
                <th className="text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e8e8] text-[#333333]">
              {wipBalances.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-[#666666]">
                    قطعه نیمه‌ساخته‌ای با این فیلتر یافت نشد.
                  </td>
                </tr>
              ) : (
                wipBalances.map((item, idx) => (
                  <tr key={`${item.stageId}-${item.partId}-${idx}`} className="hover:bg-[#f5f5f5] transition-colors">
                    <td className="font-bold text-[#333333] flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#007cc0] shrink-0" />
                      {item.stageName}
                    </td>
                    <td className="font-mono font-semibold">
                      <button
                        type="button"
                        onClick={() => traceDocument(item.partCode, 'INVENTORY_LEDGER')}
                        className="sap-doc-link font-mono"
                        title="رهگیری در انبار و کاردکس"
                      >
                        {item.partCode}
                      </button>
                    </td>
                    <td className="font-medium text-[#333333]">{item.partName}</td>
                    <td className="font-bold text-[#333333] tabular-nums font-mono">
                      {formatNumber(item.totalQty)} <span className="font-sans font-normal text-[#666666]">{item.unit}</span>
                    </td>
                    <td className="text-[#e9730c] font-bold tabular-nums font-mono">
                      {item.inTransitQty > 0 ? `${formatNumber(item.inTransitQty)} عدد` : '—'}
                    </td>
                    <td className="font-bold text-[#107e3e] tabular-nums font-mono">
                      {formatNumber(item.usableQty)} <span className="font-sans font-normal text-[#666666]">{item.unit}</span>
                    </td>
                    <td className="font-mono tabular-nums">{formatWeightKg(item.totalKg)}</td>
                    <td>
                      {item.scrapQty > 0 ? (
                        <span className="text-[#bb0000] font-bold tabular-nums">
                          {toPersianDigits(item.scrapRatePercent)}٪ ({formatNumber(item.scrapQty)} عدد)
                        </span>
                      ) : (
                        <span className="text-[#666666]">۰٪</span>
                      )}
                    </td>
                    <td className="text-center">
                      <button
                        type="button"
                        onClick={() => onOpenTransfer(item.partId, item.stageId)}
                        className="sap-btn-standard px-2.5 py-1 text-[11px]"
                      >
                        ارسال به مرحله بعد
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
