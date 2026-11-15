import React, { useState } from 'react';
import {
  Filter,
  RotateCcw,
  Download,
} from 'lucide-react';
import { ReportFilterParams } from '../../types/managementReports';
import { Part, Machine } from '../../types/inventory';

interface ReportFiltersBarProps {
  parts: Part[];
  machines: Machine[];
  filters: ReportFilterParams;
  onFilterChange: (filters: ReportFilterParams) => void;
  onExportCsv: () => void;
  isExporting?: boolean;
}

export const ReportFiltersBar: React.FC<ReportFiltersBarProps> = ({
  parts,
  machines,
  filters,
  onFilterChange,
  onExportCsv,
  isExporting = false,
}) => {
  const [localFilters, setLocalFilters] = useState<ReportFilterParams>(filters);

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    onFilterChange(localFilters);
  };

  const handleReset = () => {
    const emptyFilters: ReportFilterParams = {};
    setLocalFilters(emptyFilters);
    onFilterChange(emptyFilters);
  };

  return (
    <form
      onSubmit={handleApply}
      className="sap-card p-3.5 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#333333]">
          <Filter className="w-3.5 h-3.5 text-[#007cc0]" />
          <span>فیلترهای جستجو</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-[#666666] hover:text-[#007cc0] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>پاکسازی فیلتر</span>
          </button>

          <button
            type="button"
            onClick={onExportCsv}
            disabled={isExporting}
            className="sap-btn-standard flex items-center gap-1.5 px-3 py-1 text-xs disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#107e3e]" />
            <span>خروجی اکسل (CSV)</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 text-xs">
        {/* Date Range: Start Date */}
        <div>
          <label className="block text-[11px] font-medium text-[#666666] mb-1">از تاریخ:</label>
          <input
            type="date"
            value={localFilters.startDate || ''}
            onChange={e => setLocalFilters({ ...localFilters, startDate: e.target.value || undefined })}
            className="w-full bg-[#ffffff] border border-[#bfbfbf] focus:border-[#007cc0] rounded-sm px-2.5 py-1.5 text-xs text-[#333333] focus:outline-none transition-colors"
          />
        </div>

        {/* Date Range: End Date */}
        <div>
          <label className="block text-[11px] font-medium text-[#666666] mb-1">تا تاریخ:</label>
          <input
            type="date"
            value={localFilters.endDate || ''}
            onChange={e => setLocalFilters({ ...localFilters, endDate: e.target.value || undefined })}
            className="w-full bg-[#ffffff] border border-[#bfbfbf] focus:border-[#007cc0] rounded-sm px-2.5 py-1.5 text-xs text-[#333333] focus:outline-none transition-colors"
          />
        </div>

        {/* Part Filter */}
        <div>
          <label className="block text-[11px] font-medium text-[#666666] mb-1">قطعه:</label>
          <select
            value={localFilters.partId || ''}
            onChange={e => setLocalFilters({ ...localFilters, partId: e.target.value || undefined })}
            className="w-full bg-[#ffffff] border border-[#bfbfbf] focus:border-[#007cc0] rounded-sm px-2.5 py-1.5 text-xs text-[#333333] focus:outline-none transition-colors cursor-pointer"
          >
            <option value="">همه قطعات</option>
            {parts.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </div>

        {/* Customer Filter */}
        <div>
          <label className="block text-[11px] font-medium text-[#666666] mb-1">مشتری:</label>
          <select
            value={localFilters.customerName || ''}
            onChange={e => setLocalFilters({ ...localFilters, customerName: e.target.value || undefined })}
            className="w-full bg-[#ffffff] border border-[#bfbfbf] focus:border-[#007cc0] rounded-sm px-2.5 py-1.5 text-xs text-[#333333] focus:outline-none transition-colors cursor-pointer"
          >
            <option value="">همه مشتریان</option>
            <option value="ایران‌خودرو (ساپکو)">ایران‌خودرو (ساپکو)</option>
            <option value="سایپا (سازه‌گستر)">سایپا (سازه‌گستر)</option>
            <option value="مگاموتور">مگاموتور</option>
          </select>
        </div>

        {/* Machine Filter */}
        <div>
          <label className="block text-[11px] font-medium text-[#666666] mb-1">دستگاه / خط:</label>
          <select
            value={localFilters.machineId || ''}
            onChange={e => setLocalFilters({ ...localFilters, machineId: e.target.value || undefined })}
            className="w-full bg-[#ffffff] border border-[#bfbfbf] focus:border-[#007cc0] rounded-sm px-2.5 py-1.5 text-xs text-[#333333] focus:outline-none transition-colors cursor-pointer"
          >
            <option value="">همه ماشین‌آلات</option>
            {machines.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          className="sap-btn-emphasized px-4 py-1.5 text-xs cursor-pointer"
        >
          اعمال فیلترها
        </button>
      </div>
    </form>
  );
};
