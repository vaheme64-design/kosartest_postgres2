import {
  CustomerOrder,
  CustomerOrderLine,
  PartNetRequirement,
  MachineEligibilityCheck,
  ProposedOperationPlan,
  ProductionPlanSuggestion,
  PlanningDashboardMetrics,
} from '../types/productionPlanning';
import { Part, Machine, DieMold, Routing, ProcessType } from '../types/inventory';
import { DetailedStockBalance, InventoryReservation } from '../types/inventory';
import { ManufacturingOrder } from '../types/productionWip';
import { INITIAL_PARTS, INITIAL_MACHINES, INITIAL_DIES_MOLDS, INITIAL_ROUTINGS } from './sampleData';
import { manufacturingOrdersStore, createManufacturingOrder } from './productionWipEngine';
import { calculateDetailedStockBalances } from './inventoryEngine';
import { INITIAL_INVENTORY_DOCUMENTS, INITIAL_INVENTORY_RESERVATIONS } from './inventorySampleData';

// Store for Open Customer Orders (Exclusively Anti-Theft ECU Bracket)
export const INITIAL_CUSTOMER_ORDERS: CustomerOrder[] = [
  {
    id: 'ORD-ECU-001',
    orderNumber: 'SO-SAPCO-ECU-101',
    customerName: 'شرکت ساپکو (تأمین قطعات ایران‌خودرو - خط پژو ۲۰۶/۲۰۷)',
    contractNumber: 'CNT-SAPCO-ECU-BRK',
    orderDate: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    priority: 1, // Urgent
    status: 'OPEN',
    notes: 'سفارش تولید و تحویل مجموعه براکت ضدسرقت رایانه موتور با پوشش رنگ کاتافورز ED (شامل صفحه اصلی با ۱۵ مهره M6 و مکمل با ۲ پیچ ۶×۲۰)',
    createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    lines: [
      {
        id: 'ORD-LN-ECU-001',
        orderId: 'ORD-ECU-001',
        partId: 'PRT-FGD-ECU-BRK',
        partCode: 'SAPCO-ASY-ECU-BRK-01',
        partName: 'مجموعه براکت ضدسرقت رایانه موتور با پوشش رنگ کاتافورز ED',
        orderedQuantity: 1500,
        deliveredQuantity: 0,
        remainingQuantity: 1500,
        dueDate: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10),
        unitPriceRials: 2450000,
      },
    ],
  },
  {
    id: 'ORD-ECU-002',
    orderNumber: 'SO-SAPCO-ECU-102',
    customerName: 'شرکت ساپکو (فراخوان مرحله دوم تحویل خط تندرو ایران‌خودرو)',
    contractNumber: 'CNT-SAPCO-ECU-BRK',
    orderDate: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    priority: 2, // Normal / Planned Batch
    status: 'OPEN',
    notes: 'سفارش تکمیلی قرارداد CNT-SAPCO-ECU-BRK جهت پوشش برنامه تحویل هفته آینده ساپکو',
    createdAt: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    lines: [
      {
        id: 'ORD-LN-ECU-002',
        orderId: 'ORD-ECU-002',
        partId: 'PRT-FGD-ECU-BRK',
        partCode: 'SAPCO-ASY-ECU-BRK-01',
        partName: 'مجموعه براکت ضدسرقت رایانه موتور با پوشش رنگ کاتافورز ED',
        orderedQuantity: 1200,
        deliveredQuantity: 0,
        remainingQuantity: 1200,
        dueDate: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().slice(0, 10),
        unitPriceRials: 2450000,
      },
    ],
  },
];

export const customerOrdersStore: CustomerOrder[] = [...INITIAL_CUSTOMER_ORDERS];

// Store for Generated Production Planning Suggestions
export const planSuggestionsStore: ProductionPlanSuggestion[] = [];

// Machine Workload Tracking (Hours scheduled on each machine)
export const machineWorkloadHoursMap: Record<string, number> = {
  'MCH-001': 4.5, // Heavy Press 800t
  'MCH-002': 6.0, // Schuler 400t
  'MCH-003': 3.0, // Press 250t
  'MCH-004': 2.0, // Press Brake
  'MCH-005': 1.5, // Shearing
  'MCH-006': 3.5, // Slitter
  'MCH-007': 5.0, // Robotic CO2
  'MCH-008': 4.0, // Spot Weld
  'MCH-009': 8.0, // Cataphoresis Paint
  'MCH-010': 3.0, // Assembly Jig
};

export function clearCustomerOrdersAndPlans() {
  customerOrdersStore.length = 0;
  planSuggestionsStore.length = 0;
  Object.keys(machineWorkloadHoursMap).forEach(k => {
    machineWorkloadHoursMap[k] = 0;
  });
}

export function reseedCustomerOrdersAndPlans() {
  customerOrdersStore.length = 0;
  customerOrdersStore.push(...JSON.parse(JSON.stringify(INITIAL_CUSTOMER_ORDERS)));
  planSuggestionsStore.length = 0;
  planSuggestionsStore.push(...generateProductionPlanSuggestions());
  Object.assign(machineWorkloadHoursMap, {
    'MCH-001': 4.5,
    'MCH-002': 6.0,
    'MCH-003': 3.0,
    'MCH-004': 2.0,
    'MCH-005': 1.5,
    'MCH-006': 3.5,
    'MCH-007': 5.0,
    'MCH-008': 4.0,
    'MCH-009': 8.0,
    'MCH-010': 3.0,
  });
}

export interface PlanningRuntimeStoresSnapshot {
  parts: Part[];
  machines: Machine[];
  dies: DieMold[];
  routings: Routing[];
  inventoryDocs: any[];
  reservations: InventoryReservation[];
  qcHolds?: Record<string, { isHeld: boolean; partId?: string; partCode?: string; heldQty?: number; heldWeightKg?: number }>;
}

let planningRuntimeProvider: (() => PlanningRuntimeStoresSnapshot) | null = null;

export function registerPlanningRuntimeProvider(provider: () => PlanningRuntimeStoresSnapshot) {
  planningRuntimeProvider = provider;
}

function getPlanningLiveStores(): PlanningRuntimeStoresSnapshot {
  if (planningRuntimeProvider) {
    return planningRuntimeProvider();
  }
  return {
    parts: INITIAL_PARTS,
    machines: INITIAL_MACHINES,
    dies: INITIAL_DIES_MOLDS,
    routings: INITIAL_ROUTINGS,
    inventoryDocs: INITIAL_INVENTORY_DOCUMENTS,
    reservations: INITIAL_INVENTORY_RESERVATIONS,
    qcHolds: {},
  };
}

// =========================================================================
// 1. NET PRODUCTION REQUIREMENTS CALCULATION (WIP & RESERVATION NETTING)
// =========================================================================

export function calculateNetRequirements(params?: {
  parts?: Part[];
  orders?: CustomerOrder[];
  balances?: DetailedStockBalance[];
  reservations?: InventoryReservation[];
  activeMos?: ManufacturingOrder[];
  routings?: Routing[];
  qcHolds?: Record<string, { isHeld: boolean; partId?: string; partCode?: string; heldQty?: number; heldWeightKg?: number }>;
}): PartNetRequirement[] {
  const live = getPlanningLiveStores();
  const parts = params?.parts || live.parts;
  const orders = params?.orders || customerOrdersStore;
  const reservations = params?.reservations || live.reservations;
  const balances = params?.balances || calculateDetailedStockBalances(live.inventoryDocs, reservations, parts).balances;
  const activeMos = params?.activeMos || manufacturingOrdersStore;
  const routings = params?.routings || live.routings;
  const qcHolds = params?.qcHolds || live.qcHolds || {};

  const results: PartNetRequirement[] = [];

  // 1. Group remaining customer demand by partId
  const demandByPart = new Map<
    string,
    { totalDemand: number; nearestDueDate: string; orderIds: string[]; orderNumbers: string[] }
  >();

  orders.filter(o => o.status === 'OPEN' || o.status === 'PARTIALLY_FULFILLED').forEach(order => {
    order.lines.forEach(line => {
      if (line.remainingQuantity <= 0) return;
      const existing = demandByPart.get(line.partId) || {
        totalDemand: 0,
        nearestDueDate: line.dueDate,
        orderIds: [],
        orderNumbers: [],
      };
      existing.totalDemand += line.remainingQuantity;
      if (new Date(line.dueDate).getTime() < new Date(existing.nearestDueDate).getTime()) {
        existing.nearestDueDate = line.dueDate;
      }
      if (!existing.orderIds.includes(order.id)) existing.orderIds.push(order.id);
      if (!existing.orderNumbers.includes(order.orderNumber)) existing.orderNumbers.push(order.orderNumber);
      demandByPart.set(line.partId, existing);
    });
  });

  // 2. For each part with demand, perform multi-level netting:
  demandByPart.forEach((demandInfo, partId) => {
    const part = parts.find(p => p.id === partId || p.code === partId);
    if (!part) return;

    const grossDemand = demandInfo.totalDemand;

    // 2.1. Available Finished Goods Stock
    const fgRecords = balances.filter(b => (b.partId === part.id || b.partCode === part.code) && b.warehouseId === 'WH-FINISHED');
    const physicalFg = fgRecords.reduce((sum, b) => sum + b.physicalQty, 0);
    const qcHeldFg = Object.values(qcHolds)
      .filter(h => h.isHeld && (h.partId === part.id || h.partCode === part.code))
      .reduce((sum, h) => sum + Number(h.heldQty || 0), 0);
    const qualityBlockedFg = fgRecords.reduce((sum, b) => sum + b.qualityBlockedQty, 0) + qcHeldFg;

    // Active Reservations
    const activeRes = reservations.filter(
      r => (r.partId === part.id || r.partCode === part.code) && r.status === 'ACTIVE' && r.warehouseId === 'WH-FINISHED'
    );
    const reservedFg = activeRes.reduce((sum, r) => sum + r.quantity, 0);

    // Strictly exclude blocked and reserved stock:
    const availableFg = Math.max(0, physicalFg - qualityBlockedFg - reservedFg);

    // Net Demand after Available Finished Goods
    const netDemandAfterFg = Math.max(0, grossDemand - availableFg);

    // 2.2. WIP Netting across all operations of this part
    const partMos = activeMos.filter(
      m => (m.partId === part.id || m.partCode === part.code) && (m.status === 'IN_PROGRESS' || m.status === 'RELEASED')
    );

    const downstreamWipByStep: Record<number, number> = {};
    let totalDownstreamWip = 0;

    partMos.forEach(mo => {
      mo.operations.forEach(op => {
        const stepWip = op.waitingInputQty + op.inProgressQty + op.readyForTransferQty;
        downstreamWipByStep[op.stepNumber] = (downstreamWipByStep[op.stepNumber] || 0) + stepWip;
        totalDownstreamWip += stepWip;
      });
    });

    // Credit PLANNED MOs and unstarted portion of RELEASED MOs (awaiting raw material issue)
    // without double-counting WIP already included in totalDownstreamWip.
    const plannedMosSupply = activeMos
      .filter(m => (m.partId === part.id || m.partCode === part.code) && (m.status === 'PLANNED' || m.status === 'RELEASED'))
      .reduce((sum, m) => {
        const moWip = m.status === 'RELEASED'
          ? m.operations.reduce((s, op) => s + op.waitingInputQty + op.inProgressQty + op.readyForTransferQty, 0)
          : 0;
        const uncoveredOrderQty = Math.max(
          0,
          m.targetQuantity - (m.completedQuantity || 0) - (m.totalScrapQuantity || 0) - (m.totalRejectedQuantity || 0) - moWip
        );
        return sum + uncoveredOrderQty;
      }, 0);

    // 2.3. Net Production Requirement from route beginning
    const netProductionRequirement = Math.max(0, netDemandAfterFg - totalDownstreamWip - plannedMosSupply);

    // 2.4. Raw Material Shortage Calculation (never borrow unrelated part's routing)
    const routing = routings.find(r => r.partId === part.id || r.partCode === part.code);
    const cumulativeScrapNormPercent = routing
      ? routing.operations.reduce((sum, op) => sum + op.scrapNormPercent, 0)
      : 0;
    const scrapFactor = 1 + cumulativeScrapNormPercent / 100;

    const partUnitWeightKg = part.weightPerUnitKg || 1.0;
    const requiredMaterialKg = Math.round(netProductionRequirement * partUnitWeightKg * scrapFactor * 10) / 10;
    const requiredGrade = part.materialGrade || 'DC01A';

    const rawRecords = balances.filter(
      b =>
        b.warehouseId === 'WH-RAW' &&
        ((b.materialGrade || '').toUpperCase() === requiredGrade.toUpperCase() ||
          b.partCode.toUpperCase().includes(requiredGrade.toUpperCase()))
    );
    const availableRawKg = rawRecords.reduce((sum, b) => sum + b.availableKg, 0);
    const materialShortageKg = Math.max(0, Math.round((requiredMaterialKg - availableRawKg) * 10) / 10);

    results.push({
      partId: part.id,
      partCode: part.code,
      partName: part.name,
      carModel: part.carModel,
      dueDate: demandInfo.nearestDueDate,
      grossDemandQty: grossDemand,
      physicalFinishedGoodsQty: physicalFg,
      qualityBlockedQty: qualityBlockedFg,
      reservedFinishedGoodsQty: reservedFg,
      availableFinishedGoodsQty: availableFg,
      netDemandAfterFg,
      downstreamWipByStep,
      totalDownstreamWip,
      netProductionRequirement,
      requiredMaterialGrade: requiredGrade,
      requiredMaterialKg,
      availableRawMaterialKg: availableRawKg,
      materialShortageKg,
      materialShortageDetected: materialShortageKg > 0,
    });
  });

  return results;
}

// =========================================================================
// 2. MACHINE ELIGIBILITY & WORKLOAD ESTIMATION
// =========================================================================

export function evaluateMachineEligibility(params: {
  processType: ProcessType;
  requiredTonnage: number;
  plannedQuantity: number;
  standardCycleTimeSec: number;
  setupTimeMin?: number;
  targetDueDate?: string;
  assignedDieId?: string;
  assignedDieCode?: string;
  machines?: Machine[];
  dies?: DieMold[];
}): MachineEligibilityCheck[] {
  const live = getPlanningLiveStores();
  const machines = params.machines || live.machines;
  const dies = params.dies || live.dies;
  const setupMin = params.setupTimeMin ?? 25; // default 25 min setup
  const cycleSec = params.standardCycleTimeSec || 15;
  const plannedQty = params.plannedQuantity;

  // Estimated Run Time in Hours = Setup Hours + (Pieces * CycleSec / 3600)
  const estimatedRunHours = Math.round(((setupMin / 60) + ((plannedQty * cycleSec) / 3600)) * 10) / 10;
  const dailyShiftHours = 15; // 2 shifts of 7.5 hours

  // Find assigned die/mold if specified
  const hasAssignedDie = Boolean(params.assignedDieCode || params.assignedDieId);
  const assignedDie = params.assignedDieCode
    ? dies.find(d => d.code === params.assignedDieCode)
    : params.assignedDieId
      ? dies.find(d => d.id === params.assignedDieId)
      : undefined;

  const results: MachineEligibilityCheck[] = [];

  machines.forEach(machine => {
    const ineligibilityReasons: string[] = [];

    // 1. Process Support Check
    const supportsProcess = machine.capabilities.includes(params.processType) || machine.processType === params.processType;
    if (!supportsProcess) {
      ineligibilityReasons.push(`دستگاه فرایند ${params.processType} را پشتیبانی نمی‌کند.`);
    }

    // 2. Tonnage Check
    const machineTonnage = machine.tonnage ?? 0;
    const tonnageSufficient = params.requiredTonnage <= 0 || machineTonnage >= params.requiredTonnage;
    if (!tonnageSufficient) {
      ineligibilityReasons.push(
        `تناژ ناکافی: ظرفیت دستگاه ${machineTonnage} تن، کمتر از تناژ مورد نیاز ${params.requiredTonnage} تن است.`
      );
    }

    // 3. Die / Mold Compatibility Check
    let dieCompatible = !hasAssignedDie || Boolean(assignedDie);
    if (hasAssignedDie && !assignedDie) {
      dieCompatible = false;
      ineligibilityReasons.push(`قالب تخصیص‌یافته با شناسه «${params.assignedDieCode || params.assignedDieId}» در اطلاعات پایه یافت نشد؛ انتخاب دستگاه متوقف شد.`);
    } else if (assignedDie) {
      const compatibleCodes = assignedDie.compatibleMachineCodes || [];
      if (compatibleCodes.length === 0 || !compatibleCodes.includes(machine.code)) {
        dieCompatible = false;
        ineligibilityReasons.push(
          compatibleCodes.length === 0
            ? `فهرست سازگاری ماشین‌آلات برای قالب ${assignedDie.code} تعریف نشده است؛ انتخاب دستگاه متوقف شد.`
            : `قالب ${assignedDie.code} (${assignedDie.name}) با ابعاد میز و فک این دستگاه ناسازگار است.`
        );
      }
    }

    // 4. Machine Status Check
    const isMachineActive = machine.status === 'ACTIVE';
    if (!isMachineActive) {
      ineligibilityReasons.push(
        machine.status === 'MAINTENANCE'
          ? 'دستگاه در وضعیت تعمیرات دوره‌ای / اورهال قرار دارد.'
          : 'دستگاه به دلیل خرابی اضطراری متوقف است.'
      );
    }

    // 5. Machine Capacity Check
    const currentWorkload = machineWorkloadHoursMap[machine.id] || 0;
    const availableHoursRemaining = Math.max(0, Math.round((dailyShiftHours - currentWorkload) * 10) / 10);
    const minRequiredHours = Math.min(1.0, Math.max(0.25, estimatedRunHours));
    const capacityAvailable = availableHoursRemaining >= minRequiredHours;
    if (!capacityAvailable) {
      ineligibilityReasons.push(`ظرفیت شیفت‌های فعال دستگاه پر شده است (آزاد: ${availableHoursRemaining} ساعت، مورد نیاز: ${minRequiredHours} ساعت).`);
    }

    // Overarching Eligibility Verdict (requires process, tonnage, die, active status AND available shift capacity)
    const isEligible = supportsProcess && tonnageSufficient && dieCompatible && isMachineActive && capacityAvailable;

    // 6. Suitability Score (0 to 100) & Human Rationale
    let suitabilityScore = 0;
    let recommendationReason = '';

    if (isEligible) {
      // Base score 50
      suitabilityScore = 50;

      // Available capacity bonus (up to 30 points)
      const capacityRatio = availableHoursRemaining / dailyShiftHours;
      suitabilityScore += Math.round(capacityRatio * 30);

      // Tonnage optimality bonus (up to 15 points)
      // If tonnage is close to required, optimal power usage
      if (params.requiredTonnage > 0) {
        const excessTonnageRatio = (machineTonnage - params.requiredTonnage) / params.requiredTonnage;
        if (excessTonnageRatio <= 0.25) {
          suitabilityScore += 15; // Optimal match
        } else if (excessTonnageRatio <= 0.6) {
          suitabilityScore += 10;
        } else {
          suitabilityScore += 5; // Oversized press
        }
      } else {
        suitabilityScore += 10;
      }

      // Speed bonus (Strokes per minute) (up to 5 points)
      if ((machine.strokesPerMinute || 0) >= 30) suitabilityScore += 5;

      const workloadPercent = Math.round((currentWorkload / dailyShiftHours) * 100);
      recommendationReason = `${machine.name} به دلیل سازگاری کامل، تناژ متناسب (${machineTonnage} تن) و دارا بودن ${availableHoursRemaining} ساعت ظرفیت آزاد (${100 - workloadPercent}٪ آزادی) انتخاب شد.`;
    } else {
      suitabilityScore = 0;
      recommendationReason = ineligibilityReasons.join(' | ');
    }

    const currentWorkloadPercent = Math.round((currentWorkload / dailyShiftHours) * 100);

    results.push({
      machineId: machine.id,
      machineCode: machine.code,
      machineName: machine.name,
      isEligible,
      ineligibilityReasons,
      supportsProcess,
      tonnageSufficient,
      dieCompatible,
      isMachineActive,
      capacityAvailable,
      dailyCapacityHours: dailyShiftHours,
      currentWorkloadHours: currentWorkload,
      availableHoursRemaining,
      estimatedSetupTimeMin: setupMin,
      estimatedRunTimeHours: estimatedRunHours,
      currentWorkloadPercent,
      suitabilityScore,
      recommendationRank: 999, // Assigned below
      recommendationReason,
    });
  });

  // Rank eligible machines by suitability score descending
  const eligibleSorted = results.filter(r => r.isEligible).sort((a, b) => b.suitabilityScore - a.suitabilityScore);
  eligibleSorted.forEach((item, index) => {
    item.recommendationRank = index + 1;
  });

  // Return all machines, sorted: eligible first (ranked), then ineligible
  return results.sort((a, b) => {
    if (a.isEligible && !b.isEligible) return -1;
    if (!a.isEligible && b.isEligible) return 1;
    return a.recommendationRank - b.recommendationRank;
  });
}

// =========================================================================
// 3. PRODUCTION PLAN SUGGESTIONS GENERATION
// =========================================================================

export function generateProductionPlanSuggestions(): ProductionPlanSuggestion[] {
  const live = getPlanningLiveStores();
  const netRequirements = calculateNetRequirements();
  const routings = live.routings;
  const dies = live.dies;
  const machines = live.machines;

  const suggestions: ProductionPlanSuggestion[] = [];

  netRequirements.forEach((req, idx) => {
    // Only generate active production plans when net production requirement > 0
    if (req.netProductionRequirement <= 0) return;

    const routing = routings.find(r => r.partId === req.partId || r.partCode === req.partCode);
    const plannedQty = req.netProductionRequirement;

    const matchingOrders = customerOrdersStore.filter(
      o =>
        (o.status === 'OPEN' || o.status === 'PARTIALLY_FULFILLED') &&
        o.lines.some(l => (l.partId === req.partId || l.partCode === req.partCode) && l.remainingQuantity > 0)
    );
    const realOrderIds = matchingOrders.map(o => o.id);
    const realOrderNumbers = matchingOrders.map(o => o.orderNumber);

    const proposedOperations: ProposedOperationPlan[] = [];
    const planWarnings: string[] = [];
    let overallFeasible = true;

    if (req.materialShortageDetected) {
      planWarnings.push(
        `کسری ماده اولیه: ${req.materialShortageKg} کیلوگرم ورق گرید ${req.requiredMaterialGrade} کسری وجود دارد.`
      );
    }

    let cumulativeHours = 0;

    if (!routing || !routing.operations.length) {
      overallFeasible = false;
      planWarnings.push(`مسیر تولید مصوب (Routing) برای قطعه «${req.partCode}» تعریف نشده است؛ ابتدا مسیر عملیات را ثبت کنید.`);
    } else {
      routing.operations.forEach(op => {
        const assignedDie =
          (op.dieMoldId ? dies.find(d => d.id === op.dieMoldId) : undefined) ||
          dies.find(d => (d.partCode === req.partCode || d.partId === req.partId) && d.processType === op.processType) ||
          dies.find(d => d.processType === op.processType);

        const candidateMachines = evaluateMachineEligibility({
          processType: op.processType,
          requiredTonnage:
            op.requiredTonnage ||
            (op.processType === 'DRAWING' ? 800 : op.processType === 'PUNCH_FORM' ? 400 : op.processType === 'BENDING' ? 160 : 0),
          plannedQuantity: plannedQty,
          standardCycleTimeSec: op.standardCycleTimeSec,
          setupTimeMin: op.setupTimeMin || 30,
          assignedDieId: op.dieMoldId,
          assignedDieCode: assignedDie?.code,
          machines,
          dies,
        });

        const eligibleMachines = candidateMachines.filter(m => m.isEligible);
        const recommended = eligibleMachines.length > 0 ? eligibleMachines[0] : null;

        const isInfeasible = !recommended;
        const infeasibilityReasons: string[] = [];

        if (isInfeasible) {
          overallFeasible = false;
          const topBlocker = candidateMachines[0]?.ineligibilityReasons[0] || 'هیچ دستگاه واجد شرایطی برای این مرحله یافت نشد.';
          infeasibilityReasons.push(topBlocker);
          planWarnings.push(`مرحله ${op.stepCode} (${op.stepName}) فاقد دستگاه واجد شرایط است: ${topBlocker}`);
        }

        const runHours =
          recommended?.estimatedRunTimeHours ||
          Math.round(((op.standardCycleTimeSec * plannedQty) / 3600) * 10) / 10;
        cumulativeHours += runHours;

        proposedOperations.push({
          stepNumber: op.stepNumber,
          stepCode: op.stepCode,
          stepName: op.stepName,
          processType: op.processType,
          requiredTonnage: op.requiredTonnage || 0,
          plannedQuantity: plannedQty,
          standardCycleTimeSec: op.standardCycleTimeSec,
          setupTimeMin: op.setupTimeMin || 30,
          estimatedRunHours: runHours,
          dieMoldId: assignedDie?.id,
          dieMoldCode: assignedDie?.code,
          dieMoldName: assignedDie?.name,
          recommendedMachine: recommended,
          allCandidateMachines: candidateMachines,
          isInfeasible,
          infeasibilityReasons,
        });
      });
    }

    const now = new Date();
    const daysNeeded = Math.max(1, Math.ceil(cumulativeHours / 15));
    const estimatedCompletion = new Date(now.getTime() + daysNeeded * 24 * 3600 * 1000).toISOString().slice(0, 10);

    if (new Date(estimatedCompletion).getTime() > new Date(req.dueDate).getTime()) {
      planWarnings.push(
        `هشدار تاخیر موعد تحویل: اتمام تخمینی (${estimatedCompletion}) پس از موعد ساپکو (${req.dueDate}) است.`
      );
    }

    const planId = `PPS-2026-${String(idx + 1).padStart(3, '0')}`;
    const planNumber = `PLN-SUG-1405-${String(idx + 1).padStart(2, '0')}`;

    suggestions.push({
      id: planId,
      planNumber,
      planVersion: 'V1.0',
      partId: req.partId,
      partCode: req.partCode,
      partName: req.partName,
      customerOrderIds: realOrderIds,
      customerOrderNumbers: realOrderNumbers,
      targetDueDate: req.dueDate,
      grossDemand: req.grossDemandQty,
      availableFg: req.availableFinishedGoodsQty,
      wipCredit: req.totalDownstreamWip,
      netRequiredQuantity: req.netProductionRequirement,
      proposedQuantity: plannedQty,
      materialStatus: {
        requiredGrade: req.requiredMaterialGrade,
        requiredWeightKg: req.requiredMaterialKg,
        availableWeightKg: req.availableRawMaterialKg,
        shortageKg: req.materialShortageKg,
        hasShortage: req.materialShortageDetected,
      },
      proposedOperations,
      overallFeasible,
      infeasibilityWarnings: planWarnings,
      estimatedStartDate: now.toISOString().slice(0, 10),
      estimatedCompletionDate: estimatedCompletion,
      approvalStatus: 'DRAFT_SUGGESTION',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  return suggestions;
}

// Initialize seed suggestions
if (planSuggestionsStore.length === 0) {
  const generated = generateProductionPlanSuggestions();
  planSuggestionsStore.push(...generated);
}

// =========================================================================
// 4. PLAN APPROVAL & SHOP FLOOR RELEASE WORKFLOW
// =========================================================================

export function approvePlanSuggestion(planId: string, approvedBy: string): {
  success: boolean;
  data?: ProductionPlanSuggestion;
  error?: string;
} {
  const plan = planSuggestionsStore.find(p => p.id === planId);
  if (!plan) return { success: false, error: 'برنامه پیشنهادی یافت نشد.' };

  plan.approvalStatus = 'APPROVED';
  plan.approvedBy = approvedBy;
  plan.approvedAt = new Date().toISOString();
  plan.updatedAt = new Date().toISOString();

  return { success: true, data: plan };
}

export function releasePlanToManufacturingOrder(planId: string, releasedBy: string): {
  success: boolean;
  mo?: ManufacturingOrder;
  plan?: ProductionPlanSuggestion;
  error?: string;
} {
  const plan = planSuggestionsStore.find(p => p.id === planId);
  if (!plan) return { success: false, error: 'برنامه پیشنهادی یافت نشد.' };

  if (plan.approvalStatus === 'CONVERTED_TO_MO' && plan.createdMoId) {
    const existingMo = manufacturingOrdersStore.find(m => m.id === plan.createdMoId);
    if (existingMo) {
      return { success: true, mo: existingMo, plan };
    }
  }

  if (plan.approvalStatus !== 'APPROVED') {
    return { success: false, error: 'فقط برنامه‌های تأییدشده توسط مدیر تولید قابل تبدیل به دستور ساخت کارگاهی هستند.' };
  }

  if (!plan.proposedOperations.length) {
    return { success: false, error: 'این برنامه فاقد مسیر تولید مصوب است و امکان صدور دستور ساخت ندارد.' };
  }

  // Release with initialInputQuantity = 0 so WIP is NOT fabricated before raw material issue
  const moResult = createManufacturingOrder({
    partId: plan.partId,
    targetQuantity: plan.proposedQuantity,
    initialInputQuantity: 0,
    startDate: plan.estimatedStartDate,
    dueDate: plan.targetDueDate,
    notes: `صادرشده از برنامه ریزی مصوب ${plan.planNumber} نسخه ${plan.planVersion}`,
    createdBy: releasedBy,
  });

  if (!moResult.success || !moResult.data) {
    return { success: false, error: moResult.error || 'خطا در ایجاد دستور ساخت' };
  }

  // Reserve machine shift workload hours for all scheduled operations
  plan.proposedOperations.forEach(op => {
    const machineId = op.recommendedMachine?.machineId;
    if (machineId) {
      machineWorkloadHoursMap[machineId] = Math.round(((machineWorkloadHoursMap[machineId] || 0) + (op.estimatedRunHours || 0)) * 10) / 10;
    }
  });

  plan.approvalStatus = 'CONVERTED_TO_MO';
  plan.createdMoId = moResult.data.id;
  plan.updatedAt = new Date().toISOString();

  return { success: true, mo: moResult.data, plan };
}

export function revisePlanVersion(planId: string, modifiedOps: ProposedOperationPlan[], note: string): {
  success: boolean;
  data?: ProductionPlanSuggestion;
  error?: string;
} {
  const plan = planSuggestionsStore.find(p => p.id === planId);
  if (!plan) return { success: false, error: 'برنامه پیشنهادی یافت نشد.' };

  const currentMajorMinor = plan.planVersion.replace('V', '').split('.');
  const major = parseInt(currentMajorMinor[0] || '1', 10);
  const minor = parseInt(currentMajorMinor[1] || '0', 10) + 1;
  const newVersion = `V${major}.${minor}`;

  plan.planVersion = newVersion;
  plan.proposedOperations = modifiedOps;
  plan.notes = (plan.notes ? `${plan.notes} | ` : '') + `اصلاح به نسخه ${newVersion}: ${note}`;
  plan.updatedAt = new Date().toISOString();

  return { success: true, data: plan };
}

// =========================================================================
// 5. PLANNING DASHBOARD METRICS
// =========================================================================

export function getPlanningDashboardMetrics(): PlanningDashboardMetrics {
  const live = getPlanningLiveStores();
  const netReqs = calculateNetRequirements();
  const suggestions = planSuggestionsStore;

  const totalOpenOrders = customerOrdersStore.filter(o => o.status === 'OPEN' || o.status === 'PARTIALLY_FULFILLED').length;
  const totalGrossDemand = netReqs.reduce((sum, r) => sum + r.grossDemandQty, 0);
  const totalNetReq = netReqs.reduce((sum, r) => sum + r.netProductionRequirement, 0);
  const totalMaterialShortage = netReqs.reduce((sum, r) => sum + r.materialShortageKg, 0);

  const activeSuggestions = suggestions.filter(s => s.approvalStatus === 'DRAFT_SUGGESTION').length;
  const approvedPlans = suggestions.filter(s => s.approvalStatus === 'APPROVED' || s.approvalStatus === 'CONVERTED_TO_MO').length;
  const infeasiblePlans = suggestions.filter(s => !s.overallFeasible).length;

  // Calculate live machine capacity utilization across active machines
  const activeMachines = live.machines.filter(m => m.status === 'ACTIVE');
  const totalCapacity = Math.max(1, activeMachines.length * 15);
  const totalWorkload = activeMachines.reduce((s, m) => s + (machineWorkloadHoursMap[m.id] || 0), 0);
  const avgUtilization = Math.round((totalWorkload / totalCapacity) * 100);

  const criticalParts = netReqs
    .filter(r => r.netProductionRequirement > 0 || r.materialShortageDetected)
    .map(r => ({
      partCode: r.partCode,
      partName: r.partName,
      netShortage: r.netProductionRequirement,
      dueDate: r.dueDate,
      hasMaterialShortage: r.materialShortageDetected,
    }));

  return {
    totalOpenOrdersCount: totalOpenOrders,
    totalGrossDemandPieces: totalGrossDemand,
    totalNetProductionRequirementsPieces: totalNetReq,
    totalMaterialShortageKg: totalMaterialShortage,
    activeSuggestionsCount: activeSuggestions,
    approvedPlansCount: approvedPlans,
    infeasiblePlansCount: infeasiblePlans,
    averageMachineCapacityUtilizationPercent: avgUtilization,
    criticalPartsRequiringImmediateAction: criticalParts,
  };
}
