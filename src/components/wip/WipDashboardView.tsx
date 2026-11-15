import React from 'react';
import {
  Boxes,
  Clock,
  AlertTriangle,
  Layers,
  ArrowRightLeft,
  CheckCircle2,
  TrendingUp,
  FilePlus,
  Play,
  Scale,
  RefreshCw,
  Cpu,
  ShieldCheck,
  ChevronRight,
  ArrowDownRight,
  ArrowUpLeft,
} from 'lucide-react';
import {
  WipDashboardMetrics,
  ManufacturingOrder,
} from '../../types/productionWip';
import {
  formatNumber,
  formatWeightKg,
  toPersianDigits,
} from '../../utils/formatters';
import { KpiCardsSkeleton, ChartSkeleton } from '../ui/Skeleton';
import { useErpRouter } from '../../context/RouterContext';

interface WipDashboardViewProps {
  metrics: WipDashboardMetrics | null;
  orders: ManufacturingOrder[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onOpenCreateMo: () => void;
  onOpenTransfer: () => void;
  onSelectMo: (mo: ManufacturingOrder) => void;
  onNavigateToOrders: () => void;
  onNavigateToTransfers: () => void;
}

export const WipDashboardView: React.FC<WipDashboardViewProps> = ({
  metrics,
  orders,
  loading,
  onRefresh,
  onOpenCreateMo,
  onOpenTransfer,
  onSelectMo,
  onNavigateToOrders,
  onNavigateToTransfers,
}) => {
  const { traceDocument } = useErpRouter();
  if (loading && !metrics) {
    return (
      <div className="space-y-6">
        <KpiCardsSkeleton count={6} columns={6} theme="light" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartSkeleton rows={4} theme="light" />
          <ChartSkeleton rows={4} theme="light" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner and Quick Actions */}
      <div className="sap-card p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm lg:text-base font-bold text-[#333333] flex items-center gap-2">
              <Boxes className="w-4 h-4 text-[#007cc0]" />
              داشبورد کار در جریان ساخت و کنترل گلوگاه‌های خطوط (WIP Execution)
            </h2>
            {metrics?.overallConservationIntegrity && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[#eef8f2] text-[#107e3e] border border-[#b5e0c6]">
                <ShieldCheck className="w-3 h-3 text-[#107e3e]" />
                <span>پایستگی قطعات تایید شده</span>
              </span>
            )}
          </div>
          <p className="text-xs text-[#666666] mt-1 leading-relaxed">
            رهگیری لحظه‌ای صف‌های ورودی، اقلام پای دستگاه، تولید آماده انتقال و تحلیل زمان توقف و قدمت (Aging)
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#666666]' : 'text-[#007cc0]'}`} />
            <span>به‌روزرسانی</span>
          </button>
          <button
            onClick={onOpenTransfer}
            className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-[#007cc0]" />
            <span>انتقال بین‌مراحل</span>
          </button>
          <button
            onClick={onOpenCreateMo}
            className="sap-btn-emphasized flex items-center gap-1.5 px-3.5 py-1.5 text-xs cursor-pointer"
          >
            <FilePlus className="w-3.5 h-3.5" />
            <span>دستور کار جدید (MO)</span>
          </button>
        </div>
      </div>

      {/* 5 Main WIP Stage Breakdown Micro-Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 1. Waiting at operations */}
        <div className="sap-card p-3.5">
          <div className="flex items-center justify-between text-[#666666] text-[11px] font-medium">
            <span>در انتظار صف ورودی</span>
            <Clock className="w-3.5 h-3.5 text-[#007cc0]" />
          </div>
          <div className="text-lg font-bold text-[#333333] font-mono mt-1">
            {formatNumber(metrics?.totalWaitingQty || 0)}
          </div>
          <span className="text-[10px] text-[#666666] block mt-0.5">آماده شروع در ماشین</span>
        </div>

        {/* 2. In-Progress at machines */}
        <div className="sap-card p-3.5">
          <div className="flex items-center justify-between text-[#666666] text-[11px] font-medium">
            <span>در حال ساخت پای دستگاه</span>
            <Play className="w-3.5 h-3.5 text-[#007cc0]" />
          </div>
          <div className="text-lg font-bold text-[#333333] font-mono mt-1">
            {formatNumber(metrics?.totalInProgressQty || 0)}
          </div>
          <span className="text-[10px] text-[#666666] block mt-0.5">در حال پرس/خم/جوش</span>
        </div>

        {/* 3. Ready for transfer */}
        <div className="sap-card p-3.5">
          <div className="flex items-center justify-between text-[#666666] text-[11px] font-medium">
            <span>آماده انتقال به مرحله بعد</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-[#107e3e]" />
          </div>
          <div className="text-lg font-bold text-[#107e3e] font-mono mt-1">
            {formatNumber(metrics?.totalReadyForTransferQty || 0)}
          </div>
          <span className="text-[10px] text-[#666666] block mt-0.5">نیازمند صدور حواله</span>
        </div>

        {/* 4. In-Transit */}
        <div className="sap-card p-3.5">
          <div className="flex items-center justify-between text-[#666666] text-[11px] font-medium">
            <span>در حال انتقال (In-Transit)</span>
            <ArrowRightLeft className="w-3.5 h-3.5 text-[#e9730c]" />
          </div>
          <div className="text-lg font-bold text-[#333333] font-mono mt-1">
            {formatNumber(metrics?.totalInTransitQty || 0)}
          </div>
          <span className="text-[10px] text-[#666666] block mt-0.5">
            {toPersianDigits(metrics?.pendingTransfersCount || 0)} حواله در انتظار تأیید
          </span>
        </div>

        {/* 5. Completed Final Products */}
        <div className="sap-card p-3.5">
          <div className="flex items-center justify-between text-[#666666] text-[11px] font-medium">
            <span>تکمیل‌شده نهایی</span>
            <Layers className="w-3.5 h-3.5 text-[#107e3e]" />
          </div>
          <div className="text-lg font-bold text-[#107e3e] font-mono mt-1">
            {formatNumber(metrics?.totalCompletedQty || 0)}
          </div>
          <span className="text-[10px] text-[#666666] block mt-0.5">تحویل انبار نهایی</span>
        </div>

        {/* 6. Scrap & Non-Conformity */}
        <div className="sap-card p-3.5">
          <div className="flex items-center justify-between text-[#666666] text-[11px] font-medium">
            <span>ضایعات و دوباره‌کاری</span>
            <AlertTriangle className="w-3.5 h-3.5 text-[#bb0000]" />
          </div>
          <div className="text-lg font-bold text-[#bb0000] font-mono mt-1">
            {formatNumber((metrics?.totalScrapQty || 0) + (metrics?.totalReworkQty || 0))}
          </div>
          <span className="text-[10px] text-[#666666] block mt-0.5">
            {toPersianDigits(metrics?.totalScrapQty || 0)} ضایعات | {toPersianDigits(metrics?.totalReworkQty || 0)} دوباره‌کاری
          </span>
        </div>
      </div>

      {/* Two Column Layout: Bottlenecks & Active MOs Progression */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bottlenecks and Queue Depth */}
        <div className="sap-card p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-2">
            <h3 className="text-xs font-bold text-[#333333] flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#007cc0]" />
              <span>تحلیل تراکم و صف ایستگاه‌ها (Bottleneck & Aging Analysis)</span>
            </h3>
            <span className="text-[11px] text-[#666666]">مرتب‌سازی بر اساس عمق صف</span>
          </div>

          <div className="space-y-2.5">
            {(!metrics?.bottleneckOperations || metrics.bottleneckOperations.length === 0) ? (
              <div className="text-center py-8 text-xs text-[#666666]">اطلاعاتی در دسترس نیست.</div>
            ) : (
              metrics.bottleneckOperations.slice(0, 5).map((op, idx) => {
                const isHighAging = op.agingHoursAvg > 12;

                return (
                  <div
                    key={idx}
                    className="p-3 bg-[#f7f7f7] rounded border border-[#d9d9d9] flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#007cc0]">{op.stepCode}</span>
                        <span className="text-xs font-semibold text-[#333333]">{op.operationName}</span>
                      </div>
                      <div className="text-[11px] text-[#666666] mt-1 flex items-center gap-3">
                        <span>صف انتظار: <strong className="text-[#333333] font-mono">{formatNumber(op.waitingQty)}</strong></span>
                        <span>پای‌کار: <strong className="text-[#333333] font-mono">{formatNumber(op.inProgressQty)}</strong></span>
                        <span>آماده انتقال: <strong className="text-[#107e3e] font-mono">{formatNumber(op.readyQty)}</strong></span>
                      </div>
                    </div>

                    <div className="text-left shrink-0">
                      <div className={`text-xs font-mono font-bold ${isHighAging ? 'text-[#bb0000]' : 'text-[#333333]'}`}>
                        {toPersianDigits(op.agingHoursAvg)} ساعت توقف
                      </div>
                      <span className="text-[10px] text-[#666666] block">میانگین قدمت WIP</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Active Manufacturing Orders Quick Overview */}
        <div className="sap-card p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-2">
            <h3 className="text-xs font-bold text-[#333333] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#007cc0]" />
              <span>دستورهای کار جاری و پیشرفت فرآیندها (Active MOs)</span>
            </h3>
            <button
              onClick={onNavigateToOrders}
              className="sap-doc-link text-xs flex items-center gap-1 cursor-pointer"
            >
              <span>مشاهده همه دستورها</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5">
            {orders.slice(0, 4).map(mo => {
              const completedOps = mo.operations.filter(o => o.status === 'COMPLETED').length;
              const progressPercent = Math.round((completedOps / mo.operations.length) * 100);

              return (
                <div
                  key={mo.id}
                  onClick={() => onSelectMo(mo)}
                  className="p-3 bg-[#f7f7f7] hover:bg-[#e5f3fa]/50 rounded border border-[#d9d9d9] transition-colors cursor-pointer space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            traceDocument(mo.moNumber, 'WIP_TRACEABILITY');
                          }}
                          className="sap-doc-link font-mono text-xs cursor-pointer"
                          title="ردیابی دستور ساخت"
                        >
                          {mo.moNumber}
                        </button>
                        <span className="text-xs font-semibold text-[#333333]">{mo.partName}</span>
                      </div>
                      <div className="text-[11px] text-[#666666] mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>کد:</span>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            traceDocument(mo.partCode, 'INVENTORY_LEDGER');
                          }}
                          className="sap-doc-link font-mono cursor-pointer"
                          title="کاردکس و موجودی قطعه"
                        >
                          {mo.partCode}
                        </button>
                        <span>| هدف: <strong className="text-[#333333] font-mono">{formatNumber(mo.targetQuantity)} PCS</strong></span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2]">
                      نسخه {mo.routingVersion}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-[#666666]">
                      <span>پیشرفت مراحل فرآیند ({toPersianDigits(completedOps)} از {toPersianDigits(mo.operations.length)} مرحله):</span>
                      <span className="font-mono font-bold text-[#007cc0]">{toPersianDigits(progressPercent)}٪</span>
                    </div>
                    <div className="h-1.5 w-full bg-[#e8e8e8] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#007cc0] rounded-full transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
