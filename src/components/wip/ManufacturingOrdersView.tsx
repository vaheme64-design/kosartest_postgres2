import React, { useState } from 'react';
import {
  Layers,
  Search,
  Filter,
  Plus,
  Play,
  CheckCircle2,
  ArrowRightLeft,
  Scale,
  Clock,
  ChevronDown,
  ChevronUp,
  Cpu,
  Building2,
  AlertTriangle,
  RotateCcw,
  Check,
} from 'lucide-react';
import {
  ManufacturingOrder,
  ManufacturingOperation,
} from '../../types/productionWip';
import {
  formatNumber,
  toPersianDigits,
  formatDateTime,
} from '../../utils/formatters';
import { TableSkeleton } from '../ui/Skeleton';
import { useErpRouter } from '../../context/RouterContext';

interface ManufacturingOrdersViewProps {
  orders: ManufacturingOrder[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onOpenCreateMo: () => void;
  onOpenInput: (operation: ManufacturingOperation) => void;
  onOpenProduction: (operation: ManufacturingOperation) => void;
  onOpenTransfer: (mo: ManufacturingOrder, operation: ManufacturingOperation) => void;
  onOpenReconciliation: (moId: string) => void;
}

export const ManufacturingOrdersView: React.FC<ManufacturingOrdersViewProps> = ({
  orders,
  loading,
  onRefresh,
  onOpenCreateMo,
  onOpenInput,
  onOpenProduction,
  onOpenTransfer,
  onOpenReconciliation,
}) => {
  const { traceDocument } = useErpRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [expandedMoId, setExpandedMoId] = useState<string | null>(orders.length > 0 ? orders[0].id : null);

  if (loading && orders.length === 0) {
    return <TableSkeleton rows={6} columns={6} theme="light" />;
  }

  const filteredOrders = orders.filter(mo => {
    if (statusFilter !== 'ALL' && mo.status !== statusFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchesMo = mo.moNumber.toLowerCase().includes(q);
      const matchesPartName = mo.partName.toLowerCase().includes(q);
      const matchesPartCode = mo.partCode.toLowerCase().includes(q);
      const matchesNotes = mo.notes ? mo.notes.toLowerCase().includes(q) : false;
      if (!matchesMo && !matchesPartName && !matchesPartCode && !matchesNotes) {
        return false;
      }
    }
    return true;
  });

  const statusBadges: Record<string, { label: string; color: string }> = {
    PLANNED: { label: 'برنامه‌ریزی‌شده', color: 'bg-[#f5f5f5] text-[#666666] border-[#d9d9d9]' },
    RELEASED: { label: 'صادرشده به سالن', color: 'bg-[#e5f3fa] text-[#007cc0] border-[#b3ddf2]' },
    IN_PROGRESS: { label: 'در جریان ساخت', color: 'bg-[#fff4e5] text-[#e9730c] border-[#f9d6a7]' },
    COMPLETED: { label: 'تکمیل‌شده', color: 'bg-[#ebf7ef] text-[#107e3e] border-[#a9dfbf]' },
    CANCELLED: { label: 'لغوشده', color: 'bg-[#ffecec] text-[#bb0000] border-[#f5b7b1]' },
  };

  return (
    <div className="space-y-4">
      {/* Header and Controls */}
      <div className="sap-card p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[#333333] flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#007cc0]" />
            دستورهای کار تولید و فرآیندهای ساخت (Manufacturing Orders)
          </h2>
          <p className="text-xs text-[#666666] mt-0.5">
            پیگیری چندمرحله‌ای عملیات، ثبت ورودی/خروجی هر ایستگاه، پایش ضایعات و صدور حواله انتقال بین‌مراحل
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenCreateMo}
            className="sap-btn-emphasized flex items-center gap-1.5 px-3.5 py-1.5 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>صدور دستور کار جدید (MO)</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="sap-card p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative min-w-[240px] flex-1">
            <Search className="w-3.5 h-3.5 text-[#666666] absolute right-2.5 top-2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="جستجوی شماره دستور (MO)، کد یا عنوان قطعه..."
              className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm pr-8 pl-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
          >
            <option value="ALL">همه وضعیت‌ها</option>
            <option value="IN_PROGRESS">در جریان ساخت (In-Progress)</option>
            <option value="RELEASED">صادرشده (Released)</option>
            <option value="COMPLETED">تکمیل‌شده (Completed)</option>
          </select>
        </div>

        <div className="text-xs text-[#666666]">
          تعداد دستورها: <strong className="text-[#333333] font-mono">{toPersianDigits(filteredOrders.length)}</strong>
        </div>
      </div>

      {/* Orders List & Interactive Operations */}
      <div className="space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="sap-card p-10 text-center text-[#666666] text-xs">
            هیچ دستور کاری با فیلترهای انتخابی یافت نشد.
          </div>
        ) : (
          filteredOrders.map(mo => {
            const isExpanded = expandedMoId === mo.id;
            const completedOpsCount = mo.operations.filter(o => o.status === 'COMPLETED').length;
            const statusInfo = statusBadges[mo.status] || { label: mo.status, color: 'bg-[#f5f5f5] text-[#333333] border-[#d9d9d9]' };

            return (
              <div
                key={mo.id}
                className={`sap-card transition-all ${
                  isExpanded ? 'border-[#007cc0]' : 'hover:border-[#bfbfbf]'
                }`}
              >
                {/* Header Row */}
                <div className="p-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] rounded-sm">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => traceDocument(mo.moNumber, 'WIP_TRACEABILITY')}
                          className="sap-doc-link font-mono font-bold text-sm"
                          title="رهگیری دستور ساخت"
                        >
                          {mo.moNumber}
                        </button>
                        <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold border ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                        <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold bg-[#f5f5f5] text-[#666666] border border-[#d9d9d9]">
                          نسخه مسیر {mo.routingVersion}
                        </span>
                        <span className="text-xs font-bold text-[#333333] mr-1">{mo.partName}</span>
                      </div>
                      <div className="text-xs text-[#666666] mt-1 flex items-center gap-4 flex-wrap">
                        <span>
                          کد قطعه:{' '}
                          <button
                            type="button"
                            onClick={() => traceDocument(mo.partCode, 'INVENTORY_LEDGER')}
                            className="sap-doc-link font-mono font-bold"
                          >
                            {mo.partCode}
                          </button>
                        </span>
                        <span>هدف ساخت: <strong className="font-mono text-[#107e3e]">{formatNumber(mo.targetQuantity)} PCS</strong></span>
                        <span>ورودی شیت: <strong className="font-mono text-[#007cc0]">{formatNumber(mo.initialInputQuantity)} PCS</strong></span>
                        <span>تکمیل نهایی: <strong className="font-mono text-[#333333]">{formatNumber(mo.completedQuantity)} PCS</strong></span>
                        <span>کل ضایعات: <strong className="font-mono text-[#bb0000]">{formatNumber(mo.totalScrapQuantity)} PCS</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Top Right Action & Toggle */}
                  <div className="flex items-center gap-2 self-end md:self-center">
                    <button
                      type="button"
                      onClick={() => onOpenReconciliation(mo.id)}
                      className="flex items-center gap-1.5 px-3 py-1 bg-[#ebf7ef] hover:bg-[#ddf1e4] text-[#107e3e] border border-[#a9dfbf] rounded-sm text-xs font-bold transition-all cursor-pointer"
                      title="مشاهده گواهی موازنه پایستگی قطعات"
                    >
                      <Scale className="w-3.5 h-3.5" />
                      <span>موازنه و بازرسی تراز</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setExpandedMoId(isExpanded ? null : mo.id)}
                      className="sap-btn-standard flex items-center gap-1 px-3 py-1 text-xs"
                    >
                      <span>{isExpanded ? 'بستن مراحل' : 'مشاهده مراحل'}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Operations Timeline & Cards */}
                {isExpanded && (
                  <div className="border-t border-[#d9d9d9] p-4 bg-[#f7f7f7] space-y-3">
                    <div className="flex items-center justify-between text-xs text-[#666666] flex-wrap gap-2">
                      <div>
                        مراحل فرآیند ساخت ({toPersianDigits(completedOpsCount)} از {toPersianDigits(mo.operations.length)} تکمیل‌شده)
                      </div>
                      <div className="text-[11px] text-[#666666]">
                        مبتنی بر قانون پایستگی: قطعات سالم تا پیش از ثبت حواله، در انبار مرحله بعد منظور نمی‌شوند.
                      </div>
                    </div>

                    {/* Operations Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      {mo.operations.map((op, idx) => {
                        const hasWaiting = op.waitingInputQty > 0;
                        const hasInProgress = op.inProgressQty > 0;
                        const hasReadyToTransfer = op.readyForTransferQty > 0;

                        return (
                          <div
                            key={op.id}
                            className={`p-3 rounded-sm border bg-[#ffffff] flex flex-col justify-between space-y-2.5 transition-all ${
                              hasInProgress
                                ? 'border-[#007cc0] border-r-4 border-r-[#007cc0]'
                                : hasReadyToTransfer
                                ? 'border-[#a9dfbf] border-r-4 border-r-[#107e3e]'
                                : hasWaiting
                                ? 'border-[#f9d6a7] border-r-4 border-r-[#e9730c]'
                                : 'border-[#d9d9d9] opacity-85'
                            }`}
                          >
                            {/* Card Top */}
                            <div>
                              <div className="flex items-start justify-between gap-1">
                                <div>
                                  <span className="font-mono text-xs font-bold text-[#007cc0]">
                                    {op.stepCode}
                                  </span>
                                  <h4 className="text-xs font-bold text-[#333333] mt-0.5 line-clamp-1" title={op.stepName}>
                                    {op.stepName}
                                  </h4>
                                </div>
                                <span className="px-1.5 py-0.5 rounded-sm text-[9px] font-bold bg-[#f5f5f5] text-[#333333] border border-[#d9d9d9] font-mono">
                                  گام {toPersianDigits(idx + 1)}
                                </span>
                              </div>

                              <div className="mt-1 text-[10px] text-[#666666] flex items-center justify-between">
                                <span className="font-mono text-[#007cc0]">{op.warehouseLocation}</span>
                                {op.machineName && <span className="truncate max-w-[120px]">{op.machineName}</span>}
                              </div>

                              {/* Quantitative Breakdown */}
                              <div className="mt-2.5 pt-2 border-t border-[#e8e8e8] grid grid-cols-2 gap-2 text-[11px] tabular-nums">
                                <div>
                                  <span className="text-[#666666] block text-[10px]">در صف ورودی:</span>
                                  <span className={`font-mono font-bold ${op.waitingInputQty > 0 ? 'text-[#e9730c]' : 'text-[#888888]'}`}>
                                    {formatNumber(op.waitingInputQty)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[#666666] block text-[10px]">پای دستگاه:</span>
                                  <span className={`font-mono font-bold ${op.inProgressQty > 0 ? 'text-[#007cc0]' : 'text-[#888888]'}`}>
                                    {formatNumber(op.inProgressQty)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[#666666] block text-[10px]">آماده انتقال:</span>
                                  <span className={`font-mono font-bold ${op.readyForTransferQty > 0 ? 'text-[#107e3e]' : 'text-[#888888]'}`}>
                                    {formatNumber(op.readyForTransferQty)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[#666666] block text-[10px]">ضایعات ثبتی:</span>
                                  <span className={`font-mono font-bold ${op.scrapQty > 0 ? 'text-[#bb0000]' : 'text-[#888888]'}`}>
                                    {formatNumber(op.scrapQty)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Card Action Buttons */}
                            <div className="pt-2 border-t border-[#e8e8e8] flex items-center gap-1.5 flex-wrap">
                              {hasWaiting && (
                                <button
                                  type="button"
                                  onClick={() => onOpenInput(op)}
                                  className="sap-btn-emphasized flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[11px]"
                                  title="شروع پردازش و انتقال به پای دستگاه"
                                >
                                  <Play className="w-3 h-3" />
                                  <span>شروع کار</span>
                                </button>
                              )}

                              {hasInProgress && (
                                <button
                                  type="button"
                                  onClick={() => onOpenProduction(op)}
                                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-[#107e3e] hover:bg-[#0d6832] text-white rounded-sm text-[11px] font-bold transition-all cursor-pointer"
                                  title="ثبت قطعات سالم و ضایعات"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>ثبت خروجی</span>
                                </button>
                              )}

                              {hasReadyToTransfer && (
                                <button
                                  type="button"
                                  onClick={() => onOpenTransfer(mo, op)}
                                  className="sap-btn-standard flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[11px] text-[#007cc0] border-[#007cc0]"
                                  title="ارسال قطعات به مرحله بعد یا انبار"
                                >
                                  <ArrowRightLeft className="w-3 h-3" />
                                  <span>انتقال ({formatNumber(op.readyForTransferQty)})</span>
                                </button>
                              )}

                              {!hasWaiting && !hasInProgress && !hasReadyToTransfer && op.transferredQty > 0 && (
                                <span className="w-full text-center text-[10px] text-[#107e3e] font-semibold py-1">
                                  ✓ کلیه قطعات به مرحله بعد ارسال شده‌اند
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
