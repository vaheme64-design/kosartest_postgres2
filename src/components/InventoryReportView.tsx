import React, { useState, useMemo } from 'react';
import {
  Boxes,
  Search,
  Download,
  Filter,
  ArrowUpDown,
  RefreshCw,
  Scale,
  Layers,
  ArrowRightLeft,
  Clock,
  AlertTriangle,
  Building2,
} from 'lucide-react';
import { StageInventorySummary, FACTORY_STAGES, PartCategory } from '../types/inventory';
import {
  formatNumber,
  formatWeightKg,
  toPersianDigits,
  formatDateTime,
  exportToCsv,
} from '../utils/formatters';
import { TableSkeleton, KpiCardsSkeleton } from './common/Skeleton';
import { useErpRouter } from '../context/RouterContext';

interface InventoryReportViewProps {
  balances: StageInventorySummary[];
  onRefresh: () => Promise<void>;
  loading: boolean;
}

export const InventoryReportView: React.FC<InventoryReportViewProps> = ({
  balances,
  onRefresh,
  loading,
}) => {
  const { traceDocument } = useErpRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStageFilter, setSelectedStageFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [onlyNonZero, setOnlyNonZero] = useState(true);
  const [sortField, setSortField] = useState<keyof StageInventorySummary>('totalQty');
  const [sortAsc, setSortAsc] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const filteredBalances = useMemo(() => {
    return balances.filter(item => {
      if (onlyNonZero && item.totalQty === 0 && item.inTransitQty === 0 && item.scrapQty === 0) {
        return false;
      }
      if (selectedStageFilter !== 'ALL' && item.stageId !== selectedStageFilter) {
        return false;
      }
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchesName = item.partName.toLowerCase().includes(q);
        const matchesCode = item.partCode.toLowerCase().includes(q);
        const matchesStage = item.stageName.toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesStage) return false;
      }
      return true;
    }).sort((a, b) => {
      const valA = a[sortField] ?? 0;
      const valB = b[sortField] ?? 0;
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [balances, searchTerm, selectedStageFilter, onlyNonZero, sortField, sortAsc]);

  const totalPages = Math.ceil(filteredBalances.length / pageSize) || 1;
  const pagedData = filteredBalances.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Totals of current filtered view
  const totalUsableQty = filteredBalances.reduce((sum, item) => sum + item.usableQty, 0);
  const totalInTransitQty = filteredBalances.reduce((sum, item) => sum + item.inTransitQty, 0);
  const totalScrapQty = filteredBalances.reduce((sum, item) => sum + item.scrapQty, 0);
  const totalWeightKg = filteredBalances.reduce((sum, item) => sum + item.totalKg, 0);

  const handleExportCsv = () => {
    const headers = [
      'ایستگاه / انبار',
      'کد کاتالوگ قطعه',
      'عنوان قطعه / ماده اولیه',
      'موجودی قابل استفاده',
      'موجودی رزرو شده',
      'موجودی در راه (انتقال)',
      'موجودی کل مرحله',
      'واحد',
      'وزن کل (کیلوگرم)',
      'ضایعات ثبت شده',
      'درصد ضایعات',
      'آخرین تراکنش',
    ];

    const rows = filteredBalances.map(item => [
      item.stageName,
      item.partCode,
      item.partName,
      item.usableQty,
      item.reservedQty,
      item.inTransitQty,
      item.totalQty,
      item.unit,
      item.totalKg,
      item.scrapQty,
      `${item.scrapRatePercent}%`,
      formatDateTime(item.lastActivityDate),
    ]);

    exportToCsv(`گزارش_موجودی_انبار_و_WIP_${Date.now()}`, headers, rows);
  };

  const handleSort = (field: keyof StageInventorySummary) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Summary Cards */}
      <div className="sap-card p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-[#333333] flex items-center gap-2">
            <Boxes className="w-5 h-5 text-[#007cc0]" />
            گزارش کاردکس و موجودی چندمرحله‌ای (مواد اولیه، WIP و محصول)
          </h2>
          <p className="text-xs text-[#666666] mt-1">
            موجودی از گردش دفاتر تراکنش‌های معتبر و با تفکیک قطعی موجودی آزاد، رزرو و در انتظار انتقال محاسبه شده است.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs"
            title="به‌روزرسانی لحظه‌ای محاسبه دفاتر"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>محاسبه مجدد</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="sap-btn-emphasized flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>خروجی اکسل (CSV)</span>
          </button>
        </div>
      </div>

      {/* 4 Summary Micro-Cards for Current Filter */}
      {loading ? (
        <KpiCardsSkeleton count={4} columns={4} theme="light" />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="sap-card p-3">
            <span className="text-[11px] text-[#666666]">موجودی آزاد و قابل استفاده</span>
            <div className="text-base lg:text-lg font-bold text-[#107e3e] mt-1 tabular-nums font-mono">
              {formatNumber(totalUsableQty)}
            </div>
          </div>
          <div className="sap-card p-3">
            <span className="text-[11px] text-[#666666]">موجودی در حال انتقال (بین مراحل)</span>
            <div className="text-base lg:text-lg font-bold text-[#007cc0] mt-1 tabular-nums font-mono">
              {formatNumber(totalInTransitQty)}
            </div>
          </div>
          <div className="sap-card p-3">
            <span className="text-[11px] text-[#666666]">وزن کل موجودی در این نما</span>
            <div className="text-base lg:text-lg font-bold text-[#333333] mt-1 tabular-nums font-mono">
              {formatWeightKg(totalWeightKg)}
            </div>
          </div>
          <div className="sap-card p-3">
            <span className="text-[11px] text-[#666666]">مجموع ضایعات ثبتی</span>
            <div className="text-base lg:text-lg font-bold text-[#bb0000] mt-1 tabular-nums font-mono">
              {formatNumber(totalScrapQty)}
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="sap-card p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Search */}
          <div className="relative min-w-[220px] flex-1">
            <Search className="w-4 h-4 text-[#666666] absolute right-3 top-2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="جستجوی نام قطعه، کد کاتالوگ یا ایستگاه..."
              className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm pr-9 pl-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
            />
          </div>

          {/* Stage Filter */}
          <select
            value={selectedStageFilter}
            onChange={e => setSelectedStageFilter(e.target.value)}
            className="bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
          >
            <option value="ALL">همه ایستگاه‌ها و انبارها</option>
            {FACTORY_STAGES.map(st => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>

          {/* Non-zero checkbox */}
          <label className="flex items-center gap-2 text-xs text-[#333333] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyNonZero}
              onChange={e => setOnlyNonZero(e.target.checked)}
              className="rounded-sm bg-[#ffffff] border-[#bfbfbf] text-[#007cc0] focus:ring-0"
            />
            <span>فقط ردیف‌های دارای موجودی یا گردش</span>
          </label>
        </div>

        <div className="text-xs text-[#666666]">
          تعداد ردیف‌ها: <span className="font-bold text-[#333333] tabular-nums">{formatNumber(filteredBalances.length)}</span>
        </div>
      </div>

      {/* Data Table */}
      {loading ? (
        <TableSkeleton rows={8} columns={8} theme="light" />
      ) : (
      <div className="sap-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="sap-table-compact w-full text-right text-xs">
            <thead>
              <tr className="bg-[#f5f5f5] border-b border-[#d9d9d9] text-[#666666] font-semibold select-none">
                <th>ایستگاه / مرحله</th>
                <th>کد قطعه</th>
                <th>عنوان قطعه / شیت</th>
                <th
                  onClick={() => handleSort('usableQty')}
                  className="cursor-pointer hover:text-[#007cc0]"
                >
                  <div className="flex items-center gap-1">
                    <span>موجودی آزاد</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="text-[#007cc0]">در راه (انتقال)</th>
                <th
                  onClick={() => handleSort('totalQty')}
                  className="cursor-pointer hover:text-[#007cc0]"
                >
                  <div className="flex items-center gap-1">
                    <span>موجودی کل</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th>واحد</th>
                <th
                  onClick={() => handleSort('totalKg')}
                  className="cursor-pointer hover:text-[#007cc0]"
                >
                  <div className="flex items-center gap-1">
                    <span>وزن کل</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="text-[#bb0000]">ضایعات</th>
                <th>نرخ ضایعات</th>
                <th>آخرین تراکنش</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e8e8]">
              {pagedData.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-[#666666]">
                    هیچ رکوردی منطبق با فیلترهای انتخابی یافت نشد.
                  </td>
                </tr>
              ) : (
                pagedData.map(item => (
                  <tr key={`${item.stageId}_${item.partId}`} className="hover:bg-[#f5f5f5] transition-colors">
                    <td className="font-medium text-[#333333]">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-[#007cc0]" />
                        <span>{item.stageName}</span>
                      </div>
                    </td>
                    <td className="font-mono font-semibold">
                      <button
                        type="button"
                        onClick={() => traceDocument(item.partCode, 'INVENTORY_LEDGER')}
                        className="sap-doc-link font-mono"
                        title="رهگیری کاردکس قطعه"
                      >
                        {item.partCode}
                      </button>
                    </td>
                    <td className="text-[#333333] font-medium">
                      <div>{item.partName}</div>
                    </td>
                    <td className="font-bold text-[#107e3e] font-mono tabular-nums">
                      {formatNumber(item.usableQty)}
                    </td>
                    <td className="font-mono text-[#007cc0] tabular-nums">
                      {item.inTransitQty > 0 ? (
                        <span className="flex items-center gap-1">
                          <ArrowRightLeft className="w-3 h-3 text-[#007cc0]" />
                          {formatNumber(item.inTransitQty)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="font-bold text-[#333333] font-mono tabular-nums">
                      {formatNumber(item.totalQty)}
                    </td>
                    <td className="text-[#666666] font-medium">{item.unit}</td>
                    <td className="text-[#333333] font-medium tabular-nums">{formatWeightKg(item.totalKg)}</td>
                    <td className="text-[#bb0000] font-mono tabular-nums">
                      {item.scrapQty > 0 ? formatNumber(item.scrapQty) : '-'}
                    </td>
                    <td>
                      {item.scrapRatePercent > 0 ? (
                        <span className={`px-1.5 py-0.5 rounded-sm text-[10px] font-bold border ${
                          item.scrapRatePercent > 2.5
                            ? 'bg-[#ffecec] text-[#bb0000] border-[#f5b7b1]'
                            : 'bg-[#f5f5f5] text-[#333333] border-[#d9d9d9]'
                        }`}>
                          {toPersianDigits(item.scrapRatePercent)}٪
                        </span>
                      ) : (
                        <span className="text-[#666666]">-</span>
                      )}
                    </td>
                    <td className="text-[#666666] text-[11px] font-mono tabular-nums">
                      {formatDateTime(item.lastActivityDate)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-3 bg-[#f7f7f7] border-t border-[#d9d9d9] flex items-center justify-between text-xs text-[#666666]">
            <div>
              نمایش صفحه {toPersianDigits(currentPage)} از {toPersianDigits(totalPages)}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="sap-btn-standard px-2.5 py-1 disabled:opacity-40"
              >
                قبلی
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 7).map(pageNum => (
                <button
                  type="button"
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-7 h-7 rounded-sm font-mono font-medium transition-colors border cursor-pointer ${
                    currentPage === pageNum
                      ? 'bg-[#007cc0] text-white border-[#007cc0] font-bold'
                      : 'bg-[#ffffff] hover:bg-[#e5f3fa] text-[#333333] border-[#d9d9d9]'
                  }`}
                >
                  {toPersianDigits(pageNum)}
                </button>
              ))}
              <button
                type="button"
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
      )}
    </div>
  );
};
