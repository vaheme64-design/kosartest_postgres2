import React, { useState, useEffect, useCallback } from 'react';
import {
  Gauge,
  Activity,
  ShieldCheck,
  Zap,
  AlertTriangle,
  RefreshCw,
  Download,
  Printer,
  Plus,
  CheckCircle2,
  Clock,
  SlidersHorizontal,
  TrendingUp,
  Layers,
  Wrench,
  Eye,
  X,
  BarChart3,
  ChevronRight,
  ChevronLeft,
  Filter,
  Edit3,
  Trash2,
  History,
} from 'lucide-react';
import {
  OeeDashboardSummary,
  OeeMachineRecord,
  OeeMachineDowntimeLogItem,
  ShiftFilterKey,
} from '../../types/oeeAndConsumables';
import { exportToCsv } from '../../utils/csvExport';
import { formatNumber, toPersianDigits } from '../../utils/formatters';
import { ReportModuleSkeleton } from '../common/Skeleton';
import { ScrapParetoChart } from './ScrapParetoChart';
import { useEnterpriseUx, AuditTrailTabContent } from '../../context/EnterpriseUxContext';
import { useErpRouter } from '../../context/RouterContext';

export interface OeeModuleViewProps {
  machines?: any[];
}

export type DrawerDowntimeCategoryFilter = 'ALL' | 'UNPLANNED_BREAKDOWN' | 'PLANNED_SETUP' | 'MINOR_STOP';

export const OeeModuleView: React.FC<OeeModuleViewProps> = () => {
  const { requestConfirm, showUndoToast, openQuickEditDrawer, recordAudit } = useEnterpriseUx();
  const router = useErpRouter();
  const [data, setData] = useState<OeeDashboardSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [shiftFilter, setShiftFilter] = useState<ShiftFilterKey>('ALL');
  const [hallFilter, setHallFilter] = useState<string>('ALL');
  const [selectedMachine, setSelectedMachine] = useState<OeeMachineRecord | null>(null);
  const [drawerTab, setDrawerTab] = useState<'DOWNTIME' | 'AUDIT_TRAIL'>('DOWNTIME');
  const [drawerCategoryFilter, setDrawerCategoryFilter] = useState<DrawerDowntimeCategoryFilter>('ALL');
  const [chartViewMode, setChartViewMode] = useState<'OEE_FACTORS' | 'DOWNTIME_STACK'>('OEE_FACTORS');
  const [notice, setNotice] = useState<string | null>(null);

  // Interactive OEE Simulator State (شبیه‌ساز ارتقای OEE)
  const [simAvailBoost, setSimAvailBoost] = useState<number>(4);
  const [simPerfBoost, setSimPerfBoost] = useState<number>(3);
  const [simQualBoost, setSimQualBoost] = useState<number>(0.5);

  // Log Shift Modal State
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [logMachineId, setLogMachineId] = useState<string>('MCH-02');
  const [logEventType, setLogEventType] = useState<'PRODUCTION_RUN' | 'PLANNED_DOWNTIME' | 'UNPLANNED_DOWNTIME'>('PRODUCTION_RUN');
  const [logDurationMin, setLogDurationMin] = useState<number>(30);
  const [logStrokes, setLogStrokes] = useState<number>(850);
  const [logScrap, setLogScrap] = useState<number>(12);
  const [logReason, setLogReason] = useState<string>('بهینه‌سازی زمان تعویض قالب کشش با کلمپ هیدرولیک (SMED)');
  const [submittingLog, setSubmittingLog] = useState(false);

  const openMachineDrawer = (machine: OeeMachineRecord, initialCategory: DrawerDowntimeCategoryFilter = 'ALL') => {
    setSelectedMachine(machine);
    setDrawerTab('DOWNTIME');
    setDrawerCategoryFilter(initialCategory);
  };

  const handleEditMachineRow = (machine: OeeMachineRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    openQuickEditDrawer({
      entityId: machine.machineId,
      entityCode: machine.machineCode,
      moduleTitle: 'ماژول OEE و شاخص‌های عملکرد دستگاه',
      drawerTitle: `ویرایش مشخصات و شاخص‌های دستگاه ${machine.machineCode}`,
      drawerSubtitle: `${machine.machineName} • ${machine.hallName}`,
      fields: [
        { key: 'machineName', label: 'نام دستگاه پرس / ایستگاه', value: machine.machineName, type: 'text', required: true },
        { key: 'activePartName', label: 'قطعه فعال روی خط', value: machine.activePartName, type: 'text', required: true },
        { key: 'availabilityPercent', label: 'دسترس‌پذیری Availability (%)', value: machine.availabilityPercent, type: 'number', min: 1, max: 100 },
        { key: 'performancePercent', label: 'عملکرد سرعت Performance (%)', value: machine.performancePercent, type: 'number', min: 1, max: 100 },
        { key: 'qualityPercent', label: 'نرخ کیفیت Quality (%)', value: machine.qualityPercent, type: 'number', min: 1, max: 100 },
        { key: 'goodPieces', label: 'تولید قطعه سالم شیفت', value: machine.goodPieces, type: 'number', min: 0 },
        { key: 'scrapAndReworkPieces', label: 'تعداد ضایعات و دوباره‌کاری', value: machine.scrapAndReworkPieces, type: 'number', min: 0 },
      ],
      onSave: values => {
        if (!data) return;
        const prevSnapshot = data;
        const a = Number(values.availabilityPercent) || machine.availabilityPercent;
        const p = Number(values.performancePercent) || machine.performancePercent;
        const q = Number(values.qualityPercent) || machine.qualityPercent;
        const oee = Math.round(((a * p * q) / 10000) * 10) / 10;
        const updatedMachine: OeeMachineRecord = {
          ...machine,
          machineName: String(values.machineName || machine.machineName),
          activePartName: String(values.activePartName || machine.activePartName),
          availabilityPercent: a,
          performancePercent: p,
          qualityPercent: q,
          oeePercent: oee,
          goodPieces: Number(values.goodPieces ?? machine.goodPieces),
          scrapAndReworkPieces: Number(values.scrapAndReworkPieces ?? machine.scrapAndReworkPieces),
        };
        setData(prev =>
          prev
            ? {
                ...prev,
                machines: prev.machines.map(m => (m.machineId === machine.machineId ? updatedMachine : m)),
              }
            : prev
        );
        if (selectedMachine?.machineId === machine.machineId) {
          setSelectedMachine(updatedMachine);
        }
        showUndoToast({
          title: `مشخصات OEE دستگاه «${machine.machineCode}» به ${toPersianDigits(oee)}٪ بروزرسانی شد`,
          description: 'در صورت نیاز می‌توانید تغییرات اعمال‌شده را به حالت قبل بازگردانید.',
          onUndo: () => {
            setData(prevSnapshot);
          },
        });
      },
    });
  };

  const loadOeeData = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (shiftFilter !== 'ALL') q.append('shift', shiftFilter);
      if (hallFilter !== 'ALL') q.append('hall', hallFilter);
      const res = await fetch(`/api/oee/dashboard?${q.toString()}`);
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
        setSelectedMachine(prev => {
          if (!prev) return null;
          return json.data.machines.find((m: OeeMachineRecord) => m.machineId === prev.machineId) || prev;
        });
      }
    } catch (err) {
      console.error('Failed to load OEE dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [shiftFilter, hallFilter]);

  useEffect(() => {
    loadOeeData();
  }, [loadOeeData]);

  const handleExportCsv = () => {
    if (!data) return;
    const headers = [
      'کد ماشین',
      'نام ماشین',
      'سالن',
      'قطعه فعال',
      'دسترس‌پذیری (Availability %)',
      'عملکرد (Performance %)',
      'کیفیت (Quality %)',
      'شاخص کل OEE (%)',
      'شاخص TEEP (%)',
      'فاصله تا کلاس جهانی (85%)',
      'MTBF (ساعت)',
      'MTTR (دقیقه)',
      'تولید سالم',
      'ضایعات',
    ];
    const rows = data.machines.map(m => [
      m.machineCode,
      m.machineName,
      m.hallName,
      m.activePartName,
      `${m.availabilityPercent}%`,
      `${m.performancePercent}%`,
      `${m.qualityPercent}%`,
      `${m.oeePercent}%`,
      `${m.teepPercent}%`,
      `${m.varianceFromTargetPercent}%`,
      m.mtbfHours,
      m.mttrMinutes,
      m.goodPieces,
      m.scrapAndReworkPieces,
    ]);
    exportToCsv(`KPIMS_OEE_Report_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  };

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingLog(true);
    try {
      const res = await fetch('/api/oee/log-shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineId: logMachineId,
          eventType: logEventType,
          durationMinutes: logDurationMin,
          strokesExecuted: logStrokes,
          scrapCount: logScrap,
          reasonTitleFa: logReason,
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
        setSelectedMachine(prev => {
          if (!prev) return null;
          return json.data.machines.find((m: OeeMachineRecord) => m.machineId === prev.machineId) || prev;
        });
        setNotice(json.message || 'ثبت کارکرد شیفت انجام شد و شاخص OEE بازمحاسبه گردید.');
        setIsLogModalOpen(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingLog(false);
    }
  };

  // Simulated OEE calculations
  const baseA = data?.plantAvailabilityPercent || 82;
  const baseP = data?.plantPerformancePercent || 87;
  const baseQ = data?.plantQualityPercent || 98.2;
  const simA = Math.min(99.5, Math.round((baseA + simAvailBoost) * 10) / 10);
  const simP = Math.min(99.5, Math.round((baseP + simPerfBoost) * 10) / 10);
  const simQ = Math.min(99.9, Math.round((baseQ + simQualBoost) * 10) / 10);
  const simOee = Math.round(((simA * simP * simQ) / 10000) * 10) / 10;
  const oeeGain = Math.max(0, Math.round((simOee - (data?.plantOeePercent || 70)) * 10) / 10);
  const extraMonthlyParts = Math.round(oeeGain * 1450);

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="sap-card p-4 text-[#333333] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf5] shrink-0">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-[#333333]">
                ماژول جامع اثربخشی کلی تجهیزات (OEE) و تحلیل ۶ ضایعه بزرگ (TPM)
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#eef7f1] text-[#107e3e] border border-[#bce0c8]">
                IATF 16949 / SAPCO Grade A
              </span>
            </div>
            <p className="text-xs text-[#666666] mt-0.5">
              محاسبه استاندارد جهانی OEE = دسترس‌پذیری (Availability) × عملکرد سرعت ضرب (Performance) × کیفیت قطعه سالم (Quality) به تفکیک پرس و شیفت
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
            <span>ثبت آمار شیفت / توقف جدید</span>
          </button>

          <button
            type="button"
            onClick={loadOeeData}
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
        <div className="p-3 rounded bg-[#eef7f1] border border-[#bce0c8] text-[#107e3e] text-xs flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-[#107e3e]" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-xs underline cursor-pointer">بستن</button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="sap-card p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[#666666] font-medium">تفکیک شیفت کاری:</span>
          {[
            { id: 'ALL', label: 'همه شیفت‌ها (کل روز)' },
            { id: 'MORNING', label: 'شیفت صبح (A)' },
            { id: 'EVENING', label: 'شیفت عصر (B)' },
            { id: 'NIGHT', label: 'شیفت شب (C)' },
          ].map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setShiftFilter(s.id as ShiftFilterKey)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer border ${
                shiftFilter === s.id
                  ? 'bg-[#007cc0] text-white border-[#007cc0] font-semibold'
                  : 'bg-[#f5f5f5] text-[#333333] hover:bg-[#e5f3fa] border-[#d9d9d9]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[#666666]">سالن تولید:</span>
          <select
            value={hallFilter}
            onChange={e => setHallFilter(e.target.value)}
            className="bg-white border border-[#bfbfbf] rounded px-2.5 py-1 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
          >
            <option value="ALL">همه سالن‌های کارخانه</option>
            <option value="پرس">سالن پرس سنگین و متوسط</option>
            <option value="برش">سالن برشکاری و نواربری</option>
            <option value="جوش">سالن مونتاژ و جوشکاری بدنه</option>
          </select>
        </div>
      </div>

      {/* Skeleton Loading State during OEE Fetch */}
      {loading && !data && (
        <ReportModuleSkeleton kpiCount={6} showChart={true} tableRows={5} tableColumns={9} />
      )}

      {/* Top Formula & 6 KPI Cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="sap-card p-3.5 text-right border-r-4 border-r-[#107e3e]">
            <span className="text-[11px] text-[#107e3e] font-semibold block">شاخص کل OEE کارخانه</span>
            <div className="text-2xl font-bold text-[#333333] font-mono tabular-nums mt-1">
              {toPersianDigits(data.plantOeePercent)}٪
            </div>
            <div className="flex items-center justify-between text-[10px] text-[#666666] mt-1.5 font-mono tabular-nums">
              <span>هدف جهانی: ۸۵٪</span>
              <span className={data.plantOeePercent >= 75 ? 'text-[#107e3e] font-semibold' : 'text-[#e9730c] font-semibold'}>
                {data.plantOeePercent >= 85 ? 'کلاس جهانی A' : 'پتانسیل رشد'}
              </span>
            </div>
          </div>

          <div className="sap-card p-3.5 text-right">
            <span className="text-[11px] text-[#007cc0] font-semibold block">۱. دسترس‌پذیری (Availability)</span>
            <div className="text-xl font-bold text-[#007cc0] font-mono tabular-nums mt-1">
              {toPersianDigits(data.plantAvailabilityPercent)}٪
            </div>
            <span className="text-[10px] text-[#666666] mt-1.5 block">کسر خرابی و تعویض قالب (هدف ≥ ۹۰٪)</span>
          </div>

          <div className="sap-card p-3.5 text-right">
            <span className="text-[11px] text-[#e9730c] font-semibold block">۲. عملکرد سرعت (Performance)</span>
            <div className="text-xl font-bold text-[#e9730c] font-mono tabular-nums mt-1">
              {toPersianDigits(data.plantPerformancePercent)}٪
            </div>
            <span className="text-[10px] text-[#666666] mt-1.5 block">ضرب واقعی به اسمی SPM (هدف ≥ ۹۵٪)</span>
          </div>

          <div className="sap-card p-3.5 text-right">
            <span className="text-[11px] text-[#007cc0] font-semibold block">۳. نرخ کیفیت (Quality / FPY)</span>
            <div className="text-xl font-bold text-[#333333] font-mono tabular-nums mt-1">
              {toPersianDigits(data.plantQualityPercent)}٪
            </div>
            <span className="text-[10px] text-[#666666] mt-1.5 block">نسبت قطعه سالم به کل ضرب (هدف ≥ ۹۹٪)</span>
          </div>

          <div className="sap-card p-3.5 text-right">
            <span className="text-[11px] text-[#666666] font-semibold block">قابلیت اطمینان (MTBF / MTTR)</span>
            <div className="text-base font-bold text-[#333333] font-mono tabular-nums mt-1">
              {toPersianDigits(data.avgMtbfHours)}h <span className="text-[#666666]">/</span> {toPersianDigits(data.avgMttrMinutes)}m
            </div>
            <span className="text-[10px] text-[#666666] mt-1.5 block">میانگین فاصله خرابی / زمان تعمیر</span>
          </div>

          <div className="sap-card p-3.5 text-right border-r-4 border-r-[#007cc0]">
            <span className="text-[11px] text-[#007cc0] font-semibold block">ظرفیت پنهان قابل آزادسازی</span>
            <div className="text-lg font-bold text-[#007cc0] font-mono tabular-nums mt-1">
              +{formatNumber(data.totalHiddenCapacityPiecesPerMonth)} <span className="text-[10px] font-sans font-normal">قطعه/ماه</span>
            </div>
            <span className="text-[10px] text-[#666666] mt-1.5 block">در صورت ارتقای OEE به ۸۵٪</span>
          </div>
        </div>
      )}

      {/* Scrap & Downtime Pareto Chart (IATF 16949 / 80-20 Root Cause Analysis alongside OEE) */}
      <ScrapParetoChart />

      {/* Interactive Clickable Charts Section (نمودارهای تعاملی قابل کلیک برای مشاهده پنل کشویی ریز توقفات) */}
      {data && (
        <div className="sap-card p-4 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[#e8e8e8] pb-3">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#007cc0]" />
                <h3 className="text-sm font-semibold text-[#333333]">
                  نمودارهای تعاملی بهره‌وری OEE و تفکیک توقفات ماشین‌آلات (Interactive Drill-Down Charts)
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf5]">
                  قابل کلیک روی هر دستگاه
                </span>
              </div>
              <p className="text-[11px] text-[#666666] mt-1">
                روی ستون یا نوار هر دستگاه در نمودار کلیک کنید تا <strong className="text-[#007cc0]">پنل کشویی جزئیات ریزِ توقفات (برنامه‌ریزی‌نشده، خرابی اضطراری، تعویض قالب SMED و افت سرعت)</strong> باز شود.
              </p>
            </div>

            <div className="flex items-center gap-1 bg-[#f5f5f5] p-1 rounded border border-[#d9d9d9] self-start">
              <button
                type="button"
                onClick={() => setChartViewMode('OEE_FACTORS')}
                className={`px-3 py-1 rounded text-xs font-medium transition cursor-pointer ${
                  chartViewMode === 'OEE_FACTORS'
                    ? 'bg-[#007cc0] text-white font-semibold'
                    : 'text-[#666666] hover:text-[#333333]'
                }`}
              >
                نمودار مقایسه OEE و ۳ شاخص (A×P×Q)
              </button>
              <button
                type="button"
                onClick={() => setChartViewMode('DOWNTIME_STACK')}
                className={`px-3 py-1 rounded text-xs font-medium transition cursor-pointer ${
                  chartViewMode === 'DOWNTIME_STACK'
                    ? 'bg-[#bb0000] text-white font-semibold'
                    : 'text-[#666666] hover:text-[#333333]'
                }`}
              >
                نمودار انباشته ریزِ توقفات (دقیقه)
              </button>
            </div>
          </div>

          {chartViewMode === 'OEE_FACTORS' ? (
            <div className="space-y-4">
              {/* Legend */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-700 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-emerald-500 inline-block" />
                    <strong>شاخص کل OEE</strong>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-cyan-400 inline-block" />
                    دسترس‌پذیری (Availability)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-amber-400 inline-block" />
                    عملکرد سرعت (Performance)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#007cc0] inline-block" />
                    کیفیت (Quality)
                  </span>
                </div>
                <span className="text-[11px] font-mono text-[#107e3e] font-semibold">
                  خط معیار کلاس جهانی (World-Class): ۸۵٪
                </span>
              </div>

              {/* Interactive Vertical Bar Columns per Machine */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
                {data.machines.map(m => {
                  const isSelected = selectedMachine?.machineId === m.machineId;
                  const unplannedMin = m.unplannedDowntimeMinutes ?? m.sixBigLosses[0]?.lostTimeMinutes ?? 30;
                  const plannedMin = m.plannedDowntimeMinutes ?? m.sixBigLosses[1]?.lostTimeMinutes ?? 45;

                  return (
                    <div
                      key={m.machineId}
                      onClick={() => openMachineDrawer(m, 'ALL')}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') openMachineDrawer(m, 'ALL');
                      }}
                      className={`group relative rounded p-3.5 border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-[#e5f3fa]/40 border-[#007cc0] ring-1 ring-[#007cc0]'
                          : 'bg-[#f7f7f7] border-[#d9d9d9] hover:bg-white hover:border-[#007cc0]/60'
                      }`}
                    >
                      {/* Machine Header */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <span className="text-[10px] font-mono text-[#666666] block">{m.machineCode}</span>
                          <h4 className="text-xs font-bold text-[#333333] group-hover:text-[#007cc0] transition line-clamp-1">
                            {m.machineName}
                          </h4>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-mono font-bold tabular-nums border ${
                            m.oeePercent >= 75
                              ? 'bg-[#eef8f2] text-[#107e3e] border-[#b2dfc4]'
                              : m.oeePercent >= 60
                              ? 'bg-[#fff5eb] text-[#e9730c] border-[#f5d0a9]'
                              : 'bg-[#fdf3f3] text-[#bb0000] border-[#e5b3b3]'
                          }`}
                        >
                          {toPersianDigits(m.oeePercent)}٪
                        </span>
                      </div>

                      {/* Vertical Bars Visual */}
                      <div className="relative h-36 bg-white rounded border border-[#d9d9d9] px-3 pt-5 pb-2 flex items-end justify-around gap-2">
                        {/* 85% World-Class Benchmark Dashed Line */}
                        <div
                          className="absolute inset-x-0 border-t border-dashed border-[#107e3e]/60 pointer-events-none flex justify-end px-1.5"
                          style={{ bottom: '85%' }}
                        >
                          <span className="text-[9px] font-mono text-[#107e3e] -mt-3.5 bg-white px-1 rounded">
                            ۸۵٪
                          </span>
                        </div>

                        {[
                          { label: 'OEE', val: m.oeePercent, color: 'bg-[#107e3e] group-hover:bg-[#107e3e]/90', text: 'text-[#107e3e]' },
                          { label: 'A', val: m.availabilityPercent, color: 'bg-cyan-500 group-hover:bg-cyan-400', text: 'text-cyan-700' },
                          { label: 'P', val: m.performancePercent, color: 'bg-[#e9730c] group-hover:bg-[#e9730c]/90', text: 'text-[#e9730c]' },
                          { label: 'Q', val: m.qualityPercent, color: 'bg-[#007cc0] group-hover:bg-[#006299]', text: 'text-[#007cc0]' },
                        ].map(bar => (
                          <div key={bar.label} className="flex flex-col items-center flex-1 h-full justify-end">
                            <span className={`text-[9px] font-mono font-bold mb-1 tabular-nums ${bar.text}`}>
                              {toPersianDigits(Math.round(bar.val))}٪
                            </span>
                            <div className="w-full max-w-[22px] bg-slate-100 rounded-t-md h-24 flex items-end overflow-hidden">
                              <div
                                className={`w-full rounded-t-md transition-all duration-300 ${bar.color}`}
                                style={{ height: `${Math.min(100, Math.max(8, bar.val))}%` }}
                              />
                            </div>
                            <span className="text-[9px] font-mono text-slate-400 mt-1">{bar.label}</span>
                          </div>
                        ))}
                      </div>

                      {/* Quick Downtime Summary Footer inside Chart Card */}
                      <div className="mt-3 pt-2.5 border-t border-[#e8e8e8] space-y-1.5 text-[10px]">
                        <div className="flex items-center justify-between font-mono">
                          <span className="text-[#bb0000]">توقف اضطراری/خرابی:</span>
                          <span className="font-bold text-[#bb0000]">{formatNumber(unplannedMin)} دقیقه</span>
                        </div>
                        <div className="flex items-center justify-between font-mono">
                          <span className="text-[#e9730c]">تعویض قالب/برنامه‌ای:</span>
                          <span className="font-bold text-[#e9730c]">{formatNumber(plannedMin)} دقیقه</span>
                        </div>
                        <div className="pt-1 flex items-center justify-between text-[#007cc0] font-semibold group-hover:translate-x-[-2px] transition-transform">
                          <span>مشاهده پنل ریز توقفات</span>
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Chart Mode 2: Interactive Stacked Downtime Breakdown Bars per Machine */
            <div className="space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#333333] bg-[#f7f7f7] px-3.5 py-2 rounded border border-[#d9d9d9]">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#bb0000] inline-block" />
                    <strong>توقفات برنامه‌ریزی‌نشده و خرابی اضطراری</strong>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#e9730c] inline-block" />
                    <strong>تعویض قالب (SMED) و نت برنامه‌ریزی‌شده</strong>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#007cc0] inline-block" />
                    <strong>توقفات جزئی فیدر و افت سرعت</strong>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-xs bg-[#5b738b] inline-block" />
                    <strong>اتلاف زمان ضایعات کیفی</strong>
                  </span>
                </div>
                <span className="text-[10px] text-[#666666]">
                  روی هر بخش رنگی نوار کلیک کنید تا مستقیماً همان دسته توقف در پنل کشویی فیلتر شود
                </span>
              </div>

              <div className="space-y-2.5">
                {data.machines.map(m => {
                  const unplannedMin = m.unplannedDowntimeMinutes ?? m.sixBigLosses[0]?.lostTimeMinutes ?? 30;
                  const plannedMin = m.plannedDowntimeMinutes ?? m.sixBigLosses[1]?.lostTimeMinutes ?? 45;
                  const speedMin = m.speedLossMinutes || 25;
                  const qualMin = m.qualityLossMinutes || 5;
                  const totalLossMin = Math.max(1, unplannedMin + plannedMin + speedMin + qualMin);
                  const isSelected = selectedMachine?.machineId === m.machineId;

                  return (
                    <div
                      key={m.machineId}
                      onClick={() => openMachineDrawer(m, 'ALL')}
                      className={`p-3 rounded border transition cursor-pointer ${
                        isSelected
                          ? 'bg-[#e5f3fa] border-[#007cc0]'
                          : 'bg-[#f7f7f7] border-[#d9d9d9] hover:bg-white hover:border-[#007cc0]'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-white text-[#333333] border border-[#d9d9d9] font-mono text-[11px] font-semibold">
                            {m.machineCode}
                          </span>
                          <span className="text-xs font-semibold text-[#333333]">{m.machineName}</span>
                          <span className="text-[11px] text-[#666666] hidden md:inline">({m.activePartName})</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums">
                          <span className="text-[#bb0000]">
                            خرابی اضطراری: <strong>{formatNumber(unplannedMin)}m</strong>
                          </span>
                          <span className="text-[#e9730c]">
                            تعویض قالب/PM: <strong>{formatNumber(plannedMin)}m</strong>
                          </span>
                          <span className="text-[#007cc0]">
                            توقف جزئی/سرعت: <strong>{formatNumber(speedMin)}m</strong>
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#ffebee] text-[#bb0000] border border-[#f5c2c7] font-semibold">
                            کل اتلاف: {formatNumber(totalLossMin)} دقیقه
                          </span>
                        </div>
                      </div>

                      {/* Interactive Stacked Horizontal Bar */}
                      <div className="w-full h-5 bg-white rounded overflow-hidden flex border border-[#d9d9d9] p-0.5 gap-0.5">
                        <div
                          onClick={e => {
                            e.stopPropagation();
                            openMachineDrawer(m, 'UNPLANNED_BREAKDOWN');
                          }}
                          title={`توقفات برنامه‌ریزی‌نشده و خرابی: ${unplannedMin} دقیقه (کلیک جهت مشاهده ریز خرابی‌ها)`}
                          className="bg-[#bb0000] hover:opacity-90 h-full first:rounded-r-xs transition-all flex items-center justify-center text-[9px] font-mono font-bold text-white overflow-hidden"
                          style={{ width: `${Math.round((unplannedMin / totalLossMin) * 100)}%` }}
                        >
                          {unplannedMin >= 15 && `${toPersianDigits(unplannedMin)}m`}
                        </div>
                        <div
                          onClick={e => {
                            e.stopPropagation();
                            openMachineDrawer(m, 'PLANNED_SETUP');
                          }}
                          title={`توقفات برنامه‌ریزی‌شده و تعویض قالب: ${plannedMin} دقیقه (کلیک جهت مشاهده ریز توقفات برنامه‌ای)`}
                          className="bg-[#e9730c] hover:opacity-90 h-full transition-all flex items-center justify-center text-[9px] font-mono font-bold text-white overflow-hidden"
                          style={{ width: `${Math.round((plannedMin / totalLossMin) * 100)}%` }}
                        >
                          {plannedMin >= 15 && `${toPersianDigits(plannedMin)}m`}
                        </div>
                        <div
                          onClick={e => {
                            e.stopPropagation();
                            openMachineDrawer(m, 'MINOR_STOP');
                          }}
                          title={`توقفات جزئی و افت سرعت: ${speedMin} دقیقه (کلیک جهت مشاهده ریز توقفات جزئی)`}
                          className="bg-[#007cc0] hover:opacity-90 h-full transition-all flex items-center justify-center text-[9px] font-mono font-bold text-white overflow-hidden"
                          style={{ width: `${Math.round((speedMin / totalLossMin) * 100)}%` }}
                        >
                          {speedMin >= 15 && `${toPersianDigits(speedMin)}m`}
                        </div>
                        <div
                          onClick={e => {
                            e.stopPropagation();
                            openMachineDrawer(m, 'ALL');
                          }}
                          title={`اتلاف کیفیت و ضایعات: ${qualMin} دقیقه`}
                          className="bg-[#5b738b] hover:opacity-90 h-full last:rounded-l-xs transition-all flex items-center justify-center text-[9px] font-mono font-bold text-white overflow-hidden"
                          style={{ width: `${Math.max(4, Math.round((qualMin / totalLossMin) * 100))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Six Big Losses Analysis (تحلیل شش ضایعه بزرگ استاندارد TPM) */}
      {data && (
        <div className="sap-card p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e8e8e8] pb-3">
            <div>
              <h3 className="text-sm font-semibold text-[#333333] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#e9730c]" />
                تحلیل پارتو شش ضایعه بزرگ تجهیزات (Six Big Losses Breakdown - TPM)
              </h3>
              <p className="text-[11px] text-[#666666] mt-0.5">
                شناسایی دقیق گلوگاه‌های اتلاف زمان پرس‌ها و معادل قطعات از دست رفته — روی هر کارت جهت باز شدن پنل کشویی بحرانی‌ترین دستگاه کلیک کنید
              </p>
            </div>
            <span className="text-[11px] font-mono text-[#666666] tabular-nums">
              کل زمان تلف‌شده روزانه: {formatNumber(data.sixBigLossesAggregate.reduce((s, l) => s + l.lostTimeMinutes, 0))} دقیقه
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.sixBigLossesAggregate.map(loss => {
              const badgeColor =
                loss.oeeFactor === 'AVAILABILITY_LOSS'
                  ? 'bg-[#e5f3fa] text-[#007cc0] border-[#b3ddf5]'
                  : loss.oeeFactor === 'PERFORMANCE_LOSS'
                  ? 'bg-[#fff4e5] text-[#b45309] border-[#f5cba7]'
                  : 'bg-[#f2f4f7] text-[#333333] border-[#d9d9d9]';

              const barColor =
                loss.oeeFactor === 'AVAILABILITY_LOSS'
                  ? 'bg-[#007cc0]'
                  : loss.oeeFactor === 'PERFORMANCE_LOSS'
                  ? 'bg-[#e9730c]'
                  : 'bg-[#5b738b]';

              const targetCat: DrawerDowntimeCategoryFilter =
                loss.lossNumber === 1
                  ? 'UNPLANNED_BREAKDOWN'
                  : loss.lossNumber === 2
                  ? 'PLANNED_SETUP'
                  : loss.lossNumber === 3 || loss.lossNumber === 4
                  ? 'MINOR_STOP'
                  : 'ALL';

              return (
                <div
                  key={loss.lossNumber}
                  onClick={() => {
                    const topMachine = [...data.machines].sort((a, b) => {
                      const aLoss = a.sixBigLosses.find(x => x.lossNumber === loss.lossNumber)?.lostTimeMinutes || 0;
                      const bLoss = b.sixBigLosses.find(x => x.lossNumber === loss.lossNumber)?.lostTimeMinutes || 0;
                      return bLoss - aLoss;
                    })[0];
                    if (topMachine) openMachineDrawer(topMachine, targetCat);
                  }}
                  className="bg-[#f7f7f7] border border-[#d9d9d9] hover:border-[#007cc0] rounded p-3 flex flex-col justify-between space-y-2.5 cursor-pointer transition group"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${badgeColor}`}>
                        {loss.oeeFactorLabelFa}
                      </span>
                      <span className="text-xs font-mono font-bold text-[#bb0000] tabular-nums">
                        {toPersianDigits(loss.shareOfTotalLossPercent)}٪ از کل اتلاف
                      </span>
                    </div>
                    <h4 className="text-xs font-semibold text-[#333333] group-hover:text-[#007cc0] transition mt-2">
                      {loss.lossTitleFa}
                    </h4>
                    <p className="text-[11px] text-[#666666] mt-1 leading-relaxed">
                      <strong className="text-[#333333]">مصداق کارگاهی:</strong> {loss.rootCauseExampleFa}
                    </p>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-[#e8e8e8]">
                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                      <span className="text-[#333333]">زمان تلف‌شده: <strong>{formatNumber(loss.lostTimeMinutes)} دقیقه</strong></span>
                      <span className="text-[#e9730c]">معادل: <strong>{formatNumber(loss.lostPiecesEquivalent)} قطعه</strong></span>
                    </div>
                    <div className="w-full bg-[#e8e8e8] h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`${barColor} h-full rounded-full`}
                        style={{ width: `${Math.min(100, loss.shareOfTotalLossPercent)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-[#107e3e] pt-0.5 flex items-center justify-between">
                      <span><strong>اقدام کایزن:</strong> {loss.kaizenActionFa}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-Machine OEE Matrix Table */}
      {data && (
        <div className="sap-card overflow-hidden">
          <div className="px-4 py-3 border-b border-[#e8e8e8] flex items-center justify-between bg-[#f7f7f7]">
            <h3 className="text-xs font-semibold text-[#333333] flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#007cc0]" />
              جدول تحلیلی OEE به تفکیک دستگاه‌های پرس و خطوط جوشکاری ({toPersianDigits(data.machines.length)} دستگاه)
            </h3>
            <span className="text-[11px] text-[#007cc0]">برای باز شدن پنل کشویی ریزِ توقفات روی هر دستگاه کلیک کنید</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs sap-table-compact">
              <thead className="bg-[#f5f5f5] text-[#333333] border-b border-[#d9d9d9] font-mono text-[11px]">
                <tr>
                  <th className="py-2 px-2.5">کد و نام دستگاه</th>
                  <th className="py-2 px-2.5">قطعه فعال روی خط</th>
                  <th className="py-2 px-2.5 text-center text-[#007cc0]">دسترس‌پذیری (A)</th>
                  <th className="py-2 px-2.5 text-center text-[#e9730c]">عملکرد سرعت (P)</th>
                  <th className="py-2 px-2.5 text-center text-[#333333]">کیفیت (Q)</th>
                  <th className="py-2 px-2.5 text-center font-bold text-[#107e3e]">شاخص OEE</th>
                  <th className="py-2 px-2.5 text-center">TEEP</th>
                  <th className="py-2 px-2.5 text-center">سیکل واقعی / ایده‌آل</th>
                  <th className="py-2 px-2.5 text-center">تولید سالم / ضایعات</th>
                  <th className="py-2 px-2.5 text-center">رتبه OEE</th>
                  <th className="py-2 px-2.5 text-center">پنل توقفات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8e8] font-mono tabular-nums">
                {data.machines.map(m => (
                  <tr
                    key={m.machineId}
                    onClick={() => openMachineDrawer(m, 'ALL')}
                    className={`transition cursor-pointer ${
                      selectedMachine?.machineId === m.machineId
                        ? 'bg-[#e5f3fa]'
                        : 'hover:bg-[#e5f3fa]/60'
                    }`}
                  >
                    <td className="py-1.5 px-2.5 font-sans">
                      <div className="font-semibold text-[#333333]">{m.machineName}</div>
                      <div className="text-[11px] text-[#666666] font-mono">{m.machineCode} • {m.hallName}</div>
                    </td>
                    <td className="py-1.5 px-2.5 font-sans">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          router.traceDocument(m.activePartName, 'WIP_TRACEABILITY');
                        }}
                        className="sap-doc-link text-xs text-right"
                        title="رهگیری این قطعه در زنجیره WIP"
                      >
                        {m.activePartName}
                      </button>
                      <div className="text-[10px] text-[#666666] font-mono">{m.processType} • {toPersianDigits(m.tonnage)}T</div>
                    </td>
                    <td className="py-1.5 px-2.5 text-center font-semibold text-[#007cc0]">
                      {toPersianDigits(m.availabilityPercent)}٪
                    </td>
                    <td className="py-1.5 px-2.5 text-center font-semibold text-[#e9730c]">
                      {toPersianDigits(m.performancePercent)}٪
                    </td>
                    <td className="py-1.5 px-2.5 text-center font-semibold text-[#333333]">
                      {toPersianDigits(m.qualityPercent)}٪
                    </td>
                    <td className="py-1.5 px-2.5 text-center font-bold text-sm bg-[#f7f7f7]">
                      <span className={m.oeePercent >= 75 ? 'text-[#107e3e]' : m.oeePercent >= 60 ? 'text-[#e9730c]' : 'text-[#bb0000]'}>
                        {toPersianDigits(m.oeePercent)}٪
                      </span>
                    </td>
                    <td className="py-1.5 px-2.5 text-center text-[#333333]">
                      {toPersianDigits(m.teepPercent)}٪
                    </td>
                    <td className="py-1.5 px-2.5 text-center text-[11px] text-[#333333]">
                      {toPersianDigits(m.actualCycleTimeSeconds)}s / <span className="text-[#666666]">{toPersianDigits(m.idealCycleTimeSeconds)}s</span>
                    </td>
                    <td className="py-1.5 px-2.5 text-center">
                      <span className="text-[#107e3e] font-semibold">{formatNumber(m.goodPieces)}</span>
                      <span className="text-[#999999] mx-1">/</span>
                      <span className="text-[#bb0000]">{formatNumber(m.scrapAndReworkPieces)}</span>
                    </td>
                    <td className="py-1.5 px-2.5 text-center font-sans">
                      {m.gradeClass === 'WORLD_CLASS_A' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#eef7f1] text-[#107e3e] border border-[#bce0c8]">
                          کلاس جهانی A
                        </span>
                      )}
                      {m.gradeClass === 'ACCEPTABLE_B' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf5]">
                          مطلوب B
                        </span>
                      )}
                      {m.gradeClass === 'NEEDS_IMPROVEMENT_C' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#fff4e5] text-[#e9730c] border border-[#f5cba7]">
                          نیازمند بهبود C
                        </span>
                      )}
                      {m.gradeClass === 'CRITICAL_D' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#ffebee] text-[#bb0000] border border-[#f5c2c7]">
                          بحرانی D
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2.5 text-center">
                      <div className="inline-flex items-center justify-center gap-1.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf5] text-[10px] font-sans font-semibold">
                          <Eye className="w-3 h-3" />
                          ریز توقفات
                        </span>
                        <button
                          type="button"
                          onClick={e => handleEditMachineRow(m, e)}
                          className="p-1 rounded bg-white hover:bg-[#e5f3fa] text-[#666666] hover:text-[#007cc0] border border-[#d9d9d9] transition cursor-pointer"
                          title="ویرایش مشخصات و شاخص‌های دستگاه در کشوی جانبی"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Shift Comparison & Interactive What-If OEE Calculator */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Shift OEE Comparison */}
          <div className="sap-card p-4 space-y-3">
            <h3 className="text-xs font-semibold text-[#333333] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#007cc0]" />
              مقایسه شاخص OEE به تفکیک شیفت‌های کاری کارخانه
            </h3>
            <div className="space-y-2">
              {data.shiftComparison.map(sh => (
                <div
                  key={sh.shiftCode}
                  className="bg-[#f7f7f7] border border-[#d9d9d9] rounded p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-semibold text-[#333333]">{sh.shiftNameFa}</div>
                    <div className="text-[11px] text-[#666666] mt-0.5">
                      سرپرست شیفت: {sh.supervisorName} • تیراژ سالم: <span className="font-mono text-[#333333] font-semibold">{formatNumber(sh.totalPieces)}</span> قطعه
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 font-mono text-xs tabular-nums">
                    <div className="text-center">
                      <span className="text-[10px] text-[#666666] block font-sans">دسترس‌پذیری</span>
                      <span className="text-[#007cc0] font-semibold">{toPersianDigits(sh.availabilityPercent)}٪</span>
                    </div>
                    <div className="text-center">
                      <span className="text-[10px] text-[#666666] block font-sans">عملکرد</span>
                      <span className="text-[#e9730c] font-semibold">{toPersianDigits(sh.performancePercent)}٪</span>
                    </div>
                    <div className="text-center">
                      <span className="text-[10px] text-[#666666] block font-sans">کیفیت</span>
                      <span className="text-[#333333] font-semibold">{toPersianDigits(sh.qualityPercent)}٪</span>
                    </div>
                    <div className="px-2 py-0.5 rounded bg-[#eef7f1] border border-[#bce0c8] text-[#107e3e] font-bold">
                      OEE: {toPersianDigits(sh.oeePercent)}٪
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        openQuickEditDrawer({
                          entityId: sh.shiftCode,
                          entityCode: sh.shiftCode,
                          moduleTitle: 'مدیریت شیفت‌های کاری و OEE',
                          drawerTitle: `ویرایش مشخصات ${sh.shiftNameFa}`,
                          drawerSubtitle: `کد شیفت: ${sh.shiftCode}`,
                          fields: [
                            { key: 'shiftNameFa', label: 'نام شیفت کاری', value: sh.shiftNameFa, type: 'text', required: true },
                            { key: 'supervisorName', label: 'سرپرست شیفت', value: sh.supervisorName, type: 'text', required: true },
                            { key: 'totalPieces', label: 'تیراژ سالم شیفت (قطعه)', value: sh.totalPieces, type: 'number', min: 0 },
                            { key: 'availabilityPercent', label: 'دسترس‌پذیری (%)', value: sh.availabilityPercent, type: 'number', min: 1, max: 100 },
                            { key: 'performancePercent', label: 'عملکرد سرعت (%)', value: sh.performancePercent, type: 'number', min: 1, max: 100 },
                            { key: 'qualityPercent', label: 'کیفیت (%)', value: sh.qualityPercent, type: 'number', min: 1, max: 100 },
                          ],
                          onSave: values => {
                            const prevData = data;
                            const a = Number(values.availabilityPercent) || sh.availabilityPercent;
                            const p = Number(values.performancePercent) || sh.performancePercent;
                            const q = Number(values.qualityPercent) || sh.qualityPercent;
                            const oee = Math.round(((a * p * q) / 10000) * 10) / 10;
                            setData(prev =>
                              prev
                                ? {
                                    ...prev,
                                    shiftComparison: prev.shiftComparison.map(item =>
                                      item.shiftCode === sh.shiftCode
                                        ? {
                                            ...item,
                                            shiftNameFa: String(values.shiftNameFa || item.shiftNameFa),
                                            supervisorName: String(values.supervisorName || item.supervisorName),
                                            totalPieces: Number(values.totalPieces ?? item.totalPieces),
                                            availabilityPercent: a,
                                            performancePercent: p,
                                            qualityPercent: q,
                                            oeePercent: oee,
                                          }
                                        : item
                                    ),
                                  }
                                : prev
                            );
                            showUndoToast({
                              title: `مشخصات «${values.shiftNameFa || sh.shiftNameFa}» بروزرسانی شد`,
                              description: `سرپرست: ${values.supervisorName} • OEE: ${toPersianDigits(oee)}٪`,
                              onUndo: () => setData(prevData),
                            });
                          },
                        })
                      }
                      className="p-1.5 rounded bg-white hover:bg-[#e5f3fa] text-[#666666] hover:text-[#007cc0] border border-[#d9d9d9] transition cursor-pointer"
                      title="ویرایش مشخصات شیفت در کشوی جانبی"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive OEE Improvement Simulator */}
          <div className="sap-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#333333] flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#007cc0]" />
                شبیه‌ساز تعاملی ارتقای OEE و محاسبه تیراژ آزادشده (What-If)
              </h3>
              <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf5] tabular-nums">
                OEE شبیه‌سازی: {toPersianDigits(simOee)}٪
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between text-[#333333] mb-1">
                  <span>کاهش توقفات تعویض قالب (SMED) و افزایش دسترس‌پذیری:</span>
                  <span className="font-mono font-semibold text-[#007cc0] tabular-nums">+{toPersianDigits(simAvailBoost)}٪ (به {toPersianDigits(simA)}٪)</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={12}
                  step={0.5}
                  value={simAvailBoost}
                  onChange={e => setSimAvailBoost(parseFloat(e.target.value))}
                  className="w-full accent-[#007cc0] cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[#333333] mb-1">
                  <span>حذف توقفات جزئی فیدر و بهبود سرعت ضرب (Performance):</span>
                  <span className="font-mono font-semibold text-[#e9730c] tabular-nums">+{toPersianDigits(simPerfBoost)}٪ (به {toPersianDigits(simP)}٪)</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={simPerfBoost}
                  onChange={e => setSimPerfBoost(parseFloat(e.target.value))}
                  className="w-full accent-[#e9730c] cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[#333333] mb-1">
                  <span>کاهش ضایعات کشش و بهبود نرخ کیفیت (Quality):</span>
                  <span className="font-mono font-semibold text-[#107e3e] tabular-nums">+{toPersianDigits(simQualBoost)}٪ (به {toPersianDigits(simQ)}٪)</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={simQualBoost}
                  onChange={e => setSimQualBoost(parseFloat(e.target.value))}
                  className="w-full accent-[#107e3e] cursor-pointer"
                />
              </div>
            </div>

            <div className="p-3 rounded bg-[#e5f3fa] border border-[#b3ddf5] flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-[#333333]">تیراژ قطعه سالم اضافه قابل تولید در ماه (بدون خرید پرس جدید):</div>
                <div className="text-[11px] text-[#666666] mt-0.5">
                  افزایش خالص شاخص OEE به میزان <strong className="text-[#107e3e] font-mono">+{toPersianDigits(oeeGain)}٪</strong>
                </div>
              </div>
              <div className="text-left font-mono tabular-nums">
                <span className="text-xl font-bold text-[#107e3e]">+{formatNumber(extraMonthlyParts)}</span>
                <span className="block text-[10px] text-[#666666] font-sans">قطعه خودرویی / ماه</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Slide-Over Drawer Panel for Machine Granular Downtimes (پنل کشویی جزئیات ریز توقفات و کالبدشکافی دستگاه) */}
      {selectedMachine && (
        <div
          className="fixed inset-0 z-50 bg-[#333333]/40 backdrop-blur-xs flex justify-end"
          onClick={() => setSelectedMachine(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white border-r border-[#d9d9d9] w-full max-w-2xl h-full shadow-xl flex flex-col overflow-hidden"
          >
            {/* Sticky Drawer Header */}
            <div className="p-4 bg-[#f7f7f7] border-b border-[#d9d9d9] space-y-3 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf5] font-mono text-xs font-semibold">
                      {selectedMachine.machineCode}
                    </span>
                    <h3 className="text-base font-semibold text-[#333333]">
                      پنل کشویی جزئیات ریزِ توقفات: {selectedMachine.machineName}
                    </h3>
                  </div>
                  <p className="text-xs text-[#666666] mt-1">
                    {selectedMachine.hallName} • قطعه فعال: <strong className="text-[#333333]">{selectedMachine.activePartName}</strong> • ظرفیت: {toPersianDigits(selectedMachine.tonnage)} تن
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLogMachineId(selectedMachine.machineId);
                      setLogEventType('UNPLANNED_DOWNTIME');
                      setIsLogModalOpen(true);
                    }}
                    className="sap-btn-emphasized px-3 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>ثبت توقف جدید</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedMachine(null)}
                    className="p-1.5 rounded bg-white hover:bg-[#e8e8e8] text-[#666666] hover:text-[#333333] border border-[#d9d9d9] cursor-pointer transition"
                    title="بستن پنل کشویی"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Quick Machine Switcher inside the Slide-Over Drawer */}
              {data && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1">
                  <span className="text-[10px] text-[#666666] shrink-0 ml-1">جابجایی سریع دستگاه:</span>
                  {data.machines.map(m => (
                    <button
                      key={m.machineId}
                      type="button"
                      onClick={() => openMachineDrawer(m, drawerCategoryFilter)}
                      className={`px-2.5 py-1 rounded text-[11px] font-mono transition cursor-pointer shrink-0 border ${
                        m.machineId === selectedMachine.machineId
                          ? 'bg-[#007cc0] text-white border-[#007cc0] font-semibold'
                          : 'bg-white hover:bg-[#e5f3fa] text-[#333333] border-[#d9d9d9]'
                      }`}
                    >
                      {m.machineCode} ({toPersianDigits(m.oeePercent)}٪)
                    </button>
                  ))}
                </div>
              )}

              {/* Drawer Sub-Tabs: Downtime Breakdown vs Audit Trail */}
              <div className="flex items-center gap-1.5 pt-2 border-t border-[#e8e8e8]">
                <button
                  type="button"
                  onClick={() => setDrawerTab('DOWNTIME')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition cursor-pointer border ${
                    drawerTab === 'DOWNTIME'
                      ? 'bg-[#007cc0] text-white border-[#007cc0]'
                      : 'bg-white text-[#666666] hover:bg-[#f5f5f5] border-[#d9d9d9]'
                  }`}
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>کالبدشکافی توقفات و TPM</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerTab('AUDIT_TRAIL')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition cursor-pointer border ${
                    drawerTab === 'AUDIT_TRAIL'
                      ? 'bg-[#007cc0] text-white border-[#007cc0]'
                      : 'bg-white text-[#666666] hover:bg-[#f5f5f5] border-[#d9d9d9]'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>تاریخچه تغییرات (Audit Trail)</span>
                </button>
              </div>
            </div>

            {/* Scrollable Drawer Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {drawerTab === 'AUDIT_TRAIL' ? (
                <AuditTrailTabContent
                  entityId={selectedMachine.machineId}
                  entityCode={selectedMachine.machineCode}
                  title={`تاریخچه ممیزی و تغییرات دستگاه ${selectedMachine.machineName} (${selectedMachine.machineCode})`}
                />
              ) : (
                <>
              {/* 4 Compact OEE KPI Gauges for Selected Machine */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-[#eef7f1] border border-[#bce0c8] rounded p-3 text-right">
                  <span className="text-[10px] text-[#107e3e] font-semibold block">شاخص کل OEE دستگاه</span>
                  <div className="text-xl font-bold text-[#107e3e] font-mono tabular-nums mt-0.5">
                    {toPersianDigits(selectedMachine.oeePercent)}٪
                  </div>
                  <span className="text-[10px] text-[#666666] font-mono">
                    TEEP: {toPersianDigits(selectedMachine.teepPercent)}٪
                  </span>
                </div>

                <div className="bg-[#e5f3fa] border border-[#b3ddf5] rounded p-3 text-right">
                  <span className="text-[10px] text-[#007cc0] font-semibold block">۱. دسترس‌پذیری (A)</span>
                  <div className="text-xl font-bold text-[#007cc0] font-mono tabular-nums mt-0.5">
                    {toPersianDigits(selectedMachine.availabilityPercent)}٪
                  </div>
                  <span className="text-[10px] text-[#666666] font-mono">
                    کارکرد: {formatNumber(selectedMachine.operatingRunMinutes)} دقیقه
                  </span>
                </div>

                <div className="bg-[#fff4e5] border border-[#f5cba7] rounded p-3 text-right">
                  <span className="text-[10px] text-[#e9730c] font-semibold block">۲. عملکرد سرعت (P)</span>
                  <div className="text-xl font-bold text-[#e9730c] font-mono tabular-nums mt-0.5">
                    {toPersianDigits(selectedMachine.performancePercent)}٪
                  </div>
                  <span className="text-[10px] text-[#666666] font-mono">
                    سیکل: {toPersianDigits(selectedMachine.actualCycleTimeSeconds)}s
                  </span>
                </div>

                <div className="bg-[#f7f7f7] border border-[#d9d9d9] rounded p-3 text-right">
                  <span className="text-[10px] text-[#333333] font-semibold block">۳. کیفیت تولید (Q)</span>
                  <div className="text-xl font-bold text-[#333333] font-mono tabular-nums mt-0.5">
                    {toPersianDigits(selectedMachine.qualityPercent)}٪
                  </div>
                  <span className="text-[10px] text-[#666666] font-mono">
                    ضایعات: {formatNumber(selectedMachine.scrapAndReworkPieces)} قطعه
                  </span>
                </div>
              </div>

              {/* Granular Downtime Breakdown Summary Cards (Clickable Filters) */}
              {(() => {
                const logs: OeeMachineDowntimeLogItem[] =
                  selectedMachine.downtimeLogs && selectedMachine.downtimeLogs.length > 0
                    ? selectedMachine.downtimeLogs
                    : [
                        {
                          id: 'FALLBACK-1',
                          reasonCode: 'DT-BREAKDOWN',
                          reasonTitleFa: 'خرابی اضطراری مدار هیدرولیک و تعویض سنبه پیرسینگ',
                          category: 'UNPLANNED_BREAKDOWN',
                          categoryLabelFa: 'توقف برنامه‌ریزی‌نشده / خرابی اضطراری',
                          durationMinutes: selectedMachine.unplannedDowntimeMinutes ?? selectedMachine.sixBigLosses[0]?.lostTimeMinutes ?? 36,
                          occurrencesCount: 2,
                          sharePercent: 38,
                          timeRangeFa: '۰۸:۱۵ تا ۰۸:۵۱ (شیفت صبح)',
                          shiftLabelFa: 'شیفت صبح (A)',
                          operatorOrTechName: 'واحد نت اضطراری + اپراتور پرس',
                          rootCauseFa: 'افت فشار شیر تناسبی کوشن و لب‌پر شدن سنبه پانچ',
                          correctiveActionFa: 'تعویض سنبه HSS-M2 و هواگیری مدار هیدرولیک',
                        },
                        {
                          id: 'FALLBACK-2',
                          reasonCode: 'DT-SMED',
                          reasonTitleFa: 'تعویض قالب، تنظیم ارتفاع ضرب (Shut Height) و بارگذاری کلاف',
                          category: 'PLANNED_SETUP',
                          categoryLabelFa: 'توقف برنامه‌ریزی‌شده / تعویض قالب (SMED)',
                          durationMinutes: selectedMachine.plannedDowntimeMinutes ?? selectedMachine.sixBigLosses[1]?.lostTimeMinutes ?? 55,
                          occurrencesCount: 2,
                          sharePercent: 45,
                          timeRangeFa: '۱۰:۳۰ تا ۱۱:۲۵ (شیفت صبح)',
                          shiftLabelFa: 'شیفت صبح (A)',
                          operatorOrTechName: 'تیم قالب‌بند SMED',
                          rootCauseFa: 'بستن کلمپ‌های قالب و تایید قطعه اول QC',
                          correctiveActionFa: 'اجرای چک‌لیست SMED و آماده‌سازی پیشاپیش قالب بعدی',
                        },
                        {
                          id: 'FALLBACK-3',
                          reasonCode: 'DT-MINOR',
                          reasonTitleFa: 'توقفات جزئی سنسور گام فیدر و تخلیه شوت ضایعات کناره ورق',
                          category: 'MINOR_STOP',
                          categoryLabelFa: 'توقفات جزئی و افت سرعت (Minor Stops)',
                          durationMinutes: selectedMachine.minorStopLossMinutes ?? selectedMachine.sixBigLosses[2]?.lostTimeMinutes ?? 20,
                          occurrencesCount: 5,
                          sharePercent: 17,
                          timeRangeFa: 'پراکنده در طول شیفت',
                          shiftLabelFa: 'مجموع شیفت‌ها',
                          operatorOrTechName: 'اپراتور ارشد دستگاه',
                          rootCauseFa: 'گیر کردن ورق در غلتک صاف‌کن و پر شدن باکس ضایعات',
                          correctiveActionFa: 'تنظیم کشش کویل‌بازکن و روغن‌کاری نوار ورودی',
                        },
                      ];

                const unplannedLogs = logs.filter(l => l.category === 'UNPLANNED_BREAKDOWN');
                const plannedLogs = logs.filter(l => l.category === 'PLANNED_SETUP');
                const minorLogs = logs.filter(l => l.category === 'MINOR_STOP');

                const unplannedTotalMin = unplannedLogs.reduce((s, l) => s + l.durationMinutes, 0);
                const plannedTotalMin = plannedLogs.reduce((s, l) => s + l.durationMinutes, 0);
                const minorTotalMin = minorLogs.reduce((s, l) => s + l.durationMinutes, 0);

                const filteredLogs =
                  drawerCategoryFilter === 'ALL'
                    ? logs
                    : logs.filter(l => l.category === drawerCategoryFilter);

                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-[#333333] flex items-center gap-1.5">
                        <Filter className="w-3.5 h-3.5 text-[#bb0000]" />
                        تفکیک دسته‌بندی توقفات دستگاه (برای فیلتر روی هر کارت کلیک کنید):
                      </h4>
                      {drawerCategoryFilter !== 'ALL' && (
                        <button
                          type="button"
                          onClick={() => setDrawerCategoryFilter('ALL')}
                          className="text-[11px] text-[#007cc0] hover:underline font-semibold cursor-pointer"
                        >
                          نمایش همه دسته‌ها ({toPersianDigits(logs.length)})
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          setDrawerCategoryFilter(
                            drawerCategoryFilter === 'UNPLANNED_BREAKDOWN' ? 'ALL' : 'UNPLANNED_BREAKDOWN'
                          )
                        }
                        className={`p-3 rounded border text-right transition cursor-pointer ${
                          drawerCategoryFilter === 'UNPLANNED_BREAKDOWN'
                            ? 'bg-[#ffebee] border-[#bb0000] ring-1 ring-[#bb0000]'
                            : 'bg-[#f7f7f7] border-[#d9d9d9] hover:border-[#bb0000]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-[#bb0000]">توقفات برنامه‌ریزی‌نشده و خرابی</span>
                          <span className="px-1.5 py-0.5 rounded bg-[#ffebee] text-[#bb0000] font-mono text-[10px]">
                            {toPersianDigits(unplannedLogs.reduce((s, l) => s + l.occurrencesCount, 0))} رخداد
                          </span>
                        </div>
                        <div className="text-lg font-bold text-[#333333] font-mono mt-1 tabular-nums">
                          {formatNumber(unplannedTotalMin)} <span className="text-xs font-normal text-[#666666]">دقیقه</span>
                        </div>
                        <span className="text-[10px] text-[#666666] block mt-0.5">
                          خرابی اضطراری پرس، قالب و انتظار مواد
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setDrawerCategoryFilter(
                            drawerCategoryFilter === 'PLANNED_SETUP' ? 'ALL' : 'PLANNED_SETUP'
                          )
                        }
                        className={`p-3 rounded border text-right transition cursor-pointer ${
                          drawerCategoryFilter === 'PLANNED_SETUP'
                            ? 'bg-[#fff4e5] border-[#e9730c] ring-1 ring-[#e9730c]'
                            : 'bg-[#f7f7f7] border-[#d9d9d9] hover:border-[#e9730c]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-[#e9730c]">تعویض قالب (SMED) و برنامه‌ای</span>
                          <span className="px-1.5 py-0.5 rounded bg-[#fff4e5] text-[#e9730c] font-mono text-[10px]">
                            {toPersianDigits(plannedLogs.reduce((s, l) => s + l.occurrencesCount, 0))} رخداد
                          </span>
                        </div>
                        <div className="text-lg font-bold text-[#333333] font-mono mt-1 tabular-nums">
                          {formatNumber(plannedTotalMin)} <span className="text-xs font-normal text-[#666666]">دقیقه</span>
                        </div>
                        <span className="text-[10px] text-[#666666] block mt-0.5">
                          تعویض قالب، تنظیمات خط و نت دوره‌ای PM
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setDrawerCategoryFilter(
                            drawerCategoryFilter === 'MINOR_STOP' ? 'ALL' : 'MINOR_STOP'
                          )
                        }
                        className={`p-3 rounded border text-right transition cursor-pointer ${
                          drawerCategoryFilter === 'MINOR_STOP'
                            ? 'bg-[#e5f3fa] border-[#007cc0] ring-1 ring-[#007cc0]'
                            : 'bg-[#f7f7f7] border-[#d9d9d9] hover:border-[#007cc0]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-[#007cc0]">توقفات جزئی و افت سرعت</span>
                          <span className="px-1.5 py-0.5 rounded bg-[#e5f3fa] text-[#007cc0] font-mono text-[10px]">
                            {toPersianDigits(minorLogs.reduce((s, l) => s + l.occurrencesCount, 0))} رخداد
                          </span>
                        </div>
                        <div className="text-lg font-bold text-[#333333] font-mono mt-1 tabular-nums">
                          {formatNumber(minorTotalMin)} <span className="text-xs font-normal text-[#666666]">دقیقه</span>
                        </div>
                        <span className="text-[10px] text-[#666666] block mt-0.5">
                          خطای سنسور فیدر ورق و تخلیه شوت ضایعات
                        </span>
                      </button>
                    </div>

                    {/* Granular Downtime Events List */}
                    <div className="bg-[#f7f7f7] border border-[#d9d9d9] rounded p-3.5 space-y-3">
                      <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-2">
                        <span className="text-xs font-semibold text-[#333333] flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5 text-[#e9730c]" />
                          لیست ریزِ توقفات ثبت‌شده دستگاه ({toPersianDigits(filteredLogs.length)} ردیف)
                        </span>
                        <span className="text-[10px] font-mono text-[#666666]">
                          MTBF: {toPersianDigits(selectedMachine.mtbfHours)}h | MTTR: {toPersianDigits(selectedMachine.mttrMinutes)}m
                        </span>
                      </div>

                      <div className="space-y-2">
                        {filteredLogs.map(item => {
                          const catBadge =
                            item.category === 'UNPLANNED_BREAKDOWN'
                              ? 'bg-[#ffebee] text-[#bb0000] border-[#f5c2c7]'
                              : item.category === 'PLANNED_SETUP'
                              ? 'bg-[#fff4e5] text-[#e9730c] border-[#f5cba7]'
                              : 'bg-[#e5f3fa] text-[#007cc0] border-[#b3ddf5]';

                          const barColor =
                            item.category === 'UNPLANNED_BREAKDOWN'
                              ? 'bg-[#bb0000]'
                              : item.category === 'PLANNED_SETUP'
                              ? 'bg-[#e9730c]'
                              : 'bg-[#007cc0]';

                          return (
                            <div
                              key={item.id}
                              className="p-3 rounded bg-white border border-[#d9d9d9] space-y-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 rounded bg-[#f5f5f5] text-[#333333] border border-[#d9d9d9] font-mono text-[10px] font-semibold">
                                    {item.reasonCode}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${catBadge}`}>
                                    {item.categoryLabelFa}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 font-mono text-xs tabular-nums">
                                  <span className="text-[#666666] text-[11px]">
                                    {toPersianDigits(item.occurrencesCount)} مرتبه
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-[#ffebee] text-[#bb0000] border border-[#f5c2c7] font-bold">
                                    {formatNumber(item.durationMinutes)} دقیقه
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openQuickEditDrawer({
                                        entityId: selectedMachine.machineId,
                                        entityCode: item.reasonCode,
                                        moduleTitle: `توقفات دستگاه ${selectedMachine.machineCode}`,
                                        drawerTitle: `ویرایش لاگ توقف ${item.reasonCode}`,
                                        drawerSubtitle: selectedMachine.machineName,
                                        fields: [
                                          { key: 'reasonTitleFa', label: 'عنوان علت توقف', value: item.reasonTitleFa, type: 'text', required: true },
                                          { key: 'durationMinutes', label: 'مدت زمان توقف (دقیقه)', value: item.durationMinutes, type: 'number', min: 1 },
                                          { key: 'occurrencesCount', label: 'تعداد دفعات رخداد', value: item.occurrencesCount, type: 'number', min: 1 },
                                          { key: 'operatorOrTechName', label: 'مسئول رسیدگی', value: item.operatorOrTechName, type: 'text' },
                                          { key: 'rootCauseFa', label: 'علت ریشه‌ای (Root Cause)', value: item.rootCauseFa, type: 'textarea' },
                                          { key: 'correctiveActionFa', label: 'اقدام اصلاحی و پیشگیرانه', value: item.correctiveActionFa, type: 'textarea' },
                                        ],
                                        onSave: values => {
                                          const prevMachine = selectedMachine;
                                          const updatedLogs = logs.map(l =>
                                            l.id === item.id
                                              ? {
                                                  ...l,
                                                  reasonTitleFa: String(values.reasonTitleFa || l.reasonTitleFa),
                                                  durationMinutes: Number(values.durationMinutes) || l.durationMinutes,
                                                  occurrencesCount: Number(values.occurrencesCount) || l.occurrencesCount,
                                                  operatorOrTechName: String(values.operatorOrTechName || l.operatorOrTechName),
                                                  rootCauseFa: String(values.rootCauseFa || l.rootCauseFa),
                                                  correctiveActionFa: String(values.correctiveActionFa || l.correctiveActionFa),
                                                }
                                              : l
                                          );
                                          const updatedMachine = { ...selectedMachine, downtimeLogs: updatedLogs };
                                          setSelectedMachine(updatedMachine);
                                          setData(prev =>
                                            prev
                                              ? {
                                                  ...prev,
                                                  machines: prev.machines.map(m =>
                                                    m.machineId === selectedMachine.machineId ? updatedMachine : m
                                                  ),
                                                }
                                              : prev
                                          );
                                          showUndoToast({
                                            title: `لاگ توقف «${item.reasonCode}» بروزرسانی شد`,
                                            description: 'تغییرات در شناسنامه توقفات دستگاه ثبت شد.',
                                            onUndo: () => setSelectedMachine(prevMachine),
                                          });
                                        },
                                      })
                                    }
                                    className="p-1 rounded bg-white hover:bg-[#e5f3fa] text-[#666666] hover:text-[#007cc0] border border-[#d9d9d9] transition cursor-pointer"
                                    title="ویرایش این رکورد توقف در کشوی جانبی"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              <div className="text-xs font-semibold text-[#333333]">{item.reasonTitleFa}</div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-[#666666] bg-[#f7f7f7] p-2 rounded border border-[#e8e8e8]">
                                <div>
                                  <strong className="text-[#333333]">بازه زمانی و شیفت:</strong> {item.timeRangeFa}
                                </div>
                                <div>
                                  <strong className="text-[#333333]">مسئول رسیدگی:</strong> {item.operatorOrTechName}
                                </div>
                                <div className="sm:col-span-2">
                                  <strong className="text-[#bb0000]">علت ریشه‌ای (Root Cause):</strong> {item.rootCauseFa}
                                </div>
                                <div className="sm:col-span-2 text-[#107e3e]">
                                  <strong>اقدام اصلاحی و پیشگیرانه:</strong> {item.correctiveActionFa}
                                </div>
                              </div>

                              <div className="w-full bg-[#e8e8e8] h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`${barColor} h-full rounded-full`}
                                  style={{ width: `${Math.min(100, Math.max(6, item.sharePercent))}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Time Waterfall Bars */}
              <div className="bg-[#f7f7f7] border border-[#d9d9d9] rounded p-3.5 space-y-2.5 text-xs">
                <div className="text-[#333333] font-semibold">آبشار تبدیل زمان برنامه‌ریزی‌شده به زمان خالص ارزش‌آفرین (دقیقه):</div>
                {[
                  { label: '۱. زمان برنامه‌ریزی‌شده تولید (Planned Production Time)', val: selectedMachine.plannedProductionMinutes, color: 'bg-[#5b738b]' },
                  { label: '۲. زمان کارکرد واقعی پس از کسر توقفات (Run Time)', val: selectedMachine.operatingRunMinutes, color: 'bg-[#007cc0]' },
                  { label: '۳. زمان کارکرد خالص پس از کسر افت سرعت (Net Operating Time)', val: selectedMachine.netOperatingMinutes, color: 'bg-[#e9730c]' },
                  { label: '۴. زمان کاملاً اثربخش تولید قطعه سالم (Fully Productive Time)', val: selectedMachine.fullyProductiveMinutes, color: 'bg-[#107e3e]' },
                ].map((row, idx) => {
                  const pct = Math.round((row.val / Math.max(1, selectedMachine.plannedProductionMinutes)) * 100);
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-[#333333]">{row.label}</span>
                        <span className="font-mono font-semibold text-[#333333] tabular-nums">{formatNumber(row.val)} دقیقه ({toPersianDigits(pct)}٪)</span>
                      </div>
                      <div className="w-full bg-[#e8e8e8] h-2 rounded-full overflow-hidden">
                        <div className={`${row.color} h-full rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Machine Six Big Losses */}
              <div className="bg-[#f7f7f7] border border-[#d9d9d9] rounded p-3.5 space-y-2.5">
                <div className="text-xs font-semibold text-[#333333]">تفکیک ۶ ضایعه بزرگ استاندارد TPM در این دستگاه:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedMachine.sixBigLosses.map(l => (
                    <div key={l.lossNumber} className="p-2.5 rounded bg-white border border-[#d9d9d9] text-xs">
                      <div className="flex justify-between font-semibold text-[#333333]">
                        <span>{l.lossTitleFa}</span>
                        <span className="font-mono text-[#bb0000] tabular-nums">{formatNumber(l.lostTimeMinutes)} دقیقه</span>
                      </div>
                      <div className="text-[10px] text-[#666666] mt-1">{l.kaizenActionFa}</div>
                    </div>
                  ))}
                </div>
              </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Log Shift OEE Modal */}
      {isLogModalOpen && data && (
        <div className="fixed inset-0 z-50 bg-[#333333]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#d9d9d9] rounded-md w-full max-w-md p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-3">
              <h3 className="text-sm font-semibold text-[#333333]">ثبت آمار کارکرد شیفت و بروزرسانی OEE</h3>
              <button onClick={() => setIsLogModalOpen(false)} className="text-[#666666] hover:text-[#333333] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleLogSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[#333333] font-medium mb-1">انتخاب دستگاه پرس / ایستگاه:</label>
                <select
                  value={logMachineId}
                  onChange={e => setLogMachineId(e.target.value)}
                  className="w-full bg-white border border-[#bfbfbf] rounded px-3 py-2 text-[#333333] focus:outline-none focus:border-[#007cc0]"
                >
                  {data.machines.map(m => (
                    <option key={m.machineId} value={m.machineId}>
                      [{m.machineCode}] {m.machineName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#333333] font-medium mb-1">نوع رویداد شیفت:</label>
                <select
                  value={logEventType}
                  onChange={e => setLogEventType(e.target.value as any)}
                  className="w-full bg-white border border-[#bfbfbf] rounded px-3 py-2 text-[#333333] focus:outline-none focus:border-[#007cc0]"
                >
                  <option value="PRODUCTION_RUN">ثبت ضرب تولید و قطعه سالم شیفت</option>
                  <option value="PLANNED_DOWNTIME">توقف برنامه‌ریزی‌شده (تعویض قالب SMED / نت PM)</option>
                  <option value="UNPLANNED_DOWNTIME">توقف اضطراری (خرابی پرس / شکستگی سنبه)</option>
                </select>
              </div>

              {logEventType === 'PRODUCTION_RUN' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#333333] font-medium mb-1">تعداد ضرب ثبت‌شده:</label>
                    <input
                      type="number"
                      value={logStrokes}
                      onChange={e => setLogStrokes(Number(e.target.value))}
                      className="w-full bg-white border border-[#bfbfbf] rounded px-3 py-2 text-[#333333] font-mono focus:outline-none focus:border-[#007cc0]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#333333] font-medium mb-1">تعداد ضایعات:</label>
                    <input
                      type="number"
                      value={logScrap}
                      onChange={e => setLogScrap(Number(e.target.value))}
                      className="w-full bg-white border border-[#bfbfbf] rounded px-3 py-2 text-[#333333] font-mono focus:outline-none focus:border-[#007cc0]"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[#333333] font-medium mb-1">مدت زمان توقف (دقیقه):</label>
                  <input
                    type="number"
                    value={logDurationMin}
                    onChange={e => setLogDurationMin(Number(e.target.value))}
                    className="w-full bg-white border border-[#bfbfbf] rounded px-3 py-2 text-[#333333] font-mono focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
              )}

              <div>
                <label className="block text-[#333333] font-medium mb-1">شرح عملیات یا علت توقف:</label>
                <input
                  type="text"
                  value={logReason}
                  onChange={e => setLogReason(e.target.value)}
                  className="w-full bg-white border border-[#bfbfbf] rounded px-3 py-2 text-[#333333] focus:outline-none focus:border-[#007cc0]"
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
                  disabled={submittingLog}
                  className="sap-btn-emphasized px-5 py-1.5 cursor-pointer"
                >
                  {submittingLog ? 'در حال ثبت...' : 'ثبت و بازمحاسبه OEE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
