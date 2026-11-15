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
import { useErpRouter } from '../../context/RouterContext';

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
  const { traceDocument } = useErpRouter();
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
    <div className="sap-card p-3.5 space-y-3.5" dir="rtl">
      {/* Compact Header & Order Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8e8e8] pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-[#e5f3fa] border border-[#b3ddf2] text-[#007cc0] flex items-center justify-center shrink-0">
            <GitBranch className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#333333]">
              جریان ایستگاهی مواد و موجودی پای خط (WIP)
            </h3>
            <p className="text-[11px] text-[#666666]">
              روی هر ایستگاه کلیک کنید تا جزئیات ورودی، خروجی و ثبت کارکرد آن نمایش داده شود
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <label className="font-semibold text-[#666666] whitespace-nowrap">دستور کار:</label>
          <select
            value={selectedOrderNumber}
            onChange={e => {
              setSelectedOrderNumber(e.target.value);
              setActionFeedback(null);
            }}
            className="bg-[#ffffff] border border-[#bfbfbf] rounded px-2.5 py-1 text-xs font-semibold text-[#333333] focus:outline-none focus:border-[#007cc0] cursor-pointer"
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

          {flowData && (
            <button
              type="button"
              onClick={() => traceDocument(flowData.orderNumber, 'WIP_TRACEABILITY')}
              className="sap-doc-link text-[11px] font-mono px-2 py-1 rounded border border-[#d9d9d9] bg-[#ffffff] hover:bg-[#e5f3fa] cursor-pointer whitespace-nowrap"
              title="رهگیری کامل سند دستور کار"
            >
              رهگیری {flowData.orderNumber}
            </button>
          )}

          <button
            type="button"
            onClick={() => loadFlowAndMrp(selectedOrderNumber)}
            className="sap-btn-standard p-1.5 cursor-pointer"
            title="بروزرسانی"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#007cc0]' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-2.5 rounded bg-[#ffecec] border border-[#f5b7b1] text-[#bb0000] text-xs flex items-center gap-2">
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
                  className={`flex-1 min-w-[180px] text-right rounded border p-2.5 transition-all flex flex-col justify-between gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-[#e5f3fa] text-[#333333] border-[#007cc0] ring-1 ring-[#007cc0]'
                      : isLocked
                      ? 'bg-[#ffecec] border-[#f5b7b1] hover:border-[#bb0000] text-[#333333]'
                      : 'bg-[#ffffff] border-[#d9d9d9] hover:border-[#007cc0] text-[#333333]'
                  }`}
                >
                  <div className="space-y-1 w-full">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-mono text-xs font-semibold px-1.5 py-0.5 rounded ${
                          isSelected ? 'bg-[#007cc0] text-[#ffffff]' : 'bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2]'
                        }`}
                      >
                        {node.currentOperation.opCode}
                      </span>
                      <span className="text-[10px] font-mono text-[#666666]">
                        {node.currentOperation.workCenterCode}
                      </span>
                    </div>
                    <div
                      className="text-xs font-semibold leading-snug line-clamp-1 text-[#333333]"
                      title={node.currentOperation.opName}
                    >
                      {node.currentOperation.opName}
                    </div>
                  </div>

                  <div className="space-y-1 w-full pt-1.5 border-t border-[#e8e8e8] text-[11px] tabular-nums">
                    <div className="flex items-center justify-between">
                      <span className="text-[#666666]">بافر ورودی:</span>
                      <strong className="font-mono text-[#333333]">
                        {formatNumber(node.wipBufferAvailable)} عدد
                      </strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#666666]">تولید سالم:</span>
                      <strong className="font-mono text-[#107e3e]">
                        {formatNumber(node.currentOpGoodQuantity)} عدد
                      </strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#666666]">ضایعات:</span>
                      <span
                        className={`font-mono ${
                          node.currentOpScrapQuantity > 0
                            ? 'text-[#bb0000] font-semibold'
                            : 'text-[#888888]'
                        }`}
                      >
                        {formatNumber(node.currentOpScrapQuantity)} عدد
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="pt-1">
                      <div className="w-full h-1.5 rounded-full overflow-hidden bg-[#e8e8e8]">
                        <div
                          className={`h-full rounded-full ${
                            isLocked ? 'bg-[#bb0000]' : 'bg-[#007cc0]'
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
                    <span className="text-[10px] font-mono text-[#666666] whitespace-nowrap mb-0.5 tabular-nums">
                      {formatNumber(opsFlow[idx + 1].wipBufferAvailable)} عدد
                    </span>
                    <ArrowLeft
                      className={`w-4 h-4 ${
                        opsFlow[idx + 1].isPrecedenceLocked ? 'text-[#bb0000]' : 'text-[#107e3e]'
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-1">
        {/* Right 6 cols: Selected OP Details & Live Production Log Input */}
        {selectedOp && (
          <div className="lg:col-span-6 p-3 rounded border border-[#d9d9d9] bg-[#f7f7f7] space-y-2.5 text-xs">
            <div className="flex items-center justify-between border-b border-[#d9d9d9] pb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-[#007cc0]">
                  {selectedOp.currentOperation.opCode}
                </span>
                <span className="text-[#bfbfbf]">·</span>
                <span className="font-semibold text-[#333333]">{selectedOp.currentOperation.opName}</span>
              </div>
              {selectedOp.isPrecedenceLocked ? (
                <span className="text-[#bb0000] font-semibold text-[11px] flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>قفل تقدم</span>
                </span>
              ) : (
                <span className="text-[#107e3e] font-semibold text-[11px] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>آماده تولید</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 font-mono tabular-nums">
              <div className="p-2 bg-[#ffffff] rounded border border-[#d9d9d9]">
                <span className="text-[10px] text-[#666666] font-sans block">خروجی مرحله قبل:</span>
                <strong className="text-[#333333] text-sm">
                  {formatNumber(selectedOp.previousOpApprovedGoodQuantity)} عدد
                </strong>
              </div>
              <div className="p-2 bg-[#ffffff] rounded border border-[#d9d9d9]">
                <span className="text-[10px] text-[#666666] font-sans block">مصرف این مرحله:</span>
                <strong className="text-[#333333] text-sm">
                  {formatNumber(selectedOp.currentOpConsumedQuantity)} عدد
                </strong>
              </div>
              <div className="p-2 bg-[#ffffff] rounded border border-[#d9d9d9]">
                <span className="text-[10px] text-[#666666] font-sans block">موجودی پای خط:</span>
                <strong
                  className={`text-sm ${
                    selectedOp.isPrecedenceLocked ? 'text-[#bb0000]' : 'text-[#107e3e]'
                  }`}
                >
                  {formatNumber(selectedOp.wipBufferAvailable)} عدد
                </strong>
              </div>
            </div>

            {selectedOp.isPrecedenceLocked && selectedOp.lockReason && (
              <div className="p-2 rounded bg-[#ffecec] border border-[#f5b7b1] text-[#bb0000] text-[11px] flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 shrink-0 text-[#bb0000]" />
                <span>{selectedOp.lockReason}</span>
              </div>
            )}

            {/* Quick Live Production Log Form */}
            <form onSubmit={handleRegisterLiveLog} className="pt-2 border-t border-[#d9d9d9] space-y-2">
              <div className="font-semibold text-[#333333] flex items-center gap-1.5">
                <PlusCircle className="w-3.5 h-3.5 text-[#007cc0]" />
                <span>ثبت کارکرد مرحله {selectedOp.currentOperation.opCode}:</span>
              </div>
              <div className="grid grid-cols-3 gap-2 items-end">
                <div>
                  <label className="block text-[10px] text-[#666666] mb-1">تعداد سالم</label>
                  <input
                    type="number"
                    min={1}
                    value={logGoodQty}
                    onChange={e => setLogGoodQty(Number(e.target.value) || 0)}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded px-2.5 py-1 font-mono font-semibold text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#666666] mb-1">تعداد ضایعات</label>
                  <input
                    type="number"
                    min={0}
                    value={logScrapQty}
                    onChange={e => setLogScrapQty(Number(e.target.value) || 0)}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded px-2.5 py-1 font-mono font-semibold text-[#bb0000] focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingLog}
                  className="sap-btn-emphasized py-1 px-3 text-xs disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  {submittingLog ? 'در حال ثبت...' : 'ثبت کارکرد'}
                </button>
              </div>
              {actionFeedback && (
                <div
                  className={`p-2 rounded text-[11px] font-semibold ${
                    actionFeedback.type === 'error'
                      ? 'bg-[#ffecec] text-[#bb0000] border border-[#f5b7b1]'
                      : 'bg-[#ebf5ec] text-[#107e3e] border border-[#b7dfbf]'
                  }`}
                >
                  {actionFeedback.text}
                </div>
              )}
            </form>
          </div>
        )}

        {/* Left 6 cols: Recursive BOM Explosion Output */}
        <div className="lg:col-span-6 p-3 rounded border border-[#d9d9d9] bg-[#f7f7f7] space-y-2.5 text-xs">
          <div className="flex items-center justify-between border-b border-[#d9d9d9] pb-2">
            <div className="flex items-center gap-1.5 font-semibold text-[#333333]">
              <Boxes className="w-4 h-4 text-[#007cc0]" />
              <span>مواد و اجزای مورد نیاز دستور کار (BOM)</span>
            </div>
            {flowData && (
              <span className="font-mono text-[11px] text-[#666666] tabular-nums">
                تیراژ: <strong className="text-[#333333]">{formatNumber(flowData.plannedQuantity)}</strong> عدد
              </span>
            )}
          </div>

          {mrpItems.length === 0 ? (
            <div className="text-[#666666] py-4 text-center">در حال بارگذاری درخت مواد...</div>
          ) : (
            <div className="overflow-x-auto bg-[#ffffff] rounded border border-[#d9d9d9]">
              <table className="sap-table-compact w-full text-right border-collapse">
                <thead>
                  <tr>
                    <th className="py-1.5 px-2.5">سطح</th>
                    <th className="py-1.5 px-2.5">قطعه / ماده اولیه</th>
                    <th className="py-1.5 px-2.5">نوع</th>
                    <th className="py-1.5 px-2.5">ضریب</th>
                    <th className="py-1.5 px-2.5">نیاز کل</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {mrpItems.map((item, idx) => (
                    <tr key={`${item.itemId}-${idx}`} className="hover:bg-[#e5f3fa]">
                      <td className="py-1.5 px-2.5 font-mono text-[#666666] whitespace-nowrap">
                        سطح {toPersianDigits(item.level)}
                      </td>
                      <td className="py-1.5 px-2.5">
                        <div className="font-semibold text-[#333333]">{item.itemName}</div>
                        <button
                          type="button"
                          onClick={() =>
                            traceDocument(
                              item.itemCode,
                              item.itemType === 'RAW_MATERIAL' ? 'INVENTORY_LEDGER' : 'WIP_TRACEABILITY'
                            )
                          }
                          className="sap-doc-link font-mono text-[10px] cursor-pointer"
                        >
                          {item.itemCode}
                        </button>
                      </td>
                      <td className="py-1.5 px-2.5 text-[#666666] whitespace-nowrap">
                        {item.itemType === 'RAW_MATERIAL' ? 'ماده اولیه' : 'نیمه‌ساخته'}
                      </td>
                      <td className="py-1.5 px-2.5 font-mono font-semibold text-[#333333]">
                        {item.quantityPerParent}
                      </td>
                      <td className="py-1.5 px-2.5 font-mono font-semibold text-[#333333] whitespace-nowrap">
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
