/**
 * KPIMS - Phase 8 & 9: Material Requirements Planning (MRP) Engine
 * موتور محاسبه پیش‌بینی نیازمندی مواد و کلاف‌ها، موازنه تأمین ساپکو و بررسی پیش از حواله
 */

import {
  MrpMaterialRow,
  MrpPartRow,
  MrpRunResult,
  MoMaterialCheckResult,
  MoMaterialCheckLine,
  MrpMatchingCoilInfo,
  MrpContractCoverage,
  MrpMaterialDemandSource,
} from '../types/mrp';
import { INITIAL_PARTS, INITIAL_SAPCO_COILS, INITIAL_ROUTINGS } from './sampleData';
import { customerOrdersStore } from './productionPlanningEngine';
import { manufacturingOrdersStore } from './productionWipEngine';
import {
  INITIAL_SAPCO_CONTRACTS,
  INITIAL_INVENTORY_RESERVATIONS,
  INITIAL_INVENTORY_DOCUMENTS,
} from './inventorySampleData';
import { calculateDetailedStockBalances } from './inventoryEngine';
import {
  Part,
  Routing,
  SapcoCoilReceipt,
  PhysicalCoil,
  SapcoContract,
  InventoryDocument,
  InventoryReservation,
  CoilIssueReturnRecord,
  StockOwnership,
} from '../types/inventory';
import { toPersianDigits } from '../utils/formatters';
import { formatToJalali } from '../utils/jalali';
import { getAllBoms } from './bomAndParallelEngine';

// Fallback reservations store if apiRouter hasn't registered its live provider yet
export const activeReservationsStore: InventoryReservation[] = JSON.parse(
  JSON.stringify(INITIAL_INVENTORY_RESERVATIONS)
);

export interface MrpRuntimeStoresSnapshot {
  parts: Part[];
  routings: Routing[];
  coils: SapcoCoilReceipt[];
  physicalCoils: PhysicalCoil[];
  contracts: SapcoContract[];
  inventoryDocs: InventoryDocument[];
  reservations: InventoryReservation[];
  coilIssueRecords: CoilIssueReturnRecord[];
}

let runtimeStoresProvider: (() => MrpRuntimeStoresSnapshot) | null = null;

export function registerMrpRuntimeProvider(provider: () => MrpRuntimeStoresSnapshot) {
  runtimeStoresProvider = provider;
}

const FALLBACK_PHYSICAL_COILS: PhysicalCoil[] = INITIAL_SAPCO_COILS.map((c, idx) => {
  const rem = Math.max(0, (c.receivedWeightKg || 0) - (c.consumedWeightKg || 0));
  return {
    id: `COIL-PHYS-FB-${idx + 1}`,
    coilId: c.id,
    coilPackNumber: c.coilNumber,
    partId: c.partId,
    partCode: c.partCode,
    partName: c.partName,
    materialGrade: c.materialGrade,
    heatNumber: c.heatNumber,
    thicknessMm: c.thicknessMm,
    widthMm: c.widthMm || 1140,
    originalWeightKg: c.receivedWeightKg,
    remainingWeightKg: rem,
    warehouseId: 'WH-RAW',
    warehouseName: 'انبار مرکزی رول و ورق مواد اولیه',
    warehouseLocationCode: `LOC-RAW-A${idx + 1}`,
    ownership: idx === 0 ? 'SAPCO_SUPPLIER_OWNED' : 'COMPANY_OWNED',
    qualityStatus: 'AVAILABLE',
    physicalStatus: c.consumedWeightKg > 0 && rem > 0 ? 'PARTIALLY_ISSUED' : rem <= 0 ? 'CONSUMED' : 'AVAILABLE',
    supplierName: idx === 0 ? 'ساپکو (ایران‌خودرو)' : 'فولاد مبارکه',
    receiptDate: c.receiptDate,
    allocations: [],
  };
});

function getLiveStores(): MrpRuntimeStoresSnapshot {
  if (runtimeStoresProvider) {
    return runtimeStoresProvider();
  }
  return {
    parts: INITIAL_PARTS,
    routings: INITIAL_ROUTINGS,
    coils: INITIAL_SAPCO_COILS,
    physicalCoils: FALLBACK_PHYSICAL_COILS,
    contracts: INITIAL_SAPCO_CONTRACTS,
    inventoryDocs: INITIAL_INVENTORY_DOCUMENTS,
    reservations: activeReservationsStore,
    coilIssueRecords: [],
  };
}

// Runtime store for MRP Purchase Requisitions (PR) synced across frontend & snapshot
export interface MrpPurchaseRequisition {
  id: string;
  prNumber: string;
  materialCode: string;
  materialName: string;
  materialGrade?: string;
  quantity: number;
  unit: string;
  status: 'OPEN' | 'APPROVED' | 'ORDERED' | 'CANCELLED';
  requestedBy: string;
  createdAt: string;
  createdAtFa: string;
  notes?: string;
}

export const mrpPurchaseRequisitionsStore: MrpPurchaseRequisition[] = [];

// Runtime store for QC Hold (قرنطینه کیفی) overrides synced from Inventory & Coils
export interface ServerQcHoldOverride {
  key: string;
  partId?: string;
  partCode?: string;
  materialGrade?: string;
  lotNumber?: string;
  isHeld: boolean;
  heldQty: number;
  heldWeightKg: number;
  reasonFa: string;
  updatedAt: string;
}

export const serverQcHoldStore: Record<string, ServerQcHoldOverride> = {};

// Runtime store for VIP parts (قطعات کلیدی - فقط مجموعه براکت ضدسرقت رایانه موتور)
export const serverVipPartsStore: Record<string, boolean> = {
  'PRT-FGD-ECU-BRK': true,
  'SAPCO-ASY-ECU-BRK-01': true,
};

function getJalaliNowString(): string {
  return formatToJalali(new Date(), { includeTime: true });
}

function resolveRawMaterialForSheetComponent(
  parts: Part[],
  cmpPart: Part | undefined,
  assemblyPart: Part | undefined,
  cmpName: string,
  cmpCode: string
): {
  materialCode: string;
  materialName: string;
  grade: string;
  thicknessMm: number;
  widthMm: number;
} {
  // If BOM explicitly references a raw material part, preserve it directly
  if (cmpPart && cmpPart.category === 'RAW_MATERIAL') {
    const grade = cmpPart.materialGrade || assemblyPart?.materialGrade || 'DC01A';
    const thickness = cmpPart.thicknessMm || assemblyPart?.thicknessMm || 2.0;
    return {
      materialCode: cmpPart.code,
      materialName: cmpPart.name,
      grade,
      thicknessMm: thickness,
      widthMm: cmpPart.code.includes('1000') ? 1000 : 1140,
    };
  }

  // Try extracting grade & thickness from component metadata / name / assembly part
  const gradeMatch = (cmpName + ' ' + cmpCode).match(/\b(DC01A|DC04|ST14|ST12|DX51D|S355MC)\b/i);
  const grade = (gradeMatch ? gradeMatch[1].toUpperCase() : cmpPart?.materialGrade || assemblyPart?.materialGrade || 'DC01A');
  const thkMatch = cmpName.match(/(\d+(?:\.\d+)?)\s*mm/i);
  const thickness = thkMatch ? parseFloat(thkMatch[1]) : (cmpPart?.thicknessMm || assemblyPart?.thicknessMm || 2.0);
  const widthMatch = cmpName.match(/[×x*]\s*(1000|1140|1250)/);
  const width = widthMatch ? parseInt(widthMatch[1], 10) : 1140;

  // Match an existing RAW_MATERIAL part in catalog with the same grade & thickness
  const matchingRawPart = parts.find(
    p =>
      p.category === 'RAW_MATERIAL' &&
      p.unit === 'KG' &&
      (p.materialGrade || '').toUpperCase() === grade &&
      (!p.thicknessMm || Math.abs(p.thicknessMm - thickness) < 0.05) &&
      (!widthMatch || p.code.includes(String(width)))
  ) || parts.find(
    p =>
      p.category === 'RAW_MATERIAL' &&
      p.unit === 'KG' &&
      (p.materialGrade || '').toUpperCase() === grade
  );

  if (matchingRawPart) {
    return {
      materialCode: matchingRawPart.code,
      materialName: matchingRawPart.name,
      grade: matchingRawPart.materialGrade || grade,
      thicknessMm: matchingRawPart.thicknessMm || thickness,
      widthMm: matchingRawPart.code.includes('1000') ? 1000 : width,
    };
  }

  const normalizedKey = `RM-COIL-${grade}-${thickness.toFixed(1)}-${width}`;
  return {
    materialCode: normalizedKey,
    materialName: `رول ورق فولادی ${grade} ضخامت ${thickness}mm عرض ${width}mm`,
    grade,
    thicknessMm: thickness,
    widthMm: width,
  };
}

function getQcHoldForMaterial(
  materialCode: string,
  partId: string | undefined,
  matchingLotNumbers: Set<string>,
  unitCode: string = 'KG'
): number {
  return Object.values(serverQcHoldStore).reduce((sum, hold) => {
    if (!hold.isHeld) return sum;
    const matchesPart =
      (hold.partCode && hold.partCode === materialCode) ||
      (partId && hold.partId && hold.partId === partId);
    const matchesLot = hold.lotNumber && matchingLotNumbers.has(hold.lotNumber);
    if (!matchesPart && !matchesLot) return sum;
    return (
      sum +
      Number(
        unitCode === 'KG'
          ? hold.heldWeightKg || hold.heldQty || 0
          : hold.heldQty || hold.heldWeightKg || 0
      )
    );
  }, 0);
}

/**
 * Run a full MRP calculation across open demand exploded through live BOMs, Stock Ledger, Coils & WIP
 */
export function runFullMrp(options?: {
  partIds?: string[];
  horizonDays?: number;
  demandGrowthPercent?: number;
  includeWip?: boolean;
  includeConsignment?: boolean;
}): MrpRunResult {
  const {
    parts,
    routings,
    coils,
    physicalCoils,
    contracts,
    inventoryDocs,
    reservations,
  } = getLiveStores();
  const orders = customerOrdersStore;
  const boms = getAllBoms();
  const mos = manufacturingOrdersStore;

  const demandGrowthMultiplier = 1 + Math.max(0, options?.demandGrowthPercent || 0) / 100;
  const includeWip = options?.includeWip ?? true;
  const includeConsignment = options?.includeConsignment ?? true;

  // 1. Gather all open customer orders
  const openOrders = orders.filter(o => o.status === 'OPEN' || o.status === 'PARTIALLY_FULFILLED');
  const grossDemandByPart = new Map<string, { totalDemand: number; orderCount: number }>();

  let totalOrderLines = 0;
  openOrders.forEach(o => {
    o.lines.forEach(line => {
      if (options?.partIds?.length && !options.partIds.includes(line.partId) && !options.partIds.includes(line.partCode)) return;
      if (line.remainingQuantity <= 0) return;

      totalOrderLines++;
      const key = line.partId || line.partCode;
      const current = grossDemandByPart.get(key) || { totalDemand: 0, orderCount: 0 };
      current.totalDemand += Math.round(line.remainingQuantity * demandGrowthMultiplier);
      current.orderCount += 1;
      grossDemandByPart.set(key, current);
    });
  });

  // Calculate live stock balances from live posted documents & unified reservations
  const balances = calculateDetailedStockBalances(inventoryDocs, reservations, parts).balances;

  // 2. Netting at Part Level (FG stock, FG reservations, WIP, Planned MOs)
  const partRows: MrpPartRow[] = [];
  const partNetRequirementsMap = new Map<string, number>();

  grossDemandByPart.forEach((demand, partId) => {
    const part = parts.find(p => p.id === partId || p.code === partId);
    if (!part) return;

    // FG on-hand stock
    const fgRecords = balances.filter(
      b => (b.partId === part.id || b.partCode === part.code) && b.warehouseId === 'WH-FINISHED'
    );
    const fgPhysical = fgRecords.reduce((sum, b) => sum + b.physicalQty, 0);
    const fgBlocked = fgRecords.reduce((sum, b) => sum + b.qualityBlockedQty, 0);

    const fgBlockedFromStore = Object.values(serverQcHoldStore)
      .filter(h => h.isHeld && (h.partId === part.id || h.partCode === part.code))
      .reduce((sum, h) => sum + (h.heldQty || 0), 0);
    const effectiveFgBlocked = fgBlocked + fgBlockedFromStore;

    // FG reservations
    const fgRes = reservations.filter(
      r => (r.partId === part.id || r.partCode === part.code) && r.status === 'ACTIVE' && r.warehouseId === 'WH-FINISHED'
    );
    const coveredByFgReservations = fgRes.reduce((sum, r) => sum + r.quantity, 0);
    const coveredByFgStock = Math.max(0, fgPhysical - effectiveFgBlocked - coveredByFgReservations);

    // WIP across active operations
    let coveredByWip = 0;
    if (includeWip) {
      const partMos = mos.filter(
        m => (m.partId === part.id || m.partCode === part.code) && (m.status === 'IN_PROGRESS' || m.status === 'RELEASED')
      );
      partMos.forEach(m => {
        m.operations.forEach(op => {
          coveredByWip += (op.waitingInputQty || 0) + (op.inProgressQty || 0) + (op.readyForTransferQty || 0);
        });
      });
    }

    // Active PLANNED MOs target quantities not yet released to WIP
    const plannedMosForPart = mos.filter(
      m => (m.partId === part.id || m.partCode === part.code) && m.status === 'PLANNED'
    );
    const coveredByActiveMos = plannedMosForPart.reduce((sum, m) => sum + m.targetQuantity, 0);

    // Net requirement for manufacturing this finished part
    const netReq = Math.max(0, demand.totalDemand - coveredByFgStock - coveredByWip - coveredByActiveMos);
    partNetRequirementsMap.set(part.id, netReq);

    const hasBom = boms.some(b => b.assemblyPartId === part.id || b.assemblyPartCode === part.code);
    const hasRouting = routings.some(r => r.partId === part.id || r.partCode === part.code);
    const isVIP = Boolean(
      part.isVIP ||
      part.isPinned ||
      serverVipPartsStore[part.id] ||
      serverVipPartsStore[part.code]
    );

    partRows.push({
      partId: part.id,
      partCode: part.code,
      partName: part.name,
      carModel: part.carModel,
      isVIP,
      grossDemand: demand.totalDemand,
      coveredByFgStock,
      coveredByFgReservations,
      coveredByWip,
      coveredByActiveMos,
      netRequirement: netReq,
      hasBom,
      hasRouting,
      missingInfo: [
        ...(!hasBom ? ['عدم ثبت درخت BOM تفصیلی'] : []),
        ...(!hasRouting ? ['عدم ثبت مسیر تولید مصوب'] : []),
      ],
    });
  });

  partRows.sort((a, b) => {
    if (Boolean(a.isVIP) !== Boolean(b.isVIP)) return a.isVIP ? -1 : 1;
    return b.netRequirement - a.netRequirement;
  });

  // 3. Explode Net Demand through live BOMs into Raw Materials, Coils & Hardware
  interface RawRequirementAccumulator {
    materialCode: string;
    materialName: string;
    grade: string;
    thicknessMm: number;
    widthMm: number;
    unitCode: string;
    totalQuantity: number;
    totalWeightKg: number;
    demandedByParts: MrpMaterialDemandSource[];
  }

  const rawMap = new Map<string, RawRequirementAccumulator>();

  partRows.forEach(pRow => {
    const netQty = pRow.netRequirement;
    if (netQty <= 0) return;

    const bom = boms.find(b => b.assemblyPartId === pRow.partId || b.assemblyPartCode === pRow.partCode);
    const partObj = parts.find(p => p.id === pRow.partId || p.code === pRow.partCode);

    if (bom && bom.components.length > 0) {
      bom.components.forEach(cmp => {
        const cmpPart = parts.find(p => p.id === cmp.componentPartId || p.code === cmp.componentPartCode);
        const componentQty = netQty * cmp.quantityPerAssembly;
        const scrapFactor = 1 + (cmp.scrapAllowancePercent || 0) / 100;
        const perUnitWeight = cmp.grossWeightKg || cmpPart?.weightPerUnitKg || 0.1;
        const grossWeightKg = Math.round(componentQty * perUnitWeight * scrapFactor * 10) / 10;

        let materialKey = cmp.componentPartCode;
        let materialName = cmp.componentPartName;
        let grade = cmpPart?.materialGrade || partObj?.materialGrade || 'DC01A';
        let thickness = cmpPart?.thicknessMm || partObj?.thicknessMm || 0;
        let width = 0;

        if (cmp.componentType === 'RAW_SHEET' || cmpPart?.category === 'RAW_MATERIAL' && cmpPart.unit === 'KG') {
          const resolved = resolveRawMaterialForSheetComponent(
            parts,
            cmpPart,
            partObj,
            cmp.componentPartName,
            cmp.componentPartCode
          );
          materialKey = resolved.materialCode;
          materialName = resolved.materialName;
          grade = resolved.grade;
          thickness = resolved.thicknessMm;
          width = resolved.widthMm;
        } else if (cmp.componentType === 'FASTENER_HARDWARE') {
          grade = cmp.componentPartCode.includes('NUT') ? 'FST-NUT-M6' : cmp.componentPartCode.includes('BOLT') ? 'FST-BOLT-M6' : (cmpPart?.materialGrade || 'FASTENER');
          thickness = 0;
          width = 0;
        }

        const isWeightBased = cmp.unit === 'KG' || cmp.componentType === 'RAW_SHEET';
        const existing = rawMap.get(materialKey) || {
          materialCode: materialKey,
          materialName,
          grade,
          thicknessMm: thickness,
          widthMm: width,
          unitCode: isWeightBased ? 'KG' : 'PCS',
          totalQuantity: 0,
          totalWeightKg: 0,
          demandedByParts: [],
        };

        existing.totalQuantity += isWeightBased ? grossWeightKg : componentQty;
        existing.totalWeightKg += grossWeightKg;
        existing.demandedByParts.push({
          partId: pRow.partId,
          partCode: pRow.partCode,
          partName: `${pRow.partName} (${cmp.componentPartName})`,
          requiredQuantity: componentQty,
          weightKg: grossWeightKg,
        });

        rawMap.set(materialKey, existing);
      });
    } else {
      // Dynamic fallback derived from assembly part's actual specification (never hardcoded DC01A unless part is DC01A)
      const resolved = resolveRawMaterialForSheetComponent(
        parts,
        undefined,
        partObj,
        pRow.partName,
        pRow.partCode
      );
      const unitWeight = partObj?.weightPerUnitKg || 1.25;
      const totalWeightKg = Math.round(netQty * unitWeight * 1.15 * 10) / 10;

      const existing = rawMap.get(resolved.materialCode) || {
        materialCode: resolved.materialCode,
        materialName: resolved.materialName,
        grade: resolved.grade,
        thicknessMm: resolved.thicknessMm,
        widthMm: resolved.widthMm,
        unitCode: 'KG',
        totalQuantity: 0,
        totalWeightKg: 0,
        demandedByParts: [],
      };

      existing.totalQuantity += totalWeightKg;
      existing.totalWeightKg += totalWeightKg;
      existing.demandedByParts.push({
        partId: pRow.partId,
        partCode: pRow.partCode,
        partName: pRow.partName,
        requiredQuantity: netQty,
        weightKg: totalWeightKg,
      });

      rawMap.set(resolved.materialCode, existing);
    }
  });

  // Ensure baseline ECU Bracket raw materials stay observable in the catalog matrix when present
  const defaultMaterialKeys = [
    { key: 'RM-COIL-DC01A-2.0-1140', name: 'رول ورق روغنی DC01A ضخامت 2mm با عرض 1140mm (ابعاد ۲×۱۱۴۰)', grade: 'DC01A', thk: 2.0, width: 1140, unit: 'KG' },
    { key: 'RM-SHT-DC01A-2.0-1000', name: 'ورق شیت روغنی DC01A ضخامت 2mm ابعاد ۲×۱۰۰۰ (ورق آلترناتیو)', grade: 'DC01A', thk: 2.0, width: 1000, unit: 'KG' },
    { key: 'FST-NUT-WELD-M6', name: 'مهره جوشی چهارگوش پایه‌دار M6 استاندارد DIN 928 (۱۵ عدد در هر براکت)', grade: 'FST-NUT-M6', thk: 0, width: 0, unit: 'PCS' },
    { key: 'FST-BOLT-WELD-M6-20', name: 'پیچ پایه جوشی مقاومتی M6x20 استاندارد خودرویی (۲ عدد در هر مکمل)', grade: 'FST-BOLT-M6', thk: 0, width: 0, unit: 'PCS' },
  ];

  defaultMaterialKeys.forEach(dm => {
    if (!rawMap.has(dm.key)) {
      rawMap.set(dm.key, {
        materialCode: dm.key,
        materialName: dm.name,
        grade: dm.grade,
        thicknessMm: dm.thk,
        widthMm: dm.width,
        unitCode: dm.unit,
        totalQuantity: 0,
        totalWeightKg: 0,
        demandedByParts: [],
      });
    }
  });

  // 4. Netting against Live On-Hand Stock (Physical Coils + Warehouse Ledger), Consignment, QC Hold & Contracts
  const materialRows: MrpMaterialRow[] = [];

  rawMap.forEach((req) => {
    const materialPart = parts.find(p => p.code === req.materialCode);
    const matchPhysicalCoils = physicalCoils.filter(pc => {
      if (req.unitCode !== 'KG') return false;
      if (pc.partCode === req.materialCode) return true;
      const gradeMatch = (pc.materialGrade || '').toLowerCase() === req.grade.toLowerCase();
      const thkMatch = !req.thicknessMm || Math.abs((pc.thicknessMm || 0) - req.thicknessMm) < 0.05;
      const widthMatch = !req.widthMm || pc.widthMm === req.widthMm;
      return gradeMatch && thkMatch && widthMatch;
    });

    const matchLegacyCoils = coils.filter(c => {
      if (req.unitCode !== 'KG') return false;
      if (c.partCode === req.materialCode) return true;
      const gradeMatch = c.materialGrade.toLowerCase().includes(req.grade.toLowerCase());
      const thkMatch = !req.thicknessMm || Math.abs((c.thicknessMm || 0) - req.thicknessMm) < 0.05;
      const widthMatch = !req.widthMm || c.widthMm === req.widthMm;
      return gradeMatch && thkMatch && widthMatch;
    });

    let onHandConsignment = 0;
    let onHandOwned = 0;
    let onHandQuarantined = 0;
    const matchingLotNumbers = new Set<string>();
    const matchingCoilInfos: MrpMatchingCoilInfo[] = [];

    if (matchPhysicalCoils.length > 0) {
      matchPhysicalCoils.forEach(pc => {
        if (pc.coilId) matchingLotNumbers.add(pc.coilId);
        if (pc.coilPackNumber) matchingLotNumbers.add(pc.coilPackNumber);
        const remainingKg = Math.max(0, pc.remainingWeightKg || 0);
        const isBlocked =
          pc.qualityStatus === 'QUALITY_BLOCKED' ||
          pc.qualityStatus === 'QUARANTINE' ||
          pc.physicalStatus === 'BLOCKED';
        if (isBlocked) {
          onHandQuarantined += remainingKg;
        } else if (pc.physicalStatus !== 'CONSUMED' && remainingKg > 0) {
          if (pc.ownership === 'COMPANY_OWNED') {
            onHandOwned += remainingKg;
          } else {
            onHandConsignment += remainingKg;
          }
        }
        matchingCoilInfos.push({
          coilId: pc.id,
          coilNumber: pc.coilId,
          materialCode: pc.partCode || req.materialCode,
          materialGrade: pc.materialGrade,
          thicknessMm: pc.thicknessMm,
          remainingWeightKg: remainingKg,
          ownership: pc.ownership === 'COMPANY_OWNED' ? 'FACTORY_OWNED' : 'SAPCO_CONSIGNMENT',
          warehouseLocation: `${pc.warehouseName || 'انبار رول'} (${pc.warehouseLocationCode || 'LOC-RAW-A1'})`,
          status: remainingKg <= 0 ? 'CONSUMED' : remainingKg < pc.originalWeightKg ? 'PARTIAL' : 'FULL',
        });
      });
    } else if (matchLegacyCoils.length > 0) {
      matchLegacyCoils.forEach(c => {
        matchingLotNumbers.add(c.coilNumber);
        const remainingKg = Math.max(0, c.receivedWeightKg - c.consumedWeightKg);
        if (c.status !== 'DEPLETED' && remainingKg > 0) {
          if (c.partCode.includes('ALT') || c.coilNumber.includes('ALT')) {
            onHandOwned += remainingKg;
          } else {
            onHandConsignment += remainingKg;
          }
        }
        matchingCoilInfos.push({
          coilId: c.id,
          coilNumber: c.coilNumber,
          materialCode: c.partCode,
          materialGrade: c.materialGrade,
          thicknessMm: c.thicknessMm,
          remainingWeightKg: remainingKg,
          ownership: c.partCode.includes('FAC') || c.partCode.includes('ALT') ? 'FACTORY_OWNED' : 'SAPCO_CONSIGNMENT',
          warehouseLocation: 'انبار مرکزی رول ساپکو (LOC-RAW-A)',
          status: c.consumedWeightKg > 0 ? 'PARTIAL' : 'FULL',
        });
      });
    }

    // Check raw/WIP stock balances from warehouse ledger (exact source for fasteners, sheets without coils, and WIP components)
    const ledgerRaw = balances.filter(b => {
      const codeMatch = b.partCode === req.materialCode || (materialPart && b.partId === materialPart.id);
      if (!codeMatch) return false;
      return b.warehouseId === 'WH-RAW' || b.warehouseId.startsWith('WH-WIP');
    });

    ledgerRaw.forEach(lr => {
      if (lr.lotNumber) matchingLotNumbers.add(lr.lotNumber);
    });

    if (matchPhysicalCoils.length === 0 && matchLegacyCoils.length === 0 && ledgerRaw.length > 0) {
      ledgerRaw.forEach(lr => {
        onHandConsignment += lr.supplierOwnedQty || 0;
        onHandOwned += lr.ownedQty || 0;
        onHandQuarantined += lr.qualityBlockedQty || 0;
      });
    } else if (ledgerRaw.length > 0) {
      ledgerRaw.forEach(lr => {
        onHandQuarantined += lr.qualityBlockedQty || 0;
      });
    }

    // Add active QC Hold overrides matched by partCode, partId, or lotNumber (unit-aware)
    onHandQuarantined += getQcHoldForMaterial(req.materialCode, materialPart?.id, matchingLotNumbers, req.unitCode);

    // Active Reservations for this material code from the unified reservations store
    const activeRes = reservations.filter(r => {
      if (r.status !== 'ACTIVE') return false;
      return r.partCode === req.materialCode || (materialPart && r.partId === materialPart.id);
    });
    const reservedActive = activeRes.reduce((sum, r) => sum + (req.unitCode === 'KG' ? r.quantityKg : r.quantity), 0);

    // Effective usable stock (ATP): (Owned + Consignment) - Reserved - Quarantined (QC Hold)
    const effectiveStock = includeConsignment ? onHandOwned + onHandConsignment : onHandOwned;
    const netAvailable = Math.max(0, effectiveStock - reservedActive - onHandQuarantined);

    // 4.2. Open Contracts with SAPCO / Suppliers
    const matchingContracts = contracts.filter(c => {
      if (c.status !== 'ACTIVE') return false;
      const matchGrade =
        c.materialGrade &&
        (c.materialGrade.toUpperCase().includes(req.grade.toUpperCase()) ||
          req.grade.toUpperCase().includes(c.materialGrade.toUpperCase()));
      return Boolean(matchGrade);
    });

    let openContractQuantity = 0;
    const contractInfo: MrpContractCoverage[] = [];

    matchingContracts.forEach(c => {
      const lines = c.commercialLines || [];
      const lineMatch = lines.find(
        l => l.partCode === req.materialCode || l.partCode.includes(req.grade) || l.partName.includes(req.grade)
      );
      const remainingKg = lineMatch ? lineMatch.remainingKg : Math.max(0, c.allocatedWeightKg - c.totalReceivedKg);
      if (remainingKg > 0) {
        openContractQuantity += remainingKg;
        contractInfo.push({
          contractNumber: c.contractNumber,
          supplierName: c.customerName || 'شرکت ساپکو (تأمین قطعات ایران‌خودرو)',
          allocatedQuotaKg: c.allocatedWeightKg,
          remainingKg,
          expectedDeliveryDate: c.endDate ? c.endDate.slice(0, 10) : 'در حال تحویل',
        });
      }
    });

    // Compare in the material's native MRP demand unit (KG for coils/sheets, PCS for fasteners/sub-assemblies)
    const demandInBaseUnit = req.unitCode === 'KG' ? req.totalWeightKg : req.totalQuantity;
    const shortageQuantity = Math.max(0, Math.round((demandInBaseUnit - netAvailable) * 10) / 10);
    const coveredByContract = Math.min(shortageQuantity, openContractQuantity);
    const hardShortageQuantity = Math.max(0, Math.round((shortageQuantity - coveredByContract) * 10) / 10);

    let severity: 'OK' | 'SHORTAGE_COVERED_BY_CONTRACT' | 'HARD_SHORTAGE' = 'OK';
    if (shortageQuantity > 0) {
      severity = hardShortageQuantity === 0 ? 'SHORTAGE_COVERED_BY_CONTRACT' : 'HARD_SHORTAGE';
    }

    materialRows.push({
      materialId: materialPart?.id || `MAT-${req.materialCode}`,
      materialCode: req.materialCode,
      materialName: req.materialName,
      materialGrade: req.grade,
      thicknessMm: req.thicknessMm,
      widthMm: req.widthMm,
      unitCode: req.unitCode,
      requiredQuantity: req.totalQuantity,
      requiredWeightKg: req.totalWeightKg,
      onHandOwned: Math.round(onHandOwned * 10) / 10,
      onHandConsignment: Math.round(onHandConsignment * 10) / 10,
      onHandQuarantined: Math.round(onHandQuarantined * 10) / 10,
      reservedActive: Math.round(reservedActive * 10) / 10,
      netAvailable: Math.round(netAvailable * 10) / 10,
      openContractQuantity: Math.round(openContractQuantity * 10) / 10,
      shortageQuantity,
      coveredByContract,
      hardShortageQuantity,
      severity,
      demandedByParts: req.demandedByParts,
      contractInfo,
      matchingCoils: matchingCoilInfos,
    });
  });

  materialRows.sort((a, b) => {
    const sevScore = { HARD_SHORTAGE: 3, SHORTAGE_COVERED_BY_CONTRACT: 2, OK: 1 };
    return sevScore[b.severity] - sevScore[a.severity] || b.shortageQuantity - a.shortageQuantity;
  });

  const okCount = materialRows.filter(m => m.severity === 'OK').length;
  const contractCoveredCount = materialRows.filter(m => m.severity === 'SHORTAGE_COVERED_BY_CONTRACT').length;
  const hardShortagesCount = materialRows.filter(m => m.severity === 'HARD_SHORTAGE').length;
  const totalGrossWeightKg = materialRows.reduce((sum, m) => sum + m.requiredWeightKg, 0);
  const totalShortageWeightKg = materialRows.reduce(
    (sum, m) => sum + (m.unitCode === 'KG' ? m.hardShortageQuantity : m.hardShortageQuantity * 0.01),
    0
  );
  const totalFinishedGoodsDemandPieces = partRows.reduce((sum, p) => sum + p.grossDemand, 0);
  const totalNetProductionPieces = partRows.reduce((sum, p) => sum + p.netRequirement, 0);

  const notes: string[] = [
    'محاسبه نیازمندی بر اساس سفارشات قطعی باز، موجودی زنده انبارها و انفجار چندسطحی درخت محصول (BOM) انجام شده است.',
    'موجودی امانی ساپکو در کنار موجودی ملکی کارخانه تفکیک شده و اقلام در قرنطینه کیفی (QC Hold) از موجودی آزاد کسر گردیده‌اند.',
    'رزروهای قطعی دستور کارها (Reservations) از سیستم واحد انبار خوانده شده و مانع از دوباره‌تخصیص موجودی می‌شوند.',
  ];

  return {
    ranAt: new Date().toISOString(),
    ranAtFa: getJalaliNowString(),
    scope: {
      orderLinesCount: totalOrderLines,
      partsCount: partRows.length,
      withNetRequirementCount: partRows.filter(p => p.netRequirement > 0).length,
    },
    parts: partRows,
    materials: materialRows,
    summary: {
      materialsConsidered: materialRows.length,
      ok: okCount,
      contractCovered: contractCoveredCount,
      hardShortages: hardShortagesCount,
      totalGrossWeightKg: Math.round(totalGrossWeightKg * 10) / 10,
      totalShortageWeightKg: Math.round(totalShortageWeightKg * 10) / 10,
      totalFinishedGoodsDemandPieces,
      totalNetProductionPieces,
    },
    notes,
  };
}

/**
 * Helper: Sum actual material already issued to an MO from posted Inventory Documents and Coil Issue Records
 */
function getAlreadyIssuedQtyForMoMaterial(
  moNumber: string,
  materialCode: string,
  unitCode: string,
  inventoryDocs: InventoryDocument[],
  coilIssueRecords: CoilIssueReturnRecord[],
  physicalCoils: PhysicalCoil[] = []
): number {
  let issuedFromDocs = 0;
  for (const doc of inventoryDocs) {
    if (doc.postingStatus !== 'POSTED') continue;
    if (doc.documentType !== 'ISSUE_RAW_MATERIAL' && doc.documentType !== 'TRANSFER') continue;
    if (doc.referenceNumber !== moNumber) continue;
    for (const line of doc.lines) {
      if (line.partCode === materialCode) {
        issuedFromDocs += unitCode === 'KG' ? Number(line.quantityKg || line.quantity || 0) : Number(line.quantity || 0);
      }
    }
  }

  let issuedFromCoilRecords = 0;
  if (unitCode === 'KG' && Array.isArray(coilIssueRecords)) {
    for (const rec of coilIssueRecords) {
      const matchedCoil = physicalCoils.find(pc => pc.id === rec.coilId || pc.coilId === rec.coilId);
      if (rec.manufacturingOrderId === moNumber && (!matchedCoil || matchedCoil.partCode === materialCode)) {
        issuedFromCoilRecords += Math.max(0, Number(rec.issuedWeightKg || 0) - Number(rec.returnedWeightKg || 0));
      }
    }
  }

  return Math.round(Math.max(issuedFromDocs, issuedFromCoilRecords) * 100) / 100;
}

/**
 * Pre-Issue Check: Verifies whether material for a specific Manufacturing Order is ready to issue
 */
export function checkMoMaterialAvailability(moId: string): MoMaterialCheckResult | null {
  const mo = manufacturingOrdersStore.find(m => m.id === moId || m.moNumber === moId);
  if (!mo) return null;

  const {
    parts,
    physicalCoils,
    inventoryDocs,
    reservations,
    coilIssueRecords,
  } = getLiveStores();
  const boms = getAllBoms();
  const bom = boms.find(b => b.assemblyPartId === mo.partId || b.assemblyPartCode === mo.partCode);
  const moPart = parts.find(p => p.id === mo.partId || p.code === mo.partCode);
  const { balances } = calculateDetailedStockBalances(inventoryDocs, reservations, parts);

  const lines: MoMaterialCheckLine[] = [];
  let allReady = true;

  if (bom && bom.components.length > 0) {
    bom.components.forEach(cmp => {
      const cmpPart = parts.find(p => p.id === cmp.componentPartId || p.code === cmp.componentPartCode);
      const isRawSheet = cmp.componentType === 'RAW_SHEET' || (cmpPart?.category === 'RAW_MATERIAL' && cmpPart.unit === 'KG');
      const resolvedRaw = isRawSheet
        ? resolveRawMaterialForSheetComponent(parts, cmpPart, moPart, cmp.componentPartName, cmp.componentPartCode)
        : null;

      const checkPartCode = resolvedRaw ? resolvedRaw.materialCode : cmp.componentPartCode;
      const checkPartName = resolvedRaw ? `${cmp.componentPartName} → ${resolvedRaw.materialName}` : cmp.componentPartName;
      const checkUnit = resolvedRaw ? 'KG' : cmp.unit;
      const catalogPart = parts.find(p => p.code === checkPartCode || p.id === cmp.componentPartId);

      const scrapFactor = 1 + (cmp.scrapAllowancePercent || 0) / 100;
      const rawPieceCount = mo.targetQuantity * cmp.quantityPerAssembly;
      const requiredWeightKg = Math.round(rawPieceCount * (cmp.grossWeightKg || catalogPart?.weightPerUnitKg || 0.1) * scrapFactor * 10) / 10;
      const requiredQty = checkUnit === 'KG' ? requiredWeightKg : rawPieceCount;

      const alreadyIssuedQuantity = getAlreadyIssuedQtyForMoMaterial(
        mo.moNumber,
        checkPartCode,
        checkUnit,
        inventoryDocs,
        coilIssueRecords,
        physicalCoils
      );
      const remainingRequired = Math.max(0, Math.round((requiredQty - alreadyIssuedQuantity) * 100) / 100);

      // On-hand approved stock in plant (Coils for KG, Raw/WIP Warehouse Ledger for PCS or sheet-without-coil)
      let onHandApproved = 0;
      const matchingLots = new Set<string>();

      if (checkUnit === 'KG') {
        const gradeToMatch = resolvedRaw?.grade || catalogPart?.materialGrade || moPart?.materialGrade || 'DC01A';
        const matchingPhysicalCoils = physicalCoils.filter(pc => {
          const isBlocked =
            pc.qualityStatus === 'QUALITY_BLOCKED' ||
            pc.qualityStatus === 'QUARANTINE' ||
            pc.physicalStatus === 'BLOCKED' ||
            pc.physicalStatus === 'CONSUMED';
          if (isBlocked || (pc.remainingWeightKg || 0) <= 0) return false;
          return (
            pc.partCode === checkPartCode ||
            (pc.materialGrade || '').toLowerCase() === gradeToMatch.toLowerCase()
          );
        });
        matchingPhysicalCoils.forEach(pc => {
          if (pc.coilId) matchingLots.add(pc.coilId);
          onHandApproved += Number(pc.remainingWeightKg || 0);
        });
      }

      if (onHandApproved === 0) {
        const ledgerEntries = balances.filter(b => {
          const codeMatch = b.partCode === checkPartCode || (catalogPart && b.partId === catalogPart.id);
          if (!codeMatch) return false;
          return b.warehouseId === 'WH-RAW' || b.warehouseId.startsWith('WH-WIP');
        });
        ledgerEntries.forEach(le => {
          if (le.lotNumber) matchingLots.add(le.lotNumber);
          onHandApproved += Math.max(0, (le.physicalQty || 0) - (le.qualityBlockedQty || 0));
        });
      }

      const qcHeld = getQcHoldForMaterial(checkPartCode, catalogPart?.id, matchingLots, checkUnit);
      onHandApproved = Math.max(0, Math.round((onHandApproved - qcHeld) * 100) / 100);

      // Reservations STRICTLY filtered to this component partCode/partId
      const matchingReservations = reservations.filter(
        r =>
          r.status === 'ACTIVE' &&
          (r.partCode === checkPartCode || (catalogPart && r.partId === catalogPart.id))
      );

      const resForThisMo = matchingReservations
        .filter(r => r.reservedFor.includes(mo.moNumber))
        .reduce((sum, r) => sum + (checkUnit === 'KG' ? (r.quantityKg || r.quantity) : r.quantity), 0);

      const resForOthers = matchingReservations
        .filter(r => !r.reservedFor.includes(mo.moNumber))
        .reduce((sum, r) => sum + (checkUnit === 'KG' ? (r.quantityKg || r.quantity) : r.quantity), 0);

      const availableForThisMo = Math.max(0, Math.round((onHandApproved - resForThisMo - resForOthers) * 100) / 100);
      const shortageQuantity = Math.max(
        0,
        Math.round((remainingRequired - resForThisMo - availableForThisMo) * 100) / 100
      );

      let status: 'NOT_REQUIRED' | 'READY' | 'SHORTAGE' = 'READY';
      if (remainingRequired <= 0) {
        status = 'NOT_REQUIRED';
      } else if (shortageQuantity > 0) {
        status = 'SHORTAGE';
        allReady = false;
      }

      lines.push({
        materialId: catalogPart?.id || cmp.componentPartId || cmp.id,
        materialCode: checkPartCode,
        materialName: checkPartName,
        materialGrade: resolvedRaw?.grade || catalogPart?.materialGrade,
        thicknessMm: resolvedRaw?.thicknessMm || catalogPart?.thicknessMm,
        unitCode: checkUnit,
        requiredQuantity: requiredQty,
        requiredWeightKg,
        alreadyIssuedQuantity,
        remainingRequired,
        onHandApproved,
        reservedForThisMo: resForThisMo,
        reservedForOthers: resForOthers,
        availableForThisMo,
        shortageQuantity,
        status,
        notes: [
          cmp.supplierSource === 'SAPCO_CONSIGNMENT' ? 'تأمین امانی ساپکو' : 'تأمین داخلی کارخانه',
          `اتصال در مرحله OP${cmp.stageJoinedStepNumber}`,
          ...(qcHeld > 0 ? [`توجه: ${qcHeld} ${checkUnit} در قرنطینه کیفی است`] : []),
        ],
      });
    });
  } else {
    // Single-part sheet metal check resolved dynamically from the MO part's specification
    const resolved = resolveRawMaterialForSheetComponent(parts, undefined, moPart, mo.partName, mo.partCode);
    const rawPart = parts.find(p => p.code === resolved.materialCode);
    const unitWeight = moPart?.weightPerUnitKg || 1.25;
    const requiredWeightKg = Math.round(mo.targetQuantity * unitWeight * 1.15 * 10) / 10;

    const alreadyIssuedQuantity = getAlreadyIssuedQtyForMoMaterial(
      mo.moNumber,
      resolved.materialCode,
      'KG',
      inventoryDocs,
      coilIssueRecords,
      physicalCoils
    );
    const remainingRequired = Math.max(0, Math.round((requiredWeightKg - alreadyIssuedQuantity) * 100) / 100);

    const matchingPhysicalCoils = physicalCoils.filter(
      pc =>
        pc.qualityStatus !== 'QUALITY_BLOCKED' &&
        pc.qualityStatus !== 'QUARANTINE' &&
        pc.physicalStatus !== 'BLOCKED' &&
        pc.physicalStatus !== 'CONSUMED' &&
        (pc.remainingWeightKg || 0) > 0 &&
        (pc.partCode === resolved.materialCode ||
          (pc.materialGrade || '').toLowerCase() === resolved.grade.toLowerCase())
    );
    const matchingLots = new Set(matchingPhysicalCoils.map(c => c.coilId));
    let onHandApproved = matchingPhysicalCoils.reduce((s, c) => s + Number(c.remainingWeightKg || 0), 0);
    if (onHandApproved === 0 && rawPart) {
      onHandApproved = balances
        .filter(b => b.partId === rawPart.id && b.warehouseId === 'WH-RAW')
        .reduce((s, b) => s + Math.max(0, b.physicalQty - b.qualityBlockedQty), 0);
    }
    const qcHeld = getQcHoldForMaterial(resolved.materialCode, rawPart?.id, matchingLots, 'KG');
    onHandApproved = Math.max(0, Math.round((onHandApproved - qcHeld) * 100) / 100);

    const matchingReservations = reservations.filter(
      r =>
        r.status === 'ACTIVE' &&
        (r.partCode === resolved.materialCode || (rawPart && r.partId === rawPart.id))
    );
    const resForThisMo = matchingReservations
      .filter(r => r.reservedFor.includes(mo.moNumber))
      .reduce((sum, r) => sum + (r.quantityKg || r.quantity), 0);
    const resForOthers = matchingReservations
      .filter(r => !r.reservedFor.includes(mo.moNumber))
      .reduce((sum, r) => sum + (r.quantityKg || r.quantity), 0);

    const availableForThisMo = Math.max(0, Math.round((onHandApproved - resForThisMo - resForOthers) * 100) / 100);
    const shortageQuantity = Math.max(
      0,
      Math.round((remainingRequired - resForThisMo - availableForThisMo) * 100) / 100
    );

    if (shortageQuantity > 0) allReady = false;

    lines.push({
      materialId: rawPart?.id || `MAT-${resolved.materialCode}`,
      materialCode: resolved.materialCode,
      materialName: resolved.materialName,
      materialGrade: resolved.grade,
      thicknessMm: resolved.thicknessMm,
      unitCode: 'KG',
      requiredQuantity: requiredWeightKg,
      requiredWeightKg,
      alreadyIssuedQuantity,
      remainingRequired,
      onHandApproved,
      reservedForThisMo: resForThisMo,
      reservedForOthers: resForOthers,
      availableForThisMo,
      shortageQuantity,
      status: remainingRequired <= 0 ? 'NOT_REQUIRED' : shortageQuantity === 0 ? 'READY' : 'SHORTAGE',
      notes: ['ماده اولیه ورق متناظر با مشخصات فنی قطعه'],
    });
  }

  return {
    moId: mo.id,
    moNumber: mo.moNumber,
    moStatus: mo.status,
    partId: mo.partId,
    partCode: mo.partCode,
    partName: mo.partName,
    targetQuantity: mo.targetQuantity,
    lines,
    readyToIssue: allReady,
    notes: allReady
      ? ['کلیه اقلام درخت محصول در انبار موجود و آماده صدور حواله خروج به خط تولید می‌باشند.']
      : ['توجه: برخی از اقلام مواد یا قطعات پیچی دارای کسری موجودی آزاد هستند.'],
  };
}

/**
 * Auto-reserve materials for a specific MO directly into the unified live Inventory Reservations store
 */
export function autoReserveMoMaterials(moId: string): {
  moNumber: string;
  reserved: { created: boolean; materialCode: string; quantity: number; unitCode: string }[];
  shortages: { materialCode: string; shortage: number; unitCode: string }[];
} {
  const check = checkMoMaterialAvailability(moId);
  if (!check) throw new Error('دستور کار مورد نظر یافت نشد');

  const { parts, inventoryDocs, reservations } = getLiveStores();
  const { balances } = calculateDetailedStockBalances(inventoryDocs, reservations, parts);

  const reserved: { created: boolean; materialCode: string; quantity: number; unitCode: string }[] = [];
  const shortages: { materialCode: string; shortage: number; unitCode: string }[] = [];

  check.lines.forEach((line, idx) => {
    if (line.status === 'NOT_REQUIRED') return;

    const neededQty = Math.max(0, Math.round((line.remainingRequired - line.reservedForThisMo) * 100) / 100);
    if (neededQty <= 0) return;

    if (line.availableForThisMo > 0) {
      const allocatable = Math.min(neededQty, line.availableForThisMo);
      const catalogPart = parts.find(p => p.code === line.materialCode || p.id === line.materialId);
      const resolvedPartId = catalogPart?.id || line.materialId;

      const stockEntry = balances.find(
        b => (b.partId === resolvedPartId || b.partCode === line.materialCode) && b.availableQty > 0
      ) || balances.find(b => b.partId === resolvedPartId || b.partCode === line.materialCode);

      const warehouseId = stockEntry?.warehouseId || (catalogPart?.category === 'WIP_PART' ? 'WH-WIP-WELD' : 'WH-RAW');
      const warehouseName = stockEntry?.warehouseName || 'انبار مرکزی رول و ورق مواد اولیه';
      const ownership: StockOwnership =
        stockEntry?.ownership ||
        (line.unitCode === 'KG' ? 'SAPCO_SUPPLIER_OWNED' : 'COMPANY_OWNED');
      const qtyKg =
        line.unitCode === 'KG'
          ? allocatable
          : Math.round(allocatable * (catalogPart?.weightPerUnitKg || 0.01) * 1000) / 1000;

      // Update an existing active reservation for the same MO+part instead of duplicating
      const existingRes = reservations.find(
        r =>
          r.status === 'ACTIVE' &&
          (r.partCode === line.materialCode || r.partId === resolvedPartId) &&
          r.reservedFor.includes(check.moNumber)
      );

      if (existingRes) {
        existingRes.quantity = Math.round((existingRes.quantity + allocatable) * 100) / 100;
        existingRes.quantityKg = Math.round((existingRes.quantityKg + qtyKg) * 1000) / 1000;
      } else {
        const resRecord: InventoryReservation = {
          id: `RES-${Date.now()}-${idx}`,
          reservationNumber: `RES-ATP-${toPersianDigits(Date.now().toString().slice(-4))}-${idx + 1}`,
          partId: resolvedPartId,
          partCode: line.materialCode,
          partName: catalogPart?.name || line.materialName,
          warehouseId,
          warehouseName,
          ownership,
          reservedFor: `دستور کار شماره ${check.moNumber} (${check.partName})`,
          quantity: allocatable,
          quantityKg: qtyKg,
          unit: line.unitCode as InventoryReservation['unit'],
          status: 'ACTIVE',
          validUntil: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
        };
        reservations.push(resRecord);
      }

      reserved.push({
        created: true,
        materialCode: line.materialCode,
        quantity: allocatable,
        unitCode: line.unitCode,
      });

      if (allocatable < neededQty) {
        shortages.push({
          materialCode: line.materialCode,
          shortage: Math.round((neededQty - allocatable) * 100) / 100,
          unitCode: line.unitCode,
        });
      }
    } else if (line.status === 'SHORTAGE') {
      shortages.push({
        materialCode: line.materialCode,
        shortage: line.shortageQuantity,
        unitCode: line.unitCode,
      });
    }
  });

  return {
    moNumber: check.moNumber,
    reserved,
    shortages,
  };
}

