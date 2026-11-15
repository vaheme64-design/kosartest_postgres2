import React, { useState, useMemo } from 'react';
import {
  ScrollText,
  Search,
  Filter,
  Download,
  Building2,
  RefreshCw,
  Scale,
  CheckCircle2,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpLeft,
  Calendar,
  Layers,
  FileCheck,
} from 'lucide-react';
import {
  SapcoContract,
  SapcoContractLedgerEntry,
} from '../../types/inventory';
import {
  formatNumber,
  formatWeightKg,
  toPersianDigits,
  formatDateTime,
  exportToCsv,
} from '../../utils/formatters';
import { useErpRouter } from '../../context/RouterContext';

interface SapcoAccountReportViewProps {
  contracts: SapcoContract[];
  ledger: SapcoContractLedgerEntry[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}

export const SapcoAccountReportView: React.FC<SapcoAccountReportViewProps> = ({
  contracts,
  ledger,
  loading,
  onRefresh,
}) => {
  const { traceDocument } = useErpRouter();
  const [selectedContractId, setSelectedContractId] = useState<string>('ALL');
  const [selectedOperationFilter, setSelectedOperationFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination for ledger table
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Aggregate metrics across active contracts
  const totalAllocatedKg = contracts.reduce((sum, c) => sum + c.allocatedWeightKg, 0);
  const totalReceivedKg = contracts.reduce((sum, c) => sum + c.totalReceivedKg, 0);
  const totalConsumedKg = contracts.reduce((sum, c) => sum + c.totalConsumedKg, 0);
  const totalClosingBalanceKg = contracts.reduce((sum, c) => sum + c.closingBalanceKg, 0);

  const operationLabels: Record<string, { label: string; color: string; sign: string }> = {
    OPENING: { label: 'موجودی اول دوره', color: 'bg-[#f5f5f5] text-[#333333] border-[#d9d9d9]', sign: '' },
    RECEIPT: { label: 'ورود رول ساپکو', color: 'bg-[#ebf7ef] text-[#107e3e] border-[#a9dfbf]', sign: '+' },
    CONSUMPTION: { label: 'مصرف در خط پرس', color: 'bg-[#fff4e5] text-[#e9730c] border-[#f9d6a7]', sign: '-' },
    RETURN: { label: 'برگشت به ساپکو', color: 'bg-[#ffecec] text-[#bb0000] border-[#f5b7b1]', sign: '-' },
    ADJUSTMENT: { label: 'تعدیل حسابرسی', color: 'bg-[#e5f3fa] text-[#007cc0] border-[#b3ddf2]', sign: '±' },
  };

  const filteredLedger = useMemo(() => {
    return ledger.filter(item => {
      if (selectedContractId !== 'ALL' && item.contractId !== selectedContractId) {
        return false;
      }
      if (selectedOperationFilter !== 'ALL' && item.operationType !== selectedOperationFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesDoc = item.documentNumber.toLowerCase().includes(q);
        const matchesWaybill = item.waybillNumber ? item.waybillNumber.toLowerCase().includes(q) : false;
        const matchesLot = item.lotNumber ? item.lotNumber.toLowerCase().includes(q) : false;
        const matchesHeat = item.heatNumber ? item.heatNumber.toLowerCase().includes(q) : false;
        const matchesNotes = item.notes ? item.notes.toLowerCase().includes(q) : false;
        if (!matchesDoc && !matchesWaybill && !matchesLot && !matchesHeat && !matchesNotes) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [ledger, selectedContractId, selectedOperationFilter, searchTerm]);

  const totalPages = Math.ceil(filteredLedger.length / pageSize) || 1;
  const pagedLedger = filteredLedger.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleExportCsv = () => {
    const headers = [
      'قرارداد ساپکو',
      'شماره سند کاردکس',
      'تاریخ',
      'نوع تراکنش',
      'شماره بارنامه ساپکو',
      'شماره رول / لوت',
      'شماره ذوب فولادساز',
      'وزن تراکنش (کیلوگرم)',
      'مانده جاری قرارداد (کیلوگرم)',
      'شرح و توضیحات',
    ];

    const rows = filteredLedger.map(l => [
      l.contractNumber,
      l.documentNumber,
      l.date,
      operationLabels[l.operationType]?.label || l.operationType,
      l.waybillNumber || '-',
      l.lotNumber || '-',
      l.heatNumber || '-',
      l.weightKgSigned,
      l.runningBalanceKg,
      l.notes || '-',
    ]);

    exportToCsv(`حسابداری_و_کاردکس_سهمیه_ساپکو_${Date.now()}`, headers, rows);
  };

  return (
    <div className="space-y-4">
      {/* Header and Controls */}
      <div className="sap-card p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-[#333333] flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-[#007cc0]" />
            حسابداری سهمیه ورق و کلاف‌های امانی ساپکو (SAPCO Consignment)
          </h2>
          <p className="text-xs text-[#666666] mt-1 leading-relaxed">
            ردیابی مستقل موجودی امانی ساپکو از موجودی ملکی کارخانه بر حسب کیلوگرم، تطبیق بارنامه‌های ورودی و موازنه مصارف خطوط پرس
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>به‌روزرسانی حساب‌ها</span>
          </button>
          <button
            onClick={handleExportCsv}
            className="sap-btn-emphasized flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>گزارش جامع اکسل</span>
          </button>
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="sap-card p-4">
          <span className="text-[11px] font-medium text-[#666666]">کل سهمیه تخصیصی قراردادها</span>
          <div className="text-lg font-bold text-[#333333] mt-1 font-mono">
            {formatWeightKg(totalAllocatedKg)}
          </div>
          <span className="text-[10px] text-[#666666] block mt-1">بر اساس تفاهم‌نامه‌های ساپکو</span>
        </div>

        <div className="sap-card p-4">
          <span className="text-[11px] font-medium text-[#666666]">مجموع دریافتی کلاف (تحویل کارخانه)</span>
          <div className="text-lg font-bold text-[#333333] mt-1 font-mono">
            {formatWeightKg(totalReceivedKg)}
          </div>
          <span className="text-[10px] text-[#107e3e] block mt-1 font-medium">
            {totalAllocatedKg > 0 ? toPersianDigits(Math.round((totalReceivedKg / totalAllocatedKg) * 100)) : 0}٪ کل سهمیه
          </span>
        </div>

        <div className="sap-card p-4">
          <span className="text-[11px] font-medium text-[#666666]">مجموع مصرف و برش خطوط پرس</span>
          <div className="text-lg font-bold text-[#333333] mt-1 font-mono">
            {formatWeightKg(totalConsumedKg)}
          </div>
          <span className="text-[10px] text-[#666666] block mt-1 font-medium">
            {totalReceivedKg > 0 ? toPersianDigits(Math.round((totalConsumedKg / totalReceivedKg) * 100)) : 0}٪ دریافتی
          </span>
        </div>

        <div className="sap-card p-4">
          <span className="text-[11px] font-medium text-[#666666]">موجودی کلاف در انبار (مانده پایان دوره)</span>
          <div className="text-lg font-bold text-[#007cc0] mt-1 font-mono">
            {formatWeightKg(totalClosingBalanceKg)}
          </div>
          <span className="text-[10px] text-[#666666] block mt-1">فیزیکی موجود در انبار شماره ۱</span>
        </div>
      </div>

      {/* Contracts Progress Cards */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-[#333333] flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#007cc0]" />
          <span>وضعیت تفکیکی سهمیه قراردادهای فعال ساپکو</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {contracts.map(contract => {
            const consumedPercent = contract.allocatedWeightKg > 0
              ? Math.min(100, Math.round((contract.totalConsumedKg / contract.allocatedWeightKg) * 100))
              : 0;

            const isSelected = selectedContractId === contract.id;

            return (
              <div
                key={contract.id}
                onClick={() => setSelectedContractId(isSelected ? 'ALL' : contract.id)}
                className={`sap-card p-4 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#e5f3fa]/60 border-[#007cc0] ring-1 ring-[#007cc0]'
                    : 'hover:border-[#007cc0]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        traceDocument(contract.contractNumber, 'CONTRACTS');
                      }}
                      className="sap-doc-link text-xs"
                    >
                      {contract.contractNumber}
                    </button>
                    <h4 className="text-xs font-semibold text-[#333333] mt-0.5">{contract.title}</h4>
                  </div>
                  <span className="px-2 py-0.5 rounded-sm text-[10px] font-medium bg-[#f5f5f5] text-[#333333] border border-[#d9d9d9]">
                    گرید {contract.materialGrade}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="mt-3.5 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#666666]">درصد مصرف سهمیه:</span>
                    <span className="font-mono font-bold text-[#007cc0]">{toPersianDigits(consumedPercent)}٪</span>
                  </div>
                  <div className="h-1.5 w-full bg-[#e8e8e8] rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-[#007cc0] transition-all duration-500"
                      style={{ width: `${consumedPercent}%` }}
                    />
                  </div>
                </div>

                {/* Breakdown details */}
                <div className="mt-3 pt-2.5 border-t border-[#e8e8e8] grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-[#666666] block">سهمیه کل:</span>
                    <span className="font-mono font-semibold text-[#333333]">{formatWeightKg(contract.allocatedWeightKg)}</span>
                  </div>
                  <div>
                    <span className="text-[#666666] block">دریافتی کارخانه:</span>
                    <span className="font-mono font-semibold text-[#333333]">{formatWeightKg(contract.totalReceivedKg)}</span>
                  </div>
                  <div>
                    <span className="text-[#666666] block">مصرف شده:</span>
                    <span className="font-mono font-semibold text-[#333333]">{formatWeightKg(contract.totalConsumedKg)}</span>
                  </div>
                  <div>
                    <span className="text-[#666666] block">مانده در انبار:</span>
                    <span className="font-mono font-bold text-[#007cc0]">{formatWeightKg(contract.closingBalanceKg)}</span>
                  </div>
                </div>

                <div className="mt-2 text-[10px] text-[#666666] flex flex-wrap items-center gap-1">
                  <span>قطعات مجاز:</span>
                  {contract.associatedPartCodes.map(pc => (
                    <button
                      key={pc}
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        traceDocument(pc, 'INVENTORY_LEDGER');
                      }}
                      className="sap-doc-link text-[10px]"
                    >
                      {pc}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Movement Ledger Section */}
      <div className="space-y-3">
        {/* Ledger Filter Bar */}
        <div className="sap-card p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            <div className="relative min-w-[240px] flex-1">
              <Search className="w-4 h-4 text-[#666666] absolute right-3 top-2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                placeholder="جستجوی بارنامه ساپکو، شماره سند، لوت یا شماره ذوب..."
                className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm pr-9 pl-3 py-1.5 text-xs text-[#333333] placeholder-[#666666] focus:outline-none focus:border-[#007cc0] transition-colors"
              />
            </div>

            <select
              value={selectedContractId}
              onChange={e => { setSelectedContractId(e.target.value); setCurrentPage(1); }}
              className="bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0] transition-colors"
            >
              <option value="ALL">همه قراردادهای ساپکو</option>
              {contracts.map(c => (
                <option key={c.id} value={c.id}>{c.contractNumber} - {c.title}</option>
              ))}
            </select>

            <select
              value={selectedOperationFilter}
              onChange={e => { setSelectedOperationFilter(e.target.value); setCurrentPage(1); }}
              className="bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0] transition-colors"
            >
              <option value="ALL">همه انواع تراکنش‌ها</option>
              <option value="OPENING">موجودی اول دوره</option>
              <option value="RECEIPT">ورود رول ساپکو</option>
              <option value="CONSUMPTION">مصرف در خط پرس</option>
              <option value="RETURN">برگشت به ساپکو</option>
              <option value="ADJUSTMENT">تعدیلات</option>
            </select>
          </div>

          <div className="text-xs text-[#666666]">
            ردیف‌های گردش: <span className="font-bold text-[#333333] font-mono">{toPersianDigits(filteredLedger.length)}</span>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="sap-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs sap-table-compact">
              <thead>
                <tr className="bg-[#ffffff] border-b border-[#d9d9d9] text-[#333333] font-semibold select-none">
                  <th>ردیف</th>
                  <th>تاریخ</th>
                  <th>شماره سند کاردکس</th>
                  <th>نوع عملیات</th>
                  <th>قرارداد</th>
                  <th>شماره بارنامه ساپکو</th>
                  <th>شماره رول / لوت</th>
                  <th>شماره ذوب</th>
                  <th className="text-left">وزن گردش (کیلوگرم)</th>
                  <th className="text-left">مانده جاری (کیلوگرم)</th>
                  <th>توضیحات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8e8]">
                {pagedLedger.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-[#666666]">
                      هیچ رکوردی در کاردکس سهمیه ساپکو یافت نشد.
                    </td>
                  </tr>
                ) : (
                  pagedLedger.map((row, idx) => {
                    const op = operationLabels[row.operationType] || { label: row.operationType, color: 'bg-[#f5f5f5] text-[#333333] border-[#d9d9d9]', sign: '' };
                    const isPositive = row.weightKgSigned > 0;

                    return (
                      <tr key={row.id || idx} className="hover:bg-[#e5f3fa] transition-colors">
                        <td className="text-[#666666] font-mono">
                          {toPersianDigits((currentPage - 1) * pageSize + idx + 1)}
                        </td>
                        <td className="font-mono text-[#666666]">{row.date}</td>
                        <td className="font-mono font-bold">
                          <button
                            type="button"
                            onClick={() => traceDocument(row.documentNumber, 'INVENTORY_LEDGER')}
                            className="sap-doc-link"
                          >
                            {row.documentNumber}
                          </button>
                        </td>
                        <td>
                          <span className={`px-2 py-0.5 rounded-sm text-[10px] font-semibold border ${op.color}`}>
                            {op.label}
                          </span>
                        </td>
                        <td className="font-mono font-medium">
                          <button
                            type="button"
                            onClick={() => traceDocument(row.contractNumber, 'CONTRACTS')}
                            className="sap-doc-link"
                          >
                            {row.contractNumber}
                          </button>
                        </td>
                        <td className="font-mono text-[#333333]">{row.waybillNumber || '-'}</td>
                        <td className="font-mono">
                          {row.lotNumber ? (
                            <button
                              type="button"
                              onClick={() => traceDocument(row.lotNumber!, 'COILS')}
                              className="sap-doc-link"
                            >
                              {row.lotNumber}
                            </button>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="font-mono text-[#666666]">{row.heatNumber || '-'}</td>
                        <td className="font-mono font-bold text-left">
                          <span className={isPositive ? 'text-[#107e3e]' : 'text-[#333333]'}>
                            {isPositive ? `+${formatNumber(row.weightKgSigned)}` : formatNumber(row.weightKgSigned)}
                          </span>
                        </td>
                        <td className="font-mono font-bold text-[#333333] text-left">
                          {formatWeightKg(row.runningBalanceKg)}
                        </td>
                        <td className="text-[#666666] text-[11px] max-w-[200px] truncate" title={row.notes}>
                          {row.notes || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-3 bg-[#ffffff] border-t border-[#d9d9d9] flex items-center justify-between text-xs text-[#666666]">
              <div>
                نمایش صفحه {toPersianDigits(currentPage)} از {toPersianDigits(totalPages)}
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
      </div>
    </div>
  );
};
