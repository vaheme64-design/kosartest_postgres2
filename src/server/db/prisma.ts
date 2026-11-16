import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * KPIMS Enterprise Database Connection & Hybrid Durable Persistence Configuration
 * 1. Pure-Node PostgreSQL v3 Wire-Protocol preflight check (zero Rust stderr noise when remote tenant is paused).
 * 2. Embedded Relational SAP PP Engine for WorkCenter, Item, BomComponent, RoutingOperation,
 *    WorkOrder, and ProductionLog so MrpService, WipService, CapacityPlanningService, and
 *    runErpIntegrationTest execute 100% real relational calculations whether Supabase is live or paused.
 */

interface EmbeddedSapPpStore {
  workCenters: any[];
  items: any[];
  bomComponents: any[];
  routingOperations: any[];
  workOrders: any[];
  productionLogs: any[];
}

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __prismaProxy: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __kpimsDbReachable: boolean | null | undefined;
  // eslint-disable-next-line no-var
  var __kpimsLastDbError: string | undefined;
  // eslint-disable-next-line no-var
  var __kpimsLastProbeFailedAt: number | undefined;
  // eslint-disable-next-line no-var
  var __kpimsEmbeddedSapPpStore: EmbeddedSapPpStore | undefined;
}

const DEFAULT_FALLBACK_PG_URL = 'postgresql://postgres:postgres@localhost:5432/kpims_db?schema=public';
const PROBE_COOLDOWN_MS = 60_000;
const SAP_PP_RELATIONAL_DISK_PATH = path.resolve(process.cwd(), 'data', 'kpims-sap-pp-relational.json');

function createInitialEmbeddedSapPpStore(): EmbeddedSapPpStore {
  const now = new Date();
  const todayMorning = new Date(now);
  todayMorning.setHours(7, 0, 0, 0);
  const todayMorning2 = new Date(now);
  todayMorning2.setHours(7, 30, 0, 0);
  const fiveDaysLater = new Date(now.getTime() + 5 * 86400_000);

  const workCenters = [
    { id: 'wc-slt-1250', code: 'SLT-1250-01', name: 'خط رول‌بازکن و برش کویل ۱۲۵۰', capacityPerHour: 300, hallLocation: 'سالن برش و آماده‌سازی', status: 'ACTIVE', isDeleted: false },
    { id: 'wc-prs-800t', code: 'PRS-800T-01', name: 'پرس هیدرولیک کشش عمیق ۸۰۰ تن', capacityPerHour: 120, hallLocation: 'سالن پرس سنگین ۱', status: 'ACTIVE', isDeleted: false },
    { id: 'wc-prs-400t', code: 'PRS-400T-01', name: 'پرس ضربه‌ای ۴۰۰ تن خط ۱', capacityPerHour: 180, hallLocation: 'سالن پرس سنگین ۱', status: 'ACTIVE', isDeleted: false },
    { id: 'wc-prs-250t', code: 'PRS-250T-01', name: 'پرس مکانیکی کلاچ پنوماتیک ۲۵۰ تن', capacityPerHour: 240, hallLocation: 'سالن پرس متوسط', status: 'ACTIVE', isDeleted: false },
    { id: 'wc-wld-spot', code: 'WLD-SPOT-01', name: 'ایستگاه پرس‌جوش و کابین جوش CO2', capacityPerHour: 150, hallLocation: 'سالن مونتاژ و جوش', status: 'ACTIVE', isDeleted: false },
  ];

  const items = [
    { id: 'PRT-FGD-ECU-BRK', code: 'PRT-ECU-BRK-01', name: 'مجموعه براکت ضدسرقت رایانه موتور با پوشش رنگ کاتافورز ED', type: 'FINISHED_GOOD', carModel: 'پژو ۲۰۶ / ۲۰۷', unit: 'PCS', weightNetKg: 1.85, weightGrossKg: 2.18, minSafetyStock: 600, isDeleted: false },
    { id: 'PRT-WIP-ECU-MAIN', code: 'WIP-ECU-BASE-10', name: 'صفحه براکت اصلی ضدسرقت رایانه موتور', type: 'SEMI_FINISHED', carModel: 'پژو ۲۰۶ / ۲۰۷', unit: 'PCS', weightNetKg: 1.25, weightGrossKg: 1.48, minSafetyStock: 800, isDeleted: false },
    { id: 'PRT-WIP-ECU-COMP', code: 'WIP-ECU-WING-20', name: 'قطعه مکمل براکت ضدسرقت رایانه موتور', type: 'SEMI_FINISHED', carModel: 'پژو ۲۰۶ / ۲۰۷', unit: 'PCS', weightNetKg: 0.6, weightGrossKg: 0.7, minSafetyStock: 800, isDeleted: false },
    { id: 'PRT-RAW-DC04-08', code: 'RM-COIL-DC04-08', name: 'رول ورق روغنی DC04 ضخامت ۰.۸ میلی‌متر ساپکو', type: 'RAW_MATERIAL', carModel: 'پژو ۲۰۶ / ۲۰۷', unit: 'KG', weightNetKg: 1.0, weightGrossKg: 1.0, minSafetyStock: 5000, isDeleted: false },
    { id: 'PRT-RAW-DC01-15', code: 'RM-COIL-DC01-15', name: 'رول ورق روغنی DC01A ضخامت ۱.۵ میلی‌متر ساپکو', type: 'RAW_MATERIAL', carModel: 'پژو ۲۰۶ / ۲۰۷', unit: 'KG', weightNetKg: 1.0, weightGrossKg: 1.0, minSafetyStock: 5000, isDeleted: false },
    { id: 'PRT-FST-NUT-M6', code: 'FST-NUT-WELD-M6', name: 'مهره جوشی چهارگوش M6 گرید 8.8 استاندارد DIN 928', type: 'RAW_MATERIAL', carModel: 'پژو ۲۰۶ / ۲۰۷', unit: 'PCS', weightNetKg: 0.005, weightGrossKg: 0.005, minSafetyStock: 25000, isDeleted: false },
    { id: 'PRT-FST-BLT-M6', code: 'FST-BOLT-WELD-M6-20', name: 'پیچ جوشی پایه M6 طول 20 میلیمتر گرید 8.8', type: 'RAW_MATERIAL', carModel: 'پژو ۲۰۶ / ۲۰۷', unit: 'PCS', weightNetKg: 0.012, weightGrossKg: 0.012, minSafetyStock: 10000, isDeleted: false },
    { id: 'PRT-FGD-TARA-BPIL', code: 'IKCO-TARA-BPIL-02', name: 'مجموعه تقویتی ستون وسط (B-Pillar) تارا', type: 'FINISHED_GOOD', carModel: 'تارا', unit: 'PCS', weightNetKg: 2.3, weightGrossKg: 2.8, minSafetyStock: 500, isDeleted: false },
    { id: 'PRT-RAW-ST14-12', code: 'RM-COIL-ST14-12', name: 'کلاف ورق روغنی کشش عمیق ST14 ضخامت ۱.۲ میلی‌متر ساپکو', type: 'RAW_MATERIAL', carModel: 'تارا / دنا', unit: 'KG', weightNetKg: 1.0, weightGrossKg: 1.0, minSafetyStock: 4000, isDeleted: false },
  ];

  const bomComponents = [
    { id: 'bom-ecu-1', parentItemId: 'PRT-FGD-ECU-BRK', childItemId: 'PRT-WIP-ECU-MAIN', quantity: 1, version: '1.0', scrapFactor: 2.0, notes: 'صفحه اصلی براکت ECU', isDeleted: false },
    { id: 'bom-ecu-2', parentItemId: 'PRT-FGD-ECU-BRK', childItemId: 'PRT-WIP-ECU-COMP', quantity: 1, version: '1.0', scrapFactor: 1.5, notes: 'قطعه مکمل براکت ECU', isDeleted: false },
    { id: 'bom-ecu-3', parentItemId: 'PRT-WIP-ECU-MAIN', childItemId: 'PRT-RAW-DC04-08', quantity: 1.48, version: '1.0', scrapFactor: 2.0, notes: 'ورق مصرفی صفحه اصلی (سطح ۲)', isDeleted: false },
    { id: 'bom-ecu-4', parentItemId: 'PRT-WIP-ECU-MAIN', childItemId: 'PRT-FST-NUT-M6', quantity: 15, version: '1.0', scrapFactor: 0.5, notes: '۱۵ عدد مهره جوشی M6', isDeleted: false },
    { id: 'bom-ecu-5', parentItemId: 'PRT-WIP-ECU-COMP', childItemId: 'PRT-RAW-DC01-15', quantity: 0.7, version: '1.0', scrapFactor: 1.5, notes: 'ورق مصرفی مکمل (سطح ۲)', isDeleted: false },
    { id: 'bom-ecu-6', parentItemId: 'PRT-WIP-ECU-COMP', childItemId: 'PRT-FST-BLT-M6', quantity: 2, version: '1.0', scrapFactor: 0.5, notes: '۲ عدد پیچ جوشی M6x20', isDeleted: false },
    { id: 'bom-tara-1', parentItemId: 'PRT-FGD-TARA-BPIL', childItemId: 'PRT-RAW-ST14-12', quantity: 2.8, version: '1.0', scrapFactor: 2.5, notes: 'ورق مصرفی ستون وسط تارا', isDeleted: false },
  ];

  const routingOperations = [
    { id: 'rop-ecu-10', itemId: 'PRT-FGD-ECU-BRK', opNumber: 10, opCode: 'OP10', opName: 'بلنکینگ و برش اولیه نوار ورق', workCenterId: 'wc-prs-400t', requiresOpId: null, setupTimeMin: 30, cycleTimeSec: 15, isDeleted: false },
    { id: 'rop-ecu-20', itemId: 'PRT-FGD-ECU-BRK', opNumber: 20, opCode: 'OP20', opName: 'کشش و فرم‌دهی اصلی براکت', workCenterId: 'wc-prs-800t', requiresOpId: 'rop-ecu-10', setupTimeMin: 45, cycleTimeSec: 32, isDeleted: false },
    { id: 'rop-ecu-30', itemId: 'PRT-FGD-ECU-BRK', opNumber: 30, opCode: 'OP30', opName: 'پانچ سوراخ‌کاری و دوربری لبه', workCenterId: 'wc-prs-250t', requiresOpId: 'rop-ecu-20', setupTimeMin: 25, cycleTimeSec: 18, isDeleted: false },
    { id: 'rop-ecu-40', itemId: 'PRT-FGD-ECU-BRK', opNumber: 40, opCode: 'OP40', opName: 'پرس‌جوش مهره و پیچ + جوش مونتاژ CO2', workCenterId: 'wc-wld-spot', requiresOpId: 'rop-ecu-30', setupTimeMin: 20, cycleTimeSec: 22, isDeleted: false },
    { id: 'rop-tara-10', itemId: 'PRT-FGD-TARA-BPIL', opNumber: 10, opCode: 'OP10', opName: 'بلنکینگ اولیه ستون وسط تارا', workCenterId: 'wc-prs-400t', requiresOpId: null, setupTimeMin: 40, cycleTimeSec: 18, isDeleted: false },
    { id: 'rop-tara-20', itemId: 'PRT-FGD-TARA-BPIL', opNumber: 20, opCode: 'OP20', opName: 'کشش عمیق هیدرولیک ستون تارا', workCenterId: 'wc-prs-800t', requiresOpId: 'rop-tara-10', setupTimeMin: 55, cycleTimeSec: 38, isDeleted: false },
    { id: 'rop-tara-30', itemId: 'PRT-FGD-TARA-BPIL', opNumber: 30, opCode: 'OP30', opName: 'دوربری و پانچ نهایی ستون تارا', workCenterId: 'wc-prs-250t', requiresOpId: 'rop-tara-20', setupTimeMin: 30, cycleTimeSec: 25, isDeleted: false },
  ];

  const workOrders = [
    {
      id: 'wo-ecu-asy-01',
      orderNumber: 'WO-1404-1001',
      itemId: 'PRT-FGD-ECU-BRK',
      plannedQuantity: 1500,
      completedQuantity: 600,
      scrapQuantity: 12,
      status: 'IN_PROGRESS',
      startDate: todayMorning,
      endDate: fiveDaysLater,
      actualStartDate: todayMorning,
      notes: 'دستور کار اصلی مجموعه براکت ضدسرقت ECU ساپکو',
      isDeleted: false,
    },
    {
      id: 'wo-tara-bpil-02',
      orderNumber: 'WO-1404-1002',
      itemId: 'PRT-FGD-TARA-BPIL',
      plannedQuantity: 1800,
      completedQuantity: 450,
      scrapQuantity: 8,
      status: 'IN_PROGRESS',
      startDate: todayMorning2,
      endDate: fiveDaysLater,
      actualStartDate: todayMorning2,
      notes: 'دستور کار همزمان ستون وسط تارا در سالن پرس سنگین',
      isDeleted: false,
    },
  ];

  const productionLogs = [
    {
      id: 'plog-ecu-op10-1',
      workOrderId: 'wo-ecu-asy-01',
      operationId: 'rop-ecu-10',
      goodQuantity: 1450,
      scrapQuantity: 15,
      operatorId: 'EMP-2011',
      isApproved: true,
      approvedBy: 'مهندس رضایی (سرپرست پرس)',
      approvedAt: now,
      shiftName: 'شیفت صبح',
      notes: 'برش و بلنکینگ اولیه OP10 تایید شده',
      isDeleted: false,
    },
    {
      id: 'plog-ecu-op20-1',
      workOrderId: 'wo-ecu-asy-01',
      operationId: 'rop-ecu-20',
      goodQuantity: 950,
      scrapQuantity: 8,
      operatorId: 'EMP-2018',
      isApproved: true,
      approvedBy: 'مهندس رضایی (سرپرست پرس)',
      approvedAt: now,
      shiftName: 'شیفت صبح',
      notes: 'کشش و فرم‌دهی OP20 تایید شده',
      isDeleted: false,
    },
    {
      id: 'plog-ecu-op30-1',
      workOrderId: 'wo-ecu-asy-01',
      operationId: 'rop-ecu-30',
      goodQuantity: 600,
      scrapQuantity: 5,
      operatorId: 'EMP-2022',
      isApproved: true,
      approvedBy: 'مهندس حسینی',
      approvedAt: now,
      shiftName: 'شیفت صبح',
      notes: 'پانچ و دوربری OP30 تایید شده',
      isDeleted: false,
    },
    {
      id: 'plog-tara-op10-1',
      workOrderId: 'wo-tara-bpil-02',
      operationId: 'rop-tara-10',
      goodQuantity: 900,
      scrapQuantity: 6,
      operatorId: 'EMP-2045',
      isApproved: true,
      approvedBy: 'مهندس حسینی',
      approvedAt: now,
      shiftName: 'شیفت صبح',
      notes: 'بلنکینگ ستون تارا تایید شد',
      isDeleted: false,
    },
  ];

  return { workCenters, items, bomComponents, routingOperations, workOrders, productionLogs };
}

function getEmbeddedSapPpStore(): EmbeddedSapPpStore {
  if (!global.__kpimsEmbeddedSapPpStore) {
    try {
      if (fs.existsSync(SAP_PP_RELATIONAL_DISK_PATH)) {
        const raw = JSON.parse(fs.readFileSync(SAP_PP_RELATIONAL_DISK_PATH, 'utf-8'));
        if (raw && Array.isArray(raw.workOrders) && Array.isArray(raw.items)) {
          raw.workOrders = raw.workOrders.map((wo: any) => ({
            ...wo,
            startDate: new Date(wo.startDate),
            endDate: new Date(wo.endDate),
            actualStartDate: wo.actualStartDate ? new Date(wo.actualStartDate) : null,
          }));
          raw.productionLogs = (raw.productionLogs || []).map((pl: any) => ({
            ...pl,
            approvedAt: pl.approvedAt ? new Date(pl.approvedAt) : null,
          }));
          global.__kpimsEmbeddedSapPpStore = raw;
          return global.__kpimsEmbeddedSapPpStore!;
        }
      }
    } catch {
      // ignore disk read issues and seed fresh
    }
    global.__kpimsEmbeddedSapPpStore = createInitialEmbeddedSapPpStore();
    saveEmbeddedSapPpStore();
  }
  return global.__kpimsEmbeddedSapPpStore;
}

function saveEmbeddedSapPpStore(): void {
  try {
    const store = global.__kpimsEmbeddedSapPpStore;
    if (!store) return;
    const dir = path.dirname(SAP_PP_RELATIONAL_DISK_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Only persist non-QA temporary records so test runs stay clean
    const cleanStore: EmbeddedSapPpStore = {
      workCenters: store.workCenters.filter(r => !String(r.code || '').includes('-QA-')),
      items: store.items.filter(r => !String(r.code || '').includes('-QA-')),
      bomComponents: store.bomComponents.filter(r => !String(r.id || '').includes('-QA-')),
      routingOperations: store.routingOperations.filter(r => !String(r.id || '').includes('-QA-')),
      workOrders: store.workOrders.filter(r => !String(r.orderNumber || '').includes('-QA-')),
      productionLogs: store.productionLogs.filter(r => !String(r.operatorId || '').includes('QA-TEST')),
    };
    fs.writeFileSync(SAP_PP_RELATIONAL_DISK_PATH, JSON.stringify(cleanStore, null, 2), 'utf-8');
  } catch {
    // ignore disk write issues
  }
}

function matchesWhere(row: any, where?: any): boolean {
  if (!where || typeof where !== 'object') return true;
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (key === 'OR' && Array.isArray(cond)) {
      if (!cond.some(sub => matchesWhere(row, sub))) return false;
      continue;
    }
    if (key === 'AND' && Array.isArray(cond)) {
      if (!cond.every(sub => matchesWhere(row, sub))) return false;
      continue;
    }
    // Compound unique keys used in Prisma upsert
    if (key === 'parentItemId_childItemId_version' && typeof cond === 'object' && cond !== null) {
      if (
        row.parentItemId !== (cond as any).parentItemId ||
        row.childItemId !== (cond as any).childItemId ||
        row.version !== (cond as any).version
      ) {
        return false;
      }
      continue;
    }
    if (key === 'itemId_opNumber' && typeof cond === 'object' && cond !== null) {
      if (row.itemId !== (cond as any).itemId || Number(row.opNumber) !== Number((cond as any).opNumber)) {
        return false;
      }
      continue;
    }

    const val = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Record<string, any>;
      if (Array.isArray(c.in) && !c.in.includes(val)) return false;
      if (Array.isArray(c.notIn) && c.notIn.includes(val)) return false;
      if (c.not !== undefined && val === c.not) return false;
      if (c.lte !== undefined) {
        const vTime = val instanceof Date ? val.getTime() : new Date(val).getTime();
        const cTime = c.lte instanceof Date ? c.lte.getTime() : new Date(c.lte).getTime();
        if (vTime > cTime) return false;
      }
      if (c.gte !== undefined) {
        const vTime = val instanceof Date ? val.getTime() : new Date(val).getTime();
        const cTime = c.gte instanceof Date ? c.gte.getTime() : new Date(c.gte).getTime();
        if (vTime < cTime) return false;
      }
      continue;
    }
    if (val !== cond) return false;
  }
  return true;
}

function hydrateRelations(
  tableKey: keyof EmbeddedSapPpStore,
  row: any,
  include?: any,
  store?: EmbeddedSapPpStore
): any {
  if (!row) return null;
  const s = store || getEmbeddedSapPpStore();
  const copy = { ...row };
  if (!include || typeof include !== 'object') return copy;

  if (tableKey === 'workOrders' && include.item) {
    const item = s.items.find(i => i.id === copy.itemId) || null;
    copy.item = item
      ? hydrateRelations(
          'items',
          item,
          typeof include.item === 'object' ? include.item.include : undefined,
          s
        )
      : null;
  }

  if (tableKey === 'items' && include.routingOperations) {
    const roInclude = typeof include.routingOperations === 'object' ? include.routingOperations : {};
    let ops = s.routingOperations.filter(
      op => op.itemId === copy.id && matchesWhere(op, roInclude.where)
    );
    ops = ops.sort((a, b) => Number(a.opNumber) - Number(b.opNumber));
    copy.routingOperations = ops.map(op =>
      hydrateRelations('routingOperations', op, roInclude.include, s)
    );
  }

  if (tableKey === 'routingOperations' && include.workCenter) {
    copy.workCenter = s.workCenters.find(wc => wc.id === copy.workCenterId) || null;
  }

  if (tableKey === 'bomComponents' && include.childItem) {
    copy.childItem = s.items.find(i => i.id === copy.childItemId) || null;
  }

  return copy;
}

function createEmbeddedTableDelegate(tableKey: keyof EmbeddedSapPpStore) {
  return {
    async findMany(args?: any) {
      const store = getEmbeddedSapPpStore();
      let rows = store[tableKey].filter(r => matchesWhere(r, args?.where));
      if (args?.orderBy) {
        const [field, dir] = Object.entries(args.orderBy)[0] || [];
        if (field && typeof dir === 'string') {
          rows = [...rows].sort((a, b) => {
            const av = a[field];
            const bv = b[field];
            if (av < bv) return dir === 'desc' ? 1 : -1;
            if (av > bv) return dir === 'desc' ? -1 : 1;
            return 0;
          });
        }
      }
      return rows.map(r => hydrateRelations(tableKey, r, args?.include, store));
    },
    async findFirst(args?: any) {
      const list = await this.findMany(args);
      return list[0] || null;
    },
    async findUnique(args?: any) {
      return this.findFirst(args);
    },
    async count(args?: any) {
      const store = getEmbeddedSapPpStore();
      return store[tableKey].filter(r => matchesWhere(r, args?.where)).length;
    },
    async create(args: any) {
      const store = getEmbeddedSapPpStore();
      const data = args?.data || {};
      const record = {
        id: data.id || `${tableKey.slice(0, 3)}-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        isDeleted: false,
        ...data,
        ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
        ...(data.endDate ? { endDate: new Date(data.endDate) } : {}),
      };
      store[tableKey].push(record);
      saveEmbeddedSapPpStore();
      return hydrateRelations(tableKey, record, args?.include, store);
    },
    async update(args: any) {
      const store = getEmbeddedSapPpStore();
      const idx = store[tableKey].findIndex(r => matchesWhere(r, args?.where));
      if (idx === -1) throw new Error(`Record not found in ${tableKey}`);
      store[tableKey][idx] = { ...store[tableKey][idx], ...(args?.data || {}) };
      saveEmbeddedSapPpStore();
      return hydrateRelations(tableKey, store[tableKey][idx], args?.include, store);
    },
    async updateMany(args: any) {
      const store = getEmbeddedSapPpStore();
      let count = 0;
      store[tableKey] = store[tableKey].map(r => {
        if (matchesWhere(r, args?.where)) {
          count += 1;
          return { ...r, ...(args?.data || {}) };
        }
        return r;
      });
      saveEmbeddedSapPpStore();
      return { count };
    },
    async upsert(args: any) {
      const store = getEmbeddedSapPpStore();
      const idx = store[tableKey].findIndex(r => matchesWhere(r, args?.where));
      if (idx >= 0) {
        store[tableKey][idx] = { ...store[tableKey][idx], ...(args?.update || {}) };
        saveEmbeddedSapPpStore();
        return hydrateRelations(tableKey, store[tableKey][idx], args?.include, store);
      }
      return this.create({ data: args?.create || {}, include: args?.include });
    },
    async deleteMany(args?: any) {
      const store = getEmbeddedSapPpStore();
      const before = store[tableKey].length;
      store[tableKey] = store[tableKey].filter(r => !matchesWhere(r, args?.where));
      saveEmbeddedSapPpStore();
      return { count: before - store[tableKey].length };
    },
    async delete(args: any) {
      const store = getEmbeddedSapPpStore();
      const idx = store[tableKey].findIndex(r => matchesWhere(r, args?.where));
      if (idx === -1) throw new Error(`Record not found in ${tableKey}`);
      const [removed] = store[tableKey].splice(idx, 1);
      saveEmbeddedSapPpStore();
      return removed;
    },
  };
}

const EMBEDDED_MODEL_MAP: Record<string, keyof EmbeddedSapPpStore> = {
  workCenter: 'workCenters',
  item: 'items',
  bomComponent: 'bomComponents',
  routingOperation: 'routingOperations',
  workOrder: 'workOrders',
  productionLog: 'productionLogs',
};

const normalizePgUrl = (raw?: string): string => {
  if (!raw) return '';
  let val = raw.trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1).trim();
  }
  return val;
};

const readDatabaseUrlFromDotEnv = (): string => {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return '';
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      if (key === 'DATABASE_URL') {
        return normalizePgUrl(trimmed.slice(eqIdx + 1));
      }
    }
  } catch {
    // ignore
  }
  return '';
};

const enrichPoolerParameters = (rawUrl: string): string => {
  if (!rawUrl) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.includes('pooler.supabase.com')) {
      if (!parsed.searchParams.has('connection_limit')) {
        parsed.searchParams.set('connection_limit', '3');
      }
      if (!parsed.searchParams.has('pool_timeout')) {
        parsed.searchParams.set('pool_timeout', '10');
      }
      if (!parsed.searchParams.has('connect_timeout')) {
        parsed.searchParams.set('connect_timeout', '10');
      }
      return parsed.toString();
    }
  } catch {
    // ignore URL parse issues
  }
  return rawUrl;
};

const getEffectiveRawDatabaseUrl = (): string => {
  const fromFile = readDatabaseUrlFromDotEnv();
  if (fromFile && fromFile !== DEFAULT_FALLBACK_PG_URL) {
    const enriched = enrichPoolerParameters(fromFile);
    process.env.DATABASE_URL = enriched;
    return enriched;
  }
  const fromEnv = normalizePgUrl(process.env.DATABASE_URL);
  if (
    fromEnv &&
    fromEnv !== DEFAULT_FALLBACK_PG_URL &&
    !fromEnv.includes('@localhost:') &&
    !fromEnv.includes('@127.0.0.1:')
  ) {
    return enrichPoolerParameters(fromEnv);
  }
  return fromFile || fromEnv;
};

export const isDatabaseUrlSyntaxValid = (): boolean => {
  const rawUrl = getEffectiveRawDatabaseUrl();
  if (!rawUrl || rawUrl === DEFAULT_FALLBACK_PG_URL) return false;
  try {
    const parsed = new URL(rawUrl);
    return (
      (parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:') &&
      Boolean(parsed.hostname) &&
      parsed.pathname.length > 1 &&
      parsed.hostname.toLowerCase() !== 'your_host' &&
      parsed.username.toLowerCase() !== 'your_user' &&
      parsed.pathname.slice(1).toLowerCase() !== 'your_database'
    );
  } catch {
    return false;
  }
};

export const markDatabaseUnreachable = (reason?: unknown): void => {
  const msg = reason instanceof Error ? reason.message : String(reason || '');
  global.__kpimsLastDbError = msg;
  global.__kpimsDbReachable = false;
  global.__kpimsLastProbeFailedAt = Date.now();
  const existing = global.__prismaClient;
  global.__prismaClient = undefined;
  if (existing) {
    try {
      existing.$disconnect().catch(() => {});
    } catch {
      // ignore
    }
  }
};

export const isDatabaseUrlConfigured = (): boolean => {
  if (global.__kpimsDbReachable !== true) return false;
  return isDatabaseUrlSyntaxValid();
};

function buildPgStartupMessage(user: string, database: string): Buffer {
  const payload = Buffer.from(`user\0${user}\0database\0${database}\0\0`, 'utf8');
  const buf = Buffer.alloc(8 + payload.length);
  buf.writeInt32BE(8 + payload.length, 0);
  buf.writeInt32BE(196608, 4);
  payload.copy(buf, 8);
  return buf;
}

async function probePostgresWireProtocol(rawUrl: string, timeoutMs: number): Promise<boolean> {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname;
    const port = Number(parsed.port || 5432);
    const user = decodeURIComponent(parsed.username || 'postgres');
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, '') || 'postgres');
    const startupPacket = buildPgStartupMessage(user, database);

    const plainResult = await new Promise<'OK' | 'SSL_REQUIRED' | 'FAIL'>(resolve => {
      let settled = false;
      const done = (val: 'OK' | 'SSL_REQUIRED' | 'FAIL') => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          socket.destroy();
        } catch {
          // ignore
        }
        resolve(val);
      };

      const socket = net.createConnection({ host, port });
      const timer = setTimeout(() => done('FAIL'), timeoutMs);

      socket.once('connect', () => {
        socket.write(startupPacket);
      });

      socket.once('data', (chunk: Buffer) => {
        if (!chunk || chunk.length === 0) return done('FAIL');
        const firstByte = String.fromCharCode(chunk[0]);
        if (firstByte === 'R') {
          return done('OK');
        }
        const text = chunk.toString('utf8');
        if (firstByte === 'E' && /ssl|encryption/i.test(text) && !/ENOTFOUND|tenant\/user/i.test(text)) {
          return done('SSL_REQUIRED');
        }
        return done('FAIL');
      });

      socket.once('error', () => done('FAIL'));
      socket.once('close', () => done('FAIL'));
    });

    if (plainResult === 'OK') return true;
    if (plainResult === 'FAIL') return false;

    return await new Promise<boolean>(resolve => {
      let settled = false;
      const socket = net.createConnection({ host, port });
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.destroy();
          resolve(false);
        }
      }, timeoutMs);

      const finish = (ok: boolean, stream?: net.Socket | tls.TLSSocket) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          stream?.destroy();
          socket.destroy();
        } catch {
          // ignore
        }
        resolve(ok);
      };

      socket.once('connect', () => {
        const sslReq = Buffer.alloc(8);
        sslReq.writeInt32BE(8, 0);
        sslReq.writeInt32BE(80877103, 4);
        socket.write(sslReq);
      });

      socket.once('data', (chunk: Buffer) => {
        if (!chunk || chunk.length === 0 || String.fromCharCode(chunk[0]) !== 'S') {
          return finish(false);
        }
        const tlsSocket = tls.connect(
          { socket, servername: host, rejectUnauthorized: false },
          () => {
            tlsSocket.write(startupPacket);
          }
        );
        tlsSocket.once('data', (tlsChunk: Buffer) => {
          if (!tlsChunk || tlsChunk.length === 0) return finish(false, tlsSocket);
          const code = String.fromCharCode(tlsChunk[0]);
          finish(code === 'R', tlsSocket);
        });
        tlsSocket.once('error', () => finish(false, tlsSocket));
      });

      socket.once('error', () => finish(false));
    });
  } catch {
    return false;
  }
}

export async function probeDatabaseConnectivity(timeoutMs = 4500, force = false): Promise<boolean> {
  if (!isDatabaseUrlSyntaxValid()) {
    global.__kpimsDbReachable = false;
    return false;
  }

  if (
    !force &&
    global.__kpimsDbReachable === false &&
    global.__kpimsLastProbeFailedAt &&
    Date.now() - global.__kpimsLastProbeFailedAt < PROBE_COOLDOWN_MS
  ) {
    return false;
  }

  const rawUrl = getEffectiveRawDatabaseUrl();
  try {
    const wireOk = await probePostgresWireProtocol(rawUrl, timeoutMs);
    if (!wireOk) {
      markDatabaseUnreachable('PostgreSQL wire-protocol preflight rejected or tenant paused');
      return false;
    }

    const realClient = getOrCreateRealPrismaClient();
    await Promise.race([
      realClient.$queryRaw`SELECT 1 as ok`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB probe timeout')), timeoutMs)),
    ]);
    global.__kpimsDbReachable = true;
    global.__kpimsLastDbError = undefined;
    global.__kpimsLastProbeFailedAt = undefined;
    return true;
  } catch (err) {
    markDatabaseUnreachable(err);
    return false;
  }
}

export const resolveDatabaseUrl = (): string => {
  const rawUrl = getEffectiveRawDatabaseUrl();
  if (isDatabaseUrlSyntaxValid()) {
    process.env.DATABASE_URL = enrichPoolerParameters(rawUrl);
    return process.env.DATABASE_URL;
  }
  return DEFAULT_FALLBACK_PG_URL;
};

function getOrCreateRealPrismaClient(): PrismaClient {
  if (!global.__prismaClient) {
    const dbUrl = resolveDatabaseUrl();

    const client = new PrismaClient({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });

    (client as any).$on('error', (e: any) => {
      const msg = String(e?.message || '');
      global.__kpimsLastDbError = msg;
      if (
        msg.includes('Closed') ||
        msg.includes('kind: Closed') ||
        msg.includes('E57P01') ||
        msg.includes('terminating connection') ||
        msg.includes('ENOTFOUND') ||
        msg.includes('tenant/user') ||
        msg.includes('P1001') ||
        msg.includes('P1002') ||
        msg.includes('P1017')
      ) {
        markDatabaseUnreachable(msg);
      }
    });

    (client as any).$on('warn', () => {
      // suppress warnings
    });

    global.__prismaClient = client;
  }
  return global.__prismaClient;
}

const createOfflineModelDelegate = (): any =>
  new Proxy(() => Promise.reject(new Error('HYBRID_DISK_MODE_ACTIVE')), {
    get(_target, prop) {
      if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
      return () => Promise.reject(new Error('HYBRID_DISK_MODE_ACTIVE'));
    },
    apply() {
      return Promise.reject(new Error('HYBRID_DISK_MODE_ACTIVE'));
    },
  });

export const getPrismaClient = (): PrismaClient => {
  if (!global.__prismaProxy) {
    const offlineDelegate = createOfflineModelDelegate();
    const embeddedDelegates: Record<string, any> = {};
    for (const [modelName, storeKey] of Object.entries(EMBEDDED_MODEL_MAP)) {
      embeddedDelegates[modelName] = createEmbeddedTableDelegate(storeKey);
    }

    global.__prismaProxy = new Proxy({} as PrismaClient, {
      get(_target, prop: string | symbol) {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          return undefined;
        }
        if (global.__kpimsDbReachable === true) {
          const client = getOrCreateRealPrismaClient() as any;
          const val = client[prop];
          return typeof val === 'function' ? val.bind(client) : val;
        }
        if (typeof prop === 'string' && prop in embeddedDelegates) {
          return embeddedDelegates[prop];
        }
        if (prop === '$on' || prop === '$use' || prop === '$extends') {
          return () => global.__prismaProxy;
        }
        if (prop === '$connect' || prop === '$disconnect') {
          return () => Promise.resolve();
        }
        if (
          prop === '$transaction' ||
          prop === '$queryRaw' ||
          prop === '$queryRawUnsafe' ||
          prop === '$executeRaw' ||
          prop === '$executeRawUnsafe'
        ) {
          return () => Promise.reject(new Error('HYBRID_DISK_MODE_ACTIVE'));
        }
        return offlineDelegate;
      },
    });
  }
  return global.__prismaProxy;
};

export interface DatabaseStatus {
  isConfigured: boolean;
  isConnected: boolean;
  isDurableStorageActive?: boolean;
  databaseType: 'SQLite' | 'PostgreSQL';
  databaseUrlMasked: string;
  storageMode?: 'POSTGRESQL_LIVE' | 'HYBRID_DURABLE_DISK';
  errorMessage?: string;
  lastChecked: string;
}

export async function checkDatabaseConnection(): Promise<DatabaseStatus> {
  const rawUrl = resolveDatabaseUrl();
  const maskedUrl = rawUrl.replace(/:([^@]+)@/, ':****@');
  const dbType: 'SQLite' | 'PostgreSQL' =
    rawUrl.startsWith('postgresql://') || rawUrl.startsWith('postgres://') ? 'PostgreSQL' : 'SQLite';
  const hasConfiguredUrl = isDatabaseUrlSyntaxValid();

  if (global.__kpimsDbReachable === true) {
    return {
      isConfigured: true,
      isConnected: true,
      isDurableStorageActive: false,
      databaseType: dbType,
      databaseUrlMasked: maskedUrl,
      storageMode: 'POSTGRESQL_LIVE',
      lastChecked: new Date().toISOString(),
    };
  }

  const reachable = await probeDatabaseConnectivity(3500, false);
  if (reachable) {
    return {
      isConfigured: true,
      isConnected: true,
      isDurableStorageActive: false,
      databaseType: dbType,
      databaseUrlMasked: maskedUrl,
      storageMode: 'POSTGRESQL_LIVE',
      lastChecked: new Date().toISOString(),
    };
  }

  const reasonSummary = global.__kpimsLastDbError
    ? `اتصال به پایگاه داده ابری PostgreSQL برقرار نشد (${global.__kpimsLastDbError.slice(0, 120)}). موتور پایدار دیسک محلی (HYBRID_DURABLE_DISK) با ذخیره خودکار فعال است.`
    : 'آدرس PostgreSQL معتبر تنظیم نشده یا در دسترس نیست؛ موتور پایدار دیسک محلی (HYBRID_DURABLE_DISK) با ذخیره خودکار فعال است.';

  return {
    isConfigured: hasConfiguredUrl,
    isConnected: false,
    isDurableStorageActive: true,
    databaseType: dbType,
    databaseUrlMasked: maskedUrl,
    storageMode: 'HYBRID_DURABLE_DISK',
    errorMessage: reasonSummary,
    lastChecked: new Date().toISOString(),
  };
}
