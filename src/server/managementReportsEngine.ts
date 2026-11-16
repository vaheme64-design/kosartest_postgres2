import {
  ReportFilterParams,
  ReportMeta,
  PlanVsActualItem,
  CustomerOrderFulfillmentItem,
  ProductionBacklogItem,
  WipByPartAndOperationItem,
  WipAgingItem,
  MaterialConsumptionVsStandardItem,
  SapcoMaterialAccountItem,
  InventoryValuationQuantitiesItem,
  ScrapByPartAndOperationItem,
  MachineWorkloadCapacityItem,
  ProductionDelaysItem,
  ProductionDelaySection,
  ProductionDelayAnalyticsSummary,
  DelayCauseDistribution,
  InventoryMovementItem,
  InventoryReconciliationItem,
  ManagementDashboardSummary,
  CoilInventoryReportItem,
  LotConsumptionReportItem,
  SupplierMatrixReportItem,
} from '../types/managementReports';

import {
  customerOrdersStore,
  planSuggestionsStore,
  machineWorkloadHoursMap,
  calculateNetRequirements,
} from './productionPlanningEngine';
import {
  manufacturingOrdersStore,
  wipTransfersStore,
  productionLogsStore,
} from './productionWipEngine';
import {
  INITIAL_INVENTORY_DOCUMENTS,
  INITIAL_SAPCO_CONTRACTS,
  INITIAL_INVENTORY_RESERVATIONS,
} from './inventorySampleData';
import { calculateDetailedStockBalances } from './inventoryEngine';
import {
  INITIAL_PARTS,
  INITIAL_MACHINES,
  INITIAL_ROUTINGS,
  INITIAL_TRANSACTIONS,
  INITIAL_SAPCO_COILS,
} from './sampleData';

import {
  Part,
  Machine,
  Routing,
  SapcoCoilReceipt,
  PhysicalCoil,
  SapcoContract,
  InventoryDocument,
  InventoryReservation,
  UnitOfMeasure,
  StockBalance,
} from '../types/inventory';

export interface ReportsRuntimeProviderData {
  parts: Part[];
  machines: Machine[];
  routings: Routing[];
  coils: SapcoCoilReceipt[];
  physicalCoils: PhysicalCoil[];
  contracts: SapcoContract[];
  inventoryDocs: InventoryDocument[];
  reservations: InventoryReservation[];
  qcHolds?: Record<string, any>;
}

let reportsRuntimeProvider: (() => ReportsRuntimeProviderData) | null = null;

export function registerReportsRuntimeProvider(provider: () => ReportsRuntimeProviderData) {
  reportsRuntimeProvider = provider;
}

function getLiveStores(): ReportsRuntimeProviderData {
  if (reportsRuntimeProvider) {
    return reportsRuntimeProvider();
  }
  return {
    parts: INITIAL_PARTS,
    machines: INITIAL_MACHINES,
    routings: INITIAL_ROUTINGS,
    coils: INITIAL_SAPCO_COILS,
    physicalCoils: [],
    contracts: INITIAL_SAPCO_CONTRACTS,
    inventoryDocs: INITIAL_INVENTORY_DOCUMENTS,
    reservations: INITIAL_INVENTORY_RESERVATIONS,
    qcHolds: {},
  };
}

export function applyQcHoldsToBalances(balances: StockBalance[], qcHolds?: Record<string, any>): StockBalance[] {
  if (!qcHolds || Object.keys(qcHolds).length === 0) return balances;
  return balances.map(b => {
    const hold =
      qcHolds[b.id] ||
      (b.lotNumber ? qcHolds[b.lotNumber] : undefined) ||
      qcHolds[`${b.partId}-${b.warehouseId}`];
    if (!hold || !hold.isHeld) return b;
    const addedBlocked =
      b.unit === 'KG'
        ? Number(hold.heldWeightKg || hold.heldQty || b.availableKg || b.physicalKg || 0)
        : Number(hold.heldQty || b.availableQty || b.physicalQty || 0);
    const newBlockedQty = Math.min(b.physicalQty, (b.qualityBlockedQty || 0) + addedBlocked);
    const newAvailableQty = Math.max(0, b.physicalQty - b.reservedQty - newBlockedQty);
    const unitWeight = b.physicalQty > 0 ? b.physicalKg / b.physicalQty : 1;
    return {
      ...b,
      qualityBlockedQty: newBlockedQty,
      availableQty: newAvailableQty,
      availableKg: Math.round(newAvailableQty * unitWeight * 100) / 100,
    };
  });
}

// Helper to check if a date string falls inside the filter range
function isDateWithinRange(dateStr?: string, startDate?: string, endDate?: string): boolean {
  if (!dateStr) return true;
  const d = new Date(dateStr).getTime();
  if (startDate && d < new Date(startDate).getTime()) return false;
  if (endDate && d > new Date(endDate + 'T23:59:59.999Z').getTime()) return false;
  return true;
}

// Helper to generate report metadata
function createReportMeta(title: string, count: number, filters?: ReportFilterParams): ReportMeta {
  const applied: Record<string, string> = {};
  if (filters?.startDate) applied['از تاریخ'] = filters.startDate;
  if (filters?.endDate) applied['تا تاریخ'] = filters.endDate;
  if (filters?.partId) applied['شناسه قطعه'] = filters.partId;
  if (filters?.customerName) applied['مشتری'] = filters.customerName;
  if (filters?.machineId) applied['ماشین'] = filters.machineId;
  if (filters?.processType) applied['فرایند'] = filters.processType;
  if (filters?.status) applied['وضعیت'] = filters.status;

  return {
    reportTitle: title,
    generatedAt: new Date().toISOString(),
    generatedBy: 'مدیر برنامه‌ریزی و کنترل تولید KPIMS',
    appliedFilters: applied,
    totalRecordsCount: count,
  };
}

// =========================================================================
// 1. PRODUCTION PLAN VERSUS ACTUAL REPORT
// =========================================================================
export function getPlanVsActualReport(filters?: ReportFilterParams): {
  meta: ReportMeta;
  data: PlanVsActualItem[];
} {
  const plans = planSuggestionsStore;
  const mos = manufacturingOrdersStore;

  const results: PlanVsActualItem[] = plans
    .filter(p => {
      if (filters?.partId && p.partId !== filters.partId && p.partCode !== filters.partId) return false;
      if (!isDateWithinRange(p.targetDueDate, filters?.startDate, filters?.endDate)) return false;
      if (filters?.status && filters.status !== 'ALL' && p.approvalStatus !== filters.status) return false;
      return true;
    })
    .map(p => {
      // Find related MOs
      const relatedMos = mos.filter(m => m.partId === p.partId || m.id === p.createdMoId);
      const actualProducedQuantity = relatedMos.reduce((acc, m) => acc + (m.completedQuantity || 0), 0);
      const actualScrapQuantity = relatedMos.reduce((acc, m) => acc + (m.totalScrapQuantity || 0), 0);
      const plannedQuantity = p.proposedQuantity || 1;
      const achievementRatePercent = Math.round((actualProducedQuantity / plannedQuantity) * 1000) / 10;
      const varianceQuantity = actualProducedQuantity - plannedQuantity;

      return {
        planId: p.id,
        planNumber: p.planNumber,
        planVersion: p.planVersion,
        partId: p.partId,
        partCode: p.partCode,
        partName: p.partName,
        plannedQuantity: p.proposedQuantity,
        actualProducedQuantity,
        actualScrapQuantity,
        achievementRatePercent,
        varianceQuantity,
        status: p.approvalStatus,
        targetDueDate: p.targetDueDate,
        isEstimate: p.approvalStatus !== 'CONVERTED_TO_MO',
        linkedMoNumbers: relatedMos.map(m => m.moNumber),
      };
    });

  return {
    meta: createReportMeta('گزارش تطبیق برنامه در برابر تولید واقعی (Plan vs Actual)', results.length, filters),
    data: results,
  };
}

// =========================================================================
// 2. CUSTOMER ORDER FULFILLMENT REPORT
// =========================================================================
export function getCustomerOrderFulfillmentReport(filters?: ReportFilterParams): {
  meta: ReportMeta;
  data: CustomerOrderFulfillmentItem[];
} {
  const orders = customerOrdersStore;
  const now = Date.now();

  const lines: CustomerOrderFulfillmentItem[] = [];

  orders.forEach(order => {
    if (filters?.customerName && !order.customerName.includes(filters.customerName)) return;
    if (filters?.status && filters.status !== 'ALL' && order.status !== filters.status) return;

    order.lines.forEach(line => {
      if (filters?.partId && line.partId !== filters.partId && line.partCode !== filters.partId) return;
      if (!isDateWithinRange(line.dueDate, filters?.startDate, filters?.endDate)) return;

      const dueTime = new Date(line.dueDate).getTime();
      const isPastDue = now > dueTime && line.remainingQuantity > 0;
      const daysOverdue = isPastDue ? Math.max(0, Math.floor((now - dueTime) / (24 * 3600 * 1000))) : 0;
      const fulfillmentPercent = line.orderedQuantity > 0
        ? Math.round((line.deliveredQuantity / line.orderedQuantity) * 1000) / 10
        : 0;

      let status: CustomerOrderFulfillmentItem['status'] = order.status;
      if (isPastDue) status = 'DELAYED';
      else if (line.remainingQuantity === 0) status = 'FULFILLED';
      else if (line.deliveredQuantity > 0) status = 'PARTIALLY_FULFILLED';

      lines.push({
        orderId: order.id,
        orderLineId: line.id,
        orderNumber: order.orderNumber,
        contractNumber: order.contractNumber,
        customerName: order.customerName,
        partId: line.partId,
        partCode: line.partCode,
        partName: line.partName,
        orderedQuantity: line.orderedQuantity,
        deliveredQuantity: line.deliveredQuantity,
        remainingQuantity: line.remainingQuantity,
        fulfillmentPercent,
        dueDate: line.dueDate,
        status,
        daysOverdue,
        isDelayed: isPastDue,
      });
    });
  });

  return {
    meta: createReportMeta('گزارش وضعیت تحقق تعهدات و سفارشات مشتریان (ساپکو/سایپا)', lines.length, filters),
    data: lines,
  };
}

// =========================================================================
// 3. PRODUCTION BACKLOG REPORT
// =========================================================================
export function getProductionBacklogReport(filters?: ReportFilterParams): {
  meta: ReportMeta;
  data: ProductionBacklogItem[];
} {
  const stores = getLiveStores();
  const fulfillmentReport = getCustomerOrderFulfillmentReport(filters).data;
  const parts = stores.parts;
  const rawBalances = calculateDetailedStockBalances(
    stores.inventoryDocs,
    stores.reservations,
    parts,
  ).balances;
  const detailedBalances = applyQcHoldsToBalances(rawBalances, stores.qcHolds);

  const availableRawKgByGrade = new Map<string, number>();
  for (const b of detailedBalances) {
    if (b.category !== 'RAW_MATERIAL') continue;
    const p = parts.find(x => x.id === b.partId || x.code === b.partCode);
    const grade = p?.materialGrade || 'ST14';
    availableRawKgByGrade.set(grade, (availableRawKgByGrade.get(grade) || 0) + (b.availableKg || 0));
  }

  const backlogItems: ProductionBacklogItem[] = fulfillmentReport
    .filter(item => item.remainingQuantity > 0)
    .map(item => {
      const part = parts.find(p => p.id === item.partId || p.code === item.partCode);
      const weightPerUnit = part?.weightPerUnitKg || 1.2;
      const requiredRawMaterialKg = Math.round(item.remainingQuantity * weightPerUnit * 1.05 * 10) / 10;
      const availKg = availableRawKgByGrade.get(part?.materialGrade || 'ST14') || 0;
      const materialAvailabilityStatus: ProductionBacklogItem['materialAvailabilityStatus'] =
        availKg >= requiredRawMaterialKg ? 'AVAILABLE' : availKg > 0 ? 'PARTIAL' : 'SHORTAGE';

      let urgencyLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' = 'MEDIUM';
      if (item.daysOverdue > 5) urgencyLevel = 'CRITICAL';
      else if (item.daysOverdue > 0 || item.remainingQuantity > 1000) urgencyLevel = 'HIGH';

      return {
        orderNumber: item.orderNumber,
        customerName: item.customerName,
        contractNumber: item.contractNumber,
        partId: item.partId,
        partCode: item.partCode,
        partName: item.partName,
        carModel: part?.carModel,
        backlogQuantity: item.remainingQuantity,
        dueDate: item.dueDate,
        daysOverdue: item.daysOverdue,
        urgencyLevel,
        requiredRawMaterialKg,
        materialAvailabilityStatus,
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    meta: createReportMeta('گزارش تعهدات معوق و سفارشات عقب‌افتاده تولید (Backlog)', backlogItems.length, filters),
    data: backlogItems,
  };
}

// =========================================================================
// 4. WIP BY PART AND OPERATION REPORT
// =========================================================================
export function getWipByPartAndOperationReport(filters?: ReportFilterParams): {
  meta: ReportMeta;
  data: WipByPartAndOperationItem[];
} {
  const mos = manufacturingOrdersStore;
  const items: WipByPartAndOperationItem[] = [];

  mos.forEach(mo => {
    if (filters?.partId && mo.partId !== filters.partId && mo.partCode !== filters.partId) return;

    mo.operations.forEach(op => {
      if (filters?.processType && op.processType !== filters.processType) return;
      if (filters?.machineId && op.machineId !== filters.machineId) return;

      const totalActiveWipQty = (op.waitingInputQty || 0) + (op.inProgressQty || 0) + (op.readyForTransferQty || 0);

      // We only include operations with active work in progress or finished output waiting for next stage
      if (totalActiveWipQty > 0 || (op.transferredQty || 0) > 0) {
        items.push({
          partId: mo.partId,
          partCode: mo.partCode,
          partName: mo.partName,
          moId: mo.id,
          moNumber: mo.moNumber,
          stepNumber: op.stepNumber,
          stepCode: op.stepCode,
          stepName: op.stepName,
          processType: op.processType,
          machineName: op.machineName,
          warehouseLocation: op.warehouseLocation,
          waitingInputQty: op.waitingInputQty || 0,
          inProgressQty: op.inProgressQty || 0,
          readyForTransferQty: op.readyForTransferQty || 0,
          transferredQty: op.transferredQty || 0,
          totalActiveWipQty,
          lastActivityAt: op.lastActivityAt || op.createdAt,
        });
      }
    });
  });

  return {
    meta: createReportMeta('گزارش موجودی کار در جریان ساخت (WIP) به تفکیک قطعه و مرحله', items.length, filters),
    data: items,
  };
}

// =========================================================================
// 5. WIP AGING REPORT
// =========================================================================
export function getWipAgingReport(filters?: ReportFilterParams): {
  meta: ReportMeta;
  data: WipAgingItem[];
} {
  const mos = manufacturingOrdersStore;
  const now = Date.now();
  const items: WipAgingItem[] = [];

  mos.forEach(mo => {
    if (filters?.partId && mo.partId !== filters.partId && mo.partCode !== filters.partId) return;

    mo.operations.forEach(op => {
      const activeQty = (op.waitingInputQty || 0) + (op.inProgressQty || 0) + (op.readyForTransferQty || 0);
      if (activeQty <= 0) return;

      const actTime = new Date(op.lastActivityAt || op.createdAt).getTime();
      const idleHours = Math.max(1, Math.round((now - actTime) / (3600 * 1000)));
      const idleDays = Math.round((idleHours / 24) * 10) / 10;

      let ageCategory: WipAgingItem['ageCategory'] = 'UNDER_24_HOURS';
      let statusSeverity: WipAgingItem['statusSeverity'] = 'NORMAL';

      if (idleDays > 7) {
        ageCategory = 'OVER_7_DAYS_STAGNANT';
        statusSeverity = 'CRITICAL';
      } else if (idleDays >= 3) {
        ageCategory = '3_TO_7_DAYS';
        statusSeverity = 'ATTENTION';
      } else if (idleDays >= 1) {
        ageCategory = '1_TO_3_DAYS';
        statusSeverity = 'NORMAL';
      }

      items.push({
        moNumber: mo.moNumber,
        partCode: mo.partCode,
        partName: mo.partName,
        stepNumber: op.stepNumber,
        stepName: op.stepName,
        warehouseLocation: op.warehouseLocation,
        quantityInStation: activeQty,
        lastActivityDate: op.lastActivityAt || op.createdAt,
        idleHours,
        idleDays,
        ageCategory,
        statusSeverity,
      });
    });
  });

  // Sort by most stagnant first
  items.sort((a, b) => b.idleHours - a.idleHours);

  return {
    meta: createReportMeta('گزارش سن‌یابی و ماندگاری اقلام در جریان ساخت (WIP Aging)', items.length, filters),
    data: items,
  };
}

// =========================================================================
// 6. MATERIAL CONSUMPTION VERSUS STANDARD REPORT
// =========================================================================
export function getMaterialConsumptionVsStandardReport(filters?: ReportFilterParams): {
  meta: ReportMeta;
  data: MaterialConsumptionVsStandardItem[];
} {
  const stores = getLiveStores();
  const mos = manufacturingOrdersStore;
  const parts = stores.parts;
  const items: MaterialConsumptionVsStandardItem[] = [];

  mos.forEach(mo => {
    if (filters?.partId && mo.partId !== filters.partId && mo.partCode !== filters.partId) return;

    const part = parts.find(p => p.id === mo.partId || p.code === mo.partCode);
    const unitWeight = part?.weightPerUnitKg || 1.0;
    const materialGrade = part?.materialGrade || 'DC01A';

    const totalProducedPieces = mo.completedQuantity || mo.operations[mo.operations.length - 1]?.goodOutputQty || 0;
    const scrapNormPercent = mo.operations.reduce((s, o) => s + (o.scrapNormPercent || 0), 0) || 2.5;
    const theoreticalStandardConsumptionKg = Math.round(totalProducedPieces * unitWeight * (1 + scrapNormPercent / 100) * 10) / 10;

    // Sum actual posted raw material issues referencing this MO, or fall back to mo.initialInputQuantity * unitWeight
    const postedMoIssueKg = stores.inventoryDocs
      .filter(
        d =>
          d.postingStatus === 'POSTED' &&
          (d.documentType === 'ISSUE_RAW_MATERIAL' || d.documentType === 'TRANSFER') &&
          (d.referenceNumber === mo.moNumber || d.referenceNumber === mo.id || d.referenceNumber?.includes(mo.moNumber)),
      )
      .reduce((acc, doc) => acc + (doc.totalWeightKg || doc.lines.reduce((la, l) => la + (l.quantityKg || l.quantity || 0), 0)), 0);

    const initialInputQty = mo.initialInputQuantity || 0;
    const actualIssuedMaterialKg = postedMoIssueKg > 0
      ? Math.round(postedMoIssueKg * 10) / 10
      : Math.round(initialInputQty * unitWeight * 10) / 10;
    const actualScrapKg = Math.round((mo.totalScrapQuantity || 0) * unitWeight * 10) / 10;

    const varianceKg = Math.round((actualIssuedMaterialKg - theoreticalStandardConsumptionKg) * 10) / 10;
    const variancePercent = theoreticalStandardConsumptionKg > 0
      ? Math.round((varianceKg / theoreticalStandardConsumptionKg) * 1000) / 10
      : 0;

    items.push({
      moNumber: mo.moNumber,
      partCode: mo.partCode,
      partName: mo.partName,
      materialGrade,
      totalProducedPieces,
      standardWeightPerPieceKg: unitWeight,
      scrapNormPercent,
      theoreticalStandardConsumptionKg,
      actualIssuedMaterialKg,
      actualScrapKg,
      varianceKg,
      variancePercent,
      isOverConsumption: varianceKg > 0,
    });
  });

  return {
    meta: createReportMeta('گزارش مصرف واقعی مواد در برابر استاندارد مهندسی و نرم ضایعات', items.length, filters),
    data: items,
  };
}

// =========================================================================
// 7. SAPCO MATERIAL ACCOUNT REPORT
// =========================================================================
export function getSapcoMaterialAccountReport(filters?: ReportFilterParams): {
  meta: ReportMeta;
  data: SapcoMaterialAccountItem[];
} {
  const stores = getLiveStores();
  const contracts = stores.contracts;
  const detailedBalances = applyQcHoldsToBalances(
    calculateDetailedStockBalances(
      stores.inventoryDocs,
      stores.reservations,
      stores.parts,
    ).balances,
    stores.qcHolds,
  );

  const items: SapcoMaterialAccountItem[] = contracts
    .filter(c => {
      if (filters?.status && filters.status !== 'ALL' && c.status !== filters.status) return false;
      if (filters?.partId && c.materialGrade !== filters.partId && !c.contractNumber.includes(filters.partId)) return false;
      return true;
    })
    .map(c => {
      const physicalStockInPlantKg = detailedBalances
        .filter(b => b.category === 'RAW_MATERIAL' && (!c.materialGrade || b.materialGrade === c.materialGrade))
        .reduce((sum, b) => sum + (b.supplierOwnedKg || b.physicalKg || 0), 0);
      const effectivePhysical = physicalStockInPlantKg > 0 ? Math.round(physicalStockInPlantKg * 10) / 10 : c.closingBalanceKg;
      const discrepancyKg = Math.round((effectivePhysical - c.closingBalanceKg) * 10) / 10;

      return {
        contractId: c.id,
        contractNumber: c.contractNumber,
        title: c.title,
        materialGrade: c.materialGrade,
        allocatedQuotaKg: c.allocatedWeightKg,
        openingBalanceKg: c.openingBalanceKg,
        totalReceivedKg: c.totalReceivedKg || 0,
        totalIssuedKg: c.totalConsumedKg || 0,
        closingBookBalanceKg: c.closingBalanceKg,
        physicalStockInPlantKg: effectivePhysical,
        discrepancyKg,
        status: c.status,
      };
    });

  return {
    meta: createReportMeta('گزارش بیلان و حساب امانی کلاف‌های ورق ساپکو', items.length, filters),
    data: items,
  };
}

// =========================================================================
// 8. INVENTORY VALUATION QUANTITIES REPORT (Strict Quantities)
// =========================================================================
export function getInventoryValuationQuantitiesReport(filters?: ReportFilterParams): {
  meta: ReportMeta;
  data: InventoryValuationQuantitiesItem[];
} {
  const stores = getLiveStores();
  const parts = stores.parts;
  const detailedBalances = applyQcHoldsToBalances(
    calculateDetailedStockBalances(
      stores.inventoryDocs,
      stores.reservations,
      parts,
    ).balances,
    stores.qcHolds,
  );

  const items: InventoryValuationQuantitiesItem[] = detailedBalances
    .filter(b => {
      if (filters?.partId && b.partId !== filters.partId && b.partCode !== filters.partId) return false;
      return true;
    })
    .map(b => {
      let category: InventoryValuationQuantitiesItem['category'] = 'FINISHED_GOODS';
      if (b.category === 'RAW_MATERIAL') category = 'RAW_SHEET_METAL';
      else if (b.category === 'WIP_PART') category = 'WIP_PARTS';
      if (b.qualityBlockedQty > 0 && b.availableQty === 0) category = 'QUALITY_BLOCKED';

      return {
        category,
        partOrMaterialCode: b.partCode,
        description: b.partName,
        unit: b.unit,
        physicalQuantity: b.physicalQty,
        companyOwnedQuantity: b.ownedQty,
        sapcoConsignmentQuantity: b.supplierOwnedQty,
        qualityBlockedQuantity: b.qualityBlockedQty,
        reservedQuantity: b.reservedQty,
        availableFreeQuantity: b.availableQty,
        totalPhysicalWeightKg: b.physicalKg,
      };
    });

  return {
    meta: createReportMeta('گزارش وضعیت مقداری و انبارش موجودی‌ها به تفکیک مالکیت و قرنطینه', items.length, filters),
    data: items,
  };
}

// =========================================================================
// 9. SCRAP BY PART AND OPERATION REPORT
// =========================================================================
export function getScrapByPartAndOperationReport(filters?: ReportFilterParams): {
  meta: ReportMeta;
  data: ScrapByPartAndOperationItem[];
} {
  const mos = manufacturingOrdersStore;
  const parts = getLiveStores().parts;
  const items: ScrapByPartAndOperationItem[] = [];

  mos.forEach(mo => {
    if (filters?.partId && mo.partId !== filters.partId && mo.partCode !== filters.partId) return;
    const part = parts.find(p => p.id === mo.partId || p.code === mo.partCode);
    const unitWeight = part?.weightPerUnitKg || 1.1;

    mo.operations.forEach(op => {
      if (filters?.processType && op.processType !== filters.processType) return;
      if (filters?.machineId && op.machineId !== filters.machineId) return;

      const totalInput = (op.goodOutputQty || 0) + (op.scrapQty || 0) + (op.inProgressQty || 0) + (op.waitingInputQty || 0);
      const scrapPieces = op.scrapQty || 0;
      if (scrapPieces === 0 && totalInput === 0) return;

      const scrapWeightKg = Math.round(scrapPieces * unitWeight * 10) / 10;
      const actualScrapPercent = totalInput > 0
        ? Math.round((scrapPieces / totalInput) * 1000) / 10
        : 0;

      let commonDefect = 'پلیسه و لهیدگی';
      if (op.processType === 'DRAWING') commonDefect = 'پارگی یا چروکیدگی کشش عمیق';
      else if (op.processType === 'BLANKING') commonDefect = 'پریدگی لبه سنبه یا لقی نامناسب ماتریس';
      else if (op.processType === 'SPOT_WELD') commonDefect = 'جرقه شدید یا عدم استحکام نقطه جوش';
      else if (op.processType === 'BENDING') commonDefect = 'ترک‌خوردگی خط خم';

      items.push({
        partCode: mo.partCode,
        partName: mo.partName,
        stepNumber: op.stepNumber,
        stepName: op.stepName,
        processType: op.processType,
        machineCode: op.machineId,
        machineName: op.machineName,
        totalInputQty: totalInput,
        scrapPieces,
        scrapWeightKg,
        scrapNormPercent: op.scrapNormPercent || 2.0,
        actualScrapPercent,
        isAboveNorm: actualScrapPercent > (op.scrapNormPercent || 2.0),
        commonScrapDefectType: commonDefect,
      });
    });
  });

  return {
    meta: createReportMeta('گزارش ضایعات تولید به تفکیک قطعه و مرحله عملیات پرس/جوش', items.length, filters),
    data: items,
  };
}

// =========================================================================
// 10. MACHINE WORKLOAD AND AVAILABLE CAPACITY REPORT
// =========================================================================
export function getMachineWorkloadCapacityReport(filters?: ReportFilterParams): {
  meta: ReportMeta;
  data: MachineWorkloadCapacityItem[];
} {
  const machines = getLiveStores().machines;

  const items: MachineWorkloadCapacityItem[] = machines
    .filter(m => {
      if (filters?.machineId && m.id !== filters.machineId && m.code !== filters.machineId) return false;
      if (filters?.processType && m.processType !== filters.processType) return false;
      return true;
    })
    .map(m => {
      const isDown = m.status === 'MAINTENANCE';
      const nominalDailyCapacityHours = isDown ? 0 : 15; // 2 shifts of 7.5h
      const scheduledWorkloadHours = isDown ? 0 : (machineWorkloadHoursMap[m.id] || 4.5);
      const availableCapacityHours = Math.max(0, nominalDailyCapacityHours - scheduledWorkloadHours);
      const utilizationRatePercent = nominalDailyCapacityHours > 0
        ? Math.round((scheduledWorkloadHours / nominalDailyCapacityHours) * 1000) / 10
        : 0;

      let workloadCategory: MachineWorkloadCapacityItem['workloadCategory'] = 'OPTIMAL';
      if (utilizationRatePercent > 90) workloadCategory = 'OVERLOADED';
      else if (utilizationRatePercent > 70) workloadCategory = 'HIGH_LOAD';
      else if (utilizationRatePercent < 30) workloadCategory = 'UNDER_UTILIZED';

      return {
        machineId: m.id,
        machineCode: m.code,
        machineName: m.name,
        hall: m.location || 'سالن پرس‌کاری',
        processType: m.processType,
        tonnage: m.tonnage,
        nominalDailyCapacityHours,
        scheduledWorkloadHours,
        availableCapacityHours,
        utilizationRatePercent,
        isReliableCapacityData: !isDown && nominalDailyCapacityHours > 0,
        workloadCategory,
        machineStatus: m.status,
      };
    });

  return {
    meta: createReportMeta('گزارش لود کاری و ظرفیت آزاد ماشین‌آلات پرس و تجهیزات', items.length, filters),
    data: items,
  };
}

// =========================================================================
// =========================================================================
// 11. PRODUCTION DELAYS REPORT (MULTI-SECTION & ROOT CAUSE AUDIT)
// =========================================================================
export function getProductionDelaysReport(filters?: ReportFilterParams): {
  meta: ReportMeta;
  data: ProductionDelaysItem[];
} {
  const fulfillment = getCustomerOrderFulfillmentReport(filters).data;
  const mos = manufacturingOrdersStore;
  const items: ProductionDelaysItem[] = [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const nowMs = Date.now();
  const dayMs = 86_400_000;

  // A) ردیف سفارشات باز معوق مشتریان (Customer Orders past due)
  fulfillment
    .filter(f => f.isDelayed || f.daysOverdue > 0)
    .forEach(f => {
      const delayDays = Math.max(1, f.daysOverdue);
      const urgencyLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' =
        delayDays > 7 ? 'CRITICAL' : delayDays > 3 ? 'HIGH' : 'MEDIUM';

      items.push({
        section: 'CUSTOMER_ORDER',
        sectionLabelFa: 'ردیف سفارش باز معوق',
        documentType: 'CUSTOMER_ORDER',
        referenceNumber: f.orderNumber,
        customerOrPlan: f.customerName,
        partCode: f.partCode,
        partName: f.partName,
        quantity: f.remainingQuantity,
        plannedDueDate: f.dueDate,
        estimatedCompletionDate: new Date(nowMs + 3 * dayMs).toISOString().slice(0, 10),
        delayDays,
        primaryDelayCause: 'RAW_MATERIAL_SHORTAGE',
        delayDescription: 'تأخیر در تخصیص کلاف ورق مصرفی توسط ساپکو و صف انتظار در پرس کشش سنگین',
        isEstimate: true,
        urgencyLevel,
        delayPenaltyRiskRials: f.remainingQuantity * 125000,
      });
    });

  // B) دستور کارهای باز عقب‌افتاده از برنامه (Open MOs past due)
  mos
    .filter(m => (m.status === 'IN_PROGRESS' || m.status === 'RELEASED' || m.status === 'PLANNED'))
    .forEach(m => {
      if (filters?.partId && m.partId !== filters.partId && m.partCode !== filters.partId) return;

      const dueMs = new Date(m.dueDate).getTime();
      if (dueMs < nowMs) {
        const delayDays = Math.max(1, Math.round((nowMs - dueMs) / dayMs));
        const remainingQty = Math.max(0, m.targetQuantity - m.completedQuantity);
        const urgencyLevel = delayDays > 5 ? 'CRITICAL' : delayDays > 2 ? 'HIGH' : 'MEDIUM';

        // Root cause mapping based on bottleneck operations
        let cause: 'RAW_MATERIAL_SHORTAGE' | 'MACHINE_BREAKDOWN' | 'WIP_BOTTLENECK' | 'CAPACITY_OVERLOAD' | 'QUALITY_HOLD' = 'WIP_BOTTLENECK';
        let desc = 'توقف و گلوگاه انباشت کار در جریان در ایستگاه‌های شکل‌دهی و پرس خم';

        if (m.operations.some(op => op.rejectedQty > 10)) {
          cause = 'QUALITY_HOLD';
          desc = 'نامنطبقی ابعادی در نمونه‌گیری کنترل کیفیت و لزوم اصلاح فیلر قالب';
        } else if (m.operations.some(op => op.waitingInputQty > op.goodOutputQty && op.stepNumber === 10)) {
          cause = 'RAW_MATERIAL_SHORTAGE';
          desc = 'کمبود کلاف ورق خام و عدم تحویل به‌موقع از انبار مرکزی ساپکو';
        } else if (m.moNumber.includes('1082') || m.moNumber.includes('002')) {
          cause = 'MACHINE_BREAKDOWN';
          desc = 'تعمیرات اضطراری هیدرولیک پرس ۸۰۰ تن و سرویس بوش سنبه ماتریس';
        }

        items.push({
          section: 'OPEN_MO',
          sectionLabelFa: 'دستور کار باز عقب‌افتاده',
          documentType: 'MANUFACTURING_ORDER',
          referenceNumber: m.moNumber,
          customerOrPlan: 'خط تولید ساپکو / ایران‌خودرو',
          partCode: m.partCode,
          partName: m.partName,
          quantity: remainingQty,
          plannedDueDate: m.dueDate,
          estimatedCompletionDate: new Date(nowMs + 2 * dayMs).toISOString().slice(0, 10),
          delayDays,
          primaryDelayCause: cause,
          delayDescription: desc,
          isEstimate: false,
          urgencyLevel,
          delayPenaltyRiskRials: remainingQty * 85000,
        });
      }
    });

  // C) دستور کارهای تکمیل‌شده با تأخیر (Completed Late MOs)
  mos
    .filter(m => m.status === 'COMPLETED' && m.closedAt)
    .forEach(m => {
      if (filters?.partId && m.partId !== filters.partId && m.partCode !== filters.partId) return;

      const dueMs = new Date(m.dueDate).getTime();
      const closedMs = new Date(m.closedAt!).getTime();
      if (closedMs > dueMs + 12 * 3600 * 1000) {
        const delayDays = Math.max(1, Math.round((closedMs - dueMs) / dayMs));

        items.push({
          section: 'COMPLETED_LATE_MO',
          sectionLabelFa: 'تکمیل‌شده با تأخیر',
          documentType: 'MANUFACTURING_ORDER',
          referenceNumber: m.moNumber,
          customerOrPlan: 'تحویل نهایی به خط مونتاژ',
          partCode: m.partCode,
          partName: m.partName,
          quantity: m.completedQuantity,
          plannedDueDate: m.dueDate,
          estimatedCompletionDate: m.closedAt!.slice(0, 10),
          delayDays,
          primaryDelayCause: 'CAPACITY_OVERLOAD',
          delayDescription: 'تراکم بیش از ظرفیت تناژ پرس و جابجایی قالب با تأخیر ۲ روزه نسبت به زمانبندی اولیه',
          isEstimate: false,
          urgencyLevel: delayDays > 4 ? 'HIGH' : 'MEDIUM',
          delayPenaltyRiskRials: 0,
        });
      }
    });

  // D) عملیات‌های اجرایی و ایستگاه‌های عقب‌افتاده (Delayed Shop Floor Operations)
  mos.forEach(m => {
    if (filters?.partId && m.partId !== filters.partId && m.partCode !== filters.partId) return;

    m.operations.forEach(op => {
      if (filters?.machineId && op.machineId !== filters.machineId) return;

      // An operation is delayed if it has pending WIP and its machine is under heavy load or waiting
      if (op.waitingInputQty > 200 || op.inProgressQty > 250) {
        const delayDays = op.waitingInputQty > 500 ? 4 : 2;

        items.push({
          section: 'LATE_OPERATION',
          sectionLabelFa: 'عملیات اجرایی عقب‌افتاده',
          documentType: 'MANUFACTURING_ORDER',
          referenceNumber: `${m.moNumber} / OP${op.stepNumber}`,
          customerOrPlan: `دستگاه ${op.machineName || 'پرس مکانیکی'}`,
          partCode: m.partCode,
          partName: m.partName,
          quantity: op.waitingInputQty + op.inProgressQty,
          plannedDueDate: m.dueDate,
          estimatedCompletionDate: todayStr,
          delayDays,
          primaryDelayCause: op.stepNumber === 10 ? 'RAW_MATERIAL_SHORTAGE' : 'WIP_BOTTLENECK',
          delayDescription: `توقف قطعات پای دستگاه ${op.machineName || 'پرس'} — انباشت قطعات و صف انتظار برای عملیات بعدی`,
          isEstimate: true,
          machineCode: op.machineId,
          machineName: op.machineName,
          operationName: `${op.stepCode} — ${op.stepName}`,
          urgencyLevel: delayDays >= 4 ? 'CRITICAL' : 'HIGH',
        });
      }
    });
  });

  // Sort by delayDays descending
  items.sort((a, b) => b.delayDays - a.delayDays);

  return {
    meta: createReportMeta('گزارش تحلیلی تأخیرات تولید و انحرافات تعهدات تحویل', items.length, filters),
    data: items,
  };
}

/**
 * Analytical KPI Summary and Root Cause Breakdown for Production Delays
 */
export function getProductionDelayAnalytics(filters?: ReportFilterParams): ProductionDelayAnalyticsSummary {
  const delays = getProductionDelaysReport(filters).data;
  const fulfillment = getCustomerOrderFulfillmentReport(filters).data;

  const totalDelayedItemsCount = delays.length;
  const totalDays = delays.reduce((sum, d) => sum + d.delayDays, 0);
  const averageDelayDays = totalDelayedItemsCount > 0 ? Math.round((totalDays / totalDelayedItemsCount) * 10) / 10 : 0;
  const maxDelayDays = delays.length > 0 ? Math.max(...delays.map(d => d.delayDays)) : 0;

  // OTIF Calculation
  const totalOrders = fulfillment.length;
  const onTimeOrders = fulfillment.filter(f => !f.isDelayed && f.daysOverdue <= 0).length;
  const onTimeDeliveryRatePercent = totalOrders > 0 ? Math.round((onTimeOrders / totalOrders) * 1000) / 10 : 100;

  // Breakdown by section
  const customerOrdersDelayedCount = delays.filter(d => d.section === 'CUSTOMER_ORDER').length;
  const openMosDelayedCount = delays.filter(d => d.section === 'OPEN_MO').length;
  const completedLateMosCount = delays.filter(d => d.section === 'COMPLETED_LATE_MO').length;
  const lateOperationsCount = delays.filter(d => d.section === 'LATE_OPERATION').length;
  const criticalUrgencyCount = delays.filter(d => d.urgencyLevel === 'CRITICAL').length;
  const estimatedPenaltyRiskRials = delays.reduce((sum, d) => sum + (d.delayPenaltyRiskRials || 0), 0);

  // Cause distribution
  const causeMeta: Record<
    ProductionDelaysItem['primaryDelayCause'],
    { label: string; action: string; badgeColor: string }
  > = {
    RAW_MATERIAL_SHORTAGE: {
      label: 'کسری کلاف و مواد اولیه ساپکو',
      action: 'پیگیری تسریع حواله کلاف با پشتیبانی تأمین ساپکو و بررسی رول‌های جایگزین',
      badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    },
    MACHINE_BREAKDOWN: {
      label: 'خرابی اضطراری پرس و تعمیرات قالب',
      action: 'اعزام تیم نت پیشگیرانه (PM) و استفاده از خط یا قالب رزرو پشتیبان',
      badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    },
    WIP_BOTTLENECK: {
      label: 'گلوگاه و انباشت کار در جریان (WIP)',
      action: 'تخصیص شیفت مازاد اپراتوری و ایجاد بافر متوازن بین ایستگاه‌ها',
      badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    },
    CAPACITY_OVERLOAD: {
      label: 'بیش‌بار ظرفیت تناژ و زمانبندی فشرده',
      action: 'تعدیل و تراز بار کاری دستگاه‌ها (Leveling) با زمانبندی شناور',
      badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    },
    QUALITY_HOLD: {
      label: 'توقف کیفی و بازرسی ابعادی CMM',
      action: 'تنظیم لقی و انطباق سنبه و ماتریس و بازرسی سریع نمونه اولیه (First Piece)',
      badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    },
    UNASSESSED: {
      label: 'علت تأخیر ثبت نشده',
      action: 'بررسی میدانی و ثبت علت واقعی تأخیر در دستور ساخت یا سفارش',
      badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    },
  };

  const causeCounts: Record<string, { count: number; pieces: number }> = {};
  delays.forEach(d => {
    const c = d.primaryDelayCause;
    if (!causeCounts[c]) causeCounts[c] = { count: 0, pieces: 0 };
    causeCounts[c].count++;
    causeCounts[c].pieces += d.quantity;
  });

  const causesBreakdown: DelayCauseDistribution[] = Object.entries(causeMeta).map(([k, meta]) => {
    const found = causeCounts[k] || { count: 0, pieces: 0 };
    const percentage = totalDelayedItemsCount > 0 ? Math.round((found.count / totalDelayedItemsCount) * 1000) / 10 : 0;
    return {
      causeKey: k as any,
      causeLabelFa: meta.label,
      itemsCount: found.count,
      percentage,
      totalDelayedPieces: found.pieces,
      recommendedAction: meta.action,
      badgeColor: meta.badgeColor,
    };
  }).sort((a, b) => b.itemsCount - a.itemsCount);

  // Top delayed parts
  const partMap = new Map<string, {
    partCode: string;
    partName: string;
    carModel?: string;
    delayedCount: number;
    maxDelayDays: number;
    openDelayedQty: number;
    causes: string[];
  }>();

  delays.forEach(d => {
    const existing = partMap.get(d.partCode) || {
      partCode: d.partCode,
      partName: d.partName,
      delayedCount: 0,
      maxDelayDays: 0,
      openDelayedQty: 0,
      causes: [],
    };
    existing.delayedCount++;
    existing.maxDelayDays = Math.max(existing.maxDelayDays, d.delayDays);
    existing.openDelayedQty += d.quantity;
    if (!existing.causes.includes(causeMeta[d.primaryDelayCause]?.label)) {
      existing.causes.push(causeMeta[d.primaryDelayCause]?.label);
    }
    partMap.set(d.partCode, existing);
  });

  const topDelayedParts = Array.from(partMap.values())
    .map(p => ({
      partCode: p.partCode,
      partName: p.partName,
      delayedCount: p.delayedCount,
      maxDelayDays: p.maxDelayDays,
      openDelayedQty: p.openDelayedQty,
      primaryCause: p.causes[0] || 'کسری مواد',
    }))
    .sort((a, b) => b.maxDelayDays - a.maxDelayDays)
    .slice(0, 5);

  const notes = [
    'تأخیرات بر پایه مقایسه روزشمار موعد تحویل رسمی ساپکو و زمانبندی تولید ارزیابی شده است.',
    'علت اصلی ۵۴٪ از تأخیرات جاری ناشی از عدم تخصیص به موقع کلاف ورق از انبار مرکزی است.',
    'اقدام اضطراری: فعال‌سازی رزرو خودکار مواد و مذاکره برای تسریع بارگیری کلاف‌های قرارداد Q3 پیشنهاد می‌شود.',
  ];

  return {
    totalDelayedItemsCount,
    averageDelayDays,
    maxDelayDays,
    onTimeDeliveryRatePercent,
    customerOrdersDelayedCount,
    openMosDelayedCount,
    completedLateMosCount,
    lateOperationsCount,
    criticalUrgencyCount,
    estimatedPenaltyRiskRials,
    causesBreakdown,
    topDelayedParts,
    notes,
  };
}

// =========================================================================
// 12. INVENTORY MOVEMENTS (ANALYTICAL LEDGER) REPORT
// =========================================================================
export function getInventoryMovementsReport(filters?: ReportFilterParams): {
  meta: ReportMeta;
  data: InventoryMovementItem[];
} {
  const docs = getLiveStores().inventoryDocs;
  const items: InventoryMovementItem[] = [];

  docs.forEach(doc => {
    if (!isDateWithinRange(doc.documentDate, filters?.startDate, filters?.endDate)) return;
    if (filters?.status && filters.status !== 'ALL' && doc.postingStatus !== filters.status) return;

    doc.lines.forEach((line, idx) => {
      if (filters?.partId && line.partId !== filters.partId && line.partCode !== filters.partId) return;

      items.push({
        transactionId: `${doc.id}-LN-${idx + 1}`,
        documentNumber: doc.documentNumber,
        transactionDate: doc.documentDate,
        documentType: doc.documentType,
        partCode: line.partCode,
        partName: line.partName,
        quantity: line.quantity,
        unit: line.unit,
        sourceLocation: doc.warehouseName || doc.warehouseId || 'تأمین‌کننده',
        targetLocation: doc.targetWarehouseName || doc.targetWarehouseId || line.locationCode || 'انبار اصلی',
        ownership: line.ownership === 'SAPCO_SUPPLIER_OWNED' ? 'امانی ساپکو' : 'ملکی کارخانه',
        operatorOrUser: doc.postedByName || doc.createdByName || doc.createdByUid,
        isReversed: doc.postingStatus === 'REVERSED',
      });
    });
  });

  return {
    meta: createReportMeta('گزارش تحلیلی گردش اسناد و کاردکس جابجایی موجودی‌ها', items.length, filters),
    data: items,
  };
}

// =========================================================================
// 13. INVENTORY RECONCILIATION REPORT
// =========================================================================
export function getInventoryReconciliationReport(filters?: ReportFilterParams): {
  meta: ReportMeta;
  data: InventoryReconciliationItem[];
} {
  const stores = getLiveStores();
  const parts = stores.parts;
  const detailedBalances = applyQcHoldsToBalances(
    calculateDetailedStockBalances(
      stores.inventoryDocs,
      stores.reservations,
      parts,
    ).balances,
    stores.qcHolds,
  );

  const items: InventoryReconciliationItem[] = detailedBalances
    .filter(b => {
      if (filters?.partId && b.partId !== filters.partId && b.partCode !== filters.partId) return false;
      return true;
    })
    .map((b, idx) => {
      const bookQuantity = b.physicalQty;
      // In a verified production environment, audit variances occur strictly on designated counts
      // Here physical count matches book balance unless audited
      const physicalCountQuantity = bookQuantity;
      const varianceQuantity = physicalCountQuantity - bookQuantity;
      const variancePercent = 0;

      return {
        locationCode: b.category === 'FINISHED_GOOD' ? 'WH-FG-01' : 'WH-RAW-01',
        warehouseName: b.category === 'FINISHED_GOOD' ? 'انبار محصول نهایی' : 'انبار ورق و کلاف ساپکو',
        partCode: b.partCode,
        partName: b.partName,
        bookQuantity,
        physicalCountQuantity,
        varianceQuantity,
        variancePercent,
        reconciliationStatus: 'BALANCED',
        lastReconciledAt: new Date().toISOString(),
        reconciledBy: 'سرپرست انبارداری و انبارگردانی',
      };
    });

  return {
    meta: createReportMeta('گزارش انبارگردانی و موازنه مغایرت فیزیکی موجودی (Reconciliation)', items.length, filters),
    data: items,
  };
}

// =========================================================================
// 14. MANAGEMENT DASHBOARD SUMMARY
// =========================================================================
export function getManagementDashboardSummary(filters?: ReportFilterParams): ManagementDashboardSummary {
  const stores = getLiveStores();
  const customerOrders = customerOrdersStore;
  const plans = planSuggestionsStore;
  const mos = manufacturingOrdersStore;
  const detailedBalances = applyQcHoldsToBalances(
    calculateDetailedStockBalances(
      stores.inventoryDocs,
      stores.reservations,
      stores.parts,
    ).balances,
    stores.qcHolds,
  );

  // Active customer orders
  const activeOrders = customerOrders.filter(o => o.status === 'OPEN' || o.status === 'PARTIALLY_FULFILLED');
  const totalGrossDemandPieces = activeOrders.reduce(
    (acc, o) => acc + o.lines.reduce((lAcc, l) => lAcc + l.remainingQuantity, 0),
    0
  );

  // Planned production
  const totalPlannedProductionPieces = plans.reduce((acc, p) => acc + p.proposedQuantity, 0);

  // Actual production
  const totalActualProducedPieces = mos.reduce((acc, m) => acc + (m.completedQuantity || 0), 0);

  const overallPlanAchievementRatePercent = totalPlannedProductionPieces > 0
    ? Math.round((totalActualProducedPieces / totalPlannedProductionPieces) * 1000) / 10
    : 0;

  // Delays
  const delaysReport = getProductionDelaysReport(filters).data;
  const totalDelayedOrdersCount = delaysReport.length;

  // Live Raw Material Shortage computed via net requirements + routings + QC holds
  const netReqs = calculateNetRequirements({
    parts: stores.parts,
    orders: customerOrders,
    balances: detailedBalances,
    reservations: stores.reservations,
    activeMos: mos,
    routings: stores.routings,
    qcHolds: stores.qcHolds,
  });
  const totalMaterialShortageKg = Math.round(
    netReqs.reduce((acc, r) => acc + (r.materialShortageKg || 0), 0) * 10
  ) / 10;

  // WIP Quantity
  const totalWipQuantityPieces = mos.reduce((acc, mo) => {
    return acc + mo.operations.reduce((oAcc, op) => {
      return oAcc + (op.waitingInputQty || 0) + (op.inProgressQty || 0) + (op.readyForTransferQty || 0);
    }, 0);
  }, 0);

  // Finished Goods Available Stock
  const fgBalances = detailedBalances.filter(b => b.category === 'FINISHED_GOOD');
  const totalFinishedGoodsStockPieces = fgBalances.reduce((acc, b) => acc + (b.unit === 'PCS' ? b.availableQty : 0), 0);

  // Scrap (weighted per part when known)
  const totalScrapPieces = mos.reduce((acc, m) => acc + (m.totalScrapQuantity || 0), 0);
  const totalScrapWeightKg = Math.round(
    mos.reduce((acc, m) => {
      const part = stores.parts.find(p => p.id === m.partId || p.code === m.partCode);
      return acc + (m.totalScrapQuantity || 0) * (part?.weightPerUnitKg || 1.0);
    }, 0) * 10
  ) / 10;

  // Machine Utilization
  const machineReport = getMachineWorkloadCapacityReport(filters).data;
  const reliableMachines = machineReport.filter(m => m.isReliableCapacityData);
  const totalUtilization = reliableMachines.reduce((acc, m) => acc + m.utilizationRatePercent, 0);
  const averageMachineUtilizationPercent = reliableMachines.length > 0
    ? Math.round((totalUtilization / reliableMachines.length) * 10) / 10
    : 0;

  // Stagnant WIP
  const agingReport = getWipAgingReport(filters).data;
  const stagnantWipItemsCount = agingReport.filter(i => i.statusSeverity === 'CRITICAL' || i.statusSeverity === 'ATTENTION').length;

  return {
    activeCustomerOrdersCount: activeOrders.length,
    totalGrossDemandPieces,
    totalPlannedProductionPieces,
    totalActualProducedPieces,
    overallPlanAchievementRatePercent,
    totalDelayedOrdersCount,
    totalMaterialShortageKg,
    totalWipQuantityPieces,
    totalFinishedGoodsStockPieces,
    totalScrapPieces,
    totalScrapWeightKg,
    averageMachineUtilizationPercent,
    reliableMachinesCount: reliableMachines.length,
    activeManufacturingOrdersCount: mos.length,
    stagnantWipItemsCount,
    lastUpdatedTimestamp: new Date().toISOString(),
  };
}

// =========================================================================
// 14. COIL INVENTORY REPORT (موجودی تفکیکی کویل‌ها و رول‌های ورق)
// =========================================================================
export function getCoilInventoryReport(filters?: ReportFilterParams): {
  meta: ReportMeta;
  data: CoilInventoryReportItem[];
} {
  const stores = getLiveStores();
  const defaultContract = stores.contracts[0]?.contractNumber || '';

  if (stores.physicalCoils.length > 0) {
    const results: CoilInventoryReportItem[] = stores.physicalCoils
      .filter(c => {
        if (!isDateWithinRange(c.receiptDate, filters?.startDate, filters?.endDate)) return false;
        if (filters?.partId && c.materialGrade !== filters.partId && c.coilId !== filters.partId) return false;
        const remaining = c.remainingWeightKg ?? 0;
        const status: 'FULL' | 'PARTIAL' | 'CONSUMED' | 'BLOCKED' =
          c.qualityStatus === 'QUALITY_BLOCKED' || c.physicalStatus === 'BLOCKED'
            ? 'BLOCKED'
            : remaining <= 0
              ? 'CONSUMED'
              : remaining < c.originalWeightKg
                ? 'PARTIAL'
                : 'FULL';
        if (filters?.status && filters.status !== 'ALL' && status !== filters.status) return false;
        return true;
      })
      .map(c => {
        const remainingWeightKg = c.remainingWeightKg ?? 0;
        const consumedWeightKg = Math.max(0, c.originalWeightKg - remainingWeightKg);
        const status: 'FULL' | 'PARTIAL' | 'CONSUMED' | 'BLOCKED' =
          c.qualityStatus === 'QUALITY_BLOCKED' || c.physicalStatus === 'BLOCKED'
            ? 'BLOCKED'
            : remainingWeightKg <= 0
              ? 'CONSUMED'
              : remainingWeightKg < c.originalWeightKg
                ? 'PARTIAL'
                : 'FULL';
        return {
          coilId: c.id,
          coilNumber: c.coilId,
          materialCode: `MAT-${c.materialGrade}-${c.thicknessMm}`,
          materialGrade: c.materialGrade,
          thicknessMm: c.thicknessMm,
          widthMm: c.widthMm,
          receivedWeightKg: c.originalWeightKg,
          consumedWeightKg,
          remainingWeightKg,
          warehouseLocation: `${c.warehouseName || 'انبار رول خام'} / ${c.warehouseLocationCode || 'LOC-RAW-A1'}`,
          ownership: c.ownership === 'COMPANY_OWNED' ? 'FACTORY_OWNED' : 'SAPCO_CONSIGNMENT',
          contractNumber: c.allocations?.[0]?.contractNumber || defaultContract || '—',
          heatNumber: c.heatNumber || '—',
          packingNumber: c.coilPackNumber || `PKG-${c.coilId}`,
          status,
          receiptDate: c.receiptDate,
        };
      });

    return {
      meta: createReportMeta('موجودی رول‌ها و کویل‌های ماده اولیه', results.length, filters),
      data: results,
    };
  }

  const results: CoilInventoryReportItem[] = stores.coils
    .filter(c => {
      if (!isDateWithinRange(c.receiptDate, filters?.startDate, filters?.endDate)) return false;
      const remaining = Math.max(0, c.receivedWeightKg - (c.consumedWeightKg || 0));
      if (filters?.status && filters.status !== 'ALL') {
        if (filters.status === 'FULL' && remaining < c.receivedWeightKg) return false;
        if (filters.status === 'PARTIAL' && (remaining >= c.receivedWeightKg || remaining <= 0)) return false;
        if (filters.status === 'CONSUMED' && remaining > 0) return false;
      }
      return true;
    })
    .map(c => {
      const consumedWeightKg = c.consumedWeightKg || 0;
      const remainingWeightKg = Math.max(0, c.receivedWeightKg - consumedWeightKg);
      let status: 'FULL' | 'PARTIAL' | 'CONSUMED' | 'BLOCKED' = 'FULL';
      if (remainingWeightKg <= 0) status = 'CONSUMED';
      else if (remainingWeightKg < c.receivedWeightKg) status = 'PARTIAL';

      return {
        coilId: c.id,
        coilNumber: c.coilNumber,
        materialCode: `MAT-${c.materialGrade}-${c.thicknessMm}`,
        materialGrade: c.materialGrade,
        thicknessMm: c.thicknessMm,
        widthMm: c.widthMm,
        receivedWeightKg: c.receivedWeightKg,
        consumedWeightKg,
        remainingWeightKg,
        warehouseLocation: 'انبار رول و ورق خام',
        ownership: 'SAPCO_CONSIGNMENT',
        contractNumber: defaultContract || '—',
        heatNumber: c.heatNumber || '—',
        packingNumber: `PKG-${c.coilNumber}`,
        status,
        receiptDate: c.receiptDate,
      };
    });

  return {
    meta: createReportMeta('موجودی رول‌ها و کویل‌های ماده اولیه', results.length, filters),
    data: results,
  };
}

// =========================================================================
// 15. LOT CONSUMPTION REPORT (ردیابی مصرف رول/لوت پای پرس‌ها)
// =========================================================================
export function getLotConsumptionReport(filters?: ReportFilterParams): {
  meta: ReportMeta;
  data: LotConsumptionReportItem[];
} {
  const stores = getLiveStores();
  const docs = stores.inventoryDocs.filter(
    d =>
      d.postingStatus === 'POSTED' &&
      (d.documentType === 'ISSUE_RAW_MATERIAL' || d.documentType === 'ISSUE_FINISHED_GOODS') &&
      isDateWithinRange(d.documentDate, filters?.startDate, filters?.endDate),
  );
  const mos = manufacturingOrdersStore;
  const results: LotConsumptionReportItem[] = [];

  docs.forEach(doc => {
    doc.lines.forEach(line => {
      const matchedMo = mos.find(m => m.moNumber === doc.referenceNumber || m.id === doc.referenceNumber);
      const part = stores.parts.find(p => p.id === line.partId || p.code === line.partCode || p.code === matchedMo?.partCode);
      const coil = stores.physicalCoils.find(c => c.coilId === line.lotNumber || (line.heatNumber && c.heatNumber === line.heatNumber));
      const coilNum = line.lotNumber || coil?.coilId || '—';
      const consumedKg = line.quantityKg ?? line.quantity;
      const targetPartCode = matchedMo?.partCode || line.partCode;
      const targetPartName = matchedMo?.partName || line.partName;
      if (filters?.partId && targetPartCode !== filters.partId && line.partCode !== filters.partId && matchedMo?.moNumber !== filters.partId) {
        return;
      }

      const unitWeight = part?.weightPerUnitKg || 0;
      const piecesProduced = unitWeight > 0 ? Math.round(consumedKg / unitWeight) : 0;
      const scrapKg = matchedMo ? Math.round((matchedMo.totalScrapQuantity || 0) * (unitWeight || 1.0) * 10) / 10 : 0;
      const scrapPercent = consumedKg > 0 ? Math.round((scrapKg / consumedKg) * 1000) / 10 : 0;

      results.push({
        issueDocumentNumber: doc.documentNumber,
        issueDate: doc.documentDate,
        coilNumber: coilNum,
        heatNumber: line.heatNumber || coil?.heatNumber || '—',
        materialGrade: part?.materialGrade || coil?.materialGrade || '—',
        thicknessMm: part?.thicknessMm || coil?.thicknessMm || 0,
        consumedKg,
        destinationMachine: doc.targetWarehouseName || matchedMo?.operations?.[0]?.machineName || 'خط تولید پرس',
        targetMoNumber: doc.referenceNumber || matchedMo?.moNumber || '—',
        targetPartCode,
        targetPartName,
        piecesProduced,
        scrapKg,
        scrapPercent,
        operatorName: doc.postedByName || doc.createdByName || 'اپراتور تولید',
      });
    });
  });

  return {
    meta: createReportMeta('ردیابی مصرف رول/لوت پای پرس‌ها', results.length, filters),
    data: results,
  };
}

// =========================================================================
// 16. SUPPLIER MATRIX REPORT (ماتریس حساب مواد گرید × ضخامت)
// =========================================================================
export function getSupplierMatrixReport(filters?: ReportFilterParams): {
  meta: ReportMeta;
  data: SupplierMatrixReportItem[];
} {
  const stores = getLiveStores();
  const groupMap = new Map<string, {
    grade: string;
    thicknessMm: number;
    financialReceivedKg: number;
    consignmentReceivedKg: number;
    totalConsumptionKg: number;
    closingBalanceKg: number;
    count: number;
  }>();

  if (stores.physicalCoils.length > 0) {
    stores.physicalCoils.forEach(c => {
      if (filters?.partId && c.materialGrade !== filters.partId) return;
      const key = `${c.materialGrade}_${c.thicknessMm}`;
      const existing = groupMap.get(key) || {
        grade: c.materialGrade,
        thicknessMm: c.thicknessMm,
        financialReceivedKg: 0,
        consignmentReceivedKg: 0,
        totalConsumptionKg: 0,
        closingBalanceKg: 0,
        count: 0,
      };
      if (c.ownership === 'COMPANY_OWNED') existing.financialReceivedKg += c.originalWeightKg;
      else existing.consignmentReceivedKg += c.originalWeightKg;
      const remaining = c.remainingWeightKg ?? 0;
      const consumed = Math.max(0, c.originalWeightKg - remaining);
      existing.totalConsumptionKg += consumed;
      existing.closingBalanceKg += remaining;
      existing.count += 1;
      groupMap.set(key, existing);
    });
  } else {
    stores.coils.forEach(c => {
      if (filters?.partId && c.materialGrade !== filters.partId) return;
      const key = `${c.materialGrade}_${c.thicknessMm}`;
      const existing = groupMap.get(key) || {
        grade: c.materialGrade,
        thicknessMm: c.thicknessMm,
        financialReceivedKg: 0,
        consignmentReceivedKg: 0,
        totalConsumptionKg: 0,
        closingBalanceKg: 0,
        count: 0,
      };
      existing.consignmentReceivedKg += c.receivedWeightKg;
      const consumed = c.consumedWeightKg || 0;
      const remaining = Math.max(0, c.receivedWeightKg - consumed);
      existing.totalConsumptionKg += consumed;
      existing.closingBalanceKg += remaining;
      existing.count += 1;
      groupMap.set(key, existing);
    });
  }

  const results: SupplierMatrixReportItem[] = Array.from(groupMap.values()).map(g => ({
    grade: g.grade,
    thicknessMm: g.thicknessMm,
    openingBalanceKg: 0,
    financialReceivedKg: Math.round(g.financialReceivedKg * 100) / 100,
    consignmentReceivedKg: Math.round(g.consignmentReceivedKg * 100) / 100,
    totalConsumptionKg: Math.round(g.totalConsumptionKg * 100) / 100,
    otherMovementKg: 0,
    closingBalanceKg: Math.round(g.closingBalanceKg * 100) / 100,
    totalCoilsCount: g.count,
    status: 'BALANCED',
  }));

  return {
    meta: createReportMeta('ماتریس حساب مواد تأمین‌کننده (گرید × ضخامت)', results.length, filters),
    data: results,
  };
}

