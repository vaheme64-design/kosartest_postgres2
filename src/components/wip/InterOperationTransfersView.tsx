import React, { useState } from 'react';
import {
  ArrowRightLeft,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Truck,
  Building2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { WipTransfer } from '../../types/productionWip';
import {
  formatNumber,
  toPersianDigits,
  formatDateTime,
} from '../../utils/formatters';
import { TableSkeleton } from '../ui/Skeleton';
import { useErpRouter } from '../../context/RouterContext';

interface InterOperationTransfersViewProps {
  transfers: WipTransfer[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onApproveTransfer: (transferId: string, notes?: string) => Promise<{ success: boolean; error?: string }>;
  onRejectTransfer: (transferId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
}

export const InterOperationTransfersView: React.FC<InterOperationTransfersViewProps> = ({
  transfers,
  loading,
  onRefresh,
  onApproveTransfer,
  onRejectTransfer,
}) => {
  const { traceDocument } = useErpRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [rejectingTransferId, setRejectingTransferId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (loading && transfers.length === 0) {
    return <TableSkeleton rows={5} columns={6} theme="light" />;
  }

  const filteredTransfers = transfers.filter(trf => {
    if (statusFilter !== 'ALL' && trf.status !== statusFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchesNum = trf.transferNumber.toLowerCase().includes(q);
      const matchesMo = trf.moNumber.toLowerCase().includes(q);
      const matchesPart = trf.partName.toLowerCase().includes(q) || trf.partCode.toLowerCase().includes(q);
      const matchesFrom = trf.fromStepName.toLowerCase().includes(q);
      const matchesTo = trf.toStepName.toLowerCase().includes(q);
      if (!matchesNum && !matchesMo && !matchesPart && !matchesFrom && !matchesTo) {
        return false;
      }
    }
    return true;
  });

  const handleApprove = async (transferId: string) => {
    setActionLoading(true);
    setErrorMsg(null);
    try {
      const res = await onApproveTransfer(transferId);
      if (!res.success) setErrorMsg(res.error || 'خطا در تأیید حواله');
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در ارتباط با سرور');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingTransferId) return;
    if (!rejectReason.trim()) {
      setErrorMsg('لطفاً دلیل رد محموله را مشخص کنید.');
      return;
    }
    setActionLoading(true);
    setErrorMsg(null);
    try {
      const res = await onRejectTransfer(rejectingTransferId, rejectReason.trim());
      if (res.success) {
        setRejectingTransferId(null);
        setRejectReason('');
      } else {
        setErrorMsg(res.error || 'خطا در رد حواله');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در ارتباط با سرور');
    } finally {
      setActionLoading(false);
    }
  };

  const statusBadges: Record<string, { label: string; color: string }> = {
    PENDING_APPROVAL: { label: 'در حال انتقال (در انتظار تأیید)', color: 'bg-[#fff4e5] text-[#e9730c] border-[#f5cba7]' },
    APPROVED: { label: 'تحویل‌گرفته‌شده (قطعی)', color: 'bg-[#ebf5ec] text-[#107e3e] border-[#b7dfbf]' },
    REJECTED: { label: 'ردشده و عودت به مبدأ', color: 'bg-[#ffecec] text-[#bb0000] border-[#f5b7b1]' },
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="sap-card p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-[#333333] flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-[#007cc0]" />
            حواله‌های انتقال و ردیابی بین‌مراحل (WIP In-Transit & Receipts)
          </h2>
          <p className="text-xs text-[#666666] mt-1">
            ردیابی دقیق محموله‌های در حال جابجایی بین سالن‌ها و ایستگاه‌های پرس، جوشکاری، رنگ و مونتاژ
          </p>
        </div>

        <div className="text-xs text-[#666666]">
          کل حواله‌ها: <strong className="text-[#333333] font-mono tabular-nums">{toPersianDigits(transfers.length)}</strong> |{' '}
          در انتظار تأیید:{' '}
          <strong className="text-[#e9730c] font-mono tabular-nums">
            {toPersianDigits(transfers.filter(t => t.status === 'PENDING_APPROVAL').length)}
          </strong>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-[#ffecec] border border-[#f5b7b1] rounded-sm text-xs text-[#bb0000] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="sap-card p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative min-w-[240px] flex-1">
            <Search className="w-4 h-4 text-[#666666] absolute right-3 top-2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="جستجوی شماره حواله، دستور کار، نام قطعه یا مرحله..."
              className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm pr-9 pl-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
          >
            <option value="ALL">همه وضعیت‌ها</option>
            <option value="PENDING_APPROVAL">در انتظار تحویل در مقصد (Pending)</option>
            <option value="APPROVED">تحویل قطعی شده (Approved)</option>
            <option value="REJECTED">ردشده (Rejected)</option>
          </select>
        </div>
      </div>

      {/* Transfers Table */}
      <div className="sap-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="sap-table-compact w-full text-right text-xs">
            <thead>
              <tr className="bg-[#f5f5f5] border-b border-[#d9d9d9] text-[#666666] font-semibold select-none">
                <th>شماره حواله</th>
                <th>دستور ساخت (MO)</th>
                <th>قطعه</th>
                <th>ایستگاه مبدأ</th>
                <th>ایستگاه یا انبار مقصد</th>
                <th className="text-left">تعداد (PCS)</th>
                <th>وضعیت</th>
                <th>زمان ارسال</th>
                <th className="text-center">عملیات تحویل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e8e8]">
              {filteredTransfers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#666666]">
                    هیچ حواله‌ای یافت نشد.
                  </td>
                </tr>
              ) : (
                filteredTransfers.map(trf => {
                  const statusInfo = statusBadges[trf.status] || { label: trf.status, color: 'bg-[#f5f5f5] text-[#333333] border-[#d9d9d9]' };
                  const isPending = trf.status === 'PENDING_APPROVAL';

                  return (
                    <tr key={trf.id} className="hover:bg-[#f5f5f5] transition-colors">
                      <td className="font-mono font-bold">
                        <button
                          type="button"
                          onClick={() => traceDocument(trf.transferNumber, 'WIP_TRACEABILITY')}
                          className="sap-doc-link font-mono"
                        >
                          {trf.transferNumber}
                        </button>
                      </td>
                      <td className="font-mono">
                        <button
                          type="button"
                          onClick={() => traceDocument(trf.moNumber, 'WIP_TRACEABILITY')}
                          className="sap-doc-link font-mono"
                        >
                          {trf.moNumber}
                        </button>
                      </td>
                      <td>
                        <div className="font-medium text-[#333333]">{trf.partName}</div>
                        <button
                          type="button"
                          onClick={() => traceDocument(trf.partCode, 'INVENTORY_LEDGER')}
                          className="sap-doc-link font-mono text-[11px]"
                        >
                          {trf.partCode}
                        </button>
                      </td>
                      <td>
                        <div className="text-[#333333]">{trf.fromStepName}</div>
                        <div className="font-mono text-[10px] text-[#666666]">{trf.fromLocation}</div>
                      </td>
                      <td>
                        <div className="text-[#333333]">{trf.toStepName}</div>
                        <div className="font-mono text-[10px] text-[#666666]">{trf.toLocation}</div>
                      </td>
                      <td className="font-mono font-bold text-left text-[#333333] text-sm tabular-nums">
                        {formatNumber(trf.quantity)}
                      </td>
                      <td>
                        <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold border ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="text-[#666666] font-mono text-[11px] tabular-nums">
                        {formatDateTime(trf.dispatchedAt)}
                      </td>
                      <td className="text-center">
                        {isPending ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleApprove(trf.id)}
                              disabled={actionLoading}
                              className="px-2.5 py-1 bg-[#107e3e] hover:bg-[#0c6330] text-white rounded-sm text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50"
                              title="تأیید رسید و افزودن به صف ورودی مقصد"
                            >
                              تأیید تحویل
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingTransferId(trf.id);
                                setRejectReason('');
                              }}
                              disabled={actionLoading}
                              className="px-2 py-1 bg-[#ffecec] hover:bg-[#fbd5d5] text-[#bb0000] border border-[#f5b7b1] rounded-sm text-[11px] font-medium transition-all cursor-pointer disabled:opacity-50"
                              title="رد محموله و بازگشت به مبدأ"
                            >
                              رد
                            </button>
                          </div>
                        ) : trf.status === 'APPROVED' ? (
                          <div className="text-[11px] text-[#107e3e] font-medium">
                            تحویل توسط {trf.receivedBy || 'سرپرست ایستگاه'}
                          </div>
                        ) : (
                          <div className="text-[11px] text-[#bb0000] font-medium" title={trf.rejectionReason}>
                            علت رد: {trf.rejectionReason || 'عدم انطباق'}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject Confirmation Dialog */}
      {rejectingTransferId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#333333]/40">
          <div className="bg-[#ffffff] border border-[#d9d9d9] rounded-sm max-w-md w-full p-5 space-y-3.5 shadow-md">
            <div className="flex items-center gap-2.5 border-b border-[#e8e8e8] pb-2.5">
              <div className="p-2 bg-[#ffecec] text-[#bb0000] border border-[#f5b7b1] rounded-sm">
                <XCircle className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-[#333333]">رد محموله و عودت به مرحله مبدأ</h3>
            </div>

            <p className="text-xs text-[#666666] leading-relaxed">
              با رد این حواله، قطعات مجدداً در وضعیت «آماده انتقال» مرحله مبدأ قرار گرفته و به موجودی ایستگاه قبل بازگردانده می‌شوند.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#333333]">
                علت رد محموله <span className="text-[#bb0000]">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="مثال: مغایرت در تعداد شمارش، پلیسه روی لبه، عدم تطابق پالت..."
                rows={3}
                className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm p-2 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e8e8e8]">
              <button
                type="button"
                onClick={() => setRejectingTransferId(null)}
                className="sap-btn-standard px-3.5 py-1.5 text-xs"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={actionLoading || !rejectReason.trim()}
                className="px-3.5 py-1.5 bg-[#bb0000] hover:bg-[#990000] text-white rounded-sm text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              >
                تأیید رد و عودت
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
