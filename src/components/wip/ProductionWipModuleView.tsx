import React, { useState, useEffect, useCallback } from 'react';
import {
  Boxes,
  Layers,
  ArrowRightLeft,
  CheckCircle2,
  AlertCircle,
  GitBranch,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Folder,
  ChevronDown,
  ChevronLeft,
  Clock,
  Play,
  ShieldCheck,
} from 'lucide-react';
import {
  Part,
  Machine,
  Operator,
  Routing,
  StageInventorySummary,
} from '../../types/inventory';
import {
  ManufacturingOrder,
  ManufacturingOperation,
  WipTransfer,
  WipDashboardMetrics,
} from '../../types/productionWip';
import { formatNumber, toPersianDigits } from '../../utils/formatters';
import { WipDashboardView } from './WipDashboardView';
import { ManufacturingOrdersView } from './ManufacturingOrdersView';
import { InterOperationTransfersView } from './InterOperationTransfersView';
import { WipReconciliationModal } from './WipReconciliationModal';
import { CreateMoModal } from './CreateMoModal';
import { OperationInputModal } from './OperationInputModal';
import { OperationProductionModal } from './OperationProductionModal';
import { OperationTransferModal } from './OperationTransferModal';
import { InventoryReportView } from '../InventoryReportView';
import { WipModuleSkeleton, Skeleton } from '../ui/Skeleton';
import { TraceabilityInquiryView } from './TraceabilityInquiryView';
import { useErpRouter } from '../../context/RouterContext';

export type WipViewMode =
  | 'UNIFIED_DIRECTORY'
  | 'TRACEABILITY'
  | 'DASHBOARD'
  | 'ORDERS'
  | 'TRANSFERS'
  | 'STAGES';

interface ProductionWipModuleViewProps {
  parts: Part[];
  machines: Machine[];
  operators: Operator[];
  stageBalances: StageInventorySummary[];
  initialView?: WipViewMode;
  initialTraceQuery?: string;
  onGlobalRefresh?: () => Promise<void>;
}

export const ProductionWipModuleView: React.FC<ProductionWipModuleViewProps> = ({
  parts,
  machines,
  operators,
  stageBalances,
  initialView,
  initialTraceQuery,
  onGlobalRefresh,
}) => {
  const router = useErpRouter();
  const [activeView, setActiveView] = useState<WipViewMode>(initialView || 'UNIFIED_DIRECTORY');
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Core WIP Data
  const [metrics, setMetrics] = useState<WipDashboardMetrics | null>(null);
  const [orders, setOrders] = useState<ManufacturingOrder[]>([]);
  const [transfers, setTransfers] = useState<WipTransfer[]>([]);
  const [routings, setRoutings] = useState<Routing[]>([]);

  // Unified Search & Filters
  const [searchQuery, setSearchQuery] = useState(initialTraceQuery || '');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [onlyActiveQueue, setOnlyActiveQueue] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    orders_group: true,
    transfers_group: true,
  });
  const [expandedMoIds, setExpandedMoIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (initialView) {
      setActiveView(initialView);
    }
  }, [initialView]);

  useEffect(() => {
    if (initialTraceQuery !== undefined && initialTraceQuery !== '') {
      setSearchQuery(initialTraceQuery);
    }
  }, [initialTraceQuery]);

  // Action Modals State
  const [isCreateMoOpen, setIsCreateMoOpen] = useState(false);
  const [inputModalOp, setInputModalOp] = useState<ManufacturingOperation | null>(null);
  const [prodModalOp, setProdModalOp] = useState<ManufacturingOperation | null>(null);
  const [transferModalContext, setTransferModalContext] = useState<{
    mo: ManufacturingOrder | null;
    op: ManufacturingOperation | null;
  }>({ mo: null, op: null });
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [reconciliationMoId, setReconciliationMoId] = useState<string | null>(null);
  const [loadMatModalMo, setLoadMatModalMo] = useState<ManufacturingOrder | null>(null);
  const [loadMatQty, setLoadMatQty] = useState<number>(0);
  const [loadMatNotes, setLoadMatNotes] = useState<string>('');
  const [loadMatSubmitting, setLoadMatSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const loadWipData = useCallback(async () => {
    setLoading(true);
    try {
      const [metricsRes, mosRes, transfersRes, routingsRes] = await Promise.all([
        fetch('/api/wip/dashboard').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/wip/manufacturing-orders').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/wip/transfers').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/routings').then(r => r.json()).catch(() => ({ success: false })),
      ]);

      if (metricsRes.success) setMetrics(metricsRes.data);
      if (mosRes.success && Array.isArray(mosRes.data)) {
        setOrders(mosRes.data);
        if (mosRes.data.length > 0) {
          setExpandedMoIds(prev =>
            Object.keys(prev).length === 0 ? { [mosRes.data[0].id]: true } : prev
          );
        }
      }
      if (transfersRes.success && Array.isArray(transfersRes.data)) {
        setTransfers(transfersRes.data);
      }
      if (routingsRes.success && Array.isArray(routingsRes.data)) {
        setRoutings(routingsRes.data);
      }
    } catch (err) {
      console.error('Error loading WIP module data:', err);
      setNotification({
        type: 'error',
        message: 'خطا در بارگذاری اطلاعات کار در جریان ساخت (WIP)',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWipData();
  }, [loadWipData]);

  // Show shared Skeleton component during initial data loading phase
  if (loading && orders.length === 0 && !metrics) {
    return <WipModuleSkeleton />;
  }

  // API Handlers
  const handleCreateMo = async (payload: any) => {
    try {
      const res = await fetch('/api/wip/manufacturing-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'خطا در ثبت دستور کار' };
      }
      setNotification({
        type: 'success',
        message: data.message || 'دستور کار ساخت (MO) با موفقیت صادر شد.',
      });
      await loadWipData();
      if (onGlobalRefresh) await onGlobalRefresh();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const handleLoadMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loadMatModalMo || loadMatQty <= 0) return;
    setLoadMatSubmitting(true);
    try {
      const res = await fetch(`/api/wip/manufacturing-orders/${loadMatModalMo.id}/load-material`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: loadMatQty,
          operatorName: 'اپراتور خط تولید',
          notes: loadMatNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({
          type: 'error',
          message: data.error || 'خطا در بارگذاری مواد به دستور کار',
        });
        return;
      }
      setNotification({
        type: 'success',
        message: data.message || 'مواد اولیه / بلنک با موفقیت در دستور کار بارگذاری شد.',
      });
      setLoadMatModalMo(null);
      setLoadMatQty(0);
      setLoadMatNotes('');
      await loadWipData();
      if (onGlobalRefresh) await onGlobalRefresh();
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'خطا در ارتباط با سرور',
      });
    } finally {
      setLoadMatSubmitting(false);
    }
  };

  const handleRecordInput = async (payload: any) => {
    try {
      const res = await fetch('/api/wip/operations/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'خطا در ثبت ورودی ایستگاه' };
      }
      setNotification({
        type: 'success',
        message: data.message || 'ورودی ایستگاه با موفقیت ثبت شد.',
      });
      await loadWipData();
      if (onGlobalRefresh) await onGlobalRefresh();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const handleRecordProduction = async (payload: any) => {
    try {
      const res = await fetch('/api/wip/operations/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'خطا در ثبت گزارش تولید' };
      }
      setNotification({
        type: 'success',
        message: data.message || 'گزارش تولید و ضایعات ایستگاه با موفقیت ثبت شد.',
      });
      await loadWipData();
      if (onGlobalRefresh) await onGlobalRefresh();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const handleCreateTransfer = async (payload: any) => {
    try {
      const res = await fetch('/api/wip/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'خطا در ثبت حواله انتقال' };
      }
      setNotification({
        type: 'success',
        message: data.message || 'حواله انتقال بین مراحل صادر شد.',
      });
      await loadWipData();
      if (onGlobalRefresh) await onGlobalRefresh();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const handleApproveTransfer = async (transferId: string, notes?: string) => {
    try {
      const res = await fetch(`/api/wip/transfers/${transferId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receivedBy: 'اپراتور ایستگاه مقصد',
          notes: notes || 'تأیید دریافت در ایستگاه مقصد',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'خطا در تأیید دریافت حواله' };
      }
      setNotification({
        type: 'success',
        message: data.message || 'دریافت قطعات در ایستگاه مقصد تأیید شد.',
      });
      await loadWipData();
      if (onGlobalRefresh) await onGlobalRefresh();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const handleRejectTransfer = async (transferId: string, reason: string) => {
    try {
      const res = await fetch(`/api/wip/transfers/${transferId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: reason }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'خطا در رد حواله انتقال' };
      }
      setNotification({
        type: 'success',
        message: data.message || 'حواله انتقال رد شد و موجودی به ایستگاه مبدأ بازگشت.',
      });
      await loadWipData();
      if (onGlobalRefresh) await onGlobalRefresh();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const filteredOrders = orders.filter(mo => {
    if (statusFilter !== 'ALL' && mo.status !== statusFilter) return false;
    if (onlyActiveQueue) {
      const hasActive = mo.operations.some(
        o =>
          o.waitingInputQty > 0 ||
          o.inProgressQty > 0 ||
          o.readyForTransferQty > 0
      );
      if (!hasActive) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        mo.moNumber.toLowerCase().includes(q) ||
        mo.partName.toLowerCase().includes(q) ||
        mo.partCode.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleMoRow = (moId: string) => {
    setExpandedMoIds(prev => ({ ...prev, [moId]: !prev[moId] }));
  };

  return (
    <div className="space-y-4">
      {/* SAP HANA Fiori Header + Unified Filter Bar */}
      <div className="bg-white border border-[#d9d9d9] rounded-md p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-[#e5f3fa] border border-[#b3ddf2] text-[#007cc0] flex items-center justify-center shrink-0">
              <GitBranch className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-bold text-[#333333] tracking-tight">
                  قطعات در جریان ساخت و ایستگاه‌ها (WIP)
                </h1>
                {metrics?.overallConservationIntegrity && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[#f1f8f3] text-[#107e3e] border border-[#b7dfc4]">
                    <ShieldCheck className="w-3 h-3 text-[#107e3e]" />
                    <span>تراز پایستگی تایید شده</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-[#666666] mt-0.5">
                مدیریت یکپارچه دستورهای کار ساخت (MO)، صف ایستگاه‌های پرس و جوش، و حواله‌های انتقال بین مراحل
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
            <button
              type="button"
              onClick={loadWipData}
              disabled={loading}
              className="sap-btn-standard inline-flex items-center gap-1.5 text-xs cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#007cc0] ${loading ? 'animate-spin' : ''}`} />
              <span>به‌روزرسانی</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCreateMoOpen(true)}
              className="sap-btn-emphasized inline-flex items-center gap-1.5 text-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>دستور کار جدید (MO)</span>
            </button>
          </div>
        </div>

        {/* Unified SAP Fiori Filter Bar */}
        <div className="space-y-2 pt-2.5 border-t border-[#e5e5e5]">
          <div className="relative">
            <Search className="w-4 h-4 text-[#666666] absolute right-3 top-2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="جستجوی شماره دستور کار (MO)، کد قطعه، نام قطعه یا ایستگاه کاری..."
              className="w-full bg-[#f5f5f5] focus:bg-white border border-[#d9d9d9] focus:border-[#007cc0] rounded pr-9 pl-3 py-1.5 text-xs text-[#333333] placeholder:text-[#767676] focus:outline-none transition-colors"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 bg-white border border-[#d9d9d9] rounded px-2.5 py-1 text-[#333333]">
                <Boxes className="w-3.5 h-3.5 text-[#007cc0]" />
                <span className="text-[#666666]">نمای بخش:</span>
                <select
                  value={activeView}
                  onChange={e => setActiveView(e.target.value as WipViewMode)}
                  className="bg-transparent text-xs font-semibold text-[#333333] focus:outline-none cursor-pointer"
                >
                  <option value="UNIFIED_DIRECTORY">
                    نمای درختی یکپارچه (همه دستورات کار و ایستگاه‌ها)
                  </option>
                  <option value="TRACEABILITY">
                    فرم شناسایی و ردیابی قطعه (استعلام شماره رهگیری و پرینت لیبل)
                  </option>
                  <option value="DASHBOARD">داشبورد گرافیکی گلوگاه‌ها</option>
                  <option value="ORDERS">
                    جدول تفصیلی دستورهای کار ({toPersianDigits(orders.length)})
                  </option>
                  <option value="TRANSFERS">
                    حواله‌های انتقال بین مراحل ({toPersianDigits(transfers.length)})
                  </option>
                  <option value="STAGES">موجودی کل ایستگاه‌های کارخانه</option>
                </select>
              </div>

              <div className="inline-flex items-center gap-1.5 bg-white border border-[#d9d9d9] rounded px-2.5 py-1 text-[#333333]">
                <Filter className="w-3.5 h-3.5 text-[#666666]" />
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="bg-transparent text-xs font-medium text-[#333333] focus:outline-none cursor-pointer"
                >
                  <option value="ALL">وضعیت MO: همه</option>
                  <option value="IN_PROGRESS">در جریان ساخت</option>
                  <option value="RELEASED">صادرشده به سالن</option>
                  <option value="COMPLETED">تکمیل‌شده</option>
                </select>
              </div>

              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#d9d9d9] bg-white text-[#333333] cursor-pointer select-none hover:bg-[#f5f5f5]">
                <input
                  type="checkbox"
                  checked={onlyActiveQueue}
                  onChange={e => setOnlyActiveQueue(e.target.checked)}
                  className="rounded border-[#bfbfbf] text-[#007cc0] focus:ring-0"
                />
                <span>فقط دارای موجودی در صف</span>
              </label>
            </div>

            <div className="flex items-center gap-1.5">
              {activeView !== 'UNIFIED_DIRECTORY' && (
                <button
                  type="button"
                  onClick={() => setActiveView('UNIFIED_DIRECTORY')}
                  className="sap-btn-standard text-[11px] font-semibold cursor-pointer"
                >
                  بازگشت به نمای درختی یکپارچه
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-semibold">{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-xs opacity-70 hover:opacity-100 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Compact 6-Stage Summary Strip */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-white p-3 rounded-md border border-[#d9d9d9] space-y-2"
            >
              <div className="flex items-center justify-between">
                <Skeleton variant="text" className="w-20 h-3" />
                <Skeleton variant="circle" className="w-4 h-4" />
              </div>
              <Skeleton variant="block" className="w-16 h-6" />
              <Skeleton variant="text" className="w-24 h-2.5" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <div className="bg-white p-3 rounded-md border border-[#d9d9d9] shadow-2xs">
            <div className="flex items-center justify-between text-[#666666] text-[11px]">
              <span>صف ورودی ایستگاه</span>
              <Clock className="w-3.5 h-3.5 text-[#007cc0]" />
            </div>
            <div className="text-base font-bold text-[#333333] font-mono tabular-nums mt-1">
              {formatNumber(metrics?.totalWaitingQty || 0)}
            </div>
          </div>

          <div className="bg-white p-3 rounded-md border border-[#d9d9d9] shadow-2xs">
            <div className="flex items-center justify-between text-[#666666] text-[11px]">
              <span>در حال ساخت پای دستگاه</span>
              <Play className="w-3.5 h-3.5 text-[#007cc0]" />
            </div>
            <div className="text-base font-bold text-[#007cc0] font-mono tabular-nums mt-1">
              {formatNumber(metrics?.totalInProgressQty || 0)}
            </div>
          </div>

          <div className="bg-white p-3 rounded-md border border-[#d9d9d9] shadow-2xs">
            <div className="flex items-center justify-between text-[#666666] text-[11px]">
              <span>آماده انتقال به مرحله بعد</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-[#107e3e]" />
            </div>
            <div className="text-base font-bold text-[#107e3e] font-mono tabular-nums mt-1">
              {formatNumber(metrics?.totalReadyForTransferQty || 0)}
            </div>
          </div>

          <div className="bg-white p-3 rounded-md border border-[#d9d9d9] shadow-2xs">
            <div className="flex items-center justify-between text-[#666666] text-[11px]">
              <span>در حال انتقال (حواله باز)</span>
              <ArrowRightLeft className="w-3.5 h-3.5 text-[#e9730c]" />
            </div>
            <div className="text-base font-bold text-[#b85a00] font-mono tabular-nums mt-1">
              {formatNumber(metrics?.totalInTransitQty || 0)}
            </div>
          </div>

          <div className="bg-white p-3 rounded-md border border-[#d9d9d9] shadow-2xs">
            <div className="flex items-center justify-between text-[#666666] text-[11px]">
              <span>محصول تکمیل‌شده</span>
              <Layers className="w-3.5 h-3.5 text-[#007cc0]" />
            </div>
            <div className="text-base font-bold text-[#333333] font-mono tabular-nums mt-1">
              {formatNumber(metrics?.totalCompletedQty || 0)}
            </div>
          </div>

          <div className="bg-white p-3 rounded-md border border-[#d9d9d9] shadow-2xs">
            <div className="flex items-center justify-between text-[#666666] text-[11px]">
              <span>ضایعات و دوباره‌کاری</span>
              <AlertCircle className="w-3.5 h-3.5 text-[#bb0000]" />
            </div>
            <div className="text-base font-bold text-[#bb0000] font-mono tabular-nums mt-1">
              {formatNumber(
                (metrics?.totalScrapQty || 0) + (metrics?.totalReworkQty || 0)
              )}
            </div>
          </div>
        </div>
      )}

      {/* Traceability & Part Identification Flow */}
      {activeView === 'TRACEABILITY' && (
        <TraceabilityInquiryView
          parts={parts}
          machines={machines}
          operators={operators}
          initialQuery={initialTraceQuery}
        />
      )}

      {/* UNIFIED SAP HANA DIRECTORY VIEW */}
      {activeView === 'UNIFIED_DIRECTORY' && (
        <div className="bg-white border border-[#d9d9d9] rounded-md overflow-hidden shadow-2xs">
          <div className="px-3.5 py-2 bg-white border-b border-[#d9d9d9] flex items-center justify-between text-xs font-semibold text-[#333333]">
            <span>نام دستور کار (MO) / مرحله عملیات و ایستگاه</span>
            <span>تگ‌های وضعیت، اسناد مرتبط و عملیات سریع</span>
          </div>

          <div className="divide-y divide-[#e5e5e5] text-xs">
            {/* Folder 1: Active Manufacturing Orders (Expandable inline) */}
            <div>
              <button
                type="button"
                onClick={() => toggleGroup('orders_group')}
                className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-[#e5f3fa]/50 transition-colors cursor-pointer text-right"
              >
                <div className="flex items-center gap-2 font-semibold text-[#333333]">
                  {expandedGroups.orders_group ? (
                    <ChevronDown className="w-4 h-4 text-[#007cc0]" />
                  ) : (
                    <ChevronLeft className="w-4 h-4 text-[#666666]" />
                  )}
                  <Folder className="w-4 h-4 text-[#007cc0]" />
                  <span>دستورهای کار تولید و مراحل ساخت (Manufacturing Orders)</span>
                </div>
                <span className="text-[11px] text-[#666666]">
                  {toPersianDigits(filteredOrders.length)} دستور کار
                </span>
              </button>

              {expandedGroups.orders_group && (
                <div className="divide-y divide-[#e5e5e5]">
                  {filteredOrders.map(mo => {
                    const isExpanded = !!expandedMoIds[mo.id];
                    const completedOps = mo.operations.filter(
                      o => o.status === 'COMPLETED'
                    ).length;
                    return (
                      <div key={mo.id} className="bg-white">
                        {/* MO Row */}
                        <div className="pr-7 pl-3.5 py-2 flex flex-col md:flex-row md:items-center justify-between gap-2 hover:bg-[#e5f3fa]/40 transition-colors">
                          <div
                            onClick={() => toggleMoRow(mo.id)}
                            className="flex items-center gap-2 cursor-pointer flex-1"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-[#007cc0] shrink-0" />
                            ) : (
                              <ChevronLeft className="w-3.5 h-3.5 text-[#666666] shrink-0" />
                            )}
                            <Layers className="w-4 h-4 text-[#007cc0] shrink-0" />
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    router.traceDocument(mo.moNumber, 'WIP_TRACEABILITY');
                                  }}
                                  className="sap-doc-link font-mono font-bold text-xs cursor-pointer"
                                  title="استعلام شجره‌نامه و شماره رهگیری این دستور کار"
                                >
                                  {mo.moNumber}
                                </button>
                                <span className="font-semibold text-[#333333]">
                                  {mo.partName}
                                </span>
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    router.traceDocument(mo.partCode, 'INVENTORY_LEDGER');
                                  }}
                                  className="sap-doc-link font-mono text-[11px] cursor-pointer"
                                  title="مشاهده کاردکس انبار این قطعه"
                                >
                                  ({mo.partCode})
                                </button>
                              </div>
                              <div className="text-[11px] text-[#666666] mt-0.5 flex items-center gap-3 flex-wrap">
                                <span>
                                  هدف ساخت:{' '}
                                  <strong className="font-mono text-[#333333] tabular-nums">
                                    {formatNumber(mo.targetQuantity)}
                                  </strong>
                                </span>
                                <span>
                                  تکمیل نهایی:{' '}
                                  <strong className="font-mono text-[#107e3e] tabular-nums">
                                    {formatNumber(mo.completedQuantity)}
                                  </strong>
                                </span>
                                <span>
                                  ضایعات:{' '}
                                  <strong className="font-mono text-[#bb0000] tabular-nums">
                                    {formatNumber(mo.totalScrapQuantity)}
                                  </strong>
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 self-end md:self-center flex-wrap">
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#f1f8f3] text-[#107e3e] border border-[#b7dfc4]">
                              {toPersianDigits(completedOps)} از{' '}
                              {toPersianDigits(mo.operations.length)} مرحله
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2]">
                              {mo.status === 'IN_PROGRESS'
                                ? 'در جریان ساخت'
                                : mo.status === 'COMPLETED'
                                ? 'تکمیل‌شده'
                                : 'صادرشده'}
                            </span>
                            {mo.status !== 'COMPLETED' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setLoadMatModalMo(mo);
                                  setLoadMatQty(Math.max(1, mo.targetQuantity - mo.initialInputQuantity) || mo.targetQuantity);
                                  setLoadMatNotes('');
                                }}
                                className="sap-btn-standard text-[11px] py-0.5 px-2 cursor-pointer"
                                title="بارگذاری ورق یا بلنک اولیه در مرحله نخست دستور کار"
                              >
                                بارگذاری مواد
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => router.traceDocument(mo.moNumber, 'INVENTORY_LEDGER')}
                              className="sap-btn-standard text-[11px] py-0.5 px-2 cursor-pointer"
                            >
                              اسناد کاردکس
                            </button>
                            <button
                              type="button"
                              onClick={() => setReconciliationMoId(mo.id)}
                              className="sap-btn-standard text-[11px] py-0.5 px-2 cursor-pointer"
                            >
                              تراز پایستگی
                            </button>
                          </div>
                        </div>

                        {/* Inline Operations Rows (Compact SAP HANA) */}
                        {isExpanded && (
                          <div className="bg-[#f8f9fa] border-t border-[#e5e5e5] divide-y divide-[#e5e5e5]">
                            {mo.operations.map(op => (
                              <div
                                key={op.id}
                                className="pr-12 pl-3.5 py-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="px-1.5 py-0.5 rounded bg-white border border-[#d9d9d9] font-mono text-[10px] font-bold text-[#007cc0]">
                                    {op.stepCode}
                                  </span>
                                  <div>
                                    <span className="font-semibold text-[#333333]">
                                      {op.stepName}
                                    </span>
                                    <div className="text-[11px] text-[#666666] flex items-center gap-3 mt-0.5 font-mono tabular-nums">
                                      <span>صف: {formatNumber(op.waitingInputQty)}</span>
                                      <span>پای دستگاه: {formatNumber(op.inProgressQty)}</span>
                                      <span className="text-[#107e3e] font-bold">
                                        آماده انتقال: {formatNumber(op.readyForTransferQty)}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 self-end sm:self-center">
                                  <button
                                    type="button"
                                    onClick={() => setInputModalOp(op)}
                                    className="sap-btn-standard text-[11px] py-0.5 px-2 cursor-pointer"
                                  >
                                    ثبت ورودی
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setProdModalOp(op)}
                                    className="px-2 py-0.5 rounded bg-[#107e3e] hover:bg-[#0d6832] text-white text-[11px] font-semibold cursor-pointer"
                                  >
                                    ثبت تولید / ضایعات
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTransferModalContext({ mo, op });
                                      setIsTransferModalOpen(true);
                                    }}
                                    className="sap-btn-emphasized text-[11px] py-0.5 px-2 cursor-pointer"
                                  >
                                    انتقال به مرحله بعد
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Folder 2: Pending & Recent Transfers */}
            <div>
              <button
                type="button"
                onClick={() => toggleGroup('transfers_group')}
                className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-[#e5f3fa]/50 transition-colors cursor-pointer text-right"
              >
                <div className="flex items-center gap-2 font-semibold text-[#333333]">
                  {expandedGroups.transfers_group ? (
                    <ChevronDown className="w-4 h-4 text-[#007cc0]" />
                  ) : (
                    <ChevronLeft className="w-4 h-4 text-[#666666]" />
                  )}
                  <Folder className="w-4 h-4 text-[#007cc0]" />
                  <span>حواله‌های انتقال بین مراحل (Inter-Operation Transfers)</span>
                </div>
                <span className="text-[11px] text-[#666666]">
                  {toPersianDigits(transfers.length)} حواله
                </span>
              </button>

              {expandedGroups.transfers_group && (
                <div className="divide-y divide-[#e5e5e5]">
                  {transfers.slice(0, 6).map(tr => (
                    <div
                      key={tr.id}
                      className="pr-9 pl-3.5 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-[#e5f3fa]/40"
                    >
                      <div className="flex items-center gap-2.5">
                        <ArrowRightLeft className="w-4 h-4 text-[#007cc0] shrink-0" />
                        <div>
                          <div className="font-semibold text-[#333333] flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => router.traceDocument(tr.transferNumber, 'WIP_TRACEABILITY')}
                              className="sap-doc-link font-mono cursor-pointer"
                            >
                              {tr.transferNumber}
                            </button>
                            <span>— {tr.partName}</span>
                            <button
                              type="button"
                              onClick={() => router.traceDocument(tr.moNumber, 'WIP_TRACEABILITY')}
                              className="sap-doc-link font-mono text-[11px] cursor-pointer"
                            >
                              ({tr.moNumber})
                            </button>
                          </div>
                          <div className="text-[11px] text-[#666666] mt-0.5">
                            از {tr.fromStepName} به {tr.toStepName} • تعداد:{' '}
                            <strong className="font-mono text-[#333333] tabular-nums">
                              {formatNumber(tr.quantity)} عدد
                            </strong>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                            tr.status === 'APPROVED'
                              ? 'bg-[#f1f8f3] text-[#107e3e] border-[#b7dfc4]'
                              : tr.status === 'REJECTED'
                              ? 'bg-[#fff0f0] text-[#bb0000] border-[#f2b8b5]'
                              : 'bg-[#fef7f1] text-[#b85a00] border-[#f5d0b3]'
                          }`}
                        >
                          {tr.status === 'APPROVED'
                            ? 'تحویل‌گرفته در ایستگاه مقصد'
                            : tr.status === 'REJECTED'
                            ? 'رد شده'
                            : 'در انتظار تایید دریافت'}
                        </span>
                        {tr.status === 'PENDING_APPROVAL' && (
                          <button
                            type="button"
                            onClick={() => handleApproveTransfer(tr.id)}
                            className="px-2.5 py-0.5 rounded bg-[#107e3e] hover:bg-[#0d6832] text-white text-[11px] font-semibold cursor-pointer"
                          >
                            تایید دریافت
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Specific Filtered Views when chosen from the View Dropdown */}
      {activeView === 'DASHBOARD' && (
        <WipDashboardView
          metrics={metrics}
          orders={orders}
          loading={loading}
          onRefresh={loadWipData}
          onOpenCreateMo={() => setIsCreateMoOpen(true)}
          onOpenTransfer={() => {
            if (orders.length > 0 && orders[0].operations.length > 0) {
              setTransferModalContext({ mo: orders[0], op: orders[0].operations[0] });
              setIsTransferModalOpen(true);
            }
          }}
          onSelectMo={() => setActiveView('ORDERS')}
          onNavigateToOrders={() => setActiveView('ORDERS')}
          onNavigateToTransfers={() => setActiveView('TRANSFERS')}
        />
      )}

      {activeView === 'ORDERS' && (
        <ManufacturingOrdersView
          orders={filteredOrders}
          loading={loading}
          onRefresh={loadWipData}
          onOpenCreateMo={() => setIsCreateMoOpen(true)}
          onOpenInput={op => setInputModalOp(op)}
          onOpenProduction={op => setProdModalOp(op)}
          onOpenTransfer={(mo, op) => {
            setTransferModalContext({ mo, op });
            setIsTransferModalOpen(true);
          }}
          onOpenReconciliation={moId => setReconciliationMoId(moId)}
        />
      )}

      {activeView === 'TRANSFERS' && (
        <InterOperationTransfersView
          transfers={transfers}
          loading={loading}
          onRefresh={loadWipData}
          onApproveTransfer={handleApproveTransfer}
          onRejectTransfer={handleRejectTransfer}
        />
      )}

      {activeView === 'STAGES' && (
        <InventoryReportView
          balances={stageBalances}
          onRefresh={onGlobalRefresh || loadWipData}
          loading={loading}
        />
      )}

      {/* Action Modals */}
      <CreateMoModal
        isOpen={isCreateMoOpen}
        onClose={() => setIsCreateMoOpen(false)}
        parts={parts}
        routings={routings}
        onSubmit={handleCreateMo}
      />

      <OperationInputModal
        isOpen={!!inputModalOp}
        onClose={() => setInputModalOp(null)}
        operation={inputModalOp}
        machines={machines}
        operators={operators}
        onSubmit={handleRecordInput}
      />

      <OperationProductionModal
        isOpen={!!prodModalOp}
        onClose={() => setProdModalOp(null)}
        operation={prodModalOp}
        onSubmit={handleRecordProduction}
      />

      <OperationTransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        mo={transferModalContext.mo}
        fromOperation={transferModalContext.op}
        onSubmit={handleCreateTransfer}
      />

      <WipReconciliationModal
        isOpen={!!reconciliationMoId}
        onClose={() => setReconciliationMoId(null)}
        moId={reconciliationMoId}
      />

      {loadMatModalMo && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#d9d9d9] rounded-md shadow-lg w-full max-w-md overflow-hidden">
            <div className="px-4 py-3 border-b border-[#e5e5e5] flex items-center justify-between bg-[#f8f9fa]">
              <h3 className="text-xs font-bold text-[#333333]">
                بارگذاری مواد اولیه / بلنک به دستور کار {loadMatModalMo.moNumber}
              </h3>
              <button
                type="button"
                onClick={() => setLoadMatModalMo(null)}
                className="text-xs text-[#666666] hover:text-[#333333] cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleLoadMaterial} className="p-4 space-y-3 text-xs">
              <div className="bg-[#f5f5f5] border border-[#d9d9d9] rounded p-2.5 text-[#333333]">
                <div className="font-semibold">{loadMatModalMo.partName}</div>
                <div className="text-[11px] text-[#666666] mt-0.5 font-mono">
                  هدف: {formatNumber(loadMatModalMo.targetQuantity)} • بارگذاری فعلی: {formatNumber(loadMatModalMo.initialInputQuantity)}
                </div>
              </div>

              <div>
                <label className="block text-[#333333] font-semibold mb-1">
                  تعداد ورق / بلنک ورودی به مرحله نخست (عدد):
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={loadMatQty || ''}
                  onChange={e => setLoadMatQty(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-white border border-[#bfbfbf] rounded px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <div>
                <label className="block text-[#333333] font-semibold mb-1">
                  توضیحات / شماره کویل مرجع (اختیاری):
                </label>
                <input
                  type="text"
                  value={loadMatNotes}
                  onChange={e => setLoadMatNotes(e.target.value)}
                  placeholder="مثال: بارگذاری بلنک برش‌خورده از کلاف COIL-ECU-001"
                  className="w-full bg-white border border-[#bfbfbf] rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e5e5e5]">
                <button
                  type="button"
                  onClick={() => setLoadMatModalMo(null)}
                  className="sap-btn-standard text-xs px-3 py-1.5 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={loadMatSubmitting || loadMatQty <= 0}
                  className="sap-btn-emphasized text-xs px-3.5 py-1.5 cursor-pointer disabled:opacity-50"
                >
                  {loadMatSubmitting ? 'در حال ثبت...' : 'تایید بارگذاری در صف خط'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
