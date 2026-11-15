import React, { useState, useEffect } from 'react';
import {
  Scale,
  X,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRightLeft,
  Boxes,
  ShieldCheck,
  RefreshCw,
  FileSpreadsheet,
} from 'lucide-react';
import { MoReconciliationReport } from '../../types/productionWip';
import { formatNumber, formatDateTime } from '../../utils/formatters';
import { useErpRouter } from '../../context/RouterContext';

interface WipReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  moId: string | null;
}

export const WipReconciliationModal: React.FC<WipReconciliationModalProps> = ({
  isOpen,
  onClose,
  moId,
}) => {
  const { traceDocument } = useErpRouter();
  const [report, setReport] = useState<MoReconciliationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchReconciliation = async () => {
    if (!moId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/wip/reconciliation/${moId}`);
      const data = await res.json();
      if (data.success) {
        setReport(data.data);
      } else {
        setErrorMsg(data.error || 'خطا در محاسبه تراز پایستگی');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && moId) {
      fetchReconciliation();
    }
  }, [isOpen, moId]);

  if (!isOpen || !moId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#333333]/40">
      <div className="bg-[#ffffff] border border-[#d9d9d9] rounded-sm max-w-4xl w-full p-5 space-y-4 shadow-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#ebf7ef] text-[#107e3e] border border-[#a9dfbf] rounded-sm">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#333333] flex items-center gap-2 flex-wrap">
                <span>شناسنامه و گواهی موازنه پایستگی قطعات (WIP Reconciliation)</span>
                {report && report.isConserved && (
                  <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold bg-[#ebf7ef] text-[#107e3e] border border-[#a9dfbf]">
                    تراز کامل (Discrepancy = 0)
                  </span>
                )}
              </h3>
              <p className="text-xs text-[#666666] mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span>دستور ساخت:</span>
                {report?.moNumber ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      traceDocument(report.moNumber, 'WIP_TRACEABILITY');
                    }}
                    className="sap-doc-link font-mono font-bold"
                  >
                    {report.moNumber}
                  </button>
                ) : (
                  <strong className="text-[#e9730c] font-mono">{moId}</strong>
                )}
                <span>• قطعه:</span>
                <span className="text-[#333333]">{report?.partName}</span>
                {report?.partCode && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      traceDocument(report.partCode, 'INVENTORY_LEDGER');
                    }}
                    className="sap-doc-link font-mono"
                  >
                    ({report.partCode})
                  </button>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={fetchReconciliation}
              disabled={loading}
              className="sap-btn-standard p-1.5"
              title="محاسبه مجدد"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#007cc0]' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-[#666666] hover:text-[#333333] p-1.5 rounded-sm hover:bg-[#f0f0f0] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {loading ? (
            <div className="py-12 text-center text-xs text-[#666666]">در حال محاسبه دفاتر پایستگی و موازنه فیزیکی قطعات...</div>
          ) : errorMsg ? (
            <div className="p-3 bg-[#ffecec] border border-[#f5b7b1] rounded-sm text-[#bb0000] text-xs">
              {errorMsg}
            </div>
          ) : report ? (
            <>
              {/* Conservation Certificate Banner */}
              <div
                className={`p-3.5 rounded-sm border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                  report.isConserved
                    ? 'bg-[#ebf7ef] border-[#a9dfbf] text-[#107e3e]'
                    : 'bg-[#ffecec] border-[#f5b7b1] text-[#bb0000]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-sm border ${
                      report.isConserved ? 'bg-[#ffffff] border-[#a9dfbf] text-[#107e3e]' : 'bg-[#ffffff] border-[#f5b7b1] text-[#bb0000]'
                    }`}
                  >
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-xs">
                      {report.isConserved
                        ? 'موازنه فیزیکی قطعات کاملاً منطبق است (قانون پایستگی ۱۰۰٪ محقق است)'
                        : 'مغایرت در شمارش دفاتر کار در جریان ساخت کشف شد!'}
                    </div>
                    <div className="text-xs text-[#333333] mt-0.5">
                      ورودی اولیه: <strong>{formatNumber(report.initialInputQuantity)} عدد</strong> | مجموع فیزیکی شناسایی‌شده:{' '}
                      <strong>{formatNumber(report.accountedTotal)} عدد</strong> | مغایرت:{' '}
                      <strong className={report.discrepancy === 0 ? 'text-[#107e3e]' : 'text-[#bb0000] font-bold'}>
                        {formatNumber(report.discrepancy)} عدد
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="text-right sm:text-left text-[11px] text-[#666666] font-mono">
                  زمان موازنه: {formatDateTime(report.auditTimestamp)}
                </div>
              </div>

              {/* 5 Balance Breakdown Micro-Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <div className="bg-[#f7f7f7] p-3 rounded-sm border border-[#d9d9d9]">
                  <span className="text-[10px] text-[#666666] block">ورودی اولیه (Input)</span>
                  <div className="text-base font-bold text-[#333333] font-mono tabular-nums mt-1">
                    {formatNumber(report.initialInputQuantity)}
                  </div>
                  <span className="text-[9px] text-[#666666]">پایه محاسبه تراز</span>
                </div>

                <div className="bg-[#f7f7f7] p-3 rounded-sm border border-[#d9d9d9]">
                  <span className="text-[10px] text-[#666666] block">کار در جریان (WIP جاری)</span>
                  <div className="text-base font-bold text-[#007cc0] font-mono tabular-nums mt-1">
                    {formatNumber(report.totalCurrentWip)}
                  </div>
                  <span className="text-[9px] text-[#666666]">صف + پای‌کار + آماده</span>
                </div>

                <div className="bg-[#f7f7f7] p-3 rounded-sm border border-[#d9d9d9]">
                  <span className="text-[10px] text-[#666666] block">در حال انتقال (In-Transit)</span>
                  <div className="text-base font-bold text-[#e9730c] font-mono tabular-nums mt-1">
                    {formatNumber(report.totalInTransit)}
                  </div>
                  <span className="text-[9px] text-[#666666]">در راه بین‌مراحل</span>
                </div>

                <div className="bg-[#f7f7f7] p-3 rounded-sm border border-[#d9d9d9]">
                  <span className="text-[10px] text-[#666666] block">محصول تکمیل‌شده</span>
                  <div className="text-base font-bold text-[#107e3e] font-mono tabular-nums mt-1">
                    {formatNumber(report.totalCompleted)}
                  </div>
                  <span className="text-[9px] text-[#666666]">خروجی آخرین مرحله</span>
                </div>

                <div className="bg-[#f7f7f7] p-3 rounded-sm border border-[#d9d9d9]">
                  <span className="text-[10px] text-[#666666] block">ضایعات و نامنطبق</span>
                  <div className="text-base font-bold text-[#bb0000] font-mono tabular-nums mt-1">
                    {formatNumber(report.totalScrap + report.totalRework + report.totalRejected)}
                  </div>
                  <span className="text-[9px] text-[#bb0000]">
                    {report.totalScrap} ضایعات | {report.totalRework} دوباره‌کاری
                  </span>
                </div>
              </div>

              {/* Detailed Operations Breakdown Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-[#333333] font-bold">
                  <span>جزئیات پایستگی و توزیع قطعات در مراحل عملیاتی:</span>
                  <span className="text-[#666666] font-normal">
                    {report.operationsBreakdown.length} مرحله عملیاتی
                  </span>
                </div>

                <div className="overflow-x-auto rounded-sm border border-[#d9d9d9]">
                  <table className="sap-table-compact w-full text-right text-xs">
                    <thead>
                      <tr>
                        <th>کد مرحله</th>
                        <th>عنوان عملیات</th>
                        <th className="text-left text-[#e9730c]">در صف ورودی</th>
                        <th className="text-left text-[#007cc0]">پای دستگاه</th>
                        <th className="text-left text-[#107e3e]">آماده انتقال</th>
                        <th className="text-left text-[#333333]">منتقله خروجی</th>
                        <th className="text-left text-[#bb0000]">ضایعات</th>
                        <th className="text-left text-[#e9730c]">دوباره‌کاری</th>
                        <th className="text-left text-[#bb0000]">نامنطبق</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e8e8e8] tabular-nums">
                      {report.operationsBreakdown.map(op => (
                        <tr key={op.stepNumber} className="hover:bg-[#f5f5f5]">
                          <td className="font-mono font-bold text-[#007cc0]">{op.stepCode}</td>
                          <td className="text-[#333333]">{op.stepName}</td>
                          <td className="font-mono text-left font-bold text-[#e9730c]">
                            {op.waitingInput > 0 ? formatNumber(op.waitingInput) : '-'}
                          </td>
                          <td className="font-mono text-left font-bold text-[#007cc0]">
                            {op.inProgress > 0 ? formatNumber(op.inProgress) : '-'}
                          </td>
                          <td className="font-mono text-left font-bold text-[#107e3e]">
                            {op.readyForTransfer > 0 ? formatNumber(op.readyForTransfer) : '-'}
                          </td>
                          <td className="font-mono text-left text-[#333333]">
                            {op.transferredOut > 0 ? formatNumber(op.transferredOut) : '-'}
                          </td>
                          <td className="font-mono text-left text-[#bb0000]">
                            {op.scrap > 0 ? formatNumber(op.scrap) : '-'}
                          </td>
                          <td className="font-mono text-left text-[#e9730c]">
                            {op.rework > 0 ? formatNumber(op.rework) : '-'}
                          </td>
                          <td className="font-mono text-left text-[#bb0000]">
                            {op.rejected > 0 ? formatNumber(op.rejected) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end pt-3 border-t border-[#e8e8e8] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="sap-btn-standard px-4 py-1.5 text-xs"
          >
            بستن پنجره
          </button>
        </div>
      </div>
    </div>
  );
};
