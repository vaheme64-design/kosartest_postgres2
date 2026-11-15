import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileSpreadsheet,
  Search,
  Download,
  Bookmark,
  Plus,
  RefreshCw,
  CheckCircle2,
  SlidersHorizontal,
  Printer,
  GitBranch,
  ArrowUpDown,
  Trash2,
} from 'lucide-react';
import { formatNumber, toPersianDigits } from '../../utils/formatters';
import { formatToJalali } from '../../utils/jalali';
import { exportToCsv } from '../../utils/csvExport';
import { useErpRouter } from '../../context/RouterContext';

interface CoilItem {
  id: string;
  coilId: string;
  coilPackNumber: string;
  materialGrade: string;
  thicknessMm: number;
  widthMm: number;
  remainingWeightKg: number;
  originalWeightKg: number;
  warehouseName: string;
  allocations?: Array<{ contractId: string; contractNumber: string; allocatedWeightKg: number }>;
}

const REPORT_TYPES = [
  {
    id: 'THREE_TIER_STOCK',
    title: '۱. کنترل موجودی ۳ سطحی پس از مصرف (مواد اولیه، نیمه‌ساخته WIP، محصول نهایی)',
    badge: 'کنترل موجودی پس از مصرف',
    desc: 'نمایش دقیق کل ورود به سازمان، کل مصرف ثبت‌شده در تولید و مانده فعلی هر قطعه در هر ۳ سطح',
  },
  {
    id: 'END_TO_END_TRACEABILITY',
    title: '۲. زنجیره رهگیری سرتاسری اسناد و مواد (از ورود کلاف/ذوب تا مصرف و محصول)',
    badge: 'رهگیری از ابتدا تا مصرف',
    desc: 'ردیابی کامل شماره سند، نوع عملیات، شماره کلاف، شماره ذوب (Heat No) و دستور کار تولید',
  },
  {
    id: 'BOM_BACKFLUSH_VARIANCE',
    title: '۳. تطبیق مصرف واقعی مواد و اتصالات با ضرایب مهندسی BOM (Backflush)',
    badge: 'انحراف مصرف BOM',
    desc: 'مقایسه مصرف ورق DC01A، مهره جوشی M6 (۱۵ عدد) و پیچ ۶×۲۰ (۲ عدد) در برابر استاندارد BOM',
  },
  {
    id: 'COILS_SUMMARY',
    title: '۴. خلاصه وضعیت کلاف‌ها و رول‌های ورق (وزن اولیه، مصرف‌شده و مانده)',
    badge: 'رول و کلاف ورق',
    desc: 'گزارش تفکیکی رول‌های DC01A به همراه وزن اولیه، وزن مصرف‌شده در برش و مانده قابل مصرف',
  },
  {
    id: 'WAREHOUSE_STOCK',
    title: '۵. موجودی تفکیکی انبارها و ایستگاه‌های کاری (کاردکس انبار)',
    badge: 'تفکیک انبار',
    desc: 'موجودی فیزیکی، آزاد (ATP) و رزرو به تفکیک انبار مواد، پای کار جوش (WIP) و محصول نهایی',
  },
];

const PERSIAN_TO_ROW_KEY: Record<string, string> = {
  // Coils & Warehouse Stock
  'گرید متریال': 'materialGrade',
  'ضخامت (mm)': 'thicknessMm',
  'عرض (mm)': 'widthMm',
  'شماره پکینگ ساپکو': 'coilPackNumber',
  'تعداد کلاف': 'totalCoilsCount',
  'مجموع وزن اولیه (kg)': 'totalPhysicalWeightKg',
  'موجودی باقیمانده (kg)': 'totalRemainingWeightKg',
  'وضعیت': 'status',
  'کد قطعه': 'partCode',
  'نام کالا': 'partName',
  'انبار': 'warehouseName',
  'موقعیت (LOC)': 'locationCode',
  'موجودی فیزیکی': 'physicalQty',
  'رزرو': 'reservedQty',
  'مسدود کیفی': 'qualityBlockedQty',
  'موجودی آزاد': 'availableQty',
  'واحد': 'unit',
  // PostgreSQL Three-Tier Stock & End-to-End Traceability mappings
  'سطح کالا (Tier)': 'tier',
  'کد قطعه / کالا': 'partCode',
  'نام قطعه / ماده اولیه': 'partName',
  'کل ورود به سازمان': 'totalReceived',
  'کل مصرف / خروج ثبت‌شده': 'totalIssued',
  'موجودی فعلی پس از مصرف': 'onHand',
  'موجودی آزاد (ATP)': 'available',
  'نقطه سفارش (حداقل)': 'minStock',
  'وضعیت کنترلی': 'controlStatus',
  'اسناد مرتبط (کاردکس)': 'documents',
  'شماره سند رسمی': 'documentNumber',
  'نوع سند در زنجیره': 'documentType',
  'تاریخ سند': 'date',
  'مقدار': 'quantity',
  'وزن (KG)': 'weightKg',
  'شماره کلاف / لوت (Lot)': 'coilNumber',
  'شماره ذوب (Heat No)': 'heatNumber',
  'شماره دستور کار / مرجع': 'manufacturingOrder',
  'انبار / ایستگاه': 'warehouse',
};

const COLUMN_DISPLAY_LABEL: Record<string, string> = {
  tier: 'سطح کالا (Tier)',
  partCode: 'کد قطعه',
  partName: 'نام کالا / قطعه',
  unit: 'واحد',
  totalReceived: 'کل ورود به سازمان',
  totalIssued: 'کل مصرف / خروج ثبت‌شده',
  onHand: 'موجودی فعلی پس از مصرف',
  available: 'موجودی آزاد (ATP)',
  minStock: 'نقطه سفارش (حداقل)',
  controlStatus: 'وضعیت کنترلی',
  documents: 'اسناد مرتبط',
  sourceType: 'منبع رکورد',
  documentNumber: 'شماره سند رسمی',
  documentType: 'نوع سند',
  quantity: 'مقدار',
  weightKg: 'وزن (KG)',
  coilNumber: 'شماره کلاف / لوت',
  coilPackNumber: 'شماره کویل‌پک',
  heatNumber: 'شماره ذوب',
  manufacturingOrder: 'دستور کار / مرجع',
  operationStep: 'شماره ایستگاه',
  operationName: 'نام عملیات',
  plannedMachine: 'دستگاه برنامه‌ریزی‌شده',
  warehouse: 'انبار / ایستگاه',
  contractNumber: 'شماره قرارداد',
  date: 'تاریخ سند',
};

const getColumnLabel = (col: string): string => COLUMN_DISPLAY_LABEL[col] || col;

const resolveCellValue = (row: any, col: string) => {
  if (row[col] !== undefined) return row[col];
  const mappedKey = PERSIAN_TO_ROW_KEY[col];
  if (mappedKey && row[mappedKey] !== undefined) return row[mappedKey];
  return undefined;
};

export const CustomReportsView: React.FC = () => {
  const { traceDocument } = useErpRouter();
  const [reportType, setReportType] = useState<string>('THREE_TIER_STOCK');
  const [materialGrade, setMaterialGrade] = useState('');
  const [coilPackNumber, setCoilPackNumber] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [ownership, setOwnership] = useState('');
  const [contractId, setContractId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [loading, setLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<{
    columns: string[];
    rows: any[];
    summary: Record<string, any>;
  }>({ columns: [], rows: [], summary: {} });

  // Dynamic Column Selection & Sorting for Custom Report Building
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [showColumnSelector, setShowColumnSelector] = useState<boolean>(false);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Preserve custom columns when loading a saved report config across async fetches
  const pendingColumnsRef = useRef<string[] | null>(null);

  const [savedConfigs, setSavedConfigs] = useState<any[]>([]);
  const [configName, setConfigName] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deletingConfigId, setDeletingConfigId] = useState<string | null>(null);

  const fetchReport = async () => {
    setLoading(true);
    setReportError(null);
    try {
      const params = new URLSearchParams();
      params.append('reportType', reportType);
      if (materialGrade) params.append('materialGrade', materialGrade);
      if (coilPackNumber) params.append('coilPackNumber', coilPackNumber);
      if (warehouseId) params.append('warehouseId', warehouseId);
      if (ownership) params.append('ownership', ownership);
      if (contractId) params.append('contractId', contractId);
      if (searchTerm) params.append('search', searchTerm);

      const res = await fetch(`/api/inventory/custom-reports?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        const cols: string[] = data.columns || [];
        setReportData({
          columns: cols,
          rows: data.data || [],
          summary: data.summary || {},
        });
        if (pendingColumnsRef.current && pendingColumnsRef.current.length > 0) {
          const restored = cols.filter(c => pendingColumnsRef.current!.includes(c));
          setSelectedColumns(restored.length > 0 ? restored : cols);
          pendingColumnsRef.current = null;
        } else {
          setSelectedColumns(cols);
        }
      } else {
        setReportData({ columns: [], rows: [], summary: {} });
        setReportError(data.error || 'خطا در تولید گزارش سفارشی');
      }
    } catch (err) {
      console.error('Error fetching custom report:', err);
      setReportError('خطا در برقراری ارتباط با سرور گزارش‌ساز');
    } finally {
      setLoading(false);
    }
  };

  const fetchSavedConfigs = async () => {
    try {
      const res = await fetch('/api/inventory/report-configs');
      const data = await res.json();
      if (data.success) {
        setSavedConfigs(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching report configs:', err);
    }
  };

  useEffect(() => {
    setSortCol(null);
    fetchReport();
  }, [reportType, materialGrade, coilPackNumber, warehouseId, ownership, contractId, searchTerm]);

  useEffect(() => {
    fetchSavedConfigs();
  }, []);

  const visibleColumns = useMemo(() => {
    if (selectedColumns.length === 0) return reportData.columns;
    return reportData.columns.filter(c => selectedColumns.includes(c));
  }, [reportData.columns, selectedColumns]);

  const sortedRows = useMemo(() => {
    if (!sortCol) return reportData.rows;
    return [...reportData.rows].sort((a, b) => {
      const va = resolveCellValue(a, sortCol);
      const vb = resolveCellValue(b, sortCol);
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      const sa = String(va ?? '');
      const sb = String(vb ?? '');
      return sortDir === 'asc' ? sa.localeCompare(sb, 'fa') : sb.localeCompare(sa, 'fa');
    });
  }, [reportData.rows, sortCol, sortDir]);

  const numericTotals = useMemo(() => {
    const totals: Record<string, number | null> = {};
    visibleColumns.forEach(col => {
      // Do not sum dimension/coefficient specs like thickness, width, BOM coefficient, minStock
      if (
        col.includes('ضخامت') ||
        col.includes('عرض') ||
        col.includes('ضریب') ||
        col === 'thicknessMm' ||
        col === 'widthMm' ||
        col === 'operationStep'
      ) {
        totals[col] = null;
        return;
      }
      let sum = 0;
      let hasNumber = false;
      reportData.rows.forEach(row => {
        const v = resolveCellValue(row, col);
        if (typeof v === 'number' && !Number.isNaN(v)) {
          sum += v;
          hasNumber = true;
        }
      });
      totals[col] = hasNumber ? Number(sum.toFixed(2)) : null;
    });
    return totals;
  }, [visibleColumns, reportData.rows]);

  const handleSortClick = (col: string) => {
    if (sortCol === col) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const toggleColumn = (col: string) => {
    setSelectedColumns(prev => {
      if (prev.includes(col)) {
        if (prev.length <= 1) return prev;
        return prev.filter(c => c !== col);
      }
      return [...prev, col];
    });
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configName.trim()) return;

    try {
      const res = await fetch('/api/inventory/report-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: configName,
          reportType,
          selectedColumns: visibleColumns,
          filters: { materialGrade, coilPackNumber, warehouseId, ownership, contractId, searchTerm },
          sortBy: sortCol || undefined,
          sortOrder: sortDir,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setConfigName('');
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        fetchSavedConfigs();
      }
    } catch (err) {
      console.error('Error saving config:', err);
    }
  };

  const handleDeleteConfig = async (id: string) => {
    setDeletingConfigId(id);
    try {
      const res = await fetch(`/api/inventory/report-configs/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setSavedConfigs(prev => prev.filter(c => c.id !== id));
      }
    } catch (err) {
      console.error('Error deleting report config:', err);
    } finally {
      setDeletingConfigId(null);
    }
  };

  const formatDisplayCell = (col: string, val: any): string => {
    if (val === undefined || val === null || val === '') return '-';
    if (typeof val === 'number') return formatNumber(val);
    if (Array.isArray(val)) return val.length ? val.join('، ') : '-';
    if (col === 'date' || col === 'تاریخ سند') {
      const s = String(val);
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return formatToJalali(s);
    }
    return String(val);
  };

  const handleExportCustomCsv = () => {
    if (sortedRows.length === 0) return;
    const headers = visibleColumns.map(getColumnLabel);
    const rows = sortedRows.map(row =>
      visibleColumns.map(col => {
        const val = resolveCellValue(row, col);
        if (val === undefined || val === null) return '';
        if (Array.isArray(val)) return val.join(' | ');
        if ((col === 'date' || col === 'تاریخ سند') && /^\d{4}-\d{2}-\d{2}/.test(String(val))) {
          return formatToJalali(String(val));
        }
        return String(val);
      })
    );
    exportToCsv(`KPIMS_CUSTOM_${reportType}_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  };

  const activeReportMeta = REPORT_TYPES.find(r => r.id === reportType) || REPORT_TYPES[0];
  const hasAnyNumericTotals = Object.values(numericTotals).some(v => v !== null);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header & Quick Dataset Selector */}
      <div className="sap-card p-4 space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#e8e8e8] pb-3.5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-sm bg-[#007cc0] text-white flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#333333]">
                گزارش‌ساز پویا و سفارشی (کنترل موجودی پس از مصرف و رهگیری سرتاسری اسناد)
              </h3>
              <p className="text-xs text-[#666666] mt-0.5">
                انتخاب منبع داده، شخصی‌سازی ستون‌های گزارش، مرتب‌سازی، فیلتر زنده، ذخیره قالب گزارش و خروجی اکسل/چاپ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={() => setShowColumnSelector(prev => !prev)}
              className={`px-3 py-1.5 rounded-sm text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer ${
                showColumnSelector
                  ? 'bg-[#007cc0] text-white border-[#007cc0]'
                  : 'sap-btn-standard'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>انتخاب ستون‌ها ({toPersianDigits(visibleColumns.length)} از {toPersianDigits(reportData.columns.length)})</span>
            </button>

            <button
              type="button"
              onClick={fetchReport}
              className="sap-btn-standard px-3 py-1.5 text-xs flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>بروزرسانی</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="sap-btn-standard px-3 py-1.5 text-xs flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>چاپ رسمی</span>
            </button>

            <button
              type="button"
              onClick={handleExportCustomCsv}
              className="sap-btn-emphasized px-3.5 py-1.5 text-xs flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>خروجی اکسل (CSV)</span>
            </button>
          </div>
        </div>

        {/* 5 Core Report Type Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2">
          {REPORT_TYPES.map(rt => {
            const isSelected = reportType === rt.id;
            return (
              <button
                key={rt.id}
                type="button"
                onClick={() => {
                  pendingColumnsRef.current = null;
                  setReportType(rt.id);
                }}
                className={`p-2.5 rounded-sm border text-right transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-[#e5f3fa] text-[#007cc0] border-[#007cc0] ring-1 ring-[#007cc0]'
                    : 'bg-[#f5f5f5] hover:bg-[#e8e8e8] text-[#333333] border-[#d9d9d9]'
                }`}
              >
                <div>
                  <span
                    className={`text-[10px] font-bold block mb-1 ${
                      isSelected ? 'text-[#007cc0]' : 'text-[#107e3e]'
                    }`}
                  >
                    {rt.badge}
                  </span>
                  <div className="text-xs font-bold leading-snug">{rt.title}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Column Picker Drawer (Progressive Disclosure) */}
        {showColumnSelector && reportData.columns.length > 0 && (
          <div className="p-3.5 bg-[#f7f7f7] border border-[#d9d9d9] rounded-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#333333]">
                ستون‌های دلخواه خود را برای ساخت گزارش انتخاب کنید:
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedColumns(reportData.columns)}
                  className="text-[11px] text-[#007cc0] hover:underline font-bold cursor-pointer"
                >
                  انتخاب همه ستون‌ها
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {reportData.columns.map(col => {
                const checked = visibleColumns.includes(col);
                return (
                  <label
                    key={col}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border text-xs font-semibold cursor-pointer transition ${
                      checked
                        ? 'bg-[#e5f3fa] border-[#007cc0] text-[#007cc0]'
                        : 'bg-[#ffffff] border-[#d9d9d9] text-[#666666]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleColumn(col)}
                      className="rounded-sm border-[#bfbfbf] text-[#007cc0] focus:ring-[#007cc0]"
                    />
                    <span>{getColumnLabel(col)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Search & Save Template Bar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 pt-1">
          <div className="lg:col-span-5 relative">
            <Search className="w-4 h-4 text-[#666666] absolute right-3 top-2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="جستجو در مقادیر گزارش (کد قطعه، شماره سند، شماره ذوب، کلاف...)"
              className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm pr-9 pl-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
            />
          </div>

          <div className="lg:col-span-3">
            <select
              value={warehouseId}
              onChange={e => setWarehouseId(e.target.value)}
              className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333] font-semibold focus:outline-none focus:border-[#007cc0]"
            >
              <option value="">همه انبارها و ایستگاه‌ها</option>
              <option value="WH-RAW">انبار مرکزی مواد اولیه و رول (WH-RAW)</option>
              <option value="WH-WIP-WELD">انبار پای کار جوش و مونتاژ (WH-WIP-WELD)</option>
              <option value="WH-FINISHED">انبار محصولات نهایی (WH-FINISHED)</option>
            </select>
          </div>

          <form onSubmit={handleSaveConfig} className="lg:col-span-4 flex items-center gap-2">
            <input
              type="text"
              value={configName}
              onChange={e => setConfigName(e.target.value)}
              placeholder="نام قالب گزارش جهت ذخیره..."
              className="flex-1 bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
            />
            <button
              type="submit"
              className="sap-btn-emphasized px-3.5 py-1.5 text-xs flex items-center gap-1 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ذخیره گزارش</span>
            </button>
          </form>
        </div>

        {saveSuccess && (
          <div className="text-xs text-[#107e3e] font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>قالب گزارش سفارشی شما با موفقیت ذخیره شد.</span>
          </div>
        )}

        {/* Saved Report Templates */}
        {savedConfigs.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-[#e8e8e8]">
            <span className="text-[11px] font-bold text-[#666666] flex items-center gap-1">
              <Bookmark className="w-3.5 h-3.5 text-[#e9730c]" />
              گزارش‌های ذخیره‌شده شما:
            </span>
            {savedConfigs.map(cfg => (
              <div
                key={cfg.id}
                className="inline-flex items-center rounded-sm bg-[#f5f5f5] hover:bg-[#e5f3fa] text-[#333333] text-xs font-semibold transition border border-[#d9d9d9] overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => {
                    const savedCols = Array.isArray(cfg.selectedColumns) && cfg.selectedColumns.length > 0
                      ? cfg.selectedColumns
                      : null;
                    pendingColumnsRef.current = savedCols;
                    if (cfg.reportType === reportType && savedCols) {
                      setSelectedColumns(savedCols);
                    } else {
                      setReportType(cfg.reportType);
                    }
                    if (cfg.filters) {
                      setMaterialGrade(cfg.filters.materialGrade || '');
                      setCoilPackNumber(cfg.filters.coilPackNumber || '');
                      setWarehouseId(cfg.filters.warehouseId || '');
                      setOwnership(cfg.filters.ownership || '');
                      setContractId(cfg.filters.contractId || '');
                      setSearchTerm(cfg.filters.searchTerm || '');
                    }
                    if (cfg.sortBy) {
                      setSortCol(cfg.sortBy);
                      setSortDir(cfg.sortOrder === 'desc' ? 'desc' : 'asc');
                    }
                  }}
                  className="px-2.5 py-1 cursor-pointer hover:text-[#007cc0]"
                >
                  {cfg.name}
                </button>
                <button
                  type="button"
                  disabled={deletingConfigId === cfg.id}
                  onClick={() => handleDeleteConfig(cfg.id)}
                  title="حذف قالب ذخیره‌شده"
                  className="px-1.5 py-1 text-[#666666] hover:text-[#bb0000] hover:bg-[#ffecec] border-r border-[#d9d9d9] cursor-pointer disabled:opacity-40"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Results Table */}
      <div className="sap-card overflow-hidden">
        <div className="p-3.5 border-b border-[#d9d9d9] flex flex-wrap items-center justify-between gap-3 bg-[#ffffff]">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-[#007cc0]" />
            <h4 className="text-sm font-bold text-[#333333]">{activeReportMeta.title}</h4>
            <span className="text-xs text-[#666666] font-mono">
              ({toPersianDigits(sortedRows.length)} ردیف)
            </span>
          </div>
          <p className="text-xs text-[#666666]">{activeReportMeta.desc}</p>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center text-[#666666] text-sm">در حال تولید گزارش...</div>
          ) : reportError ? (
            <div className="p-8 text-center text-[#e9730c] bg-[#fff4e5] text-xs font-medium">
              {reportError}
            </div>
          ) : sortedRows.length === 0 ? (
            <div className="p-10 text-center text-[#666666] text-sm">
              هیچ رکوردی مطابق با فیلترهای انتخابی یافت نشد.
            </div>
          ) : (
            <table className="w-full text-right border-collapse text-xs sap-table-compact">
              <thead>
                <tr className="bg-[#ffffff] text-[#333333] border-b border-[#d9d9d9] font-bold">
                  <th className="w-10 text-center">#</th>
                  {visibleColumns.map((col, idx) => (
                    <th key={idx} className="whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleSortClick(col)}
                        className="inline-flex items-center gap-1 hover:text-[#007cc0] cursor-pointer select-none"
                      >
                        <span>{getColumnLabel(col)}</span>
                        <ArrowUpDown className={`w-3 h-3 ${sortCol === col ? 'text-[#007cc0]' : 'text-[#666666]'}`} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8e8] text-[#333333]">
                {sortedRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-[#e5f3fa] transition-colors">
                    <td className="text-center font-mono text-[#666666]">
                      {toPersianDigits(rIdx + 1)}
                    </td>
                    {visibleColumns.map((col, cIdx) => {
                      const val = resolveCellValue(row, col);
                      const isNumeric = typeof val === 'number';
                      const strVal = formatDisplayCell(col, val);
                      const isHighlightCol =
                        col.includes('موجودی فعلی پس از مصرف') ||
                        col.includes('مصرف واقعی') ||
                        col.includes('شماره سند') ||
                        col === 'onHand' ||
                        col === 'documentNumber';

                      const isTraceableDoc =
                        strVal !== '-' &&
                        (col === 'partCode' ||
                          col === 'documentNumber' ||
                          col === 'coilNumber' ||
                          col === 'coilPackNumber' ||
                          col === 'manufacturingOrder' ||
                          col === 'contractNumber' ||
                          col.includes('کد قطعه') ||
                          col.includes('شماره سند') ||
                          col.includes('دستور کار') ||
                          col.includes('کلاف'));

                      const traceTarget =
                        col === 'manufacturingOrder' || col.includes('دستور کار')
                          ? 'WIP_TRACEABILITY'
                          : col === 'coilNumber' || col === 'coilPackNumber' || col.includes('کلاف')
                          ? 'COILS'
                          : col === 'contractNumber'
                          ? 'CONTRACTS'
                          : 'INVENTORY_LEDGER';

                      return (
                        <td
                          key={cIdx}
                          className={`whitespace-nowrap ${
                            isNumeric ? 'font-mono font-bold tabular-nums' : ''
                          } ${isHighlightCol ? 'text-[#107e3e] font-bold bg-[#ebf7ef]/40' : ''}`}
                        >
                          {isTraceableDoc ? (
                            <button
                              type="button"
                              onClick={() => traceDocument(strVal, traceTarget)}
                              className="sap-doc-link font-mono"
                            >
                              {strVal}
                            </button>
                          ) : (
                            strVal
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              {hasAnyNumericTotals && (
                <tfoot>
                  <tr className="bg-[#f5f5f5] border-t-2 border-[#d9d9d9] font-bold text-[#333333]">
                    <td className="text-center text-[11px] text-[#666666]">جمع</td>
                    {visibleColumns.map((col, cIdx) => {
                      const totalVal = numericTotals[col];
                      return (
                        <td key={cIdx} className="whitespace-nowrap font-mono tabular-nums">
                          {totalVal !== null && totalVal !== undefined ? formatNumber(totalVal) : ''}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

