import React, { useState, useMemo } from 'react';
import {
  History,
  Search,
  Download,
  Filter,
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  AlertOctagon,
  FileText,
  User,
  Clock,
  ShieldCheck,
  X,
  AlertTriangle,
} from 'lucide-react';
import { InventoryTransaction, VoucherType, VoucherStatus, FACTORY_STAGES } from '../types/inventory';
import {
  formatNumber,
  formatWeightKg,
  toPersianDigits,
  formatDateTime,
  getVoucherTypeLabel,
  exportToCsv,
} from '../utils/formatters';
import { useErpRouter } from '../context/RouterContext';

interface AuditLedgerViewProps {
  transactions: InventoryTransaction[];
  onRefresh: () => Promise<void>;
  onReverseVoucher: (voucherId: string, reason: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  loading: boolean;
}

export const AuditLedgerView: React.FC<AuditLedgerViewProps> = ({
  transactions,
  onRefresh,
  onReverseVoucher,
  loading,
}) => {
  const { traceDocument } = useErpRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [stageFilter, setStageFilter] = useState<string>('ALL');

  // Reversal Modal
  const [reversalModalTx, setReversalModalTx] = useState<InventoryTransaction | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalLoading, setReversalLoading] = useState(false);
  const [reversalError, setReversalError] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (typeFilter !== 'ALL' && t.voucherType !== typeFilter) return false;
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (stageFilter !== 'ALL' && t.stageId !== stageFilter && t.targetStageId !== stageFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchesNum = t.voucherNumber.toLowerCase().includes(q);
        const matchesPartName = t.partName.toLowerCase().includes(q);
        const matchesPartCode = t.partCode.toLowerCase().includes(q);
        const matchesRef = t.referenceDoc?.toLowerCase().includes(q) || false;
        const matchesOp = t.operatorName?.toLowerCase().includes(q) || false;
        const matchesNotes = t.notes?.toLowerCase().includes(q) || false;
        if (!matchesNum && !matchesPartName && !matchesPartCode && !matchesRef && !matchesOp && !matchesNotes) {
          return false;
        }
      }
      return true;
    });
  }, [transactions, searchTerm, typeFilter, statusFilter, stageFilter]);

  const totalPages = Math.ceil(filteredTransactions.length / pageSize) || 1;
  const pagedTransactions = filteredTransactions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleOpenReverse = (tx: InventoryTransaction) => {
    setReversalModalTx(tx);
    setReversalReason(`ابطال و تعدیل به دلیل خطای اپراتور در ثبت سند ${tx.voucherNumber}`);
    setReversalError(null);
  };

  const handleConfirmReverse = async () => {
    if (!reversalModalTx) return;
    setReversalLoading(true);
    setReversalError(null);

    try {
      const res = await onReverseVoucher(reversalModalTx.id, reversalReason);
      if (res.success) {
        setReversalModalTx(null);
      } else {
        setReversalError(res.error || 'خطا در ابطال سند.');
      }
    } catch (err) {
      setReversalError(err instanceof Error ? err.message : 'خطای ارتباط با سرور.');
    } finally {
      setReversalLoading(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'شماره سند یکتا',
      'نوع سند',
      'وضعیت',
      'کد قطعه',
      'عنوان قطعه / ماده اولیه',
      'ایستگاه مبدا',
      'ایستگاه مقصد',
      'مقدار',
      'واحد',
      'وزن معادل (کیلوگرم)',
      'سند عطف / بارنامه',
      'اپراتور مسئول',
      'شیفت کاری',
      'علت ضایعات',
      'سند مرجع ابطال',
      'توضیحات سند',
      'تاریخ و زمان ثبتی',
    ];

    const rows = filteredTransactions.map(t => [
      t.voucherNumber,
      getVoucherTypeLabel(t.voucherType).label,
      t.status === 'CONFIRMED' ? 'معتبر و قطعی' : 'ابطال شده',
      t.partCode,
      t.partName,
      t.stageName,
      t.targetStageName || '-',
      t.quantity,
      t.unit,
      t.quantityKg,
      t.referenceDoc || '',
      t.operatorName || '',
      t.shift || '',
      t.scrapReason || '',
      t.reversalOfVoucherId || '',
      t.notes || '',
      formatDateTime(t.createdAt),
    ]);

    exportToCsv(`دفتر_گردش_تراکنش‌های_انبار_و_تولید_${Date.now()}`, headers, rows);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="sap-card p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-[#333333] flex items-center gap-2">
            <History className="w-5 h-5 text-[#007cc0]" />
            دفتر کل گردش تراکنش‌ها و سوابق اصلاحات اسناد (Audit Trail)
          </h2>
          <p className="text-xs text-[#666666] mt-1">
            دفتر کل غیرقابل‌حذف (Immutable Ledger)؛ تمامی اصلاحات با صدور سند معکوس و حفظ زنجیره سوابق انجام می‌پذیرد.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>به‌روزرسانی دفتر</span>
          </button>
          <button
            onClick={handleExportCsv}
            className="sap-btn-emphasized flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>خروجی اکسل اسناد</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="sap-card p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search */}
          <div className="relative min-w-[240px] flex-1">
            <Search className="w-4 h-4 text-[#666666] absolute right-3 top-2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="جستجوی شماره سند، کد قطعه، بارنامه، اپراتور..."
              className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm pr-9 pl-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
            />
          </div>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
          >
            <option value="ALL">همه انواع اسناد</option>
            <option value="RECEIPT">رسیدهای ورود ساپکو</option>
            <option value="ISSUE">حواله‌های مصرف مواد</option>
            <option value="PRODUCTION_OUTPUT">ثبت تولید سالم</option>
            <option value="SCRAP">ثبت ضایعات</option>
            <option value="WIP_TRANSFER_DISPATCH">ارسال بین مراحل</option>
            <option value="WIP_TRANSFER_RECEIPT">وصول در مرحله مقصد</option>
            <option value="ADJUSTMENT">اسناد اصلاحی / تعدیل</option>
            <option value="OPENING_BALANCE">موجودی اول دوره</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
          >
            <option value="ALL">همه وضعیت‌ها</option>
            <option value="CONFIRMED">معتبر و تأییدشده</option>
            <option value="REVERSED">ابطال‌شده در سند اصلاحی</option>
          </select>

          {/* Stage Filter */}
          <select
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value)}
            className="bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
          >
            <option value="ALL">همه انبارها و ایستگاه‌ها</option>
            {FACTORY_STAGES.map(st => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-[#666666]">
          تعداد اسناد: <span className="font-bold text-[#333333]">{formatNumber(filteredTransactions.length)}</span>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="sap-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs sap-table-compact">
            <thead>
              <tr className="bg-[#ffffff] border-b border-[#d9d9d9] text-[#333333] font-semibold select-none">
                <th>شماره سند</th>
                <th>نوع سند</th>
                <th>قطعه / ماده اولیه</th>
                <th>مبدا / ایستگاه</th>
                <th>مقصد</th>
                <th>مقدار</th>
                <th>وزن (kg)</th>
                <th>مرجع / بارنامه</th>
                <th>مسئول ثبت</th>
                <th>تاریخ و ساعت</th>
                <th>وضعیت</th>
                <th className="text-center">عملیات اصلاحی</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e8e8]">
              {pagedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-[#666666]">
                    هیچ سندی در این بازه یا فیلتر یافت نشد.
                  </td>
                </tr>
              ) : (
                pagedTransactions.map(t => {
                  const badge = getVoucherTypeLabel(t.voucherType);
                  const isReversed = t.status === 'REVERSED';

                  return (
                    <tr
                      key={t.id}
                      className={`hover:bg-[#e5f3fa] transition-colors ${
                        isReversed ? 'opacity-65 bg-[#ffecec]/40' : ''
                      }`}
                    >
                      <td className="font-mono font-bold whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => traceDocument(t.voucherNumber, 'INVENTORY_LEDGER')}
                          className="sap-doc-link"
                          title="رهگیری این سند در دفتر کل گردش کالا"
                        >
                          {t.voucherNumber}
                        </button>
                        {t.reversalOfVoucherId && (
                          <div className="text-[10px] text-[#e9730c] font-normal mt-0.5">
                            عطف به:{' '}
                            <button
                              type="button"
                              onClick={() => traceDocument(t.reversalOfVoucherId!, 'INVENTORY_LEDGER')}
                              className="sap-doc-link text-[10px]"
                            >
                              {t.reversalOfVoucherId}
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-sm text-[10px] font-medium border ${badge.bg} ${badge.color}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="text-[#333333] font-medium max-w-[200px]">
                        <div className="truncate">{t.partName}</div>
                        <button
                          type="button"
                          onClick={() => traceDocument(t.partCode, 'INVENTORY_LEDGER')}
                          className="sap-doc-link text-[10px]"
                        >
                          {t.partCode}
                        </button>
                      </td>
                      <td className="text-[#333333] whitespace-nowrap">{t.stageName}</td>
                      <td className="text-[#007cc0] font-medium whitespace-nowrap">
                        {t.targetStageName || '-'}
                      </td>
                      <td className="font-bold font-mono whitespace-nowrap">
                        <span className={t.quantity < 0 ? 'text-[#bb0000]' : 'text-[#333333]'}>
                          {t.quantity > 0 ? `+${formatNumber(t.quantity)}` : formatNumber(t.quantity)} {t.unit}
                        </span>
                      </td>
                      <td className="text-[#666666] whitespace-nowrap font-mono">
                        {formatWeightKg(t.quantityKg)}
                      </td>
                      <td className="text-[#666666] text-[11px] truncate max-w-[140px]">
                        {t.referenceDoc ? (
                          <button
                            type="button"
                            onClick={() =>
                              traceDocument(
                                t.referenceDoc!,
                                t.referenceDoc!.startsWith('MO') || t.referenceDoc!.startsWith('WO')
                                  ? 'WIP_TRACEABILITY'
                                  : 'INVENTORY_LEDGER'
                              )
                            }
                            className="sap-doc-link text-[11px]"
                          >
                            {t.referenceDoc}
                          </button>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="text-[#333333] text-[11px] whitespace-nowrap">
                        {t.operatorName || '-'}
                      </td>
                      <td className="text-[#666666] font-mono text-[11px] whitespace-nowrap">
                        {formatDateTime(t.createdAt)}
                      </td>
                      <td className="whitespace-nowrap">
                        {t.status === 'CONFIRMED' ? (
                          <span className="text-[#107e3e] text-[11px] flex items-center gap-1 font-medium">
                            <CheckCircle2 className="w-3 h-3" />
                            تأیید شده
                          </span>
                        ) : (
                          <span className="text-[#bb0000] text-[11px] flex items-center gap-1 font-semibold">
                            <AlertOctagon className="w-3 h-3" />
                            ابطال شده
                          </span>
                        )}
                      </td>
                      <td className="text-center whitespace-nowrap">
                        {t.status === 'CONFIRMED' && t.voucherType !== 'ADJUSTMENT' ? (
                          <button
                            onClick={() => handleOpenReverse(t)}
                            className="px-2 py-0.5 bg-[#ffecec] hover:bg-[#fadbd8] text-[#bb0000] border border-[#f5b7b1] rounded-sm text-[11px] font-medium transition-colors flex items-center gap-1 mx-auto cursor-pointer"
                            title="ابطال سند با صدور سند اصلاحی جبرانی"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>ابطال / سند اصلاحی</span>
                          </button>
                        ) : (
                          <span className="text-[#666666] text-[11px]">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-3 bg-[#ffffff] border-t border-[#d9d9d9] flex items-center justify-between text-xs text-[#666666]">
            <div>
              صفحه {toPersianDigits(currentPage)} از {toPersianDigits(totalPages)}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="sap-btn-standard px-2.5 py-1 disabled:opacity-40"
              >
                قبلی
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 7).map(pageNum => (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-7 h-7 rounded-sm font-mono font-medium transition-colors cursor-pointer border ${
                    currentPage === pageNum
                      ? 'bg-[#007cc0] text-white border-[#007cc0] font-bold'
                      : 'bg-[#ffffff] hover:bg-[#e5f3fa] text-[#333333] border-[#d9d9d9]'
                  }`}
                >
                  {toPersianDigits(pageNum)}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="sap-btn-standard px-2.5 py-1 disabled:opacity-40"
              >
                بعدی
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reversal / Adjustment Modal */}
      {reversalModalTx && (
        <div className="fixed inset-0 z-50 bg-[#333333]/40 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-[#d9d9d9] rounded-sm w-full max-w-md p-5 shadow-lg">
            <div className="flex items-center justify-between pb-3 border-b border-[#e8e8e8]">
              <div className="flex items-center gap-2 text-[#bb0000]">
                <RotateCcw className="w-4 h-4" />
                <h3 className="text-sm font-bold text-[#333333]">صدور سند اصلاحی و ابطال</h3>
              </div>
              <button
                onClick={() => setReversalModalTx(null)}
                className="text-[#666666] hover:text-[#333333] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reversalError && (
              <div className="mt-3 p-3 rounded-sm bg-[#ffecec] border border-[#f5b7b1] text-[#bb0000] text-xs">
                {reversalError}
              </div>
            )}

            <div className="mt-4 space-y-3 text-xs text-[#333333]">
              <div className="p-3 rounded-sm bg-[#f7f7f7] border border-[#d9d9d9] space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[#666666]">شماره سند هدف:</span>
                  <span className="font-mono font-bold text-[#007cc0]">{reversalModalTx.voucherNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#666666]">عنوان قطعه:</span>
                  <span className="font-medium text-[#333333]">{reversalModalTx.partName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#666666]">مقدار سند:</span>
                  <span className="font-mono font-bold text-[#333333]">
                    {formatNumber(reversalModalTx.quantity)} {reversalModalTx.unit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#666666]">ایستگاه مربوطه:</span>
                  <span className="text-[#333333]">{reversalModalTx.stageName}</span>
                </div>
              </div>

              <div className="p-3 rounded-sm bg-[#fff4e5] border border-[#f9d6a7] text-[#e9730c] text-[11px] leading-relaxed">
                طبق اصول حسابداری صنعتی کارخانه، این سند از پایگاه داده فیزیکی حذف نمی‌شود؛ بلکه وضعیت آن به «ابطال شده» تغییر یافته و یک سند معکوس خودکار (ADJUSTMENT) در دفاتر درج خواهد شد تا تراز موجودی اصلاح گردد.
              </div>

              <div className="space-y-1">
                <label className="text-[#333333] font-medium">علت و دلیل صدور سند اصلاحی *</label>
                <textarea
                  rows={3}
                  value={reversalReason}
                  onChange={e => setReversalReason(e.target.value)}
                  placeholder="علت ابطال (مثلاً: ثبت اشتباه مقدار توسط اپراتور شیفت...)"
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm p-2.5 text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#e8e8e8]">
                <button
                  type="button"
                  onClick={() => setReversalModalTx(null)}
                  className="sap-btn-standard px-4 py-1.5"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReverse}
                  disabled={reversalLoading || !reversalReason.trim()}
                  className="px-5 py-1.5 bg-[#bb0000] hover:bg-[#990000] text-white rounded-sm font-bold transition-all disabled:opacity-50 cursor-pointer"
                >
                  {reversalLoading ? 'در حال صدور سند معکوس...' : 'تأیید ابطال و صدور سند معکوس'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
