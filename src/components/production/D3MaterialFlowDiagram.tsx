import React, { useEffect, useState, useCallback } from 'react';
import {
  GitBranch,
  RefreshCw,
  Lock,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  Boxes,
  ArrowLeft,
} from 'lucide-react';
import { formatNumber, toPersianDigits } from '../../utils/formatters';

interface OpFlowNode {
  success: boolean;
  currentOperation: {
    id: string;
    opNumber: number;
    opCode: string;
    opName: string;
    workCenterCode: string;
    workCenterName: string;
    setupTimeMin: number;
    cycleTimeSec: number;
  };
  previousOperation: {
    id: string;
    opNumber: number;
    opCode: string;
    opName: string;
    workCenterCode: string;
  } | null;
  previousOpApprovedGoodQuantity: number;
  currentOpConsumedQuantity: number;
  currentOpGoodQuantity: number;
  currentOpScrapQuantity: number;
  wipBufferAvailable: number;
  isFirstOperation: boolean;
  isPrecedenceLocked: boolean;
  lockReason: string | null;
  errorMessage?: string;
}

interface WorkOrderFlowData {
  id: string;
  orderNumber: string;
  plannedQuantity: number;
  completedQuantity: number;
  scrapQuantity: number;
  status: string;
  itemCode: string;
  itemName: string;
  carModel: string;
}

interface MrpRequirementItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  itemType: string;
  unit: string;
  level: number;
  quantityPerParent: number;
  grossRequirement: number;
  scrapAllowancePercent: number;
  effectiveGrossRequirement: number;
  parentItemCode?: string;
}

export const D3MaterialFlowDiagram: React.FC = () => {
  const [workOrders, setWorkOrders] = useState<Array<{ id: string; orderNumber: string; item: { name: string; code: string } }>>([]);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string>('WO-1404-1001');
  const [flowData, setFlowData] = useState<WorkOrderFlowData | null>(null);
  const [opsFlow, setOpsFlow] = useState<OpFlowNode[]>([]);
  const [mrpItems, setMrpItems] = useState<MrpRequirementItem[]>([]);
  const [selectedOp, setSelectedOp] = useState<OpFlowNode | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [logGoodQty, setLogGoodQty] = useState<number>(200);
  const [logScrapQty, setLogScrapQty] = useState<number>(2);
  const [submittingLog, setSubmittingLog] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadWorkOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/erp-services/work-orders');
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        setWorkOrders(json.data);
      }
    } catch (e) {
      console.warn('Failed to load work orders list:', e);
    }
  }, []);

  const loadFlowAndMrp = useCallback(async (orderNo: string) => {
    if (!orderNo) return;
    setLoading(true);
    setError(null);
    try {
      const [flowRes, mrpRes] = await Promise.all([
        fetch(`/api/erp-services/wip-flow/${encodeURIComponent(orderNo)}`).then(r => r.json()),
        fetch(`/api/erp-services/mrp/${encodeURIComponent(orderNo)}`).then(r => r.json()),
      ]);

      if (!flowRes.success) {
        throw new Error(flowRes.error || 'خطا در دریافت جریان مواد دستور کار');
      }

      setFlowData(flowRes.workOrder);
      const operations: OpFlowNode[] = flowRes.operationsFlow || [];
      setOpsFlow(operations);
      if (operations.length > 0) {
        setSelectedOp(prev => {
          if (!prev) return operations[0];
          const match = operations.find(o => o.currentOperation.id === prev.currentOperation.id);
          return match || operations[0];
        });
      }

      if (mrpRes.success && Array.isArray(mrpRes.requirements)) {
        setMrpItems(mrpRes.requirements);
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'خطا در واکشی گراف جریان مواد');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkOrders();
  }, [loadWorkOrders]);

  useEffect(() => {
    loadFlowAndMrp(selectedOrderNumber);
  }, [selectedOrderNumber, loadFlowAndMrp]);

  const handleRegisterLiveLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOp || !flowData) return;

    setSubmittingLog(true);
    setActionFeedback(null);
    try {
      const res = await fetch('/api/erp-services/wip-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workOrderId: flowData.orderNumber,
          operationId: selectedOp.currentOperation.id,
          goodQuantity: logGoodQty,
          scrapQuantity: logScrapQty,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setActionFeedback({
          type: 'error',
          text: json.error || 'خطا در ثبت کارکرد مرحله',
        });
      } else {
        setActionFeedback({
          type: 'success',
          text: json.message || 'کارکرد ثبت شد و جریان مواد به‌روزرسانی گردید.',
        });
        await loadFlowAndMrp(selectedOrderNumber);
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'خطای ارتباط با سرور',
      });
    } finally {
      setSubmittingLog(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4" dir="rtl">
      {/* Compact Header & Order Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <GitBranch className="w-4 h-4 text-slate-700 shrink-0" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              جریان ایستگاهی مواد و موجودی پای خط (WIP)
            </h3>
            <p className="text-[11px] text-slate-500">
              روی هر ایستگاه کلیک کنید تا جزئیات ورودی، خروجی و ثبت کارکرد آن نمایش داده شود
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <label className="font-semibold text-slate-600 whitespace-nowrap">دستور کار:</label>
          <select
            value={selectedOrderNumber}
            onChange={e => {
              setSelectedOrderNumber(e.target.value);
              setActionFeedback(null);
            }}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-slate-400 cursor-pointer"
          >
            {workOrders.length > 0 ? (
              workOrders.map(wo => (
                <option key={wo.id} value={wo.orderNumber}>
                  {wo.orderNumber} — {wo.item?.name}
                </option>
              ))
            ) : (
              <>
                <option value="WO-1404-1001">WO-1404-1001 — مجموعه براکت ضدسرقت رایانه موتور (ECU)</option>
                <option value="WO-1404-1002">WO-1404-1002 — مجموعه تقویتی ستون وسط (B-Pillar) تارا</option>
              </>
            )}
          </select>

          <button
            type="button"
            onClick={() => loadFlowAndMrp(selectedOrderNumber)}
            className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 transition cursor-pointer"
            title="بروزرسانی"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Clean, Zero-Overlap Horizontal Station Flow Pipeline */}
      <div className="overflow-x-auto pb-1">
        <div className="flex items-stretch gap-2 min-w-[760px]">
          {opsFlow.map((node, idx) => {
            const isSelected = selectedOp?.currentOperation.id === node.currentOperation.id;
            const isLocked = node.isPrecedenceLocked;
            const planned = flowData?.plannedQuantity || 1;
            const pct = Math.min(100, Math.round((node.currentOpGoodQuantity / Math.max(1, planned)) * 100));

            return (
              <React.Fragment key={node.currentOperation.id}>
                {/* Station Card */}
                <button
                  type="button"
                  onClick={() => setSelectedOp(node)}
                  className={`flex-1 min-w-[180px] text-right rounded-lg border p-3 transition-all flex flex-col justify-between gap-2.5 cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : isLocked
                      ? 'bg-rose-50/40 border-rose-200 hover:border-rose-300 text-slate-900'
                      : 'bg-white border-slate-200 hover:border-slate-300 text-slate-900'
                  }`}
                >
                  <div className="space-y-1 w-full">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-mono text-xs font-bold ${
                          isSelected ? 'text-amber-400' : 'text-slate-900'
                        }`}
                      >
                        {node.currentOperation.opCode}
                      </span>
                      <span
                        className={`text-[10px] font-mono ${
                          isSelected ? 'text-slate-300' : 'text-slate-400'
                        }`}
                      >
                        {node.currentOperation.workCenterCode}
                      </span>
                    </div>
                    <div
                      className={`text-xs font-bold leading-snug line-clamp-1 ${
                        isSelected ? 'text-white' : 'text-slate-800'
                      }`}
                      title={node.currentOperation.opName}
                    >
                      {node.currentOperation.opName}
                    </div>
                  </div>

                  <div className="space-y-1.5 w-full pt-2 border-t border-slate-200/20 text-[11px] tabular-nums">
                    <div className="flex items-center justify-between">
                      <span className={isSelected ? 'text-slate-300' : 'text-slate-500'}>بافر ورودی:</span>
                      <strong className={`font-mono ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                        {formatNumber(node.wipBufferAvailable)} عدد
                      </strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={isSelected ? 'text-slate-300' : 'text-slate-500'}>تولید سالم:</span>
                      <strong
                        className={`font-mono ${
                          isSelected ? 'text-emerald-400' : 'text-emerald-700'
                        }`}
                      >
                        {formatNumber(node.currentOpGoodQuantity)} عدد
                      </strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={isSelected ? 'text-slate-300' : 'text-slate-500'}>ضایعات:</span>
                      <span
                        className={`font-mono ${
                          node.currentOpScrapQuantity > 0
                            ? isSelected
                              ? 'text-rose-300'
                              : 'text-rose-600 font-semibold'
                            : isSelected
                            ? 'text-slate-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {formatNumber(node.currentOpScrapQuantity)} عدد
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="pt-1">
                      <div
                        className={`w-full h-1.5 rounded-full overflow-hidden ${
                          isSelected ? 'bg-slate-700' : 'bg-slate-100'
                        }`}
                      >
                        <div
                          className={`h-full rounded-full ${
                            isLocked ? 'bg-rose-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </button>

                {/* Inter-Stage Connector */}
                {idx < opsFlow.length - 1 && (
                  <div className="flex flex-col items-center justify-center px-1 shrink-0 text-center">
                    <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap mb-0.5">
                      {formatNumber(opsFlow[idx + 1].wipBufferAvailable)} عدد
                    </span>
                    <ArrowLeft
                      className={`w-4 h-4 ${
                        opsFlow[idx + 1].isPrecedenceLocked ? 'text-rose-400' : 'text-emerald-600'
                      }`}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Selected Operation Inspection & BOM Requirements */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1">
        {/* Right 6 cols: Selected OP Details & Live Production Log Input */}
        {selectedOp && (
          <div className="lg:col-span-6 p-4 rounded-lg border border-slate-200 bg-slate-50/40 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-slate-900">
                  {selectedOp.currentOperation.opCode}
                </span>
                <span className="text-slate-300">·</span>
                <span className="font-bold text-slate-900">{selectedOp.currentOperation.opName}</span>
              </div>
              {selectedOp.isPrecedenceLocked ? (
                <span className="text-rose-700 font-semibold text-[11px] flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>قفل تقدم</span>
                </span>
              ) : (
                <span className="text-emerald-700 font-semibold text-[11px] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>آماده تولید</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2.5 font-mono tabular-nums">
              <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 font-sans block">خروجی مرحله قبل:</span>
                <strong className="text-slate-900 text-sm">
                  {formatNumber(selectedOp.previousOpApprovedGoodQuantity)} عدد
                </strong>
              </div>
              <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 font-sans block">مصرف این مرحله:</span>
                <strong className="text-slate-900 text-sm">
                  {formatNumber(selectedOp.currentOpConsumedQuantity)} عدد
                </strong>
              </div>
              <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 font-sans block">موجودی پای خط:</span>
                <strong
                  className={`text-sm ${
                    selectedOp.isPrecedenceLocked ? 'text-rose-600' : 'text-emerald-700'
                  }`}
                >
                  {formatNumber(selectedOp.wipBufferAvailable)} عدد
                </strong>
              </div>
            </div>

            {selectedOp.isPrecedenceLocked && selectedOp.lockReason && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                <span>{selectedOp.lockReason}</span>
              </div>
            )}

            {/* Quick Live Production Log Form */}
            <form onSubmit={handleRegisterLiveLog} className="pt-2 border-t border-slate-200/80 space-y-2">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <PlusCircle className="w-3.5 h-3.5 text-slate-600" />
                <span>ثبت کارکرد مرحله {selectedOp.currentOperation.opCode}:</span>
              </div>
              <div className="grid grid-cols-3 gap-2 items-end">
                <div>
                  <label className="block text-[10px] text-slate-600 mb-1">تعداد سالم</label>
                  <input
                    type="number"
                    min={1}
                    value={logGoodQty}
                    onChange={e => setLogGoodQty(Number(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-600 mb-1">تعداد ضایعات</label>
                  <input
                    type="number"
                    min={0}
                    value={logScrapQty}
                    onChange={e => setLogScrapQty(Number(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-rose-700"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingLog}
                  className="py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold transition cursor-pointer disabled:opacity-50"
                >
                  {submittingLog ? 'در حال ثبت...' : 'ثبت کارکرد'}
                </button>
              </div>
              {actionFeedback && (
                <div
                  className={`p-2 rounded-lg text-[11px] font-semibold ${
                    actionFeedback.type === 'error'
                      ? 'bg-rose-50 text-rose-800 border border-rose-200'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  }`}
                >
                  {actionFeedback.text}
                </div>
              )}
            </form>
          </div>
        )}

        {/* Left 6 cols: Recursive BOM Explosion Output */}
        <div className="lg:col-span-6 p-4 rounded-lg border border-slate-200 bg-slate-50/40 space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <div className="flex items-center gap-1.5 font-bold text-slate-900">
              <Boxes className="w-4 h-4 text-slate-600" />
              <span>مواد و اجزای مورد نیاز دستور کار (BOM)</span>
            </div>
            {flowData && (
              <span className="font-mono text-[11px] text-slate-600">
                تیراژ: <strong>{formatNumber(flowData.plannedQuantity)}</strong> عدد
              </span>
            )}
          </div>

          {mrpItems.length === 0 ? (
            <div className="text-slate-500 py-4 text-center">در حال بارگذاری درخت مواد...</div>
          ) : (
            <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
              <table className="w-full text-right border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <th className="py-2 px-2.5">سطح</th>
                    <th className="py-2 px-2.5">قطعه / ماده اولیه</th>
                    <th className="py-2 px-2.5">نوع</th>
                    <th className="py-2 px-2.5">ضریب</th>
                    <th className="py-2 px-2.5">نیاز کل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {mrpItems.map((item, idx) => (
                    <tr key={`${item.itemId}-${idx}`} className="hover:bg-slate-50">
                      <td className="py-2 px-2.5 font-mono text-slate-600 whitespace-nowrap">
                        سطح {toPersianDigits(item.level)}
                      </td>
                      <td className="py-2 px-2.5">
                        <div className="font-bold text-slate-900">{item.itemName}</div>
                        <div className="font-mono text-[10px] text-slate-400">{item.itemCode}</div>
                      </td>
                      <td className="py-2 px-2.5 text-slate-600 whitespace-nowrap">
                        {item.itemType === 'RAW_MATERIAL' ? 'ماده اولیه' : 'نیمه‌ساخته'}
                      </td>
                      <td className="py-2 px-2.5 font-mono font-semibold text-slate-800">
                        {item.quantityPerParent}
                      </td>
                      <td className="py-2 px-2.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {formatNumber(item.effectiveGrossRequirement)} {item.unit === 'KG' ? 'kg' : 'عدد'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
