import React, { useState } from 'react';
import {
  X,
  Tag,
  GitBranch,
  Sliders,
  PackageCheck,
  PauseCircle,
  PlayCircle,
  Compass,
  Boxes,
  AlertTriangle,
  Edit3,
  Trash2,
  Plus,
  Lock,
  CheckCircle2,
  Pin,
  Truck,
  Layers,
  FileCheck2,
  ArrowUpRight,
  Hammer,
  Flame,
  Cpu,
  History,
} from 'lucide-react';
import {
  HighwayPartScenario,
  HighwayOperationStep,
} from './FactoryHighwayWorkbench';
import { formatNumber, toPersianDigits } from '../../utils/formatters';
import { AuditTrailTabContent, useEnterpriseUx } from '../../context/EnterpriseUxContext';
import { useErpRouter } from '../../context/RouterContext';

export type DrawerTabKey = 'TRACEABILITY' | 'ROUTING' | 'ACTIONS' | 'AUDIT_TRAIL' | 'WIP_INSPECTION';

interface OrderDetailsDrawerProps {
  order: HighwayPartScenario | null;
  isOpen: boolean;
  initialTab?: DrawerTabKey;
  onClose: () => void;
  onCompleteProduction: (order: HighwayPartScenario) => void;
  onDispatchFinishedGoods: (order: HighwayPartScenario) => void;
  onToggleLineStop: (order: HighwayPartScenario) => void;
  onIssueSheet: (order: HighwayPartScenario) => void;
  onOpenStepLogger: (order: HighwayPartScenario, opIndex: number) => void;
  onOpenAddOp: (order: HighwayPartScenario) => void;
  onOpenEditOp: (order: HighwayPartScenario, opIndex: number, op: HighwayOperationStep) => void;
  onDeleteOp: (orderId: string, opIndex: number) => void;
  onOpenTrackModal: (orderId: string) => void;
  onOpenEditOrder: (order: HighwayPartScenario) => void;
  onDeleteOrder: (order: HighwayPartScenario) => void;
  onTogglePin: (orderId: string) => void;
  onNavigateToSapco?: () => void;
  onOpenWipInspection?: (order: HighwayPartScenario) => void;
}

export const OrderDetailsDrawer: React.FC<OrderDetailsDrawerProps> = ({
  order,
  isOpen,
  initialTab = 'TRACEABILITY',
  onClose,
  onCompleteProduction,
  onDispatchFinishedGoods,
  onToggleLineStop,
  onIssueSheet,
  onOpenStepLogger,
  onOpenAddOp,
  onOpenEditOp,
  onDeleteOp,
  onOpenTrackModal,
  onOpenEditOrder,
  onDeleteOrder,
  onTogglePin,
  onNavigateToSapco,
  onOpenWipInspection,
}) => {
  const [activeTab, setActiveTab] = useState<DrawerTabKey>(initialTab);
  const { openQuickEditDrawer } = useEnterpriseUx();
  const { traceDocument } = useErpRouter();

  React.useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab, order?.id]);

  if (!isOpen || !order) return null;

  const isCompleted = order.status === 'COMPLETED';
  const isHalted = order.status === 'HALTED';
  const lastOp = order.operations[order.operations.length - 1];
  const finishedQty = lastOp ? lastOp.completedGood : 0;
  const progressPct = Math.min(
    100,
    Math.round((finishedQty / Math.max(1, order.orderQty)) * 100)
  );
  const totalScrapQty = order.operations.reduce((sum, op) => sum + (op.scrapQty || 0), 0);

  const netWeightKg = Math.round(order.orderQty * order.unitWeightKg);
  const grossRequiredKg = Math.round(
    netWeightKg * (1 + order.scrapAllowancePct / 100)
  );

  const activeOpIndex = order.operations.findIndex(
    op => op.completedGood < order.orderQty
  );
  const currentOpIdx = activeOpIndex >= 0 ? activeOpIndex : order.operations.length - 1;
  const currentOp = order.operations[currentOpIdx];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#333333]/40 backdrop-blur-[1px] animate-in fade-in"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-[#ffffff] h-full shadow-2xl border-r border-[#d9d9d9] flex flex-col justify-between overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-20 p-4 border-b border-[#d9d9d9] bg-[#ffffff] space-y-3 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    traceDocument(order.orderCode, 'WIP_TRACEABILITY');
                  }}
                  className="sap-doc-link font-mono text-sm font-semibold"
                >
                  {order.orderCode}
                </button>

                {isCompleted ? (
                  <span className="px-2 py-0.5 rounded bg-[#f2f8f4] text-[#107e3e] border border-[#b7dfc7] text-[11px] font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>تکمیل و رسید انبار</span>
                  </span>
                ) : isHalted ? (
                  <span className="px-2 py-0.5 rounded bg-[#fff0f0] text-[#bb0000] border border-[#f5b7b1] text-[11px] font-semibold flex items-center gap-1">
                    <PauseCircle className="w-3.5 h-3.5" />
                    <span>توقف خط (HALTED)</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] text-[11px] font-semibold">
                    در جریان ({currentOp?.stepCode || 'OP10'})
                  </span>
                )}

                {order.contractCode && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      traceDocument(order.contractCode!, 'CONTRACTS');
                    }}
                    className="sap-doc-link text-[11px]"
                  >
                    · قرارداد: {order.contractCode}
                  </button>
                )}
              </div>

              <h2 className="text-sm font-semibold text-[#333333]">
                {order.partName}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-mono">{order.partCode}</span>
                <span>·</span>
                <span>{order.carModel}</span>
                <span>·</span>
                <span>مشتری: {order.customerName}</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onTogglePin(order.id)}
                title={order.isPinned ? 'حذف نشانه‌گذاری VIP' : 'نشانه‌گذاری به عنوان قطعه کلیدی (VIP)'}
                className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                  order.isPinned
                    ? 'bg-amber-50 border-amber-300 text-amber-600'
                    : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700'
                }`}
              >
                <Pin className={`w-4 h-4 ${order.isPinned ? 'fill-amber-500' : ''}`} />
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                title="بستن کشوی جزئیات"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="bg-[#f5f5f5] border border-[#d9d9d9] rounded p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#666666] font-medium">
                پیشرفت تحویل محصول نهایی به انبار:
              </span>
              <div className="font-mono font-semibold text-[#333333] tabular-nums">
                {formatNumber(finishedQty)} از {formatNumber(order.orderQty)} عدد (
                {toPersianDigits(progressPct)}٪)
              </div>
            </div>
            <div className="w-full h-1.5 bg-[#e8e8e8] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  isCompleted ? 'bg-[#107e3e]' : isHalted ? 'bg-[#bb0000]' : 'bg-[#007cc0]'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="sap-icon-tab-bar -mx-4 px-4">
            <button
              type="button"
              onClick={() => setActiveTab('TRACEABILITY')}
              className={`sap-icon-tab ${activeTab === 'TRACEABILITY' ? 'sap-icon-tab-active' : ''}`}
            >
              <Tag className="w-3.5 h-3.5 shrink-0" />
              <span>رهگیری</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ROUTING')}
              className={`sap-icon-tab ${activeTab === 'ROUTING' ? 'sap-icon-tab-active' : ''}`}
            >
              <GitBranch className="w-3.5 h-3.5 shrink-0" />
              <span>مسیر ({toPersianDigits(order.operations.length)} OP)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('WIP_INSPECTION')}
              className={`sap-icon-tab ${activeTab === 'WIP_INSPECTION' ? 'sap-icon-tab-active' : ''}`}
            >
              <Boxes className="w-3.5 h-3.5 shrink-0" />
              <span>موجودی بین‌مراحل (WIP)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ACTIONS')}
              className={`sap-icon-tab ${activeTab === 'ACTIONS' ? 'sap-icon-tab-active' : ''}`}
            >
              <Sliders className="w-3.5 h-3.5 shrink-0" />
              <span>عملیات خط</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('AUDIT_TRAIL')}
              className={`sap-icon-tab ${activeTab === 'AUDIT_TRAIL' ? 'sap-icon-tab-active' : ''}`}
            >
              <History className="w-3.5 h-3.5 shrink-0" />
              <span>ممیزی (Audit)</span>
            </button>
          </div>
        </div>

        {/* ================================================================ */}
        {/* 2. DRAWER BODY CONTENT                                           */}
        {/* ================================================================ */}
        <div className="flex-1 p-5 space-y-5 text-xs">
          {/* -------------------------------------------------------------- */}
          {/* TAB 1: TRACEABILITY (شماره ذوب، بچ تولید، اطلاعات کلاف و BOM)   */}
          {/* -------------------------------------------------------------- */}
          {activeTab === 'TRACEABILITY' && (
            <div className="space-y-4">
              {/* 4-Stage End-to-End Document Continuity Strip */}
              <div className="p-3 rounded bg-[#f5f5f5] border border-[#d9d9d9] space-y-2">
                <div className="text-[11px] font-semibold text-[#333333]">
                  زنجیره پیوستگی اسناد از قرارداد تا کاردکس:
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => { onClose(); traceDocument(order.contractCode || order.orderCode, 'CONTRACTS'); }}
                    className="p-2 rounded bg-white border border-[#d9d9d9] hover:border-[#007cc0] hover:bg-[#e5f3fa] text-right cursor-pointer"
                  >
                    <div className="text-[10px] text-[#666666]">۱. قرارداد مرجع</div>
                    <div className="font-mono font-semibold text-[#007cc0] truncate">{order.contractCode || 'CNT-SAPCO'}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => { onClose(); traceDocument(order.materialIssuedVoucherNo || order.coilNumber || order.orderCode, 'INVENTORY_LEDGER'); }}
                    className="p-2 rounded bg-white border border-[#d9d9d9] hover:border-[#007cc0] hover:bg-[#e5f3fa] text-right cursor-pointer"
                  >
                    <div className="text-[10px] text-[#666666]">۲. حواله ورق / کاردکس</div>
                    <div className="font-mono font-semibold text-[#007cc0] truncate">{order.materialIssuedVoucherNo || 'مشاهده اسناد'}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => { onClose(); traceDocument(order.orderCode, 'WIP_TRACEABILITY'); }}
                    className="p-2 rounded bg-white border border-[#d9d9d9] hover:border-[#007cc0] hover:bg-[#e5f3fa] text-right cursor-pointer"
                  >
                    <div className="text-[10px] text-[#666666]">۳. دستور کار (MO)</div>
                    <div className="font-mono font-semibold text-[#007cc0] truncate">{order.orderCode}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => { onClose(); traceDocument(order.coilNumber || order.heatNumber || order.partCode, 'COILS'); }}
                    className="p-2 rounded bg-white border border-[#d9d9d9] hover:border-[#007cc0] hover:bg-[#e5f3fa] text-right cursor-pointer"
                  >
                    <div className="text-[10px] text-[#666666]">۴. رول ورق و ذوب</div>
                    <div className="font-mono font-semibold text-[#007cc0] truncate">{order.coilNumber || order.heatNumber || 'رول فعال'}</div>
                  </button>
                </div>
              </div>

              {/* Primary Traceability Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded bg-[#fff8e6] border border-[#f0cf85] space-y-1">
                  <div className="flex items-center justify-between text-[#8a5300]">
                    <span className="text-[11px] font-semibold">شماره ذوب (Heat No)</span>
                    <Flame className="w-4 h-4 text-[#e9730c]" />
                  </div>
                  <div className="font-mono text-sm font-semibold text-[#333333]">{order.heatNumber || 'HT-99412-MOB'}</div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      if (onNavigateToSapco) {
                        traceDocument(order.heatNumber || order.coilNumber || order.orderCode, 'WIP_TRACEABILITY');
                      } else {
                        traceDocument(order.heatNumber || order.coilNumber || order.orderCode, 'WIP_TRACEABILITY');
                      }
                    }}
                    className="sap-doc-link text-[11px] flex items-center gap-1 pt-1"
                  >
                    <span>استعلام شجره‌نامه ذوب</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="p-3 rounded bg-[#f5f5f5] border border-[#d9d9d9] space-y-1">
                  <div className="flex items-center justify-between text-[#666666]">
                    <span className="text-[11px] font-semibold">شماره بچ تولید</span>
                    <Layers className="w-4 h-4 text-[#007cc0]" />
                  </div>
                  <button
                    type="button"
                    onClick={() => { onClose(); traceDocument(order.productionBatchCode, 'WIP_TRACEABILITY'); }}
                    className="sap-doc-link text-sm font-semibold"
                  >
                    {order.productionBatchCode}
                  </button>
                  <div className="text-[11px] font-mono text-[#666666] pt-1">بچ ساپکو: {order.sapcoBatchNumber || 'BCH-SAP-1404'}</div>
                </div>

                <div className="p-3 rounded bg-[#f5f5f5] border border-[#d9d9d9] space-y-1">
                  <div className="flex items-center justify-between text-[#666666]">
                    <span className="text-[11px] font-semibold">شماره کلاف (Coil No)</span>
                    <Cpu className="w-4 h-4 text-[#107e3e]" />
                  </div>
                  <button
                    type="button"
                    onClick={() => { onClose(); traceDocument(order.coilNumber || order.rawMaterialCode, 'COILS'); }}
                    className="sap-doc-link text-sm font-semibold"
                  >
                    {order.coilNumber || 'MOB-2025-DC01'}
                  </button>
                  <div className="text-[11px] text-[#666666] pt-1 truncate">{order.rawMaterialCode}</div>
                </div>
              </div>

              <div className="p-3.5 rounded bg-white border border-[#d9d9d9] space-y-3">
                <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-2">
                  <div>
                    <h3 className="font-semibold text-[#333333] text-xs">مشخصات ورق مصرفی و وضعیت تخصیص انبار</h3>
                    <p className="text-[11px] text-[#666666] mt-0.5">{order.rawMaterialName}</p>
                  </div>
                  {order.materialIssuedVoucherNo ? (
                    <button
                      type="button"
                      onClick={() => { onClose(); traceDocument(order.materialIssuedVoucherNo!, 'INVENTORY_LEDGER'); }}
                      className="sap-doc-link px-2.5 py-1 rounded bg-[#f2f8f4] text-[#107e3e] border border-[#b7dfc7] text-[11px]"
                    >
                      حواله: {order.materialIssuedVoucherNo}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onIssueSheet(order)}
                      className="sap-btn-emphasized px-3 py-1.5 text-[11px] cursor-pointer"
                    >
                      صدور حواله ورق به خط
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-2.5 rounded-lg bg-slate-50">
                    <div className="text-[11px] text-slate-500">وزن واحد قطعه</div>
                    <div className="font-mono font-bold text-slate-900 mt-0.5">
                      {toPersianDigits(order.unitWeightKg)} ک.گ
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50">
                    <div className="text-[11px] text-slate-500">نیاز ناخالص ورق (با پرت)</div>
                    <div className="font-mono font-bold text-slate-900 mt-0.5">
                      {formatNumber(grossRequiredKg)} ک.گ
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50">
                    <div className="text-[11px] text-slate-500">موجودی کلاف در انبار</div>
                    <div className="font-mono font-bold text-emerald-700 mt-0.5">
                      {formatNumber(order.warehouseAvailableKg)} ک.گ
                    </div>
                  </div>
                </div>
              </div>

              {/* BOM Tree Components */}
              <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
                <div className="font-bold text-slate-900">
                  درخت محصول و اقلام مصرفی (BOM) برای تیراژ {formatNumber(order.orderQty)} عدد
                </div>
                <div className="divide-y divide-slate-100">
                  {order.bomSubComponents.map((sub, i) => (
                    <div
                      key={i}
                      className="py-2.5 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-slate-800">{sub.name}</div>
                        <div className="text-[11px] text-slate-400">
                          ایستگاه مصرف: {sub.stage} · ضریب: {toPersianDigits(sub.qtyPerParent)} {sub.unit}
                        </div>
                      </div>
                      <div className="font-mono font-bold text-slate-900 tabular-nums">
                        {formatNumber(sub.qtyPerParent * order.orderQty)} {sub.unit}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* -------------------------------------------------------------- */}
          {/* TAB 2: ROUTING (نمای تایم‌لاین عمودی مراحل OP و وضعیت ایستگاه‌ها) */}
          {/* -------------------------------------------------------------- */}
          {activeTab === 'ROUTING' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#e8e8e8]">
                <div>
                  <h3 className="font-bold text-[#333333] text-xs">
                    تایم‌لاین مسیر تولید (Vertical Routing Timeline)
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#666666] mt-1">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
                      <span>تکمیل‌شده</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#007cc0] ring-2 ring-[#e5f3fa] inline-block" />
                      <span>ایستگاه فعلی</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#cccccc] inline-block" />
                      <span>ایستگاه بعدی</span>
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenAddOp(order)}
                  className="sap-btn-emphasized px-3 py-1.5 text-xs flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>افزودن OP</span>
                </button>
              </div>

              {/* Vertical Timeline Container */}
              <div className="relative pr-1">
                {order.operations.map((op, idx) => {
                  const prevOp = idx > 0 ? order.operations[idx - 1] : null;
                  const isLocked = prevOp !== null && prevOp.completedGood === 0;
                  const isStepDone = op.completedGood >= order.orderQty;
                  const isCurrentActive = idx === currentOpIdx && !isCompleted && !isStepDone;
                  const isLastStep = idx === order.operations.length - 1;
                  const opPct = Math.min(
                    100,
                    Math.round((op.completedGood / Math.max(1, order.orderQty)) * 100)
                  );
                  const availableInBuffer = prevOp
                    ? Math.max(0, prevOp.completedGood - op.completedGood)
                    : Math.max(0, order.orderQty - op.completedGood);

                  return (
                    <div
                      key={op.stepCode + idx}
                      className="relative flex items-stretch gap-4"
                    >
                      {/* Right Timeline Column: Colored Circle Node + Vertical Connector Line */}
                      <div className="flex flex-col items-center shrink-0">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-[11px] font-bold transition-all z-10 ${
                            isStepDone
                              ? 'bg-emerald-600 text-white'
                              : isCurrentActive
                              ? 'bg-[#007cc0] text-white ring-4 ring-[#e5f3fa]'
                              : 'bg-[#f5f5f5] text-[#666666] border border-[#d9d9d9]'
                          }`}
                          title={
                            isStepDone
                              ? 'مرحله تکمیل‌شده'
                              : isCurrentActive
                              ? 'ایستگاه فعال فعلی'
                              : 'ایستگاه بعدی'
                          }
                        >
                          {isStepDone ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <span>{toPersianDigits(idx + 1)}</span>
                          )}
                        </div>

                        {!isLastStep && (
                          <div
                            className={`w-0.5 flex-1 my-1 rounded-full ${
                              isStepDone
                                ? 'bg-emerald-500'
                                : isCurrentActive
                                ? 'bg-[#007cc0]/50'
                                : 'bg-[#d9d9d9]'
                            }`}
                          />
                        )}
                      </div>

                      {/* Left Timeline Card */}
                      <div className={`flex-1 ${isLastStep ? 'pb-1' : 'pb-4'}`}>
                        <div
                          className={`p-3 rounded border transition-all space-y-2 ${
                            isCurrentActive
                              ? 'bg-[#e5f3fa]/50 border-[#b3ddf2]'
                              : isStepDone
                              ? 'bg-emerald-50/30 border-emerald-200'
                              : isLocked
                              ? 'bg-[#f5f5f5] border-[#d9d9d9] opacity-85'
                              : 'bg-[#ffffff] border-[#d9d9d9]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                                    isStepDone
                                      ? 'bg-emerald-600 text-white'
                                      : isCurrentActive
                                      ? 'bg-[#007cc0] text-white'
                                      : 'bg-[#f0f0f0] text-[#333333] border border-[#d9d9d9]'
                                  }`}
                                >
                                  {op.stepCode}
                                </span>
                                <span className="font-bold text-[#333333]">{op.stepName}</span>
                                {isStepDone && (
                                  <span className="text-[10px] font-bold text-emerald-700">
                                    · تکمیل‌شده
                                  </span>
                                )}
                                {isCurrentActive && (
                                  <span className="text-[10px] font-bold text-[#007cc0]">
                                    · ایستگاه فعلی در حال کار
                                  </span>
                                )}
                                {!isStepDone && !isCurrentActive && (
                                  <span className="text-[10px] font-medium text-[#666666]">
                                    · ایستگاه بعدی
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-[#666666] mt-1">
                                {op.hall} · دستگاه:{' '}
                                <strong className="text-[#333333]">{op.machineName}</strong> · قالب:{' '}
                                <span className="font-mono text-[#333333]">{op.dieName}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {isLocked ? (
                                <button
                                  type="button"
                                  onClick={() => onOpenStepLogger(order, idx)}
                                  className="sap-btn-standard px-2.5 py-1 text-[#666666] font-medium flex items-center gap-1 cursor-not-allowed"
                                >
                                  <Lock className="w-3.5 h-3.5" />
                                  <span>قفل ({prevOp?.stepCode})</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onOpenStepLogger(order, idx)}
                                  className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                                    isCurrentActive
                                      ? 'sap-btn-emphasized'
                                      : 'sap-btn-standard'
                                  }`}
                                >
                                  ثبت کارکرد
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => onOpenEditOp(order, idx, op)}
                                className="p-1.5 rounded border border-[#d9d9d9] hover:bg-[#e5f3fa] text-[#666666] hover:text-[#007cc0] cursor-pointer"
                                title="ویرایش ایستگاه"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              {order.operations.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteOp(order.id, idx)}
                                  className="p-1.5 rounded border border-[#d9d9d9] hover:bg-rose-50 text-[#666666] hover:text-rose-600 cursor-pointer"
                                  title="حذف مرحله"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Step Progress Bar & Metrics */}
                          <div className="pt-2 border-t border-[#e8e8e8] space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                              <div className="flex items-center gap-3 font-mono tabular-nums">
                                <span className="text-[#666666]">
                                  آماده در بافر:{' '}
                                  <strong className="text-[#333333]">
                                    {formatNumber(availableInBuffer)}
                                  </strong>
                                </span>
                                <span className="text-emerald-700 font-bold">
                                  تولید سالم: {formatNumber(op.completedGood)} /{' '}
                                  {formatNumber(order.orderQty)}
                                </span>
                                {op.scrapQty > 0 && (
                                  <span className="text-rose-600 font-bold">
                                    ضایعات: {formatNumber(op.scrapQty)}
                                  </span>
                                )}
                              </div>
                              <span className="font-mono font-semibold text-[#666666] tabular-nums">
                                {toPersianDigits(opPct)}٪
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-[#e8e8e8] rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  isStepDone
                                    ? 'bg-emerald-600'
                                    : isCurrentActive
                                    ? 'bg-[#007cc0]'
                                    : 'bg-[#999999]'
                                }`}
                                style={{ width: `${opPct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* -------------------------------------------------------------- */}
          {/* TAB 3: ACTIONS (عملیات: صدور رسید، توقف خط، پیگیری، ضایعات)     */}
          {/* -------------------------------------------------------------- */}
          {activeTab === 'ACTIONS' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Complete Production & Issue Receipt */}
                {!isCompleted ? (
                  <button
                    type="button"
                    onClick={() => onCompleteProduction(order)}
                    className="p-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-right flex items-start justify-between gap-3 transition-colors cursor-pointer shadow-xs"
                  >
                    <div>
                      <div className="font-bold text-sm">اتمام تولید و صدور رسید انبار</div>
                      <div className="text-[11px] text-emerald-100 mt-1">
                        ثبت تحویل محصول نهایی در انبار و انتقال به دستورات تکمیل‌شده
                      </div>
                    </div>
                    <PackageCheck className="w-5 h-5 shrink-0 mt-0.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onDispatchFinishedGoods(order)}
                    className="p-3.5 rounded bg-[#007cc0] hover:bg-[#006299] text-white text-right flex items-start justify-between gap-3 transition-colors cursor-pointer"
                  >
                    <div>
                      <div className="font-bold text-sm">صدور حواله خروج به ساپکو</div>
                      <div className="text-[11px] text-white/85 mt-1">
                        بارگیری و کسر موجودی از انبار محصول نهایی برای مشتری
                      </div>
                    </div>
                    <Truck className="w-5 h-5 shrink-0 mt-0.5" />
                  </button>
                )}

                {/* 2. Line Stop / Resume Action */}
                <button
                  type="button"
                  onClick={() => onToggleLineStop(order)}
                  className={`p-3.5 rounded border text-right flex items-start justify-between gap-3 transition-colors cursor-pointer ${
                    isHalted
                      ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-950'
                      : 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-950'
                  }`}
                >
                  <div>
                    <div className="font-bold text-sm">
                      {isHalted ? 'رفع توقف و راه‌اندازی مجدد خط' : 'اعلام توقف خط (Line Stop)'}
                    </div>
                    <div className="text-[11px] opacity-80 mt-1">
                      {isHalted
                        ? 'بازگرداندن وضعیت دستور تولید به حالت فعال در ایستگاه جاری'
                        : 'تعلیق موقت دستور به علت تعمیرات قالب، کسری ورق یا کنترل کیفیت'}
                    </div>
                  </div>
                  {isHalted ? (
                    <PlayCircle className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                  ) : (
                    <PauseCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  )}
                </button>

                {/* 3. Log Station Output / Scrap */}
                <button
                  type="button"
                  onClick={() => onOpenStepLogger(order, currentOpIdx)}
                  className="p-3.5 rounded bg-[#ffffff] hover:bg-[#e5f3fa]/40 border border-[#d9d9d9] text-right flex items-start justify-between gap-3 transition-colors cursor-pointer"
                >
                  <div>
                    <div className="font-bold text-[#333333] text-sm">
                      ثبت تولید و ضایعات ایستگاه ({currentOp?.stepCode || 'OP10'})
                    </div>
                    <div className="text-[11px] text-[#666666] mt-1">
                      مجموع ضایعات ثبت‌شده تا این لحظه: {formatNumber(totalScrapQty)} عدد
                    </div>
                  </div>
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                </button>

                {/* 4. Issue Raw Material Sheet Voucher */}
                <button
                  type="button"
                  onClick={() => onIssueSheet(order)}
                  className="p-3.5 rounded bg-[#ffffff] hover:bg-[#e5f3fa]/40 border border-[#d9d9d9] text-right flex items-start justify-between gap-3 transition-colors cursor-pointer"
                >
                  <div>
                    <div className="font-bold text-[#333333] text-sm">
                      {order.materialIssuedVoucherNo ? 'صدور مجدد حواله ورق' : 'صدور حواله ورق از انبار'}
                    </div>
                    <div className="text-[11px] text-[#666666] mt-1">
                      کلاف {order.coilNumber} · ذوب {order.heatNumber} ({formatNumber(grossRequiredKg)} ک.گ)
                    </div>
                  </div>
                  <Boxes className="w-5 h-5 text-[#007cc0] shrink-0 mt-0.5" />
                </button>

                {/* 5. Full End-to-End Tracker */}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenTrackModal(order.id);
                  }}
                  className="p-3.5 rounded bg-[#ffffff] hover:bg-[#e5f3fa]/40 border border-[#d9d9d9] text-right flex items-start justify-between gap-3 transition-colors cursor-pointer"
                >
                  <div>
                    <div className="font-bold text-[#333333] text-sm">
                      پنجره جامع پیگیری زنجیره دستور
                    </div>
                    <div className="text-[11px] text-[#666666] mt-1">
                      مشاهده دیاگرام ۳ مرحله‌ای از حواله کلاف تا رسید محصول
                    </div>
                  </div>
                  <Compass className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                </button>

                {/* 6. Edit / Delete Order */}
                <div className="p-3.5 rounded bg-[#f5f5f5] border border-[#d9d9d9] flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenEditOrder(order);
                    }}
                    className="sap-btn-standard flex-1 py-2 px-3 font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>ویرایش دستور (MO)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onDeleteOrder(order);
                    }}
                    className="py-2 px-3 rounded bg-[#ffffff] hover:bg-rose-50 border border-[#d9d9d9] text-rose-600 font-semibold flex items-center justify-center gap-1 cursor-pointer"
                    title="حذف دستور تولید"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف</span>
                  </button>
                </div>
              </div>

              {/* Command & Voucher History Log */}
              <div className="border border-[#d9d9d9] rounded overflow-hidden bg-[#ffffff]">
                <div className="bg-[#f5f5f5] px-4 py-2 border-b border-[#d9d9d9] font-bold text-[#333333] flex items-center gap-1.5">
                  <FileCheck2 className="w-4 h-4 text-[#007cc0]" />
                  <span>کارنامه اسناد و دستورات صادرشده ({toPersianDigits((order.commandLogs || []).length)})</span>
                </div>
                <div className="divide-y divide-[#e8e8e8] max-h-56 overflow-y-auto">
                  {(order.commandLogs || []).length === 0 ? (
                    <div className="p-4 text-center text-[#666666]">
                      هنوز سندی برای این دستور ثبت نشده است.
                    </div>
                  ) : (
                    (order.commandLogs || []).map(log => (
                      <div
                        key={log.id}
                        className="px-4 py-2 flex items-center justify-between gap-2 text-[11px] hover:bg-[#e5f3fa]/30"
                      >
                        <div>
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              traceDocument(log.docNumber, 'INVENTORY_LEDGER');
                            }}
                            className="sap-doc-link font-mono font-bold ml-1.5 cursor-pointer"
                            title="مشاهده و رهگیری این سند در کاردکس انبار"
                          >
                            [{log.docNumber}]
                          </button>
                          <span className="font-semibold text-[#333333]">{log.title}</span>
                          <span className="text-[#666666] mr-1.5">({log.targetStation})</span>
                        </div>
                        <div className="font-mono text-[#666666] shrink-0 tabular-nums">
                          {log.qtyOrWeight} · {log.timestamp}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* -------------------------------------------------------------- */}
          {/* TAB 4: AUDIT TRAIL (تاریخچه تغییرات و لاگ‌های ممیزی دستور کار)   */}
          {/* -------------------------------------------------------------- */}
          {activeTab === 'AUDIT_TRAIL' && (
            <div className="space-y-4">
              <AuditTrailTabContent
                entityId={order.id}
                entityCode={order.orderCode}
              />

              {/* Also display detailed voucher/command logs for this order */}
              <div className="border border-[#d9d9d9] rounded overflow-hidden bg-[#ffffff]">
                <div className="bg-[#f5f5f5] px-4 py-2 border-b border-[#d9d9d9] font-bold text-[#333333] flex items-center gap-1.5">
                  <FileCheck2 className="w-4 h-4 text-[#007cc0]" />
                  <span>اسناد سیستمی و حواله‌های صادرشده این دستور ({toPersianDigits((order.commandLogs || []).length)})</span>
                </div>
                <div className="divide-y divide-[#e8e8e8] max-h-60 overflow-y-auto">
                  {(order.commandLogs || []).map(log => (
                    <div
                      key={log.id}
                      className="px-4 py-2 flex items-center justify-between gap-2 text-[11px] hover:bg-[#e5f3fa]/30"
                    >
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            traceDocument(log.docNumber, 'INVENTORY_LEDGER');
                          }}
                          className="sap-doc-link font-mono font-bold ml-1.5 cursor-pointer"
                          title="مشاهده این سند در کاردکس انبار"
                        >
                          [{log.docNumber}]
                        </button>
                        <span className="font-semibold text-[#333333]">{log.title}</span>
                        <span className="text-[#666666] mr-1.5">({log.targetStation})</span>
                      </div>
                      <div className="font-mono text-[#666666] shrink-0 tabular-nums">
                        {log.qtyOrWeight} · {log.timestamp}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* -------------------------------------------------------------- */}
          {/* TAB 5: WIP & SUB-COMPONENTS INSPECTION                         */}
          {/* -------------------------------------------------------------- */}
          {activeTab === 'WIP_INSPECTION' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded bg-[#e5f3fa] border border-[#b3ddf2] text-[#333333] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-sm flex items-center gap-2 text-[#333333]">
                    <Boxes className="w-4 h-4 text-[#007cc0]" />
                    <span>موجودی بین‌مراحل (WIP) و موازنه قطعات پیش‌ساخته / نیمه‌ساخته</span>
                  </h4>
                  <p className="text-xs text-[#666666] mt-0.5">
                    بررسی تفکیکی موجودی انبار نیمه‌ساخته، بافر بین‌ایستگاهی پای پرس و اتصالات
                  </p>
                </div>
                {onOpenWipInspection && (
                  <button
                    type="button"
                    onClick={() => onOpenWipInspection(order)}
                    className="sap-btn-emphasized px-3.5 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <span>فرم جامع ارزیابی بین‌مراحل</span>
                  </button>
                )}
              </div>

              {/* Sub-Components Matrix Card */}
              <div className="bg-[#ffffff] rounded border border-[#d9d9d9] p-3.5 space-y-3">
                <div className="font-bold text-[#333333] text-xs flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-[#007cc0]" />
                    <span>قطعات پیش‌ساخته تشکیل‌دهنده طبق ساختار محصول (BOM):</span>
                  </span>
                  <span className="text-[11px] text-[#666666] font-mono tabular-nums">
                    تیراژ دستور کار: {formatNumber(order.orderQty)} عدد
                  </span>
                </div>

                <div className="space-y-2.5">
                  <div className="p-3 rounded bg-[#f5f5f5] border border-[#d9d9d9] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-[#333333] text-xs flex items-center gap-1.5 flex-wrap">
                        <span>۱. صفحه براکت اصلی</span>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            traceDocument('WIP-ECU-MAIN-BRK', 'WIP_TRACEABILITY');
                          }}
                          className="sap-doc-link font-mono text-[11px] cursor-pointer"
                          title="رهگیری موجودی بین‌مراحل این قطعه"
                        >
                          (WIP-ECU-MAIN-BRK)
                        </button>
                      </div>
                      <div className="text-[11px] text-[#666666] font-mono mt-0.5">
                        ورق DC01A ضخامت 2mm · ۱۵ مهره جوشی M6
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-mono tabular-nums">
                      <div className="bg-[#ffffff] p-2 rounded border border-[#e8e8e8]">
                        <span className="text-[#666666] block text-[10px]">نیاز بچ</span>
                        <span className="font-bold text-[#333333]">{formatNumber(order.orderQty)}</span>
                      </div>
                      <div className="bg-[#ffffff] p-2 rounded border border-[#e8e8e8]">
                        <span className="text-[#666666] block text-[10px]">موجودی کل</span>
                        <span className="font-bold text-[#007cc0]">{formatNumber(1200 + 1500)}</span>
                      </div>
                      <div className="bg-[#ffffff] p-2 rounded border border-[#e8e8e8]">
                        <span className="text-[#666666] block text-[10px]">وضعیت</span>
                        <span className="font-bold text-emerald-700">تکمیل</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded bg-[#f5f5f5] border border-[#d9d9d9] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-[#333333] text-xs flex items-center gap-1.5 flex-wrap">
                        <span>۲. مکمل براکت ضدسرقت</span>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            traceDocument('WIP-ECU-COMP-BRK', 'WIP_TRACEABILITY');
                          }}
                          className="sap-doc-link font-mono text-[11px] cursor-pointer"
                          title="رهگیری موجودی بین‌مراحل این قطعه"
                        >
                          (WIP-ECU-COMP-BRK)
                        </button>
                      </div>
                      <div className="text-[11px] text-[#666666] font-mono mt-0.5">
                        ورق DC01A ضخامت 2mm · ۲ پیچ جوشی M6x20
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-mono tabular-nums">
                      <div className="bg-[#ffffff] p-2 rounded border border-[#e8e8e8]">
                        <span className="text-[#666666] block text-[10px]">نیاز بچ</span>
                        <span className="font-bold text-[#333333]">{formatNumber(order.orderQty)}</span>
                      </div>
                      <div className="bg-[#ffffff] p-2 rounded border border-[#e8e8e8]">
                        <span className="text-[#666666] block text-[10px]">موجودی کل</span>
                        <span className="font-bold text-[#007cc0]">{formatNumber(900 + 800)}</span>
                      </div>
                      <div className="bg-[#ffffff] p-2 rounded border border-[#e8e8e8]">
                        <span className="text-[#666666] block text-[10px]">وضعیت</span>
                        <span className="font-bold text-emerald-700">تکمیل</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ================================================================ */}
        {/* 3. DRAWER FOOTER                                                 */}
        {/* ================================================================ */}
        <div className="sticky bottom-0 z-20 px-4 py-3 border-t border-[#d9d9d9] bg-[#ffffff] flex items-center justify-between shrink-0 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenStepLogger(order, currentOpIdx)}
              className="sap-btn-emphasized px-3.5 py-1.5 flex items-center gap-1.5 cursor-pointer"
            >
              <Hammer className="w-3.5 h-3.5" />
              <span>ثبت سریع کارکرد ({currentOp?.stepCode || 'OP10'})</span>
            </button>
            {!isCompleted && (
              <button
                type="button"
                onClick={() => onCompleteProduction(order)}
                className="px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <PackageCheck className="w-3.5 h-3.5" />
                <span>اتمام و رسید انبار</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="sap-btn-standard px-4 py-1.5 cursor-pointer"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
};
