import {
  ManufacturingOrder,
  ManufacturingOperation,
  WipTransfer,
  ProductionActivityLog,
  WipDashboardMetrics,
  MoReconciliationReport,
} from '../types/productionWip';
import { Part, Routing, DieMold } from '../types/inventory';
import { INITIAL_ROUTINGS, INITIAL_PARTS, INITIAL_DIES_MOLDS } from './sampleData';
import { getPrismaClient, isDatabaseUrlConfigured } from './db/prisma';

// In-Memory Data Store for Production & WIP Execution
export const manufacturingOrdersStore: ManufacturingOrder[] = [];
export const wipTransfersStore: WipTransfer[] = [];
export const productionLogsStore: ProductionActivityLog[] = [];

export interface WipRuntimeProviderData {
  parts: Part[];
  routings: Routing[];
  dies?: DieMold[];
}

let wipRuntimeProvider: (() => WipRuntimeProviderData) | null = null;

export function registerWipRuntimeProvider(provider: () => WipRuntimeProviderData) {
  wipRuntimeProvider = provider;
}

function getLiveParts(): Part[] {
  return wipRuntimeProvider ? wipRuntimeProvider().parts : INITIAL_PARTS;
}

function getLiveRoutings(): Routing[] {
  return wipRuntimeProvider ? wipRuntimeProvider().routings : INITIAL_ROUTINGS;
}

function getLiveDies(): DieMold[] {
  return wipRuntimeProvider?.().dies || INITIAL_DIES_MOLDS;
}

import fs from 'node:fs';
import path from 'node:path';

const WIP_SNAPSHOT_ID = 'production-wip-state';
const WIP_DISK_PATH = path.resolve(process.cwd(), 'data', 'kpims-wip-db.json');
let productionWipSnapshotVersion = 0;

function writeWipDiskSnapshot(payload: any, version: number): void {
  try {
    const dir = path.dirname(WIP_DISK_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(WIP_DISK_PATH, JSON.stringify({ version, payload, updatedAt: new Date().toISOString() }), 'utf-8');
  } catch {
    // ignore disk errors
  }
}

function readWipDiskSnapshot(): { version: number; payload: any } | null {
  try {
    if (!fs.existsSync(WIP_DISK_PATH)) return null;
    const raw = fs.readFileSync(WIP_DISK_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.payload && Array.isArray(parsed.payload.manufacturingOrders)) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export function getProductionWipSnapshotVersion(): number {
  return productionWipSnapshotVersion;
}

export function advanceProductionWipSnapshotVersion(expectedVersion: number): void {
  if (productionWipSnapshotVersion !== expectedVersion) {
    throw new Error('WIP_SNAPSHOT_VERSION_CONFLICT: local snapshot version changed during commit.');
  }
  productionWipSnapshotVersion = expectedVersion + 1;
}

export async function loadProductionWipState(): Promise<boolean> {
  const diskSnap = readWipDiskSnapshot();
  if (diskSnap) {
    productionWipSnapshotVersion = diskSnap.version || 1;
    manufacturingOrdersStore.splice(0, manufacturingOrdersStore.length, ...(diskSnap.payload.manufacturingOrders || []));
    wipTransfersStore.splice(0, wipTransfersStore.length, ...(diskSnap.payload.wipTransfers || []));
    productionLogsStore.splice(0, productionLogsStore.length, ...(diskSnap.payload.productionLogs || []));
  }

  if (!isDatabaseUrlConfigured()) {
    if (!diskSnap && manufacturingOrdersStore.length > 0) {
      await persistProductionWipState();
    }
    return Boolean(diskSnap);
  }

  try {
    const prisma = getPrismaClient();
    const snapshot = await prisma.wipStateSnapshot.findUnique({ where: { id: WIP_SNAPSHOT_ID } });
    if (!snapshot) {
      if (manufacturingOrdersStore.length === 0) {
        initializeProductionWipSeed();
      }
      productionWipSnapshotVersion = 0;
      await persistProductionWipState();
      return false;
    }

    productionWipSnapshotVersion = snapshot.version ?? 1;
    const payload = snapshot.payload as {
      manufacturingOrders?: ManufacturingOrder[];
      wipTransfers?: WipTransfer[];
      productionLogs?: ProductionActivityLog[];
    };

    if (
      payload &&
      Array.isArray(payload.manufacturingOrders) &&
      Array.isArray(payload.wipTransfers) &&
      Array.isArray(payload.productionLogs)
    ) {
      manufacturingOrdersStore.splice(0, manufacturingOrdersStore.length, ...payload.manufacturingOrders);
      wipTransfersStore.splice(0, wipTransfersStore.length, ...payload.wipTransfers);
      productionLogsStore.splice(0, productionLogsStore.length, ...payload.productionLogs);
      writeWipDiskSnapshot(payload, productionWipSnapshotVersion);
      return true;
    }
  } catch {
    // Fallback to disk snapshot already loaded above
  }
  return Boolean(diskSnap);
}

export async function persistProductionWipState(): Promise<void> {
  const payload = JSON.parse(JSON.stringify({
    manufacturingOrders: manufacturingOrdersStore,
    wipTransfers: wipTransfersStore,
    productionLogs: productionLogsStore,
  }));

  if (!isDatabaseUrlConfigured()) {
    productionWipSnapshotVersion += 1;
    writeWipDiskSnapshot(payload, productionWipSnapshotVersion);
    return;
  }

  try {
    const prisma = getPrismaClient();
    if (productionWipSnapshotVersion === 0) {
      const upserted = await prisma.wipStateSnapshot.upsert({
        where: { id: WIP_SNAPSHOT_ID },
        create: { id: WIP_SNAPSHOT_ID, payload, version: 1 },
        update: { payload, version: { increment: 1 } },
      });
      productionWipSnapshotVersion = upserted.version;
      writeWipDiskSnapshot(payload, productionWipSnapshotVersion);
      return;
    }

    const expectedVersion = productionWipSnapshotVersion;
    const updated = await prisma.wipStateSnapshot.updateMany({
      where: { id: WIP_SNAPSHOT_ID, version: expectedVersion },
      data: { payload, version: { increment: 1 } },
    });
    if (updated.count !== 1) {
      const upserted = await prisma.wipStateSnapshot.upsert({
        where: { id: WIP_SNAPSHOT_ID },
        create: { id: WIP_SNAPSHOT_ID, payload, version: 1 },
        update: { payload, version: { increment: 1 } },
      });
      productionWipSnapshotVersion = upserted.version;
    } else {
      productionWipSnapshotVersion = expectedVersion + 1;
    }
    writeWipDiskSnapshot(payload, productionWipSnapshotVersion);
  } catch {
    productionWipSnapshotVersion += 1;
    writeWipDiskSnapshot(payload, productionWipSnapshotVersion);
  }
}

// Helper to determine warehouse location based on operation process
export function getLocationForProcess(processType: string, stepNumber: number): string {
  switch (processType) {
    case 'SHEARING':
      return 'LOC-RAW-B1';
    case 'BLANKING':
      return 'LOC-WIP-BLANK';
    case 'DRAWING':
      return 'LOC-WIP-DRAWN';
    case 'PUNCH_FORM':
      return 'LOC-WIP-PUNCH';
    case 'BENDING':
      return 'LOC-WIP-BEND';
    case 'SPOT_WELD':
      return 'LOC-WELD-IN';
    case 'CO2_WELD':
      return 'LOC-WELD-OUT';
    case 'PAINT':
      return 'LOC-PAINT-IN';
    case 'ASSEMBLY':
      return 'LOC-FIN-P1';
    default:
      return `LOC-WIP-OP${stepNumber}`;
  }
}

// Initialize Realistic Automotive Sheet Metal MOs for the Anti-Theft ECU Bracket Family
export function initializeProductionWipSeed() {
  if (manufacturingOrdersStore.length > 0) return;

  const rtgMain = INITIAL_ROUTINGS.find(r => r.partCode === 'WIP-ECU-MAIN-BRK') || INITIAL_ROUTINGS[0];
  const rtgComp = INITIAL_ROUTINGS.find(r => r.partCode === 'WIP-ECU-COMP-BRK') || INITIAL_ROUTINGS[1] || INITIAL_ROUTINGS[0];
  const rtgAsy = INITIAL_ROUTINGS.find(r => r.partCode === 'SAPCO-ASY-ECU-BRK-01') || INITIAL_ROUTINGS[2] || INITIAL_ROUTINGS[0];

  // MO-1: صفحه براکت اصلی ضدسرقت رایانه موتور (WIP-ECU-MAIN-BRK)
  const moMainOps: ManufacturingOperation[] = rtgMain.operations.map((op, idx) => ({
    id: `MOP-ECU-MAIN-${op.stepNumber}`,
    moId: 'MO-ECU-MAIN-01',
    moNumber: 'MO-ECU-MAIN-01',
    stepNumber: op.stepNumber,
    stepCode: op.stepCode,
    stepName: op.stepName,
    processType: op.processType,
    sequence: idx + 1,
    machineId: op.machineId,
    machineName: op.machineName,
    warehouseLocation: getLocationForProcess(op.processType, op.stepNumber),
    status: idx <= 1 ? 'COMPLETED' : idx <= 4 ? 'IN_PROGRESS' : 'READY',
    waitingInputQty: 0,
    inProgressQty: 0,
    goodOutputQty: 0,
    scrapQty: 0,
    reworkQty: 0,
    rejectedQty: 0,
    readyForTransferQty: 0,
    transferredQty: 0,
    standardCycleTimeSec: op.standardCycleTimeSec,
    scrapNormPercent: op.scrapNormPercent,
    lastActivityAt: new Date(Date.now() - (7 - idx) * 3600 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  }));

  if (moMainOps[0]) {
    moMainOps[0].goodOutputQty = 1500;
    moMainOps[0].transferredQty = 1500;
    moMainOps[0].status = 'COMPLETED';
  }
  if (moMainOps[1]) {
    moMainOps[1].goodOutputQty = 1490;
    moMainOps[1].scrapQty = 10;
    moMainOps[1].transferredQty = 1490;
    moMainOps[1].status = 'COMPLETED';
  }
  if (moMainOps[2]) {
    moMainOps[2].inProgressQty = 190;
    moMainOps[2].goodOutputQty = 1290;
    moMainOps[2].scrapQty = 10;
    moMainOps[2].transferredQty = 1000;
    moMainOps[2].readyForTransferQty = 290;
    moMainOps[2].status = 'IN_PROGRESS';
  }
  if (moMainOps[3]) {
    moMainOps[3].waitingInputQty = 100;
    moMainOps[3].inProgressQty = 100;
    moMainOps[3].goodOutputQty = 800;
    moMainOps[3].transferredQty = 650;
    moMainOps[3].readyForTransferQty = 150;
    moMainOps[3].status = 'IN_PROGRESS';
  }
  if (moMainOps[4]) {
    moMainOps[4].waitingInputQty = 100;
    moMainOps[4].goodOutputQty = 550;
    moMainOps[4].transferredQty = 500;
    moMainOps[4].readyForTransferQty = 50;
    moMainOps[4].status = 'IN_PROGRESS';
  }
  if (moMainOps[5]) {
    moMainOps[5].waitingInputQty = 80;
    moMainOps[5].goodOutputQty = 420;
    moMainOps[5].transferredQty = 420;
    moMainOps[5].status = 'IN_PROGRESS';
  }
  if (moMainOps[6]) {
    moMainOps[6].waitingInputQty = 0;
    moMainOps[6].goodOutputQty = 420;
    moMainOps[6].readyForTransferQty = 0;
    moMainOps[6].transferredQty = 420;
    moMainOps[6].status = 'IN_PROGRESS';
  }

  const moMain: ManufacturingOrder = {
    id: 'MO-ECU-MAIN-01',
    moNumber: 'MO-ECU-MAIN-01',
    partId: rtgMain.partId,
    partCode: rtgMain.partCode,
    partName: rtgMain.partName,
    targetQuantity: 1500,
    initialInputQuantity: 1500,
    completedQuantity: 420,
    totalScrapQuantity: 20,
    totalReworkQuantity: 0,
    totalRejectedQuantity: 0,
    routingId: rtgMain.id,
    routingVersion: rtgMain.version,
    status: 'IN_PROGRESS',
    startDate: new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 72 * 3600 * 1000).toISOString().slice(0, 10),
    operations: moMainOps,
    notes: 'زیرفرآیند ۱: تولید صفحه اصلی براکت ضدسرقت رایانه موتور از رول DC01A ۲×۱۱۴۰ با ۱۵ مهره جوشی M6',
    createdBy: 'مهندس حسینی (مدیر تولید)',
    createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // MO-2: مکمل براکت ضدسرقت رایانه موتور (WIP-ECU-COMP-BRK) — conserved stage-by-stage (1500 total)
  const moCompStageStats = [
    { status: 'COMPLETED' as const, waiting: 0, inProgress: 0, good: 1500, ready: 0, transferred: 1500 },
    { status: 'IN_PROGRESS' as const, waiting: 300, inProgress: 200, good: 1000, ready: 120, transferred: 880 },
    { status: 'IN_PROGRESS' as const, waiting: 150, inProgress: 100, good: 630, ready: 50, transferred: 580 },
    { status: 'IN_PROGRESS' as const, waiting: 80, inProgress: 40, good: 460, ready: 0, transferred: 460 },
    { status: 'IN_PROGRESS' as const, waiting: 0, inProgress: 0, good: 460, ready: 0, transferred: 460 },
  ];
  const moCompOps: ManufacturingOperation[] = rtgComp.operations.map((op, idx) => {
    const st = moCompStageStats[idx] || { status: 'PENDING' as const, waiting: 0, inProgress: 0, good: 0, ready: 0, transferred: 0 };
    return {
      id: `MOP-ECU-COMP-${op.stepNumber}`,
      moId: 'MO-ECU-COMP-01',
      moNumber: 'MO-ECU-COMP-01',
      stepNumber: op.stepNumber,
      stepCode: op.stepCode,
      stepName: op.stepName,
      processType: op.processType,
      sequence: idx + 1,
      machineId: op.machineId,
      machineName: op.machineName,
      warehouseLocation: getLocationForProcess(op.processType, op.stepNumber),
      status: st.status,
      waitingInputQty: st.waiting,
      inProgressQty: st.inProgress,
      goodOutputQty: st.good,
      scrapQty: 0,
      reworkQty: 0,
      rejectedQty: 0,
      readyForTransferQty: st.ready,
      transferredQty: st.transferred,
      standardCycleTimeSec: op.standardCycleTimeSec,
      scrapNormPercent: op.scrapNormPercent,
      lastActivityAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 20 * 3600 * 1000).toISOString(),
    };
  });

  const moComp: ManufacturingOrder = {
    id: 'MO-ECU-COMP-01',
    moNumber: 'MO-ECU-COMP-01',
    partId: rtgComp.partId,
    partCode: rtgComp.partCode,
    partName: rtgComp.partName,
    targetQuantity: 1500,
    initialInputQuantity: 1500,
    completedQuantity: 460,
    totalScrapQuantity: 0,
    totalReworkQuantity: 0,
    totalRejectedQuantity: 0,
    routingId: rtgComp.id,
    routingVersion: rtgComp.version,
    status: 'IN_PROGRESS',
    startDate: new Date(Date.now() - 20 * 3600 * 1000).toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 72 * 3600 * 1000).toISOString().slice(0, 10),
    operations: moCompOps,
    notes: 'زیرفرآیند ۲ (موازی): تولید قطعه مکمل براکت ضدسرقت رایانه موتور با ۲ پیچ پایه جوشی M6x20',
    createdBy: 'مهندس حسینی (مدیر تولید)',
    createdAt: new Date(Date.now() - 20 * 3600 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // MO-3: مجموعه نهایی براکت ضدسرقت رایانه موتور (SAPCO-ASY-ECU-BRK-01) — conserved stage-by-stage (1500 total)
  const moAsyStageStats = [
    { status: 'IN_PROGRESS' as const, waiting: 420, inProgress: 150, good: 930, ready: 100, transferred: 830 },
    { status: 'IN_PROGRESS' as const, waiting: 120, inProgress: 80, good: 630, ready: 80, transferred: 550 },
    { status: 'IN_PROGRESS' as const, waiting: 90, inProgress: 60, good: 400, ready: 50, transferred: 350 },
    { status: 'IN_PROGRESS' as const, waiting: 0, inProgress: 0, good: 350, ready: 0, transferred: 350 },
  ];
  const moAsyOps: ManufacturingOperation[] = rtgAsy.operations.map((op, idx) => {
    const st = moAsyStageStats[idx] || { status: 'PENDING' as const, waiting: 0, inProgress: 0, good: 0, ready: 0, transferred: 0 };
    return {
      id: `MOP-ECU-ASY-${op.stepNumber}`,
      moId: 'MO-ECU-ASY-01',
      moNumber: 'MO-ECU-ASY-01',
      stepNumber: op.stepNumber,
      stepCode: op.stepCode,
      stepName: op.stepName,
      processType: op.processType,
      sequence: idx + 1,
      machineId: op.machineId,
      machineName: op.machineName,
      warehouseLocation: getLocationForProcess(op.processType, op.stepNumber),
      status: st.status,
      waitingInputQty: st.waiting,
      inProgressQty: st.inProgress,
      goodOutputQty: st.good,
      scrapQty: 0,
      reworkQty: 0,
      rejectedQty: 0,
      readyForTransferQty: st.ready,
      transferredQty: st.transferred,
      standardCycleTimeSec: op.standardCycleTimeSec,
      scrapNormPercent: op.scrapNormPercent,
      lastActivityAt: new Date().toISOString(),
      createdAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    };
  });

  const moAsy: ManufacturingOrder = {
    id: 'MO-ECU-ASY-01',
    moNumber: 'MO-ECU-ASY-01',
    partId: rtgAsy.partId,
    partCode: rtgAsy.partCode,
    partName: rtgAsy.partName,
    targetQuantity: 1500,
    initialInputQuantity: 1500,
    completedQuantity: 350,
    totalScrapQuantity: 0,
    totalReworkQuantity: 0,
    totalRejectedQuantity: 0,
    routingId: rtgAsy.id,
    routingVersion: rtgAsy.version,
    status: 'IN_PROGRESS',
    startDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 96 * 3600 * 1000).toISOString().slice(0, 10),
    operations: moAsyOps,
    notes: 'مونتاژ نهایی مجموعه براکت ضدسرقت رایانه موتور (اتصال صفحه اصلی و مکمل با جوش CO2 و رنگ کاتافورز ED)',
    createdBy: 'مهندس حسینی (مدیر تولید)',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  manufacturingOrdersStore.push(moMain, moComp, moAsy);

  // Seed sample In-Transit Transfers for Anti-Theft ECU Bracket
  wipTransfersStore.push(
    {
      id: 'TRF-ECU-001',
      transferNumber: 'TRF-ECU-001',
      moId: 'MO-ECU-MAIN-01',
      moNumber: 'MO-ECU-MAIN-01',
      partId: rtgMain.partId,
      partCode: rtgMain.partCode,
      partName: rtgMain.partName,
      fromOperationId: moMainOps[0]?.id || 'MOP-ECU-MAIN-10',
      fromStepNumber: 10,
      fromStepName: moMainOps[0]?.stepName || 'برش رول ۲×۱۱۴۰',
      fromLocation: 'LOC-RAW-B1',
      toOperationId: moMainOps[2]?.id || 'MOP-ECU-MAIN-20',
      toStepNumber: 20,
      toStepName: moMainOps[2]?.stepName || 'پرسکاری بلنکینگ',
      toLocation: 'LOC-WIP-BLANK',
      quantity: 1490,
      status: 'APPROVED',
      dispatchedBy: 'علی رضایی (سرپرست برش)',
      dispatchedAt: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
      receivedBy: 'رضا کریمی (اپراتور پرس ۲۵۰)',
      receivedAt: new Date(Date.now() - 17 * 3600 * 1000).toISOString(),
      notes: 'انتقال شیت‌های سایزشده صفحه اصلی براکت ضدسرقت به پرس ۲۵۰ تن',
    },
    {
      id: 'TRF-ECU-002',
      transferNumber: 'TRF-ECU-002',
      moId: 'MO-ECU-MAIN-01',
      moNumber: 'MO-ECU-MAIN-01',
      partId: rtgMain.partId,
      partCode: rtgMain.partCode,
      partName: rtgMain.partName,
      fromOperationId: moMainOps[6]?.id || 'MOP-ECU-MAIN-50',
      fromStepNumber: 50,
      fromStepName: moMainOps[6]?.stepName || 'پرس‌جوش ۱۵ عدد مهره M6',
      fromLocation: 'LOC-WELD-IN',
      toOperationId: moAsyOps[0]?.id || 'MOP-ECU-ASY-60',
      toStepNumber: 60,
      toStepName: moAsyOps[0]?.stepName || 'ایستگاه جوشکاری CO2 مونتاژ نهایی',
      toLocation: 'LOC-WELD-OUT',
      quantity: 420,
      status: 'APPROVED',
      dispatchedBy: 'سعید باقری (اپراتور پرس‌جوش)',
      dispatchedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
      receivedBy: 'مهندس اکبری (سلول جوش CO2)',
      receivedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      notes: 'تحویل ۴۲۰ عدد صفحه اصلی تکمیل‌شده با ۱۵ مهره جوشی به ایستگاه جوش CO2',
    }
  );
}


export function clearProductionWipData() {
  manufacturingOrdersStore.length = 0;
  wipTransfersStore.length = 0;
  productionLogsStore.length = 0;
}

export function reseedProductionWipData() {
  manufacturingOrdersStore.length = 0;
  wipTransfersStore.length = 0;
  productionLogsStore.length = 0;
  initializeProductionWipSeed();
}

// =========================================================================
// ENGINE CORE FUNCTIONS
// =========================================================================

export function getManufacturingOrdersList(): ManufacturingOrder[] {
  return manufacturingOrdersStore;
}

export function getManufacturingOrderById(id: string): ManufacturingOrder | undefined {
  return manufacturingOrdersStore.find(m => m.id === id || m.moNumber === id);
}

export function createManufacturingOrder(params: {
  partId?: string;
  partCode?: string;
  targetQuantity: number;
  initialInputQuantity?: number;
  routingId?: string;
  startDate?: string;
  dueDate?: string;
  notes?: string;
  createdBy: string;
}): { success: boolean; data?: ManufacturingOrder; error?: string } {
  const targetQty = Number(params.targetQuantity);
  if (!Number.isFinite(targetQty) || targetQty <= 0) {
    return { success: false, error: 'تیراژ هدف دستور تولید باید عددی بزرگتر از صفر باشد.' };
  }

  let initialInput = targetQty;
  if (params.initialInputQuantity !== undefined && params.initialInputQuantity !== null) {
    const parsedInitial = Number(params.initialInputQuantity);
    if (!Number.isFinite(parsedInitial) || parsedInitial < 0) {
      return { success: false, error: 'مقدار ورودی اولیه مواد نمی‌تواند منفی یا نامعتبر باشد.' };
    }
    initialInput = parsedInitial;
  }

  const liveParts = getLiveParts();
  const liveRoutings = getLiveRoutings();
  const partLookup = params.partId || params.partCode || '';
  const part = liveParts.find(p => p.id === partLookup || p.code === partLookup || (params.partCode && p.code === params.partCode));
  if (!part) {
    return { success: false, error: 'قطعه مورد نظر در سیستم یافت نشد.' };
  }

  // Find approved routing for this part (never substitute an unrelated part's routing)
  const routing = params.routingId
    ? liveRoutings.find(r => r.id === params.routingId)
    : liveRoutings.find(r => r.partId === part.id || r.partCode === part.code);

  if (!routing || !routing.operations.length) {
    return { success: false, error: `مسیر تولید مصوب (Routing) برای قطعه «${part.code}» تعریف نشده است.` };
  }

  let seqNum = manufacturingOrdersStore.length + 1;
  let moId = `MO-2026-${String(seqNum).padStart(3, '0')}`;
  while (manufacturingOrdersStore.some(m => m.id === moId || m.moNumber === moId)) {
    seqNum += 1;
    moId = `MO-2026-${String(seqNum).padStart(3, '0')}`;
  }
  const now = new Date().toISOString();

  // Generate operations from approved route version
  const operations: ManufacturingOperation[] = routing.operations.map((op, idx) => ({
    id: `MOP-${moId}-${op.stepNumber}`,
    moId,
    moNumber: moId,
    stepNumber: op.stepNumber,
    stepCode: op.stepCode,
    stepName: op.stepName,
    processType: op.processType,
    sequence: idx + 1,
    machineId: op.machineId,
    machineName: op.machineName,
    warehouseLocation: getLocationForProcess(op.processType, op.stepNumber),
    status: idx === 0 ? 'READY' : 'PENDING',
    waitingInputQty: idx === 0 ? initialInput : 0, // Load initial raw material/blanks into OP 1
    inProgressQty: 0,
    goodOutputQty: 0,
    scrapQty: 0,
    reworkQty: 0,
    rejectedQty: 0,
    readyForTransferQty: 0,
    transferredQty: 0,
    standardCycleTimeSec: op.standardCycleTimeSec,
    scrapNormPercent: op.scrapNormPercent,
    lastActivityAt: now,
    createdAt: now,
  }));

  const newMo: ManufacturingOrder = {
    id: moId,
    moNumber: moId,
    partId: part.id,
    partCode: part.code,
    partName: part.name,
    targetQuantity: targetQty,
    initialInputQuantity: initialInput,
    completedQuantity: 0,
    totalScrapQuantity: 0,
    totalReworkQuantity: 0,
    totalRejectedQuantity: 0,
    routingId: routing.id,
    routingVersion: routing.version,
    status: 'RELEASED',
    startDate: params.startDate || now.slice(0, 10),
    dueDate: params.dueDate || new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    operations,
    notes: params.notes || `دستور کار تولید مبتنی بر مسیر فرآیند مصوب نسخه ${routing.version}`,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  manufacturingOrdersStore.unshift(newMo);

  // Log activity
  productionLogsStore.unshift({
    id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    moId,
    moNumber: moId,
    operationId: operations[0].id,
    stepNumber: operations[0].stepNumber,
    stepName: operations[0].stepName,
    activityType: 'INPUT_LOAD',
    quantity: initialInput,
    operatorName: params.createdBy,
    timestamp: now,
    notes: `بارگذاری اولیه مواد/شیت به مرحله ۱ (${operations[0].stepName})`,
  });

  return { success: true, data: newMo };
}

// Load initial raw material / blanks into MO (increases both mo.initialInputQuantity and OP waiting queue atomically)
export function loadMaterialIntoManufacturingOrder(params: {
  moId: string;
  operationId?: string;
  quantity: number;
  operatorName: string;
  notes?: string;
}): { success: boolean; data?: ManufacturingOrder; error?: string } {
  const mo = manufacturingOrdersStore.find(m => m.id === params.moId || m.moNumber === params.moId);
  if (!mo) return { success: false, error: 'دستور تولید یافت نشد.' };

  const qty = Number(params.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { success: false, error: 'مقدار بارگذاری مواد اولیه باید بزرگتر از صفر باشد.' };
  }

  const sortedOps = [...mo.operations].sort((a, b) => a.stepNumber - b.stepNumber);
  const op = params.operationId
    ? mo.operations.find(o => o.id === params.operationId)
    : sortedOps[0];
  if (!op) return { success: false, error: 'مرحله عملیاتی هدف یافت نشد.' };

  const now = new Date().toISOString();
  mo.initialInputQuantity += qty;
  if (mo.status === 'PLANNED') mo.status = 'RELEASED';
  mo.updatedAt = now;

  op.waitingInputQty += qty;
  if (op.status === 'PENDING' || op.status === 'COMPLETED') {
    op.status = 'READY';
  }
  op.lastActivityAt = now;

  productionLogsStore.unshift({
    id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    moId: mo.id,
    moNumber: mo.moNumber,
    operationId: op.id,
    stepNumber: op.stepNumber,
    stepName: op.stepName,
    activityType: 'INPUT_LOAD',
    quantity: qty,
    operatorName: params.operatorName || 'انباردار رول و ورق',
    timestamp: now,
    notes: params.notes || `ورود مواد/شیت جدید به صف انتظار ${op.stepName}`,
  });

  return { success: true, data: mo };
}

// Register Input Quantity (Start processing at machine)
export function registerOperationInput(params: {
  moId: string;
  operationId: string;
  quantity: number;
  operatorName: string;
  machineId?: string;
  notes?: string;
}): { success: boolean; data?: ManufacturingOrder; error?: string } {
  const mo = manufacturingOrdersStore.find(m => m.id === params.moId);
  if (!mo) return { success: false, error: 'دستور تولید یافت نشد.' };

  const op = mo.operations.find(o => o.id === params.operationId);
  if (!op) return { success: false, error: 'مرحله عملیاتی یافت نشد.' };

  const qty = Number(params.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { success: false, error: 'مقدار ورودی باید عددی بزرگتر از صفر باشد.' };
  }

  if (qty > op.waitingInputQty) {
    return {
      success: false,
      error: `موجودی در انتظار برای شروع پردازش کافی نیست. موجودی در انتظار: ${op.waitingInputQty}، مقدار درخواستی: ${qty}`,
    };
  }

  // State Transition & Conservation
  op.waitingInputQty -= qty;
  op.inProgressQty += qty;
  op.status = 'IN_PROGRESS';
  op.lastActivityAt = new Date().toISOString();
  if (params.machineId) op.machineId = params.machineId;

  mo.status = 'IN_PROGRESS';
  mo.updatedAt = new Date().toISOString();

  productionLogsStore.unshift({
    id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    moId: mo.id,
    moNumber: mo.moNumber,
    operationId: op.id,
    stepNumber: op.stepNumber,
    stepName: op.stepName,
    activityType: 'INPUT_LOAD',
    quantity: qty,
    operatorName: params.operatorName,
    machineId: params.machineId,
    timestamp: new Date().toISOString(),
    notes: params.notes,
  });

  return { success: true, data: mo };
}

// Register Operation Production (Good, Scrap, Rework, Rejected)
export function registerOperationProduction(params: {
  moId: string;
  operationId: string;
  goodQty: number;
  scrapQty: number;
  reworkQty?: number;
  rejectedQty?: number;
  scrapReason?: string;
  operatorName: string;
  machineId?: string;
  notes?: string;
}): { success: boolean; data?: ManufacturingOrder; error?: string } {
  const mo = manufacturingOrdersStore.find(m => m.id === params.moId);
  if (!mo) return { success: false, error: 'دستور تولید یافت نشد.' };

  const op = mo.operations.find(o => o.id === params.operationId);
  if (!op) return { success: false, error: 'مرحله عملیاتی یافت نشد.' };

  const good = Number(params.goodQty ?? 0);
  const scrap = Number(params.scrapQty ?? 0);
  const rework = Number(params.reworkQty ?? 0);
  const rejected = Number(params.rejectedQty ?? 0);
  if (
    !Number.isFinite(good) || good < 0 ||
    !Number.isFinite(scrap) || scrap < 0 ||
    !Number.isFinite(rework) || rework < 0 ||
    !Number.isFinite(rejected) || rejected < 0
  ) {
    return { success: false, error: 'مقادیر تولید سالم، ضایعات، دوباره‌کاری و مردودی نمی‌توانند منفی یا نامعتبر باشند.' };
  }
  const totalReported = good + scrap + rework + rejected;

  if (totalReported <= 0) {
    return { success: false, error: 'حداقل یکی از مقادیر تولید سالم، ضایعات یا دوباره‌کاری باید ثبت شود.' };
  }

  if (totalReported > op.inProgressQty) {
    return {
      success: false,
      error: `مجموع قطعات اعلامی (${totalReported}) از موجودی در حال ساخت پای دستگاه (${op.inProgressQty}) بیشتر است.`,
    };
  }

  if (scrap > 0 && !params.scrapReason) {
    return { success: false, error: 'در صورت وجود ضایعات، انتخاب علت ضایعات الزامی است.' };
  }

  // Post production and automatically transfer good output to the next operation.
  const postedAt = new Date().toISOString();
  op.inProgressQty -= totalReported;
  op.goodOutputQty += good;
  op.scrapQty += scrap;
  op.reworkQty += rework;
  op.rejectedQty += rejected;
  op.lastActivityAt = postedAt;

  // Increment die/mold stroke counter in sync with actual press/weld shop-floor strokes
  const liveDies = getLiveDies();
  const machineCodeOrId = params.machineId || op.machineId;
  const matchedDie =
    liveDies.find(
      d =>
        (d.partId === mo.partId || d.partCode === mo.partCode) &&
        d.processType === op.processType &&
        (!machineCodeOrId || !d.compatibleMachineCodes?.length || d.compatibleMachineCodes.includes(machineCodeOrId))
    ) ||
    liveDies.find(d => (d.partId === mo.partId || d.partCode === mo.partCode) && d.processType === op.processType);

  let diePmNotice = '';
  if (matchedDie) {
    matchedDie.currentStrokes = (Number(matchedDie.currentStrokes) || 0) + totalReported;
    if (matchedDie.strokeLifeTarget > 0 && matchedDie.currentStrokes >= matchedDie.strokeLifeTarget) {
      matchedDie.status = 'UNDER_MAINTENANCE';
      diePmNotice = ` [هشدار PM قالب ${matchedDie.code}: ضربه فعلی ${matchedDie.currentStrokes} به حد نصاب سرویس رسید]`;
    }
  }

  const nextOp = mo.operations.find(candidate => candidate.sequence === op.sequence + 1);
  op.transferredQty += good;
  if (op.inProgressQty === 0 && op.waitingInputQty === 0) {
    op.status = op.readyForTransferQty > 0 ? 'READY' : 'COMPLETED';
  }

  // Good output is posted directly into the next operation's waiting queue.
  // The transfer record is retained for traceability; no receiving approval is needed.
  if (good > 0) {
    if (nextOp) {
      nextOp.waitingInputQty += good;
      if (nextOp.status === 'PENDING') nextOp.status = 'READY';
      nextOp.lastActivityAt = postedAt;
    } else {
      mo.completedQuantity += good;
    }

    const transferNumber = `AUTO-${mo.moNumber}-${op.stepNumber}-${Date.now()}`;
    wipTransfersStore.unshift({
      id: transferNumber,
      transferNumber,
      moId: mo.id,
      moNumber: mo.moNumber,
      partId: mo.partId,
      partCode: mo.partCode,
      partName: mo.partName,
      fromOperationId: op.id,
      fromStepNumber: op.stepNumber,
      fromStepName: op.stepName,
      fromLocation: op.warehouseLocation,
      toOperationId: nextOp?.id || 'STORE-FINISHED',
      toStepNumber: nextOp?.stepNumber || 999,
      toStepName: nextOp?.stepName || 'انبار محصول نهایی',
      toLocation: nextOp?.warehouseLocation || 'LOC-FIN-P1',
      quantity: good,
      status: 'AUTO_TRANSFERRED',
      dispatchedBy: params.operatorName,
      dispatchedAt: postedAt,
      receivedAt: postedAt,
      notes: nextOp
        ? 'انتقال خودکار خروجی سالم به صف انتظار عملیات بعد؛ بدون تأیید دریافت'
        : 'انتقال خودکار خروجی سالم به انبار محصول نهایی؛ بدون تأیید دریافت',
    });
    productionLogsStore.unshift({
      id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      moId: mo.id,
      moNumber: mo.moNumber,
      operationId: op.id,
      stepNumber: op.stepNumber,
      stepName: op.stepName,
      activityType: 'AUTO_TRANSFER',
      quantity: good,
      operatorName: params.operatorName,
      machineId: params.machineId,
      timestamp: postedAt,
      notes: nextOp
        ? `انتقال خودکار ${good} عدد به صف انتظار ${nextOp.stepName}`
        : `انتقال خودکار ${good} عدد به انبار محصول نهایی`,
    });
  }

  mo.totalScrapQuantity += scrap;
  mo.totalReworkQuantity += rework;
  mo.totalRejectedQuantity += rejected;
  const hasPendingTransfers = wipTransfersStore.some(
    t => t.moId === mo.id && t.status === 'PENDING_APPROVAL'
  );
  if (
    mo.completedQuantity >= mo.targetQuantity &&
    !hasPendingTransfers &&
    mo.operations.every(
      candidate =>
        candidate.inProgressQty === 0 &&
        candidate.waitingInputQty === 0 &&
        candidate.readyForTransferQty === 0
    )
  ) {
    mo.status = 'COMPLETED';
    mo.closedAt = postedAt;
  }
  mo.updatedAt = postedAt;

  productionLogsStore.unshift({
    id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    moId: mo.id,
    moNumber: mo.moNumber,
    operationId: op.id,
    stepNumber: op.stepNumber,
    stepName: op.stepName,
    activityType: 'PRODUCTION_RUN',
    quantity: totalReported,
    goodQty: good,
    scrapQty: scrap,
    reworkQty: rework,
    rejectedQty: rejected,
    scrapReason: params.scrapReason,
    operatorName: params.operatorName,
    machineId: params.machineId,
    timestamp: postedAt,
    notes: `${params.notes || ''}${diePmNotice}`.trim() || undefined,
  });
  return { success: true, data: mo };
}

// Create Inter-Operation Transfer (Dispatches output from ready-for-transfer into in-transit)
export function createOperationTransfer(params: {
  moId: string;
  fromOperationId: string;
  toOperationId: string;
  quantity: number;
  dispatchedBy: string;
  notes?: string;
}): { success: boolean; data?: WipTransfer; error?: string } {
  const mo = manufacturingOrdersStore.find(m => m.id === params.moId);
  if (!mo) return { success: false, error: 'دستور تولید یافت نشد.' };

  const fromOp = mo.operations.find(o => o.id === params.fromOperationId);
  if (!fromOp) return { success: false, error: 'مرحله مبدأ یافت نشد.' };

  const qty = Number(params.quantity);
  if (qty <= 0) return { success: false, error: 'تعداد انتقال باید بزرگتر از صفر باشد.' };

  if (qty > fromOp.readyForTransferQty) {
    return {
      success: false,
      error: `موجودی آماده انتقال (${fromOp.readyForTransferQty}) کمتر از مقدار درخواستی (${qty}) است.`,
    };
  }

  let toStepNumber = 999;
  let toStepName = 'انبار محصول نهایی';
  let toLocation = 'LOC-FIN-P1';

  if (params.toOperationId !== 'STORE-FINISHED') {
    const toOp = mo.operations.find(o => o.id === params.toOperationId);
    if (!toOp) return { success: false, error: 'مرحله مقصد یافت نشد.' };
    toStepNumber = toOp.stepNumber;
    toStepName = toOp.stepName;
    toLocation = toOp.warehouseLocation;
  }

  // Atomically hold from source operation:
  fromOp.readyForTransferQty -= qty;
  fromOp.transferredQty += qty;
  fromOp.lastActivityAt = new Date().toISOString();

  const transferNumber = `TRF-2026-${String(wipTransfersStore.length + 1).padStart(3, '0')}`;
  const transfer: WipTransfer = {
    id: transferNumber,
    transferNumber,
    moId: mo.id,
    moNumber: mo.moNumber,
    partId: mo.partId,
    partCode: mo.partCode,
    partName: mo.partName,
    fromOperationId: fromOp.id,
    fromStepNumber: fromOp.stepNumber,
    fromStepName: fromOp.stepName,
    fromLocation: fromOp.warehouseLocation,
    toOperationId: params.toOperationId,
    toStepNumber,
    toStepName,
    toLocation,
    quantity: qty,
    status: 'PENDING_APPROVAL',
    dispatchedBy: params.dispatchedBy,
    dispatchedAt: new Date().toISOString(),
    notes: params.notes,
  };

  wipTransfersStore.unshift(transfer);

  productionLogsStore.unshift({
    id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    moId: mo.id,
    moNumber: mo.moNumber,
    operationId: fromOp.id,
    stepNumber: fromOp.stepNumber,
    stepName: fromOp.stepName,
    activityType: 'TRANSFER_DISPATCH',
    quantity: qty,
    operatorName: params.dispatchedBy,
    timestamp: new Date().toISOString(),
    notes: `ارسال محموله شماره ${transferNumber} به ${toStepName} (در انتظار تأیید و تحویل)`,
  });

  return { success: true, data: transfer };
}

// Approve & Receive Transfer (Credits destination operation's waiting input)
export function approveOperationTransfer(params: {
  transferId: string;
  receivedBy: string;
  notes?: string;
}): { success: boolean; data?: WipTransfer; error?: string } {
  const transfer = wipTransfersStore.find(t => t.id === params.transferId || t.transferNumber === params.transferId);
  if (!transfer) return { success: false, error: 'حواله انتقال یافت نشد.' };

  if (transfer.status !== 'PENDING_APPROVAL') {
    return { success: false, error: 'این حواله قبلاً تعیین تکلیف شده است.' };
  }

  const mo = manufacturingOrdersStore.find(m => m.id === transfer.moId);
  if (!mo) return { success: false, error: 'دستور تولید متناظر یافت نشد.' };

  const nowIso = new Date().toISOString();

  // If transfer to next operation, credit waitingInputQty; if to finished store, credit completedQuantity
  if (transfer.toOperationId !== 'STORE-FINISHED') {
    const toOp = mo.operations.find(o => o.id === transfer.toOperationId);
    if (!toOp) return { success: false, error: 'مرحله مقصد یافت نشد.' };

    // Credit destination operation
    toOp.waitingInputQty += transfer.quantity;
    if (toOp.status === 'PENDING') toOp.status = 'READY';
    toOp.lastActivityAt = nowIso;
  } else {
    mo.completedQuantity += transfer.quantity;
  }

  transfer.status = 'APPROVED';
  transfer.receivedBy = params.receivedBy;
  transfer.receivedAt = nowIso;
  if (params.notes) transfer.notes = (transfer.notes ? `${transfer.notes} | ` : '') + params.notes;

  const hasRemainingPending = wipTransfersStore.some(
    t => t.moId === mo.id && t.status === 'PENDING_APPROVAL'
  );
  if (
    transfer.toOperationId === 'STORE-FINISHED' &&
    mo.completedQuantity >= mo.targetQuantity &&
    !hasRemainingPending &&
    mo.operations.every(
      o => o.waitingInputQty === 0 && o.inProgressQty === 0 && o.readyForTransferQty === 0
    )
  ) {
    mo.status = 'COMPLETED';
    mo.closedAt = nowIso;
  }

  mo.updatedAt = nowIso;

  productionLogsStore.unshift({
    id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    moId: mo.id,
    moNumber: mo.moNumber,
    operationId: transfer.toOperationId,
    stepNumber: transfer.toStepNumber,
    stepName: transfer.toStepName,
    activityType: 'TRANSFER_RECEIVE',
    quantity: transfer.quantity,
    operatorName: params.receivedBy,
    timestamp: new Date().toISOString(),
    notes: `تحویل قطعی حواله شماره ${transfer.transferNumber} در مقصد`,
  });

  return { success: true, data: transfer };
}

// Reject Transfer (Returns quantity back to source operation ready-for-transfer)
export function rejectOperationTransfer(params: {
  transferId: string;
  rejectedBy: string;
  rejectionReason: string;
}): { success: boolean; data?: WipTransfer; error?: string } {
  const transfer = wipTransfersStore.find(t => t.id === params.transferId);
  if (!transfer) return { success: false, error: 'حواله انتقال یافت نشد.' };

  if (transfer.status !== 'PENDING_APPROVAL') {
    return { success: false, error: 'امکان رد این حواله وجود ندارد.' };
  }

  const mo = manufacturingOrdersStore.find(m => m.id === transfer.moId);
  if (!mo) return { success: false, error: 'دستور تولید متناظر یافت نشد.' };

  const fromOp = mo.operations.find(o => o.id === transfer.fromOperationId);
  if (!fromOp) return { success: false, error: 'مرحله مبدأ یافت نشد.' };

  // Return quantity to source ready-for-transfer
  fromOp.readyForTransferQty += transfer.quantity;
  fromOp.transferredQty -= transfer.quantity;
  fromOp.lastActivityAt = new Date().toISOString();

  transfer.status = 'REJECTED';
  transfer.rejectionReason = params.rejectionReason;

  return { success: true, data: transfer };
}

// Calculate Mathematical Reconciliation (Law of Conservation of Mass/Parts)
export function calculateMoReconciliation(moId: string): MoReconciliationReport | null {
  const mo = manufacturingOrdersStore.find(m => m.id === moId);
  if (!mo) return null;

  let totalWaiting = 0;
  let totalInProgress = 0;
  let totalReady = 0;
  let totalScrap = 0;
  let totalRework = 0;
  let totalRejected = 0;

  const operationsBreakdown = mo.operations.map(op => {
    totalWaiting += op.waitingInputQty;
    totalInProgress += op.inProgressQty;
    totalReady += op.readyForTransferQty;
    totalScrap += op.scrapQty;
    totalRework += op.reworkQty;
    totalRejected += op.rejectedQty;

    return {
      stepNumber: op.stepNumber,
      stepCode: op.stepCode,
      stepName: op.stepName,
      waitingInput: op.waitingInputQty,
      inProgress: op.inProgressQty,
      readyForTransfer: op.readyForTransferQty,
      transferredOut: op.transferredQty,
      scrap: op.scrapQty,
      rework: op.reworkQty,
      rejected: op.rejectedQty,
    };
  });

  // Calculate In-Transit (transfers for this MO that are dispatched but not yet approved)
  const inTransitTransfers = wipTransfersStore.filter(
    t => t.moId === mo.id && t.status === 'PENDING_APPROVAL'
  );
  const totalInTransit = inTransitTransfers.reduce((sum, t) => sum + t.quantity, 0);

  const totalCurrentWip = totalWaiting + totalInProgress + totalReady;
  const totalCompleted = mo.completedQuantity;

  // Accounted Total = Current Good WIP (Waiting + InProgress + Ready) + In-Transit + Completed + Scrap + Rework + Rejected
  const accountedTotal = totalCurrentWip + totalInTransit + totalCompleted + totalScrap + totalRework + totalRejected;
  const discrepancy = accountedTotal - mo.initialInputQuantity;

  return {
    moId: mo.id,
    moNumber: mo.moNumber,
    partCode: mo.partCode,
    partName: mo.partName,
    initialInputQuantity: mo.initialInputQuantity,
    totalCurrentWip,
    totalInTransit,
    totalCompleted,
    totalScrap,
    totalRework,
    totalRejected,
    accountedTotal,
    discrepancy,
    isConserved: discrepancy === 0,
    operationsBreakdown,
    auditTimestamp: new Date().toISOString(),
  };
}

// Compute Aggregate WIP Dashboard Metrics
export function getWipDashboardMetrics(): WipDashboardMetrics {
  let totalWaitingQty = 0;
  let totalInProgressQty = 0;
  let totalReadyForTransferQty = 0;
  let totalCompletedQty = 0;
  let totalScrapQty = 0;
  let totalReworkQty = 0;
  let totalRejectedQty = 0;

  const operationStatsMap = new Map<string, {
    operationName: string;
    stepCode: string;
    waitingQty: number;
    inProgressQty: number;
    readyQty: number;
    totalAgingHours: number;
    count: number;
  }>();

  const nowMs = Date.now();

  manufacturingOrdersStore.forEach(mo => {
    totalCompletedQty += mo.completedQuantity;
    totalScrapQty += mo.totalScrapQuantity;
    totalReworkQty += mo.totalReworkQuantity;
    totalRejectedQty += mo.totalRejectedQuantity;

    mo.operations.forEach(op => {
      totalWaitingQty += op.waitingInputQty;
      totalInProgressQty += op.inProgressQty;
      totalReadyForTransferQty += op.readyForTransferQty;

      const key = `${op.stepCode}_${op.stepName}`;
      const existing = operationStatsMap.get(key) || {
        operationName: op.stepName,
        stepCode: op.stepCode,
        waitingQty: 0,
        inProgressQty: 0,
        readyQty: 0,
        totalAgingHours: 0,
        count: 0,
      };

      existing.waitingQty += op.waitingInputQty;
      existing.inProgressQty += op.inProgressQty;
      existing.readyQty += op.readyForTransferQty;

      const actTime = new Date(op.lastActivityAt || op.createdAt).getTime();
      const hoursAgo = Math.max(0, (nowMs - actTime) / (3600 * 1000));
      existing.totalAgingHours += hoursAgo;
      existing.count += 1;

      operationStatsMap.set(key, existing);
    });
  });

  const pendingTransfers = wipTransfersStore.filter(t => t.status === 'PENDING_APPROVAL');
  const totalInTransitQty = pendingTransfers.reduce((s, t) => s + t.quantity, 0);

  // Check conservation for all MOs
  const allConserved = manufacturingOrdersStore.every(mo => {
    const rec = calculateMoReconciliation(mo.id);
    return rec ? rec.isConserved : true;
  });

  const bottleneckOperations = Array.from(operationStatsMap.values())
    .map(stat => ({
      operationName: stat.operationName,
      stepCode: stat.stepCode,
      waitingQty: stat.waitingQty,
      inProgressQty: stat.inProgressQty,
      readyQty: stat.readyQty,
      agingHoursAvg: stat.count > 0 ? Math.round((stat.totalAgingHours / stat.count) * 10) / 10 : 0,
    }))
    .sort((a, b) => (b.waitingQty + b.inProgressQty) - (a.waitingQty + a.inProgressQty));

  return {
    totalMoCount: manufacturingOrdersStore.length,
    activeMoCount: manufacturingOrdersStore.filter(m => m.status === 'IN_PROGRESS' || m.status === 'RELEASED').length,
    totalWaitingQty,
    totalInProgressQty,
    totalReadyForTransferQty,
    totalInTransitQty,
    totalCompletedQty,
    totalScrapQty,
    totalReworkQty,
    totalRejectedQty,
    overallConservationIntegrity: allConserved,
    bottleneckOperations,
    pendingTransfersCount: pendingTransfers.length,
  };
}

if (!isDatabaseUrlConfigured()) {
  initializeProductionWipSeed();
}

