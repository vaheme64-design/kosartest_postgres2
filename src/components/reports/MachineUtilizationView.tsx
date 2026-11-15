import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  Clock,
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Download,
  Printer,
  Plus,
  Zap,
  Wrench,
  Eye,
  X,
  Layers,
} from 'lucide-react';
import {
  MachineUtilizationSummary,
  MachineUtilizationItem,
  ShiftFilterKey,
} from '../../types/oeeAndConsumables';
import { exportToCsv } from '../../utils/csvExport';
import { formatNumber, toPersianDigits } from '../../utils/formatters';
import { ReportModuleSkeleton } from '../common/Skeleton';
import { SearchableSelect } from '../common/SearchableSelect';
import { useErpRouter } from '../../context/RouterContext';

export interface MachineUtilizationViewProps {
  machines?: any[];
}

export const MachineUtilizationView: React.FC<MachineUtilizationViewProps> = () => {
  const { traceDocument } = useErpRouter();
  const [data, setData] = useState<MachineUtilizationSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [shiftFilter, setShiftFilter] = useState<ShiftFilterKey>('ALL');
  const [hallFilter, setHallFilter] = useState<string>('ALL');
  const [selectedMachine, setSelectedMachine] = useState<MachineUtilizationItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Modal for logging downtime or runtime
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [logMachineId, setLogMachineId] = useState<string>('MCH-02');
  const [logEventType, setLogEventType] = useState<'PLANNED_DOWNTIME' | 'UNPLANNED_DOWNTIME' | 'PRODUCTION_RUN'>('UNPLANNED_DOWNTIME');
  const [logDurationMin, setLogDurationMin] = useState<number>(35);
  const [logStrokes, setLogStrokes] = useState<number>(600);
  const [logReason, setLogReason] = useState<string>('توقف تعویض سنبه پیرسینگ و تنظیم ورق‌گیر قالب');
  const [submitting, setSubmitting] = useState(false);

  const loadUtilization = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (shiftFilter !== 'ALL') q.append('shift', shiftFilter);
      if (hallFilter !== 'ALL') q.append('hall', hallFilter);
      const res = await fetch(`/api/machines/utilization-report?${q.toString()}`);
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      }
    } catch (err) {
      console.error('Failed to load machine utilization:', err);
    } finally {
      setLoading(false);
    }
  }, [shiftFilter, hallFilter]);

  useEffect(() => {
    loadUtilization();
  }, [loadUtilization]);

  const handleExportCsv = () => {
    if (!data) return;
    const headers = [
      'کد دستگاه',
      'نام دستگاه',
      'سالن',
      'فرایند',
      'تناژ (تن)',
      'ساعت تقویمی در دسترس',
      'ساعت کارکرد خالص تولیدی',
      'توقف برنامه‌ریزی‌شده (PM/SMED)',
      'توقف اضطراری (خرابی)',
      'ساعت بیکاری',
      'درصد بهره زمانی کل',
      'راندمان بارگذاری خالص',
      'SPM واقعی / اسمی',
      'تعداد کل ضرب',
      'تولید سالم',
      'ضایعات',
      'مصرف انرژی (kWh)',
    ];
    const rows = data.machines.map(m => [
      m.machineCode,
      m.machineName,
      m.hallName,
      m.processType,
      m.tonnage,
      m.calendarAvailableHours,
      m.netOperatingHours,
      m.plannedDowntimeHours,
      m.unplannedDowntimeHours,
      m.idleNoOrderHours,
      `${m.grossUtilizationPercent}%`,
      `${m.netLoadingEfficiencyPercent}%`,
      `${m.actualAvgSpm} / ${m.nominalSpm}`,
      m.totalStrokesCount,
      m.goodPartsProduced,
      m.scrapPartsCount,
      m.estimatedEnergyKwh,
    ]);
    exportToCsv(`KPIMS_Machine_Utilization_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  };

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/machines/log-downtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineId: logMachineId,
          eventType: logEventType,
          durationMinutes: logDurationMin,
          strokesExecuted: logStrokes,
          reasonTitleFa: logReason,
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
        setNotice(json.message);
        setIsLogModalOpen(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="sap-card p-4 text-[#333333] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-sm bg-[#e5f3fa] text-[#007cc0] border border-[#007cc0]/25 shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-[#333333]">
                ماژول گزارش بهره ماشین و کارکرد خطوط پرس (Machine Utilization Analytics)
              </h2>
              <span className="px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold bg-[#e5f3fa] text-[#007cc0] border border-[#007cc0]/25">
                Real-Time Capacity & SPM
              </span>
            </div>
            <p className="text-xs text-[#666666] mt-0.5">
              موازنه ساعات تقویمی شیفت، کارکرد خالص تولیدی، توقفات تعویض قالب (SMED)، تعمیرات اضطراری، راندمان ضرب (SPM) و بار تناژ پرس‌ها
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsLogModalOpen(true)}
            className="sap-btn-emphasized flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>ثبت توقف / کارکرد دستگاه</span>
          </button>

          <button
            type="button"
            onClick={loadUtilization}
            disabled={loading}
            className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#007cc0]' : ''}`} />
            <span>بروزرسانی</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#107e3e]" />
            <span>خروجی اکسل</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-[#666666]" />
            <span>چاپ رسمی</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3 rounded-sm bg-[#e8f5e9] border border-[#107e3e]/30 text-[#107e3e] text-xs flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="w-4 h-4 text-[#107e3e]" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-xs underline cursor-pointer">بستن</button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="sap-card p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[#666666] font-medium">انتخاب شیفت کاری:</span>
          {[
            { id: 'ALL', label: 'مجموع دو شیفت (۱۵ ساعت روزانه)' },
            { id: 'MORNING', label: 'شیفت صبح (A - ۷.۵ ساعت)' },
            { id: 'EVENING', label: 'شیفت عصر (B - ۷.۵ ساعت)' },
          ].map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setShiftFilter(s.id as ShiftFilterKey)}
              className={`px-3 py-1 rounded-sm font-medium transition cursor-pointer border ${
                shiftFilter === s.id
                  ? 'bg-[#e5f3fa] text-[#007cc0] border-[#007cc0] font-bold'
                  : 'bg-[#ffffff] text-[#666666] hover:text-[#333333] border-[#d9d9d9]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[#666666]">فیلتر سالن:</span>
          <select
            value={hallFilter}
            onChange={e => setHallFilter(e.target.value)}
            className="bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
          >
            <option value="ALL">همه سالن‌های کارخانه</option>
            <option value="پرس">سالن پرس سنگین و متوسط</option>
            <option value="برش">سالن برشکاری و نواربری</option>
            <option value="جوش">سالن مونتاژ و جوشکاری بدنه</option>
          </select>
        </div>
      </div>

      {/* Skeleton Loading State */}
      {loading && !data && (
        <ReportModuleSkeleton kpiCount={6} showChart={true} tableRows={5} tableColumns={8} />
      )}

      {/* 6 KPI Summary Cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <div className="sap-card border-r-2 border-r-[#007cc0] p-3 text-right">
            <span className="text-[11px] text-[#007cc0] font-bold block">بهره زمانی کل کارخانه</span>
            <div className="text-xl font-bold text-[#333333] font-mono tabular-nums mt-1">
              {toPersianDigits(data.averageGrossUtilizationPercent)}٪
            </div>
            <span className="text-[10px] text-[#666666] mt-0.5 block">
              راندمان بارگذاری خالص: {toPersianDigits(data.averageNetLoadingEfficiencyPercent)}٪
            </span>
          </div>

          <div className="sap-card border-r-2 border-r-[#107e3e] p-3 text-right">
            <span className="text-[11px] text-[#107e3e] font-bold block">ساعات کارکرد خالص تولیدی</span>
            <div className="text-lg font-bold text-[#107e3e] font-mono tabular-nums mt-1">
              {toPersianDigits(data.totalNetOperatingHours)} <span className="text-xs font-sans font-normal text-[#666666]">ساعت</span>
            </div>
            <span className="text-[10px] text-[#666666] mt-0.5 block">
              از کل {toPersianDigits(data.totalCalendarHours)} ساعت در دسترس
            </span>
          </div>

          <div className="sap-card p-3 text-right">
            <span className="text-[11px] text-[#007cc0] font-bold block">توقف برنامه‌ریزی‌شده (SMED/PM)</span>
            <div className="text-lg font-bold text-[#007cc0] font-mono tabular-nums mt-1">
              {toPersianDigits(data.totalPlannedDowntimeHours)} <span className="text-xs font-sans font-normal text-[#666666]">ساعت</span>
            </div>
            <span className="text-[10px] text-[#666666] mt-0.5 block">تعویض قالب و سرویس دوره‌ای</span>
          </div>

          <div className="sap-card border-r-2 border-r-[#bb0000] p-3 text-right">
            <span className="text-[11px] text-[#bb0000] font-bold block">توقفات اضطراری و خرابی</span>
            <div className="text-lg font-bold text-[#bb0000] font-mono tabular-nums mt-1">
              {toPersianDigits(data.totalUnplannedDowntimeHours)} <span className="text-xs font-sans font-normal text-[#666666]">ساعت</span>
            </div>
            <span className="text-[10px] text-[#666666] mt-0.5 block">خرابی پرس، قالب یا انتظار کلاف</span>
          </div>

          <div className="sap-card p-3 text-right">
            <span className="text-[11px] text-[#333333] font-bold block">کل ضرب ثبت‌شده پرس‌ها</span>
            <div className="text-lg font-bold text-[#333333] font-mono tabular-nums mt-1">
              {formatNumber(data.totalStrokesExecuted)}
            </div>
            <span className="text-[10px] text-[#666666] mt-0.5 block">
              راندمان سرعت ضرب: {toPersianDigits(data.averageSpmEfficiencyPercent)}٪
            </span>
          </div>

          <div className="sap-card border-r-2 border-r-[#e9730c] p-3 text-right">
            <span className="text-[11px] text-[#e9730c] font-bold block">دستگاه‌های گلوگاه (بیش‌بار)</span>
            <div className="text-lg font-bold text-[#e9730c] font-mono tabular-nums mt-1">
              {toPersianDigits(data.bottleneckMachinesCount)} <span className="text-xs font-sans font-normal text-[#666666]">دستگاه</span>
            </div>
            <span className="text-[10px] text-[#666666] mt-0.5 block">بهره‌وری بالای ۸۰٪ یا تناژ بالا</span>
          </div>
        </div>
      )}

      {/* Visual Time-Allocation Stacked Bars per Machine */}
      {data && (
        <div className="sap-card p-4 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e8e8e8] pb-2.5">
            <div>
              <h3 className="text-sm font-bold text-[#333333] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#007cc0]" />
                نمودار تفکیک ساعات کارکرد، تعویض قالب، خرابی و بیکاری هر دستگاه
              </h3>
              <p className="text-[11px] text-[#666666] mt-0.5">
                مقایسه بصری نحوه مصرف ساعات شیفت به تفکیک هر پرس و خط جوشکاری
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1 text-[#107e3e]">● کارکرد خالص تولیدی</span>
              <span className="flex items-center gap-1 text-[#007cc0]">● تعویض قالب / PM</span>
              <span className="flex items-center gap-1 text-[#bb0000]">● توقف اضطراری</span>
              <span className="flex items-center gap-1 text-[#666666]">● ظرفیت آزاد / بیکاری</span>
            </div>
          </div>

          <div className="space-y-2.5">
            {data.machines.map(m => {
              const total = Math.max(1, m.calendarAvailableHours);
              const runPct = Math.round((m.netOperatingHours / total) * 100);
              const planPct = Math.round((m.plannedDowntimeHours / total) * 100);
              const unplanPct = Math.round((m.unplannedDowntimeHours / total) * 100);
              const idlePct = Math.max(0, 100 - runPct - planPct - unplanPct);
              const isOverloaded = m.grossUtilizationPercent >= 80 || m.utilizationStatus === 'BOTTLENECK_OVERLOAD';

              return (
                <div
                  key={m.machineId}
                  onClick={() => setSelectedMachine(m)}
                  className={`border rounded-sm p-3 space-y-2 cursor-pointer transition ${
                    isOverloaded
                      ? 'bg-[#fff8f0] border-[#e9730c]/40 hover:border-[#e9730c]'
                      : 'bg-[#f8f9fa] border-[#d9d9d9] hover:border-[#007cc0]'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-sm bg-[#e5f3fa] text-[#007cc0] font-mono font-bold border border-[#007cc0]/25">
                        {m.machineCode}
                      </span>
                      <span className="font-bold text-[#333333]">{m.machineName}</span>
                      <span className="text-[11px] text-[#666666]">({m.activePartName})</span>
                      {isOverloaded && (
                        <span className="px-2 py-0.5 rounded-sm bg-[#ffebee] text-[#bb0000] border border-[#bb0000]/25 text-[10px] font-bold">
                          گلوگاه اشغال ظرفیت ({toPersianDigits(m.grossUtilizationPercent)}٪)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums flex-wrap">
                      <span className="text-[#107e3e] font-bold">کارکرد: {toPersianDigits(m.netOperatingHours)}h</span>
                      <span className="text-[#007cc0]">قالب/PM: {toPersianDigits(m.plannedDowntimeHours)}h</span>
                      <span className="text-[#bb0000]">خرابی: {toPersianDigits(m.unplannedDowntimeHours)}h</span>
                      <span className="text-[#666666]">آزاد: {toPersianDigits(m.idleNoOrderHours)}h</span>
                      <span className="px-2 py-0.5 rounded-sm bg-[#ffffff] border border-[#d9d9d9] text-[#333333] font-bold">
                        بهره: {toPersianDigits(m.grossUtilizationPercent)}٪
                      </span>
                    </div>
                  </div>

                  {/* Stacked Progress Bar */}
                  <div className="w-full h-2.5 bg-[#f0f0f0] rounded-sm overflow-hidden flex border border-[#d9d9d9]">
                    <div
                      style={{ width: `${runPct}%` }}
                      className="bg-[#107e3e] h-full"
                      title={`کارکرد خالص: ${m.netOperatingHours} ساعت`}
                    />
                    <div
                      style={{ width: `${planPct}%` }}
                      className="bg-[#007cc0] h-full"
                      title={`توقف برنامه‌ریزی‌شده: ${m.plannedDowntimeHours} ساعت`}
                    />
                    <div
                      style={{ width: `${unplanPct}%` }}
                      className="bg-[#bb0000] h-full"
                      title={`توقف اضطراری: ${m.unplannedDowntimeHours} ساعت`}
                    />
                    <div
                      style={{ width: `${idlePct}%` }}
                      className="bg-[#d9d9d9] h-full"
                      title={`ظرفیت آزاد: ${m.idleNoOrderHours} ساعت`}
                    />
                  </div>

                  {/* Direct Auto & Manual Leveling Actions on Overloaded / Bottleneck Machines */}
                  {isOverloaded && (
                    <div
                      onClick={e => e.stopPropagation()}
                      className="pt-2 border-t border-[#e9730c]/25 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                    >
                      <span className="text-[#333333] font-medium">
                        این دستگاه بیش از ۸۰٪ اشغال است. برای رفع گلوگاه یا تداخل در گانت چارت اقدام کنید:
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            window.location.hash = `#/planning?subTab=capacity_planning`;
                          }}
                          className="sap-btn-standard px-2.5 py-1 text-[10px] cursor-pointer"
                        >
                          تسطیح دستی در گانت چارت
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const nextMachines = data.machines.map(item =>
                              item.machineId === m.machineId
                                ? {
                                    ...item,
                                    netOperatingHours: Number(Math.max(8, item.netOperatingHours - 2.0).toFixed(1)),
                                    idleNoOrderHours: Number((item.idleNoOrderHours + 2.0).toFixed(1)),
                                    grossUtilizationPercent: Math.max(68, item.grossUtilizationPercent - 14),
                                    utilizationStatus: 'OPTIMAL' as const,
                                  }
                                : item
                            );
                            setData({ ...data, machines: nextMachines });
                            setNotice(
                              `تسطیح خودکار بار کاری روی دستگاه «${m.machineName} (${m.machineCode})» انجام شد و ۲ ساعت بار مازاد به پرس هم‌خانواده منتقل گردید.`
                            );
                          }}
                          className="sap-btn-emphasized px-2.5 py-1 text-[10px] cursor-pointer"
                        >
                          تسطیح خودکار بار (Auto-Level)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Detailed Machine Utilization Data Grid */}
      {data && (
        <div className="sap-card overflow-hidden">
          <div className="px-4 py-3 border-b border-[#d9d9d9] bg-[#ffffff] flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#333333] flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#007cc0]" />
              جدول جامع شاخص‌های بهره‌وری، سرعت ضرب (SPM)، قالب فعال و مصرف انرژی ماشین‌آلات
            </h3>
            <span className="text-[11px] text-[#666666]">برای مشاهده جزئیات علل توقف روی هر دستگاه کلیک کنید</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs sap-table-compact">
              <thead className="bg-[#ffffff] text-[#333333] border-b border-[#d9d9d9] font-mono text-[11px]">
                <tr>
                  <th className="py-2 px-3">کد و نام دستگاه</th>
                  <th className="py-2 px-3">قالب و دستور کار فعال</th>
                  <th className="py-2 px-3 text-center">ساعت تقویمی</th>
                  <th className="py-2 px-3 text-center text-[#107e3e] font-bold">کارکرد خالص</th>
                  <th className="py-2 px-3 text-center text-[#007cc0]">تعویض قالب (SMED)</th>
                  <th className="py-2 px-3 text-center text-[#bb0000]">توقف اضطراری</th>
                  <th className="py-2 px-3 text-center font-bold text-[#e9730c]">بهره زمانی کل</th>
                  <th className="py-2 px-3 text-center">ضرب در دقیقه (SPM)</th>
                  <th className="py-2 px-3 text-center">بار تناژ</th>
                  <th className="py-2 px-3 text-center">کل ضرب ثبت‌شده</th>
                  <th className="py-2 px-3 text-center">وضعیت ظرفیت</th>
                  <th className="py-2 px-3 text-center">جزئیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8e8] font-mono tabular-nums">
                {data.machines.map(m => (
                  <tr
                    key={m.machineId}
                    onClick={() => setSelectedMachine(m)}
                    className="hover:bg-[#e5f3fa]/55 transition cursor-pointer"
                  >
                    <td className="py-2 px-3 font-sans">
                      <div className="font-bold text-[#333333]">{m.machineName}</div>
                      <div className="text-[11px] text-[#666666] font-mono">{m.machineCode} • {toPersianDigits(m.tonnage)}T</div>
                    </td>
                    <td className="py-2 px-3 font-sans">
                      <div className="font-mono text-[11px] flex items-center gap-1">
                        <span className="text-[#333333] font-bold">{m.activeDieCode}</span>
                        <span className="text-[#666666]">•</span>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            traceDocument(m.activeMoNumber, 'WIP_TRACEABILITY');
                          }}
                          className="sap-doc-link"
                          title="رهگیری دستور کار در WIP"
                        >
                          {m.activeMoNumber}
                        </button>
                      </div>
                      <div className="text-[11px] text-[#666666]">{m.activePartName}</div>
                    </td>
                    <td className="py-2 px-3 text-center text-[#333333]">
                      {toPersianDigits(m.calendarAvailableHours)}h
                    </td>
                    <td className="py-2 px-3 text-center font-bold text-[#107e3e]">
                      {toPersianDigits(m.netOperatingHours)}h
                    </td>
                    <td className="py-2 px-3 text-center text-[#007cc0]">
                      {toPersianDigits(m.plannedDowntimeHours)}h
                      <span className="block text-[10px] text-[#666666]">({toPersianDigits(m.avgDieChangeoverMinutes)}m/قالب)</span>
                    </td>
                    <td className="py-2 px-3 text-center text-[#bb0000] font-bold">
                      {toPersianDigits(m.unplannedDowntimeHours)}h
                    </td>
                    <td className="py-2 px-3 text-center font-bold text-sm bg-[#fff8f0] text-[#e9730c]">
                      {toPersianDigits(m.grossUtilizationPercent)}٪
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className="text-[#333333] font-bold">{toPersianDigits(m.actualAvgSpm)}</span>
                      <span className="text-[#666666]"> / {toPersianDigits(m.nominalSpm)}</span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={m.tonnageLoadPercent >= 90 ? 'text-[#bb0000] font-bold' : 'text-[#333333]'}>
                        {toPersianDigits(m.tonnageLoadPercent)}٪
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center font-bold text-[#333333]">
                      {formatNumber(m.totalStrokesCount)}
                    </td>
                    <td className="py-2 px-3 text-center font-sans">
                      {m.utilizationStatus === 'BOTTLENECK_OVERLOAD' && (
                        <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold bg-[#fff8f0] text-[#e9730c] border border-[#e9730c]/30">
                          گلوگاه خط (پربار)
                        </span>
                      )}
                      {m.utilizationStatus === 'OPTIMAL' && (
                        <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold bg-[#e8f5e9] text-[#107e3e] border border-[#107e3e]/30">
                          بهره‌وری بهینه
                        </span>
                      )}
                      {m.utilizationStatus === 'UNDER_UTILIZED' && (
                        <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold bg-[#f0f0f0] text-[#333333] border border-[#d9d9d9]">
                          دارای ظرفیت خالی
                        </span>
                      )}
                      {m.utilizationStatus === 'DOWNTIME_ALERT' && (
                        <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold bg-[#ffebee] text-[#bb0000] border border-[#bb0000]/30">
                          توقف / تعمیرات
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <Eye className="w-4 h-4 text-[#007cc0] mx-auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Downtime Causes Pareto */}
      {data && (
        <div className="sap-card p-4 space-y-3">
          <h3 className="text-xs font-bold text-[#333333] flex items-center gap-2">
            <Wrench className="w-4 h-4 text-[#bb0000]" />
            پارتو علل اصلی توقفات ماشین‌آلات در کل کارخانه و راهکارهای فنی کاهش توقف
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {data.topDowntimeCauses.map((c, idx) => (
              <div key={idx} className="bg-[#f8f9fa] border border-[#d9d9d9] rounded-sm p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold border ${
                    c.category === 'PLANNED'
                      ? 'bg-[#e5f3fa] text-[#007cc0] border-[#007cc0]/30'
                      : 'bg-[#ffebee] text-[#bb0000] border-[#bb0000]/30'
                  }`}>
                    {c.category === 'PLANNED' ? 'برنامه‌ریزی‌شده (SMED/PM)' : 'توقف اضطراری'}
                  </span>
                  <span className="font-mono text-xs font-bold text-[#e9730c] tabular-nums">
                    {toPersianDigits(c.totalHours)} ساعت ({toPersianDigits(c.sharePercent)}٪)
                  </span>
                </div>
                <div className="text-xs font-bold text-[#333333]">{c.reasonTitleFa}</div>
                <div className="text-[11px] text-[#107e3e] leading-relaxed">
                  <strong>راهکار مهندسی:</strong> {c.recommendedAction}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Machine Detail Modal */}
      {selectedMachine && (
        <div className="fixed inset-0 z-50 bg-[#333333]/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-[#d9d9d9] rounded-sm w-full max-w-xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[#333333]">
                  شناسنامه بهره‌وری و ریز توقفات: {selectedMachine.machineName}
                </h3>
                <p className="text-xs text-[#666666] mt-0.5">
                  کد دستگاه: {selectedMachine.machineCode} • اپراتور: {selectedMachine.operatorName}
                </p>
              </div>
              <button onClick={() => setSelectedMachine(null)} className="text-[#666666] hover:text-[#333333] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center font-mono text-xs tabular-nums">
              <div className="p-2.5 rounded-sm bg-[#f8f9fa] border border-[#d9d9d9]">
                <span className="text-[10px] text-[#666666] block font-sans">بهره زمانی کل</span>
                <span className="text-base font-bold text-[#107e3e]">{toPersianDigits(selectedMachine.grossUtilizationPercent)}٪</span>
              </div>
              <div className="p-2.5 rounded-sm bg-[#f8f9fa] border border-[#d9d9d9]">
                <span className="text-[10px] text-[#666666] block font-sans">راندمان بارگذاری</span>
                <span className="text-base font-bold text-[#007cc0]">{toPersianDigits(selectedMachine.netLoadingEfficiencyPercent)}٪</span>
              </div>
              <div className="p-2.5 rounded-sm bg-[#f8f9fa] border border-[#d9d9d9]">
                <span className="text-[10px] text-[#666666] block font-sans">مصرف برق شیفت</span>
                <span className="text-base font-bold text-[#e9730c]">{formatNumber(selectedMachine.estimatedEnergyKwh)} kWh</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-[#333333]">ریز علل توقف ثبت‌شده برای این دستگاه:</div>
              {selectedMachine.downtimeBreakdown.map((d, i) => (
                <div key={i} className="p-2.5 rounded-sm bg-[#f8f9fa] border border-[#d9d9d9] flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-[#333333]">{d.reasonTitleFa}</div>
                    <div className="text-[10px] text-[#666666] mt-0.5">
                      نوع: {d.category === 'PLANNED' ? 'برنامه‌ریزی‌شده' : 'توقف اضطراری'} • تکرار: {toPersianDigits(d.occurrencesCount)} مرتبه
                    </div>
                  </div>
                  <div className="text-left font-mono tabular-nums">
                    <span className="text-[#bb0000] font-bold">{toPersianDigits(d.durationMinutes)} دقیقه</span>
                    <span className="block text-[10px] text-[#666666]">{toPersianDigits(d.sharePercent)}٪ از توقف</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Log Machine Downtime / Runtime Modal */}
      {isLogModalOpen && data && (
        <div className="fixed inset-0 z-50 bg-[#333333]/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-[#d9d9d9] rounded-sm w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-3">
              <h3 className="text-sm font-bold text-[#333333]">ثبت رویداد توقف یا کارکرد دستگاه پرس</h3>
              <button onClick={() => setIsLogModalOpen(false)} className="text-[#666666] hover:text-[#333333] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleLogSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#333333] font-medium mb-1">دستگاه مورد نظر (جستجو در ماشین‌آلات):</label>
                <SearchableSelect
                  value={logMachineId}
                  onChange={val => setLogMachineId(val)}
                  placeholder="جستجو و انتخاب پرس یا دستگاه..."
                  searchPlaceholder="جستجوی کد دستگاه، نام پرس، یا سالن..."
                  options={data.machines.map(m => ({
                    value: m.machineId,
                    label: m.machineName,
                    sublabel: `${m.machineCode} • ${m.hallName}`,
                    badge: `${m.tonnage} تن`,
                  }))}
                />
              </div>

              <div>
                <label className="block text-[#333333] font-medium mb-1">نوع رویداد:</label>
                <select
                  value={logEventType}
                  onChange={e => setLogEventType(e.target.value as any)}
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] focus:border-[#007cc0] rounded-sm px-3 py-1.5 text-[#333333] focus:outline-none"
                >
                  <option value="UNPLANNED_DOWNTIME">توقف اضطراری (خرابی پرس / قالب / انتظار مواد)</option>
                  <option value="PLANNED_DOWNTIME">توقف برنامه‌ریزی‌شده (تعویض قالب SMED / سرویس PM)</option>
                  <option value="PRODUCTION_RUN">ثبت کارکرد و ضرب تولیدی جدید</option>
                </select>
              </div>

              {logEventType === 'PRODUCTION_RUN' ? (
                <div>
                  <label className="block text-[#333333] font-medium mb-1">تعداد ضرب ثبت‌شده:</label>
                  <input
                    type="number"
                    value={logStrokes}
                    onChange={e => setLogStrokes(Number(e.target.value))}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] focus:border-[#007cc0] rounded-sm px-3 py-1.5 text-[#333333] font-mono focus:outline-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-[#333333] font-medium mb-1">مدت زمان توقف (دقیقه):</label>
                  <input
                    type="number"
                    value={logDurationMin}
                    onChange={e => setLogDurationMin(Number(e.target.value))}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] focus:border-[#007cc0] rounded-sm px-3 py-1.5 text-[#333333] font-mono focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-[#333333] font-medium mb-1">علت توقف / توضیحات فنی:</label>
                <input
                  type="text"
                  value={logReason}
                  onChange={e => setLogReason(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] focus:border-[#007cc0] rounded-sm px-3 py-1.5 text-[#333333] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#e8e8e8]">
                <button
                  type="button"
                  onClick={() => setIsLogModalOpen(false)}
                  className="sap-btn-standard px-4 py-1.5 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="sap-btn-emphasized px-5 py-1.5 cursor-pointer"
                >
                  {submitting ? 'در حال ثبت...' : 'ثبت در کاردکس ماشین'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
