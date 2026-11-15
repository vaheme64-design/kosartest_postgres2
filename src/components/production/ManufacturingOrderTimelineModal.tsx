import React, { useState, useMemo } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Calendar,
  Factory,
  Wrench,
  Gauge,
  ArrowRight,
  Printer,
  Download,
  Filter,
  Search,
  ExternalLink,
  ShieldCheck,
  ChevronDown,
  X,
  Boxes,
  FileCheck2,
  TrendingUp,
  Cpu,
  UserCheck,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { MultiPartScheduleItem, ScheduledOpStep, WORK_DAYS } from './ErpProductionWorkbenchView';
import { formatNumber, toPersianDigits, exportToCsv } from '../../utils/formatters';
import { useErpRouter } from '../../context/RouterContext';

interface ManufacturingOrderTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: MultiPartScheduleItem | null;
  allOrders: MultiPartScheduleItem[];
  onSelectOrder?: (order: MultiPartScheduleItem) => void;
  onOpenLogModal?: (partItem: MultiPartScheduleItem, opStep: ScheduledOpStep) => void;
}

export const ManufacturingOrderTimelineModal: React.FC<ManufacturingOrderTimelineModalProps> = ({
  isOpen,
  onClose,
  order,
  allOrders,
  onSelectOrder,
  onOpenLogModal,
}) => {
  const { traceDocument } = useErpRouter();
  const [selectedOrderId, setSelectedOrderId] = useState<string>(order?.id || '');
  const [filterType, setFilterType] = useState<'ALL' | 'OPS_ONLY' | 'COMPLETED' | 'IN_PROGRESS'>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Sync when prop order changes
  React.useEffect(() => {
    if (order?.id) {
      setSelectedOrderId(order.id);
    }
  }, [order?.id]);

  const activeOrder = useMemo(() => {
    if (selectedOrderId) {
      const found = allOrders.find(o => o.id === selectedOrderId || o.orderCode === selectedOrderId);
      if (found) return found;
    }
    return order || allOrders[0] || null;
  }, [selectedOrderId, allOrders, order]);

  // Overall metrics calculation
  const metrics = useMemo(() => {
    if (!activeOrder) return null;

    const totalOps = activeOrder.ops.length;
    const completedOps = activeOrder.ops.filter(o => o.status === 'COMPLETED').length;
    const inProgressOps = activeOrder.ops.filter(o => o.status === 'IN_PROGRESS').length;
    const rolledForwardOps = activeOrder.ops.filter(o => o.status === 'ROLLED_FORWARD').length;

    const totalGoodProduced = activeOrder.ops.reduce((sum, o) => sum + o.completedGoodQty, 0);
    const totalScrap = activeOrder.ops.reduce((sum, o) => sum + o.scrapQty, 0);
    const scrapRate = totalGoodProduced + totalScrap > 0
      ? ((totalScrap / (totalGoodProduced + totalScrap)) * 100).toFixed(1)
      : '0.0';

    const finalOp = activeOrder.ops[activeOrder.ops.length - 1];
    const finalReceived = activeOrder.warehouseReceivedQty || (finalOp ? finalOp.completedGoodQty : 0);
    const completionPercentage = activeOrder.weeklyTargetQty > 0
      ? Math.min(100, Math.round((finalReceived / activeOrder.weeklyTargetQty) * 100))
      : 0;

    const rawMaterialYield = activeOrder.rawMaterialIssuedKg > 0
      ? Math.min(100, Math.round(((finalReceived * activeOrder.unitWeightKg) / activeOrder.rawMaterialIssuedKg) * 100))
      : 100;

    return {
      totalOps,
      completedOps,
      inProgressOps,
      rolledForwardOps,
      totalGoodProduced,
      totalScrap,
      scrapRate,
      finalReceived,
      completionPercentage,
      rawMaterialYield,
      finalOp,
    };
  }, [activeOrder]);

  // Timeline events reconstruction
  const timelineEvents = useMemo(() => {
    if (!activeOrder) return [];

    interface TimelineEvent {
      id: string;
      stepType: 'RELEASE' | 'RAW_MATERIAL' | 'OPERATION' | 'QC_INSPECTION' | 'WAREHOUSE_RECEIPT';
      stepIndex: number;
      title: string;
      subTitle: string;
      status: 'DONE' | 'ACTIVE' | 'WARNING' | 'PENDING';
      dateLabel: string;
      timeLabel: string;
      details: {
        machine?: string;
        machineCode?: string;
        dieCode?: string;
        hall?: string;
        shift?: string;
        targetQty?: number;
        goodQty?: number;
        scrapQty?: number;
        wipNext?: number;
        docNumber?: string;
        weightKg?: number;
        spec?: string;
        operator?: string;
        efficiency?: number;
      };
      opRef?: ScheduledOpStep;
    }

    const events: TimelineEvent[] = [];

    // 1. Order Release Milestone
    events.push({
      id: `EV-RELEASE-${activeOrder.id}`,
      stepType: 'RELEASE',
      stepIndex: 1,
      title: 'ایجاد و تصویب برنامه تولید (MO Release)',
      subTitle: `ثبت دستور ساخت شماره ${activeOrder.orderCode} در سیستم APS`,
      status: 'DONE',
      dateLabel: '۱۴۰۴/۰۲/۱۹',
      timeLabel: '۰۸:۳۰',
      details: {
        docNumber: activeOrder.orderCode,
        targetQty: activeOrder.weeklyTargetQty,
        operator: 'مهندس حسینی (واحد برنامه‌ریزی تولید)',
      },
    });

    // 2. Raw Material Allocation Milestone
    const isMaterialAllocated = activeOrder.rawMaterialIssuedKg > 0;
    events.push({
      id: `EV-RM-${activeOrder.id}`,
      stepType: 'RAW_MATERIAL',
      stepIndex: 2,
      title: 'تخصیص و حواله کویل ورق (Coil Allocation)',
      subTitle: activeOrder.rawMaterialName,
      status: isMaterialAllocated ? 'DONE' : 'PENDING',
      dateLabel: '۱۴۰۴/۰۲/۲۰',
      timeLabel: '۰۹:۱۵',
      details: {
        docNumber: `ISS-RM-${activeOrder.orderCode.replace('MO-', '')}`,
        weightKg: activeOrder.rawMaterialIssuedKg,
        spec: activeOrder.rawMaterialCode,
        operator: 'انبار مواد اولیه و رول ورق (WH-RAW)',
      },
    });

    // 3. Operations Steps
    activeOrder.ops.forEach((op, idx) => {
      let eventStatus: 'DONE' | 'ACTIVE' | 'WARNING' | 'PENDING' = 'PENDING';
      if (op.status === 'COMPLETED') eventStatus = 'DONE';
      else if (op.status === 'IN_PROGRESS') eventStatus = 'ACTIVE';
      else if (op.status === 'ROLLED_FORWARD') eventStatus = 'WARNING';

      const dayObj = WORK_DAYS.find(d => d.index === op.scheduledDayIndex) || WORK_DAYS[0];
      const eff = op.effectiveTargetQty > 0
        ? Math.min(100, Math.round((op.completedGoodQty / op.effectiveTargetQty) * 100))
        : 0;

      events.push({
        id: `EV-OP-${op.opId}`,
        stepType: 'OPERATION',
        stepIndex: 3 + idx,
        title: `${op.opCode} — ${op.opTitle}`,
        subTitle: `${op.stationHall} | ${op.machineName}`,
        status: eventStatus,
        dateLabel: dayObj.date,
        timeLabel: op.shiftName === 'شیفت صبح' ? '۰۷:۳۰' : op.shiftName === 'شیفت عصر' ? '۱۵:۳۰' : '۲۳:۳۰',
        details: {
          machine: op.machineName,
          machineCode: op.machineCode,
          dieCode: op.dieCode,
          hall: op.stationHall,
          shift: op.shiftName,
          targetQty: op.effectiveTargetQty,
          goodQty: op.completedGoodQty,
          scrapQty: op.scrapQty,
          wipNext: op.wipBufferAfterOp,
          efficiency: eff,
          docNumber: op.warehouseReceiptDocNumber,
          operator: `اپراتور ایستگاه ${op.opCode}`,
        },
        opRef: op,
      });

      // Insert In-Process QC Milestone after key forming/welding steps (e.g. OP20 or OP40)
      if (idx === 1 || (idx === activeOrder.ops.length - 2 && activeOrder.ops.length >= 4)) {
        const isQcPassed = op.status === 'COMPLETED' || op.completedGoodQty > 0;
        events.push({
          id: `EV-QC-${op.opId}`,
          stepType: 'QC_INSPECTION',
          stepIndex: 3 + idx + 0.5,
          title: `بازرسی کیفی بین‌ایستگاهی (In-Process QC Check - ${op.opCode})`,
          subTitle: 'کنترل ابعادی، تست گِیج و بازرسی عدم پلیسه/ترک کشش',
          status: isQcPassed ? 'DONE' : 'PENDING',
          dateLabel: dayObj.date,
          timeLabel: '۱۱:۴۵',
          details: {
            docNumber: `QC-INSP-${op.opCode}-${activeOrder.orderCode.replace('MO-', '')}`,
            spec: 'استاندارد ابعادی Sapco STD-4109',
            operator: 'بازرس کنترل کیفیت خط (QC Line Inspector)',
          },
        });
      }
    });

    // 4. Warehouse Receipt Milestone
    const finalOp = activeOrder.ops[activeOrder.ops.length - 1];
    const isReceivedInWh = (activeOrder.warehouseReceivedQty > 0) || (finalOp && finalOp.status === 'COMPLETED');
    const receiptDoc = finalOp?.warehouseReceiptDocNumber || `RCV-FG-${activeOrder.orderCode.replace('MO-', '')}`;

    events.push({
      id: `EV-FG-RCV-${activeOrder.id}`,
      stepType: 'WAREHOUSE_RECEIPT',
      stepIndex: 99,
      title: 'تحویل نهایی به انبار محصول و صدور رسید (FG Receipt)',
      subTitle: `انبار قطعات نهایی خودرویی (WH-FG-01) — پالت‌بندی و برچسب SAPCO`,
      status: isReceivedInWh ? 'DONE' : 'PENDING',
      dateLabel: isReceivedInWh ? '۱۴۰۴/۰۲/۲۴' : 'در انتظار اتمام',
      timeLabel: isReceivedInWh ? '۱۶:۰۰' : '---',
      details: {
        docNumber: receiptDoc,
        goodQty: activeOrder.warehouseReceivedQty || (finalOp ? finalOp.completedGoodQty : 0),
        operator: 'انباردار محصولات نهایی (WH-FG)',
      },
    });

    return events;
  }, [activeOrder]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    return timelineEvents.filter(ev => {
      if (filterType === 'OPS_ONLY' && ev.stepType !== 'OPERATION') return false;
      if (filterType === 'COMPLETED' && ev.status !== 'DONE') return false;
      if (filterType === 'IN_PROGRESS' && ev.status !== 'ACTIVE' && ev.status !== 'WARNING') return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchTitle = ev.title.toLowerCase().includes(q);
        const matchSub = ev.subTitle.toLowerCase().includes(q);
        const matchDoc = ev.details.docNumber?.toLowerCase().includes(q) || false;
        const matchMachine = ev.details.machine?.toLowerCase().includes(q) || false;
        return matchTitle || matchSub || matchDoc || matchMachine;
      }
      return true;
    });
  }, [timelineEvents, filterType, searchTerm]);

  // Export CSV
  const handleExportTimelineCsv = () => {
    if (!activeOrder) return;
    const headers = [
      'شناسه رویداد',
      'نوع مرحله',
      'عنوان رویداد',
      'توضیحات',
      'وضعیت',
      'تاریخ',
      'ساعت',
      'ماشین / ایستگاه',
      'کد قالب',
      'شیفت',
      'تیراژ هدف',
      'تولید سالم',
      'ضایعات',
      'شماره سند',
    ];
    const rows = timelineEvents.map(e => [
      e.id,
      e.stepType,
      e.title,
      e.subTitle,
      e.status,
      e.dateLabel,
      e.timeLabel,
      e.details.machine || '-',
      e.details.dieCode || '-',
      e.details.shift || '-',
      e.details.targetQty || 0,
      e.details.goodQty || 0,
      e.details.scrapQty || 0,
      e.details.docNumber || '-',
    ]);
    exportToCsv(`MO_Timeline_${activeOrder.orderCode}`, headers, rows);
  };

  // Print Timeline
  const handlePrintTimeline = () => {
    if (!activeOrder) return;
    const content = `
      <!DOCTYPE html>
      <html lang="fa" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>شناسنامه و تاریخچه دستور کار ${activeOrder.orderCode}</title>
        <style>
          body { font-family: Tahoma, Arial, sans-serif; padding: 24px; color: #111; direction: rtl; }
          h1 { font-size: 18px; margin-bottom: 4px; border-bottom: 2px solid #222; padding-bottom: 8px; }
          .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
          .meta-table td, .meta-table th { border: 1px solid #ccc; padding: 6px 10px; }
          .meta-table th { background: #f0f0f0; }
          .timeline-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 16px; }
          .timeline-table th, .timeline-table td { border: 1px solid #ccc; padding: 6px; text-align: center; }
          .timeline-table th { background: #e5e5e5; }
        </style>
      </head>
      <body>
        <h1>شناسنامه رهگیری و تایم‌لاین دستور ساخت (MO Lifecycle Traveler)</h1>
        <table class="meta-table">
          <tr>
            <th>شماره دستور ساخت (MO)</th>
            <td><strong>${activeOrder.orderCode}</strong></td>
            <th>نام قطعه</th>
            <td><strong>${activeOrder.partName}</strong> (${activeOrder.partCode})</td>
          </tr>
          <tr>
            <th>خودرو / کاربرد</th>
            <td>${activeOrder.carModel}</td>
            <th>تیراژ مصوب سفارش</th>
            <td><strong>${formatNumber(activeOrder.weeklyTargetQty)} عدد</strong></td>
          </tr>
          <tr>
            <th>کد رول ورق مصرفی</th>
            <td>${activeOrder.rawMaterialCode} (${activeOrder.rawMaterialName})</td>
            <th>وزن ناخالص حواله</th>
            <td>${formatNumber(activeOrder.rawMaterialIssuedKg)} کیلوگرم</td>
          </tr>
        </table>

        <h3>رویدادهای ثبت‌شده در چرخه حیات دستور ساخت:</h3>
        <table class="timeline-table">
          <thead>
            <tr>
              <th>ردیف</th>
              <th>مرحله / رویداد</th>
              <th>ایستگاه / ماشین</th>
              <th>تاریخ و زمان</th>
              <th>هدف</th>
              <th>تولید سالم</th>
              <th>ضایعات</th>
              <th>شماره سند</th>
              <th>وضعیت</th>
            </tr>
          </thead>
          <tbody>
            ${timelineEvents
              .map(
                (ev, idx) => `
              <tr>
                <td>${toPersianDigits(idx + 1)}</td>
                <td style="text-align: right;"><strong>${ev.title}</strong><br/><small>${ev.subTitle}</small></td>
                <td>${ev.details.machine || ev.details.hall || '-'}</td>
                <td>${ev.dateLabel} - ${ev.timeLabel}</td>
                <td>${ev.details.targetQty ? formatNumber(ev.details.targetQty) : '-'}</td>
                <td>${ev.details.goodQty ? formatNumber(ev.details.goodQty) : '-'}</td>
                <td>${ev.details.scrapQty ? formatNumber(ev.details.scrapQty) : '-'}</td>
                <td style="font-family: monospace;">${ev.details.docNumber || '-'}</td>
                <td>${ev.status === 'DONE' ? 'تکمیل' : ev.status === 'ACTIVE' ? 'در حال انجام' : ev.status === 'WARNING' ? 'انتقال یافته' : 'در انتظار'}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);
    const doc = frame.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(content);
    doc.close();
    setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      frame.remove();
    }, 400);
  };

  if (!isOpen || !activeOrder) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#333333]/40 backdrop-blur-[1px] animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-5xl max-h-[92vh] rounded-md shadow-xl flex flex-col border border-[#d9d9d9] overflow-hidden text-right font-sans">
        {/* Top Header */}
        <div className="px-5 py-3.5 bg-[#ffffff] text-[#333333] flex items-center justify-between gap-4 border-b border-[#d9d9d9]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-[#e5f3fa] border border-[#b3ddf2] flex items-center justify-center text-[#007cc0]">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    traceDocument(activeOrder.orderCode, 'WIP_TRACEABILITY');
                    onClose();
                  }}
                  className="sap-doc-link font-mono text-xs px-2 py-0.5 rounded bg-[#e5f3fa] border border-[#b3ddf2] cursor-pointer"
                  title="ردیابی دستور ساخت در WIP"
                >
                  {activeOrder.orderCode}
                </button>
                <h2 className="text-sm font-bold text-[#333333] tracking-tight">
                  تاریخچه وضعیت و تایم‌لاین دستور ساخت (MO Lifecycle)
                </h2>
              </div>
              <p className="text-xs text-[#666666] mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span>{activeOrder.partName}</span>
                <span>(</span>
                <button
                  type="button"
                  onClick={() => {
                    traceDocument(activeOrder.partCode, 'INVENTORY_LEDGER');
                    onClose();
                  }}
                  className="sap-doc-link font-mono cursor-pointer"
                  title="مشاهده کاردکس قطعه"
                >
                  {activeOrder.partCode}
                </button>
                <span>) — {activeOrder.carModel}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Order Switcher Dropdown */}
            <div className="relative">
              <select
                value={activeOrder.id}
                onChange={e => {
                  setSelectedOrderId(e.target.value);
                  const sel = allOrders.find(o => o.id === e.target.value);
                  if (sel && onSelectOrder) onSelectOrder(sel);
                }}
                className="bg-white hover:bg-[#f7f7f7] text-[#333333] text-xs rounded px-3 py-1.5 border border-[#bfbfbf] focus:outline-none focus:border-[#007cc0] cursor-pointer"
              >
                {allOrders.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.orderCode} — {o.partName.slice(0, 24)}...
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handlePrintTimeline}
              className="sap-btn-standard p-1.5 cursor-pointer"
              title="چاپ شناسنامه رهگیری"
            >
              <Printer className="w-4 h-4 text-[#007cc0]" />
            </button>
            <button
              type="button"
              onClick={handleExportTimelineCsv}
              className="sap-btn-standard p-1.5 cursor-pointer"
              title="خروجی فایل اکسل (CSV)"
            >
              <Download className="w-4 h-4 text-[#107e3e]" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[#666666] hover:text-[#333333] hover:bg-[#f0f0f0] rounded transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick KPI Strip */}
        {metrics && (
          <div className="bg-[#f0f0f0] border-b border-[#d9d9d9] px-5 py-3 grid grid-cols-2 sm:grid-cols-6 gap-2.5">
            <div className="bg-white p-2.5 rounded border border-[#d9d9d9]">
              <span className="text-[10px] text-[#666666] font-medium block">تیراژ مصوب سفارش</span>
              <div className="text-sm font-bold text-[#333333] font-mono mt-0.5">
                {formatNumber(activeOrder.weeklyTargetQty)}{' '}
                <span className="text-[10px] font-normal text-[#666666]">عدد</span>
              </div>
            </div>

            <div className="bg-white p-2.5 rounded border border-[#d9d9d9]">
              <span className="text-[10px] text-[#666666] font-medium block">تحویل قطعی به انبار</span>
              <div className="text-sm font-bold text-[#107e3e] font-mono mt-0.5 flex items-center justify-between">
                <span>{formatNumber(metrics.finalReceived)}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#eef8f2] text-[#107e3e]">
                  {toPersianDigits(metrics.completionPercentage)}٪
                </span>
              </div>
            </div>

            <div className="bg-white p-2.5 rounded border border-[#d9d9d9]">
              <span className="text-[10px] text-[#666666] font-medium block">تعداد مراحل عملیاتی</span>
              <div className="text-sm font-bold text-[#333333] font-mono mt-0.5">
                {toPersianDigits(metrics.completedOps)} از {toPersianDigits(metrics.totalOps)}{' '}
                <span className="text-[10px] text-[#666666] font-normal">OP تکمیل</span>
              </div>
            </div>

            <div className="bg-white p-2.5 rounded border border-[#d9d9d9]">
              <span className="text-[10px] text-[#666666] font-medium block">کل ضایعات فرایندی</span>
              <div className="text-sm font-bold text-[#bb0000] font-mono mt-0.5 flex items-center justify-between">
                <span>{formatNumber(metrics.totalScrap)} عدد</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#fde8e8] text-[#bb0000]">
                  {toPersianDigits(metrics.scrapRate)}٪
                </span>
              </div>
            </div>

            <div className="bg-white p-2.5 rounded border border-[#d9d9d9]">
              <span className="text-[10px] text-[#666666] font-medium block">ورق مصرفی / بازده وزنی</span>
              <div className="text-sm font-bold text-[#007cc0] font-mono mt-0.5 flex items-center justify-between">
                <span>{formatNumber(activeOrder.rawMaterialIssuedKg)} kg</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#e5f3fa] text-[#007cc0]">
                  {toPersianDigits(metrics.rawMaterialYield)}٪
                </span>
              </div>
            </div>

            <div className="bg-white p-2.5 rounded border border-[#d9d9d9]">
              <span className="text-[10px] text-[#666666] font-medium block">وضعیت فعلی سفارش</span>
              <div className="text-xs font-bold mt-1">
                {metrics.completionPercentage === 100 ? (
                  <span className="text-[#107e3e] flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 inline" /> خاتمه‌یافته
                  </span>
                ) : metrics.inProgressOps > 0 ? (
                  <span className="text-[#e9730c] flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#e9730c] animate-ping inline-block"></span> در جریان ساخت
                  </span>
                ) : (
                  <span className="text-[#007cc0] flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 inline" /> در برنامه تولید
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Filter Toolbar */}
        <div className="px-5 py-2.5 bg-white border-b border-[#d9d9d9] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[#666666] font-medium flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-[#007cc0]" /> فیلتر رویدادها:
            </span>
            <div className="inline-flex rounded border border-[#d9d9d9] p-0.5 bg-[#f7f7f7]">
              <button
                type="button"
                onClick={() => setFilterType('ALL')}
                className={`px-2.5 py-1 rounded transition cursor-pointer ${
                  filterType === 'ALL' ? 'bg-[#e5f3fa] font-bold text-[#007cc0]' : 'text-[#666666] hover:text-[#333333]'
                }`}
              >
                تمام رویدادها ({toPersianDigits(timelineEvents.length)})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('OPS_ONLY')}
                className={`px-2.5 py-1 rounded transition cursor-pointer ${
                  filterType === 'OPS_ONLY' ? 'bg-[#e5f3fa] font-bold text-[#007cc0]' : 'text-[#666666] hover:text-[#333333]'
                }`}
              >
                فقط ایستگاه‌های OP ({toPersianDigits(activeOrder.ops.length)})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('COMPLETED')}
                className={`px-2.5 py-1 rounded transition cursor-pointer ${
                  filterType === 'COMPLETED' ? 'bg-[#e5f3fa] font-bold text-[#007cc0]' : 'text-[#666666] hover:text-[#333333]'
                }`}
              >
                تکمیل‌شده
              </button>
              <button
                type="button"
                onClick={() => setFilterType('IN_PROGRESS')}
                className={`px-2.5 py-1 rounded transition cursor-pointer ${
                  filterType === 'IN_PROGRESS' ? 'bg-[#e5f3fa] font-bold text-[#007cc0]' : 'text-[#666666] hover:text-[#333333]'
                }`}
              >
                در حال اقدام
              </button>
            </div>
          </div>

          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-[#666666] absolute right-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="جستجو در مراحل، ماشین‌ها، اسناد..."
              className="w-full pl-3 pr-8 py-1 bg-white border border-[#bfbfbf] rounded text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
            />
          </div>
        </div>

        {/* Scrollable Timeline Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-[#f7f7f7]">
          <div className="relative border-r-2 border-[#d9d9d9] pr-6 mr-3 space-y-6">
            {filteredEvents.map((event, idx) => {
              // Node badge styling
              let nodeBg = 'bg-[#f0f0f0] text-[#666666] border-[#bfbfbf]';
              if (event.status === 'DONE') {
                nodeBg = 'bg-[#107e3e] text-white border-[#107e3e] ring-4 ring-[#eef8f2]';
              } else if (event.status === 'ACTIVE') {
                nodeBg = 'bg-[#e9730c] text-white border-[#e9730c] ring-4 ring-[#fff5eb] animate-pulse';
              } else if (event.status === 'WARNING') {
                nodeBg = 'bg-[#bb0000] text-white border-[#bb0000] ring-4 ring-[#fde8e8]';
              }

              return (
                <div key={event.id} className="relative group">
                  {/* Timeline Node Bullet */}
                  <div
                    className={`absolute -right-[35px] top-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center font-bold text-xs transition-transform ${nodeBg}`}
                  >
                    {event.status === 'DONE' ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : event.status === 'ACTIVE' ? (
                      <Play className="w-3 h-3 fill-current" />
                    ) : event.status === 'WARNING' ? (
                      <RotateCcw className="w-3 h-3" />
                    ) : (
                      <span className="text-[10px]">{toPersianDigits(idx + 1)}</span>
                    )}
                  </div>

                  {/* Card Container */}
                  <div className="bg-white rounded-md border border-[#d9d9d9] p-3.5 hover:border-[#007cc0] transition">
                    {/* Header Row */}
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#e8e8e8] pb-2.5">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-xs text-[#333333]">{event.title}</h4>
                          {event.stepType === 'RELEASE' && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-[#e5f3fa] text-[#007cc0] font-semibold border border-[#b3ddf2]">
                              شروع گردش کار
                            </span>
                          )}
                          {event.stepType === 'RAW_MATERIAL' && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-[#e5f3fa] text-[#007cc0] font-semibold border border-[#b3ddf2]">
                              تغذیه کلاف
                            </span>
                          )}
                          {event.stepType === 'QC_INSPECTION' && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-[#fff5eb] text-[#e9730c] font-semibold border border-[#f5d0a9]">
                              تاییدیه CMM / بازرسی
                            </span>
                          )}
                          {event.stepType === 'WAREHOUSE_RECEIPT' && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-[#eef8f2] text-[#107e3e] font-semibold border border-[#b5e0c6]">
                              رسید دائم انبار
                            </span>
                          )}
                          {event.status === 'DONE' && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-[#eef8f2] text-[#107e3e] font-semibold border border-[#b5e0c6]">
                              تکمیل شده
                            </span>
                          )}
                          {event.status === 'ACTIVE' && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-[#fff5eb] text-[#e9730c] font-semibold border border-[#f5d0a9]">
                              در حال تولید
                            </span>
                          )}
                          {event.status === 'WARNING' && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-[#fde8e8] text-[#bb0000] font-semibold border border-[#f5b7b7]">
                              انتقال مانده به روز بعد
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#666666] mt-0.5">{event.subTitle}</p>
                      </div>

                      {/* Date & Time Badge */}
                      <div className="text-left font-mono text-[11px] text-[#333333] bg-[#f7f7f7] px-2.5 py-1 rounded border border-[#d9d9d9]">
                        <span>{event.dateLabel}</span>
                        <span className="mx-1 text-[#bfbfbf]">|</span>
                        <span>{event.timeLabel}</span>
                      </div>
                    </div>

                    {/* Body Details Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-2.5 text-xs">
                      {event.details.machine && (
                        <div className="bg-[#f7f7f7] p-2 rounded border border-[#e8e8e8]">
                          <span className="text-[10px] text-[#666666] block">ایستگاه و ماشین:</span>
                          <span className="font-bold text-[#333333]">{event.details.machine}</span>
                          {event.details.machineCode && (
                            <span className="text-[10px] text-[#666666] font-mono block">({event.details.machineCode})</span>
                          )}
                        </div>
                      )}

                      {event.details.dieCode && (
                        <div className="bg-[#f7f7f7] p-2 rounded border border-[#e8e8e8]">
                          <span className="text-[10px] text-[#666666] block">کد قالب تخصیص‌یافته:</span>
                          <span className="font-bold font-mono text-[#333333]">{event.details.dieCode}</span>
                          <span className="text-[10px] text-[#666666] block">{event.details.shift}</span>
                        </div>
                      )}

                      {event.details.targetQty !== undefined && (
                        <div className="bg-[#f7f7f7] p-2 rounded border border-[#e8e8e8]">
                          <span className="text-[10px] text-[#666666] block">تیراژ هدف / تولید سالم:</span>
                          <div className="font-bold text-[#333333]">
                            {formatNumber(event.details.goodQty || 0)}{' '}
                            <span className="text-[#666666] font-normal">/ {formatNumber(event.details.targetQty)}</span>
                          </div>
                          {event.details.efficiency !== undefined && (
                            <span className="text-[10px] text-[#107e3e] font-semibold block">
                              راندمان: {toPersianDigits(event.details.efficiency)}٪
                            </span>
                          )}
                        </div>
                      )}

                      {event.details.scrapQty !== undefined && event.details.scrapQty > 0 && (
                        <div className="bg-[#fde8e8] p-2 rounded border border-[#f5b7b7]">
                          <span className="text-[10px] text-[#bb0000] block">ضایعات ثبت‌شده:</span>
                          <span className="font-bold text-[#bb0000]">{formatNumber(event.details.scrapQty)} عدد</span>
                          {event.details.wipNext !== undefined && (
                            <span className="text-[10px] text-[#666666] block">
                              بافر بعد از OP: {formatNumber(event.details.wipNext)} عدد
                            </span>
                          )}
                        </div>
                      )}

                      {event.details.weightKg !== undefined && (
                        <div className="bg-[#f7f7f7] p-2 rounded border border-[#e8e8e8]">
                          <span className="text-[10px] text-[#666666] block">وزن ناخالص ورق:</span>
                          <span className="font-bold text-[#007cc0]">{formatNumber(event.details.weightKg)} کیلوگرم</span>
                          {event.details.spec && (
                            <button
                              type="button"
                              onClick={() => {
                                traceDocument(event.details.spec!, 'INVENTORY_LEDGER');
                                onClose();
                              }}
                              className="sap-doc-link text-[10px] font-mono block cursor-pointer"
                              title="مشاهده موجودی ماده در انبار"
                            >
                              {event.details.spec}
                            </button>
                          )}
                        </div>
                      )}

                      {event.details.docNumber && (
                        <div className="bg-[#f7f7f7] p-2 rounded border border-[#e8e8e8]">
                          <span className="text-[10px] text-[#666666] block">شماره سند / ردیابی:</span>
                          <button
                            type="button"
                            onClick={() => {
                              const target =
                                event.stepType === 'RELEASE'
                                  ? 'WIP_TRACEABILITY'
                                  : 'INVENTORY_LEDGER';
                              traceDocument(event.details.docNumber!, target);
                              onClose();
                            }}
                            className="sap-doc-link font-mono text-[11px] cursor-pointer"
                            title="ردیابی سند در ماژول مرجع"
                          >
                            {event.details.docNumber}
                          </button>
                          <span className="text-[10px] text-[#666666] block">{event.details.operator}</span>
                        </div>
                      )}
                    </div>

                    {/* Action Bar for Operation */}
                    {event.opRef && (
                      <div className="mt-2.5 pt-2 border-t border-[#e8e8e8] flex items-center justify-between text-xs">
                        <div className="text-[11px] text-[#666666] flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#007cc0]"></span>
                          <span>استاندارد ساعتی: {toPersianDigits(event.opRef.standardRatePerHour)} ضرب در ساعت</span>
                          {event.opRef.isFinalOp && (
                            <span className="text-[#107e3e] font-semibold bg-[#eef8f2] px-1.5 py-0.5 rounded border border-[#b5e0c6]">
                              مرحله نهایی (اتمام خط)
                            </span>
                          )}
                        </div>

                        {onOpenLogModal && (
                          <button
                            type="button"
                            onClick={() => {
                              if (event.opRef) {
                                onOpenLogModal(activeOrder, event.opRef);
                              }
                            }}
                            className="sap-btn-standard px-2.5 py-1 text-xs flex items-center gap-1 cursor-pointer"
                          >
                            <Wrench className="w-3 h-3 text-[#007cc0]" />
                            <span>ثبت کارکرد / ویرایش عملکرد</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#ffffff] border-t border-[#d9d9d9] flex items-center justify-between text-xs text-[#666666]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#107e3e]"></span>
            <span>کل رویدادهای ردیابی‌شده: {toPersianDigits(timelineEvents.length)} مرحله</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="sap-btn-emphasized px-4 py-1.5 text-xs cursor-pointer"
          >
            بستن پنجره
          </button>
        </div>
      </div>
    </div>
  );
};
