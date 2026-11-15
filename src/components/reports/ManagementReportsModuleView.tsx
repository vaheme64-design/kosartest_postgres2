import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Calendar,
  Layers,
  TrendingUp,
  Boxes,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  RefreshCw,
  Search,
  Download,
  Eye,
  Info,
  Scale,
  Percent,
  Printer,
  FileText,
  Filter,
} from 'lucide-react';
import {
  ReportFilterParams,
  ReportMeta,
  PlanVsActualItem,
  CustomerOrderFulfillmentItem,
  ProductionBacklogItem,
  WipByPartAndOperationItem,
  WipAgingItem,
  MaterialConsumptionActualItem,
  SapcoMaterialAccountItem,
  InventoryValuationQuantitiesItem,
  ScrapByPartAndOperationItem,
  MachineWorkloadCapacityItem,
  ProductionDelaysItem,
  ProductionDelaySection,
  ProductionDelayAnalyticsSummary,
  InventoryMovementItem,
  InventoryReconciliationItem,
  CoilInventoryReportItem,
  LotConsumptionReportItem,
  SupplierMatrixReportItem,
} from '../../types/managementReports';
import { Part, Machine } from '../../types/inventory';
import { ReportFiltersBar } from './ReportFiltersBar';
import { DrillDownModal, DrillDownData } from './DrillDownModal';
import { exportToCsv } from '../../utils/csvExport';
import { formatNumber, toPersianDigits } from '../../utils/formatters';
import { formatToJalali } from '../../utils/jalali';
import { OeeModuleView } from './OeeModuleView';
import { MachineUtilizationView } from './MachineUtilizationView';
import { ConsumablesForecastView } from '../planning/ConsumablesForecastView';
import { MrpModuleView } from '../planning/MrpModuleView';
import { ComprehensiveProductionReportView } from './ComprehensiveProductionReportView';
import { ProductionWorkflowDocumentationView } from '../planning/ProductionWorkflowDocumentationView';
import { PlantMaintenanceModuleView } from '../maintenance/PlantMaintenanceModuleView';
import { CustomReportsView } from '../inventory/CustomReportsView';
import { TableSkeleton, KpiCardsSkeleton, ChartSkeleton } from '../ui/Skeleton';
import { useErpRouter } from '../../context/RouterContext';

export type ReportTypeKey =
  | 'plan_vs_actual'
  | 'fulfillment'
  | 'backlog'
  | 'wip_operation'
  | 'wip_aging'
  | 'consumption'
  | 'sapco_account'
  | 'valuation_qty'
  | 'scrap_analysis'
  | 'machine_workload'
  | 'delays'
  | 'movements'
  | 'reconciliation'
  | 'coil_inventory'
  | 'lot_consumption'
  | 'supplier_matrix'
  | 'oee_module'
  | 'machine_utilization'
  | 'consumables_forecast'
  | 'mrp_forecast'
  | 'comprehensive_production'
  | 'production_workflow'
  | 'tpm_maintenance'
  | 'custom_builder';

interface ManagementReportsModuleViewProps {
  parts: Part[];
  machines: Machine[];
  initialReportType?: ReportTypeKey;
}

export const ManagementReportsModuleView: React.FC<ManagementReportsModuleViewProps> = ({
  parts,
  machines,
  initialReportType = 'plan_vs_actual',
}) => {
  const { traceDocument } = useErpRouter();
  const [activeReport, setActiveReport] = useState<ReportTypeKey>(initialReportType);
  const [filters, setFilters] = useState<ReportFilterParams>({});
  const [loading, setLoading] = useState(false);
  const [reportMeta, setReportMeta] = useState<ReportMeta | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [tableSearchQuery, setTableSearchQuery] = useState<string>('');

  // Report Data Stores
  const [planVsActualData, setPlanVsActualData] = useState<PlanVsActualItem[]>([]);
  const [fulfillmentData, setFulfillmentData] = useState<CustomerOrderFulfillmentItem[]>([]);
  const [backlogData, setBacklogData] = useState<ProductionBacklogItem[]>([]);
  const [wipOpData, setWipOpData] = useState<WipByPartAndOperationItem[]>([]);
  const [wipAgingData, setWipAgingData] = useState<WipAgingItem[]>([]);
  const [consumptionData, setConsumptionData] = useState<MaterialConsumptionActualItem[]>([]);
  const [sapcoAccountData, setSapcoAccountData] = useState<SapcoMaterialAccountItem[]>([]);
  const [valuationData, setValuationData] = useState<InventoryValuationQuantitiesItem[]>([]);
  const [scrapData, setScrapData] = useState<ScrapByPartAndOperationItem[]>([]);
  const [machineData, setMachineData] = useState<MachineWorkloadCapacityItem[]>([]);
  const [delaysData, setDelaysData] = useState<ProductionDelaysItem[]>([]);
  const [delayAnalytics, setDelayAnalytics] = useState<ProductionDelayAnalyticsSummary | null>(null);
  const [delaySectionFilter, setDelaySectionFilter] = useState<'ALL' | ProductionDelaySection>('ALL');
  const [delayCauseFilter, setDelayCauseFilter] = useState<string>('ALL');
  const [movementsData, setMovementsData] = useState<InventoryMovementItem[]>([]);
  const [reconciliationData, setReconciliationData] = useState<InventoryReconciliationItem[]>([]);
  const [coilInventoryData, setCoilInventoryData] = useState<CoilInventoryReportItem[]>([]);
  const [lotConsumptionData, setLotConsumptionData] = useState<LotConsumptionReportItem[]>([]);
  const [supplierMatrixData, setSupplierMatrixData] = useState<SupplierMatrixReportItem[]>([]);

  // Drill-down Modal State
  const [drillDownItem, setDrillDownItem] = useState<DrillDownData | null>(null);

  const reportDefinitions: { id: ReportTypeKey; title: string; category: string; description: string }[] = [
    { id: 'custom_builder', title: '★ گزارش‌ساز پویا و سفارشی (موجودی ۳ سطحی پس از مصرف، انحراف BOM و زنجیره رهگیری اسناد)', category: 'انبار', description: 'ساخت گزارش سفارشی با انتخاب ستون‌ها، ذخیره قالب، خروجی اکسل و رهگیری از شماره ذوب تا محصول نهایی' },
    { id: 'plan_vs_actual', title: '۱. تطبیق برنامه در برابر تولید واقعی (Plan vs Actual)', category: 'تولید', description: 'مقایسه تناژ و تیراژ مصوب ماهانه با آمار تولید واقعی پرس‌ها و محاسبه درصد تحقق' },
    { id: 'fulfillment', title: '۲. وضعیت تحقق سفارشات مشتریان (ساپکو/سایپا)', category: 'فروش', description: 'تعهدات تحویل قطعات بدنه به خطوط خودروساز و پایش کسری‌های خطوط مشتری' },
    { id: 'backlog', title: '۳. تعهدات معوق و عقب‌افتاده تولید (Backlog)', category: 'فروش', description: 'سفارشات باز و دارای تأخیر نسبت به موعد تحویل و پوشش با موجودی محصول و WIP' },
    { id: 'wip_operation', title: '۴. کار در جریان ساخت به تفکیک قطعه و مرحله (WIP)', category: 'تولید', description: 'ردیابی قطعات در صف برش، پرس ضربه‌ای، پرس هیدرولیک و جوشکاری' },
    { id: 'wip_aging', title: '۵. سن‌یابی و ماندگاری اقلام در خطوط (WIP Aging)', category: 'تولید', description: 'شناسایی پالت‌های راکد و خوابیده بین اوپراسیون‌ها بالای ۴۸ ساعت' },
    { id: 'consumption', title: '۶. مصرف واقعی مواد در عملیات تولید', category: 'مواد', description: 'مصرف ثبت‌شده در کاردکس به تفکیک دستور ساخت و عملیات، همراه با ماشین و اپراتور ثبت‌شده در گزارش تولید' },
    { id: 'sapco_account', title: '۷. حساب و بیلان امانی کلاف‌های ساپکو', category: 'مواد', description: 'کاردکس کیلوگرمی کلاف‌های امانی با تفکیک دریافتی، مصرفی و باقیمانده' },
    { id: 'valuation_qty', title: '۸. تفکیک مقداری موجودی انبارها و قرنطینه', category: 'انبار', description: 'موجودی رسمی فیزیکی، ملکی کارخانه، امانی ساپکو و توقیف کیفی' },
    { id: 'scrap_analysis', title: '۹. ضایعات به تفکیک قطعه و مرحله عملیات', category: 'تولید', description: 'سهم ضایعات سنبه‌ماتریس، اشکالات اپراتوری و نقص ورق ورودی' },
    { id: 'machine_workload', title: '۱۰. لود کاری و ظرفیت آزاد ماشین‌آلات پرس', category: 'ماشین‌آلات', description: 'ساعات تخصیص‌یافته به پرس‌ها، راندمان OEE و گلوگاه‌های سالن پرس' },
    { id: 'delays', title: '۱۱. گزارش تأخیرات تولید و علل انحرافات', category: 'تولید', description: 'علت‌یابی توقفات ناشی از کمبود رول ورق، شکستگی قالب یا قطعی برق' },
    { id: 'movements', title: '۱۲. کاردکس و گردش تحلیلی اسناد انبار', category: 'انبار', description: 'دفتر کل ورود، خروج، انتقال بین‌انباری و اسناد تعدیل و ابطال' },
    { id: 'reconciliation', title: '۱۳. انبارگردانی و موازنه مغایرت فیزیکی', category: 'انبار', description: 'تطبیق موجودی شمارش‌شده با موجودی دفتری و کسری/اضافی انبار' },
    { id: 'coil_inventory', title: '۱۴. موجودی تفکیکی کویل‌ها و رول‌های ورق', category: 'مواد', description: 'وضعیت هر رول (سالم، بازشده، مصرف‌شده) با وزن اولیه، باقیمانده و شماره ذوب' },
    { id: 'lot_consumption', title: '۱۵. ردیابی مصرف رول و لوت پای خطوط پرس', category: 'تولید', description: 'حواله‌های مصرف لوت پای پرس با شماره MO، قطعه تولیدی و پرت کیلوگرمی' },
    { id: 'supplier_matrix', title: '۱۶. ماتریس حساب مواد تأمین‌کننده (گرید × ضخامت)', category: 'مواد', description: 'جدول ماتریسی دریافتی، مصرفی و مانده ورق‌ها به تفکیک گرید و ضخامت' },
    { id: 'oee_module', title: '۱۷. ماژول OEE (اثربخشی کلی تجهیزات و ۶ ضایعه بزرگ)', category: 'ماشین‌آلات', description: 'محاسبه دسترس‌پذیری × کارایی × کیفیت، TEEP، MTBF/MTTR و پارتو ۶ ضایعه بزرگ TPM' },
    { id: 'machine_utilization', title: '۱۸. ماژول گزارش بهره ماشین و کارکرد پرس‌ها', category: 'ماشین‌آلات', description: 'تحلیل ساعات کارکرد مفید، تعویض قالب SMED، توقفات اضطراری و راندمان ضرب در دقیقه (SPM)' },
    { id: 'consumables_forecast', title: '۱۹. ماژول پیش‌بینی مواد مصرفی کارگاه (Consumables)', category: 'مواد', description: 'پیش‌بینی نرخ مصرف سیم جوش، گاز CO2، روغن کشش و قطعات یدکی قالب با نقطه سفارش ROP' },
    { id: 'mrp_forecast', title: '۲۰. پیش‌بینی نیازمندی مواد و موازنه کلاف (MRP)', category: 'مواد', description: 'انفجار چندسطحی BOM، کسری خالص ورق و پیش‌بینی نیازمندی کلاف بر اساس سفارشات ساپکو' },
    { id: 'comprehensive_production', title: '۲۱. گزارش جامع تولید: شاخص‌های بهره‌وری (OEE)، توقفات و انحراف برنامه', category: 'تولید', description: 'نمودار درختی شکست OEE، خط زمان (Timeline) توقفات شیفت و ماتریس انحراف از برنامه (Schedule Adherence)' },
    { id: 'production_workflow', title: '۲۲. مستند فنی و جریان فرآیند تولید (Workflow استاندارد SAP PP)', category: 'تولید', description: 'دیاگرام تعاملی فرآیند دریافت سفارش، انفجار مواد BOM، زمان‌بندی پله‌ای، رهگیری WIP و صدور خودکار رسید انبار' },
    { id: 'tpm_maintenance', title: '۲۳. مدیریت نگهداری و تعمیرات (TPM)، دستورکارها، MTBF و توقفات تجهیزات', category: 'ماشین‌آلات', description: 'کانبان دستورکارهای تعمیرات شکست CM، برنامه‌ریزی سرویس‌های دوره‌ای PM، پارتو علل خرابی و شاخص‌های قابلیت اطمینان MTBF/MTTR (استاندارد Odoo/ERPNext)' },
  ];

  const isStandaloneModule =
    activeReport === 'custom_builder' ||
    activeReport === 'oee_module' ||
    activeReport === 'machine_utilization' ||
    activeReport === 'consumables_forecast' ||
    activeReport === 'mrp_forecast' ||
    activeReport === 'comprehensive_production' ||
    activeReport === 'production_workflow' ||
    activeReport === 'tpm_maintenance';

  const fetchActiveReport = async () => {
    if (isStandaloneModule) return;
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (filters.startDate) queryParams.append('startDate', filters.startDate);
      if (filters.endDate) queryParams.append('endDate', filters.endDate);
      if (filters.partId) queryParams.append('partId', filters.partId);
      if (filters.customerName) queryParams.append('customerName', filters.customerName);
      if (filters.machineId) queryParams.append('machineId', filters.machineId);
      if (filters.processType) queryParams.append('processType', filters.processType);
      if (filters.status) queryParams.append('status', filters.status);

      let endpoint = '';
      switch (activeReport) {
        case 'plan_vs_actual':
          endpoint = `/api/reports/plan-vs-actual?${queryParams}`;
          break;
        case 'fulfillment':
          endpoint = `/api/reports/customer-order-fulfillment?${queryParams}`;
          break;
        case 'backlog':
          endpoint = `/api/reports/production-backlog?${queryParams}`;
          break;
        case 'wip_operation':
          endpoint = `/api/reports/wip-by-part-operation?${queryParams}`;
          break;
        case 'wip_aging':
          endpoint = `/api/reports/wip-aging?${queryParams}`;
          break;
        case 'consumption':
          endpoint = `/api/reports/material-consumption-actual?${queryParams}`;
          break;
        case 'sapco_account':
          endpoint = `/api/reports/sapco-material-account?${queryParams}`;
          break;
        case 'valuation_qty':
          endpoint = `/api/reports/inventory-valuation-quantities?${queryParams}`;
          break;
        case 'scrap_analysis':
          endpoint = `/api/reports/scrap-by-part-operation?${queryParams}`;
          break;
        case 'machine_workload':
          endpoint = `/api/reports/machine-workload-capacity?${queryParams}`;
          break;
        case 'delays':
          endpoint = `/api/reports/production-delays?${queryParams}`;
          break;
        case 'movements':
          endpoint = `/api/reports/inventory-movements?${queryParams}`;
          break;
        case 'reconciliation':
          endpoint = `/api/reports/inventory-reconciliation?${queryParams}`;
          break;
        case 'coil_inventory':
          endpoint = `/api/reports/coil-inventory?${queryParams}`;
          break;
        case 'lot_consumption':
          endpoint = `/api/reports/lot-consumption?${queryParams}`;
          break;
        case 'supplier_matrix':
          endpoint = `/api/reports/supplier-matrix?${queryParams}`;
          break;
      }

      const res = await fetch(endpoint);
      const data = await res.json();
      if (data.success) {
        setReportMeta(data.meta);
        if (activeReport === 'plan_vs_actual') setPlanVsActualData(data.data);
        else if (activeReport === 'fulfillment') setFulfillmentData(data.data);
        else if (activeReport === 'backlog') setBacklogData(data.data);
        else if (activeReport === 'wip_operation') setWipOpData(data.data);
        else if (activeReport === 'wip_aging') setWipAgingData(data.data);
        else if (activeReport === 'consumption') setConsumptionData(data.data);
        else if (activeReport === 'sapco_account') setSapcoAccountData(data.data);
        else if (activeReport === 'valuation_qty') setValuationData(data.data);
        else if (activeReport === 'scrap_analysis') setScrapData(data.data);
        else if (activeReport === 'machine_workload') setMachineData(data.data);
        else if (activeReport === 'delays') {
          setDelaysData(data.data);
          fetch(`/api/reports/production-delays/analytics?${queryParams}`)
            .then(r => r.json())
            .then(d => { if (d.success) setDelayAnalytics(d.data); })
            .catch(() => {});
        }
        else if (activeReport === 'movements') setMovementsData(data.data);
        else if (activeReport === 'reconciliation') setReconciliationData(data.data);
        else if (activeReport === 'coil_inventory') setCoilInventoryData(data.data);
        else if (activeReport === 'lot_consumption') setLotConsumptionData(data.data);
        else if (activeReport === 'supplier_matrix') setSupplierMatrixData(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch report data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveReport();
  }, [activeReport, filters]);

  // Export Table to Excel CSV
  const handleExportCsv = () => {
    const filename = `KPIMS_${activeReport}_${new Date().toISOString().slice(0, 10)}`;

    switch (activeReport) {
      case 'plan_vs_actual': {
        const headers = ['شماره برنامه', 'نسخه', 'کد قطعه', 'نام قطعه', 'تیراژ مصوب', 'تولید واقعی', 'ضایعات', 'درصد تحقق', 'انحراف', 'موعد تحویل'];
        const rows = planVsActualData.map(r => [
          r.planNumber,
          r.planVersion,
          r.partCode,
          r.partName,
          r.plannedQuantity,
          r.actualProducedQuantity,
          r.actualScrapQuantity,
          `${r.achievementRatePercent}%`,
          r.varianceQuantity,
          r.targetDueDate,
        ]);
        exportToCsv(filename, headers, rows);
        break;
      }
      case 'fulfillment': {
        const headers = ['شماره سفارش', 'قرارداد', 'مشتری', 'کد قطعه', 'نام قطعه', 'سفارش داده شده', 'تحویل شده', 'باقیمانده', 'درصد تحقق', 'موعد تحویل', 'تأخیر (روز)'];
        const rows = fulfillmentData.map(r => [
          r.orderNumber,
          r.contractNumber,
          r.customerName,
          r.partCode,
          r.partName,
          r.orderedQuantity,
          r.deliveredQuantity,
          r.remainingQuantity,
          `${r.fulfillmentPercent}%`,
          r.dueDate,
          r.daysOverdue,
        ]);
        exportToCsv(filename, headers, rows);
        break;
      }
      case 'backlog': {
        const headers = ['شماره سفارش', 'مشتری', 'قرارداد', 'کد قطعه', 'نام قطعه', 'تعداد معوق', 'موعد تحویل', 'روزهای تأخیر', 'ورق مورد نیاز (kg)', 'سطح فوریت'];
        const rows = backlogData.map(r => [
          r.orderNumber,
          r.customerName,
          r.contractNumber,
          r.partCode,
          r.partName,
          r.backlogQuantity,
          r.dueDate,
          r.daysOverdue,
          r.requiredRawMaterialKg,
          r.urgencyLevel,
        ]);
        exportToCsv(filename, headers, rows);
        break;
      }
      case 'wip_operation': {
        const headers = ['شماره MO', 'کد قطعه', 'نام قطعه', 'مرحله', 'فرایند', 'موقعیت انبارش', 'در صف ورودی', 'پای دستگاه', 'آماده انتقال', 'منتقل شده', 'کل WIP فعال'];
        const rows = wipOpData.map(r => [
          r.moNumber,
          r.partCode,
          r.partName,
          `OP${r.stepNumber} - ${r.stepName}`,
          r.processType,
          r.warehouseLocation,
          r.waitingInputQty,
          r.inProgressQty,
          r.readyForTransferQty,
          r.transferredQty,
          r.totalActiveWipQty,
        ]);
        exportToCsv(filename, headers, rows);
        break;
      }
      case 'wip_aging': {
        const headers = ['شماره MO', 'کد قطعه', 'نام قطعه', 'مرحله', 'موقعیت', 'موجودی در ایستگاه', 'ساعت توقف', 'روز توقف', 'رده سنی', 'سطح هشدار'];
        const rows = wipAgingData.map(r => [
          r.moNumber,
          r.partCode,
          r.partName,
          r.stepName,
          r.warehouseLocation,
          r.quantityInStation,
          r.idleHours,
          r.idleDays,
          r.ageCategory,
          r.statusSeverity,
        ]);
        exportToCsv(filename, headers, rows);
        break;
      }
      case 'consumption': {
        const headers = ['شماره MO', 'کد محصول', 'نام محصول', 'مرحله عملیات', 'کد ماده', 'نام ماده', 'گرید', 'مصرف واقعی ثبت‌شده (kg)', 'تولید سالم ثبت‌شده', 'ضایعات ثبت‌شده (عدد)', 'وزن ضایعات (kg)', 'ماشین واقعی', 'اپراتور', 'شماره کلاف', 'قرارداد'];
        const rows = consumptionData.map(r => [
          r.moNumber,
          r.productPartCode,
          r.productPartName,
          `${r.operationStep} - ${r.operationName}`,
          r.materialCode,
          r.materialName,
          r.materialGrade,
          r.actualIssuedMaterialKg,
          r.actualProducedGoodQty,
          r.actualScrapQty,
          r.actualScrapWeightKg,
          r.actualMachineNames.join(' | '),
          r.actualOperatorNames.join(' | '),
          r.coilNumbers.join(' | '),
          r.contractNumbers.join(' | '),
        ]);
        exportToCsv(filename, headers, rows);
        break;
      }
      case 'sapco_account': {
        const headers = ['شماره قرارداد', 'عنوان تخصیص', 'گرید فولاد', 'سهمیه مصوب (kg)', 'اول دوره (kg)', 'رسید (kg)', 'مصرف (kg)', 'مانده دفتری (kg)', 'موجودی فیزیکی کارخانه (kg)', 'مغایرت (kg)'];
        const rows = sapcoAccountData.map(r => [
          r.contractNumber,
          r.title,
          r.materialGrade,
          r.allocatedQuotaKg,
          r.openingBalanceKg,
          r.totalReceivedKg,
          r.totalIssuedKg,
          r.closingBookBalanceKg,
          r.physicalStockInPlantKg,
          r.discrepancyKg,
        ]);
        exportToCsv(filename, headers, rows);
        break;
      }
      case 'valuation_qty': {
        const headers = ['طبقه‌بندی', 'کد قلم', 'شرح قلم', 'واحد', 'موجودی فیزیکی', 'ملکی کارخانه', 'امانی ساپکو', 'مسدود کیفی', 'رزرو سفارشات', 'موجودی آزاد قابل تخصیص', 'وزن کل (kg)'];
        const rows = valuationData.map(r => [
          r.category,
          r.partOrMaterialCode,
          r.description,
          r.unit,
          r.physicalQuantity,
          r.companyOwnedQuantity,
          r.sapcoConsignmentQuantity,
          r.qualityBlockedQuantity,
          r.reservedQuantity,
          r.availableFreeQuantity,
          r.totalPhysicalWeightKg,
        ]);
        exportToCsv(filename, headers, rows);
        break;
      }
      case 'scrap_analysis': {
        const headers = ['کد قطعه', 'نام قطعه', 'مرحله', 'فرایند', 'ماشین', 'کل ورودی', 'تعداد ضایعات', 'وزن ضایعات (kg)', 'نرم مجاز %', 'درصد واقعی ضایعات', 'علت شایع نقص'];
        const rows = scrapData.map(r => [
          r.partCode,
          r.partName,
          `OP${r.stepNumber} - ${r.stepName}`,
          r.processType,
          r.machineName || r.machineCode || '-',
          r.totalInputQty,
          r.scrapPieces,
          r.scrapWeightKg,
          `${r.scrapNormPercent}%`,
          `${r.actualScrapPercent}%`,
          r.commonScrapDefectType || '-',
        ]);
        exportToCsv(filename, headers, rows);
        break;
      }
      case 'machine_workload': {
        const headers = ['کد دستگاه', 'نام دستگاه پرس', 'سالن', 'فرایند', 'تناژ (تن)', 'ظرفیت اسمی روزانه (h)', 'ساعت کار برنامه‌ریزی‌شده', 'ظرفیت آزاد (h)', 'درصد بهره‌وری', 'وضعیت دستگاه'];
        const rows = machineData.map(r => [
          r.machineCode,
          r.machineName,
          r.hall,
          r.processType,
          r.tonnage || '-',
          r.nominalDailyCapacityHours,
          r.scheduledWorkloadHours,
          r.availableCapacityHours,
          `${r.utilizationRatePercent}%`,
          r.machineStatus,
        ]);
        exportToCsv(filename, headers, rows);
        break;
      }
      case 'delays': {
        const headers = ['بخش', 'شماره مرجع', 'طرف حساب / ایستگاه', 'کد قطعه', 'نام قطعه', 'تیراژ معوق', 'موعد مصوب', 'تکمیل (تخمینی/واقعی)', 'روزهای تأخیر', 'علت ریشه‌ای تأخیر', 'سطح فوریت', 'ریسک جریمه (ریال)', 'شرح علت'];
        const rows = delaysData.map(r => [
          r.sectionLabelFa,
          r.referenceNumber,
          r.customerOrPlan,
          r.partCode,
          `"${r.partName.replace(/"/g, '""')}"`,
          r.quantity,
          r.plannedDueDate,
          r.estimatedCompletionDate,
          r.delayDays,
          r.primaryDelayCause,
          r.urgencyLevel,
          r.delayPenaltyRiskRials ?? 'ثبت نشده',
          `"${(r.delayDescription || '').replace(/"/g, '""')}"`,
        ]);
        exportToCsv(filename, headers, rows);
        break;
      }
      case 'movements': {
        const headers = ['شناسه تراکنش', 'شماره سند', 'تاریخ تراکنش', 'نوع سند', 'کد قلم', 'نام قلم', 'مقدار', 'واحد', 'مبدأ', 'مقصد', 'مالکیت', 'کاربر ثبت‌کننده'];
        const rows = movementsData.map(r => [
          r.transactionId,
          r.documentNumber,
          r.transactionDate,
          r.documentType,
          r.partCode,
          r.partName,
          r.quantity,
          r.unit,
          r.sourceLocation,
          r.targetLocation,
          r.ownership,
          r.operatorOrUser,
        ]);
        exportToCsv(filename, headers, rows);
        break;
      }
      case 'reconciliation': {
        const headers = ['کد انبار/موقعیت', 'نام انبار', 'کد قطعه', 'نام قطعه', 'موجودی دفتری', 'شمارش فیزیکی', 'مغایرت', 'وضعیت موازنه', 'تاریخ انبارگردانی', 'مسئول ممیزی'];
        const rows = reconciliationData.map(r => [
          r.locationCode,
          r.warehouseName,
          r.partCode,
          r.partName,
          r.bookQuantity,
          r.physicalCountQuantity,
          r.varianceQuantity,
          r.reconciliationStatus,
          r.lastReconciledAt,
          r.reconciledBy,
        ]);
        exportToCsv(filename, headers, rows);
        break;
      }
      case 'coil_inventory': {
        const headers = ['شماره کویل', 'کد ماده', 'گرید', 'ضخامت (mm)', 'عرض (mm)', 'وزن اولیه (kg)', 'مصرف شده (kg)', 'مانده فعلی (kg)', 'مالکیت', 'قرارداد', 'شماره ذوب', 'پکینگ لیست', 'موقعیت', 'وضعیت'];
        const rows = coilInventoryData.map(r => [
          r.coilNumber,
          r.materialCode,
          r.materialGrade,
          r.thicknessMm,
          r.widthMm,
          r.receivedWeightKg,
          r.consumedWeightKg,
          r.remainingWeightKg,
          r.ownership === 'SAPCO_CONSIGNMENT' ? 'امانی ساپکو' : 'ملکی کارخانه',
          r.contractNumber,
          r.heatNumber,
          r.packingNumber,
          r.warehouseLocation,
          r.status,
        ]);
        exportToCsv(filename, headers, rows);
        break;
      }
      case 'lot_consumption': {
        const headers = ['شماره سند حواله', 'تاریخ', 'شماره کویل', 'شماره ذوب', 'گرید ورق', 'ضخامت', 'مصرف (kg)', 'دستگاه مقصد', 'شماره MO', 'کد قطعه', 'نام قطعه', 'قطعات تولیدی', 'ضایعات (kg)', 'درصد ضایعات', 'اپراتور'];
        const rows = lotConsumptionData.map(r => [
          r.issueDocumentNumber,
          r.issueDate,
          r.coilNumber,
          r.heatNumber,
          r.materialGrade,
          r.thicknessMm,
          r.consumedKg,
          r.destinationMachine,
          r.targetMoNumber,
          r.targetPartCode,
          r.targetPartName,
          r.piecesProduced,
          r.scrapKg,
          `${r.scrapPercent}%`,
          r.operatorName,
        ]);
        exportToCsv(filename, headers, rows);
        break;
      }
      case 'supplier_matrix': {
        const headers = ['گرید فولاد', 'ضخامت (mm)', 'اول دوره (kg)', 'رسید ملکی/خرید (kg)', 'رسید امانی ساپکو (kg)', 'جمع مصرف (kg)', 'سایر گردش‌ها (kg)', 'مانده پایانی دوره (kg)', 'تعداد کویل'];
        const rows = supplierMatrixData.map(r => [
          r.grade,
          r.thicknessMm,
          r.openingBalanceKg,
          r.financialReceivedKg,
          r.consignmentReceivedKg,
          r.totalConsumptionKg,
          r.otherMovementKg,
          r.closingBalanceKg,
          r.totalCoilsCount,
        ]);
        exportToCsv(filename, headers, rows);
        break;
      }
    }
  };

  const filterRows = <T extends Record<string, any>>(items: T[]): T[] => {
    const q = tableSearchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(item =>
      Object.values(item).some(val =>
        val !== null && val !== undefined && String(Array.isArray(val) ? val.join(' ') : val).toLowerCase().includes(q)
      )
    );
  };

  const categories = [
    { id: 'ALL', label: `همه گزارش‌ها و ماژول‌ها (${toPersianDigits(reportDefinitions.length)})` },
    { id: 'تولید', label: 'تولید و خطوط پرس' },
    { id: 'مواد', label: 'مواد اولیه، مصرفی و ساپکو' },
    { id: 'انبار', label: 'انبار و کاردکس' },
    { id: 'فروش', label: 'فروش و تعهدات' },
    { id: 'ماشین‌آلات', label: 'ماشین‌آلات، بهره و OEE' },
  ];

  const filteredReports = reportDefinitions.filter(
    r => selectedCategory === 'ALL' || r.category === selectedCategory
  );

  const applyQuickPeriod = (period: 'TODAY' | 'WEEK' | 'MONTH' | '3MONTH' | 'ALL') => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    if (period === 'ALL') {
      setFilters(prev => ({ ...prev, startDate: undefined, endDate: undefined }));
      return;
    }
    let startStr = todayStr;
    if (period === 'WEEK') {
      const d = new Date(now.getTime() - 7 * 86400000);
      startStr = d.toISOString().slice(0, 10);
    } else if (period === 'MONTH') {
      const d = new Date(now.getTime() - 30 * 86400000);
      startStr = d.toISOString().slice(0, 10);
    } else if (period === '3MONTH') {
      const d = new Date(now.getTime() - 90 * 86400000);
      startStr = d.toISOString().slice(0, 10);
    }
    setFilters(prev => ({ ...prev, startDate: startStr, endDate: todayStr }));
  };

  const currentDef = reportDefinitions.find(r => r.id === activeReport);

  return (
    <div className="space-y-4">
      {/* SAP HANA Fiori Header & Single Unified Report Filter Bar */}
      <div className="sap-card p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded bg-[#e5f3fa] border border-[#b3ddf2] text-[#007cc0] flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm lg:text-base font-semibold text-[#333333] tracking-tight">
                مرکز گزارش‌های مدیریتی، بهره‌وری ماشین، پیش‌بینی مواد و OEE
              </h2>
              <p className="text-xs text-[#666666] mt-0.5">
                {currentDef
                  ? currentDef.description
                  : `${toPersianDigits(reportDefinitions.length)} گزارش و ماژول تحلیلی: تأخیرات تولید، OEE، بهره ماشین، پیش‌بینی مواد مصرفی و MRP`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-end lg:self-auto">
            <button
              onClick={() => window.print()}
              className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-[#666666]" />
              <span>چاپ رسمی</span>
            </button>

            {!isStandaloneModule && (
              <button
                onClick={fetchActiveReport}
                disabled={loading}
                className="sap-btn-emphasized flex items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>بروزرسانی</span>
              </button>
            )}
          </div>
        </div>

        {/* Single Unified Filter & Module Selector Bar */}
        <div className="pt-2.5 border-t border-[#e8e8e8] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 bg-[#f7f7f7] border border-[#bfbfbf] rounded px-2.5 py-1">
              <Filter className="w-3.5 h-3.5 text-[#007cc0]" />
              <span className="text-[#666666] font-medium">انتخاب گزارش / ماژول:</span>
              <select
                value={activeReport}
                onChange={e => setActiveReport(e.target.value as ReportTypeKey)}
                className="bg-transparent font-semibold text-[#333333] focus:outline-none cursor-pointer max-w-xs sm:max-w-md truncate"
              >
                {filteredReports.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="inline-flex items-center gap-1.5 bg-white border border-[#bfbfbf] rounded px-2.5 py-1 text-[#333333]">
              <select
                value={selectedCategory}
                onChange={e => {
                  const catId = e.target.value;
                  setSelectedCategory(catId);
                  const firstInCat = reportDefinitions.find(
                    r => catId === 'ALL' || r.category === catId
                  );
                  if (firstInCat && activeReport !== firstInCat.id) {
                    setActiveReport(firstInCat.id);
                  }
                }}
                className="bg-transparent text-xs font-medium text-[#333333] focus:outline-none cursor-pointer"
              >
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    دسته: {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto">
              {[
                { id: 'custom_builder', label: '★ گزارش‌ساز پویا و سفارشی' },
                { id: 'comprehensive_production', label: 'گزارش جامع OEE و توقفات' },
                { id: 'production_workflow', label: 'جریان فرآیند SAP PP' },
                { id: 'oee_module', label: 'داشبورد OEE' },
                { id: 'machine_utilization', label: 'بهره ماشین' },
                { id: 'consumables_forecast', label: 'پیش‌بینی مصرفی' },
                { id: 'mrp_forecast', label: 'پیش‌بینی MRP' },
                { id: 'delays', label: 'تأخیرات تولید' },
              ].map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategory('ALL');
                    setActiveReport(item.id as ReportTypeKey);
                  }}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer border ${
                    activeReport === item.id
                      ? 'bg-[#e5f3fa] text-[#007cc0] border-[#007cc0] font-semibold'
                      : 'bg-white hover:bg-[#f5f5f5] text-[#666666] border-[#d9d9d9]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {[
              { id: 'TODAY', label: 'امروز' },
              { id: 'WEEK', label: '۷ روز' },
              { id: 'MONTH', label: 'این ماه' },
              { id: 'ALL', label: 'کل دوره' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => applyQuickPeriod(p.id as any)}
                className="px-2 py-1 rounded border border-[#d9d9d9] bg-[#f7f7f7] hover:bg-[#e5f3fa] hover:text-[#007cc0] text-[#333333] text-[11px] transition-colors cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Standalone Analytical & Forecasting Modules */}
      {activeReport === 'custom_builder' && <CustomReportsView />}
      {activeReport === 'comprehensive_production' && <ComprehensiveProductionReportView />}
      {activeReport === 'production_workflow' && <ProductionWorkflowDocumentationView />}
      {activeReport === 'tpm_maintenance' && <PlantMaintenanceModuleView machines={machines} />}
      {activeReport === 'oee_module' && <OeeModuleView machines={machines} />}
      {activeReport === 'machine_utilization' && <MachineUtilizationView machines={machines} />}
      {activeReport === 'consumables_forecast' && <ConsumablesForecastView />}
      {activeReport === 'mrp_forecast' && <MrpModuleView />}

      {/* Filters Bar (for standard tabular reports) */}
      {!isStandaloneModule && (
        <ReportFiltersBar
          parts={parts}
          machines={machines}
          filters={filters}
          onFilterChange={setFilters}
          onExportCsv={handleExportCsv}
          isExporting={loading}
        />
      )}

      {/* Loading Skeleton for Standard Tabular & Delay Reports */}
      {!isStandaloneModule && loading && (
        <div className="space-y-4">
          {activeReport === 'delays' && (
            <>
              <KpiCardsSkeleton count={4} columns={4} theme="light" />
              <ChartSkeleton rows={4} theme="light" />
            </>
          )}
          <TableSkeleton rows={7} columns={8} theme="light" />
        </div>
      )}

      {/* Main Report Table Container */}
      {!isStandaloneModule && !loading && (
      <div className="sap-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#e8e8e8] flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#ffffff]">
          <div className="flex items-center gap-2.5">
            <h3 className="text-xs font-semibold text-[#333333]">
              {reportDefinitions.find(r => r.id === activeReport)?.title}
            </h3>
            {reportMeta && (
              <span className="text-[11px] text-[#666666] font-mono">
                ({toPersianDigits(reportMeta.totalRecordsCount)} سطر)
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-[#666666]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#666666] absolute right-2.5 top-1.5 pointer-events-none" />
              <input
                type="text"
                value={tableSearchQuery}
                onChange={e => setTableSearchQuery(e.target.value)}
                placeholder="فیلتر سریع در سطرهای جدول..."
                className="bg-[#f7f7f7] border border-[#bfbfbf] rounded pr-8 pl-2.5 py-1 text-[11px] text-[#333333] placeholder-[#666666] focus:outline-none focus:bg-white focus:border-[#007cc0] w-48 sm:w-56"
              />
            </div>
            <span className="flex items-center gap-1">
              <span className="text-[#107e3e]">●</span> مقادیر قطعی
            </span>
            <span className="text-[#d9d9d9]">·</span>
            <span className="flex items-center gap-1">
              <span className="text-[#e9730c]">▲</span> مقادیر تخمینی
            </span>
            {reportMeta && (
              <>
                <span className="text-[#d9d9d9]">·</span>
                <span className="text-[#666666] font-mono text-[10px]">
                  {formatToJalali(reportMeta.generatedAt)}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          {/* 1. Plan vs Actual */}
          {activeReport === 'plan_vs_actual' && (
            <table className="w-full text-right text-xs sap-table-compact">
              <thead className="bg-[#f7f7f7] text-[#333333] border-b border-[#d9d9d9] font-semibold">
                <tr>
                  <th className="py-2 px-3">شماره برنامه و نسخه</th>
                  <th className="py-2 px-3">کد و نام قطعه</th>
                  <th className="py-2 px-3 text-center">تیراژ مصوب</th>
                  <th className="py-2 px-3 text-center text-[#107e3e]">تولید واقعی سالم</th>
                  <th className="py-2 px-3 text-center text-[#bb0000]">ضایعات</th>
                  <th className="py-2 px-3 text-center font-bold">درصد تحقق</th>
                  <th className="py-2 px-3 text-center">انحراف</th>
                  <th className="py-2 px-3 text-center">نوع داده</th>
                  <th className="py-2 px-3 text-center">موعد تحویل</th>
                  <th className="py-2 px-3 text-center">جزئیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8e8] font-mono text-[#333333]">
                {filterRows(planVsActualData).map(r => (
                  <tr
                    key={r.planId}
                    onClick={() =>
                      setDrillDownItem({
                        title: `سند برنامه تولید: ${r.planNumber} (${r.planVersion})`,
                        subtitle: `${r.partName} - موعد تحویل: ${formatToJalali(r.targetDueDate)}`,
                        badge: { text: r.status, color: 'bg-amber-100 text-amber-800' },
                        fields: [
                          { label: 'کد قطعه', value: r.partCode, isMono: true },
                          { label: 'تیراژ مصوب برنامه', value: r.plannedQuantity, isHighlight: true },
                          { label: 'تولید واقعی تایید شده', value: r.actualProducedQuantity, isHighlight: true },
                          { label: 'تعداد ضایعات ثبت شده', value: r.actualScrapQuantity },
                          { label: 'درصد تحقق برنامه', value: `${r.achievementRatePercent}%` },
                          { label: 'انحراف از برنامه', value: r.varianceQuantity },
                        ],
                        detailsList: [
                          {
                            title: 'دستور کارهای مرتبط (Manufacturing Orders):',
                            lines: r.linkedMoNumbers.map(m => ({ label: 'شماره MO', value: m })),
                          },
                        ],
                      })
                    }
                    className="hover:bg-[#e5f3fa] cursor-pointer transition"
                  >
                    <td className="py-1.5 px-3">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          traceDocument(r.planNumber, 'WIP_TRACEABILITY');
                        }}
                        className="sap-doc-link font-bold"
                      >
                        {r.planNumber}
                      </button>{' '}
                      <span className="text-[10px] text-[#e9730c] bg-[#fff5eb] border border-[#f5d0a9] px-1.5 py-0.5 rounded font-semibold">
                        {r.planVersion}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 font-sans">
                      <div className="font-semibold text-[#333333]">{r.partName}</div>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          traceDocument(r.partCode, 'INVENTORY_LEDGER');
                        }}
                        className="sap-doc-link text-[11px] font-mono"
                      >
                        {r.partCode}
                      </button>
                    </td>
                    <td className="py-1.5 px-3 text-center font-bold text-[#333333]">
                      {formatNumber(r.plannedQuantity)}
                    </td>
                    <td className="py-1.5 px-3 text-center font-bold text-[#107e3e]">
                      {formatNumber(r.actualProducedQuantity)}
                    </td>
                    <td className="py-1.5 px-3 text-center text-[#bb0000] font-semibold">
                      {formatNumber(r.actualScrapQuantity)}
                    </td>
                    <td className="py-1.5 px-3 text-center font-bold text-[#333333]">
                      {toPersianDigits(r.achievementRatePercent)}%
                    </td>
                    <td
                      className={`py-1.5 px-3 text-center font-bold ${
                        r.varianceQuantity < 0 ? 'text-[#bb0000]' : 'text-[#107e3e]'
                      }`}
                    >
                      {formatNumber(r.varianceQuantity)}
                    </td>
                    <td className="py-1.5 px-3 text-center font-sans">
                      {r.isEstimate ? (
                        <span className="text-[10px] text-[#e9730c] bg-[#fff5eb] border border-[#f5d0a9] px-1.5 py-0.5 rounded font-semibold">
                          ▲ برآوردی
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#107e3e] bg-[#eef8f2] border border-[#b7e1c9] px-1.5 py-0.5 rounded font-semibold">
                          ● قطعی واقعی
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-center font-sans text-[11px] text-[#666666]">
                      {formatToJalali(r.targetDueDate)}
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      <Eye className="w-4 h-4 text-[#007cc0] mx-auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 2. Customer Order Fulfillment */}
          {activeReport === 'fulfillment' && (
            <table className="w-full text-right text-xs sap-table-compact">
              <thead className="bg-[#f7f7f7] text-[#333333] border-b border-[#d9d9d9] font-semibold">
                <tr>
                  <th className="py-2 px-3">شماره سفارش و قرارداد</th>
                  <th className="py-2 px-3">مشتری</th>
                  <th className="py-2 px-3">قطعه</th>
                  <th className="py-2 px-3 text-center">تعهد سفارش</th>
                  <th className="py-2 px-3 text-center text-[#107e3e]">تحویل شده</th>
                  <th className="py-2 px-3 text-center text-[#e9730c]">باقیمانده</th>
                  <th className="py-2 px-3 text-center font-bold">درصد تحقق</th>
                  <th className="py-2 px-3 text-center">موعد تحویل</th>
                  <th className="py-2 px-3 text-center">وضعیت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8e8] font-mono text-[#333333]">
                {filterRows(fulfillmentData).map(r => (
                  <tr key={r.orderLineId} className="hover:bg-[#e5f3fa] transition">
                    <td className="py-1.5 px-3">
                      <button
                        type="button"
                        onClick={() => traceDocument(r.orderNumber, 'WIP_TRACEABILITY')}
                        className="sap-doc-link font-bold"
                      >
                        {r.orderNumber}
                      </button>
                      <div>
                        <button
                          type="button"
                          onClick={() => traceDocument(r.contractNumber, 'CONTRACTS')}
                          className="sap-doc-link text-[11px]"
                        >
                          {r.contractNumber}
                        </button>
                      </div>
                    </td>
                    <td className="py-1.5 px-3 font-sans font-semibold text-[#333333]">{r.customerName}</td>
                    <td className="py-1.5 px-3 font-sans">
                      <div className="font-semibold text-[#333333]">{r.partName}</div>
                      <button
                        type="button"
                        onClick={() => traceDocument(r.partCode, 'INVENTORY_LEDGER')}
                        className="sap-doc-link text-[11px] font-mono"
                      >
                        {r.partCode}
                      </button>
                    </td>
                    <td className="py-1.5 px-3 text-center font-bold text-[#333333]">{formatNumber(r.orderedQuantity)}</td>
                    <td className="py-1.5 px-3 text-center text-[#107e3e] font-bold">{formatNumber(r.deliveredQuantity)}</td>
                    <td className="py-1.5 px-3 text-center text-[#e9730c] font-bold">{formatNumber(r.remainingQuantity)}</td>
                    <td className="py-1.5 px-3 text-center font-bold text-[#333333]">{toPersianDigits(r.fulfillmentPercent)}%</td>
                    <td className="py-1.5 px-3 text-center font-sans text-[11px] text-[#666666]">{formatToJalali(r.dueDate)}</td>
                    <td className="py-1.5 px-3 text-center font-sans">
                      {r.isDelayed ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#fde8e8] text-[#bb0000] border border-[#f5b7b1]">
                          {toPersianDigits(r.daysOverdue)} روز تأخیر
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#eef8f2] text-[#107e3e] border border-[#b7e1c9]">
                          مطابق برنامه
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 3. Production Backlog */}
          {activeReport === 'backlog' && (
            <table className="w-full text-right text-xs sap-table-compact">
              <thead className="bg-[#f7f7f7] text-[#333333] border-b border-[#d9d9d9] font-semibold">
                <tr>
                  <th className="py-2 px-3">شماره سفارش</th>
                  <th className="py-2 px-3">مشتری و خودرو</th>
                  <th className="py-2 px-3">قطعه</th>
                  <th className="py-2 px-3 text-center text-[#e9730c] font-bold">تعداد معوق (Backlog)</th>
                  <th className="py-2 px-3 text-center">ورق مورد نیاز (kg)</th>
                  <th className="py-2 px-3 text-center text-[#bb0000]">روزهای گذشته از موعد</th>
                  <th className="py-2 px-3 text-center">سطح فوریت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8e8] font-mono text-[#333333]">
                {filterRows(backlogData).map((r, i) => (
                  <tr key={i} className="hover:bg-[#e5f3fa] transition">
                    <td className="py-1.5 px-3 font-bold">
                      <button
                        type="button"
                        onClick={() => traceDocument(r.orderNumber, 'WIP_TRACEABILITY')}
                        className="sap-doc-link"
                      >
                        {r.orderNumber}
                      </button>
                    </td>
                    <td className="py-1.5 px-3 font-sans">
                      <div className="font-semibold text-[#333333]">{r.customerName}</div>
                      <div className="text-[11px] text-[#666666]">{r.carModel || '-'}</div>
                    </td>
                    <td className="py-1.5 px-3 font-sans">
                      <div className="font-semibold text-[#333333]">{r.partName}</div>
                      <button
                        type="button"
                        onClick={() => traceDocument(r.partCode, 'INVENTORY_LEDGER')}
                        className="sap-doc-link text-[11px] font-mono"
                      >
                        {r.partCode}
                      </button>
                    </td>
                    <td className="py-1.5 px-3 text-center font-bold text-[#e9730c] text-sm">
                      {formatNumber(r.backlogQuantity)}
                    </td>
                    <td className="py-1.5 px-3 text-center text-[#333333]">{formatNumber(r.requiredRawMaterialKg)} kg</td>
                    <td className="py-1.5 px-3 text-center text-[#bb0000] font-bold">
                      {toPersianDigits(r.daysOverdue)} روز
                    </td>
                    <td className="py-1.5 px-3 text-center font-sans">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.urgencyLevel === 'CRITICAL'
                            ? 'bg-[#fde8e8] text-[#bb0000] border border-[#f5b7b1]'
                            : 'bg-[#fff5eb] text-[#e9730c] border border-[#f5d0a9]'
                        }`}
                      >
                        {r.urgencyLevel === 'CRITICAL' ? 'بحرانی' : 'اولویت بالا'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 4. WIP by Part & Operation */}
          {activeReport === 'wip_operation' && (
            <table className="w-full text-right text-xs sap-table-compact">
              <thead className="bg-[#f7f7f7] text-[#333333] border-b border-[#d9d9d9] font-semibold">
                <tr>
                  <th className="py-2 px-3">شماره MO</th>
                  <th className="py-2 px-3">قطعه</th>
                  <th className="py-2 px-3">مرحله و فرایند</th>
                  <th className="py-2 px-3">موقعیت انبارش</th>
                  <th className="py-2 px-3 text-center">در صف ورودی</th>
                  <th className="py-2 px-3 text-center text-[#e9730c]">پای دستگاه</th>
                  <th className="py-2 px-3 text-center text-[#007cc0]">آماده انتقال</th>
                  <th className="py-2 px-3 text-center font-bold text-[#007cc0]">کل WIP فعال</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8e8] font-mono text-[#333333]">
                {filterRows(wipOpData).map((r, i) => (
                  <tr key={i} className="hover:bg-[#e5f3fa] transition">
                    <td className="py-1.5 px-3 font-bold">
                      <button
                        type="button"
                        onClick={() => traceDocument(r.moNumber, 'WIP_TRACEABILITY')}
                        className="sap-doc-link"
                      >
                        {r.moNumber}
                      </button>
                    </td>
                    <td className="py-1.5 px-3 font-sans">
                      <div className="font-semibold text-[#333333]">{r.partName}</div>
                      <button
                        type="button"
                        onClick={() => traceDocument(r.partCode, 'INVENTORY_LEDGER')}
                        className="sap-doc-link text-[11px] font-mono"
                      >
                        {r.partCode}
                      </button>
                    </td>
                    <td className="py-1.5 px-3 font-sans text-[#333333]">
                      <span className="font-bold text-[#007cc0] font-mono">OP{r.stepNumber}</span> - {r.stepName}
                      <span className="block text-[10px] text-[#666666] font-mono">{r.processType}</span>
                    </td>
                    <td className="py-1.5 px-3 text-[#666666]">{r.warehouseLocation}</td>
                    <td className="py-1.5 px-3 text-center text-[#333333]">{formatNumber(r.waitingInputQty)}</td>
                    <td className="py-1.5 px-3 text-center text-[#e9730c] font-bold">{formatNumber(r.inProgressQty)}</td>
                    <td className="py-1.5 px-3 text-center text-[#007cc0] font-bold">{formatNumber(r.readyForTransferQty)}</td>
                    <td className="py-1.5 px-3 text-center font-bold text-[#007cc0] text-sm bg-[#e5f3fa]/60">
                      {formatNumber(r.totalActiveWipQty)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 5. WIP Aging */}
          {activeReport === 'wip_aging' && (
            <table className="w-full text-right text-xs sap-table-compact">
              <thead className="bg-[#f7f7f7] text-[#333333] border-b border-[#d9d9d9] font-semibold">
                <tr>
                  <th className="py-2 px-3">شماره MO</th>
                  <th className="py-2 px-3">قطعه</th>
                  <th className="py-2 px-3">مرحله کارگاهی</th>
                  <th className="py-2 px-3">موقعیت انبارش</th>
                  <th className="py-2 px-3 text-center">موجودی در ایستگاه</th>
                  <th className="py-2 px-3 text-center text-[#e9730c]">مدت توقف (روز)</th>
                  <th className="py-2 px-3 text-center">رده سنی</th>
                  <th className="py-2 px-3 text-center">وضعیت انباشت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8e8] font-mono text-[#333333]">
                {filterRows(wipAgingData).map((r, i) => (
                  <tr key={i} className="hover:bg-[#e5f3fa] transition">
                    <td className="py-1.5 px-3 font-bold">
                      <button
                        type="button"
                        onClick={() => traceDocument(r.moNumber, 'WIP_TRACEABILITY')}
                        className="sap-doc-link"
                      >
                        {r.moNumber}
                      </button>
                    </td>
                    <td className="py-1.5 px-3 font-sans">
                      <div className="font-semibold text-[#333333]">{r.partName}</div>
                      <button
                        type="button"
                        onClick={() => traceDocument(r.partCode, 'INVENTORY_LEDGER')}
                        className="sap-doc-link text-[11px] font-mono"
                      >
                        {r.partCode}
                      </button>
                    </td>
                    <td className="py-1.5 px-3 font-sans font-medium text-[#333333]">{r.stepName}</td>
                    <td className="py-1.5 px-3 text-[#666666]">{r.warehouseLocation}</td>
                    <td className="py-1.5 px-3 text-center font-bold text-[#333333]">{formatNumber(r.quantityInStation)}</td>
                    <td className="py-1.5 px-3 text-center text-[#e9730c] font-bold text-sm">
                      {toPersianDigits(r.idleDays)} روز
                    </td>
                    <td className="py-1.5 px-3 text-center font-sans text-[11px] text-[#666666]">
                      {r.ageCategory === 'OVER_7_DAYS_STAGNANT'
                        ? 'بیش از ۷ روز (راکد)'
                        : r.ageCategory === '3_TO_7_DAYS'
                        ? '۳ تا ۷ روز'
                        : 'کمتر از ۳ روز'}
                    </td>
                    <td className="py-1.5 px-3 text-center font-sans">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.statusSeverity === 'CRITICAL'
                            ? 'bg-[#fde8e8] text-[#bb0000] border border-[#f5b7b1]'
                            : r.statusSeverity === 'ATTENTION'
                            ? 'bg-[#fff5eb] text-[#e9730c] border border-[#f5d0a9]'
                            : 'bg-[#eef8f2] text-[#107e3e] border border-[#b7e1c9]'
                        }`}
                      >
                        {r.statusSeverity === 'CRITICAL' ? 'ایستگاه بحرانی' : r.statusSeverity === 'ATTENTION' ? 'نیازمند تسریع' : 'عادی'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 6. Actual Material Consumption */}
          {activeReport === 'consumption' && (
            <>
              <div className="m-3 rounded border border-[#f5d0a9] bg-[#fff5eb] px-3 py-2 text-xs text-[#333333]">
                این گزارش فقط مقادیر ثبت‌شده در کاردکس و گزارش عملکرد واقعی تولید را نمایش می‌دهد. مقایسه با BOM تا اتصال نسخه تأییدشده BOM به مصرف واقعی غیرفعال است؛ ماشین و اپراتور نیز فقط از گزارش عملکرد ثبت‌شده خوانده می‌شوند.
              </div>
              <table className="w-full text-right text-xs sap-table-compact">
                <thead className="bg-[#f7f7f7] text-[#333333] border-b border-[#d9d9d9] font-semibold">
                  <tr>
                    <th className="py-2 px-3">دستور ساخت</th>
                    <th className="py-2 px-3">محصول</th>
                    <th className="py-2 px-3">مرحله</th>
                    <th className="py-2 px-3">ماده مصرفی</th>
                    <th className="py-2 px-3 text-center text-[#e9730c]">مصرف واقعی (kg)</th>
                    <th className="py-2 px-3 text-center">تولید سالم</th>
                    <th className="py-2 px-3 text-center text-[#bb0000]">ضایعات (عدد / kg)</th>
                    <th className="py-2 px-3">ماشین واقعی</th>
                    <th className="py-2 px-3">اپراتور</th>
                    <th className="py-2 px-3">کلاف / قرارداد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e8e8] text-[#333333]">
                  {filterRows(consumptionData).map((r, i) => (
                    <tr key={`${r.moId}-${r.operationId}-${r.materialCode}-${i}`} className="hover:bg-[#e5f3fa] transition">
                      <td className="py-1.5 px-3 font-bold font-mono">
                        <button
                          type="button"
                          onClick={() => traceDocument(r.moNumber, 'WIP_TRACEABILITY')}
                          className="sap-doc-link"
                        >
                          {r.moNumber}
                        </button>
                      </td>
                      <td className="py-1.5 px-3">
                        <div className="font-semibold text-[#333333]">{r.productPartName}</div>
                        <button
                          type="button"
                          onClick={() => traceDocument(r.productPartCode, 'INVENTORY_LEDGER')}
                          className="sap-doc-link text-[10px] font-mono"
                        >
                          {r.productPartCode}
                        </button>
                      </td>
                      <td className="py-1.5 px-3">
                        <div>{r.operationName}</div>
                        <div className="text-[10px] text-[#666666]">مرحله {formatNumber(r.operationStep)} · {r.operationCode}</div>
                      </td>
                      <td className="py-1.5 px-3">
                        <div className="font-semibold">{r.materialName}</div>
                        <div className="text-[10px] text-[#666666]">
                          <button
                            type="button"
                            onClick={() => traceDocument(r.materialCode, 'INVENTORY_LEDGER')}
                            className="sap-doc-link font-mono"
                          >
                            {r.materialCode}
                          </button>{' '}
                          · {r.materialGrade}
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-center font-bold text-[#e9730c] font-mono">{formatNumber(r.actualIssuedMaterialKg)}</td>
                      <td className="py-1.5 px-3 text-center font-mono">{formatNumber(r.actualProducedGoodQty)}</td>
                      <td className="py-1.5 px-3 text-center text-[#bb0000] font-mono">{formatNumber(r.actualScrapQty)} / {formatNumber(r.actualScrapWeightKg)} kg</td>
                      <td className="py-1.5 px-3">{r.actualMachineNames.length ? r.actualMachineNames.join('، ') : 'ثبت نشده'}</td>
                      <td className="py-1.5 px-3">{r.actualOperatorNames.length ? r.actualOperatorNames.join('، ') : 'ثبت نشده'}</td>
                      <td className="py-1.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {r.coilNumbers.length > 0 ? r.coilNumbers.map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => traceDocument(c, 'COILS')}
                              className="sap-doc-link text-[11px] font-mono"
                            >
                              {c}
                            </button>
                          )) : '—'}
                        </div>
                        <div className="text-[10px] text-[#666666] flex flex-wrap gap-1">
                          {r.contractNumbers.length > 0 ? r.contractNumbers.map(cnt => (
                            <button
                              key={cnt}
                              type="button"
                              onClick={() => traceDocument(cnt, 'CONTRACTS')}
                              className="sap-doc-link font-mono"
                            >
                              {cnt}
                            </button>
                          )) : 'بدون قرارداد'}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {consumptionData.length === 0 && (
                    <tr><td colSpan={10} className="py-8 text-center text-[#666666]">برای فیلترهای انتخاب‌شده، حواله مصرف قطعی متصل به دستور ساخت و عملیات تولید یافت نشد.</td></tr>
                  )}
                </tbody>
              </table>
            </>
          )}

          {/* 7. SAPCO Material Account */}
          {activeReport === 'sapco_account' && (
            <table className="w-full text-right text-xs sap-table-compact">
              <thead className="bg-[#f7f7f7] text-[#333333] border-b border-[#d9d9d9] font-semibold">
                <tr>
                  <th className="py-2 px-3">شماره و عنوان قرارداد ساپکو</th>
                  <th className="py-2 px-3">گرید ورق</th>
                  <th className="py-2 px-3 text-center">سهمیه مصوب</th>
                  <th className="py-2 px-3 text-center">اول دوره (kg)</th>
                  <th className="py-2 px-3 text-center text-[#107e3e]">رسید (kg)</th>
                  <th className="py-2 px-3 text-center text-[#e9730c]">مصرف خطوط (kg)</th>
                  <th className="py-2 px-3 text-center font-bold">مانده دفتری (kg)</th>
                  <th className="py-2 px-3 text-center text-[#007cc0]">موجودی فیزیکی کارخانه</th>
                  <th className="py-2 px-3 text-center">مغایرت انبار</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8e8] font-mono text-[#333333]">
                {filterRows(sapcoAccountData).map(r => (
                  <tr key={r.contractId} className="hover:bg-[#e5f3fa] transition">
                    <td className="py-1.5 px-3">
                      <button
                        type="button"
                        onClick={() => traceDocument(r.contractNumber, 'CONTRACTS')}
                        className="sap-doc-link font-bold"
                      >
                        {r.contractNumber}
                      </button>
                      <div className="text-[11px] text-[#666666] font-sans">{r.title}</div>
                    </td>
                    <td className="py-1.5 px-3 font-bold text-[#007cc0]">{r.materialGrade}</td>
                    <td className="py-1.5 px-3 text-center text-[#333333]">{formatNumber(r.allocatedQuotaKg)}</td>
                    <td className="py-1.5 px-3 text-center text-[#333333]">{formatNumber(r.openingBalanceKg)}</td>
                    <td className="py-1.5 px-3 text-center text-[#107e3e] font-semibold">{formatNumber(r.totalReceivedKg)}</td>
                    <td className="py-1.5 px-3 text-center text-[#e9730c] font-semibold">{formatNumber(r.totalIssuedKg)}</td>
                    <td className="py-1.5 px-3 text-center font-bold text-[#333333] bg-[#f7f7f7]">
                      {formatNumber(r.closingBookBalanceKg)}
                    </td>
                    <td className="py-1.5 px-3 text-center text-[#007cc0] font-bold">
                      {formatNumber(r.physicalStockInPlantKg)}
                    </td>
                    <td
                      className={`py-1.5 px-3 text-center font-bold ${
                        r.discrepancyKg === 0 ? 'text-[#107e3e]' : 'text-[#bb0000]'
                      }`}
                    >
                      {formatNumber(r.discrepancyKg)} kg
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 8. Inventory Valuation Quantities */}
          {activeReport === 'valuation_qty' && (
            <table className="w-full text-right text-xs sap-table-compact">
              <thead className="bg-[#f7f7f7] text-[#333333] border-b border-[#d9d9d9] font-semibold">
                <tr>
                  <th className="py-2 px-3">طبقه‌بندی</th>
                  <th className="py-2 px-3">کد و شرح قلم</th>
                  <th className="py-2 px-3 text-center font-bold">موجودی فیزیکی کل</th>
                  <th className="py-2 px-3 text-center text-[#107e3e]">ملکی شرکت</th>
                  <th className="py-2 px-3 text-center text-[#007cc0]">امانی ساپکو</th>
                  <th className="py-2 px-3 text-center text-[#bb0000]">مسدود کیفی</th>
                  <th className="py-2 px-3 text-center text-[#e9730c]">رزرو سفارش</th>
                  <th className="py-2 px-3 text-center font-bold text-[#007cc0]">موجودی آزاد قابل تخصیص</th>
                  <th className="py-2 px-3 text-center">وزن فیزیکی کل (kg)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8e8] font-mono text-[#333333]">
                {filterRows(valuationData).map((r, i) => (
                  <tr key={i} className="hover:bg-[#e5f3fa] transition">
                    <td className="py-1.5 px-3 font-sans">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-[#f5f5f5] text-[#333333] border border-[#d9d9d9] font-medium">
                        {r.category === 'FINISHED_GOODS'
                          ? 'محصول نهایی'
                          : r.category === 'WIP_PARTS'
                          ? 'کار در جریان'
                          : 'ورق خام'}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 font-sans">
                      <div className="font-semibold text-[#333333]">{r.description}</div>
                      <button
                        type="button"
                        onClick={() => traceDocument(r.partOrMaterialCode, 'INVENTORY_LEDGER')}
                        className="sap-doc-link text-[11px] font-mono"
                      >
                        {r.partOrMaterialCode}
                      </button>
                    </td>
                    <td className="py-1.5 px-3 text-center font-bold text-[#333333]">
                      {formatNumber(r.physicalQuantity)} {r.unit}
                    </td>
                    <td className="py-1.5 px-3 text-center text-[#107e3e] font-semibold">{formatNumber(r.companyOwnedQuantity)}</td>
                    <td className="py-1.5 px-3 text-center text-[#007cc0] font-semibold">{formatNumber(r.sapcoConsignmentQuantity)}</td>
                    <td className="py-1.5 px-3 text-center text-[#bb0000]">{formatNumber(r.qualityBlockedQuantity)}</td>
                    <td className="py-1.5 px-3 text-center text-[#e9730c]">{formatNumber(r.reservedQuantity)}</td>
                    <td className="py-1.5 px-3 text-center font-bold text-[#007cc0] text-sm bg-[#e5f3fa]/60">
                      {formatNumber(r.availableFreeQuantity)}
                    </td>
                    <td className="py-1.5 px-3 text-center text-[#666666]">{formatNumber(r.totalPhysicalWeightKg)} kg</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 9. Scrap by Part & Operation */}
          {activeReport === 'scrap_analysis' && (
            <table className="w-full text-right text-xs sap-table-compact">
              <thead className="bg-[#f7f7f7] text-[#333333] border-b border-[#d9d9d9] font-semibold">
                <tr>
                  <th className="py-2 px-3">قطعه</th>
                  <th className="py-2 px-3">مرحله و فرایند</th>
                  <th className="py-2 px-3">دستگاه پرس</th>
                  <th className="py-2 px-3 text-center">کل قطعات ورودی</th>
                  <th className="py-2 px-3 text-center text-[#bb0000] font-bold">ضایعات (عدد)</th>
                  <th className="py-2 px-3 text-center text-[#bb0000]">وزن ضایعات (kg)</th>
                  <th className="py-2 px-3 text-center">نرم مجاز</th>
                  <th className="py-2 px-3 text-center font-bold">درصد واقعی ضایعات</th>
                  <th className="py-2 px-3">نقص شایع و علت ریشه‌ای</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8e8] font-mono text-[#333333]">
                {filterRows(scrapData).map((r, i) => (
                  <tr key={i} className="hover:bg-[#e5f3fa] transition">
                    <td className="py-1.5 px-3 font-sans">
                      <div className="font-semibold text-[#333333]">{r.partName}</div>
                      <button
                        type="button"
                        onClick={() => traceDocument(r.partCode, 'INVENTORY_LEDGER')}
                        className="sap-doc-link text-[11px] font-mono"
                      >
                        {r.partCode}
                      </button>
                    </td>
                    <td className="py-1.5 px-3 font-sans text-[#333333]">
                      <span className="font-bold text-[#007cc0] font-mono">OP{r.stepNumber}</span> - {r.stepName}
                      <span className="block text-[10px] text-[#666666] font-mono">{r.processType}</span>
                    </td>
                    <td className="py-1.5 px-3 font-sans text-[#666666]">{r.machineName || r.machineCode || '-'}</td>
                    <td className="py-1.5 px-3 text-center text-[#333333]">{formatNumber(r.totalInputQty)}</td>
                    <td className="py-1.5 px-3 text-center text-[#bb0000] font-bold">{formatNumber(r.scrapPieces)}</td>
                    <td className="py-1.5 px-3 text-center text-[#bb0000]">{formatNumber(r.scrapWeightKg)} kg</td>
                    <td className="py-1.5 px-3 text-center text-[#666666]">{toPersianDigits(r.scrapNormPercent)}%</td>
                    <td
                      className={`py-1.5 px-3 text-center font-bold text-sm ${
                        r.isAboveNorm ? 'text-[#bb0000]' : 'text-[#107e3e]'
                      }`}
                    >
                      {toPersianDigits(r.actualScrapPercent)}%
                    </td>
                    <td className="py-1.5 px-3 font-sans text-[#666666] text-[11px]">{r.commonScrapDefectType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 10. Machine Workload & Capacity */}
          {activeReport === 'machine_workload' && (
            <table className="w-full text-right text-xs sap-table-compact">
              <thead className="bg-[#f7f7f7] text-[#333333] border-b border-[#d9d9d9] font-semibold">
                <tr>
                  <th className="py-2 px-3">کد و نام ماشین</th>
                  <th className="py-2 px-3">سالن و فرایند</th>
                  <th className="py-2 px-3 text-center">تناژ اسمی</th>
                  <th className="py-2 px-3 text-center">ظرفیت شیفت (ساعت)</th>
                  <th className="py-2 px-3 text-center text-[#e9730c]">ساعت کار برنامه‌ریزی‌شده</th>
                  <th className="py-2 px-3 text-center text-[#107e3e]">ظرفیت آزاد</th>
                  <th className="py-2 px-3 text-center font-bold">درصد بهره‌وری</th>
                  <th className="py-2 px-3 text-center">وضعیت دستگاه</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8e8] font-mono text-[#333333]">
                {filterRows(machineData).map(r => (
                  <tr key={r.machineId} className="hover:bg-[#e5f3fa] transition">
                    <td className="py-1.5 px-3 font-sans">
                      <div className="font-semibold text-[#333333]">{r.machineName}</div>
                      <div className="text-[11px] text-[#666666] font-mono">{r.machineCode}</div>
                    </td>
                    <td className="py-1.5 px-3 font-sans text-[#666666]">
                      {r.hall} • <span className="font-mono">{r.processType}</span>
                    </td>
                    <td className="py-1.5 px-3 text-center text-[#333333]">{r.tonnage ? `${formatNumber(r.tonnage)} T` : '-'}</td>
                    <td className="py-1.5 px-3 text-center text-[#333333]">{toPersianDigits(r.nominalDailyCapacityHours)}h</td>
                    <td className="py-1.5 px-3 text-center text-[#e9730c] font-bold">{toPersianDigits(r.scheduledWorkloadHours)}h</td>
                    <td className="py-1.5 px-3 text-center text-[#107e3e] font-bold">{toPersianDigits(r.availableCapacityHours)}h</td>
                    <td className="py-1.5 px-3 text-center font-bold text-[#333333] text-sm">
                      {toPersianDigits(r.utilizationRatePercent)}%
                    </td>
                    <td className="py-1.5 px-3 text-center font-sans">
                      {r.machineStatus === 'MAINTENANCE' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#fde8e8] text-[#bb0000] border border-[#f5b7b1]">
                          تعمیرات اضطراری
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#eef8f2] text-[#107e3e] border border-[#b7e1c9]">
                          آماده‌به‌کار
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 11. Production Delays (Comprehensive Analytical Delay Audit) */}
          {activeReport === 'delays' && (
            <div className="space-y-4 p-4">
              {/* Analytic KPI Cards */}
              {delayAnalytics && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="bg-[#f7f7f7] border border-[#d9d9d9] rounded p-3 text-right">
                    <span className="text-[11px] text-[#666666] block font-sans">میانگین روزهای تأخیر</span>
                    <div className="text-xl font-bold text-[#bb0000] font-mono mt-1">
                      {toPersianDigits(delayAnalytics.averageDelayDays)} <span className="text-xs font-sans font-normal text-[#666666]">روز</span>
                    </div>
                    <span className="text-[10px] text-[#666666] mt-1 block">از سررسید تعهدات</span>
                  </div>

                  <div className="bg-[#f7f7f7] border border-[#d9d9d9] rounded p-3 text-right">
                    <span className="text-[11px] text-[#107e3e] block font-sans">نرخ تحویل به‌موقع (OTIF)</span>
                    <div className="text-xl font-bold text-[#107e3e] font-mono mt-1">
                      {delayAnalytics.onTimeDeliveryRatePercent === null ? 'ثبت نشده' : `${toPersianDigits(delayAnalytics.onTimeDeliveryRatePercent)}٪`}
                    </div>
                    <span className="text-[10px] text-[#666666] mt-1 block">شاخص کیفی ساپکو</span>
                  </div>

                  <div className="bg-[#f7f7f7] border border-[#d9d9d9] rounded p-3 text-right">
                    <span className="text-[11px] text-[#666666] block font-sans">کل موارد دارای تأخیر</span>
                    <div className="text-xl font-bold text-[#333333] font-mono mt-1">
                      {toPersianDigits(delayAnalytics.totalDelayedItemsCount)}
                    </div>
                    <span className="text-[10px] text-[#666666] mt-1 block">سفارش، MO و عملیات</span>
                  </div>

                  <div className="bg-[#f7f7f7] border border-[#d9d9d9] rounded p-3 text-right">
                    <span className="text-[11px] text-[#bb0000] block font-sans">بیشترین روز تأخیر</span>
                    <div className="text-xl font-bold text-[#bb0000] font-mono mt-1">
                      {toPersianDigits(delayAnalytics.maxDelayDays)} <span className="text-xs font-sans font-normal text-[#666666]">روز</span>
                    </div>
                    <span className="text-[10px] text-[#bb0000] mt-1 block">اقلام با دیرکرد بالا</span>
                  </div>

                  <div className="bg-[#f7f7f7] border border-[#d9d9d9] rounded p-3 text-right">
                    <span className="text-[11px] text-[#e9730c] block font-sans">فوریت بحرانی</span>
                    <div className="text-xl font-bold text-[#e9730c] font-mono mt-1">
                      {toPersianDigits(delayAnalytics.criticalUrgencyCount)} <span className="text-xs font-sans font-normal text-[#666666]">مورد</span>
                    </div>
                    <span className="text-[10px] text-[#666666] mt-1 block">ریسک توقف خط مشتری</span>
                  </div>

                  <div className="bg-[#f7f7f7] border border-[#d9d9d9] rounded p-3 text-right">
                    <span className="text-[11px] text-[#666666] block font-sans">برآورد ریسک جریمه ساپکو</span>
                    <div className="text-lg font-bold text-[#bb0000] font-mono mt-1">
                      {delayAnalytics.estimatedPenaltyRiskRials === null ? 'ثبت نشده' : formatNumber(Math.round(Number(delayAnalytics.estimatedPenaltyRiskRials) / 1000000))} <span className="text-[11px] font-sans font-normal text-[#666666]">م.ریال</span>
                    </div>
                    <span className="text-[10px] text-[#bb0000] mt-1 block">جریمه تأخیر قرارداد</span>
                  </div>
                </div>
              )}

              {/* Root Cause Distribution Bars */}
              {delayAnalytics && (
                <div className="bg-[#f7f7f7] border border-[#d9d9d9] rounded p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#333333] font-sans flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#bb0000]"></span>
                      تفکیک سهم علل ریشه‌ای تأخیرات (Root Cause Breakdown) — روی هر علت جهت فیلتر جدول کلیک کنید:
                    </span>
                    {delayCauseFilter !== 'ALL' && (
                      <button
                        onClick={() => setDelayCauseFilter('ALL')}
                        className="text-[11px] text-[#007cc0] hover:text-[#006299] font-sans cursor-pointer underline"
                      >
                        حذف فیلتر علت
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                    {delayAnalytics.causesBreakdown.map(cause => {
                      const isSelected = delayCauseFilter === cause.causeKey;
                      return (
                        <button
                          key={cause.causeKey}
                          onClick={() => setDelayCauseFilter(isSelected ? 'ALL' : cause.causeKey)}
                          className={`p-2.5 rounded border text-right transition cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? 'bg-[#e5f3fa] border-[#007cc0]'
                              : 'bg-white border-[#d9d9d9] hover:bg-[#f5f5f5]'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="text-[11px] font-semibold text-[#333333]">{cause.causeLabelFa}</span>
                            <span className="text-xs font-mono font-bold text-[#bb0000]">
                              {toPersianDigits(cause.percentage)}٪
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[10px] text-[#666666] font-mono">
                            <span>{toPersianDigits(cause.itemsCount)} ردیف</span>
                            <span>{formatNumber(cause.totalDelayedPieces)} عدد</span>
                          </div>
                          <div className="w-full bg-[#e8e8e8] h-1 rounded-full mt-1.5 overflow-hidden">
                            <div
                              className="bg-[#007cc0] h-full rounded-full transition-all"
                              style={{ width: `${cause.percentage}%` }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Section Filters */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <span className="text-[#666666] font-sans ml-1 text-[11px]">فیلتر بخش:</span>
                {[
                  { id: 'ALL', label: 'همه بخش‌ها' },
                  { id: 'CUSTOMER_ORDER', label: 'ردیف سفارشات باز معوق' },
                  { id: 'OPEN_MO', label: 'دستور کارهای باز عقب‌افتاده' },
                  { id: 'COMPLETED_LATE_MO', label: 'تکمیل‌شده با تأخیر (سوابق)' },
                  { id: 'LATE_OPERATION', label: 'عملیات و ایستگاه‌های اجرایی' },
                ].map(sec => (
                  <button
                    key={sec.id}
                    onClick={() => setDelaySectionFilter(sec.id as any)}
                    className={`px-3 py-1 rounded font-medium transition cursor-pointer border ${
                      delaySectionFilter === sec.id
                        ? 'bg-[#007cc0] text-white border-[#007cc0] font-semibold'
                        : 'bg-white text-[#333333] hover:bg-[#f5f5f5] border-[#d9d9d9]'
                    }`}
                  >
                    {sec.label}
                  </button>
                ))}
              </div>

              {/* Table */}
              <div className="rounded border border-[#d9d9d9] overflow-hidden bg-white">
                <table className="w-full text-right text-xs sap-table-compact">
                  <thead className="bg-[#f7f7f7] text-[#333333] border-b border-[#d9d9d9] font-mono text-[11px] font-semibold">
                    <tr>
                      <th className="py-2 px-3">بخش و شماره مرجع</th>
                      <th className="py-2 px-3">طرف حساب / ایستگاه</th>
                      <th className="py-2 px-3">کد و نام قطعه خودرویی</th>
                      <th className="py-2 px-3 text-center text-[#333333]">تیراژ معوق</th>
                      <th className="py-2 px-3 text-center">موعد مصوب</th>
                      <th className="py-2 px-3 text-center text-[#e9730c]">تکمیل (تخمینی / واقعی)</th>
                      <th className="py-2 px-3 text-center text-[#bb0000] font-bold">روزهای تأخیر</th>
                      <th className="py-2 px-3">علت ریشه‌ای تأخیر</th>
                      <th className="py-2 px-3 text-center">سطح فوریت</th>
                      <th className="py-2 px-3 text-center">بررسی</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e8e8] font-mono text-[#333333]">
                    {delaysData
                      .filter(r => {
                        if (delaySectionFilter !== 'ALL' && r.section !== delaySectionFilter) return false;
                        if (delayCauseFilter !== 'ALL' && r.primaryDelayCause !== delayCauseFilter) return false;
                        return true;
                      })
                      .map((r, i) => (
                        <tr key={i} className="hover:bg-[#e5f3fa] transition">
                          <td className="py-1.5 px-3 font-sans">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold block w-fit mb-1 ${
                              r.section === 'CUSTOMER_ORDER'
                                ? 'bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2]'
                                : r.section === 'OPEN_MO'
                                ? 'bg-[#fff5eb] text-[#e9730c] border border-[#f5d0a9]'
                                : r.section === 'COMPLETED_LATE_MO'
                                ? 'bg-[#f5f5f5] text-[#666666] border border-[#d9d9d9]'
                                : 'bg-[#eef8f2] text-[#107e3e] border border-[#b7e1c9]'
                            }`}>
                              {r.sectionLabelFa}
                            </span>
                            <button
                              type="button"
                              onClick={() => traceDocument(r.referenceNumber, 'WIP_TRACEABILITY')}
                              className="sap-doc-link font-bold font-mono"
                            >
                              {r.referenceNumber}
                            </button>
                          </td>
                          <td className="py-1.5 px-3 font-sans text-[#333333]">
                            <div className="font-semibold">{r.customerOrPlan}</div>
                            {r.operationName && (
                              <div className="text-[10px] text-[#666666]">{r.operationName}</div>
                            )}
                          </td>
                          <td className="py-1.5 px-3 font-sans">
                            <div className="font-semibold text-[#333333]">{r.partName}</div>
                            <button
                              type="button"
                              onClick={() => traceDocument(r.partCode, 'INVENTORY_LEDGER')}
                              className="sap-doc-link text-[11px] font-mono"
                            >
                              {r.partCode}
                            </button>
                          </td>
                          <td className="py-1.5 px-3 text-center font-bold text-sm text-[#333333]">
                            {formatNumber(r.quantity)}
                          </td>
                          <td className="py-1.5 px-3 text-center font-sans text-[11px] text-[#666666]">
                            {formatToJalali(r.plannedDueDate)}
                          </td>
                          <td className="py-1.5 px-3 text-center font-sans text-[11px] text-[#e9730c] font-bold">
                            {r.estimatedCompletionDate ? formatToJalali(r.estimatedCompletionDate) : 'ثبت نشده'}
                          </td>
                          <td className="py-1.5 px-3 text-center font-bold text-sm">
                            <span className="px-2 py-0.5 rounded bg-[#fde8e8] text-[#bb0000] border border-[#f5b7b1]">
                              {toPersianDigits(r.delayDays)} روز
                            </span>
                          </td>
                          <td className="py-1.5 px-3 font-sans">
                            <span className="font-bold text-[#333333] block text-[11px]">
                              {r.primaryDelayCause === 'RAW_MATERIAL_SHORTAGE' && 'کسری کلاف ساپکو'}
                              {r.primaryDelayCause === 'MACHINE_BREAKDOWN' && 'خرابی پرس و قالب'}
                              {r.primaryDelayCause === 'WIP_BOTTLENECK' && 'گلوگاه کار در جریان'}
                              {r.primaryDelayCause === 'CAPACITY_OVERLOAD' && 'بیش‌بار ظرفیت تناژ'}
                              {r.primaryDelayCause === 'QUALITY_HOLD' && 'توقف کیفی ابعادی'}
                              {r.primaryDelayCause === 'UNASSESSED' && 'علت بررسی‌نشده'}
                            </span>
                            <span className="text-[10px] text-[#666666] block mt-0.5 line-clamp-1" title={r.delayDescription}>
                              {r.delayDescription}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-center font-sans">
                            {r.urgencyLevel === 'CRITICAL' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#fde8e8] text-[#bb0000] border border-[#f5b7b1]">
                                بحرانی
                              </span>
                            )}
                            {r.urgencyLevel === 'HIGH' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#fff5eb] text-[#e9730c] border border-[#f5d0a9]">
                                بالا
                              </span>
                            )}
                            {r.urgencyLevel === 'MEDIUM' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#f5f5f5] text-[#666666] border border-[#d9d9d9]">
                                متوسط
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-center">
                            <button
                              onClick={() => {
                                setDrillDownItem({
                                  title: `علت‌یابی تأخیر: ${r.referenceNumber}`,
                                  subtitle: r.partName,
                                  badge: {
                                    text: r.urgencyLevel === 'CRITICAL' ? 'بحرانی' : 'عادی',
                                    color: r.urgencyLevel === 'CRITICAL' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700',
                                  },
                                  fields: [
                                    { label: 'شماره سند', value: r.referenceNumber, isMono: true },
                                    { label: 'بخش', value: r.sectionLabelFa },
                                    { label: 'کد و نام قطعه', value: `${r.partCode} — ${r.partName}` },
                                    { label: 'تیراژ معوق', value: `${formatNumber(r.quantity)} عدد`, isMono: true, isHighlight: true },
                                    { label: 'موعد مصوب', value: formatToJalali(r.plannedDueDate) },
                                    { label: 'روزهای تأخیر', value: `${toPersianDigits(r.delayDays)} روز`, isHighlight: true },
                                    { label: 'علت ریشه‌ای', value: r.delayDescription },
                                    { label: 'ریسک تخمینی جریمه', value: r.delayPenaltyRiskRials === undefined ? 'ثبت نشده' : `${formatNumber(r.delayPenaltyRiskRials)} ریال` },
                                    { label: 'سطح فوریت', value: r.urgencyLevel },
                                  ],
                                });
                              }}
                              className="sap-btn-standard px-2.5 py-1 text-[10px] font-sans cursor-pointer"
                            >
                              جزئیات
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 12. Inventory Movements */}
          {activeReport === 'movements' && (
            <table className="w-full text-right text-xs sap-table-compact">
              <thead className="bg-[#f7f7f7] text-[#333333] border-b border-[#d9d9d9] font-semibold">
                <tr>
                  <th className="py-2 px-3">شماره سند</th>
                  <th className="py-2 px-3">تاریخ سند</th>
                  <th className="py-2 px-3">نوع سند</th>
                  <th className="py-2 px-3">قطعه / متریال</th>
                  <th className="py-2 px-3 text-center">مقدار</th>
                  <th className="py-2 px-3 text-center">مبدأ → مقصد</th>
                  <th className="py-2 px-3 text-center">مالکیت</th>
                  <th className="py-2 px-3 text-center">کاربر ثبت‌کننده</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8e8] font-mono text-[#333333]">
                {filterRows(movementsData).map(r => (
                  <tr key={r.transactionId} className="hover:bg-[#e5f3fa] transition">
                    <td className="py-1.5 px-3 font-bold">
                      <button
                        type="button"
                        onClick={() => traceDocument(r.documentNumber, 'INVENTORY_LEDGER')}
                        className="sap-doc-link"
                      >
                        {r.documentNumber}
                      </button>
                    </td>
                    <td className="py-1.5 px-3 font-sans text-[11px] text-[#666666]">{formatToJalali(r.transactionDate)}</td>
                    <td className="py-1.5 px-3 font-sans">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-[#f5f5f5] text-[#333333] border border-[#d9d9d9] font-medium">
                        {r.documentType}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 font-sans">
                      <div className="font-semibold text-[#333333]">{r.partName}</div>
                      <button
                        type="button"
                        onClick={() => traceDocument(r.partCode, 'INVENTORY_LEDGER')}
                        className="sap-doc-link text-[11px] font-mono"
                      >
                        {r.partCode}
                      </button>
                    </td>
                    <td className="py-1.5 px-3 text-center font-bold text-[#333333]">
                      {formatNumber(r.quantity)} {r.unit}
                    </td>
                    <td className="py-1.5 px-3 text-center font-sans text-[11px] text-[#666666]">
                      {r.sourceLocation} → {r.targetLocation}
                    </td>
                    <td className="py-1.5 px-3 text-center font-sans text-[11px] text-[#333333]">{r.ownership}</td>
                    <td className="py-1.5 px-3 text-center font-sans text-[11px] text-[#666666]">{r.operatorOrUser}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 13. Inventory Reconciliation */}
          {activeReport === 'reconciliation' && (
            <table className="w-full text-right text-xs sap-table-compact">
              <thead className="bg-[#f7f7f7] text-[#333333] border-b border-[#d9d9d9] font-semibold">
                <tr>
                  <th className="py-2 px-3">کد و انبار</th>
                  <th className="py-2 px-3">قلم کالایی</th>
                  <th className="py-2 px-3 text-center">موجودی دفتری سیستم</th>
                  <th className="py-2 px-3 text-center text-[#107e3e] font-bold">شمارش عینی انبارگردانی</th>
                  <th className="py-2 px-3 text-center">مغایرت</th>
                  <th className="py-2 px-3 text-center">وضعیت موازنه</th>
                  <th className="py-2 px-3 text-center">تاریخ ممیزی</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8e8] font-mono text-[#333333]">
                {filterRows(reconciliationData).map((r, i) => (
                  <tr key={i} className="hover:bg-[#e5f3fa] transition">
                    <td className="py-1.5 px-3 font-sans">
                      <div className="font-semibold text-[#333333]">{r.warehouseName}</div>
                      <div className="text-[11px] text-[#666666] font-mono">{r.locationCode}</div>
                    </td>
                    <td className="py-1.5 px-3 font-sans">
                      <div className="font-semibold text-[#333333]">{r.partName}</div>
                      <button
                        type="button"
                        onClick={() => traceDocument(r.partCode, 'INVENTORY_LEDGER')}
                        className="sap-doc-link text-[11px] font-mono"
                      >
                        {r.partCode}
                      </button>
                    </td>
                    <td className="py-1.5 px-3 text-center font-bold text-[#333333]">{formatNumber(r.bookQuantity)}</td>
                    <td className="py-1.5 px-3 text-center font-bold text-[#107e3e]">{formatNumber(r.physicalCountQuantity)}</td>
                    <td className="py-1.5 px-3 text-center font-bold text-[#107e3e]">{formatNumber(r.varianceQuantity)}</td>
                    <td className="py-1.5 px-3 text-center font-sans">
                      <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-[#eef8f2] text-[#107e3e] border border-[#b7e1c9]">
                        موازنه کامل (بدون مغایرت)
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-center font-sans text-[11px] text-[#666666]">
                      {formatToJalali(r.lastReconciledAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 14. Coil Inventory */}
          {activeReport === 'coil_inventory' && (
            <table className="w-full text-right text-xs sap-table-compact">
              <thead className="bg-[#f7f7f7] text-[#333333] border-b border-[#d9d9d9] font-semibold">
                <tr>
                  <th className="py-2 px-3">شماره کویل</th>
                  <th className="py-2 px-3">مشخصات متریال (گرید و ضخامت)</th>
                  <th className="py-2 px-3 text-center">ابعاد (mm)</th>
                  <th className="py-2 px-3 text-center">وزن دریافتی (kg)</th>
                  <th className="py-2 px-3 text-center text-[#e9730c]">مصرف شده (kg)</th>
                  <th className="py-2 px-3 text-center text-[#107e3e] font-bold">مانده موجودی (kg)</th>
                  <th className="py-2 px-3 text-center">مالکیت</th>
                  <th className="py-2 px-3 text-center">وضعیت رول</th>
                  <th className="py-2 px-3 text-center">موقعیت انبار</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8e8] font-mono text-[#333333]">
                {filterRows(coilInventoryData).map((r, i) => (
                  <tr key={i} className="hover:bg-[#e5f3fa] transition">
                    <td className="py-1.5 px-3 font-bold font-mono">
                      <div>
                        <button
                          type="button"
                          onClick={() => traceDocument(r.coilNumber, 'COILS')}
                          className="sap-doc-link"
                        >
                          {r.coilNumber}
                        </button>
                      </div>
                      <div className="text-[10px] text-[#666666] font-sans">
                        ذوب:{' '}
                        <button
                          type="button"
                          onClick={() => traceDocument(r.heatNumber, 'WIP_TRACEABILITY')}
                          className="sap-doc-link font-mono"
                        >
                          {r.heatNumber}
                        </button>
                      </div>
                    </td>
                    <td className="py-1.5 px-3 font-sans">
                      <div className="font-semibold text-[#333333]">{r.materialGrade}</div>
                      <div className="text-[10px] text-[#666666] font-mono">
                        قرارداد:{' '}
                        <button
                          type="button"
                          onClick={() => traceDocument(r.contractNumber, 'CONTRACTS')}
                          className="sap-doc-link"
                        >
                          {r.contractNumber}
                        </button>
                      </div>
                    </td>
                    <td className="py-1.5 px-3 text-center text-[#333333] font-mono">
                      {r.thicknessMm} × {r.widthMm}
                    </td>
                    <td className="py-1.5 px-3 text-center text-[#333333]">{formatNumber(r.receivedWeightKg)}</td>
                    <td className="py-1.5 px-3 text-center text-[#e9730c] font-semibold">{formatNumber(r.consumedWeightKg)}</td>
                    <td className="py-1.5 px-3 text-center font-bold text-[#107e3e]">{formatNumber(r.remainingWeightKg)}</td>
                    <td className="py-1.5 px-3 text-center font-sans">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${r.ownership === 'SAPCO_CONSIGNMENT' ? 'bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2]' : 'bg-[#f5f5f5] text-[#333333] border border-[#d9d9d9]'}`}>
                        {r.ownership === 'SAPCO_CONSIGNMENT' ? 'امانی ساپکو' : 'ملکی'}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-center font-sans">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        r.status === 'FULL'
                          ? 'bg-[#eef8f2] text-[#107e3e] border border-[#b7e1c9]'
                          : r.status === 'PARTIAL'
                          ? 'bg-[#fff5eb] text-[#e9730c] border border-[#f5d0a9]'
                          : 'bg-[#f5f5f5] text-[#666666] border border-[#d9d9d9]'
                      }`}>
                        {r.status === 'FULL' ? 'سالم (کامل)' : r.status === 'PARTIAL' ? 'بازشده (ناقص)' : 'مصرف‌شده'}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-center font-sans text-[#666666] text-[11px]">{r.warehouseLocation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 15. Lot Consumption */}
          {activeReport === 'lot_consumption' && (
            <table className="w-full text-right text-xs sap-table-compact">
              <thead className="bg-[#f7f7f7] text-[#333333] border-b border-[#d9d9d9] font-semibold">
                <tr>
                  <th className="py-2 px-3">سند و تاریخ حواله</th>
                  <th className="py-2 px-3">شناسه کویل / ذوب</th>
                  <th className="py-2 px-3">جنس و ضخامت</th>
                  <th className="py-2 px-3 text-center">مصرف (kg)</th>
                  <th className="py-2 px-3 text-center">دستور کار (MO)</th>
                  <th className="py-2 px-3">قطعه خروجی</th>
                  <th className="py-2 px-3 text-center">تیراژ تولیدی</th>
                  <th className="py-2 px-3 text-center text-[#bb0000]">ضایعات پرسی</th>
                  <th className="py-2 px-3 text-center">اپراتور</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8e8] font-mono text-[#333333]">
                {filterRows(lotConsumptionData).map((r, i) => (
                  <tr key={i} className="hover:bg-[#e5f3fa] transition">
                    <td className="py-1.5 px-3">
                      <button
                        type="button"
                        onClick={() => traceDocument(r.issueDocumentNumber, 'INVENTORY_LEDGER')}
                        className="sap-doc-link font-bold font-mono"
                      >
                        {r.issueDocumentNumber}
                      </button>
                      <div className="text-[10px] text-[#666666] font-sans">{formatToJalali(r.issueDate)}</div>
                    </td>
                    <td className="py-1.5 px-3 font-mono">
                      <div>
                        <button
                          type="button"
                          onClick={() => traceDocument(r.coilNumber, 'COILS')}
                          className="sap-doc-link font-bold"
                        >
                          {r.coilNumber}
                        </button>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() => traceDocument(r.heatNumber, 'WIP_TRACEABILITY')}
                          className="sap-doc-link text-[10px]"
                        >
                          {r.heatNumber}
                        </button>
                      </div>
                    </td>
                    <td className="py-1.5 px-3 font-sans">
                      <span className="text-[#333333] font-semibold">{r.materialGrade}</span>
                      <span className="text-[#666666] font-mono mr-1">({r.thicknessMm}mm)</span>
                    </td>
                    <td className="py-1.5 px-3 text-center font-bold text-[#333333]">{formatNumber(r.consumedKg)}</td>
                    <td className="py-1.5 px-3 text-center font-semibold font-mono">
                      <button
                        type="button"
                        onClick={() => traceDocument(r.targetMoNumber, 'WIP_TRACEABILITY')}
                        className="sap-doc-link"
                      >
                        {r.targetMoNumber}
                      </button>
                    </td>
                    <td className="py-1.5 px-3 font-sans">
                      <div className="font-semibold text-[#333333]">{r.targetPartName}</div>
                      <button
                        type="button"
                        onClick={() => traceDocument(r.targetPartCode, 'INVENTORY_LEDGER')}
                        className="sap-doc-link text-[10px] font-mono"
                      >
                        {r.targetPartCode}
                      </button>
                    </td>
                    <td className="py-1.5 px-3 text-center font-bold text-[#107e3e]">{formatNumber(r.piecesProduced)} عدد</td>
                    <td className="py-1.5 px-3 text-center text-[#bb0000] font-mono">
                      <div>{formatNumber(r.scrapKg)} kg</div>
                      <div className="text-[10px] text-[#666666] font-sans">({r.scrapPercent}%)</div>
                    </td>
                    <td className="py-1.5 px-3 text-center font-sans text-[#666666] text-[11px]">{r.operatorName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 16. Supplier Matrix (Grade x Thickness) */}
          {activeReport === 'supplier_matrix' && (
            <table className="w-full text-right text-xs sap-table-compact">
              <thead className="bg-[#f7f7f7] text-[#333333] border-b border-[#d9d9d9] font-semibold">
                <tr>
                  <th className="py-2 px-3">گرید فولاد</th>
                  <th className="py-2 px-3 text-center">ضخامت ورق (mm)</th>
                  <th className="py-2 px-3 text-center">اول دوره (kg)</th>
                  <th className="py-2 px-3 text-center text-[#007cc0]">رسید امانی ساپکو (kg)</th>
                  <th className="py-2 px-3 text-center text-[#333333]">رسید خرید آزاد / ملکی (kg)</th>
                  <th className="py-2 px-3 text-center text-[#e9730c]">جمع مصرف مستقیم (kg)</th>
                  <th className="py-2 px-3 text-center text-[#666666]">سایر گردش‌ها (kg)</th>
                  <th className="py-2 px-3 text-center text-[#107e3e] font-bold">مانده پایان دوره (kg)</th>
                  <th className="py-2 px-3 text-center">تعداد کویل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8e8] font-mono text-[#333333]">
                {filterRows(supplierMatrixData).map((r, i) => (
                  <tr key={i} className="hover:bg-[#e5f3fa] transition">
                    <td className="py-1.5 px-3 font-bold text-[#333333] font-sans">{r.grade}</td>
                    <td className="py-1.5 px-3 text-center font-bold text-[#333333] font-mono">{r.thicknessMm} mm</td>
                    <td className="py-1.5 px-3 text-center text-[#666666]">{formatNumber(r.openingBalanceKg)}</td>
                    <td className="py-1.5 px-3 text-center text-[#007cc0] font-semibold">{formatNumber(r.consignmentReceivedKg)}</td>
                    <td className="py-1.5 px-3 text-center text-[#333333] font-semibold">{formatNumber(r.financialReceivedKg)}</td>
                    <td className="py-1.5 px-3 text-center text-[#e9730c] font-bold">{formatNumber(r.totalConsumptionKg)}</td>
                    <td className="py-1.5 px-3 text-center text-[#666666]">{formatNumber(r.otherMovementKg)}</td>
                    <td className="py-1.5 px-3 text-center font-bold text-[#107e3e]">{formatNumber(r.closingBalanceKg)}</td>
                    <td className="py-1.5 px-3 text-center font-sans">
                      <span className="px-2 py-0.5 rounded bg-[#f5f5f5] text-[#333333] border border-[#d9d9d9] font-bold">
                        {toPersianDigits(r.totalCoilsCount)} کلاف
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      )}

      {/* Drill-down modal */}
      <DrillDownModal
        isOpen={Boolean(drillDownItem)}
        onClose={() => setDrillDownItem(null)}
        data={drillDownItem}
      />
    </div>
  );
};
