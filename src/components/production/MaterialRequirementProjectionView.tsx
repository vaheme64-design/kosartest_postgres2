import React, { useState, useMemo, useEffect } from 'react';
import {
  Boxes,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Clock,
  Calendar,
  Truck,
  ShoppingCart,
  Download,
  Printer,
  Search,
  Filter,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  ArrowRightLeft,
  Layers,
  Sparkles,
  Info,
  X,
  FileText,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { MultiPartScheduleItem, WORK_DAYS } from './ErpProductionWorkbenchView';
import { formatNumber, toPersianDigits, exportToCsv } from '../../utils/formatters';
import { useErpRouter } from '../../context/RouterContext';

interface MaterialRequirementProjectionViewProps {
  scheduleItems: MultiPartScheduleItem[];
  onOpenOrderTimeline?: (order: MultiPartScheduleItem) => void;
}

interface RawMaterialConfig {
  code: string;
  name: string;
  grade: string;
  thicknessMm: number;
  widthMm: number;
  unit: string;
  supplierName: string;
  leadTimeDays: number;
  safetyStockKg: number;
  initialStockKg: number;
  inboundPipeline: Array<{
    poNumber: string;
    dayIndex: number;
    expectedDate: string;
    qtyKg: number;
    supplier: string;
  }>;
}

// Master configuration for raw materials used across automotive stamped parts (ECU Bracket family)
const DEFAULT_RAW_MATERIALS: RawMaterialConfig[] = [
  {
    code: 'RM-COIL-DC01A-2.0-1140',
    name: 'رول ورق DC01A روغنی ضخامت ۲.۰ عرض ۱۱۴۰ میلیمتر',
    grade: 'DC01A روغنی',
    thicknessMm: 2.0,
    widthMm: 1140,
    unit: 'کیلوگرم',
    supplierName: 'فولاد مبارکه اصفهان',
    leadTimeDays: 7,
    safetyStockKg: 5000,
    initialStockKg: 14200,
    inboundPipeline: [
      { poNumber: 'PO-ECU-MBK-01', dayIndex: 3, expectedDate: '۱۴۰۴/۰۲/۲۲ (دوشنبه)', qtyKg: 10000, supplier: 'فولاد مبارکه' },
    ],
  },
  {
    code: 'RM-SHT-DC01A-2.0-1000',
    name: 'شیت ورق روغنی DC01A ضخامت 2.0 ابعاد 1000x2000 (جایگزین)',
    grade: 'DC01A روغنی شیت',
    thicknessMm: 2.0,
    widthMm: 1000,
    unit: 'کیلوگرم',
    supplierName: 'تامین انحصاری ساپکو',
    leadTimeDays: 4,
    safetyStockKg: 2000,
    initialStockKg: 6500,
    inboundPipeline: [],
  },
  {
    code: 'FST-NUT-WELD-M6',
    name: 'مهره جوشی چهارگوش M6 گرید ۸.۸ (DIN 928)',
    grade: 'فولاد سخت‌کاری M6',
    thicknessMm: 6.0,
    widthMm: 0,
    unit: 'عدد',
    supplierName: 'مهره‌سازان پارس',
    leadTimeDays: 3,
    safetyStockKg: 10000,
    initialStockKg: 45000,
    inboundPipeline: [
      { poNumber: 'PO-ECU-NUT-02', dayIndex: 2, expectedDate: '۱۴۰۴/۰۲/۲۱ (یکشنبه)', qtyKg: 30000, supplier: 'مهره‌سازان پارس' },
    ],
  },
  {
    code: 'FST-BOLT-WELD-M6-20',
    name: 'پیچ جوشی پایه M6 طول 20 میلیمتر گرید ۸.۸',
    grade: 'پیچ جوشی M6*20',
    thicknessMm: 6.0,
    widthMm: 20,
    unit: 'عدد',
    supplierName: 'پیچ‌سازان صنعت خودرو',
    leadTimeDays: 4,
    safetyStockKg: 5000,
    initialStockKg: 12000,
    inboundPipeline: [],
  },
];

const STORAGE_KEY_MRP_PROJECTION = 'kpims_mrp_projection_configs_v3';
const STORAGE_KEY_ISSUED_PRS = 'kpims_purchase_requisitions_list';

export const MaterialRequirementProjectionView: React.FC<MaterialRequirementProjectionViewProps> = ({
  scheduleItems,
  onOpenOrderTimeline,
}) => {
  const { traceDocument } = useErpRouter();
  // Material configs state (customizable and persistent)
  const [materialConfigs, setMaterialConfigs] = useState<RawMaterialConfig[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MRP_PROJECTION);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_RAW_MATERIALS;
  });

  // What-If Simulation Parameters
  const [demandSurgePercent, setDemandSurgePercent] = useState<number>(0); // 0% to +50%
  const [supplierDelayDays, setSupplierDelayDays] = useState<number>(0); // 0 to 5 days
  const [scrapSurgePercent, setScrapSurgePercent] = useState<number>(0); // 0% to 10%
  const [isSimulationOpen, setIsSimulationOpen] = useState<boolean>(false);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedRiskFilter, setSelectedRiskFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'HEALTHY'>('ALL');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('ALL');

  // PR Creation Modal State
  const [selectedMaterialForPr, setSelectedMaterialForPr] = useState<{
    material: RawMaterialConfig;
    suggestedQty: number;
    deficitDay: string;
  } | null>(null);
  const [prPriority, setPrPriority] = useState<'URGENT' | 'HIGH' | 'NORMAL'>('URGENT');
  const [prCustomQty, setPrCustomQty] = useState<string>('');
  const [prNote, setPrNote] = useState<string>('');
  const [prToast, setPrToast] = useState<{ show: boolean; msg: string; prCode: string } | null>(null);

  // Detailed Row Expand State
  const [expandedMaterialCode, setExpandedMaterialCode] = useState<string | null>(null);

  // Extract all unique suppliers for filtering
  const allSuppliers = useMemo(() => {
    const set = new Set<string>();
    materialConfigs.forEach(m => set.add(m.supplierName));
    return Array.from(set);
  }, [materialConfigs]);

  // Main Calculation Engine: Group scheduled parts by raw material and calculate daily demand & projected balances
  const projections = useMemo(() => {
    const demandMultiplier = 1 + demandSurgePercent / 100 + scrapSurgePercent / 100;

    return materialConfigs.map(mat => {
      // Find all parts in scheduleItems consuming this material
      const matchedParts = scheduleItems.filter(
        item => item.rawMaterialCode === mat.code || item.rawMaterialName.includes(mat.grade)
      );

      // Calculate daily consumption for Day 1 to Day 6
      const dailyConsumption = [1, 2, 3, 4, 5, 6].map(dayIndex => {
        let totalDayKg = 0;
        const consumingParts: Array<{
          partCode: string;
          partName: string;
          orderCode: string;
          carModel: string;
          opCode: string;
          opTitle: string;
          targetQty: number;
          requiredKg: number;
        }> = [];

        matchedParts.forEach(item => {
          // Check if part has an operation on this day
          // For raw material consumption, typically OP10 (slitting/blanking) consumes the raw sheet,
          // or if OP10 is on that day, it pulls the full material weight.
          // If no OP10, any primary operation scheduled on that day consumes proportion.
          const opsOnDay = item.ops.filter(o => o.scheduledDayIndex === dayIndex);
          if (opsOnDay.length > 0) {
            // First OP of the part on this day initiates raw material consumption
            const primaryOp = opsOnDay[0];
            const baseOpQty = primaryOp.effectiveTargetQty;
            const weightForOp = Math.round(baseOpQty * item.unitWeightKg * demandMultiplier);
            totalDayKg += weightForOp;

            consumingParts.push({
              partCode: item.partCode,
              partName: item.partName,
              orderCode: item.orderCode,
              carModel: item.carModel,
              opCode: primaryOp.opCode,
              opTitle: primaryOp.opTitle,
              targetQty: baseOpQty,
              requiredKg: weightForOp,
            });
          }
        });

        // If no parts specifically matched by exact code, estimate from parts referencing sheet
        if (totalDayKg === 0 && matchedParts.length === 0) {
          // Fallback baseline consumption for standalone raw materials
          const syntheticFactor = mat.thicknessMm >= 2.0 ? 1800 : 1200;
          totalDayKg = Math.round(syntheticFactor * demandMultiplier);
        }

        return {
          dayIndex,
          dayObj: WORK_DAYS.find(d => d.index === dayIndex) || WORK_DAYS[dayIndex - 1],
          consumedKg: totalDayKg,
          consumingParts,
        };
      });

      const totalWeeklyDemand = dailyConsumption.reduce((sum, d) => sum + d.consumedKg, 0);

      // Simulate day-by-day projected stock balance
      let currentRunningBalance = mat.initialStockKg;
      let stockoutDayIndex: number | null = null;
      let belowSafetyDayIndex: number | null = null;
      let firstDeficitAmountKg = 0;

      const dailyTimelineBalances = dailyConsumption.map(d => {
        // Add inbound arriving on this day (adjusting for simulated supplier delay)
        const adjustedDayIndex = d.dayIndex - supplierDelayDays;
        const arrivingInbound = mat.inboundPipeline
          .filter(p => p.dayIndex === adjustedDayIndex)
          .reduce((sum, p) => sum + p.qtyKg, 0);

        currentRunningBalance = currentRunningBalance - d.consumedKg + arrivingInbound;

        if (currentRunningBalance < mat.safetyStockKg && belowSafetyDayIndex === null) {
          belowSafetyDayIndex = d.dayIndex;
        }

        if (currentRunningBalance < 0 && stockoutDayIndex === null) {
          stockoutDayIndex = d.dayIndex;
          firstDeficitAmountKg = Math.abs(currentRunningBalance);
        }

        return {
          dayIndex: d.dayIndex,
          dayName: d.dayObj.name,
          date: d.dayObj.date,
          consumedKg: d.consumedKg,
          inboundArrivedKg: arrivingInbound,
          endingBalanceKg: currentRunningBalance,
          isNegative: currentRunningBalance < 0,
          isBelowSafety: currentRunningBalance < mat.safetyStockKg && currentRunningBalance >= 0,
        };
      });

      // Calculate Days of Inventory remaining (DOI)
      const avgDailyDemand = totalWeeklyDemand > 0 ? totalWeeklyDemand / 6 : 1;
      const daysOfInventory = (mat.initialStockKg / avgDailyDemand).toFixed(1);

      // Determine risk category
      let riskCategory: 'CRITICAL' | 'WARNING' | 'HEALTHY' = 'HEALTHY';
      let riskReason = 'موجودی پایدار و بیش از نقطه سفارش';

      // Effective lead time including simulated supplier delay
      const effectiveLeadTime = mat.leadTimeDays + supplierDelayDays;

      if (stockoutDayIndex !== null) {
        riskCategory = 'CRITICAL';
        const dayName = WORK_DAYS.find(w => w.index === stockoutDayIndex)?.shortName || 'آخر هفته';
        riskReason = `توقف خط به دلیل اتمام کامل موجودی در روز ${dayName} (${stockoutDayIndex} روز دیگر)! زمان تامین ${effectiveLeadTime} روز است.`;
      } else if (belowSafetyDayIndex !== null) {
        riskCategory = 'WARNING';
        const dayName = WORK_DAYS.find(w => w.index === belowSafetyDayIndex)?.shortName || 'طی هفته';
        riskReason = `افت موجودی به زیر ذخیره اطمینان در روز ${dayName} (${formatNumber(mat.safetyStockKg)} kg)`;
      } else if (parseFloat(daysOfInventory) < effectiveLeadTime) {
        riskCategory = 'WARNING';
        riskReason = `پوشش موجودی (${toPersianDigits(daysOfInventory)} روز) کمتر از زمان تامین (${toPersianDigits(effectiveLeadTime)} روز) است`;
      }

      // Suggested re-order PR quantity
      const recommendedPrQty = stockoutDayIndex !== null
        ? Math.ceil((firstDeficitAmountKg + mat.safetyStockKg + avgDailyDemand * effectiveLeadTime) / 500) * 500
        : Math.ceil(mat.safetyStockKg * 1.5 / 500) * 500;

      return {
        material: mat,
        matchedParts,
        dailyConsumption,
        totalWeeklyDemand,
        dailyTimelineBalances,
        stockoutDayIndex,
        belowSafetyDayIndex,
        firstDeficitAmountKg,
        daysOfInventory,
        effectiveLeadTime,
        riskCategory,
        riskReason,
        recommendedPrQty,
      };
    });
  }, [materialConfigs, scheduleItems, demandSurgePercent, supplierDelayDays, scrapSurgePercent]);

  // Overall KPI Cards
  const kpiSummary = useMemo(() => {
    const totalMaterials = projections.length;
    const criticalCount = projections.filter(p => p.riskCategory === 'CRITICAL').length;
    const warningCount = projections.filter(p => p.riskCategory === 'WARNING').length;
    const healthyCount = projections.filter(p => p.riskCategory === 'HEALTHY').length;

    const totalWeeklyDemandKg = projections.reduce((sum, p) => sum + p.totalWeeklyDemand, 0);
    const totalStartingStockKg = projections.reduce((sum, p) => sum + p.material.initialStockKg, 0);
    const totalInboundKg = projections.reduce(
      (sum, p) => sum + p.material.inboundPipeline.reduce((s, b) => s + b.qtyKg, 0),
      0
    );

    return {
      totalMaterials,
      criticalCount,
      warningCount,
      healthyCount,
      totalWeeklyDemandTons: (totalWeeklyDemandKg / 1000).toFixed(1),
      totalStartingStockTons: (totalStartingStockKg / 1000).toFixed(1),
      totalInboundTons: (totalInboundKg / 1000).toFixed(1),
    };
  }, [projections]);

  // Filtered Projections List
  const filteredProjections = useMemo(() => {
    return projections.filter(p => {
      if (selectedRiskFilter !== 'ALL' && p.riskCategory !== selectedRiskFilter) return false;
      if (selectedSupplierFilter !== 'ALL' && p.material.supplierName !== selectedSupplierFilter) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const m = p.material;
        const matchCode = m.code.toLowerCase().includes(q);
        const matchName = m.name.toLowerCase().includes(q);
        const matchGrade = m.grade.toLowerCase().includes(q);
        const matchSupplier = m.supplierName.toLowerCase().includes(q);
        const matchParts = p.matchedParts.some(
          part => part.partName.toLowerCase().includes(q) || part.partCode.toLowerCase().includes(q)
        );
        return matchCode || matchName || matchGrade || matchSupplier || matchParts;
      }
      return true;
    });
  }, [projections, selectedRiskFilter, selectedSupplierFilter, searchTerm]);

  // Handle PR Creation and Storage
  const handleOpenPrModal = (proj: (typeof projections)[0]) => {
    setSelectedMaterialForPr({
      material: proj.material,
      suggestedQty: proj.recommendedPrQty,
      deficitDay: proj.stockoutDayIndex
        ? WORK_DAYS.find(w => w.index === proj.stockoutDayIndex)?.name || 'طی هفته'
        : 'نقطه سفارش',
    });
    setPrCustomQty(proj.recommendedPrQty.toString());
    setPrPriority(proj.riskCategory === 'CRITICAL' ? 'URGENT' : 'HIGH');
    setPrNote(`درخواست خرید اضطراری جهت پوشش کسری احتمالی خط در روز ${proj.stockoutDayIndex || 3}`);
  };

  const handleConfirmIssuePr = () => {
    if (!selectedMaterialForPr) return;

    const prQty = parseInt(prCustomQty.replace(/,/g, ''), 10) || selectedMaterialForPr.suggestedQty;
    const prCode = `PR-1404-COIL-${Math.floor(1000 + Math.random() * 9000)}`;

    const prPayload = {
      prCode,
      materialCode: selectedMaterialForPr.material.code,
      materialName: selectedMaterialForPr.material.name,
      supplierName: selectedMaterialForPr.material.supplierName,
      quantityKg: prQty,
      priority: prPriority,
      note: prNote,
      requestedBy: 'مهندس حسینی (مدیر تولید و برنامه‌ریزی MRP)',
      issueDate: '۱۴۰۴/۰۲/۲۰',
      status: 'ISSUED_PENDING_APPROVAL',
      createdAt: new Date().toISOString(),
    };

    try {
      const existing = localStorage.getItem(STORAGE_KEY_ISSUED_PRS);
      const prList = existing ? JSON.parse(existing) : [];
      prList.unshift(prPayload);
      localStorage.setItem(STORAGE_KEY_ISSUED_PRS, JSON.stringify(prList));
    } catch {
      // ignore
    }

    setPrToast({
      show: true,
      msg: `درخواست خرید ${prCode} با موفقیت در سیستم تدارکات ثبت شد.`,
      prCode,
    });

    setSelectedMaterialForPr(null);
    setTimeout(() => setPrToast(null), 5000);
  };

  // Export CSV
  const handleExportCsv = () => {
    const headers = [
      'کد ماده اولیه',
      'نام ماده / رول ورق',
      'گرید فولادی',
      'ضخامت (mm)',
      'تامین‌کننده',
      'زمان تامین (روز)',
      'موجودی فعلی (kg)',
      'ذخیره اطمینان (kg)',
      'تقاضای هفتگی (kg)',
      'پوشش روزانه (روز)',
      ...WORK_DAYS.map(w => `مانده ${w.shortName}`),
      'وضعیت ریسک',
      'پیشنهاد خرید (kg)',
    ];

    const rows = projections.map(p => [
      p.material.code,
      p.material.name,
      p.material.grade,
      p.material.thicknessMm,
      p.material.supplierName,
      p.effectiveLeadTime,
      p.material.initialStockKg,
      p.material.safetyStockKg,
      p.totalWeeklyDemand,
      p.daysOfInventory,
      ...p.dailyTimelineBalances.map(d => d.endingBalanceKg),
      p.riskCategory === 'CRITICAL' ? 'بحرانی' : p.riskCategory === 'WARNING' ? 'هشدار' : 'نرمال',
      p.recommendedPrQty,
    ]);

    exportToCsv(`Material_Requirement_Projection_${Date.now()}`, headers, rows);
  };

  // Official Print Report
  const handlePrintReport = () => {
    const content = `
      <!DOCTYPE html>
      <html lang="fa" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>گزارش ماتریس پیش‌بینی کسری ورق و مواد اولیه</title>
        <style>
          body { font-family: Tahoma, Arial, sans-serif; padding: 20px; color: #111; direction: rtl; font-size: 11px; }
          h2 { font-size: 16px; margin-bottom: 4px; border-bottom: 2px solid #333; padding-bottom: 8px; }
          .summary { display: flex; gap: 16px; margin-bottom: 16px; }
          .summary div { border: 1px solid #ccc; padding: 8px; flex: 1; text-align: center; background: #fafafa; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #ccc; padding: 6px; text-align: center; }
          th { background: #e5e5e5; }
          .critical { background: #ffe4e6; color: #9f1239; font-weight: bold; }
          .warning { background: #fef3c7; color: #92400e; }
        </style>
      </head>
      <body>
        <h2>ماتریس پیش‌بینی کسری کلاف ورق و مواد اولیه (Material Requirement Projection)</h2>
        <p>تاریخ استخراج: ۱۴۰۴/۰۲/۲۰ | افق برنامه‌ریزی: هفتگی ۶ روزه | ماژول APS / MRP پیشخوان کارخانه</p>
        <div class="summary">
          <div>کل اقلام: <strong>${toPersianDigits(kpiSummary.totalMaterials)}</strong></div>
          <div>اقلام دارای ریسک توقف: <strong style="color:red;">${toPersianDigits(kpiSummary.criticalCount)}</strong></div>
          <div>کل تقاضای هفتگی: <strong>${toPersianDigits(kpiSummary.totalWeeklyDemandTons)} تن</strong></div>
          <div>موجودی کلاف در انبار: <strong>${toPersianDigits(kpiSummary.totalStartingStockTons)} تن</strong></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>ردیف</th>
              <th>کد و گرید ورق</th>
              <th>تامین‌کننده</th>
              <th>زمان تامین</th>
              <th>موجودی فعلی</th>
              <th>ذخیره اطمینان</th>
              ${WORK_DAYS.map(w => `<th>${w.shortName}</th>`).join('')}
              <th>وضعیت ریسک</th>
              <th>اقدام پیشنهادی</th>
            </tr>
          </thead>
          <tbody>
            ${projections
              .map(
                (p, idx) => `
              <tr class="${p.riskCategory === 'CRITICAL' ? 'critical' : p.riskCategory === 'WARNING' ? 'warning' : ''}">
                <td>${toPersianDigits(idx + 1)}</td>
                <td style="text-align: right;"><strong>${p.material.name}</strong></td>
                <td>${p.material.supplierName}</td>
                <td>${toPersianDigits(p.effectiveLeadTime)} روز</td>
                <td>${formatNumber(p.material.initialStockKg)} kg</td>
                <td>${formatNumber(p.material.safetyStockKg)} kg</td>
                ${p.dailyTimelineBalances
                  .map(
                    d =>
                      `<td>${d.endingBalanceKg < 0 ? `(${formatNumber(Math.abs(d.endingBalanceKg))}-)` : formatNumber(d.endingBalanceKg)}</td>`
                  )
                  .join('')}
                <td>${p.riskCategory === 'CRITICAL' ? 'کسری قطعی' : p.riskCategory === 'WARNING' ? 'هشدار نقطه سفارش' : 'موجودی ایمن'}</td>
                <td>${p.riskCategory === 'CRITICAL' ? `صدور PR فوری (${formatNumber(p.recommendedPrQty)} kg)` : '-'}</td>
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

  return (
    <div className="space-y-5 animate-in fade-in duration-200 text-right font-sans">
      {/* Toast for PR Issue */}
      {prToast && (
        <div className="rounded-sm p-3.5 bg-[#ebf7ef] border border-[#a9dfbf] text-[#107e3e] flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-[#107e3e] shrink-0" />
            <div>
              <span className="font-bold text-sm block">{prToast.msg}</span>
              <span className="text-xs text-[#107e3e]">
                کد پیگیری: <strong className="font-mono">{prToast.prCode}</strong> — در ماژول MRP و کارتابل تدارکات قابل مشاهده است.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPrToast(null)}
            className="text-[#107e3e] hover:text-[#333333] p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Banner & Control Strip */}
      <div className="sap-card p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-sm bg-[#fff4e5] border border-[#f9d6a7] flex items-center justify-center text-[#e9730c]">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#333333]">
                پیش‌بینی کسری ورق و مواد اولیه (Material Requirement Projection)
              </h2>
              <p className="text-xs text-[#666666] mt-0.5">
                محاسبه دینامیک مصرف رول‌های ورق با احتساب تقاضای برنامه‌ریزی تولید، موجودی کلاف، سفارشات در راه (PO) و زمان تحویل تامین‌کننده (Lead Time)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* What-If Simulation Trigger Button */}
          <button
            type="button"
            onClick={() => setIsSimulationOpen(!isSimulationOpen)}
            className={`px-3 py-1.5 rounded-sm text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 border ${
              isSimulationOpen || demandSurgePercent > 0 || supplierDelayDays > 0 || scrapSurgePercent > 0
                ? 'bg-[#e9730c] text-white border-[#e9730c]'
                : 'sap-btn-standard'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>شبیه‌ساز سناریوی ریسک (What-If)</span>
            {(demandSurgePercent > 0 || supplierDelayDays > 0 || scrapSurgePercent > 0) && (
              <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            )}
          </button>

          <button
            type="button"
            onClick={handlePrintReport}
            className="sap-btn-standard px-3 py-1.5 text-xs flex items-center gap-1.5"
            title="چاپ ماتریس پیش‌بینی کسری"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>چاپ گزارش</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="sap-btn-standard px-3 py-1.5 text-xs flex items-center gap-1.5"
            title="خروجی فایل اکسل"
          >
            <Download className="w-3.5 h-3.5 text-[#107e3e]" />
            <span>خروجی اکسل</span>
          </button>
        </div>
      </div>

      {/* What-If Scenario Drawer / Panel */}
      {isSimulationOpen && (
        <div className="bg-[#fff4e5] border border-[#f9d6a7] rounded-sm p-4">
          <div className="flex items-center justify-between pb-2.5 border-b border-[#f9d6a7]">
            <div className="flex items-center gap-2 text-[#e9730c] font-bold text-sm">
              <Sparkles className="w-4 h-4 text-[#e9730c]" />
              <span>موتور شبیه‌سازی سناریوهای بحران تامین (Supply Stress Testing)</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setDemandSurgePercent(0);
                setSupplierDelayDays(0);
                setScrapSurgePercent(0);
              }}
              className="text-xs text-[#e9730c] hover:underline cursor-pointer"
            >
              بازنشانی به حالت پایه
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-3">
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-[#333333] mb-1.5">
                <span>افزایش جهشی تیراژ تولید:</span>
                <span className="font-mono text-[#e9730c]">+{toPersianDigits(demandSurgePercent)}٪</span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                step="5"
                value={demandSurgePercent}
                onChange={e => setDemandSurgePercent(parseInt(e.target.value, 10))}
                className="w-full accent-[#e9730c] cursor-pointer"
              />
              <span className="text-[10px] text-[#666666] block mt-1">
                افزایش تقاضای خودروساز (ایران‌خودرو / سایپا)
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-[#333333] mb-1.5">
                <span>تاخیر تحویل تامین‌کننده (Mobarakeh/Sapco):</span>
                <span className="font-mono text-[#e9730c]">+{toPersianDigits(supplierDelayDays)} روز کاری</span>
              </div>
              <input
                type="range"
                min="0"
                max="7"
                step="1"
                value={supplierDelayDays}
                onChange={e => setSupplierDelayDays(parseInt(e.target.value, 10))}
                className="w-full accent-[#e9730c] cursor-pointer"
              />
              <span className="text-[10px] text-[#666666] block mt-1">
                تاخیر ناشی از بارگیری ریلی / ترافیک انبار ساپکو
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-[#333333] mb-1.5">
                <span>ضریب ریسک ضایعات قالب و تنظیمات:</span>
                <span className="font-mono text-[#e9730c]">+{toPersianDigits(scrapSurgePercent)}٪</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={scrapSurgePercent}
                onChange={e => setScrapSurgePercent(parseInt(e.target.value, 10))}
                className="w-full accent-[#e9730c] cursor-pointer"
              />
              <span className="text-[10px] text-[#666666] block mt-1">
                ضایعات ناشی از تغییر قالب جدید یا پلیسه ورق
              </span>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="sap-card border-r-4 border-r-[#007cc0] p-3.5">
          <div className="flex items-center justify-between text-[#666666] text-xs">
            <span>کل تقاضای هفتگی ورق</span>
            <Boxes className="w-4 h-4 text-[#007cc0]" />
          </div>
          <div className="text-xl font-bold text-[#333333] mt-1.5 font-mono tabular-nums">
            {toPersianDigits(kpiSummary.totalWeeklyDemandTons)}{' '}
            <span className="text-xs font-sans font-normal text-[#666666]">تُن خالص</span>
          </div>
          <span className="text-[11px] text-[#666666] mt-0.5 block">
            تقاضای ۲۰ دستور کار برنامه‌ریزی‌شده در افق ۶ روزه
          </span>
        </div>

        <div className="sap-card border-r-4 border-r-[#107e3e] p-3.5">
          <div className="flex items-center justify-between text-[#666666] text-xs">
            <span>موجودی اولیه کلاف در انبار</span>
            <Layers className="w-4 h-4 text-[#107e3e]" />
          </div>
          <div className="text-xl font-bold text-[#333333] mt-1.5 font-mono tabular-nums">
            {toPersianDigits(kpiSummary.totalStartingStockTons)}{' '}
            <span className="text-xs font-sans font-normal text-[#666666]">تُن</span>
          </div>
          <span className="text-[11px] text-[#107e3e] mt-0.5 block">
            +{toPersianDigits(kpiSummary.totalInboundTons)} تُن سفارش خرید در راه (PO)
          </span>
        </div>

        <div className="sap-card border-r-4 border-r-[#bb0000] p-3.5">
          <div className="flex items-center justify-between text-[#666666] text-xs">
            <span>اقلام با کسری قطعی (توقف خط)</span>
            <AlertTriangle className="w-4 h-4 text-[#bb0000]" />
          </div>
          <div className="text-xl font-bold text-[#bb0000] mt-1.5 flex items-center justify-between font-mono tabular-nums">
            <span>{toPersianDigits(kpiSummary.criticalCount)} گرید</span>
            <span className="text-[10px] font-sans px-2 py-0.5 rounded-sm bg-[#ffecec] text-[#bb0000] border border-[#f5b7b1] font-bold">
              نیاز به PR فوری
            </span>
          </div>
          <span className="text-[11px] text-[#bb0000] mt-0.5 block">
            اتمام موجودی قبل از زمان تحویل تامین‌کننده
          </span>
        </div>

        <div className="sap-card border-r-4 border-r-[#e9730c] p-3.5">
          <div className="flex items-center justify-between text-[#666666] text-xs">
            <span>اقلام در آستانه نقطه سفارش</span>
            <Clock className="w-4 h-4 text-[#e9730c]" />
          </div>
          <div className="text-xl font-bold text-[#e9730c] mt-1.5 flex items-center justify-between font-mono tabular-nums">
            <span>{toPersianDigits(kpiSummary.warningCount)} گرید</span>
            <span className="text-[10px] font-sans px-2 py-0.5 rounded-sm bg-[#fff4e5] text-[#e9730c] border border-[#f9d6a7] font-bold">
              هشدار Safety Stock
            </span>
          </div>
          <span className="text-[11px] text-[#666666] mt-0.5 block">
            {toPersianDigits(kpiSummary.healthyCount)} گرید در حاشیه امن پایدار
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="sap-card p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[#666666] font-medium flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> وضعیت ریسک:
          </span>
          <div className="inline-flex rounded-sm border border-[#d9d9d9] p-0.5 bg-[#f5f5f5]">
            <button
              type="button"
              onClick={() => setSelectedRiskFilter('ALL')}
              className={`px-2.5 py-1 rounded-sm transition cursor-pointer ${
                selectedRiskFilter === 'ALL'
                  ? 'bg-[#ffffff] font-bold text-[#333333] border border-[#d9d9d9]'
                  : 'text-[#666666] hover:text-[#333333]'
              }`}
            >
              همه ({toPersianDigits(projections.length)})
            </button>
            <button
              type="button"
              onClick={() => setSelectedRiskFilter('CRITICAL')}
              className={`px-2.5 py-1 rounded-sm transition cursor-pointer ${
                selectedRiskFilter === 'CRITICAL'
                  ? 'bg-[#bb0000] text-white font-bold'
                  : 'text-[#bb0000] hover:bg-[#ffecec]'
              }`}
            >
              کسری بحرانی ({toPersianDigits(kpiSummary.criticalCount)})
            </button>
            <button
              type="button"
              onClick={() => setSelectedRiskFilter('WARNING')}
              className={`px-2.5 py-1 rounded-sm transition cursor-pointer ${
                selectedRiskFilter === 'WARNING'
                  ? 'bg-[#e9730c] text-white font-bold'
                  : 'text-[#e9730c] hover:bg-[#fff4e5]'
              }`}
            >
              هشدار نقطه سفارش ({toPersianDigits(kpiSummary.warningCount)})
            </button>
            <button
              type="button"
              onClick={() => setSelectedRiskFilter('HEALTHY')}
              className={`px-2.5 py-1 rounded-sm transition cursor-pointer ${
                selectedRiskFilter === 'HEALTHY'
                  ? 'bg-[#107e3e] text-white font-bold'
                  : 'text-[#107e3e] hover:bg-[#ebf7ef]'
              }`}
            >
              ایمن ({toPersianDigits(kpiSummary.healthyCount)})
            </button>
          </div>

          <div className="relative">
            <select
              value={selectedSupplierFilter}
              onChange={e => setSelectedSupplierFilter(e.target.value)}
              className="bg-[#ffffff] border border-[#bfbfbf] text-[#333333] rounded-sm px-2.5 py-1 text-xs focus:outline-none focus:border-[#007cc0] cursor-pointer"
            >
              <option value="ALL">همه تامین‌کنندگان</option>
              {allSuppliers.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 text-[#666666] absolute right-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="جستجو بر اساس گرید، کد کلاف، قطعه..."
            className="w-full pl-3 pr-8 py-1.5 bg-[#ffffff] border border-[#bfbfbf] rounded-sm text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
          />
        </div>
      </div>

      {/* Main Material Projection Matrix Table */}
      <div className="sap-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="sap-table-compact w-full text-right text-xs">
            <thead>
              <tr>
                <th className="text-center w-10">ردیف</th>
                <th>مشخصات رول ورق و ماده اولیه</th>
                <th>تامین‌کننده و زمان تحویل</th>
                <th className="text-center">موجودی فعلی (kg)</th>
                <th className="text-center">ذخیره اطمینان</th>
                {WORK_DAYS.map(w => (
                  <th key={w.index} className="text-center border-r border-[#d9d9d9] font-mono text-[11px]">
                    <div>{w.shortName}</div>
                    <div className="text-[9px] text-[#666666] font-normal">{w.date.slice(5)}</div>
                  </th>
                ))}
                <th className="text-center">پوشش موجودی</th>
                <th className="text-center">وضعیت ریسک</th>
                <th className="text-center">اقدام سریع (Action)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e8e8]">
              {filteredProjections.map((proj, idx) => {
                const isExpanded = expandedMaterialCode === proj.material.code;
                const mat = proj.material;

                let rowBg = 'hover:bg-[#f5f5f5] transition';
                if (proj.riskCategory === 'CRITICAL') {
                  rowBg = 'bg-[#ffecec]/40 hover:bg-[#ffecec]/70 transition';
                } else if (proj.riskCategory === 'WARNING') {
                  rowBg = 'bg-[#fff4e5]/40 hover:bg-[#fff4e5]/70 transition';
                }

                return (
                  <React.Fragment key={mat.code}>
                    <tr className={rowBg}>
                      <td className="text-center text-[#666666] font-mono">{toPersianDigits(idx + 1)}</td>

                      <td>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setExpandedMaterialCode(isExpanded ? null : mat.code)}
                            className="p-1 hover:bg-[#e8e8e8] rounded-sm text-[#666666] transition cursor-pointer"
                            title="مشاهده قطعات مصرف‌کننده و سفارشات در راه"
                          >
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                          <div>
                            <div className="font-bold text-[#333333] flex items-center gap-1.5">
                              <span>{mat.name}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-[#f5f5f5] text-[#333333] border border-[#d9d9d9] font-mono">
                                {mat.grade}
                              </span>
                            </div>
                            <div className="text-[10px] text-[#666666] font-mono mt-0.5 flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => traceDocument(mat.code, 'INVENTORY_LEDGER')}
                                className="sap-doc-link font-mono"
                              >
                                {mat.code}
                              </button>
                              <span>| ضخامت: {mat.thicknessMm}mm</span>
                              {mat.widthMm > 0 && <span>| عرض: {mat.widthMm}mm</span>}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="font-semibold text-[#333333]">{mat.supplierName}</div>
                        <div className="text-[10px] text-[#666666] flex items-center gap-1 mt-0.5">
                          <Truck className="w-3 h-3 text-[#666666]" />
                          <span>زمان تامین (Lead Time):</span>
                          <strong className="font-mono text-[#333333]">{toPersianDigits(proj.effectiveLeadTime)} روز</strong>
                        </div>
                      </td>

                      <td className="text-center font-bold text-[#333333] font-mono tabular-nums">
                        {formatNumber(mat.initialStockKg)}
                        <span className="text-[10px] text-[#666666] font-normal mr-1">{mat.unit}</span>
                      </td>

                      <td className="text-center font-mono text-[#666666] text-[11px] tabular-nums">
                        {formatNumber(mat.safetyStockKg)}
                      </td>

                      {/* Day 1 to Day 6 Projected Balance Cells */}
                      {proj.dailyTimelineBalances.map(bal => {
                        let cellStyle = 'bg-[#ffffff] text-[#333333]';
                        if (bal.isNegative) {
                          cellStyle = 'bg-[#ffecec] text-[#bb0000] font-bold border border-[#f5b7b1]';
                        } else if (bal.isBelowSafety) {
                          cellStyle = 'bg-[#fff4e5] text-[#e9730c] font-bold border border-[#f9d6a7]';
                        }

                        return (
                          <td
                            key={bal.dayIndex}
                            className="text-center border-r border-[#e8e8e8] font-mono text-[11px] tabular-nums"
                          >
                            <div className={`p-1 rounded-sm ${cellStyle}`}>
                              <div>
                                {bal.endingBalanceKg < 0
                                  ? `(${formatNumber(Math.abs(bal.endingBalanceKg))}-)`
                                  : formatNumber(bal.endingBalanceKg)}
                              </div>
                              <div className="text-[9px] font-normal opacity-80 mt-0.5">
                                مصرف: {formatNumber(bal.consumedKg)}
                              </div>
                              {bal.inboundArrivedKg > 0 && (
                                <div className="text-[8px] text-[#107e3e] font-bold">
                                  +{formatNumber(bal.inboundArrivedKg)}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}

                      <td className="text-center font-mono font-bold tabular-nums">
                        <span
                          className={`px-2 py-0.5 rounded-sm text-xs border ${
                            parseFloat(proj.daysOfInventory) < proj.effectiveLeadTime
                              ? 'bg-[#ffecec] text-[#bb0000] border-[#f5b7b1]'
                              : 'bg-[#ebf7ef] text-[#107e3e] border-[#a9dfbf]'
                          }`}
                        >
                          {toPersianDigits(proj.daysOfInventory)} روز
                        </span>
                      </td>

                      <td className="text-center">
                        {proj.riskCategory === 'CRITICAL' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-sm bg-[#bb0000] text-white font-bold">
                            <AlertTriangle className="w-3 h-3" /> کسری قطعی خط
                          </span>
                        ) : proj.riskCategory === 'WARNING' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-sm bg-[#e9730c] text-white font-bold">
                            <Clock className="w-3 h-3" /> هشدار نقطه سفارش
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-sm bg-[#ebf7ef] text-[#107e3e] border border-[#a9dfbf] font-semibold">
                            <CheckCircle2 className="w-3 h-3 text-[#107e3e]" /> موجودی پایدار
                          </span>
                        )}
                      </td>

                      <td className="text-center">
                        {proj.riskCategory === 'CRITICAL' || proj.riskCategory === 'WARNING' ? (
                          <button
                            type="button"
                            onClick={() => handleOpenPrModal(proj)}
                            className="px-2.5 py-1 bg-[#bb0000] hover:bg-[#990000] text-white rounded-sm text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1 mx-auto"
                          >
                            <ShoppingCart className="w-3 h-3" />
                            <span>صدور PR خرید</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenPrModal(proj)}
                            className="sap-btn-standard px-2.5 py-1 text-xs flex items-center justify-center gap-1 mx-auto"
                          >
                            <Plus className="w-3 h-3" />
                            <span>رزرو / خرید</span>
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* Expanded Detail Tray */}
                    {isExpanded && (
                      <tr className="bg-[#f7f7f7] border-y border-[#d9d9d9]">
                        <td colSpan={13} className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Left: Consuming Parts & MOs */}
                            <div className="bg-[#ffffff] p-3.5 rounded-sm border border-[#d9d9d9]">
                              <h4 className="font-bold text-xs text-[#333333] flex items-center gap-1.5 border-b border-[#e8e8e8] pb-2">
                                <Boxes className="w-3.5 h-3.5 text-[#007cc0]" />
                                <span>دستور کارهای ساخت مصرف‌کننده این رول ورق:</span>
                                <span className="text-[#666666] font-normal">
                                  ({toPersianDigits(proj.matchedParts.length)} قطعه)
                                </span>
                              </h4>
                              <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
                                {proj.matchedParts.length > 0 ? (
                                  proj.matchedParts.map(part => (
                                    <div
                                      key={part.id}
                                      className="flex items-center justify-between text-xs p-2 rounded-sm bg-[#f7f7f7] hover:bg-[#f0f0f0] border border-[#e8e8e8] transition"
                                    >
                                        <div>
                                          <div className="font-bold text-[#333333]">{part.partName}</div>
                                          <div className="text-[10px] text-[#666666] font-mono flex items-center gap-1.5 mt-0.5">
                                            <button
                                              type="button"
                                              onClick={() => traceDocument(part.orderCode, 'WIP_TRACEABILITY')}
                                              className="sap-doc-link"
                                            >
                                              {part.orderCode}
                                            </button>
                                            <span>|</span>
                                            <button
                                              type="button"
                                              onClick={() => traceDocument(part.partCode, 'INVENTORY_LEDGER')}
                                              className="sap-doc-link"
                                            >
                                              {part.partCode}
                                            </button>
                                            <span>({part.carModel})</span>
                                          </div>
                                        </div>
                                        <div className="text-left flex items-center gap-2">
                                          <div className="text-[11px] font-mono text-[#333333] tabular-nums">
                                            {formatNumber(part.weeklyTargetQty)} عدد
                                          </div>
                                          {onOpenOrderTimeline && (
                                            <button
                                              type="button"
                                              onClick={() => onOpenOrderTimeline(part)}
                                              className="p-1 text-[#007cc0] hover:bg-[#e5f3fa] rounded-sm cursor-pointer"
                                              title="مشاهده تایم‌لاین این دستور ساخت"
                                            >
                                              <Clock className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="text-xs text-[#666666] py-3 text-center">
                                      هیچ قطعه فعالی در ماتریس جاری به طور اختصاصی به این گرید متصل نیست.
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Right: Inbound Shipments & Lead Time Assessment */}
                              <div className="bg-[#ffffff] p-3.5 rounded-sm border border-[#d9d9d9]">
                                <h4 className="font-bold text-xs text-[#333333] flex items-center gap-1.5 border-b border-[#e8e8e8] pb-2">
                                  <Truck className="w-3.5 h-3.5 text-[#007cc0]" />
                                  <span>سفارشات در راه (Inbound Pipeline / PO):</span>
                                </h4>
                                <div className="mt-2 space-y-2">
                                  {mat.inboundPipeline.length > 0 ? (
                                    mat.inboundPipeline.map((po, pIdx) => (
                                      <div
                                        key={pIdx}
                                        className="p-2.5 rounded-sm bg-[#e5f3fa] border border-[#b3ddf2] text-xs flex items-center justify-between"
                                      >
                                        <div>
                                          <button
                                            type="button"
                                            onClick={() => traceDocument(po.poNumber, 'INVENTORY_LEDGER')}
                                            className="sap-doc-link font-bold font-mono"
                                          >
                                            {po.poNumber}
                                          </button>
                                          <div className="text-[10px] text-[#333333] mt-0.5">
                                            تامین‌کننده: {po.supplier} | زمان ورود: {po.expectedDate}
                                          </div>
                                      </div>
                                      <div className="font-bold font-mono text-[#007cc0] text-sm tabular-nums">
                                        +{formatNumber(po.qtyKg)} kg
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-xs text-[#666666] py-3 text-center">
                                    هیچ سفارش خریدی (PO) در حال حاضر در مسیر ارسال به کارخانه ثبت نشده است.
                                  </div>
                                )}

                                <div className="mt-3 p-2.5 rounded-sm bg-[#f5f5f5] border border-[#d9d9d9] text-xs">
                                  <span className="font-bold text-[#333333] block">ارزیابی گلوگاه تامین (Bottleneck):</span>
                                  <p className="text-[11px] text-[#666666] mt-1 leading-relaxed">
                                    {proj.riskReason}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Purchase Requisition (PR) Generation Modal */}
      {selectedMaterialForPr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#333333]/40">
          <div className="bg-[#ffffff] w-full max-w-lg rounded-sm shadow-md border border-[#d9d9d9] p-5 text-right font-sans">
            <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-sm bg-[#ffecec] text-[#bb0000] border border-[#f5b7b1] flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#333333]">صدور درخواست خرید کلاف (Purchase Requisition)</h3>
                  <button
                    type="button"
                    onClick={() => traceDocument(selectedMaterialForPr.material.code, 'INVENTORY_LEDGER')}
                    className="sap-doc-link text-xs font-mono"
                  >
                    {selectedMaterialForPr.material.code}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMaterialForPr(null)}
                className="text-[#666666] hover:text-[#333333] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-xs">
              <div className="bg-[#f7f7f7] p-3 rounded-sm border border-[#d9d9d9]">
                <div className="font-bold text-[#333333] text-sm">{selectedMaterialForPr.material.name}</div>
                <div className="grid grid-cols-2 gap-2 mt-2 text-[#666666]">
                  <div>تامین‌کننده پیش‌فرض: <strong className="text-[#333333]">{selectedMaterialForPr.material.supplierName}</strong></div>
                  <div>زمان تامین استاندارد: <strong className="text-[#333333]">{selectedMaterialForPr.material.leadTimeDays} روز</strong></div>
                  <div>پیش‌بینی نقطه کسری: <strong className="text-[#bb0000]">{selectedMaterialForPr.deficitDay}</strong></div>
                  <div>مقدار پیشنهادی MRP: <strong className="font-mono text-[#007cc0]">{formatNumber(selectedMaterialForPr.suggestedQty)} kg</strong></div>
                </div>
              </div>

              <div>
                <label className="block text-[#333333] font-semibold mb-1">تیراژ / تناژ درخواستی (کیلوگرم):</label>
                <input
                  type="text"
                  value={prCustomQty}
                  onChange={e => setPrCustomQty(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#ffffff] border border-[#bfbfbf] rounded-sm text-sm font-bold font-mono text-[#333333] focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <div>
                <label className="block text-[#333333] font-semibold mb-1">اولویت تدارکات:</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'URGENT' as const, label: 'فوری / توقف خط', color: 'bg-[#ffecec] border-[#f5b7b1] text-[#bb0000]' },
                    { id: 'HIGH' as const, label: 'اولویت بالا', color: 'bg-[#fff4e5] border-[#f9d6a7] text-[#e9730c]' },
                    { id: 'NORMAL' as const, label: 'عادی', color: 'bg-[#f5f5f5] border-[#d9d9d9] text-[#333333]' },
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPrPriority(p.id)}
                      className={`p-2 rounded-sm border text-center font-bold text-xs cursor-pointer transition ${
                        prPriority === p.id ? `${p.color} ring-1 ring-[#007cc0]` : 'border-[#d9d9d9] text-[#666666]'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[#333333] font-semibold mb-1">توضیحات و دستور اقدام به واحد تدارکات:</label>
                <textarea
                  rows={2}
                  value={prNote}
                  onChange={e => setPrNote(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#ffffff] border border-[#bfbfbf] rounded-sm text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                ></textarea>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#e8e8e8] flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSelectedMaterialForPr(null)}
                className="sap-btn-standard px-4 py-1.5"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmIssuePr}
                className="px-5 py-1.5 bg-[#bb0000] hover:bg-[#990000] text-white rounded-sm font-bold cursor-pointer flex items-center gap-1.5"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>ثبت قطعی و ارسال به تدارکات (PR)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
