import React, { useState, useEffect, useCallback } from 'react';
import {
  Flame,
  Droplets,
  Wrench,
  Package,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Download,
  Printer,
  ShoppingCart,
  Search,
  Calendar,
  SlidersHorizontal,
  Edit3,
  FileText,
  X,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import {
  ConsumablesForecastSummary,
  ConsumableForecastItem,
  ConsumableCategory,
} from '../../types/oeeAndConsumables';
import { exportToCsv } from '../../utils/csvExport';
import { formatNumber, toPersianDigits } from '../../utils/formatters';
import { ReportModuleSkeleton } from '../common/Skeleton';
import { useErpRouter } from '../../context/RouterContext';

export const ConsumablesForecastView: React.FC = () => {
  const { traceDocument } = useErpRouter();
  const [data, setData] = useState<ConsumablesForecastSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [horizonDays, setHorizonDays] = useState<number>(30);
  const [growthPercent, setGrowthPercent] = useState<number>(0);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSubView, setActiveSubView] = useState<'forecast_table' | 'requisitions'>('forecast_table');
  const [notice, setNotice] = useState<string | null>(null);
  const [creatingPr, setCreatingPr] = useState(false);

  // Edit Stock / Rate Modal
  const [editingItem, setEditingItem] = useState<ConsumableForecastItem | null>(null);
  const [editStockVal, setEditStockVal] = useState<number>(0);
  const [editRateVal, setEditRateVal] = useState<number>(0);
  const [editSafetyVal, setEditSafetyVal] = useState<number>(0);
  const [savingEdit, setSavingEdit] = useState(false);

  const loadForecast = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.append('horizonDays', String(horizonDays));
      q.append('growth', String(growthPercent));
      if (categoryFilter !== 'ALL') q.append('category', categoryFilter);

      const res = await fetch(`/api/consumables/forecast?${q.toString()}`);
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      }
    } catch (err) {
      console.error('Failed to load consumables forecast:', err);
    } finally {
      setLoading(false);
    }
  }, [horizonDays, growthPercent, categoryFilter]);

  useEffect(() => {
    loadForecast();
  }, [loadForecast]);

  const handleIssueRequisition = async (specificCodes?: string[]) => {
    setCreatingPr(true);
    try {
      const res = await fetch('/api/consumables/requisition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemCodes: specificCodes,
          urgency: 'IMMEDIATE',
          notes: specificCodes
            ? `درخواست خرید اختصاصی برای قلم ${specificCodes.join(', ')} بر اساس هشدار نقطه سفارش`
            : `درخواست خرید تجمیعی برای کلیه اقلام زیر نقطه سفارش (افق ${horizonDays} روزه)`,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setNotice(json.message);
        await loadForecast();
        setActiveSubView('requisitions');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingPr(false);
    }
  };

  const handleOpenEdit = (item: ConsumableForecastItem) => {
    setEditingItem(item);
    setEditStockVal(item.currentStock);
    setEditRateVal(item.standardRatePerDriverUnit);
    setEditSafetyVal(item.minSafetyStock);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setSavingEdit(true);
    try {
      const res = await fetch('/api/consumables/update-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: editingItem.code,
          newStock: editStockVal,
          newStandardRate: editRateVal,
          newMinSafetyStock: editSafetyVal,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setNotice(json.message);
        setEditingItem(null);
        await loadForecast();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleExportCsv = () => {
    if (!data) return;
    const headers = [
      'کد کالای مصرفی',
      'شرح کالا',
      'گروه مصرفی',
      'واحد',
      'مبنای مصرف مهندسی',
      'نرخ مصرف روزانه',
      `نیاز پیش‌بینی (${horizonDays} روز)`,
      'موجودی فعلی انبار',
      'حداقل موجودی اطمینان',
      'نقطه سفارش مجدد (ROP)',
      'پوشش موجودی (روز)',
      'تاریخ تخمینی اتمام',
      'پیشنهاد خرید',
      'برآورد هزینه (ریال)',
      'تأمین‌کننده منتخب',
    ];
    const rows = data.items.map(i => [
      i.code,
      `"${i.name.replace(/"/g, '""')}"`,
      i.categoryLabelFa,
      i.unit,
      i.consumptionDriverLabelFa,
      i.dailyBurnRate,
      i.forecastedGrossRequirement,
      i.currentStock,
      i.minSafetyStock,
      i.reorderPoint,
      i.daysOfSupplyRemaining,
      i.estimatedRunOutDateFa,
      i.suggestedOrderQty,
      i.estimatedTotalOrderCostRials,
      i.preferredSupplierName,
    ]);
    exportToCsv(`KPIMS_Consumables_Forecast_${horizonDays}Days`, headers, rows);
  };

  const filteredItems = (data?.items || []).filter(item => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.code.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      item.categoryLabelFa.toLowerCase().includes(q) ||
      item.preferredSupplierName.toLowerCase().includes(q)
    );
  });

  const categories: { id: string; label: string }[] = [
    { id: 'ALL', label: 'همه مواد مصرفی (۱۰)' },
    { id: 'WELDING_CONSUMABLES', label: 'سیم جوش، الکترود و گاز' },
    { id: 'PRESS_LUBRICANTS', label: 'روغن کشش ورق و هیدرولیک' },
    { id: 'DIE_SPAREPARTS', label: 'قطعات مصرفی قالب (سنبه/فنر)' },
    { id: 'COATING_CHEMICALS', label: 'مواد شیمیایی و پوشش ED' },
    { id: 'PACKAGING_SAFETY', label: 'تسمه پالت و نایلون VCI' },
  ];

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="sap-card p-4 text-[#333333] flex flex-col lg:flex-row lg:items-center justify-between gap-3 no-print">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-sm bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] shrink-0">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-[#333333]">
                ماژول پیش‌بینی مواد مصرفی و ملزومات کارگاهی (Consumables &amp; Supplies Forecasting)
              </h2>
              <span className="px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2]">
                ROP &amp; Burn-Rate Engine
              </span>
            </div>
            <p className="text-xs text-[#666666] mt-0.5">
              پیش‌بینی هوشمند مصرف سیم جوش CO2، الکترود نقطه‌جوش، روغن کشش ورق، سنبه‌های قالب، رنگ ED و ملزومات بسته‌بندی بر اساس ضرب پرس و تیراژ دستور کارها
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleIssueRequisition()}
            disabled={creatingPr}
            className="sap-btn-emphasized flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>صدور خودکار درخواست خرید کسری‌ها (PR)</span>
          </button>

          <button
            type="button"
            onClick={loadForecast}
            disabled={loading}
            className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#007cc0]' : 'text-[#666666]'}`} />
            <span>محاسبه مجدد</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            <Download className="w-3.5 h-3.5 text-[#107e3e]" />
            <span>خروجی اکسل</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            <Printer className="w-3.5 h-3.5 text-[#666666]" />
            <span>چاپ</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3 rounded-sm bg-[#ebf7ef] border border-[#a9dfbf] text-[#107e3e] text-xs flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="w-4 h-4 text-[#107e3e]" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-xs underline cursor-pointer">بستن</button>
        </div>
      )}

      {/* Horizon & Demand Growth Controls */}
      <div className="sap-card p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[#666666] font-medium flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-[#007cc0]" />
            افق زمانی پیش‌بینی:
          </span>
          {[
            { days: 15, label: '۱۵ روز آینده (دو هفته)' },
            { days: 30, label: '۳۰ روز آینده (یک ماه)' },
            { days: 60, label: '۶۰ روز آینده (دو ماه)' },
            { days: 90, label: '۹۰ روز آینده (فصلی)' },
          ].map(h => (
            <button
              key={h.days}
              type="button"
              onClick={() => setHorizonDays(h.days)}
              className={`px-2.5 py-1 rounded-sm font-medium transition cursor-pointer ${
                horizonDays === h.days
                  ? 'bg-[#007cc0] text-white font-bold border border-[#007cc0]'
                  : 'bg-[#f5f5f5] text-[#666666] hover:text-[#333333] border border-[#d9d9d9]'
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-[#666666] flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#e9730c]" />
            ضریب تغییر تیراژ برنامه تولید:
          </span>
          <div className="flex items-center gap-1">
            {[-10, 0, 15, 30, 50].map(g => (
              <button
                key={g}
                type="button"
                onClick={() => setGrowthPercent(g)}
                className={`px-2 py-1 rounded-sm font-mono text-[11px] cursor-pointer transition tabular-nums ${
                  growthPercent === g
                    ? 'bg-[#e9730c] text-white font-bold border border-[#e9730c]'
                    : 'bg-[#f5f5f5] text-[#666666] hover:text-[#333333] border border-[#d9d9d9]'
                }`}
              >
                {g > 0 ? `+${toPersianDigits(g)}٪` : `${toPersianDigits(g)}٪`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Skeleton Loading State */}
      {loading && !data && (
        <ReportModuleSkeleton kpiCount={5} showChart={false} tableRows={6} tableColumns={9} />
      )}

      {/* 5 KPI Summary Cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="sap-card border-r-4 border-r-[#bb0000] p-3 text-right">
            <span className="text-[11px] text-[#bb0000] font-bold flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              اقلام بحرانی (نیاز به خرید فوری)
            </span>
            <div className="text-xl font-bold text-[#bb0000] font-mono tabular-nums mt-1">
              {toPersianDigits(data.criticalShortageCount)} <span className="text-xs font-sans font-normal text-[#666666]">قلم</span>
            </div>
            <span className="text-[10px] text-[#666666] mt-0.5 block">پوشش کمتر از Lead-Time تامین‌کننده</span>
          </div>

          <div className="sap-card border-r-4 border-r-[#e9730c] p-3 text-right">
            <span className="text-[11px] text-[#e9730c] font-bold block">رسیده به نقطه سفارش (ROP)</span>
            <div className="text-xl font-bold text-[#e9730c] font-mono tabular-nums mt-1">
              {toPersianDigits(data.belowReorderPointCount)} <span className="text-xs font-sans font-normal text-[#666666]">قلم</span>
            </div>
            <span className="text-[10px] text-[#666666] mt-0.5 block">نیازمند ثبت سفارش شارژ مجدد</span>
          </div>

          <div className="sap-card border-r-4 border-r-[#107e3e] p-3 text-right">
            <span className="text-[11px] text-[#107e3e] font-bold block">موجودی کافی و ایمن</span>
            <div className="text-xl font-bold text-[#107e3e] font-mono tabular-nums mt-1">
              {toPersianDigits(data.adequateStockCount)} <span className="text-xs font-sans font-normal text-[#666666]">قلم</span>
            </div>
            <span className="text-[10px] text-[#666666] mt-0.5 block">پوشش کامل افق {toPersianDigits(data.horizonDays)} روزه</span>
          </div>

          <div className="sap-card border-r-4 border-r-[#007cc0] p-3 text-right">
            <span className="text-[11px] text-[#007cc0] font-bold block">کمترین روز پوشش موجودی</span>
            <div className="text-xl font-bold text-[#333333] font-mono tabular-nums mt-1">
              {data.lowestDaysOfSupplyItem ? `${toPersianDigits(data.lowestDaysOfSupplyItem.daysRemaining)} روز` : '-'}
            </div>
            <span className="text-[10px] text-[#666666] mt-0.5 block truncate" title={data.lowestDaysOfSupplyItem?.name}>
              {data.lowestDaysOfSupplyItem?.name || '-'}
            </span>
          </div>

          <div className="sap-card p-3 text-right">
            <span className="text-[11px] text-[#007cc0] font-bold block">برآورد بودجه خرید پیشنهادی</span>
            <div className="text-lg font-bold text-[#333333] font-mono tabular-nums mt-1">
              {formatNumber(Math.round(data.totalSuggestedProcurementBudgetRials / 1000000))} <span className="text-[10px] font-sans font-normal text-[#666666]">میلیون ریال</span>
            </div>
            <span className="text-[10px] text-[#666666] mt-0.5 block">برای پوشش کسری و نقطه سفارش</span>
          </div>
        </div>
      )}

      {/* Sub-navigation: Forecast Table vs Purchase Requisitions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#d9d9d9] pb-2 no-print">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubView('forecast_table')}
            className={`px-3.5 py-1.5 rounded-sm text-xs font-bold transition cursor-pointer flex items-center gap-1.5 border ${
              activeSubView === 'forecast_table'
                ? 'bg-[#007cc0] text-white border-[#007cc0]'
                : 'bg-[#ffffff] text-[#666666] hover:text-[#333333] border-[#d9d9d9]'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>ماتریس پیش‌بینی مصرف و نقطه سفارش (ROP)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubView('requisitions')}
            className={`px-3.5 py-1.5 rounded-sm text-xs font-bold transition cursor-pointer flex items-center gap-1.5 border ${
              activeSubView === 'requisitions'
                ? 'bg-[#107e3e] text-white border-[#107e3e]'
                : 'bg-[#ffffff] text-[#666666] hover:text-[#333333] border-[#d9d9d9]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>درخواست‌های خرید تدارکات صادره (PR)</span>
            {data && (
              <span className={`px-1.5 py-0.2 rounded-sm text-[10px] font-mono tabular-nums ${activeSubView === 'requisitions' ? 'bg-white/20 text-white' : 'bg-[#f0f0f0] text-[#333333]'}`}>
                {toPersianDigits(data.activeRequisitions.length)}
              </span>
            )}
          </button>
        </div>

        {activeSubView === 'forecast_table' && (
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-[#666666] absolute right-2.5 top-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="جستجو در نام یا کد کالای مصرفی..."
              className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm pr-8 pl-3 py-1 text-xs text-[#333333] placeholder:text-[#888888] focus:outline-none focus:border-[#007cc0]"
            />
          </div>
        )}
      </div>

      {activeSubView === 'forecast_table' ? (
        <>
          {/* Category Filter Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-print">
            {categories.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-2.5 py-1 rounded-sm font-medium whitespace-nowrap transition cursor-pointer border ${
                  categoryFilter === cat.id
                    ? 'bg-[#e5f3fa] text-[#007cc0] border-[#007cc0] font-bold'
                    : 'bg-[#ffffff] text-[#666666] hover:text-[#333333] border-[#d9d9d9]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Consumables Forecast Table */}
          <div className="sap-card overflow-hidden printable-area">
            {/* Print Header shown only during print */}
            <div className="hidden print:block p-4 border-b border-[#d9d9d9] text-center">
              <span className="text-xs text-[#666666] block">شرکت تولیدی قطعات خودرو (زنجیره تامین ساپکو)</span>
              <h2 className="text-base font-bold text-[#333333] mt-1">گزارش رسمی پیش‌بینی مواد مصرفی و ملزومات کارگاهی (Consumables ROP)</h2>
              <span className="text-[10px] text-[#666666] font-mono">افق پیش‌بینی: {toPersianDigits(horizonDays)} روز کاری</span>
            </div>

            <div className="overflow-x-auto">
              <table className="sap-table-compact w-full text-right text-xs">
                <thead>
                  <tr>
                    <th>کد و شرح کالای مصرفی</th>
                    <th>مبنای مهندسی مصرف</th>
                    <th className="text-center">مصرف روزانه</th>
                    <th className="text-center text-[#007cc0] font-bold">
                      نیاز {toPersianDigits(horizonDays)} روزه
                    </th>
                    <th className="text-center text-[#333333] font-bold">موجودی فعلی</th>
                    <th className="text-center">نقطه سفارش (ROP)</th>
                    <th className="text-center font-bold">پوشش موجودی (روز)</th>
                    <th className="text-center">تاریخ اتمام</th>
                    <th className="text-center text-[#e9730c] font-bold">پیشنهاد خرید</th>
                    <th className="text-center">وضعیت</th>
                    <th className="text-center no-print">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e8e8] font-mono tabular-nums">
                  {filteredItems.map(item => (
                    <tr key={item.id} className="hover:bg-[#f5f5f5] transition">
                      <td className="font-sans">
                        <div className="font-bold text-[#333333]">{item.name}</div>
                        <div className="text-[11px] text-[#666666] font-mono flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => traceDocument(item.code, 'INVENTORY_LEDGER')}
                            className="sap-doc-link font-mono"
                            title="رهگیری در کاردکس انبار"
                          >
                            {item.code}
                          </button>
                          <span>•</span>
                          <span className="font-sans text-[#007cc0]">{item.categoryLabelFa}</span>
                        </div>
                      </td>
                      <td className="font-sans">
                        <div className="text-[11px] text-[#333333]">{item.consumptionDriverLabelFa}</div>
                        <div className="text-[10px] text-[#666666] font-mono">
                          ضریب: {toPersianDigits(item.standardRatePerDriverUnit)} {item.unit} (پرت: {toPersianDigits(item.wasteAllowancePercent)}٪)
                        </div>
                      </td>
                      <td className="text-center text-[#333333]">
                        {toPersianDigits(item.dailyBurnRate)} <span className="text-[10px] text-[#666666]">{item.unit}</span>
                      </td>
                      <td className="text-center font-bold text-[#007cc0] text-xs">
                        {formatNumber(item.forecastedGrossRequirement)} <span className="text-[10px] font-normal">{item.unit}</span>
                      </td>
                      <td className="text-center font-bold text-[#333333]">
                        {formatNumber(item.currentStock)} <span className="text-[10px] font-normal text-[#666666]">{item.unit}</span>
                      </td>
                      <td className="text-center text-[#333333]">
                        {formatNumber(item.reorderPoint)}
                        <span className="block text-[10px] text-[#666666]">اطمینان: {formatNumber(item.minSafetyStock)}</span>
                      </td>
                      <td className="text-center font-bold">
                        <span
                          className={`px-1.5 py-0.5 rounded-sm text-[11px] border ${
                            item.daysOfSupplyRemaining <= item.supplierLeadTimeDays
                              ? 'bg-[#ffecec] text-[#bb0000] border-[#f5b7b1]'
                              : item.daysOfSupplyRemaining <= 20
                              ? 'bg-[#fff4e5] text-[#e9730c] border-[#f9d6a7]'
                              : 'bg-[#ebf7ef] text-[#107e3e] border-[#a9dfbf]'
                          }`}
                        >
                          {toPersianDigits(item.daysOfSupplyRemaining)} روز
                        </span>
                      </td>
                      <td className="text-center text-[11px] text-[#333333]">
                        {item.estimatedRunOutDateFa}
                      </td>
                      <td className="text-center font-bold text-[#e9730c] text-xs">
                        {item.suggestedOrderQty > 0 ? (
                          <div>
                            <span>{formatNumber(item.suggestedOrderQty)} {item.unit}</span>
                            <span className="block text-[10px] text-[#666666] font-normal">
                              {formatNumber(Math.round(item.estimatedTotalOrderCostRials / 1000000))} م.ریال
                            </span>
                          </div>
                        ) : (
                          <span className="text-[#888888]">-</span>
                        )}
                      </td>
                      <td className="text-center font-sans">
                        {item.status === 'CRITICAL_SHORTAGE' && (
                          <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold bg-[#ffecec] text-[#bb0000] border border-[#f5b7b1]">
                            کسری فوری
                          </span>
                        )}
                        {item.status === 'BELOW_ROP' && (
                          <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold bg-[#fff4e5] text-[#e9730c] border border-[#f9d6a7]">
                            نقطه سفارش
                          </span>
                        )}
                        {item.status === 'ADEQUATE' && (
                          <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold bg-[#ebf7ef] text-[#107e3e] border border-[#a9dfbf]">
                            موجودی کافی
                          </span>
                        )}
                      </td>
                      <td className="text-center font-sans no-print">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(item)}
                            title="تنظیم موجودی یا ضریب مصرف"
                            className="sap-btn-standard p-1"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {item.suggestedOrderQty > 0 && (
                            <button
                              type="button"
                              onClick={() => handleIssueRequisition([item.code])}
                              title="صدور درخواست خرید برای این قلم"
                              className="px-2 py-0.5 rounded-sm bg-[#ebf7ef] hover:bg-[#107e3e] text-[#107e3e] hover:text-white border border-[#a9dfbf] text-[10px] font-bold cursor-pointer transition"
                            >
                              خرید
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Active Purchase Requisitions View */
        <div className="space-y-4">
          {data?.activeRequisitions.map(pr => (
            <div key={pr.id} className="sap-card p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e8e8e8] pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-[#007cc0]">{pr.prNumber}</span>
                    <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold bg-[#ebf7ef] text-[#107e3e] border border-[#a9dfbf]">
                      {pr.status === 'APPROVED_BY_PLANT_MGR' ? 'تأیید مدیریت کارخانه' : 'در انتظار تأیید تدارکات'}
                    </span>
                  </div>
                  <div className="text-xs text-[#666666] mt-1">
                    درخواست‌کننده: {pr.requestedBy} • تاریخ صدور: <span className="font-mono">{pr.createdAtFa}</span>
                  </div>
                </div>
                <div className="text-left font-mono tabular-nums">
                  <span className="text-[11px] text-[#666666] block font-sans">جمع برآورد مالی سفارش:</span>
                  <span className="text-base font-bold text-[#e9730c]">
                    {formatNumber(pr.totalEstimatedCostRials)} ریال
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto border border-[#d9d9d9] rounded-sm">
                <table className="sap-table-compact w-full text-right text-xs">
                  <thead>
                    <tr>
                      <th>کد کالا</th>
                      <th>شرح کالای مصرفی</th>
                      <th className="text-center">موجودی فعلی</th>
                      <th className="text-center text-[#107e3e]">مقدار سفارش</th>
                      <th>تأمین‌کننده منتخب</th>
                      <th className="text-left">برآورد مبلغ (ریال)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e8e8] font-mono tabular-nums">
                    {pr.lines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-[#f5f5f5]">
                        <td>
                          <button
                            type="button"
                            onClick={() => traceDocument(line.consumableCode, 'INVENTORY_LEDGER')}
                            className="sap-doc-link font-mono font-bold"
                          >
                            {line.consumableCode}
                          </button>
                        </td>
                        <td className="font-sans text-[#333333]">{line.consumableName}</td>
                        <td className="text-center text-[#666666]">
                          {formatNumber(line.currentStock)} {line.unit}
                        </td>
                        <td className="text-center font-bold text-[#107e3e]">
                          {formatNumber(line.orderQuantity)} {line.unit}
                        </td>
                        <td className="font-sans text-[#333333]">{line.supplierName}</td>
                        <td className="text-left text-[#333333] font-bold">
                          {formatNumber(line.estimatedCostRials)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pr.notes && (
                <div className="text-[11px] text-[#666666] bg-[#f5f5f5] p-2.5 rounded-sm border border-[#e8e8e8]">
                  توضیحات: {pr.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit Consumable Stock / Rate Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-[#333333]/40 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-[#d9d9d9] rounded-sm w-full max-w-md p-5 shadow-md space-y-4">
            <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[#333333]">تنظیم موجودی و ضریب مصرف مهندسی</h3>
                <p className="text-xs text-[#666666] mt-0.5">{editingItem.name}</p>
              </div>
              <button onClick={() => setEditingItem(null)} className="text-[#666666] hover:text-[#333333] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#333333] font-medium mb-1">
                  موجودی آزاد فعلی در انبار ({editingItem.unit}):
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={editStockVal}
                  onChange={e => setEditStockVal(Number(e.target.value))}
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-[#333333] font-mono focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <div>
                <label className="block text-[#333333] font-medium mb-1">
                  ضریب مصرف استاندارد ({editingItem.consumptionDriverLabelFa}):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editRateVal}
                  onChange={e => setEditRateVal(Number(e.target.value))}
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-[#333333] font-mono focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <div>
                <label className="block text-[#333333] font-medium mb-1">
                  حداقل موجودی اطمینان (Safety Stock - {editingItem.unit}):
                </label>
                <input
                  type="number"
                  step="1"
                  value={editSafetyVal}
                  onChange={e => setEditSafetyVal(Number(e.target.value))}
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-[#333333] font-mono focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#e8e8e8]">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="sap-btn-standard px-4 py-1.5"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="sap-btn-emphasized px-5 py-1.5"
                >
                  {savingEdit ? 'در حال ذخیره...' : 'ذخیره و بازمحاسبه پیش‌بینی'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
