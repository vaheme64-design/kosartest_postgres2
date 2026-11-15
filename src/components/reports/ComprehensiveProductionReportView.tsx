import React, { useState, useMemo } from 'react';
import {
  Gauge,
  Clock,
  AlertTriangle,
  TrendingUp,
  Activity,
  Layers,
  Calendar,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Download,
  Printer,
  ChevronDown,
  ChevronRight,
  Filter,
  BarChart3,
  GitBranch,
  Search,
  Factory,
  ArrowRight,
  ShieldAlert,
  Plus,
  X,
  RefreshCw,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { exportToCsv } from '../../utils/csvExport';
import { formatNumber, toPersianDigits } from '../../utils/formatters';
import { ScrapParetoChart } from './ScrapParetoChart';
import { useErpRouter } from '../../context/RouterContext';

// -------------------------------------------------------------
// Types & Domain Models
// -------------------------------------------------------------
export interface MachineDowntimeEvent {
  id: string;
  machineCode: string;
  machineName: string;
  hall: string;
  category: 'UNPLANNED_BREAKDOWN' | 'SETUP_CHANGE' | 'MINOR_STOP' | 'MATERIAL_SHORTAGE' | 'OPERATOR_ABSENCE';
  categoryLabel: string;
  startHour: string; // e.g. "08:30"
  durationMinutes: number;
  reason: string;
  actionTaken: string;
  color: string;
}

export interface ScheduleAdherenceRecord {
  orderCode: string;
  partCode: string;
  partName: string;
  carModel: string;
  plannedQty: number;
  actualProducedQty: number;
  scrapQty: number;
  plannedStartHour: string;
  plannedEndHour: string;
  actualStartHour: string;
  actualEndHour: string;
  adherencePercent: number; // e.g. 92%
  varianceUnits: number; // actual - planned
  status: 'AHEAD' | 'ON_TRACK' | 'DELAYED' | 'CRITICAL_LAG';
  delayRootCause?: string;
  shifts: string;
}

export interface OeeNodeItem {
  id: string;
  title: string;
  metric: string;
  percentage: number;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
  children?: OeeNodeItem[];
}

export const ComprehensiveProductionReportView: React.FC = () => {
  const { traceDocument } = useErpRouter();
  // Horizon Filter: Today, Yesterday, Current Week, Monthly
  const [selectedHorizon, setSelectedHorizon] = useState<'TODAY' | 'YESTERDAY' | 'WEEKLY' | 'MONTHLY'>('TODAY');
  const [selectedHall, setSelectedHall] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedOeeNodes, setExpandedOeeNodes] = useState<Record<string, boolean>>({
    oee_root: true,
    oee_avail: true,
    oee_perf: true,
    oee_qual: true,
  });

  // Selected Machine for timeline inspection
  const [inspectedMachine, setInspectedMachine] = useState<string | null>(null);

  // -------------------------------------------------------------
  // Data: Dynamic Machine Downtime Events (سوابق و رویدادهای زنده توقفات ماشین‌آلات)
  // -------------------------------------------------------------
  const DEFAULT_INITIAL_DOWNTIMES: MachineDowntimeEvent[] = [
    {
      id: 'DT-01',
      machineCode: 'SHR-GUI-01',
      machineName: 'قیچی گیوتین ۶ متری ۱',
      hall: 'سالن برش',
      category: 'SETUP_CHANGE',
      categoryLabel: 'تنظیم تیغه و فیکسچربندی برش',
      startHour: '07:30',
      durationMinutes: 45,
      reason: 'تعویض لبه تیغه گیوتین جهت برش ورق گرید DC04 با ضخامت ۲ میل',
      actionTaken: 'تنظیم لقی تیغه به میزان ۰.۱۸ میلیمتر و تست اولیه ۵ قطعه',
      color: 'bg-amber-500',
    },
    {
      id: 'DT-02',
      machineCode: 'PRS-250T-01',
      machineName: 'پرس ۲۵۰ تن ۱ (کشش/بلنک)',
      hall: 'سالن پرس',
      category: 'UNPLANNED_BREAKDOWN',
      categoryLabel: 'خرابی اضطراری هیدرولیک',
      startHour: '10:15',
      durationMinutes: 70,
      reason: 'نشت شیلنگ فشارقوی پمپ مدار کمکی بالشتک کشش (Die Cushion)',
      actionTaken: 'تیم نت (PM) شیلنگ هیدرولیک تعویض و هواگیری هیدرولیک انجام داد',
      color: 'bg-rose-600',
    },
    {
      id: 'DT-03',
      machineCode: 'PRS-160T-01',
      machineName: 'پرس ۱۶۰ تن ۱ (پانچ/خم)',
      hall: 'سالن پرس',
      category: 'SETUP_CHANGE',
      categoryLabel: 'تعویض قالب (SMED)',
      startHour: '12:30',
      durationMinutes: 35,
      reason: 'خروج قالب بلنک مکمل پژو ۲۰۶ و بارگذاری قالب خم لبه براکت',
      actionTaken: 'استفاده از کلمپ پنوماتیک و استقرار قالب در ۳۵ دقیقه (زیر ۴۰ دقیقه استاندارد)',
      color: 'bg-amber-500',
    },
    {
      id: 'DT-04',
      machineCode: 'PRS-160T-02',
      machineName: 'پرس ۱۶۰ تن ۲ (فرم/پانچ)',
      hall: 'سالن پرس',
      category: 'MINOR_STOP',
      categoryLabel: 'توقف جزئی / گیرکردن قطعه در قالب',
      startHour: '14:20',
      durationMinutes: 20,
      reason: 'عدم پرش کامل قطعه از روی سنبه به علت نقص در فنر پران (Ejector Pin)',
      actionTaken: 'روغن‌کاری پین پران و پاکسازی پلیسه‌های سطح ماتریس توسط اپراتور',
      color: 'bg-[#e9730c]',
    },
    {
      id: 'DT-05',
      machineCode: 'WLD-SPOT-01',
      machineName: 'پرس‌جوش مقاومتی ۱ (مهره‌جوش M6)',
      hall: 'سالن جوشکاری',
      category: 'MATERIAL_SHORTAGE',
      categoryLabel: 'تأخیر در تغذیه مهره جوشی M6',
      startHour: '15:10',
      durationMinutes: 30,
      reason: 'اتمام بافر تغذیه اتوماتیک مهره جوشی کاسه‌ای (Vibratory Feeder)',
      actionTaken: 'شارژ سریع کارتن مهره جوش استاندارد از انبار قطعات مصرفی',
      color: 'bg-[#007cc0]',
    },
    {
      id: 'DT-06',
      machineCode: 'WLD-CO2-ST01',
      machineName: 'کابین جوش CO2 شماره ۱',
      hall: 'سالن جوشکاری',
      category: 'UNPLANNED_BREAKDOWN',
      categoryLabel: 'سوختن نازل و گیرکردن سیم جوش',
      startHour: '16:45',
      durationMinutes: 25,
      reason: 'جرقه بیش از حد و انسداد نازل تورچ جوشکاری CO2',
      actionTaken: 'تعویض نازل تماسی و اسپری ضدجرقه (Anti-Spatter)',
      color: 'bg-rose-600',
    },
  ];

  const STORAGE_KEY_DOWNTIMES = 'kpims_dynamic_machine_downtimes_v2';

  const [machineDowntimes, setMachineDowntimes] = useState<MachineDowntimeEvent[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DOWNTIMES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_INITIAL_DOWNTIMES;
  });

  const saveDowntimes = (items: MachineDowntimeEvent[]) => {
    setMachineDowntimes(items);
    try {
      localStorage.setItem(STORAGE_KEY_DOWNTIMES, JSON.stringify(items));
    } catch {
      // ignore
    }
  };

  const handleDeleteDowntimeEvent = (id: string) => {
    const updated = machineDowntimes.filter(d => d.id !== id);
    saveDowntimes(updated);
  };

  // State for OEE Tree Node Drill-Down Drawer / Slide-Over
  const [oeeDrillDownContext, setOeeDrillDownContext] = useState<{
    title: string;
    categoryLabel: string;
    metric: string;
    description: string;
    events: MachineDowntimeEvent[];
  } | null>(null);

  // Modal State for Logging New Machine Downtime Event
  const [isLogDowntimeModalOpen, setIsLogDowntimeModalOpen] = useState<boolean>(false);
  const [newDtMachineCode, setNewDtMachineCode] = useState<string>('PRS-250T-01');
  const [newDtCategory, setNewDtCategory] = useState<
    'SETUP_CHANGE' | 'UNPLANNED_BREAKDOWN' | 'MINOR_STOP' | 'MATERIAL_SHORTAGE'
  >('UNPLANNED_BREAKDOWN');
  const [newDtDuration, setNewDtDuration] = useState<number>(30);
  const [newDtStartHour, setNewDtStartHour] = useState<string>('11:00');
  const [newDtReason, setNewDtReason] = useState<string>('');
  const [newDtAction, setNewDtAction] = useState<string>('');

  const handleAddDowntimeEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    const machineMap: Record<string, { name: string; hall: string }> = {
      'PRS-250T-01': { name: 'پرس ۲۵۰ تن ۱ (کشش/بلنک)', hall: 'سالن پرس' },
      'PRS-160T-01': { name: 'پرس ۱۶۰ تن ۱ (خم/پانچ)', hall: 'سالن پرس' },
      'SHR-GUI-01': { name: 'قیچی گیوتین ۶ متری ۱', hall: 'سالن برش' },
      'PRS-800T-G1': { name: 'پرس هیدرولیک ۸۰۰ تن', hall: 'سالن پرس سنگین' },
      'WLD-SPOT-01': { name: 'پرس‌جوش مقاومتی ۱ (مهره‌جوش M6)', hall: 'سالن جوشکاری' },
      'WLD-CO2-ST01': { name: 'کابین جوش CO2 شماره ۱', hall: 'سالن جوشکاری' },
    };
    const info = machineMap[newDtMachineCode] || { name: newDtMachineCode, hall: 'سالن تولید' };
    const labelMap: Record<string, string> = {
      SETUP_CHANGE: 'تنظیم قالب و ستاپ (SMED)',
      UNPLANNED_BREAKDOWN: 'خرابی اضطراری مکانیکی / هیدرولیکی',
      MINOR_STOP: 'توقف کوتاه و رفع گیر قالب',
      MATERIAL_SHORTAGE: 'تأخیر در تغذیه مواد و ورق پای کار',
    };
    const colorMap: Record<string, string> = {
      SETUP_CHANGE: 'bg-[#e9730c]',
      UNPLANNED_BREAKDOWN: 'bg-[#bb0000]',
      MINOR_STOP: 'bg-[#d97706]',
      MATERIAL_SHORTAGE: 'bg-[#007cc0]',
    };

    const newEvent: MachineDowntimeEvent = {
      id: `DT-${Date.now().toString().slice(-4)}`,
      machineCode: newDtMachineCode,
      machineName: info.name,
      hall: info.hall,
      category: newDtCategory,
      categoryLabel: labelMap[newDtCategory] || 'توقف خط',
      startHour: newDtStartHour,
      durationMinutes: Number(newDtDuration) || 15,
      reason: newDtReason || 'ثبت گزارش توقف در شیفت کاری',
      actionTaken: newDtAction || 'اقدام اصلاحی توسط تیم نگهداری و تعمیرات (نت)',
      color: colorMap[newDtCategory] || 'bg-rose-600',
    };

    saveDowntimes([newEvent, ...machineDowntimes]);

    // Send to backend /api/oee/log-shift to sync with central engine
    try {
      await fetch('/api/oee/log-shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineId: newDtMachineCode,
          eventType: newDtCategory === 'SETUP_CHANGE' ? 'PLANNED_DOWNTIME' : 'UNPLANNED_DOWNTIME',
          durationMinutes: Number(newDtDuration) || 15,
          reasonTitleFa: newDtReason || labelMap[newDtCategory],
        }),
      });
    } catch {
      // ignore
    }

    setIsLogDowntimeModalOpen(false);
    setNewDtReason('');
    setNewDtAction('');
  };

  // -------------------------------------------------------------
  // Data: Schedule Adherence (انحراف از برنامه تولید)
  // -------------------------------------------------------------
  const adherenceList: ScheduleAdherenceRecord[] = useMemo(
    () => [
      {
        orderCode: 'MO-1404-3101',
        partCode: 'SAPCO-ASY-ECU-BRK-01',
        partName: 'مجموعه براکت ضدسرقت رایانه موتور',
        carModel: 'پژو ۲۰۶',
        plannedQty: 1500,
        actualProducedQty: 1420,
        scrapQty: 18,
        plannedStartHour: '07:00',
        plannedEndHour: '15:00',
        actualStartHour: '07:15',
        actualEndHour: '15:25',
        adherencePercent: 94.7,
        varianceUnits: -80,
        status: 'ON_TRACK',
        delayRootCause: 'تأخیر جزئی در تغذیه مهره جوش M6 در شیفت صبح',
        shifts: 'شیفت صبح و عصر',
      },
      {
        orderCode: 'MO-ECU-MAIN-01',
        partCode: 'WIP-ECU-MAIN-BRK',
        partName: 'صفحه براکت اصلی ضدسرقت رایانه موتور (پرس‌کاری و مهره‌جوش)',
        carModel: 'پژو ۲۰۶ / ۲۰۷',
        plannedQty: 1500,
        actualProducedQty: 1530,
        scrapQty: 12,
        plannedStartHour: '07:00',
        plannedEndHour: '14:30',
        actualStartHour: '07:00',
        actualEndHour: '14:15',
        adherencePercent: 102.0,
        varianceUnits: +30,
        status: 'AHEAD',
        delayRootCause: 'تولید بالاتر از برنامه با افزایش ریتم پرس‌کاری ۲۵۰ تن',
        shifts: 'شیفت صبح',
      },
      {
        orderCode: 'MO-ECU-COMP-01',
        partCode: 'WIP-ECU-COMP-BRK',
        partName: 'قطعه مکمل براکت ضدسرقت رایانه موتور (بلنک، خم و پیچ‌جوش)',
        carModel: 'پژو ۲۰۶ / ۲۰۷',
        plannedQty: 1500,
        actualProducedQty: 1310,
        scrapQty: 22,
        plannedStartHour: '08:00',
        plannedEndHour: '16:00',
        actualStartHour: '08:30',
        actualEndHour: '16:30',
        adherencePercent: 87.3,
        varianceUnits: -190,
        status: 'DELAYED',
        delayRootCause: 'توقف ۳۵ دقیقه‌ای تعویض قالب بلنک مکمل (SMED)',
        shifts: 'شیفت صبح و عصر',
      },
    ],
    []
  );

  // -------------------------------------------------------------
  // Dynamic OEE Calculation Driven Live by Downtime & Maintenance Logs
  // -------------------------------------------------------------
  const dynamicOeeMetrics = useMemo(() => {
    // 6 machines * 8 hours = 2,880 total calendar operating minutes in shift
    const totalShiftMinutes = 6 * 480;

    // Categorize actual downtime logs
    const setupMinutes = machineDowntimes
      .filter(d => d.category === 'SETUP_CHANGE')
      .reduce((sum, d) => sum + d.durationMinutes, 0);

    const breakdownMinutes = machineDowntimes
      .filter(d => d.category === 'UNPLANNED_BREAKDOWN' || d.category === 'MATERIAL_SHORTAGE')
      .reduce((sum, d) => sum + d.durationMinutes, 0);

    const minorStopsMinutes = machineDowntimes
      .filter(d => d.category === 'MINOR_STOP')
      .reduce((sum, d) => sum + d.durationMinutes, 0);

    const totalDowntimeMinutes = setupMinutes + breakdownMinutes;
    const netOperatingMinutes = Math.max(100, totalShiftMinutes - totalDowntimeMinutes);

    // 1. Availability = (Operating Time / Planned Time) * 100
    const availPct = Math.round((netOperatingMinutes / totalShiftMinutes) * 1000) / 10;
    const setupPct = Math.round((setupMinutes / totalShiftMinutes) * 1000) / 10;
    const breakdownPct = Math.round((breakdownMinutes / totalShiftMinutes) * 1000) / 10;

    // 2. Performance = (Operating Run Speed vs Ideal)
    const speedLossMinutes = minorStopsMinutes + 35;
    const perfPct = Math.max(
      60,
      Math.min(98, Math.round((1 - speedLossMinutes / netOperatingMinutes) * 1000) / 10)
    );
    const minorStopsPct = Math.round((minorStopsMinutes / netOperatingMinutes) * 1000) / 10;
    const reducedSpeedPct = Math.max(
      1,
      Math.round(((speedLossMinutes - minorStopsMinutes) / netOperatingMinutes) * 1000) / 10
    );

    // 3. Quality = (Good Pieces / Total Pieces)
    const baseProducedPcs = 7200;
    const setupScrapPcs = Math.round(setupMinutes * 0.8);
    const processScrapPcs = Math.round(breakdownMinutes * 0.5) + 38;
    const totalScrap = setupScrapPcs + processScrapPcs;
    const qualPct = Math.round(((baseProducedPcs - totalScrap) / baseProducedPcs) * 1000) / 10;
    const setupScrapPct = Math.round((setupScrapPcs / baseProducedPcs) * 1000) / 10;
    const processScrapPct = Math.round((processScrapPcs / baseProducedPcs) * 1000) / 10;

    // Root OEE = (A * P * Q) / 10000
    const oeePct = Math.round(((availPct * perfPct * qualPct) / 10000) * 10) / 10;

    return {
      totalShiftMinutes,
      setupMinutes,
      breakdownMinutes,
      minorStopsMinutes,
      totalDowntimeMinutes,
      availPct,
      setupPct,
      breakdownPct,
      perfPct,
      minorStopsPct,
      reducedSpeedPct,
      qualPct,
      setupScrapPcs,
      processScrapPcs,
      setupScrapPct,
      processScrapPct,
      oeePct,
    };
  }, [machineDowntimes]);

  const oeeTree: OeeNodeItem = useMemo(() => {
    const m = dynamicOeeMetrics;
    return {
      id: 'oee_root',
      title: 'شاخص اثربخشی کلی تجهیزات (OEE کل کارخانه - محاسباتی زنده)',
      metric: `${toPersianDigits(m.oeePct)}٪`,
      percentage: m.oeePct,
      color: 'text-amber-700',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-300',
      description: `حاصل‌ضرب پویای مؤلفه‌ها: دسترس‌پذیری (${toPersianDigits(m.availPct)}٪) × راندمان عملکرد (${toPersianDigits(m.perfPct)}٪) × کیفیت سالم (${toPersianDigits(m.qualPct)}٪)`,
      children: [
        {
          id: 'oee_avail',
          title: '۱. نرخ دسترس‌پذیری ماشین‌آلات (Availability)',
          metric: `${toPersianDigits(m.availPct)}٪`,
          percentage: m.availPct,
          color: 'text-blue-700',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-300',
          description: `زمان کارکرد خالص کسر از کل ${toPersianDigits(m.totalDowntimeMinutes)} دقیقه توقف ثبت‌شده در رویدادها`,
          children: [
            {
              id: 'avail_planned_downtime',
              title: 'توقفات برنامه‌ریزی‌شده / تعویض قالب (SMED)',
              metric: `${toPersianDigits(m.setupPct)}٪ زمان کل (${toPersianDigits(m.setupMinutes)} دقیقه)`,
              percentage: m.setupPct,
              color: 'text-slate-700',
              bgColor: 'bg-slate-50',
              borderColor: 'border-slate-200',
              description: `مجموع زمان توقفات تعویض قالب و ستاپ ثبت‌شده در ${toPersianDigits(machineDowntimes.filter(d => d.category === 'SETUP_CHANGE').length)} رویداد لاگ‌شده`,
            },
            {
              id: 'avail_unplanned_breakdown',
              title: 'خرابی‌های اضطراری مکانیکی و هیدرولیکی',
              metric: `${toPersianDigits(m.breakdownPct)}٪ زمان کل (${toPersianDigits(m.breakdownMinutes)} دقیقه)`,
              percentage: m.breakdownPct,
              color: 'text-rose-700',
              bgColor: 'bg-rose-50',
              borderColor: 'border-rose-200',
              description: `مجموع زمان خرابی‌های اضطراری هیدرولیک و توقفات خط در ${toPersianDigits(machineDowntimes.filter(d => d.category === 'UNPLANNED_BREAKDOWN' || d.category === 'MATERIAL_SHORTAGE').length)} رویداد لاگ‌شده`,
            },
          ],
        },
        {
          id: 'oee_perf',
          title: '۲. راندمان عملکرد و ریتم ضرب (Performance Rate)',
          metric: `${toPersianDigits(m.perfPct)}٪`,
          percentage: m.perfPct,
          color: 'text-[#007cc0]',
          bgColor: 'bg-[#e5f3fa]',
          borderColor: 'border-[#007cc0]/30',
          description: 'نسبت ضرب واقعی به ظرفیت اسمی استاندارد (کسر توقفات میکرو و افت سرعت ناشی از جنس ورق)',
          children: [
            {
              id: 'perf_minor_stops',
              title: 'توقفات میکرو (زیر ۵ دقیقه) و پران قطعه',
              metric: `${toPersianDigits(m.minorStopsPct)}٪ افت سرعت (${toPersianDigits(m.minorStopsMinutes)} دقیقه)`,
              percentage: m.minorStopsPct,
              color: 'text-[#e9730c]',
              bgColor: 'bg-[#fff8f0]',
              borderColor: 'border-[#e9730c]/30',
              description: 'توقفات کوتاه ناشی از گیرکردن قطعه در قالب و مکث رول‌بازکن',
            },
            {
              id: 'perf_reduced_speed',
              title: 'کاهش ریتم اسمی به علت سختی و ضخامت ورق',
              metric: `${toPersianDigits(m.reducedSpeedPct)}٪ افت سرعت`,
              percentage: m.reducedSpeedPct,
              color: 'text-[#007cc0]',
              bgColor: 'bg-[#ffffff]',
              borderColor: 'border-[#d9d9d9]',
              description: 'احتیاط اپراتور و پرس در شکل‌دهی ورق‌های با استحکام بالا جهت پیشگیری از چروک‌خوردگی و ترک',
            },
          ],
        },
        {
          id: 'oee_qual',
          title: '۳. نرخ کیفیت و تولید سالم (Quality Rate)',
          metric: `${toPersianDigits(m.qualPct)}٪`,
          percentage: m.qualPct,
          color: 'text-emerald-700',
          bgColor: 'bg-emerald-50',
          borderColor: 'border-emerald-300',
          description: `نسبت قطعات سالم تاییدشده (مجموع ضایعات: ${toPersianDigits(m.setupScrapPcs + m.processScrapPcs)} قطعه)`,
          children: [
            {
              id: 'qual_setup_scrap',
              title: 'ضایعات قطعات تنظیمی و راه‌اندازی ابتدای شیفت',
              metric: `${toPersianDigits(m.setupScrapPct)}٪ (${toPersianDigits(m.setupScrapPcs)} قطعه)`,
              percentage: m.setupScrapPct,
              color: 'text-emerald-700',
              bgColor: 'bg-emerald-50',
              borderColor: 'border-emerald-200',
              description: 'قطعات تست اولیه حین تنظیم لقی قالب و کنترل ابعادی با گیج',
            },
            {
              id: 'qual_process_defects',
              title: 'ضایعات حین فرآیند (پلیسه، ترک و پارگی کشش)',
              metric: `${toPersianDigits(m.processScrapPct)}٪ (${toPersianDigits(m.processScrapPcs)} قطعه)`,
              percentage: m.processScrapPct,
              color: 'text-rose-700',
              bgColor: 'bg-rose-50',
              borderColor: 'border-rose-200',
              description: 'ترک لبه در کشش عمیق و جوش سرد شناسایی‌شده در بازرسی‌های حین تولید',
            },
          ],
        },
      ],
    };
  }, [dynamicOeeMetrics, machineDowntimes]);

  // Toggle OEE Node Expansion
  const toggleNode = (nodeId: string) => {
    setExpandedOeeNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  // Filtered Adherence List
  const filteredAdherence = useMemo(() => {
    return adherenceList.filter(item => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          item.orderCode.toLowerCase().includes(q) ||
          item.partCode.toLowerCase().includes(q) ||
          item.partName.toLowerCase().includes(q) ||
          item.carModel.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [adherenceList, searchQuery]);

  // Filtered Downtime Events
  const filteredDowntimes = useMemo(() => {
    return machineDowntimes.filter(ev => {
      if (selectedHall !== 'ALL' && ev.hall !== selectedHall) return false;
      if (inspectedMachine && ev.machineCode !== inspectedMachine) return false;
      return true;
    });
  }, [machineDowntimes, selectedHall, inspectedMachine]);

  // Overall Adherence Metric
  const totalPlannedPcs = adherenceList.reduce((acc, r) => acc + r.plannedQty, 0);
  const totalActualPcs = adherenceList.reduce((acc, r) => acc + r.actualProducedQty, 0);
  const overallAdherencePercent = Math.round((totalActualPcs / Math.max(1, totalPlannedPcs)) * 1000) / 10;
  const totalDowntimeMinutes = machineDowntimes.reduce((acc, ev) => acc + ev.durationMinutes, 0);

  // Unique Machines for Timeline Row
  const uniqueMachines = Array.from(new Set(machineDowntimes.map(ev => ev.machineCode))).map(code => {
    const found = machineDowntimes.find(ev => ev.machineCode === code);
    return {
      code,
      name: found?.machineName || code,
      hall: found?.hall || '',
    };
  });

  // Print Isolated Report (A4 Landscape)
  const handlePrintReport = () => {
    const existing = document.getElementById('comprehensive-report-print-frame') as HTMLIFrameElement | null;
    if (existing) existing.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'comprehensive-report-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    const rowsHtml = adherenceList
      .map(
        (r, idx) => `
      <tr>
        <td>${toPersianDigits(idx + 1)}</td>
        <td style="font-family: monospace; font-weight: bold;">${r.orderCode}</td>
        <td><strong>${r.partName}</strong><br/><span style="font-size:10px; color:#555;">${r.partCode} (${r.carModel})</span></td>
        <td>${formatNumber(r.plannedQty)}</td>
        <td style="font-weight: bold; color: #047857;">${formatNumber(r.actualProducedQty)}</td>
        <td style="color: #dc2626;">${formatNumber(r.scrapQty)}</td>
        <td style="font-weight: bold;">${toPersianDigits(r.adherencePercent)}٪</td>
        <td>${r.varianceUnits >= 0 ? '+' + formatNumber(r.varianceUnits) : formatNumber(r.varianceUnits)}</td>
        <td>${r.status === 'AHEAD' ? 'جلوتر از برنامه' : r.status === 'ON_TRACK' ? 'منطبق با برنامه' : r.status === 'DELAYED' ? 'دارای تأخیر' : 'تأخیر بحرانی'}</td>
        <td style="font-size: 10px;">${r.delayRootCause || '-'}</td>
      </tr>
    `
      )
      .join('');

    const downtimesHtml = machineDowntimes
      .map(
        (dt, idx) => `
      <tr>
        <td>${toPersianDigits(idx + 1)}</td>
        <td><strong>${dt.machineName}</strong> (${dt.machineCode})</td>
        <td>${dt.hall}</td>
        <td>${dt.categoryLabel}</td>
        <td>ساعت ${dt.startHour}</td>
        <td style="font-weight: bold;">${toPersianDigits(dt.durationMinutes)} دقیقه</td>
        <td style="font-size: 10px;">${dt.reason}</td>
        <td style="font-size: 10px;">${dt.actionTaken}</td>
      </tr>
    `
      )
      .join('');

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html lang="fa" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>گزارش جامع شاخص‌های بهره‌وری (OEE)، توقفات ماشین‌آلات و انحراف برنامه</title>
        <style>
          body { font-family: Tahoma, Arial, sans-serif; padding: 16px; color: #111; direction: rtl; }
          .header { border: 2px solid #111; padding: 12px; border-radius: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; }
          h1 { margin: 0 0 6px 0; font-size: 15px; }
          .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; font-size: 11px; }
          .kpi-card { border: 1px solid #444; padding: 8px; border-radius: 6px; background: #f8fafc; }
          table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 14px; }
          th, td { border: 1px solid #333; padding: 5px 6px; text-align: right; }
          th { background: #f1f5f9; font-weight: bold; }
          h2 { font-size: 12px; margin: 12px 0 6px 0; border-bottom: 1px solid #999; padding-bottom: 4px; }
          @media print { @page { size: A4 landscape; margin: 8mm; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>گزارش جامع شاخص‌های بهره‌وری (OEE)، توقفات ماشین‌آلات و انحراف از برنامه (Schedule Adherence)</h1>
            <div>شرکت قطعات محوری کوثر — واحد برنامه‌ریزی، کنترل تولید و تضمین کیفیت (PPC & QC)</div>
          </div>
          <div style="text-align: left; font-size: 11px;">
            <div><strong>شاخص کل OEE:</strong> ۷۱.۶٪</div>
            <div><strong>انطباق با برنامه (Adherence):</strong> ${toPersianDigits(overallAdherencePercent)}٪</div>
            <div><strong>کل زمان توقف ثبت‌شده:</strong> ${toPersianDigits(totalDowntimeMinutes)} دقیقه</div>
          </div>
        </div>

        <div class="kpi-row">
          <div class="kpi-card"><strong>دسترس‌پذیری (Availability):</strong> ۸۸.۴٪</div>
          <div class="kpi-card"><strong>راندمان عملکرد (Performance):</strong> ۸۲.۵٪</div>
          <div class="kpi-card"><strong>نرخ کیفیت سالم (Quality):</strong> ۹۸.۲٪</div>
          <div class="kpi-card"><strong>انحراف کل تولید:</strong> ${formatNumber(totalActualPcs - totalPlannedPcs)} عدد</div>
        </div>

        <h2>۱. جدول انحراف از برنامه تولید به تفکیک دستور کار و قطعه (Schedule Adherence)</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>دستور کار</th>
              <th>نام و کد قطعه</th>
              <th>هدف</th>
              <th>تولید سالم</th>
              <th>ضایعات</th>
              <th>تحقق (%)</th>
              <th>انحراف</th>
              <th>وضعیت</th>
              <th>علت ریشه‌ای تأخیر</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <h2>۲. گزارش زمانی توقفات ثبت‌شده ماشین‌آلات و پرس‌ها (Downtime Log)</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>دستگاه و پرس</th>
              <th>سالن</th>
              <th>دسته‌بندی توقف</th>
              <th>ساعت وقوع</th>
              <th>مدت توقف</th>
              <th>شرح علت ریشه‌ای خرابی</th>
              <th>اقدام اصلاحی انجام‌شده</th>
            </tr>
          </thead>
          <tbody>
            ${downtimesHtml}
          </tbody>
        </table>
      </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 300);
  };

  // Export CSV of Adherence & Downtime
  const handleExportCsv = () => {
    const headers = [
      'شماره دستور کار',
      'کد قطعه',
      'نام قطعه',
      'خودرو',
      'تیراژ برنامه‌ریزی‌شده',
      'تولید واقعی سالم',
      'ضایعات',
      'درصد تحقق برنامه (Adherence %)',
      'انحراف تیراژ',
      'وضعیت انطباق',
      'علت ریشه‌ای تأخیر',
    ];
    const rows = adherenceList.map(r => [
      r.orderCode,
      r.partCode,
      r.partName,
      r.carModel,
      r.plannedQty,
      r.actualProducedQty,
      r.scrapQty,
      `${r.adherencePercent}%`,
      r.varianceUnits,
      r.status,
      r.delayRootCause || '',
    ]);
    exportToCsv(`گزارش_انحراف_برنامه_و_OEE_${selectedHorizon}`, headers, rows);
  };

  return (
    <div className="space-y-4 text-right font-sans" dir="rtl">
      {/* ==================================================================== */}
      {/* HEADER: COMPREHENSIVE PRODUCTION PERFORMANCE & ADHERENCE            */}
      {/* ==================================================================== */}
      <div className="sap-card p-4 space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#e8e8e8] pb-3.5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-sm bg-[#e5f3fa] border border-[#007cc0]/25 text-[#007cc0] flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-[#333333]">
                  داشبورد گزارش‌دهی جامع تولید: شاخص‌های بهره‌وری (OEE)، توقفات ماشین‌آلات و انحراف برنامه (Schedule Adherence)
                </h2>
                <span className="px-2 py-0.5 rounded-sm text-[11px] font-bold bg-[#e5f3fa] text-[#007cc0] border border-[#007cc0]/25">
                  نمودارهای ساختار درختی و محور زمانی (Timeline)
                </span>
              </div>
              <p className="text-xs text-[#666666] mt-1">
                رصد بلادرنگ زنجیره ارزش تولید: ساختار سلسله‌مراتبی OEE (دسترس‌پذیری × عملکرد × کیفیت)، توقفات سالن‌های پرس بر روی خط زمان (Gantt/Timeline) و تحلیل شکاف زمانی و مقداری دستورهای ساخت (MO).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrintReport}
              className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-[#007cc0]" />
              <span>چاپ رسمی گزارش (A4 ایزوله)</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="sap-btn-emphasized flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>خروجی اکسل (CSV)</span>
            </button>
          </div>
        </div>

        {/* Global Control Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-[#333333]">بازه زمانی گزارش:</span>
            {[
              { id: 'TODAY' as const, label: 'امروز (شیفت فعال)' },
              { id: 'YESTERDAY' as const, label: 'روز قبل' },
              { id: 'WEEKLY' as const, label: 'هفته جاری (تجمعی)' },
              { id: 'MONTHLY' as const, label: 'ماهانه (۳۰ روز)' },
            ].map(h => (
              <button
                key={h.id}
                type="button"
                onClick={() => setSelectedHorizon(h.id)}
                className={`px-3 py-1 rounded-sm font-bold transition cursor-pointer border ${
                  selectedHorizon === h.id
                    ? 'bg-[#e5f3fa] text-[#007cc0] border-[#007cc0]'
                    : 'bg-[#ffffff] text-[#666666] hover:text-[#333333] border-[#d9d9d9]'
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[#666666] font-medium">فیلتر سالن:</span>
            <select
              value={selectedHall}
              onChange={e => setSelectedHall(e.target.value)}
              className="bg-[#ffffff] border border-[#bfbfbf] focus:border-[#007cc0] rounded-sm px-3 py-1 font-bold text-[#333333] focus:outline-none"
            >
              <option value="ALL">همه سالن‌های کارخانه</option>
              <option value="سالن برش">سالن برش و گیوتین</option>
              <option value="سالن پرس">سالن پرس و فرم‌دهی</option>
              <option value="سالن جوشکاری">سالن جوشکاری و پرس‌جوش</option>
            </select>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* TOP KPI OVERVIEW CARDS                                               */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: OEE */}
        <div className="sap-card border-r-2 border-r-[#007cc0] p-3.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#666666]">شاخص کل OEE کارخانه</span>
            <Gauge className="w-4 h-4 text-[#007cc0]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#333333] font-mono">۷۱.۶٪</span>
            <span className="text-xs font-bold text-[#107e3e]">روند مثبت (+۲.۴٪)</span>
          </div>
          <p className="text-[11px] text-[#666666]">
            هدف استاندارد ساپکو: بالای ۷۰٪ | دسترس‌پذیری ۸۸.۴٪ × عملکرد ۸۲.۵٪ × کیفیت ۹۸.۲٪
          </p>
        </div>

        {/* KPI 2: Schedule Adherence */}
        <div className="sap-card border-r-2 border-r-[#007cc0] p-3.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#666666]">انطباق با برنامه (Adherence)</span>
            <TrendingUp className="w-4 h-4 text-[#007cc0]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#333333] font-mono">
              {toPersianDigits(overallAdherencePercent)}٪
            </span>
            <span className="text-xs font-bold text-[#666666]">
              تولید {formatNumber(totalActualPcs)} از {formatNumber(totalPlannedPcs)}
            </span>
          </div>
          <p className="text-[11px] text-[#666666]">
            کسری نهایی خط: {formatNumber(Math.abs(totalActualPcs - totalPlannedPcs))} قطعه (عمدتاً به دلیل توقف پرس ۲۵۰ تن)
          </p>
        </div>

        {/* KPI 3: Total Downtimes */}
        <div className="sap-card border-r-2 border-r-[#bb0000] p-3.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#666666]">مجموع زمان توقفات ماشین‌آلات</span>
            <Clock className="w-4 h-4 text-[#bb0000]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#bb0000] font-mono">
              {toPersianDigits(totalDowntimeMinutes)}
            </span>
            <span className="text-xs font-bold text-[#666666]">دقیقه ({toPersianDigits((totalDowntimeMinutes / 60).toFixed(1))} ساعت)</span>
          </div>
          <p className="text-[11px] text-[#666666]">
            توقف اضطراری: ۹۵ دقیقه (۴۳٪) | تعویض قالب و ستاپ: ۸۰ دقیقه (۳۶٪) | سایر: ۴۵ دقیقه
          </p>
        </div>

        {/* KPI 4: Quality & Scrap Rate */}
        <div className="sap-card border-r-2 border-r-[#107e3e] p-3.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#666666]">نرخ کیفیت و تولید سالم</span>
            <ShieldAlert className="w-4 h-4 text-[#107e3e]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#107e3e] font-mono">۹۸.۲٪</span>
            <span className="text-xs font-bold text-[#bb0000]">ضایعات: ۱.۸٪ (۱۲۸ عدد)</span>
          </div>
          <p className="text-[11px] text-[#666666]">
            بیشترین ضایعات در قالب کشش صندلی چپ (۳۱ قطعه) به علت نوسان فشار بالشتک پرس
          </p>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SECTION 1: TREE-STRUCTURED OEE BREAKDOWN CHART (نمودار درختی OEE)    */}
      {/* ==================================================================== */}
      <div className="sap-card p-4 space-y-3.5">
        <div className="border-b border-[#e8e8e8] pb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-sm bg-[#fff8f0] text-[#e9730c] border border-[#e9730c]/30 flex items-center justify-center">
              <GitBranch className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#333333]">
                ۱. نمودار ساختار درختی شکست شاخص اثربخشی کلی تجهیزات (Tree-Structured OEE Breakdown)
              </h3>
              <p className="text-xs text-[#666666] mt-0.5">
                نمایش علل ریشه‌ای افت OEE در قالب شاخه‌های دسترس‌پذیری، عملکرد و کیفیت و دلایل فرعی مربوط به هر شاخه
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setIsLogDowntimeModalOpen(true)}
              className="sap-btn-emphasized px-3 py-1 cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ثبت رویداد توقف / خرابی نت</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setExpandedOeeNodes({
                  oee_root: true,
                  oee_avail: true,
                  oee_perf: true,
                  oee_qual: true,
                })
              }
              className="sap-btn-standard px-2.5 py-1 cursor-pointer"
            >
              باز کردن همه شاخه‌ها
            </button>
            <button
              type="button"
              onClick={() =>
                setExpandedOeeNodes({
                  oee_root: true,
                  oee_avail: false,
                  oee_perf: false,
                  oee_qual: false,
                })
              }
              className="sap-btn-standard px-2.5 py-1 cursor-pointer"
            >
              بستن شاخه‌ها
            </button>
          </div>
        </div>

        {/* Tree Root Node */}
        <div className="space-y-4 pt-1">
          {/* Level 0: Root Node */}
          <div className={`p-3.5 rounded-sm border ${oeeTree.borderColor} ${oeeTree.bgColor} transition-all`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleNode(oeeTree.id)}
                  className="w-7 h-7 rounded-lg bg-white border border-amber-300 text-amber-900 flex items-center justify-center cursor-pointer shadow-2xs"
                >
                  {expandedOeeNodes[oeeTree.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <div>
                  <span className="font-bold text-sm text-slate-900 block">{oeeTree.title}</span>
                  <span className="text-xs text-slate-600">{oeeTree.description}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-48 bg-white border border-amber-200 rounded-full h-3 overflow-hidden p-0.5">
                  <div
                    className="bg-amber-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${oeeTree.percentage}%` }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setOeeDrillDownContext({
                      title: 'ریز رکوردهای کلیه توقفات مؤثر بر OEE کل کارخانه',
                      categoryLabel: 'تمام لاگ‌های ثبت‌شده',
                      metric: oeeTree.metric,
                      description: `محاسبه زنده بر اساس ${toPersianDigits(machineDowntimes.length)} رویداد توقف و تعویض قالب در شیفت`,
                      events: machineDowntimes,
                    })
                  }
                  className="font-mono font-black text-xl text-amber-900 hover:underline cursor-pointer flex items-center gap-1"
                  title="کلیک جهت مشاهده لاگ‌های توقف مؤثر بر OEE"
                >
                  <span>{oeeTree.metric}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-amber-600 inline" />
                </button>
              </div>
            </div>

            {/* Level 1: Three Pillars (Availability, Performance, Quality) */}
            {expandedOeeNodes[oeeTree.id] && oeeTree.children && (
              <div className="mt-4 pt-4 border-t border-amber-200/80 grid grid-cols-1 md:grid-cols-3 gap-4">
                {oeeTree.children.map(pillar => {
                  const isExpanded = expandedOeeNodes[pillar.id];
                  return (
                    <div
                      key={pillar.id}
                      className={`p-3.5 rounded-xl border ${pillar.borderColor} ${pillar.bgColor} flex flex-col justify-between space-y-3`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                          <button
                            type="button"
                            onClick={() => toggleNode(pillar.id)}
                            className="flex items-center gap-1.5 text-xs font-bold text-slate-900 hover:text-slate-700 cursor-pointer text-right"
                          >
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
                            <span>{pillar.title}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (pillar.id === 'oee_avail') {
                                setOeeDrillDownContext({
                                  title: 'رویدادهای مؤثر بر دسترس‌پذیری ماشین‌آلات (Availability)',
                                  categoryLabel: 'توقفات برنامه‌ریزی‌شده و اضطراری',
                                  metric: pillar.metric,
                                  description: pillar.description,
                                  events: machineDowntimes,
                                });
                              } else if (pillar.id === 'oee_perf') {
                                setOeeDrillDownContext({
                                  title: 'رویدادهای مؤثر بر راندمان عملکرد و افت سرعت',
                                  categoryLabel: 'توقفات کوتاه و میکرو',
                                  metric: pillar.metric,
                                  description: pillar.description,
                                  events: machineDowntimes.filter(d => d.category === 'MINOR_STOP'),
                                });
                              } else {
                                setOeeDrillDownContext({
                                  title: 'رویدادهای نرخ کیفیت و قطعات معیوب',
                                  categoryLabel: 'ضایعات ستاپ و حین تولید',
                                  metric: pillar.metric,
                                  description: pillar.description,
                                  events: machineDowntimes.filter(
                                    d => d.category === 'SETUP_CHANGE' || d.category === 'UNPLANNED_BREAKDOWN'
                                  ),
                                });
                              }
                            }}
                            className={`font-mono font-bold text-sm hover:underline cursor-pointer flex items-center gap-1 ${pillar.color}`}
                            title="مشاهده لاگ‌های این ستون OEE"
                          >
                            <span>{pillar.metric}</span>
                            <ExternalLink className="w-3 h-3 inline opacity-70" />
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">{pillar.description}</p>
                      </div>

                      {/* Level 2 Sub-branches (Root Causes) */}
                      {isExpanded && pillar.children && (
                        <div className="space-y-2 pt-2 border-t border-slate-200/60">
                          {pillar.children.map(sub => (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => {
                                if (sub.id === 'avail_planned_downtime') {
                                  setOeeDrillDownContext({
                                    title: sub.title,
                                    categoryLabel: 'توقفات تعویض قالب و ستاپ (SMED)',
                                    metric: sub.metric,
                                    description: sub.description,
                                    events: machineDowntimes.filter(d => d.category === 'SETUP_CHANGE'),
                                  });
                                } else if (sub.id === 'avail_unplanned_breakdown') {
                                  setOeeDrillDownContext({
                                    title: sub.title,
                                    categoryLabel: 'خرابی‌های اضطراری مکانیکی و هیدرولیکی',
                                    metric: sub.metric,
                                    description: sub.description,
                                    events: machineDowntimes.filter(
                                      d => d.category === 'UNPLANNED_BREAKDOWN' || d.category === 'MATERIAL_SHORTAGE'
                                    ),
                                  });
                                } else if (sub.id === 'perf_minor_stops') {
                                  setOeeDrillDownContext({
                                    title: sub.title,
                                    categoryLabel: 'توقفات کوتاه و میکرو',
                                    metric: sub.metric,
                                    description: sub.description,
                                    events: machineDowntimes.filter(d => d.category === 'MINOR_STOP'),
                                  });
                                } else {
                                  setOeeDrillDownContext({
                                    title: sub.title,
                                    categoryLabel: 'رویدادهای مرتبط با این شاخه',
                                    metric: sub.metric,
                                    description: sub.description,
                                    events: machineDowntimes,
                                  });
                                }
                              }}
                              className={`w-full p-2.5 rounded-lg border text-right transition cursor-pointer hover:shadow-xs group ${sub.borderColor} ${sub.bgColor} space-y-1 text-xs`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-800 text-[11px] group-hover:text-blue-700 flex items-center gap-1">
                                  <span>{sub.title}</span>
                                  <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition" />
                                </span>
                                <span className="font-mono font-bold text-[11px] text-slate-900 group-hover:underline">
                                  {sub.metric}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 leading-normal">{sub.description}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SECTION 1.5: SCRAP & DOWNTIME PARETO CHART (IATF 16949 / 80-20)      */}
      {/* ==================================================================== */}
      <ScrapParetoChart />

      {/* ==================================================================== */}
      {/* SECTION 2: MACHINE DOWNTIME TIMELINE (نمودار زمانی توقفات ماشین‌آلات) */}
      {/* ==================================================================== */}
      <div className="sap-card p-4 space-y-3.5">
        <div className="border-b border-[#e8e8e8] pb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-sm bg-[#ffebee] text-[#bb0000] border border-[#bb0000]/25 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#333333]">
                ۲. نمودار زمانی توقفات ماشین‌آلات و خطوط تولید (Machine Downtime Timeline / Gantt)
              </h3>
              <p className="text-xs text-[#666666] mt-0.5">
                نمایش توقفات شیفت بر روی خط زمان ۲۴ ساعته (ساعت ۰۷:۰۰ الی ۱۹:۰۰) به تفکیک خرابی اضطراری، تعویض قالب (SMED) و کمبود متریال
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#bb0000] inline-block" />
              <span className="text-[#666666]">خرابی اضطراری</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#e9730c] inline-block" />
              <span className="text-[#666666]">تعویض قالب (SMED)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#d97706] inline-block" />
              <span className="text-[#666666]">توقف جزئی پران</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#007cc0] inline-block" />
              <span className="text-[#666666]">کمبود مهره جوش / تغذیه</span>
            </div>
          </div>
        </div>

        {/* Timeline Axis (Hours 07:00 to 19:00) */}
        <div className="overflow-x-auto border border-[#d9d9d9] rounded-sm p-3.5 bg-[#f8f9fa] space-y-3.5">
          <div className="min-w-[850px] space-y-3">
            {/* Hour Rulers */}
            <div className="grid grid-cols-12 gap-1 text-[11px] font-mono text-[#666666] border-b border-[#d9d9d9] pb-2 text-center">
              <span>۰۷:۰۰</span>
              <span>۰۸:۰۰</span>
              <span>۰۹:۰۰</span>
              <span>۱۰:۰۰</span>
              <span>۱۱:۰۰</span>
              <span>۱۲:۰۰</span>
              <span>۱۳:۰۰</span>
              <span>۱۴:۰۰</span>
              <span>۱۵:۰۰</span>
              <span>۱۶:۰۰</span>
              <span>۱۷:۰۰</span>
              <span>۱۸:۰۰</span>
            </div>

            {/* Machine Rows */}
            {uniqueMachines.map(mch => {
              const events = machineDowntimes.filter(ev => ev.machineCode === mch.code);
              return (
                <div key={mch.code} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#333333]">
                      {mch.name} <span className="font-mono text-[#666666] font-normal">({mch.code} — {mch.hall})</span>
                    </span>
                    <span className="text-[11px] text-[#666666]">
                      مجموع توقف: {toPersianDigits(events.reduce((sum, e) => sum + e.durationMinutes, 0))} دقیقه
                    </span>
                  </div>

                  {/* 12-hour bar track */}
                  <div className="relative h-8 bg-[#ffffff] border border-[#d9d9d9] rounded-sm overflow-hidden flex items-center">
                    {/* Background Grid Lines */}
                    <div className="absolute inset-0 grid grid-cols-12 pointer-events-none divide-x divide-[#e8e8e8] divide-x-reverse" />

                    {/* Render Events as blocks along 12 hours (7:00 to 19:00 = 720 minutes) */}
                    {events.map(ev => {
                      const [hStr, mStr] = ev.startHour.split(':');
                      const startTotalMinutes = (parseInt(hStr, 10) - 7) * 60 + parseInt(mStr, 10);
                      const leftPercent = Math.max(0, Math.min(100, (startTotalMinutes / 720) * 100));
                      const widthPercent = Math.max(2, Math.min(100 - leftPercent, (ev.durationMinutes / 720) * 100));

                      return (
                        <div
                          key={ev.id}
                          style={{
                            right: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                          }}
                          title={`${ev.categoryLabel} (${ev.startHour} به مدت ${ev.durationMinutes} دقیقه): ${ev.reason}`}
                          className={`absolute h-6 rounded-xs px-1.5 text-[10px] text-white font-bold flex items-center justify-center truncate cursor-pointer shadow-xs ${ev.color}`}
                        >
                          {ev.durationMinutes}m
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detailed Downtime Log Table */}
        <div className="overflow-x-auto border border-[#d9d9d9] rounded-sm">
          <table className="w-full text-right text-xs sap-table-compact">
            <thead className="bg-[#ffffff] border-b border-[#d9d9d9] text-[#333333]">
              <tr>
                <th className="py-2 px-3">کد ماشین</th>
                <th className="py-2 px-3">نام دستگاه و پرس</th>
                <th className="py-2 px-3">سالن</th>
                <th className="py-2 px-3">نوع توقف</th>
                <th className="py-2 px-3">ساعت شروع</th>
                <th className="py-2 px-3">مدت (دقیقه)</th>
                <th className="py-2 px-3">علت ریشه‌ای خرابی</th>
                <th className="py-2 px-3">اقدام اصلاحی انجام‌شده (Action)</th>
                <th className="py-2 px-3 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e8e8]">
              {filteredDowntimes.map(ev => (
                <tr key={ev.id} className="hover:bg-[#e5f3fa]/55">
                  <td className="py-2 px-3 font-mono font-bold text-[#333333]">{ev.machineCode}</td>
                  <td className="py-2 px-3 font-bold text-[#333333]">{ev.machineName}</td>
                  <td className="py-2 px-3 text-[#666666]">{ev.hall}</td>
                  <td className="py-2 px-3">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[11px] font-bold bg-[#f8f9fa] text-[#333333] border border-[#d9d9d9]">
                      <span className={`w-2 h-2 rounded-full ${ev.color}`} />
                      <span>{ev.categoryLabel}</span>
                    </span>
                  </td>
                  <td className="py-2 px-3 font-mono font-bold text-[#333333]">{ev.startHour}</td>
                  <td className="py-2 px-3 font-mono font-bold text-[#bb0000]">{toPersianDigits(ev.durationMinutes)} min</td>
                  <td className="py-2 px-3 text-[#333333] text-[11px] leading-snug">{ev.reason}</td>
                  <td className="py-2 px-3 text-[#107e3e] text-[11px] leading-snug">{ev.actionTaken}</td>
                  <td className="py-2 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => handleDeleteDowntimeEvent(ev.id)}
                      className="p-1 text-[#666666] hover:text-[#bb0000] hover:bg-[#ffebee] rounded-sm transition cursor-pointer"
                      title="حذف این توقف و به‌روزرسانی آنی درصد شاخه‌های درخت OEE"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SECTION 3: SCHEDULE ADHERENCE (انحراف از برنامه تولید و زمان‌بندی)    */}
      {/* ==================================================================== */}
      <div className="sap-card p-4 space-y-3.5">
        <div className="border-b border-[#e8e8e8] pb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-sm bg-[#e5f3fa] text-[#007cc0] border border-[#007cc0]/25 flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#333333]">
                ۳. ماتریس انحراف از برنامه تولید و تطابق زمان‌بندی (Schedule Adherence & Variance Analysis)
              </h3>
              <p className="text-xs text-[#666666] mt-0.5">
                مقایسه دقیق تیراژ مصوب و تیراژ تولید سالم به همراه افق زمانی برنامه‌ریزی‌شده و ریشه‌یابی تأخیرات
              </p>
            </div>
          </div>

          <div className="relative w-64 text-xs">
            <Search className="w-3.5 h-3.5 text-[#666666] absolute right-2.5 top-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="جستجوی دستور کار یا نام قطعه..."
              className="w-full bg-[#ffffff] border border-[#bfbfbf] focus:border-[#007cc0] rounded-sm pr-8 pl-2.5 py-1.5 text-[#333333] focus:outline-none"
            />
          </div>
        </div>

        {/* Schedule Adherence Table */}
        <div className="overflow-x-auto border border-[#d9d9d9] rounded-sm">
          <table className="w-full text-right text-xs sap-table-compact">
            <thead className="bg-[#ffffff] border-b border-[#d9d9d9] text-[#333333]">
              <tr>
                <th className="py-2 px-3">شماره دستور کار</th>
                <th className="py-2 px-3">نام و مشخصات قطعه</th>
                <th className="py-2 px-3">خودرو</th>
                <th className="py-2 px-3">زمان مصوب</th>
                <th className="py-2 px-3">زمان واقعی</th>
                <th className="py-2 px-3">تیراژ مصوب</th>
                <th className="py-2 px-3 text-[#107e3e]">تولید سالم</th>
                <th className="py-2 px-3 text-[#bb0000]">ضایعات</th>
                <th className="py-2 px-3">درصد تحقق (Adherence)</th>
                <th className="py-2 px-3">انحراف (تعداد)</th>
                <th className="py-2 px-3">وضعیت انطباق</th>
                <th className="py-2 px-3">علت ریشه‌ای تأخیر</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e8e8]">
              {filteredAdherence.map(item => {
                const statusBadge =
                  item.status === 'AHEAD'
                    ? { bg: 'bg-[#e8f5e9] text-[#107e3e] border-[#107e3e]/30', text: 'جلوتر از برنامه' }
                    : item.status === 'ON_TRACK'
                    ? { bg: 'bg-[#e5f3fa] text-[#007cc0] border-[#007cc0]/30', text: 'منطبق با برنامه' }
                    : item.status === 'DELAYED'
                    ? { bg: 'bg-[#fff8f0] text-[#e9730c] border-[#e9730c]/30', text: 'دارای تأخیر' }
                    : { bg: 'bg-[#ffebee] text-[#bb0000] border-[#bb0000]/30', text: 'تأخیر بحرانی' };

                return (
                  <tr key={item.orderCode} className="hover:bg-[#e5f3fa]/55">
                    <td className="py-2 px-3 font-mono font-bold">
                      <button
                        type="button"
                        onClick={() => traceDocument(item.orderCode, 'WIP_TRACEABILITY')}
                        className="sap-doc-link"
                        title="رهگیری دستور کار در WIP"
                      >
                        {item.orderCode}
                      </button>
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-bold text-[#333333]">{item.partName}</div>
                      <button
                        type="button"
                        onClick={() => traceDocument(item.partCode, 'INVENTORY_LEDGER')}
                        className="sap-doc-link text-[10px]"
                        title="مشاهده کاردکس قطعه"
                      >
                        {item.partCode}
                      </button>
                    </td>
                    <td className="py-2 px-3 text-[#333333]">{item.carModel}</td>
                    <td className="py-2 px-3 font-mono text-[#666666] text-[11px]">
                      {item.plannedStartHour} تا {item.plannedEndHour}
                    </td>
                    <td className="py-2 px-3 font-mono text-[#333333] text-[11px]">
                      {item.actualStartHour} تا {item.actualEndHour}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-[#333333]">
                      {formatNumber(item.plannedQty)}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-[#107e3e]">
                      {formatNumber(item.actualProducedQty)}
                    </td>
                    <td className="py-2 px-3 font-mono text-[#bb0000]">
                      {formatNumber(item.scrapQty)}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-[#f0f0f0] rounded-sm h-2 overflow-hidden border border-[#d9d9d9]">
                          <div
                            className={`h-full ${
                              item.adherencePercent >= 95
                                ? 'bg-[#107e3e]'
                                : item.adherencePercent >= 85
                                ? 'bg-[#e9730c]'
                                : 'bg-[#bb0000]'
                            }`}
                            style={{ width: `${Math.min(100, item.adherencePercent)}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-[#333333]">{toPersianDigits(item.adherencePercent)}٪</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 font-mono font-bold">
                      <span className={item.varianceUnits >= 0 ? 'text-[#107e3e]' : 'text-[#bb0000]'}>
                        {item.varianceUnits >= 0 ? `+${formatNumber(item.varianceUnits)}` : formatNumber(item.varianceUnits)}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold border ${statusBadge.bg}`}>
                        {statusBadge.text}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-[11px] text-[#666666] leading-snug">
                      {item.delayRootCause || '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODAL: LOG NEW DOWNTIME / MAINTENANCE BREAKDOWN (DYNAMIC OEE ENGINE) */}
      {/* ==================================================================== */}
      {isLogDowntimeModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#333333]/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-[#d9d9d9] rounded-sm max-w-md w-full p-5 shadow-2xl space-y-4 text-right text-xs">
            <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#007cc0]" />
                <h4 className="font-bold text-sm text-[#333333]">
                  ثبت لاگ توقف دستگاه و باز-محاسبه زنده شاخص OEE
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setIsLogDowntimeModalOpen(false)}
                className="p-1 hover:bg-[#f5f5f5] rounded-sm text-[#666666] hover:text-[#333333] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddDowntimeEvent} className="space-y-3">
              <div>
                <label className="block font-bold text-[#333333] mb-1">دستگاه و خط تولید *</label>
                <select
                  value={newDtMachineCode}
                  onChange={e => setNewDtMachineCode(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] focus:border-[#007cc0] rounded-sm px-3 py-1.5 font-bold text-xs text-[#333333] focus:outline-none cursor-pointer"
                >
                  <option value="PRS-250T-01">پرس ۲۵۰ تن ۱ (کشش/بلنک - سالن پرس)</option>
                  <option value="PRS-160T-01">پرس ۱۶۰ تن ۱ (خم/پانچ - سالن پرس)</option>
                  <option value="SHR-GUI-01">قیچی گیوتین ۶ متری ۱ (سالن برش)</option>
                  <option value="PRS-800T-G1">پرس هیدرولیک ۸۰۰ تن (سالن پرس سنگین)</option>
                  <option value="WLD-SPOT-01">پرس‌جوش مقاومتی ۱ (مهره‌جوش M6 - سالن جوش)</option>
                  <option value="WLD-CO2-ST01">کابین جوش CO2 شماره ۱ (سالن جوش)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#333333] mb-1">دسته‌بندی توقف *</label>
                  <select
                    value={newDtCategory}
                    onChange={e => setNewDtCategory(e.target.value as any)}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] focus:border-[#007cc0] rounded-sm px-2.5 py-1.5 font-bold text-xs text-[#333333] focus:outline-none cursor-pointer"
                  >
                    <option value="UNPLANNED_BREAKDOWN">خرابی اضطراری (نت)</option>
                    <option value="SETUP_CHANGE">تعویض قالب و ستاپ (SMED)</option>
                    <option value="MINOR_STOP">توقف کوتاه / میکرو</option>
                    <option value="MATERIAL_SHORTAGE">کسری ورق / مواد اولیه</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-[#333333] mb-1">مدت زمان توقف (دقیقه) *</label>
                  <input
                    type="number"
                    min={1}
                    max={480}
                    required
                    value={newDtDuration}
                    onChange={e => setNewDtDuration(Number(e.target.value))}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] focus:border-[#007cc0] rounded-sm px-3 py-1.5 font-mono font-bold text-xs text-[#bb0000] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">ساعت شروع توقف</label>
                <input
                  type="text"
                  placeholder="مثلاً 10:30"
                  value={newDtStartHour}
                  onChange={e => setNewDtStartHour(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] focus:border-[#007cc0] rounded-sm px-3 py-1.5 font-mono text-xs text-[#333333] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">علت توقف و ریشه‌یابی عیب *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="شرح خرابی، نشت روغن، شکست سنبه، عیب الکتریکی..."
                  value={newDtReason}
                  onChange={e => setNewDtReason(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] focus:border-[#007cc0] rounded-sm px-3 py-1.5 text-xs text-[#333333] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">اقدام اصلاحی و عملیات نت (PM)</label>
                <input
                  type="text"
                  placeholder="تعویض پکینگ، هواگیری، تیزکاری تیغه..."
                  value={newDtAction}
                  onChange={e => setNewDtAction(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] focus:border-[#007cc0] rounded-sm px-3 py-1.5 text-xs text-[#333333] focus:outline-none"
                />
              </div>

              <div className="p-2.5 rounded-sm bg-[#fff8f0] border border-[#e9730c]/30 text-[10px] text-[#333333] leading-relaxed">
                با فشردن دکمه ثبت، زمان توقف مستقیماً از ساعت کارکرد خالص کم شده و شاخص دسترس‌پذیری (Availability) و OEE در نمودار درختی بلافاصله باز-محاسبه می‌گردد.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#e8e8e8]">
                <button
                  type="button"
                  onClick={() => setIsLogDowntimeModalOpen(false)}
                  className="sap-btn-standard px-4 py-1.5 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="sap-btn-emphasized px-5 py-1.5 cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>ثبت توقف و باز-محاسبه OEE</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SLIDE-OVER DRAWER: OEE TREE BRANCH DRILL-DOWN (RECORDS BEHIND NODE)  */}
      {/* ==================================================================== */}
      {oeeDrillDownContext && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-[#333333]/40 backdrop-blur-[1px] flex justify-end animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-[#ffffff] h-full shadow-2xl flex flex-col text-right text-xs border-r border-[#d9d9d9]">
            <div className="p-4 border-b border-[#d9d9d9] bg-[#f8f9fa] flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-sm bg-[#e5f3fa] text-[#007cc0] border border-[#007cc0]/25 text-[10px] font-bold">
                    Drill-Down شاخه درخت OEE
                  </span>
                  <span className="font-mono font-bold text-[#333333] text-sm">
                    {oeeDrillDownContext.metric}
                  </span>
                </div>
                <h3 className="font-bold text-sm text-[#333333] mt-1">{oeeDrillDownContext.title}</h3>
                <p className="text-[#666666] text-[11px] mt-0.5">{oeeDrillDownContext.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setOeeDrillDownContext(null)}
                className="p-1.5 text-[#666666] hover:text-[#333333] rounded-sm hover:bg-[#e8e8e8] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-[#e5f3fa] border-b border-[#007cc0]/20 text-[11px] text-[#333333] flex items-center justify-between">
              <span>دسته‌بندی: <strong>{oeeDrillDownContext.categoryLabel}</strong></span>
              <span>تعداد رویدادهای خام: <strong>{toPersianDigits(oeeDrillDownContext.events.length)} مورد</strong></span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {oeeDrillDownContext.events.length > 0 ? (
                oeeDrillDownContext.events.map(ev => (
                  <div key={ev.id} className="p-3 bg-[#f8f9fa] border border-[#d9d9d9] rounded-sm space-y-1.5 hover:bg-[#ffffff] transition">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold bg-[#007cc0] text-white px-2 py-0.5 rounded-sm text-[10px]">
                          {ev.machineCode}
                        </span>
                        <strong className="text-[#333333] text-xs">{ev.machineName}</strong>
                      </div>
                      <span className="font-mono font-bold text-[#bb0000] text-xs bg-[#ffebee] border border-[#bb0000]/25 px-2 py-0.5 rounded-sm">
                        {toPersianDigits(ev.durationMinutes)} دقیقه توقف
                      </span>
                    </div>
                    <div className="text-[11px] text-[#333333] leading-snug">
                      <span className="text-[#666666] font-semibold">علت خرابی: </span>
                      {ev.reason}
                    </div>
                    <div className="text-[11px] text-[#107e3e] leading-snug">
                      <span className="text-[#107e3e] font-semibold">اقدام اصلاحی نت: </span>
                      {ev.actionTaken}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-[#666666] font-mono pt-1 border-t border-[#e8e8e8]">
                      <span>سالن: {ev.hall}</span>
                      <span>شروع: {ev.startHour}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteDowntimeEvent(ev.id)}
                        className="text-[#bb0000] hover:underline flex items-center gap-0.5 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>حذف رویداد</span>
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-12 text-center text-[#666666]">
                  هیچ لاگ توقفی در این شاخه ثبت نشده است.
                </div>
              )}
            </div>

            <div className="p-3 border-t border-[#d9d9d9] bg-[#f8f9fa] flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  setOeeDrillDownContext(null);
                  setIsLogDowntimeModalOpen(true);
                }}
                className="sap-btn-emphasized px-3.5 py-1.5 flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>ثبت لاگ توقف جدید</span>
              </button>
              <button
                type="button"
                onClick={() => setOeeDrillDownContext(null)}
                className="sap-btn-standard px-4 py-1.5 cursor-pointer"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
