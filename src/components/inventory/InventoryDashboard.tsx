import React from 'react';
import {
  Boxes,
  Scale,
  ShieldCheck,
  Clock,
  FilePlus,
  ArrowRightLeft,
  ArrowUpRight,
  ArrowDownLeft,
  FileEdit,
  AlertTriangle,
  ScrollText,
  Warehouse,
  CheckCircle2,
  RefreshCw,
  Search,
  ExternalLink,
  Truck,
} from 'lucide-react';
import {
  InventoryDashboardMetrics,
  DetailedStockBalance,
  SapcoContract,
  WarehouseDefinition,
} from '../../types/inventory';
import { formatNumber, formatWeightKg, toPersianDigits, formatDateTime } from '../../utils/formatters';
import { KpiCardsSkeleton, TableSkeleton } from '../ui/Skeleton';

interface InventoryDashboardProps {
  metrics: InventoryDashboardMetrics | null;
  contracts: SapcoContract[];
  warehouses: WarehouseDefinition[];
  balances: DetailedStockBalance[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onOpenReceipt: () => void;
  onOpenIssue: () => void;
  onOpenCustomerDelivery?: () => void;
  onOpenTransfer: () => void;
  onOpenAdjustment: () => void;
  onNavigateToInquiry: () => void;
  onNavigateToSapco: () => void;
  onNavigateToLedger: () => void;
}

export const InventoryDashboard: React.FC<InventoryDashboardProps> = ({
  metrics,
  contracts,
  warehouses,
  balances,
  loading,
  onRefresh,
  onOpenReceipt,
  onOpenIssue,
  onOpenCustomerDelivery,
  onOpenTransfer,
  onOpenAdjustment,
  onNavigateToInquiry,
  onNavigateToSapco,
  onNavigateToLedger,
}) => {
  if (loading && !metrics && balances.length === 0) {
    return (
      <div className="space-y-6">
        <KpiCardsSkeleton count={4} columns={4} theme="light" />
        <TableSkeleton rows={6} columns={6} theme="light" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* SAP Fiori Dynamic Page Header Bar */}
      <div className="sap-card p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-[#EBF5FF] text-[#0070F2] border border-[#B3D7FF] rounded-lg">
              <Boxes className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-base lg:text-lg font-semibold text-[#1D2D3E]">
                سامانه مدیریت و کاردکس انبار قطعات و ورق (SAP MM / WM)
              </h1>
              <p className="text-xs text-[#556B82] mt-0.5">
                محاسبه بر مبنای اسناد قطعی‌شده، کنترل عدم منفی‌شدن موجودی، تفکیک مالکیت امانی ساپکو و رهگیری کلاف‌ها
              </p>
            </div>
          </div>
        </div>

        {/* SAP Fiori Header Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>به‌روزرسانی</span>
          </button>
          <button
            onClick={onOpenReceipt}
            className="sap-btn-emphasized flex items-center gap-1.5 px-3.5 py-1.5 text-xs cursor-pointer"
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>رسید کالا / ورق (MIGO)</span>
          </button>
          <button
            onClick={onOpenIssue}
            className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>حواله مصرف به خط</span>
          </button>
          {onOpenCustomerDelivery && (
            <button
              onClick={onOpenCustomerDelivery}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#107E3E] hover:bg-[#0D6832] text-white rounded-md text-xs font-medium transition-all cursor-pointer"
            >
              <Truck className="w-4 h-4" />
              <span>تحویل محصول به مشتری</span>
            </button>
          )}
          <button
            onClick={onOpenTransfer}
            className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>انتقال بین انبارها</span>
          </button>
          <button
            onClick={onOpenAdjustment}
            className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
          >
            <FileEdit className="w-4 h-4" />
            <span>تعدیل انبارگردانی</span>
          </button>
        </div>
      </div>

      {/* Main SAP Analytical KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Physical Stock Card */}
        <div className="sap-card p-4">
          <div className="flex items-center justify-between text-[#556B82] text-xs">
            <span className="font-medium text-[#556B82]">موجودی فیزیکی کل کارخانه</span>
            <span className="p-1.5 bg-[#EBF5FF] text-[#0070F2] rounded">
              <Scale className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2.5 text-2xl font-semibold text-[#1D2D3E] font-mono tabular-nums">
            {formatWeightKg(metrics?.totalPhysicalKg || 0)}
          </div>
          <div className="mt-2.5 text-xs text-[#556B82] flex items-center justify-between pt-2 border-t border-[#EAECEF]">
            <span>قطعات و مجموعه‌ها:</span>
            <span className="font-mono text-[#1D2D3E] font-semibold tabular-nums">
              {formatNumber(metrics?.totalPhysicalPcs || 0)} عدد
            </span>
          </div>
        </div>

        {/* Available Stock Card */}
        <div className="sap-card p-4">
          <div className="flex items-center justify-between text-[#556B82] text-xs">
            <span className="font-medium text-[#556B82]">موجودی آزاد و قابل تخصیص (ATP)</span>
            <span className="p-1.5 bg-[#F2F8F4] text-[#107E3E] rounded">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2.5 text-2xl font-semibold text-[#107E3E] font-mono tabular-nums">
            {formatWeightKg(metrics?.totalAvailableKg || 0)}
          </div>
          <div className="mt-2.5 text-xs text-[#556B82] flex items-center justify-between pt-2 border-t border-[#EAECEF]">
            <span>آزاد جهت تولید:</span>
            <span className="font-mono text-[#107E3E] font-semibold tabular-nums">
              {formatNumber(metrics?.totalAvailablePcs || 0)} عدد
            </span>
          </div>
        </div>

        {/* SAPCO Consignment Stock Card */}
        <div className="sap-card p-4">
          <div className="flex items-center justify-between text-[#556B82] text-xs">
            <span className="font-medium text-[#556B82]">ورق امانی ساپکو (تامین‌کننده)</span>
            <span className="p-1.5 bg-[#FFF4E5] text-[#E9730C] rounded">
              <ScrollText className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2.5 text-2xl font-semibold text-[#B45309] font-mono tabular-nums">
            {formatWeightKg(metrics?.totalSapcoConsignmentKg || 0)}
          </div>
          <div className="mt-2.5 text-xs text-[#556B82] flex items-center justify-between pt-2 border-t border-[#EAECEF]">
            <span>مالکیت شرکتی کارخانه:</span>
            <span className="font-mono text-[#1D2D3E] font-medium tabular-nums">
              {formatWeightKg(metrics?.totalCompanyOwnedKg || 0)}
            </span>
          </div>
        </div>

        {/* Reserved & Blocked Stock Card */}
        <div className="sap-card p-4">
          <div className="flex items-center justify-between text-[#556B82] text-xs">
            <span className="font-medium text-[#556B82]">رزرو شده / قرنطینه کیفی</span>
            <span className="p-1.5 bg-[#FFF0F0] text-[#BB0000] rounded">
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2.5 text-2xl font-semibold text-[#1D2D3E] font-mono tabular-nums">
            {formatWeightKg(metrics?.totalReservedKg || 0)}
          </div>
          <div className="mt-2.5 text-xs text-[#556B82] flex items-center justify-between pt-2 border-t border-[#EAECEF]">
            <span>بلوکه کیفی / قرنطینه:</span>
            <span className="font-mono text-[#BB0000] font-semibold tabular-nums">
              {formatWeightKg(metrics?.totalQualityBlockedKg || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Warehouse Status Grid & Contracts Glance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Warehouses Summary (2 cols) */}
        <div className="lg:col-span-2 sap-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#EAECEF] pb-3">
            <h2 className="text-sm font-semibold text-[#1D2D3E] flex items-center gap-2">
              <Warehouse className="w-4 h-4 text-[#0070F2]" />
              وضعیت انبارهای کارخانه و توزیع فیزیکی موجودی
            </h2>
            <button
              onClick={onNavigateToInquiry}
              className="text-xs text-[#0064D9] hover:text-[#004EB0] font-medium flex items-center gap-1 cursor-pointer"
            >
              <span>مشاهده کاردکس تفصیلی</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {warehouses.map(wh => {
              const whBalances = balances.filter(b => b.warehouseId === wh.id);
              const totalKg = whBalances.reduce((sum, b) => sum + b.physicalKg, 0);
              const totalPcs = whBalances.reduce((sum, b) => (b.unit === 'PCS' ? sum + b.physicalQty : sum), 0);
              const lotsCount = new Set(whBalances.map(b => b.lotNumber).filter(Boolean)).size;

              return (
                <div
                  key={wh.id}
                  className="bg-[#F5F6F7] p-4 rounded-md border border-[#D9DFE5] hover:border-[#0070F2] transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#1D2D3E]">{wh.name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#EBF5FF] text-[#0064D9] border border-[#D1E8FF]">
                        {wh.code}
                      </span>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-base font-semibold text-[#1D2D3E] font-mono">
                        {formatWeightKg(totalKg)}
                      </span>
                      {totalPcs > 0 && (
                        <span className="text-xs text-[#556B82] font-mono tabular-nums">
                          ({formatNumber(totalPcs)} عدد)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-[#D9DFE5] text-[11px] text-[#556B82] flex items-center justify-between">
                    <span>سرپرست: {wh.managerName || '—'}</span>
                    <span>{lotsCount > 0 ? `${lotsCount} رول/بچ فعال` : `${wh.locations.length} موقعیت`}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SAPCO Active Contracts Glance (1 col) */}
        <div className="sap-card p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3.5">
            <div className="flex items-center justify-between border-b border-[#EAECEF] pb-3">
              <h2 className="text-sm font-semibold text-[#1D2D3E] flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-[#0070F2]" />
                سهمیه‌های فعال ورق ساپکو
              </h2>
              <button
                onClick={onNavigateToSapco}
                className="text-xs text-[#0064D9] hover:text-[#004EB0] font-medium cursor-pointer"
              >
                دفتر سهمیه‌ها
              </button>
            </div>

            <div className="space-y-3">
              {contracts.slice(0, 3).map(c => {
                const consumedPercent = c.allocatedWeightKg > 0
                  ? Math.round((c.totalConsumedKg / c.allocatedWeightKg) * 100)
                  : 0;

                return (
                  <div key={c.id} className="bg-[#F5F6F7] p-3.5 rounded-md border border-[#D9DFE5]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#1D2D3E]">{c.contractNumber}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#EBF5FF] text-[#0064D9] border border-[#D1E8FF] font-mono">
                        {c.materialGrade}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#556B82] truncate mt-1">{c.title}</div>

                    {/* Progress Bar */}
                    <div className="mt-2.5">
                      <div className="flex items-center justify-between text-[10px] text-[#556B82] mb-1">
                        <span>مانده: {formatWeightKg(c.closingBalanceKg)}</span>
                        <span>{toPersianDigits(consumedPercent)}٪ مصرف</span>
                      </div>
                      <div className="w-full bg-[#D9DFE5] h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            consumedPercent > 80 ? 'bg-[#BB0000]' : 'bg-[#0070F2]'
                          }`}
                          style={{ width: `${Math.min(100, consumedPercent)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-[#EAECEF]">
            <button
              onClick={onNavigateToSapco}
              className="sap-btn-standard w-full py-2 text-xs flex items-center justify-center gap-1.5"
            >
              <span>مشاهده صورتحساب کامل ساپکو</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Critical Business Rules Reminder Strip */}
      <div className="sap-card p-4 flex flex-wrap items-center justify-between gap-4 text-xs text-[#556B82]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#107E3E] shrink-0" />
          <span>
            <strong className="text-[#1D2D3E]">اصول کنترل کیفیت و انبارداری KPIMS:</strong> عدم ثبت موجودی منفی، ثبت اتمیک تراکنش‌ها در سرور، تفکیک رول‌های امانی ساپکو و ثبت اصلاحات با صدور سند معکوس جبرانی.
          </span>
        </div>
        <button
          onClick={onNavigateToLedger}
          className="text-[#0064D9] hover:text-[#004EB0] font-semibold underline underline-offset-4 cursor-pointer"
        >
          دفتر روزنامه تراکنش‌ها
        </button>
      </div>
    </div>
  );
};
