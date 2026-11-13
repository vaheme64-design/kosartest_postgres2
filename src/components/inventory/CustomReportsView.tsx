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
    <div className="space-y-5" dir="rtl">
      {/* Header & Quick Dataset Selector */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                گزارش‌ساز پویا و سفارشی (کنترل موجودی پس از مصرف و رهگیری سرتاسری اسناد)
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                انتخاب منبع داده، شخصی‌سازی ستون‌های گزارش، مرتب‌سازی، فیلتر زنده، ذخیره قالب گزارش و خروجی اکسل/چاپ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={() => setShowColumnSelector(prev => !prev)}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition cursor-pointer ${
                showColumnSelector
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>انتخاب ستون‌ها ({toPersianDigits(visibleColumns.length)} از {toPersianDigits(reportData.columns.length)})</span>
            </button>

            <button
              type="button"
              onClick={fetchReport}
              className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>بروزرسانی</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>چاپ رسمی</span>
            </button>

            <button
              type="button"
              onClick={handleExportCustomCsv}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>خروجی اکسل (CSV)</span>
            </button>
          </div>
        </div>

        {/* 5 Core Report Type Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2.5">
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
                className={`p-3 rounded-xl border text-right transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-50/70 hover:bg-slate-100 text-slate-800 border-slate-200'
                }`}
              >
                <div>
                  <span
                    className={`text-[10px] font-bold block mb-1 ${
                      isSelected ? 'text-emerald-300' : 'text-emerald-700'
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
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                ستون‌های دلخواه خود را برای ساخت گزارش انتخاب کنید:
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedColumns(reportData.columns)}
                  className="text-[11px] text-emerald-700 hover:underline font-bold cursor-pointer"
                >
                  انتخاب همه ستون‌ها
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {reportData.columns.map(col => {
                const checked = visibleColumns.includes(col);
                return (
                  <label
                    key={col}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition ${
                      checked
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        : 'bg-white border-slate-200 text-slate-500'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleColumn(col)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>{getColumnLabel(col)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Search & Save Template Bar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-1">
          <div className="lg:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="جستجو در مقادیر گزارش (کد قطعه، شماره سند، شماره ذوب، کلاف...)"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pr-9 pl-3 py-2 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-slate-400"
            />
          </div>

          <div className="lg:col-span-3">
            <select
              value={warehouseId}
              onChange={e => setWarehouseId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 font-semibold focus:outline-none"
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
              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:bg-white"
            />
            <button
              type="submit"
              className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ذخیره گزارش</span>
            </button>
          </form>
        </div>

        {saveSuccess && (
          <div className="text-xs text-emerald-700 font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>قالب گزارش سفارشی شما با موفقیت ذخیره شد.</span>
          </div>
        )}

        {/* Saved Report Templates */}
        {savedConfigs.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
              <Bookmark className="w-3.5 h-3.5 text-amber-600" />
              گزارش‌های ذخیره‌شده شما:
            </span>
            {savedConfigs.map(cfg => (
              <div
                key={cfg.id}
                className="inline-flex items-center rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition border border-slate-200 overflow-hidden"
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
                  className="px-2.5 py-1 cursor-pointer hover:text-emerald-800"
                >
                  {cfg.name}
                </button>
                <button
                  type="button"
                  disabled={deletingConfigId === cfg.id}
                  onClick={() => handleDeleteConfig(cfg.id)}
                  title="حذف قالب ذخیره‌شده"
                  className="px-1.5 py-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border-r border-slate-200 cursor-pointer disabled:opacity-40"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Results Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-emerald-700" />
            <h4 className="text-sm font-bold text-slate-900">{activeReportMeta.title}</h4>
            <span className="text-xs text-slate-500 font-mono">
              ({toPersianDigits(sortedRows.length)} ردیف)
            </span>
          </div>
          <p className="text-xs text-slate-500">{activeReportMeta.desc}</p>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center text-slate-500 text-sm">در حال تولید گزارش...</div>
          ) : reportError ? (
            <div className="p-8 text-center text-amber-800 bg-amber-50/60 text-xs font-medium">
              {reportError}
            </div>
          ) : sortedRows.length === 0 ? (
            <div className="p-10 text-center text-slate-500 text-sm">
              هیچ رکوردی مطابق با فیلترهای انتخابی یافت نشد.
            </div>
          ) : (
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200 font-bold">
                  <th className="p-3 w-10 text-center">#</th>
                  {visibleColumns.map((col, idx) => (
                    <th key={idx} className="p-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleSortClick(col)}
                        className="inline-flex items-center gap-1 hover:text-slate-950 cursor-pointer select-none"
                      >
                        <span>{getColumnLabel(col)}</span>
                        <ArrowUpDown className={`w-3 h-3 ${sortCol === col ? 'text-emerald-700' : 'text-slate-400'}`} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {sortedRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 text-center font-mono text-slate-400">
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

                      return (
                        <td
                          key={cIdx}
                          className={`p-3 whitespace-nowrap ${
                            isNumeric ? 'font-mono font-bold tabular-nums' : ''
                          } ${isHighlightCol ? 'text-emerald-800 font-bold bg-emerald-50/40' : ''}`}
                        >
                          {strVal}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              {hasAnyNumericTotals && (
                <tfoot>
                  <tr className="bg-slate-100/90 border-t-2 border-slate-300 font-bold text-slate-900">
                    <td className="p-3 text-center text-[11px] text-slate-600">جمع</td>
                    {visibleColumns.map((col, cIdx) => {
                      const totalVal = numericTotals[col];
                      return (
                        <td key={cIdx} className="p-3 whitespace-nowrap font-mono tabular-nums">
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

