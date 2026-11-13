import {
  Part,
  Machine,
  Routing,
  InventoryDocument,
  InventoryReservation,
  PhysicalCoil,
  CoilIssueReturnRecord,
  SapcoContract,
  WarehouseDefinition,
  Operator,
  ShiftDefinition,
  SavedReportConfig,
  InventoryTransaction,
  WAREHOUSES_LIST,
} from '../types/inventory';
import {
  calculateDetailedStockBalances,
  issuePhysicalCoilPartial,
  returnPhysicalCoilPartial,
  AuditRecord,
} from './inventoryEngine';
import {
  manufacturingOrdersStore,
  productionLogsStore,
  createManufacturingOrder,
  registerOperationInput,
  registerOperationProduction,
  persistProductionWipState,
} from './productionWipEngine';
import {
  customerOrdersStore,
  planSuggestionsStore,
  machineWorkloadHoursMap,
  calculateNetRequirements,
  evaluateMachineEligibility,
} from './productionPlanningEngine';
import {
  getPlanVsActualReport,
  getCustomerOrderFulfillmentReport,
  getWipAgingReport,
  getProductionDelaysReport,
} from './managementReportsEngine';
import { ReportFilterParams } from '../types/managementReports';
import { INITIAL_DIES_MOLDS } from './sampleData';

// In-memory idempotency & relational-parity fallback stores (used only when PostgreSQL is not configured)
const fallbackMaterialIssueIdempotency = new Map<string, { fingerprint: string; document: any }>();
const fallbackCoilIssueIdempotency = new Map<string, { fingerprint: string; response: any }>();
const fallbackWipProductionIdempotency = new Map<string, { mo: any; log: any; backflushIssueDocNumber?: string; receiptDocNumber?: string }>();
const fallbackPlanProposalsStore: any[] = [];
const fallbackSavedReportConfigsStore: SavedReportConfig[] = [];

const getGrossWeightKgForPart = (partCode: string, fallbackWeight = 0.98): number => {
  if (partCode === 'WIP-ECU-MAIN-BRK') return 0.98;
  if (partCode === 'WIP-ECU-COMP-BRK') return 0.47;
  if (partCode === 'SAPCO-ASY-ECU-BRK-01') return 1.45;
  return fallbackWeight;
};

export function getFallbackPlanningReadModel(
  parts: Part[],
  routings: Routing[],
  machines: Machine[],
  inventoryDocs: InventoryDocument[],
  reservations: InventoryReservation[],
) {
  const { balances } = calculateDetailedStockBalances(inventoryDocs, reservations, parts);
  const netReqs = calculateNetRequirements({
    parts,
    orders: customerOrdersStore,
    balances,
    reservations,
    activeMos: manufacturingOrdersStore,
    routings,
  });

  const requirements = netReqs.map(req => {
    const part = parts.find(p => p.id === req.partId || p.code === req.partCode);
    const routing = routings.find(r => r.partCode === req.partCode || r.partId === req.partId);
    const route = (routing?.operations || []).map(op => {
      const checks = evaluateMachineEligibility({
        processType: op.processType,
        requiredTonnage: op.requiredTonnage || 100,
        plannedQuantity: Math.max(1, req.netProductionRequirement || req.grossDemandQty),
        standardCycleTimeSec: op.standardCycleTimeSec || 12,
        setupTimeMin: op.setupTimeMin || 20,
        assignedDieId: op.dieMoldId,
        machines,
        dies: INITIAL_DIES_MOLDS,
      });
      const eligibleList = checks
        .filter(e => e.isEligible)
        .map(em => machines.find(m => m.id === em.machineId || m.code === em.machineCode))
        .filter((m): m is Machine => Boolean(m));
      const fallbackByCap = eligibleList.length
        ? eligibleList
        : machines.filter(m => m.status === 'ACTIVE' && (m.capabilities.includes(op.processType) || m.processType === op.processType));
      const assigned = machines.find(m => m.id === op.machineId) || fallbackByCap[0] || null;
      return {
        routeOperationId: `${routing?.id || 'RTG'}:${op.stepNumber}`,
        operationId: op.stepCode,
        stepNumber: op.stepNumber,
        stepCode: op.stepCode,
        stepName: op.stepName,
        dieId: op.dieMoldId || null,
        assignedMachine: assigned ? { id: assigned.id, code: assigned.code, name: assigned.name } : null,
        eligibleMachines: fallbackByCap.map(m => ({
          id: m.id,
          code: m.code,
          name: m.name,
          tonnageCapacity: m.tonnage || 0,
        })),
        machineSelectionStatus: fallbackByCap.length > 0 ? 'ELIGIBLE_FOUND' : 'NO_ELIGIBLE_MACHINE',
      };
    });

    const orderLine = customerOrdersStore
      .filter(o => o.status === 'OPEN' || o.status === 'PARTIALLY_FULFILLED')
      .flatMap(o =>
        o.lines
          .filter(l => l.partCode === req.partCode && l.remainingQuantity > 0)
          .map(l => ({
            customerOrderLineId: l.id,
            customerOrderNumber: o.orderNumber,
            dueDate: l.dueDate || o.dueDate,
            remainingQty: l.remainingQuantity,
            plannedQty: req.netProductionRequirement > 0 ? req.netProductionRequirement : l.remainingQuantity,
            priority: o.priority,
          })),
      );

    return {
      partId: part?.id || req.partId,
      partCode: req.partCode,
      partName: req.partName,
      routeId: routing?.id || null,
      route,
      demandLines: orderLine,
      grossDemandQuantity: req.grossDemandQty,
      finishedAvailableQty: req.availableFinishedGoodsQty,
      wipInProgressQty: req.totalDownstreamWip,
      netToProduceQuantity: req.netProductionRequirement,
      hasMaterialShortage: req.materialShortageDetected,
      materialShortageKg: Math.max(0, Math.round((req.requiredMaterialKg - req.availableRawMaterialKg) * 10) / 10),
      dataWarnings: req.materialShortageDetected
        ? [`کسری ورق مواد اولیه: ${Math.max(0, Math.round(req.requiredMaterialKg - req.availableRawMaterialKg))} کیلوگرم`]
        : [],
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    masterData: {
      machines: machines.map(m => ({
        id: m.id,
        code: m.code,
        name: m.name,
        tonnageCapacity: m.tonnage || 0,
        status: m.status,
      })),
    },
    requirements,
  };
}

function seedInitialFallbackProposalIfEmpty(
  parts: Part[],
  routings: Routing[],
  machines: Machine[],
  inventoryDocs: InventoryDocument[],
  reservations: InventoryReservation[],
) {
  if (fallbackPlanProposalsStore.length > 0) return;
  try {
    createFallbackProposal(
      'پیشنهاد اولیه برنامه‌ریزی براکت ضدسرقت ECU مبتنی بر موجودی زنده انبار، WIP و سفارش باز ساپکو',
      parts,
      routings,
      machines,
      inventoryDocs,
      reservations,
    );
  } catch {
    // No open unscheduled demand — safe to leave empty
  }
}

export function listFallbackProposals(
  parts: Part[],
  routings: Routing[],
  machines: Machine[],
  inventoryDocs: InventoryDocument[],
  reservations: InventoryReservation[],
) {
  seedInitialFallbackProposalIfEmpty(parts, routings, machines, inventoryDocs, reservations);
  return [...fallbackPlanProposalsStore].sort(
    (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime() || b.version - a.version,
  );
}

export function getFallbackProposal(id: string) {
  return fallbackPlanProposalsStore.find(p => p.id === id) || null;
}

export function createFallbackProposal(
  notes: string | undefined,
  parts: Part[],
  routings: Routing[],
  machines: Machine[],
  inventoryDocs: InventoryDocument[],
  reservations: InventoryReservation[],
) {
  const readModel = getFallbackPlanningReadModel(parts, routings, machines, inventoryDocs, reservations);
  const now = new Date();
  const id = `PRP-MEM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const proposalNumber = `PRP-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${String(fallbackPlanProposalsStore.length + 1).padStart(3, '0')}`;

  const lines: any[] = [];
  for (const requirement of readModel.requirements) {
    if (!requirement.routeId || !requirement.route.length) continue;
    for (const dl of requirement.demandLines) {
      if (dl.plannedQty <= 0) continue;
      lines.push({
        id: `PRPL-${Date.now()}-${lines.length + 1}`,
        customerOrderLineId: dl.customerOrderLineId,
        partId: requirement.partId,
        routeId: requirement.routeId,
        part: { partNumber: requirement.partCode, name: requirement.partName },
        customerOrderLine: {
          lineNumber: 1,
          order: { orderNumber: dl.customerOrderNumber, priority: dl.priority },
        },
        requestedQty: dl.remainingQty,
        plannedQty: dl.plannedQty,
        plannedStartDate: now.toISOString(),
        plannedEndDate: new Date(Math.max(now.getTime(), new Date(dl.dueDate).getTime())).toISOString(),
        priority: dl.priority,
        warnings: requirement.dataWarnings || [],
        operationAssignments: requirement.route.map((step: any) => ({
          routeOperationId: step.routeOperationId,
          operationId: step.operationId,
          stepNumber: step.stepNumber,
          stepCode: step.stepCode,
          stepName: step.stepName,
          machineId: step.assignedMachine?.id || step.eligibleMachines[0]?.id || null,
          dieId: step.dieId || null,
          eligibleMachineIds: step.eligibleMachines.map((m: any) => m.id),
        })),
      });
    }
  }

  if (!lines.length) {
    throw new Error('تقاضای تولیدِ برنامه‌ریزی‌نشده‌ای برای ساخت پیشنهاد جدید وجود ندارد.');
  }

  for (const existing of fallbackPlanProposalsStore) {
    if (existing.status === 'DRAFT') existing.status = 'SUPERSEDED';
  }

  const proposal = {
    id,
    proposalNumber,
    revisionGroupId: id,
    version: 1,
    status: 'DRAFT',
    generatedAt: now.toISOString(),
    notes: notes || 'پیشنهاد تولید محاسبه‌شده از سفارش‌های باز، موجودی فعلی و جریان WIP',
    productionPlan: null,
    inputSnapshot: readModel,
    lines,
  };
  fallbackPlanProposalsStore.unshift(proposal);
  return proposal;
}

export function reviseFallbackProposal(id: string, changes: any[], note?: string) {
  const existing = fallbackPlanProposalsStore.find(p => p.id === id);
  if (!existing) throw new Error('پیشنهاد برنامه یافت نشد.');
  if (existing.status !== 'DRAFT') throw new Error('فقط پیشنهاد در وضعیت پیش‌نویس قابل بازنگری است.');

  existing.status = 'SUPERSEDED';
  const revisedLines = existing.lines.map((line: any) => {
    const change = changes.find((c: any) => c.proposalLineId === line.id);
    if (!change) return { ...line };
    const updatedAssignments = (line.operationAssignments || []).map((assignment: any) => {
      const opChange = (change.operationAssignments || []).find(
        (oc: any) => oc.routeOperationId === assignment.routeOperationId,
      );
      return opChange ? { ...assignment, machineId: opChange.machineId ?? assignment.machineId } : assignment;
    });
    return { ...line, operationAssignments: updatedAssignments };
  });

  const revised = {
    ...existing,
    id: `PRP-MEM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    version: Number(existing.version) + 1,
    status: 'DRAFT',
    generatedAt: new Date().toISOString(),
    notes: note || 'نسخه بازنگری‌شده تخصیص ماشین‌آلات',
    lines: revisedLines,
  };
  fallbackPlanProposalsStore.unshift(revised);
  return revised;
}

export function approveFallbackProposal(id: string, approvedBy: string) {
  const existing = fallbackPlanProposalsStore.find(p => p.id === id);
  if (!existing) throw new Error('پیشنهاد برنامه یافت نشد.');
  if (existing.status !== 'DRAFT') throw new Error('فقط پیشنهاد پیش‌نویس قابل تایید است.');
  existing.status = 'APPROVED';
  existing.approvedBy = approvedBy;
  existing.approvedAt = new Date().toISOString();
  return existing;
}

export async function releaseFallbackProposal(
  id: string,
  releasedBy: string,
  parts: Part[],
  routings: Routing[],
) {
  const proposal = fallbackPlanProposalsStore.find(p => p.id === id);
  if (!proposal) throw new Error('پیشنهاد برنامه یافت نشد.');

  if (proposal.status === 'RELEASED' && proposal.productionPlan) {
    return {
      replayed: true,
      proposal,
      plan: proposal.productionPlan,
      manufacturingOrders: proposal.releasedManufacturingOrders || [],
    };
  }
  if (proposal.status !== 'APPROVED') {
    throw new Error('ابتدا باید پیشنهاد را تأیید کنید سپس به خط تولید صادر نمایید.');
  }

  const createdMos: any[] = [];
  for (const line of proposal.lines) {
    const part = parts.find(p => p.id === line.partId || p.code === line.part?.partNumber);
    const routing = routings.find(r => r.id === line.routeId || r.partCode === line.part?.partNumber);
    if (!part || !routing) continue;

    const moRes = createManufacturingOrder({
      partId: part.id,
      targetQuantity: Number(line.plannedQty) || 500,
      routingId: routing.id,
      dueDate: line.plannedEndDate,
      notes: `صادرشده از پیشنهاد برنامه ${proposal.proposalNumber} (نسخه ${proposal.version}) توسط ${releasedBy}`,
      createdBy: releasedBy,
    });
    if (moRes.success && moRes.data) {
      moRes.data.status = 'RELEASED';
      if (moRes.data.operations[0]) {
        moRes.data.operations[0].status = 'READY';
      }
      createdMos.push(moRes.data);
    }
  }

  await persistProductionWipState();

  const plan = {
    id: `PLN-MEM-${Date.now()}`,
    planNumber: `PLN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(fallbackPlanProposalsStore.length).padStart(2, '0')}`,
    status: 'RELEASED',
  };
  proposal.status = 'RELEASED';
  proposal.releasedBy = releasedBy;
  proposal.releasedAt = new Date().toISOString();
  proposal.productionPlan = plan;
  proposal.releasedManufacturingOrders = createdMos;

  return { replayed: false, proposal, plan, manufacturingOrders: createdMos };
}

export function getFallbackMaterialIssueOptions(
  parts: Part[],
  inventoryDocs: InventoryDocument[],
  reservations: InventoryReservation[],
  warehouses: WarehouseDefinition[],
  operators: Operator[],
) {
  const { balances } = calculateDetailedStockBalances(inventoryDocs, reservations, parts);
  const coilPartCodes = new Set(['RM-COIL-DC01A-2.0-1140', 'RM-SHT-DC01A-2.0-1000']);

  const stockBalances = balances
    .filter(b => {
      const part = parts.find(p => p.id === b.partId || p.code === b.partCode);
      if (!part) return false;
      if (part.category !== 'RAW_MATERIAL') return false;
      if (coilPartCodes.has(part.code) || b.unit === 'KG') return false;
      return b.availableQty > 0 && b.qualityBlockedQty === 0;
    })
    .map(b => {
      const part = parts.find(p => p.id === b.partId || p.code === b.partCode)!;
      const wh = warehouses.find(w => w.id === b.warehouseId) || WAREHOUSES_LIST[0];
      return {
        id: `${b.partId}::${b.warehouseId}::${b.locationCode || 'LOC-RAW-B1'}::${b.lotNumber || 'LOT'}`,
        partId: part.id,
        quantityAvailable: b.availableQty,
        weightKgAvailable: b.availableKg,
        ownership: b.ownership,
        contractNumber: b.contractNumber || null,
        part: {
          id: part.id,
          partNumber: part.code,
          name: part.name,
          unitId: part.unit,
          unit: { code: part.unit, symbol: part.unit === 'KG' ? 'kg' : 'عدد' },
        },
        warehouse: { id: wh.id, code: wh.code, name: wh.name },
        location: { id: b.locationCode || 'LOC-RAW-B1', code: b.locationCode || 'LOC-RAW-B1' },
        materialLot: b.lotNumber ? { id: b.lotNumber, lotNumber: b.lotNumber } : null,
      };
    });

  const operations = manufacturingOrdersStore
    .filter(mo => mo.status === 'RELEASED' || mo.status === 'IN_PROGRESS' || mo.status === 'PLANNED')
    .flatMap(mo =>
      mo.operations
        .filter(op => op.status !== 'COMPLETED')
        .map(op => ({
          id: op.id,
          stepNumber: op.stepNumber,
          manufacturingOrder: {
            id: mo.id,
            moNumber: mo.moNumber,
            part: { partNumber: mo.partCode, name: mo.partName },
          },
          operation: { code: op.stepCode, name: op.stepName, processType: op.processType },
          wipExecutionLink: { id: op.id, wipOperationId: op.id },
        })),
    );

  const wipWarehouses = warehouses
    .filter(w => w.id === 'WH-WIP-WELD' || w.type === 'WIP')
    .map(w => ({
      id: w.id,
      code: w.code,
      name: w.name,
      locations: (w.locations && w.locations.length ? w.locations : ['LOC-WIP-WELD-01', 'LOC-WIP-WELD-02']).map(
        (loc: any) =>
          typeof loc === 'string' ? { id: loc, code: loc } : { id: loc.id || loc.code, code: loc.code || loc.id },
      ),
    }));

  const users = operators.map(op => ({
    id: op.id,
    fullName: op.fullName,
    personnelCode: op.personnelCode,
    username: op.personnelCode,
  }));

  return { stockBalances, operations, warehouses: wipWarehouses, users };
}

export function postFallbackMaterialIssue(
  payload: any,
  parts: Part[],
  inventoryDocs: InventoryDocument[],
  reservations: InventoryReservation[],
  warehouses: WarehouseDefinition[],
  operators: Operator[],
  transactions: InventoryTransaction[],
  auditLogs: AuditRecord[],
) {
  const issueRequestKey = String(payload.issueRequestKey || '').trim();
  const sourceStockBalanceId = String(payload.sourceStockBalanceId || '').trim();
  const productionOperationId = String(payload.productionOperationId || '').trim();
  const targetWarehouseId = String(payload.targetWarehouseId || '').trim();
  const targetLocationId = String(payload.targetLocationId || '').trim();
  const createdByUserId = String(payload.createdByUserId || '').trim();
  const quantity = Number(payload.quantity);
  const suppliedWeightKg = payload.weightKg !== undefined && payload.weightKg !== null ? Number(payload.weightKg) : 0;

  if (
    !sourceStockBalanceId ||
    !productionOperationId ||
    !targetWarehouseId ||
    !targetLocationId ||
    !createdByUserId ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    throw Object.assign(new Error('موجودی مبدا، عملیات تولید، انبار و موقعیت مقصد و مقدار معتبر الزامی هستند.'), {
      statusCode: 400,
    });
  }

  const fingerprint = JSON.stringify({
    sourceStockBalanceId,
    productionOperationId,
    targetWarehouseId,
    targetLocationId,
    quantity,
    weightKg: suppliedWeightKg,
  });

  if (issueRequestKey && fallbackMaterialIssueIdempotency.has(issueRequestKey)) {
    const prior = fallbackMaterialIssueIdempotency.get(issueRequestKey)!;
    if (prior.fingerprint !== fingerprint) {
      throw Object.assign(new Error('این شناسه درخواست قبلاً با اطلاعات متفاوت استفاده شده است.'), {
        statusCode: 409,
      });
    }
    return { document: prior.document, replayed: true };
  }

  const options = getFallbackMaterialIssueOptions(parts, inventoryDocs, reservations, warehouses, operators);
  const source = options.stockBalances.find(b => b.id === sourceStockBalanceId);
  if (!source) {
    throw Object.assign(new Error('ردیف موجودی مبدا یافت نشد یا موجودی آن کافی نیست.'), { statusCode: 404 });
  }
  if (quantity > source.quantityAvailable) {
    throw Object.assign(new Error('مقدار درخواستی از موجودی آزاد بیشتر است.'), { statusCode: 409 });
  }

  const operation = options.operations.find(op => op.id === productionOperationId);
  if (!operation) {
    throw Object.assign(new Error('عملیات هدف یافت نشد یا قابل حواله نیست.'), { statusCode: 404 });
  }

  const targetWh = options.warehouses.find(w => w.id === targetWarehouseId) || options.warehouses[0];
  const actor = operators.find(o => o.id === createdByUserId);
  const nowIso = new Date().toISOString();
  const docNumber = `TRF-MAT-${Date.now().toString().slice(-6)}`;
  const partObj = parts.find(p => p.id === source.partId);
  const computedWeightKg = suppliedWeightKg > 0 ? suppliedWeightKg : Number((quantity * (partObj?.weightPerUnitKg || 0.008)).toFixed(3));

  const transferDoc: InventoryDocument = {
    id: `DOC-MAT-${Date.now()}`,
    documentNumber: docNumber,
    documentType: 'TRANSFER',
    documentDate: nowIso,
    documentStatus: 'CONFIRMED',
    postingStatus: 'POSTED',
    warehouseId: source.warehouse.id,
    warehouseName: source.warehouse.name,
    targetWarehouseId: targetWh?.id || targetWarehouseId,
    targetWarehouseName: targetWh?.name || 'انبار پای کار جوش و مونتاژ',
    ownership: source.ownership,
    contractNumber: source.contractNumber || undefined,
    referenceType: 'MANUFACTURING_ORDER',
    referenceNumber: operation.manufacturingOrder.moNumber,
    auditNote: `انتقال مواد غیرکلافی به عملیات ${operation.stepNumber} (${operation.operation.name}) - ${payload.notes || ''}`,
    lines: [
      {
        id: `LN-MAT-${Date.now()}`,
        documentId: `DOC-MAT-${Date.now()}`,
        lineNumber: 1,
        partId: source.partId,
        partCode: source.part.partNumber,
        partName: source.part.name,
        lotNumber: source.materialLot?.lotNumber || `LOT-${source.part.partNumber}`,
        ownership: source.ownership,
        contractNumber: source.contractNumber || undefined,
        locationCode: source.location.code,
        targetLocationCode: targetLocationId,
        quantity,
        unit: source.part.unit.code as 'PCS' | 'KG',
        quantityKg: computedWeightKg,
        qualityStatus: 'AVAILABLE',
        notes: payload.notes || `حواله پای‌کار عملیات ${operation.operation.name}`,
      },
    ],
    totalQuantity: quantity,
    totalWeightKg: computedWeightKg,
    createdByUid: actor?.id || createdByUserId,
    createdByName: actor?.fullName || 'انباردار تولید',
    postedByUid: actor?.id || createdByUserId,
    postedByName: actor?.fullName || 'انباردار تولید',
    postedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  inventoryDocs.unshift(transferDoc);
  transactions.unshift({
    id: `TX-MAT-${Date.now()}`,
    voucherNumber: docNumber,
    voucherType: 'ISSUE',
    partId: source.partId,
    partCode: source.part.partNumber,
    partName: source.part.name,
    stageId: 'STAGE_RAW_STORE',
    stageName: source.warehouse.name,
    targetStageId: 'STAGE_SPOT_WELD',
    targetStageName: targetWh?.name || 'انبار پای‌کار عملیات',
    quantity,
    unit: source.part.unit.code as 'PCS' | 'KG',
    quantityKg: computedWeightKg,
    referenceDoc: operation.manufacturingOrder.moNumber,
    operatorName: actor?.fullName || 'انباردار تولید',
    shift: 'MORNING',
    status: 'CONFIRMED',
    notes: transferDoc.auditNote,
    createdAt: nowIso,
  });

  auditLogs.unshift({
    id: `AUD-MAT-${Date.now()}`,
    timestamp: nowIso,
    action: 'POST_MATERIAL_ISSUE_TO_OPERATION',
    entityName: 'InventoryDocument',
    entityId: transferDoc.id,
    user: { uid: actor?.id || createdByUserId, displayName: actor?.fullName || 'انباردار تولید' },
    details: `${docNumber}: ${transferDoc.auditNote || ''}`,
  });

  if (issueRequestKey) {
    fallbackMaterialIssueIdempotency.set(issueRequestKey, { fingerprint, document: transferDoc });
  }

  return { document: transferDoc, replayed: false };
}

export function getFallbackCoilIssueOptions(parts: Part[]) {
  return manufacturingOrdersStore
    .filter(mo => ['PLANNED', 'RELEASED', 'IN_PROGRESS'].includes(mo.status))
    .map(mo => {
      const part = parts.find(p => p.id === mo.partId || p.code === mo.partCode);
      const sortedOps = [...mo.operations].sort((a, b) => a.stepNumber - b.stepNumber);
      const firstStep = sortedOps[0]?.stepNumber ?? 10;
      const eligibleOps = sortedOps.filter(
        op => op.status === 'READY' || op.status === 'IN_PROGRESS' || (op.status === 'PENDING' && op.stepNumber === firstStep),
      );
      return {
        id: mo.id,
        moNumber: mo.moNumber,
        partCode: mo.partCode,
        partName: mo.partName,
        weightNetKg: part?.weightPerUnitKg || 0.75,
        weightGrossKg: getGrossWeightKgForPart(mo.partCode, part?.weightPerUnitKg || 0.98),
        wipManufacturingOrderId: mo.id,
        status: mo.status,
        operations: eligibleOps.map(op => ({
          id: op.id,
          stepNumber: op.stepNumber,
          operationCode: op.stepCode,
          operationName: op.stepName,
          processType: op.processType,
          status: op.status,
          isFirstOperation: op.stepNumber === firstStep,
          plannedMachine: op.machineName || null,
        })),
      };
    })
    .filter(mo => mo.operations.length > 0);
}

export async function postFallbackCoilIssue(
  coilIdOrId: string,
  body: any,
  physicalCoils: PhysicalCoil[],
  coilIssueRecords: CoilIssueReturnRecord[],
  inventoryDocs: InventoryDocument[],
  parts: Part[],
  transactions: InventoryTransaction[],
) {
  const { issuedWeightKg, moId, moOperationId, scrappedKg, multiParts, initialInputQuantityPcs } = body || {};
  const issueRequestKey = String(body?.issueRequestKey || '').trim();
  const coil = physicalCoils.find(c => c.id === coilIdOrId || c.coilId === coilIdOrId);
  if (!coil) {
    throw Object.assign(new Error('کلاف فیزیکی مورد نظر یافت نشد.'), { statusCode: 404 });
  }

  const fingerprint = JSON.stringify({
    coilId: coil.id,
    issuedWeightKg: Number(issuedWeightKg) || 0,
    moId: moId || null,
    moOperationId: moOperationId || null,
    scrappedKg: Number(scrappedKg) || 0,
    initialInputQuantityPcs: Number(initialInputQuantityPcs) || 0,
    multiParts: Array.isArray(multiParts) ? multiParts : null,
  });

  if (issueRequestKey && fallbackCoilIssueIdempotency.has(issueRequestKey)) {
    const prior = fallbackCoilIssueIdempotency.get(issueRequestKey)!;
    if (prior.fingerprint !== fingerprint) {
      throw Object.assign(new Error('این شناسه درخواست قبلاً برای اطلاعات متفاوتی استفاده شده است.'), {
        statusCode: 409,
      });
    }
    return { ...prior.response, duplicate: true };
  }

  const requested = Array.isArray(multiParts) && multiParts.length > 0
    ? (() => {
        const totalGood = multiParts.reduce((s: number, r: any) => s + (Number(r.issuedWeightKg) || 0), 0);
        const totalScrap = Number(scrappedKg) || 0;
        return multiParts.map((p: any) => {
          const goodWeight = Number(p.issuedWeightKg) || 0;
          const scrapShare = totalGood > 0 ? totalScrap * (goodWeight / totalGood) : 0;
          return {
            moId: p.moId || moId || 'MO-ECU-MAIN-01',
            moOperationId: p.moOperationId || moOperationId,
            partName: p.partName,
            issuedWeightKg: goodWeight + scrapShare,
            scrappedKg: scrapShare,
            initialInputQuantityPcs: 0,
          };
        });
      })()
    : [
        {
          moId: moId || 'MO-ECU-MAIN-01',
          moOperationId,
          partName: '',
          issuedWeightKg: Number(issuedWeightKg) || 0,
          scrappedKg: Number(scrappedKg) || 0,
          initialInputQuantityPcs: Number(initialInputQuantityPcs) || 0,
        },
      ];

  const totalIssued = requested.reduce((s, r) => s + r.issuedWeightKg, 0);
  if (totalIssued <= 0 || totalIssued > coil.remainingWeightKg) {
    throw Object.assign(new Error(`وزن حواله (${totalIssued} kg) از مانده کلاف (${coil.remainingWeightKg} kg) معتبر نیست.`), {
      statusCode: 400,
    });
  }

  const nowIso = new Date().toISOString();
  const docNumber = `ISS-COIL-${Date.now().toString().slice(-6)}`;
  const createdRecords: CoilIssueReturnRecord[] = [];
  const docLines: any[] = [];

  for (let i = 0; i < requested.length; i += 1) {
    const row = requested[i];
    const mo = manufacturingOrdersStore.find(m => m.id === row.moId || m.moNumber === row.moId);
    const result = issuePhysicalCoilPartial(
      coil,
      row.issuedWeightKg,
      mo?.moNumber || row.moId,
      docNumber,
      row.scrappedKg,
      { uid: body?.user?.uid || 'USR-WH-01', displayName: body?.user?.displayName || body?.user?.fullName || 'انباردار رول و ورق' },
    );
    if (!result.success || !result.issueRecord) {
      throw Object.assign(new Error(result.error || 'خطا در صدور جزئی کلاف'), { statusCode: 409 });
    }
    createdRecords.push(result.issueRecord);
    coilIssueRecords.unshift(result.issueRecord);

    docLines.push({
      id: `LN-COIL-ISS-${Date.now()}-${i + 1}`,
      documentId: `DOC-COIL-ISS-${Date.now()}`,
      lineNumber: i + 1,
      partId: coil.partId,
      partCode: coil.partCode,
      partName: coil.partName,
      lotNumber: coil.coilId,
      heatNumber: coil.heatNumber,
      ownership: coil.ownership,
      contractId: coil.allocations?.[0]?.contractId,
      contractNumber: coil.allocations?.[0]?.contractNumber,
      locationCode: coil.warehouseLocationCode || 'LOC-RAW-A1',
      quantity: row.issuedWeightKg,
      unit: 'KG',
      quantityKg: row.issuedWeightKg,
      qualityStatus: 'AVAILABLE',
      notes: `حواله کلاف ${coil.coilId} به ${mo?.moNumber || row.moId} (${row.initialInputQuantityPcs || 0} قطعه)`,
    });

    if (row.initialInputQuantityPcs > 0 && mo && row.moOperationId) {
      const wipOp = mo.operations.find(op => op.id === row.moOperationId);
      if (wipOp) {
        registerOperationInput({
          moId: mo.id,
          operationId: wipOp.id,
          quantity: row.initialInputQuantityPcs,
          operatorName: body?.user?.fullName || 'انباردار رول و ورق',
          notes: `ورود ورق از کلاف ${coil.coilId} (سند ${docNumber})`,
        });
      }
    }
  }

  await persistProductionWipState();

  inventoryDocs.unshift({
    id: `DOC-COIL-ISS-${Date.now()}`,
    documentNumber: docNumber,
    documentType: 'ISSUE_RAW_MATERIAL',
    documentDate: nowIso,
    documentStatus: 'CONFIRMED',
    postingStatus: 'POSTED',
    warehouseId: coil.warehouseId || 'WH-RAW',
    warehouseName: coil.warehouseName || 'انبار مرکزی رول و ورق مواد اولیه',
    ownership: coil.ownership,
    contractId: coil.allocations?.[0]?.contractId,
    contractNumber: coil.allocations?.[0]?.contractNumber,
    referenceType: 'MANUFACTURING_ORDER',
    referenceNumber: requested.map(r => r.moId).join(', '),
    auditNote: `حواله ${totalIssued} کیلوگرم از کلاف ${coil.coilId} (ذوب ${coil.heatNumber}) به تولید`,
    lines: docLines,
    totalQuantity: totalIssued,
    totalWeightKg: totalIssued,
    createdByUid: body?.user?.uid || 'USR-WH-01',
    createdByName: body?.user?.fullName || 'انباردار رول و ورق',
    postedByUid: body?.user?.uid || 'USR-WH-01',
    postedByName: body?.user?.fullName || 'انباردار رول و ورق',
    postedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  transactions.unshift({
    id: `TX-COIL-ISS-${Date.now()}`,
    voucherNumber: docNumber,
    voucherType: 'ISSUE',
    partId: coil.partId || 'PRT-RM-COIL',
    partCode: coil.partCode || `RM-COIL-${coil.materialGrade}`,
    partName: coil.partName || `کلاف ورق ${coil.materialGrade}`,
    stageId: 'STAGE_RAW_STORE',
    stageName: coil.warehouseName,
    targetStageId: 'STAGE_SHEARING',
    targetStageName: 'خط برش و تولید',
    quantity: totalIssued,
    unit: 'KG',
    quantityKg: totalIssued,
    referenceDoc: `${docNumber} / ${coil.coilId}`,
    operatorName: body?.user?.fullName || 'انباردار رول و ورق',
    shift: 'MORNING',
    status: 'CONFIRMED',
    notes: `ذوب ${coil.heatNumber}`,
    createdAt: nowIso,
  });

  const payloadResp = {
    success: true,
    message: `حواله ${totalIssued} کیلوگرم از کلاف «${coil.coilId}» در سند ${docNumber} ثبت شد. مانده: ${coil.remainingWeightKg} کیلوگرم.`,
    coil,
    issueRecords: createdRecords,
    issueRecord: createdRecords[0],
    documentNumber: docNumber,
    persistence: 'IN_MEMORY_RELATIONAL_PARITY',
  };

  if (issueRequestKey) {
    fallbackCoilIssueIdempotency.set(issueRequestKey, { fingerprint, response: payloadResp });
  }
  return payloadResp;
}

export function postFallbackCoilReturn(
  coilIdOrId: string,
  body: any,
  physicalCoils: PhysicalCoil[],
  coilIssueRecords: CoilIssueReturnRecord[],
  inventoryDocs: InventoryDocument[],
  warehouses: WarehouseDefinition[],
) {
  const coil = physicalCoils.find(c => c.id === coilIdOrId || c.coilId === coilIdOrId);
  if (!coil) throw Object.assign(new Error('کلاف فیزیکی مورد نظر یافت نشد.'), { statusCode: 404 });

  const returnedKg = Number(body.returnedRemnantWeightKg);
  if (!Number.isFinite(returnedKg) || returnedKg <= 0) {
    throw Object.assign(new Error('وزن برگشتی باید عددی مثبت باشد.'), { statusCode: 400 });
  }

  const docNumber = `RET-COIL-${Date.now().toString().slice(-6)}`;
  const retRes = returnPhysicalCoilPartial(
    coil,
    returnedKg,
    docNumber,
    body.notes,
  );
  if (!retRes.success || !retRes.returnRecord) {
    throw Object.assign(new Error(retRes.error || 'خطا در ثبت برگشت ته‌کلاف'), { statusCode: 409 });
  }

  const targetWh = warehouses.find(w => w.id === body.warehouseId) || warehouses.find(w => w.id === coil.warehouseId);
  coil.physicalStatus = 'AVAILABLE';
  if (targetWh) {
    coil.warehouseId = targetWh.id;
    coil.warehouseName = targetWh.name;
  }
  if (body.locationCode) coil.warehouseLocationCode = body.locationCode;
  coil.updatedAt = new Date().toISOString();
  coilIssueRecords.unshift(retRes.returnRecord);

  const nowIso = new Date().toISOString();
  inventoryDocs.unshift({
    id: `DOC-RET-${Date.now()}`,
    documentNumber: docNumber,
    documentType: 'RECEIPT_RAW_MATERIAL',
    documentDate: nowIso,
    documentStatus: 'CONFIRMED',
    postingStatus: 'POSTED',
    warehouseId: coil.warehouseId,
    warehouseName: coil.warehouseName,
    ownership: coil.ownership,
    contractNumber: coil.allocations?.[0]?.contractNumber,
    referenceType: 'PRODUCTION_RETURN',
    referenceNumber: coil.coilId,
    auditNote: `برگشت ته‌کلاف ${returnedKg} کیلوگرمی از خط به انبار (${body.notes || ''})`,
    lines: [
      {
        id: `LN-RET-${Date.now()}`,
        documentId: `DOC-RET-${Date.now()}`,
        lineNumber: 1,
        partId: coil.partId || 'PRT-RM-COIL',
        partCode: coil.partCode || `RM-COIL-${coil.materialGrade}`,
        partName: coil.partName || `کلاف ورق ${coil.materialGrade}`,
        lotNumber: coil.coilId,
        heatNumber: coil.heatNumber,
        ownership: coil.ownership,
        locationCode: coil.warehouseLocationCode || 'LOC-RAW-A1',
        quantity: returnedKg,
        unit: 'KG',
        quantityKg: returnedKg,
        qualityStatus: 'AVAILABLE',
        notes: `برگشت ته‌کلاف ${coil.coilId}`,
      },
    ],
    totalQuantity: returnedKg,
    totalWeightKg: returnedKg,
    createdByUid: 'USR-WH-01',
    createdByName: 'انباردار رول و ورق',
    postedByUid: 'USR-WH-01',
    postedByName: 'انباردار رول و ورق',
    postedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  return {
    success: true,
    message: `ته‌کلاف ${returnedKg} کیلوگرمی با سند ${docNumber} به انبار برگشت و کاردکس به‌روزرسانی شد.`,
    coil,
    returnRecords: [retRes.returnRecord],
    returnRecord: retRes.returnRecord,
    documentNumber: docNumber,
    persistence: 'IN_MEMORY_RELATIONAL_PARITY',
  };
}

export function postFallbackCoilAllocate(
  coilIdOrId: string,
  allocations: any[],
  physicalCoils: PhysicalCoil[],
  contracts: SapcoContract[],
) {
  const coil = physicalCoils.find(c => c.id === coilIdOrId || c.coilId === coilIdOrId);
  if (!coil) throw Object.assign(new Error('کلاف فیزیکی مورد نظر یافت نشد.'), { statusCode: 404 });

  coil.allocations = allocations.map(a => {
    const cnt = contracts.find(c => c.id === a.contractId || c.contractNumber === a.contractNumber);
    return {
      contractId: cnt?.id || a.contractId,
      contractNumber: cnt?.contractNumber || a.contractNumber || a.contractId,
      coilId: coil.id,
      allocatedWeightKg: Number(a.allocatedWeightKg),
      ownership: coil.ownership,
      notes: a.notes || undefined,
    };
  });
  coil.updatedAt = new Date().toISOString();

  return {
    success: true,
    message: `تخصیص کلاف «${coil.coilId}» به قراردادها با موفقیت ثبت شد.`,
    coil,
    allocations: coil.allocations,
    documentNumber: `ADJ-ALLOC-${Date.now().toString().slice(-6)}`,
  };
}

export function getFallbackCoilGenealogy(
  coilIdOrId: string,
  physicalCoils: PhysicalCoil[],
  coilIssueRecords: CoilIssueReturnRecord[],
  inventoryDocs: InventoryDocument[],
) {
  const coil = physicalCoils.find(c => c.id === coilIdOrId || c.coilId === coilIdOrId || c.coilPackNumber === coilIdOrId);
  if (!coil) throw Object.assign(new Error('کلاف فیزیکی مورد نظر یافت نشد.'), { statusCode: 404 });

  const relatedRecords = coilIssueRecords.filter(r => r.coilId === coil.id);
  const totalIssuedKg = relatedRecords.filter(r => r.issuedWeightKg > 0).reduce((s, r) => s + r.issuedWeightKg, 0);
  const totalReturnedKg = relatedRecords.filter(r => r.returnedWeightKg > 0).reduce((s, r) => s + r.returnedWeightKg, 0);
  const netConsumedKg = Math.max(0, Number((coil.originalWeightKg - coil.remainingWeightKg).toFixed(2)));
  const relatedDocuments = inventoryDocs
    .filter(d => d.lines.some(l => l.lotNumber === coil.coilId || l.heatNumber === coil.heatNumber))
    .map(d => ({
      id: d.id,
      documentNumber: d.documentNumber,
      documentType: d.documentType,
      documentDate: d.documentDate,
      referenceNumber: d.referenceNumber || '-',
    }));

  return {
    success: true,
    source: 'IN_MEMORY_RELATIONAL_PARITY',
    data: {
      coil,
      lifecycleStatus: coil.remainingWeightKg <= 0 ? 'CONSUMED' : coil.remainingWeightKg < coil.originalWeightKg ? 'PARTIAL' : 'FULL',
      metrics: {
        originalWeightKg: coil.originalWeightKg,
        remainingWeightKg: coil.remainingWeightKg,
        totalIssuedKg: totalIssuedKg || netConsumedKg,
        totalReturnedKg,
        totalConsumedKg: netConsumedKg,
        totalVarianceKg: relatedRecords.reduce((s, r) => s + (r.varianceWeightKg || 0), 0),
        outstandingAtProductionKg: relatedRecords.reduce((s, r) => s + (r.outstandingWeightKg || 0), 0),
        utilizationPercent: coil.originalWeightKg > 0 ? Math.round((netConsumedKg / coil.originalWeightKg) * 10000) / 100 : 0,
      },
      records: relatedRecords,
      allocations: coil.allocations || [],
      relatedDocuments,
    },
  };
}

export function getFallbackWipPostingContext(
  wipMoId: string,
  shifts: ShiftDefinition[],
  operators: Operator[],
  machines: Machine[],
) {
  const wipOrder = manufacturingOrdersStore.find(o => o.id === wipMoId);
  if (!wipOrder) return null;

  const matchingOrders = manufacturingOrdersStore
    .filter(o => o.partCode === wipOrder.partCode)
    .map(o => ({
      id: o.id,
      moNumber: o.moNumber,
      part: { partNumber: o.partCode, name: o.partName },
      operations: o.operations.map(op => {
        const machine = machines.find(m => m.id === op.machineId);
        return {
          id: op.id,
          stepNumber: op.stepNumber,
          plannedMachineId: op.machineId || machine?.id || 'MCH-001',
          plannedMachine: machine ? { id: machine.id, code: machine.code, name: machine.name } : { id: 'MCH-001', code: 'PRS', name: op.machineName || 'ماشین خط' },
          operation: { processType: op.processType, name: op.stepName },
        };
      }),
    }));

  return {
    manufacturingOrders: matchingOrders,
    shifts: shifts.map(s => ({ id: s.id, code: s.code, name: s.name, startTime: s.startTime, endTime: s.endTime })),
    users: operators.map(op => ({ id: op.id, username: op.personnelCode, fullName: op.fullName, personnelCode: op.personnelCode })),
    machines: machines.map(m => ({ id: m.id, code: m.code, name: m.name })),
    identityLink: { manufacturingOrderId: wipOrder.id },
  };
}

export async function postFallbackWipOperationProduction(
  body: any,
  parts: Part[],
  physicalCoils: PhysicalCoil[],
  inventoryDocs: InventoryDocument[],
  transactions: InventoryTransaction[],
) {
  const idempotencyKey = String(body.idempotencyKey || '').trim();
  if (idempotencyKey && fallbackWipProductionIdempotency.has(idempotencyKey)) {
    const prior = fallbackWipProductionIdempotency.get(idempotencyKey)!;
    return {
      success: true,
      duplicate: true,
      message: 'این گزارش قبلاً ثبت شده است؛ ثبت تکراری انجام نشد.',
      data: prior.mo,
      report: prior.log,
      inventoryPosted: true,
    };
  }

  const preMo = manufacturingOrdersStore.find(m => m.id === body.moId || m.moNumber === body.moId);
  const preOp = preMo?.operations.find(o => o.id === body.operationId);
  const totalToReport =
    (Number(body.goodQty) || 0) +
    (Number(body.scrapQty) || 0) +
    (Number(body.reworkQty) || 0) +
    (Number(body.rejectedQty) || 0);
  if (preOp && totalToReport > (preOp.inProgressQty || 0)) {
    const deficit = totalToReport - (preOp.inProgressQty || 0);
    if ((preOp.waitingInputQty || 0) >= deficit) {
      registerOperationInput({
        moId: preMo!.id,
        operationId: preOp.id,
        quantity: deficit,
        machineId: body.machineId,
        operatorName: body.operatorName || 'اپراتور تولید',
      });
    }
  }

  const mutationResult = registerOperationProduction(body);
  if (!mutationResult.success || !mutationResult.data) {
    throw Object.assign(new Error(mutationResult.error || 'خطا در ثبت عملکرد تولید'), { statusCode: 400 });
  }

  const mo = mutationResult.data;
  const op = mo.operations.find(o => o.id === body.operationId);
  const goodQty = Math.max(0, Number(body.goodQty) || 0);
  const scrapQty = Math.max(0, Number(body.scrapQty) || 0);
  const sortedOps = [...mo.operations].sort((a, b) => a.stepNumber - b.stepNumber);
  const isFirstOp = op && sortedOps[0]?.id === op.id;
  const isFinalOp = op && sortedOps[sortedOps.length - 1]?.id === op.id;
  const nowIso = new Date().toISOString();
  const suffix = `${Date.now().toString().slice(-6)}`;
  const activeCoil = physicalCoils[0];
  const heatNumber = activeCoil?.heatNumber || 'HT-DC01A-9921';
  const coilNumber = activeCoil?.coilId || 'COIL-ECU-001';
  let postedTxCount = 0;

  // Automatic BOM Backflush in Inventory Docs when operation produces output
  if (op && goodQty > 0) {
    const issueLines: any[] = [];
    let sourceWhId = 'WH-RAW';
    let sourceWhName = 'انبار مرکزی رول و ورق مواد اولیه';

    if (mo.partCode === 'WIP-ECU-MAIN-BRK') {
      if (isFirstOp) {
        const consumedKg = Number(((goodQty + scrapQty) * 0.98).toFixed(2));
        issueLines.push({
          id: `LN-WIP-BF-${suffix}`,
          documentId: `DOC-WIP-BF-${suffix}`,
          lineNumber: 1,
          partId: 'PRT-RAW-ECU-COIL',
          partCode: 'RM-COIL-DC01A-2.0-1140',
          partName: 'رول ورق روغنی DC01A ضخامت 2mm با عرض 1140mm',
          lotNumber: coilNumber,
          heatNumber,
          ownership: 'SAPCO_SUPPLIER_OWNED',
          contractNumber: 'CNT-SAPCO-ECU-BRK',
          locationCode: 'LOC-RAW-A1',
          quantity: consumedKg,
          unit: 'KG',
          quantityKg: consumedKg,
          qualityStatus: 'AVAILABLE',
          notes: `مصرف خودکار ورق از عملیات ${op.stepCode} دستور ${mo.moNumber}`,
        });
        if (activeCoil) {
          activeCoil.remainingWeightKg = Math.max(0, Number((activeCoil.remainingWeightKg - consumedKg).toFixed(2)));
        }
      } else if (op.processType === 'SPOT_WELD' || isFinalOp) {
        const nutsQty = goodQty * 15;
        issueLines.push({
          id: `LN-WIP-BF-${suffix}-NUT`,
          documentId: `DOC-WIP-BF-${suffix}`,
          lineNumber: 1,
          partId: 'PRT-FST-NUT-M6',
          partCode: 'FST-NUT-WELD-M6',
          partName: 'مهره جوشی چهارگوش پایه‌دار M6',
          lotNumber: 'LOT-NUT-M6-01',
          heatNumber: 'HT-FST-M6',
          ownership: 'COMPANY_OWNED',
          locationCode: 'LOC-RAW-B1',
          quantity: nutsQty,
          unit: 'PCS',
          quantityKg: Number((nutsQty * 0.006).toFixed(3)),
          qualityStatus: 'AVAILABLE',
          notes: `مصرف خودکار ۱۵ عدد مهره M6 به ازای هر براکت در ${op.stepCode}`,
        });
      }
    } else if (mo.partCode === 'WIP-ECU-COMP-BRK') {
      if (isFirstOp) {
        const consumedKg = Number(((goodQty + scrapQty) * 0.47).toFixed(2));
        issueLines.push({
          id: `LN-WIP-BF-${suffix}`,
          documentId: `DOC-WIP-BF-${suffix}`,
          lineNumber: 1,
          partId: 'PRT-RAW-ECU-COIL',
          partCode: 'RM-COIL-DC01A-2.0-1140',
          partName: 'رول ورق روغنی DC01A ضخامت 2mm با عرض 1140mm',
          lotNumber: coilNumber,
          heatNumber,
          ownership: 'SAPCO_SUPPLIER_OWNED',
          contractNumber: 'CNT-SAPCO-ECU-BRK',
          locationCode: 'LOC-RAW-A1',
          quantity: consumedKg,
          unit: 'KG',
          quantityKg: consumedKg,
          qualityStatus: 'AVAILABLE',
          notes: `مصرف خودکار ورق از عملیات ${op.stepCode} دستور ${mo.moNumber}`,
        });
        if (activeCoil) {
          activeCoil.remainingWeightKg = Math.max(0, Number((activeCoil.remainingWeightKg - consumedKg).toFixed(2)));
        }
      } else if (op.processType === 'SPOT_WELD' || isFinalOp) {
        const boltsQty = goodQty * 2;
        issueLines.push({
          id: `LN-WIP-BF-${suffix}-BLT`,
          documentId: `DOC-WIP-BF-${suffix}`,
          lineNumber: 1,
          partId: 'PRT-FST-BLT-M6-20',
          partCode: 'FST-BOLT-WELD-M6-20',
          partName: 'پیچ پایه جوشی مقاومتی M6x20',
          lotNumber: 'LOT-BLT-M620-01',
          heatNumber: 'HT-FST-M620',
          ownership: 'COMPANY_OWNED',
          locationCode: 'LOC-RAW-B2',
          quantity: boltsQty,
          unit: 'PCS',
          quantityKg: Number((boltsQty * 0.008).toFixed(3)),
          qualityStatus: 'AVAILABLE',
          notes: `مصرف خودکار ۲ عدد پیچ ۶×۲۰ به ازای هر قطعه در ${op.stepCode}`,
        });
      }
    } else if (mo.partCode === 'SAPCO-ASY-ECU-BRK-01' && isFirstOp) {
      sourceWhId = 'WH-WIP-WELD';
      sourceWhName = 'انبار پای کار جوش و مونتاژ (WIP)';
      issueLines.push(
        {
          id: `LN-WIP-BF-${suffix}-M1`,
          documentId: `DOC-WIP-BF-${suffix}`,
          lineNumber: 1,
          partId: 'PRT-WIP-ECU-MAIN',
          partCode: 'WIP-ECU-MAIN-BRK',
          partName: 'صفحه براکت اصلی ضدسرقت رایانه موتور',
          lotNumber: 'LOT-ECU-MAIN-W1',
          heatNumber,
          ownership: 'COMPANY_OWNED',
          locationCode: 'LOC-WIP-WELD-01',
          quantity: goodQty,
          unit: 'PCS',
          quantityKg: Number((goodQty * 0.75).toFixed(2)),
          qualityStatus: 'AVAILABLE',
          notes: `مصرف براکت اصلی در مونتاژ ${mo.moNumber}`,
        },
        {
          id: `LN-WIP-BF-${suffix}-M2`,
          documentId: `DOC-WIP-BF-${suffix}`,
          lineNumber: 2,
          partId: 'PRT-WIP-ECU-COMP',
          partCode: 'WIP-ECU-COMP-BRK',
          partName: 'مکمل براکت ضدسرقت رایانه موتور',
          lotNumber: 'LOT-ECU-COMP-W1',
          heatNumber,
          ownership: 'COMPANY_OWNED',
          locationCode: 'LOC-WIP-WELD-02',
          quantity: goodQty,
          unit: 'PCS',
          quantityKg: Number((goodQty * 0.35).toFixed(2)),
          qualityStatus: 'AVAILABLE',
          notes: `مصرف قطعه مکمل در مونتاژ ${mo.moNumber}`,
        },
      );
    }

    if (issueLines.length > 0) {
      postedTxCount += issueLines.length;
      inventoryDocs.unshift({
        id: `DOC-WIP-BF-${suffix}`,
        documentNumber: `ISS-WIP-${suffix}`,
        documentType: 'ISSUE_RAW_MATERIAL',
        documentDate: nowIso,
        documentStatus: 'CONFIRMED',
        postingStatus: 'POSTED',
        warehouseId: sourceWhId,
        warehouseName: sourceWhName,
        ownership: issueLines[0].ownership,
        contractNumber: 'CNT-SAPCO-ECU-BRK',
        referenceType: 'MANUFACTURING_ORDER',
        referenceNumber: mo.moNumber,
        auditNote: `مصرف خودکار BOM در ثبت تولید ${op.stepCode} (${op.stepName}) - ذوب ${heatNumber}`,
        lines: issueLines,
        totalQuantity: issueLines.reduce((s, l) => s + l.quantity, 0),
        totalWeightKg: issueLines.reduce((s, l) => s + l.quantityKg, 0),
        createdByUid: body.createdByUserId || 'USR-PROD',
        createdByName: body.operatorName || 'اپراتور تولید',
        postedByUid: body.createdByUserId || 'USR-PROD',
        postedByName: body.operatorName || 'اپراتور تولید',
        postedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    if (isFinalOp) {
      const matchedPart = parts.find(p => p.code === mo.partCode || p.id === mo.partId);
      const isWip = matchedPart?.category === 'WIP_PART';
      const targetWhId = isWip ? 'WH-WIP-WELD' : 'WH-FINISHED';
      const targetWhName = isWip ? 'انبار پای کار جوش و مونتاژ (WIP)' : 'انبار محصولات نهایی آماده تحویل';
      const recWeight = Number((goodQty * (matchedPart?.weightPerUnitKg || 1.0)).toFixed(2));
      postedTxCount += 1;
      inventoryDocs.unshift({
        id: `DOC-WIP-RCV-${suffix}`,
        documentNumber: isWip ? `RCV-WIP-${suffix}` : `RCV-FG-${suffix}`,
        documentType: 'RECEIPT_FINISHED_GOODS',
        documentDate: nowIso,
        documentStatus: 'CONFIRMED',
        postingStatus: 'POSTED',
        warehouseId: targetWhId,
        warehouseName: targetWhName,
        ownership: 'COMPANY_OWNED',
        contractNumber: 'CNT-SAPCO-ECU-BRK',
        referenceType: 'MANUFACTURING_ORDER',
        referenceNumber: mo.moNumber,
        auditNote: `رسید خودکار اتمام مرحله نهایی ${mo.moNumber} با رهگیری ذوب ${heatNumber}`,
        lines: [
          {
            id: `LN-WIP-RCV-${suffix}`,
            documentId: `DOC-WIP-RCV-${suffix}`,
            lineNumber: 1,
            partId: matchedPart?.id || mo.partId,
            partCode: mo.partCode,
            partName: mo.partName,
            lotNumber: isWip ? (mo.partCode === 'WIP-ECU-MAIN-BRK' ? 'LOT-ECU-MAIN-W1' : 'LOT-ECU-COMP-W1') : `LOT-FG-${suffix}`,
            heatNumber,
            ownership: 'COMPANY_OWNED',
            locationCode: isWip ? 'LOC-WIP-WELD-01' : 'LOC-FIN-P1',
            quantity: goodQty,
            unit: 'PCS',
            quantityKg: recWeight,
            qualityStatus: 'AVAILABLE',
            notes: `رسید تولید از ${mo.moNumber}`,
          },
        ],
        totalQuantity: goodQty,
        totalWeightKg: recWeight,
        createdByUid: body.createdByUserId || 'USR-PROD',
        createdByName: body.operatorName || 'اپراتور تولید',
        postedByUid: body.createdByUserId || 'USR-PROD',
        postedByName: body.operatorName || 'اپراتور تولید',
        postedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      transactions.unshift({
        id: `TX-WIP-RCV-${suffix}`,
        voucherNumber: isWip ? `RCV-WIP-${suffix}` : `RCV-FG-${suffix}`,
        voucherType: 'PRODUCTION_OUTPUT',
        partId: matchedPart?.id || mo.partId,
        partCode: mo.partCode,
        partName: mo.partName,
        stageId: isWip ? 'STAGE_SPOT_WELD' : 'STAGE_FINISHED_STORE',
        stageName: targetWhName,
        quantity: goodQty,
        unit: 'PCS',
        quantityKg: recWeight,
        referenceDoc: `${mo.moNumber} / ${heatNumber}`,
        operatorName: body.operatorName || 'اپراتور تولید',
        shift: 'MORNING',
        status: 'CONFIRMED',
        notes: `رسید خودکار تکمیل مرحله نهایی`,
        createdAt: nowIso,
      });
    }
  }

  await persistProductionWipState();

  const log = {
    id: `WLOG-${suffix}`,
    moNumber: mo.moNumber,
    operationId: body.operationId,
    goodQty,
    scrapQty,
    createdAt: nowIso,
  };
  if (idempotencyKey) {
    fallbackWipProductionIdempotency.set(idempotencyKey, { mo, log });
  }

  return {
    success: true,
    duplicate: false,
    message: 'گزارش تولید، کسر خودکار مواد (BOM Backflush) و رسید انبار با موفقیت ثبت شدند.',
    data: mo,
    report: log,
    inventoryTransactionCount: postedTxCount,
    inventoryPosted: true,
  };
}

export function getFallbackSavedReportConfigs(): SavedReportConfig[] {
  return [...fallbackSavedReportConfigsStore];
}

export function saveFallbackReportConfig(payload: any): SavedReportConfig {
  const id = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : `REP-CFG-${Date.now()}`;
  const config: SavedReportConfig = {
    id,
    name: String(payload.name || '').trim(),
    reportType: payload.reportType,
    selectedColumns: Array.isArray(payload.selectedColumns) ? payload.selectedColumns : [],
    groupBy: Array.isArray(payload.groupBy) ? payload.groupBy : [],
    filters: payload.filters && typeof payload.filters === 'object' ? payload.filters : {},
    sortBy: payload.sortBy || undefined,
    sortOrder: payload.sortOrder === 'desc' ? 'desc' : 'asc',
    createdAt: new Date().toISOString(),
  };
  const existingIdx = fallbackSavedReportConfigsStore.findIndex(c => c.id === id);
  if (existingIdx >= 0) {
    fallbackSavedReportConfigsStore[existingIdx] = config;
  } else {
    fallbackSavedReportConfigsStore.unshift(config);
  }
  return config;
}

// =========================================================================
// LIVE-STORE MANAGEMENT REPORT FALLBACKS (PARITY WHEN POSTGRES IS UNSET)
// =========================================================================

function withinDateRange(dateStr: string | undefined, startDate?: string, endDate?: string): boolean {
  if (!dateStr) return true;
  const ts = new Date(dateStr).getTime();
  if (Number.isNaN(ts)) return true;
  if (startDate && ts < new Date(startDate).getTime()) return false;
  if (endDate && ts > new Date(`${endDate}T23:59:59.999Z`).getTime()) return false;
  return true;
}

function makeFallbackMeta(title: string, count: number, filters?: ReportFilterParams) {
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
    generatedBy: 'سیستم برنامه‌ریزی و کنترل تولید',
    appliedFilters: applied,
    totalRecordsCount: count,
  };
}

export function getFallbackPlanVsActual(filters?: ReportFilterParams) {
  const base = getPlanVsActualReport(filters);
  const proposalRows = fallbackPlanProposalsStore.flatMap(prop =>
    (prop.lines || [])
      .filter((l: any) => !filters?.partId || l.partId === filters.partId || l.partCode === filters.partId)
      .map((l: any) => {
        const relatedMos = manufacturingOrdersStore.filter(
          m => m.partCode === l.partCode || (l.moId && m.id === l.moId),
        );
        const actualProducedQuantity = relatedMos.reduce((acc, m) => acc + (m.completedQuantity || 0), 0);
        const actualScrapQuantity = relatedMos.reduce((acc, m) => acc + (m.totalScrapQuantity || 0), 0);
        const plannedQuantity = Number(l.plannedQuantity || 1);
        return {
          planId: prop.id,
          planNumber: `${prop.proposalNumber} (v${prop.version})`,
          planVersion: String(prop.version),
          partId: l.partId,
          partCode: l.partCode,
          partName: l.partName,
          plannedQuantity,
          actualProducedQuantity,
          actualScrapQuantity,
          achievementRatePercent: Math.round((actualProducedQuantity / plannedQuantity) * 1000) / 10,
          varianceQuantity: actualProducedQuantity - plannedQuantity,
          status: prop.status,
          targetDueDate: l.dueDate || prop.createdAt,
          isEstimate: prop.status !== 'RELEASED',
          linkedMoNumbers: relatedMos.map(m => m.moNumber),
        };
      }),
  );
  const seen = new Set(proposalRows.map(r => `${r.planId}:${r.partCode}`));
  const merged = [...proposalRows, ...base.data.filter(r => !seen.has(`${r.planId}:${r.partCode}`))];
  return {
    meta: makeFallbackMeta(base.meta.reportTitle, merged.length, filters),
    data: merged,
  };
}

export function getFallbackProductionBacklog(
  filters: ReportFilterParams,
  stores: { parts: Part[]; inventoryDocs: InventoryDocument[]; reservations: InventoryReservation[] },
) {
  const fulfillment = getCustomerOrderFulfillmentReport(filters).data;
  const { balances } = calculateDetailedStockBalances(stores.inventoryDocs, stores.reservations, stores.parts);
  const availableRawKgByGrade = new Map<string, number>();
  for (const b of balances) {
    if (b.category !== 'RAW_MATERIAL') continue;
    const p = stores.parts.find(x => x.id === b.partId || x.code === b.partCode);
    const grade = p?.materialGrade || 'ST14';
    availableRawKgByGrade.set(grade, (availableRawKgByGrade.get(grade) || 0) + (b.availableKg || b.physicalKg || 0));
  }

  const data = fulfillment
    .filter(item => item.remainingQuantity > 0)
    .map(item => {
      const part = stores.parts.find(p => p.id === item.partId || p.code === item.partCode);
      const weightPerUnit = part?.weightPerUnitKg || 1.2;
      const requiredRawMaterialKg = Math.round(item.remainingQuantity * weightPerUnit * 1.05 * 10) / 10;
      const availKg = availableRawKgByGrade.get(part?.materialGrade || 'ST14') || 0;
      const materialAvailabilityStatus: 'AVAILABLE' | 'PARTIAL' | 'SHORTAGE' =
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
        availableRawMaterialKg: Math.round(availKg * 10) / 10,
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    meta: makeFallbackMeta('گزارش تعهدات معوق و سفارشات عقب‌افتاده تولید (Backlog)', data.length, filters),
    data,
  };
}

export function getFallbackMaterialConsumptionActual(
  filters: ReportFilterParams,
  stores: { parts: Part[]; inventoryDocs: InventoryDocument[]; physicalCoils: PhysicalCoil[] },
) {
  const issueDocs = stores.inventoryDocs.filter(
    d =>
      d.postingStatus === 'POSTED' &&
      (d.documentType === 'ISSUE_RAW_MATERIAL' || d.documentType === 'TRANSFER') &&
      withinDateRange(d.documentDate, filters.startDate, filters.endDate),
  );

  const grouped = new Map<string, any>();

  for (const doc of issueDocs) {
    const mo =
      manufacturingOrdersStore.find(m => m.moNumber === doc.referenceNumber || m.id === doc.referenceNumber) ||
      manufacturingOrdersStore[0];
    if (!mo) continue;
    if (filters.partId && mo.partId !== filters.partId && mo.partCode !== filters.partId) continue;

    const firstOp = mo.operations[0];
    if (!firstOp) continue;
    if (filters.processType && firstOp.processType !== filters.processType) continue;
    if (filters.machineId && firstOp.machineId !== filters.machineId) continue;

    for (const line of doc.lines) {
      const part = stores.parts.find(p => p.id === line.partId || p.code === line.partCode);
      const coil = stores.physicalCoils.find(c => c.coilId === line.lotNumber || c.heatNumber === line.heatNumber);
      const key = `${mo.id}|${firstOp.id}|${line.partCode}`;

      if (!grouped.has(key)) {
        const opLogs = productionLogsStore.filter(
          l => l.moId === mo.id || l.operationId === firstOp.id,
        );
        grouped.set(key, {
          moId: mo.id,
          moNumber: mo.moNumber,
          productPartCode: mo.partCode,
          productPartName: mo.partName,
          operationId: firstOp.id,
          operationStep: firstOp.stepNumber,
          operationCode: firstOp.stepCode,
          operationName: firstOp.stepName,
          processType: firstOp.processType,
          materialCode: line.partCode,
          materialName: line.partName,
          materialGrade: part?.materialGrade || coil?.materialGrade || 'ST14',
          actualIssuedMaterialKg: 0,
          actualProducedGoodQty: firstOp.goodOutputQty || mo.completedQuantity || 0,
          actualScrapQty: firstOp.scrapQty || mo.totalScrapQuantity || 0,
          actualScrapWeightKg: Math.round((firstOp.scrapQty || 0) * (part?.weightPerUnitKg || 1.0) * 100) / 100,
          actualMachineNames: firstOp.machineName ? [firstOp.machineName] : [],
          actualOperatorNames: Array.from(
            new Set(opLogs.map(l => l.operatorName).filter((x): x is string => Boolean(x))),
          ),
          coilNumbers: [],
          contractNumbers: [],
          productionReportCount: opLogs.length || (firstOp.goodOutputQty > 0 ? 1 : 0),
          lastProductionReportAt: firstOp.lastActivityAt || doc.documentDate,
        });
      }

      const row = grouped.get(key);
      const weightKg = line.quantityKg ?? (line.unit === 'KG' ? line.quantity : line.quantity * (part?.weightPerUnitKg || 1.0));
      row.actualIssuedMaterialKg = Math.round((row.actualIssuedMaterialKg + weightKg) * 100) / 100;
      if (line.lotNumber && !row.coilNumbers.includes(line.lotNumber)) row.coilNumbers.push(line.lotNumber);
      if (doc.contractNumber && !row.contractNumbers.includes(doc.contractNumber)) {
        row.contractNumbers.push(doc.contractNumber);
      }
    }
  }

  const data = [...grouped.values()];
  return {
    meta: makeFallbackMeta('گزارش مصرف واقعی مواد به تفکیک دستور ساخت، عملیات و عملکرد واقعی خط', data.length, filters),
    summary: {
      inventoryIssueTransactions: issueDocs.length,
      productionReports: productionLogsStore.length,
      reportRows: data.length,
    },
    data,
  };
}

export function getFallbackSapcoMaterialAccount(
  filters: ReportFilterParams,
  stores: {
    contracts: SapcoContract[];
    parts: Part[];
    inventoryDocs: InventoryDocument[];
    reservations: InventoryReservation[];
  },
) {
  const { balances } = calculateDetailedStockBalances(stores.inventoryDocs, stores.reservations, stores.parts);
  const totalRawSupplierKg = balances
    .filter(b => b.category === 'RAW_MATERIAL')
    .reduce((acc, b) => acc + (b.supplierOwnedKg || b.physicalKg || 0), 0);

  const data = stores.contracts
    .filter(c => {
      if (filters.status && filters.status !== 'ALL' && c.status !== filters.status) return false;
      if (filters.partId && c.materialGrade !== filters.partId && !c.contractNumber.includes(filters.partId)) return false;
      return true;
    })
    .map(c => {
      const physicalStockInPlantKg = totalRawSupplierKg || c.closingBalanceKg;
      const discrepancyKg = Math.round((physicalStockInPlantKg - c.closingBalanceKg) * 10) / 10;
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
        physicalStockInPlantKg,
        discrepancyKg,
        status: c.status,
      };
    });

  return {
    meta: makeFallbackMeta('گزارش بیلان و حساب امانی کلاف‌های ورق ساپکو', data.length, filters),
    data,
  };
}

export function getFallbackInventoryValuationQuantities(
  filters: ReportFilterParams,
  stores: { parts: Part[]; inventoryDocs: InventoryDocument[]; reservations: InventoryReservation[] },
) {
  const { balances } = calculateDetailedStockBalances(stores.inventoryDocs, stores.reservations, stores.parts);
  const data = balances
    .filter(b => !filters.partId || b.partId === filters.partId || b.partCode === filters.partId)
    .map(b => {
      let category: 'FINISHED_GOODS' | 'RAW_SHEET_METAL' | 'WIP_PARTS' | 'QUALITY_BLOCKED' = 'FINISHED_GOODS';
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
    meta: makeFallbackMeta('گزارش تفکیک مقداری موجودی بر اساس مالکیت و وضعیت کیفی', data.length, filters),
    data,
  };
}

export function getFallbackMachineWorkloadCapacity(
  filters: ReportFilterParams,
  stores: { machines: Machine[] },
) {
  const data = stores.machines
    .filter(m => {
      if (filters.machineId && m.id !== filters.machineId && m.code !== filters.machineId) return false;
      if (filters.processType && m.processType !== filters.processType) return false;
      return true;
    })
    .map(m => {
      const isDown = m.status === 'MAINTENANCE';
      const nominalDailyCapacityHours = isDown ? 0 : 15;
      const scheduledWorkloadHours = isDown ? 0 : machineWorkloadHoursMap[m.id] || 4.5;
      const availableCapacityHours = Math.max(0, nominalDailyCapacityHours - scheduledWorkloadHours);
      const utilizationRatePercent =
        nominalDailyCapacityHours > 0 ? Math.round((scheduledWorkloadHours / nominalDailyCapacityHours) * 1000) / 10 : 0;
      let workloadCategory: 'OPTIMAL' | 'OVERLOADED' | 'HIGH_LOAD' | 'UNDER_UTILIZED' = 'OPTIMAL';
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
    meta: makeFallbackMeta('گزارش لود کاری و ظرفیت آزاد ماشین‌آلات پرس و تجهیزات', data.length, filters),
    data,
  };
}

export function getFallbackInventoryMovements(
  filters: ReportFilterParams,
  stores: { inventoryDocs: InventoryDocument[] },
) {
  const data: any[] = [];
  for (const doc of stores.inventoryDocs) {
    if (!withinDateRange(doc.documentDate, filters.startDate, filters.endDate)) continue;
    if (filters.status && filters.status !== 'ALL' && doc.postingStatus !== filters.status) continue;
    doc.lines.forEach((line, idx) => {
      if (filters.partId && line.partId !== filters.partId && line.partCode !== filters.partId) return;
      data.push({
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
  }
  return {
    meta: makeFallbackMeta('گزارش تحلیلی گردش اسناد و کاردکس جابجایی موجودی‌ها', data.length, filters),
    data,
  };
}

export function getFallbackInventoryReconciliation(
  filters: ReportFilterParams,
  stores: { parts: Part[]; inventoryDocs: InventoryDocument[]; reservations: InventoryReservation[] },
) {
  const { balances } = calculateDetailedStockBalances(stores.inventoryDocs, stores.reservations, stores.parts);
  const data = balances
    .filter(b => !filters.partId || b.partId === filters.partId || b.partCode === filters.partId)
    .map(b => ({
      locationCode: b.category === 'FINISHED_GOOD' ? 'WH-FG-01' : b.category === 'WIP_PART' ? 'WH-WIP-01' : 'WH-RAW-01',
      warehouseName:
        b.category === 'FINISHED_GOOD'
          ? 'انبار محصول نهایی'
          : b.category === 'WIP_PART'
            ? 'انبار قطعات نیمه‌ساخته (WIP)'
            : 'انبار ورق و کلاف ساپکو',
      partCode: b.partCode,
      partName: b.partName,
      bookQuantity: b.physicalQty,
      physicalCountQuantity: b.physicalQty,
      varianceQuantity: 0,
      variancePercent: 0,
      reconciliationStatus: 'BALANCED' as const,
      lastReconciledAt: new Date().toISOString(),
      reconciledBy: 'سرپرست انبارداری و انبارگردانی',
    }));
  return {
    meta: makeFallbackMeta('گزارش انبارگردانی و موازنه مغایرت فیزیکی موجودی (Reconciliation)', data.length, filters),
    data,
  };
}

export function getFallbackCoilInventory(
  filters: ReportFilterParams,
  stores: { physicalCoils: PhysicalCoil[]; contracts: SapcoContract[] },
) {
  const defaultContract = stores.contracts[0]?.contractNumber || 'CNT-SAPCO-2026-01';
  const data = stores.physicalCoils
    .filter(c => {
      if (!withinDateRange(c.receiptDate, filters.startDate, filters.endDate)) return false;
      if (filters.partId && c.materialGrade !== filters.partId && c.coilId !== filters.partId) return false;
      const remaining = c.remainingWeightKg ?? 0;
      const status =
        c.qualityStatus === 'QUALITY_BLOCKED' || c.physicalStatus === 'BLOCKED'
          ? 'BLOCKED'
          : remaining <= 0
            ? 'CONSUMED'
            : remaining < c.originalWeightKg
              ? 'PARTIAL'
              : 'FULL';
      if (filters.status && filters.status !== 'ALL' && status !== filters.status) return false;
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
        warehouseLocation: `${c.warehouseName || 'انبار رول خام'} / ${c.warehouseLocationCode || 'R-01'}`,
        ownership: c.ownership === 'COMPANY_OWNED' ? 'FACTORY_OWNED' : 'SAPCO_CONSIGNMENT',
        contractNumber: c.allocations?.[0]?.contractNumber || defaultContract,
        heatNumber: c.heatNumber || '—',
        packingNumber: c.coilPackNumber || `PKG-${c.coilId}`,
        status,
        receiptDate: c.receiptDate,
      };
    });

  return {
    meta: makeFallbackMeta('موجودی رول‌ها و کویل‌های ماده اولیه', data.length, filters),
    data,
  };
}

export function getFallbackLotConsumption(
  filters: ReportFilterParams,
  stores: {
    coilIssueRecords: CoilIssueReturnRecord[];
    inventoryDocs: InventoryDocument[];
    physicalCoils: PhysicalCoil[];
    parts: Part[];
  },
) {
  const fromRecords = stores.coilIssueRecords
    .filter(r => withinDateRange(r.issuedAt, filters.startDate, filters.endDate))
    .map(r => {
      const coil = stores.physicalCoils.find(c => c.id === r.coilId || c.coilId === r.coilId);
      const mo = manufacturingOrdersStore.find(m => m.id === r.manufacturingOrderId || m.moNumber === r.manufacturingOrderId);
      const consumed = r.consumedWeightKg || r.issuedWeightKg || 0;
      const scrapKg = r.scrappedKg ?? Math.round(consumed * 0.035 * 10) / 10;
      const part = stores.parts.find(p => p.code === (mo?.partCode || coil?.partCode));
      return {
        issueDocumentNumber: r.documentNumber || r.id,
        issueDate: r.issuedAt,
        coilNumber: coil?.coilId || r.coilId,
        heatNumber: coil?.heatNumber || '—',
        materialGrade: coil?.materialGrade || 'ST14',
        thicknessMm: coil?.thicknessMm || 1.5,
        consumedKg: consumed,
        destinationMachine: mo?.operations?.[0]?.machineName || 'خط پرس',
        targetMoNumber: mo?.moNumber || r.manufacturingOrderId || '—',
        targetPartCode: mo?.partCode || coil?.partCode || '—',
        targetPartName: mo?.partName || part?.name || '—',
        piecesProduced: part?.weightPerUnitKg ? Math.round(consumed / part.weightPerUnitKg) : 0,
        scrapKg,
        scrapPercent: consumed > 0 ? Math.round((scrapKg / consumed) * 1000) / 10 : 0,
        operatorName: 'اپراتور تولید',
      };
    });

  const issueDocs = stores.inventoryDocs.filter(
    d =>
      (d.documentType === 'ISSUE_RAW_MATERIAL' || d.documentType === 'TRANSFER') &&
      withinDateRange(d.documentDate, filters.startDate, filters.endDate),
  );
  const docRows: any[] = [];
  for (const doc of issueDocs) {
    if (fromRecords.some(r => r.issueDocumentNumber === doc.documentNumber)) continue;
    const matchedMo = manufacturingOrdersStore.find(m => m.moNumber === doc.referenceNumber) || manufacturingOrdersStore[0];
    for (const line of doc.lines) {
      const coil = stores.physicalCoils.find(c => c.coilId === line.lotNumber || c.heatNumber === line.heatNumber);
      const part = stores.parts.find(p => p.code === (matchedMo?.partCode || line.partCode));
      const consumedKg = line.quantityKg || line.quantity;
      const scrapKg = Math.round(consumedKg * 0.03 * 10) / 10;
      docRows.push({
        issueDocumentNumber: doc.documentNumber,
        issueDate: doc.documentDate,
        coilNumber: line.lotNumber || 'LOT-RAW-01',
        heatNumber: line.heatNumber || coil?.heatNumber || '—',
        materialGrade: part?.materialGrade || coil?.materialGrade || 'ST14',
        thicknessMm: coil?.thicknessMm || 1.5,
        consumedKg,
        destinationMachine: doc.targetWarehouseName || 'خط تولید پرس',
        targetMoNumber: doc.referenceNumber || matchedMo?.moNumber || '—',
        targetPartCode: matchedMo?.partCode || line.partCode,
        targetPartName: matchedMo?.partName || line.partName,
        piecesProduced: part?.weightPerUnitKg ? Math.round(consumedKg / part.weightPerUnitKg) : 0,
        scrapKg,
        scrapPercent: 3.0,
        operatorName: doc.createdByName || 'اپراتور شیفت',
      });
    }
  }

  const data = [...fromRecords, ...docRows].filter(
    r => !filters.partId || r.targetPartCode === filters.partId || r.targetMoNumber === filters.partId,
  );
  return {
    meta: makeFallbackMeta('ردیابی مصرف رول/لوت پای پرس‌ها', data.length, filters),
    data,
  };
}

export function getFallbackSupplierMatrix(
  filters: ReportFilterParams,
  stores: { physicalCoils: PhysicalCoil[] },
) {
  const groupMap = new Map<
    string,
    {
      grade: string;
      thicknessMm: number;
      financialReceivedKg: number;
      consignmentReceivedKg: number;
      totalConsumptionKg: number;
      closingBalanceKg: number;
      count: number;
    }
  >();

  for (const c of stores.physicalCoils) {
    if (filters.partId && c.materialGrade !== filters.partId) continue;
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
  }

  const data = Array.from(groupMap.values()).map(g => ({
    grade: g.grade,
    thicknessMm: g.thicknessMm,
    openingBalanceKg: 0,
    financialReceivedKg: Math.round(g.financialReceivedKg * 100) / 100,
    consignmentReceivedKg: Math.round(g.consignmentReceivedKg * 100) / 100,
    totalConsumptionKg: Math.round(g.totalConsumptionKg * 100) / 100,
    otherMovementKg: 0,
    closingBalanceKg: Math.round(g.closingBalanceKg * 100) / 100,
    totalCoilsCount: g.count,
    status: 'BALANCED' as const,
  }));

  return {
    meta: makeFallbackMeta('ماتریس حساب مواد تأمین‌کننده (گرید × ضخامت)', data.length, filters),
    data,
  };
}

export function getFallbackDashboardSummary(
  filters: ReportFilterParams,
  stores: {
    parts: Part[];
    machines: Machine[];
    inventoryDocs: InventoryDocument[];
    reservations: InventoryReservation[];
  },
) {
  const { balances } = calculateDetailedStockBalances(stores.inventoryDocs, stores.reservations, stores.parts);
  const activeOrders = customerOrdersStore.filter(o => o.status === 'OPEN' || o.status === 'PARTIALLY_FULFILLED');
  const totalGrossDemandPieces = activeOrders.reduce(
    (acc, o) => acc + o.lines.reduce((lAcc, l) => lAcc + l.remainingQuantity, 0),
    0,
  );
  const totalPlannedProductionPieces =
    fallbackPlanProposalsStore.length > 0
      ? (fallbackPlanProposalsStore[0].lines || []).reduce((acc: number, l: any) => acc + Number(l.plannedQuantity || 0), 0)
      : planSuggestionsStore.reduce((acc, p) => acc + p.proposedQuantity, 0);
  const totalActualProducedPieces = manufacturingOrdersStore.reduce((acc, m) => acc + (m.completedQuantity || 0), 0);
  const overallPlanAchievementRatePercent =
    totalPlannedProductionPieces > 0
      ? Math.round((totalActualProducedPieces / totalPlannedProductionPieces) * 1000) / 10
      : 0;
  const delaysReport = getProductionDelaysReport(filters).data;
  const totalWipQuantityPieces = manufacturingOrdersStore.reduce(
    (acc, mo) =>
      acc +
      mo.operations.reduce(
        (oAcc, op) => oAcc + (op.waitingInputQty || 0) + (op.inProgressQty || 0) + (op.readyForTransferQty || 0),
        0,
      ),
    0,
  );
  const fgBalances = balances.filter(b => b.category === 'FINISHED_GOOD');
  const totalFinishedGoodsStockPieces = fgBalances.reduce(
    (acc, b) => acc + (b.unit === 'PCS' ? b.availableQty : 0),
    0,
  );
  const totalScrapPieces = manufacturingOrdersStore.reduce((acc, m) => acc + (m.totalScrapQuantity || 0), 0);
  const totalScrapWeightKg = Math.round(totalScrapPieces * 1.15 * 10) / 10;
  const machineReport = getFallbackMachineWorkloadCapacity(filters, { machines: stores.machines }).data;
  const reliableMachines = machineReport.filter(m => m.isReliableCapacityData);
  const averageMachineUtilizationPercent =
    reliableMachines.length > 0
      ? Math.round((reliableMachines.reduce((acc, m) => acc + m.utilizationRatePercent, 0) / reliableMachines.length) * 10) / 10
      : 0;
  const stagnantWipItemsCount = getWipAgingReport(filters).data.filter(
    i => i.statusSeverity === 'CRITICAL' || i.statusSeverity === 'ATTENTION',
  ).length;
  const netReqs = calculateNetRequirements({
    parts: stores.parts,
    orders: customerOrdersStore,
    balances,
    reservations: stores.reservations,
    activeMos: manufacturingOrdersStore,
  });
  const totalMaterialShortageKg = Math.round(
    netReqs.reduce((acc, r) => acc + (r.materialShortageKg || 0), 0) * 10,
  ) / 10;

  return {
    activeCustomerOrdersCount: activeOrders.length,
    totalGrossDemandPieces,
    totalPlannedProductionPieces,
    totalActualProducedPieces,
    overallPlanAchievementRatePercent,
    totalDelayedOrdersCount: delaysReport.length,
    totalMaterialShortageKg,
    totalWipQuantityPieces,
    totalFinishedGoodsStockPieces,
    totalScrapPieces,
    totalScrapWeightKg,
    averageMachineUtilizationPercent,
    reliableMachinesCount: reliableMachines.length,
    activeManufacturingOrdersCount: manufacturingOrdersStore.length,
    stagnantWipItemsCount,
    lastUpdatedTimestamp: new Date().toISOString(),
  };
}
