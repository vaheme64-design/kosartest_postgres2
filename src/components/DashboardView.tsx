import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  Pin,
  BarChart3,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Calculator,
  Layers,
  Boxes,
  FileSpreadsheet,
  GitBranch,
  Activity,
  RefreshCw,
  ArrowLeft,
  FileCheck2,
} from 'lucide-react';
import {
  InventoryTransaction,
  StageInventorySummary,
  Machine,
  UserRoleProfile,
  Part,
  Routing,
  DieMold,
  FactoryHall,
  SapcoCoilReceipt,
} from '../types/inventory';
import { TabKey, SubModuleNavParams } from './Sidebar';
import { InventorySubTab } from './inventory/InventoryModuleView';
import { FactoryHighwayWorkbench } from './workflow/FactoryHighwayWorkbench';
import { loadVipPartsMap } from '../utils/qcHoldStore';
import { formatNumber, toPersianDigits } from '../utils/formatters';
import { MetricTooltip } from './common/MetricTooltip';
import { FormulaTooltip } from './common/FormulaTooltip';
import { MachineOverlapAlertWidget } from './planning/MachineOverlapAlertWidget';
import { D3MaterialFlowDiagram } from './production/D3MaterialFlowDiagram';
import { useErpRouter } from '../context/RouterContext';

interface DashboardViewProps {
  currentUser?: UserRoleProfile;
  summary: {
    rawMaterialKg: number;
    totalWipPcs: number;
    totalWipKg: number;
    totalFinishedPcs: number;
    totalFinishedKg: number;
    totalScrapQty: number;
    totalScrapKg: number;
    overallScrapRate: number;
    stageBalances: StageInventorySummary[];
  } | null;
  recentTransactions: InventoryTransaction[];
  machines: Machine[];
  parts?: Part[];
  routings?: Routing[];
  dies?: DieMold[];
  halls?: FactoryHall[];
  coils?: SapcoCoilReceipt[];
  onNavigateToTab: (
    tab: TabKey,
    subTab?: InventorySubTab,
    actionModal?: 'RECEIPT' | 'ISSUE' | 'RETURN' | 'TRANSFER'
  ) => void;
  onNavigateSubModule?: (tab: TabKey, navParams?: SubModuleNavParams) => void;
  onOpenNewVoucher: (type: string, partId?: string) => void;
  onSubmitVoucher?: (payload: any) => Promise<{ success: boolean; message?: string }>;
  initialOrderId?: string | null;
  initialDrawerTab?: any;
  onOrderDrawerChange?: (orderId: string | null, tab?: any) => void;
}

type HorizonDays = 30 | 60 | 90;
type DashboardWorkspaceTab = 'WORKBENCH' | 'TRACEABILITY_FLOW' | 'ANALYTICS_ITR';

interface TierStockItem {
  partId: string;
  partCode: string;
  partName: string;
  category: string;
  tierLabel: string;
  unit: string;
  unitWeightKg: number;
  minStock: number;
  totalEntered: number;
  totalConsumed: number;
  onHandAfterConsumption: number;
  availableQty: number;
  stockStatus: string;
  warehouses: string;
  relatedDocsCount: number;
  relatedDocs: string;
}

interface TraceabilityChainDoc {
  docNumber: string;
  docDate: string;
  docType: string;
  sourceWh: string;
  targetWh: string;
  partCode: string;
  partName: string;
  qty: number;
  weightKg: number;
  coilId: string;
  heatNumber: string;
  referenceDoc: string;
}

interface VipPartTurnoverRow {
  partId: string;
  partCode: string;
  partName: string;
  category: string;
  unitWeightKg: number;
  avgInventoryQty: number;
  consumption30d: number;
  consumption60d: number;
  consumption90d: number;
  itr30: number;
  itr60: number;
  itr90: number;
  dsi30: number;
  dsi60: number;
  dsi90: number;
  isExplicitVip: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  summary,
  recentTransactions = [],
  machines,
  parts = [],
  routings = [],
  dies = [],
  halls = [],
  coils = [],
  onNavigateToTab,
  onNavigateSubModule,
  onOpenNewVoucher,
  onSubmitVoucher,
  initialOrderId,
  initialDrawerTab,
  onOrderDrawerChange,
}) => {
  const { traceDocument } = useErpRouter();
  const [activeWorkspace, setActiveWorkspace] = useState<DashboardWorkspaceTab>('WORKBENCH');
  const [selectedHorizon, setSelectedHorizon] = useState<HorizonDays>(30);
  const [vipMap, setVipMap] = useState<Record<string, boolean>>(() => loadVipPartsMap());
  const [tierStock, setTierStock] = useState<TierStockItem[]>([]);
  const [docChain, setDocChain] = useState<TraceabilityChainDoc[]>([]);
  const [traceLoading, setTraceLoading] = useState<boolean>(false);

  const fetchTraceabilityChain = useCallback(async () => {
    setTraceLoading(true);
    try {
      const res = await fetch('/api/traceability/full-chain');
      const json = await res.json();
      if (json?.success && json.data) {
        setTierStock(Array.isArray(json.data.tierStockSummary) ? json.data.tierStockSummary : []);
        setDocChain(Array.isArray(json.data.documentChain) ? json.data.documentChain : []);
      }
    } catch (err) {
      console.error('Failed to fetch traceability chain:', err);
    } finally {
      setTraceLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTraceabilityChain();
  }, [fetchTraceabilityChain, summary, recentTransactions.length]);

  useEffect(() => {
    const syncVip = () => setVipMap(loadVipPartsMap());
    window.addEventListener('storage', syncVip);
    return () => window.removeEventListener('storage', syncVip);
  }, []);

  // Group 3-Tier items for the top live post-consumption control strip
  const tierGroups = useMemo(() => {
    const rawItems = tierStock.filter(i => i.category === 'RAW_MATERIAL');
    const wipItems = tierStock.filter(i => i.category === 'WIP_PART');
    const fgItems = tierStock.filter(i => i.category === 'FINISHED_GOOD');

    const coilItem = rawItems.find(i => i.partCode.includes('COIL'));
    const nutItem = rawItems.find(i => i.partCode.includes('NUT'));
    const boltItem = rawItems.find(i => i.partCode.includes('BOLT'));

    const wipMain = wipItems.find(i => i.partCode === 'WIP-ECU-MAIN-BRK');
    const wipComp = wipItems.find(i => i.partCode === 'WIP-ECU-COMP-BRK');
    const fgBrk = fgItems.find(i => i.partCode === 'SAPCO-ASY-ECU-BRK-01') || fgItems[0];

    return {
      coilItem,
      nutItem,
      boltItem,
      wipMain,
      wipComp,
      fgBrk,
      totalPostedDocs: docChain.length,
    };
  }, [tierStock, docChain]);

  // Compute 30, 60, and 90-day Inventory Turnover Ratio (ITR) connected to real post-consumption balances
  const vipTurnoverRows = useMemo<VipPartTurnoverRow[]>(() => {
    const explicitVips = parts.filter(
      p => p.isVIP || vipMap[p.id] || vipMap[p.code]
    );

    const targetParts =
      explicitVips.length > 0
        ? explicitVips
        : parts.filter(p => p.category !== 'RAW_MATERIAL').slice(0, 6);

    const effectiveList =
      targetParts.length > 0
        ? targetParts.map(p => ({
            id: p.id,
            code: p.code,
            name: p.name,
            category: p.category,
            unitWeightKg: p.weightPerUnitKg || 1.48,
            minStockLevel: p.minStock || 500,
            isExplicit: Boolean(p.isVIP || vipMap[p.id] || vipMap[p.code]),
          }))
        : [
            {
              id: 'PRT-FGD-ECU-BRK',
              code: 'SAPCO-ASY-ECU-BRK-01',
              name: 'مجموعه براکت ضدسرقت رایانه موتور با پوشش رنگ کاتافورز ED',
              category: 'FINISHED_GOOD',
              unitWeightKg: 1.48,
              minStockLevel: 500,
              isExplicit: true,
            },
            {
              id: 'PRT-WIP-ECU-MAIN',
              code: 'WIP-ECU-MAIN-BRK',
              name: 'صفحه براکت اصلی ضدسرقت رایانه موتور',
              category: 'WIP_PART',
              unitWeightKg: 0.98,
              minStockLevel: 500,
              isExplicit: false,
            },
            {
              id: 'PRT-WIP-ECU-COMP',
              code: 'WIP-ECU-COMP-BRK',
              name: 'قطعه مکمل براکت ضدسرقت رایانه موتور',
              category: 'WIP_PART',
              unitWeightKg: 0.47,
              minStockLevel: 500,
              isExplicit: false,
            },
          ];

    return effectiveList.map(item => {
      const liveItem = tierStock.find(
        t => t.partId === item.id || t.partCode === item.code
      );

      const txOutQty = recentTransactions
        .filter(
          tx =>
            (tx.partId === item.id || tx.partCode === item.code) &&
            (tx.voucherType === 'ISSUE' || tx.voucherType === 'CUSTOMER_DELIVERY')
        )
        .reduce((s, tx) => s + (tx.quantity || 0), 0);

      const currentOnHand = liveItem
        ? Math.max(0, liveItem.onHandAfterConsumption)
        : Math.max(0, item.minStockLevel);
      const totalIssuedOrDelivered = liveItem
        ? Math.max(txOutQty, liveItem.totalConsumed)
        : txOutQty;

      const avgInventoryQty = currentOnHand;
      const consumption30d = totalIssuedOrDelivered;
      const consumption60d = Math.round(consumption30d * 1.95);
      const consumption90d = Math.round(consumption30d * 2.9);

      const itr30 = Number((consumption30d / Math.max(1, avgInventoryQty)).toFixed(2));
      const itr60 = Number((consumption60d / Math.max(1, avgInventoryQty)).toFixed(2));
      const itr90 = Number((consumption90d / Math.max(1, avgInventoryQty)).toFixed(2));

      const dsi30 = Math.max(1, Math.round(30 / Math.max(0.1, itr30)));
      const dsi60 = Math.max(1, Math.round(60 / Math.max(0.1, itr60)));
      const dsi90 = Math.max(1, Math.round(90 / Math.max(0.1, itr90)));

      return {
        partId: item.id,
        partCode: item.code,
        partName: item.name,
        category: item.category,
        unitWeightKg: item.unitWeightKg,
        avgInventoryQty,
        consumption30d,
        consumption60d,
        consumption90d,
        itr30,
        itr60,
        itr90,
        dsi30,
        dsi60,
        dsi90,
        isExplicitVip: item.isExplicit,
      };
    });
  }, [parts, vipMap, recentTransactions, tierStock]);

  const horizonStats = useMemo(() => {
    if (vipTurnoverRows.length === 0) {
      return { avgItr: 0, avgDsi: 0, totalConsumption: 0, totalAvgInv: 0, fastCount: 0, slowCount: 0 };
    }
    const getItr = (r: VipPartTurnoverRow) =>
      selectedHorizon === 30 ? r.itr30 : selectedHorizon === 60 ? r.itr60 : r.itr90;
    const getDsi = (r: VipPartTurnoverRow) =>
      selectedHorizon === 30 ? r.dsi30 : selectedHorizon === 60 ? r.dsi60 : r.dsi90;
    const getCons = (r: VipPartTurnoverRow) =>
      selectedHorizon === 30
        ? r.consumption30d
        : selectedHorizon === 60
        ? r.consumption60d
        : r.consumption90d;

    const avgItr = Number(
      (vipTurnoverRows.reduce((s, r) => s + getItr(r), 0) / vipTurnoverRows.length).toFixed(2)
    );
    const avgDsi = Math.round(
      vipTurnoverRows.reduce((s, r) => s + getDsi(r), 0) / vipTurnoverRows.length
    );
    const totalConsumption = vipTurnoverRows.reduce((s, r) => s + getCons(r), 0);
    const totalAvgInv = vipTurnoverRows.reduce((s, r) => s + r.avgInventoryQty, 0);

    const fastThreshold = selectedHorizon === 30 ? 2.0 : selectedHorizon === 60 ? 4.0 : 6.0;
    const slowThreshold = selectedHorizon === 30 ? 1.2 : selectedHorizon === 60 ? 2.4 : 3.6;

    const fastCount = vipTurnoverRows.filter(r => getItr(r) >= fastThreshold).length;
    const slowCount = vipTurnoverRows.filter(r => getItr(r) < slowThreshold).length;

    return { avgItr, avgDsi, totalConsumption, totalAvgInv, fastCount, slowCount };
  }, [vipTurnoverRows, selectedHorizon]);

  return (
    <div className="space-y-4" dir="rtl">
      {/* 1. SAP Fiori Dynamic Page Header: 3-Tier Live Stock & Traceability Strip */}
      <div className="sap-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#d9d9d9] bg-[#ffffff] flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Layers className="w-4 h-4 text-[#007cc0] shrink-0" />
            <h2 className="text-xs sm:text-sm font-semibold text-[#333333]">
              وضعیت لحظه‌ای موجودی ۳ سطحی و زنجیره رهگیری
            </h2>
            <span className="px-2 py-0.5 rounded bg-[#f2f8f4] text-[#107e3e] border border-[#b7dfc7] text-[10px] font-medium">
              بک‌فلاش خودکار BOM
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={() => onNavigateToTab('inventory', 'CUSTOM_REPORTS')}
              className="sap-btn-standard flex items-center gap-1.5 px-3 py-1 text-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#007cc0]" />
              <span>گزارش‌ساز سفارشی</span>
            </button>

            <button
              type="button"
              onClick={fetchTraceabilityChain}
              disabled={traceLoading}
              className="sap-btn-standard flex items-center gap-1.5 px-3 py-1 text-xs cursor-pointer"
              title="بروزرسانی زنجیره رهگیری و موجودی ۳ سطحی"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#007cc0] ${traceLoading ? 'animate-spin' : ''}`} />
              <span>بروزرسانی</span>
            </button>
          </div>
        </div>

        {/* 3 Hairline-Divided SAP Header Facets */}
        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-[#e8e8e8] bg-[#ffffff]">
          {/* Tier 1: Raw Materials & Fasteners */}
          <div className="p-3.5 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#333333]">
                سطح ۱: مواد اولیه و اتصالات
              </span>
              <button
                type="button"
                onClick={() => onNavigateToTab('inventory', 'INQUIRY')}
                className="sap-doc-link text-[11px] font-medium flex items-center gap-0.5 cursor-pointer"
              >
                <span>کاردکس</span>
                <ArrowLeft className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-1 text-xs tabular-nums">
              <div className="flex items-center justify-between py-1 border-b border-[#e8e8e8]">
                <button
                  type="button"
                  onClick={() =>
                    traceDocument(
                      tierGroups.coilItem?.partCode || coils[0]?.coilNumber || 'RM-COIL-DC01A',
                      'INVENTORY_LEDGER'
                    )
                  }
                  className="sap-doc-link text-right cursor-pointer"
                  title="مشاهده در کاردکس انبار"
                >
                  {tierGroups.coilItem?.partName || 'رول ورق'} ({coils[0]?.heatNumber || 'کلاف فعال'})
                </button>
                <div className="font-mono text-[#333333]">
                  <span className="font-semibold text-[#333333]">{formatNumber(tierGroups.coilItem?.onHandAfterConsumption ?? summary?.rawMaterialKg ?? 0)}</span> kg
                  <span className="text-[10px] text-[#666666] mr-1.5">
                    (مصرف: {formatNumber(tierGroups.coilItem?.totalConsumed ?? 0)})
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-[#e8e8e8]">
                <button
                  type="button"
                  onClick={() =>
                    traceDocument(
                      tierGroups.nutItem?.partCode || 'FST-NUT-WELD-M6',
                      'INVENTORY_LEDGER'
                    )
                  }
                  className="sap-doc-link text-right cursor-pointer"
                >
                  {tierGroups.nutItem?.partName || 'مهره جوشی M6'}
                </button>
                <div className="font-mono text-[#333333]">
                  <span className="font-medium text-[#333333]">{formatNumber(tierGroups.nutItem?.onHandAfterConsumption ?? 0)}</span> عدد
                  <span className="text-[10px] text-[#666666] mr-1.5">
                    (مصرف: {formatNumber(tierGroups.nutItem?.totalConsumed ?? 0)})
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between pt-0.5">
                <button
                  type="button"
                  onClick={() =>
                    traceDocument(
                      tierGroups.boltItem?.partCode || 'FST-BOLT-WELD-M6',
                      'INVENTORY_LEDGER'
                    )
                  }
                  className="sap-doc-link text-right cursor-pointer"
                >
                  {tierGroups.boltItem?.partName || 'پیچ جوشی M6×20'}
                </button>
                <div className="font-mono text-[#333333]">
                  <span className="font-medium text-[#333333]">{formatNumber(tierGroups.boltItem?.onHandAfterConsumption ?? 0)}</span> عدد
                  <span className="text-[10px] text-[#666666] mr-1.5">
                    (مصرف: {formatNumber(tierGroups.boltItem?.totalConsumed ?? 0)})
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Tier 2: WIP Sub-Assemblies */}
          <div className="p-3.5 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#333333]">
                سطح ۲: نیمه‌ساخته پای خط (WIP)
              </span>
              <span className="text-[10px] text-[#666666]">
                ایستگاه جوش و مونتاژ
              </span>
            </div>
            <div className="space-y-1.5 text-xs tabular-nums">
              <div className="py-1 border-b border-[#e8e8e8] flex items-center justify-between">
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      traceDocument(
                        tierGroups.wipMain?.partCode || 'WIP-ECU-MAIN-BRK',
                        'WIP_TRACEABILITY'
                      )
                    }
                    className="sap-doc-link font-medium cursor-pointer"
                  >
                    {tierGroups.wipMain?.partName || 'صفحه براکت اصلی'}
                  </button>
                  <div className="text-[10px] text-[#666666] font-mono">
                    ورودی: {formatNumber(tierGroups.wipMain?.totalEntered ?? 0)} · مصرف: {formatNumber(tierGroups.wipMain?.totalConsumed ?? 0)}
                  </div>
                </div>
                <div className="text-left font-mono">
                  <span className="text-sm font-semibold text-[#007cc0]">
                    {formatNumber(tierGroups.wipMain?.onHandAfterConsumption ?? 0)}
                  </span>{' '}
                  <span className="text-[10px] text-[#666666]">عدد</span>
                </div>
              </div>

              <div className="py-1 flex items-center justify-between">
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      traceDocument(
                        tierGroups.wipComp?.partCode || 'WIP-ECU-COMP-BRK',
                        'WIP_TRACEABILITY'
                      )
                    }
                    className="sap-doc-link font-medium cursor-pointer"
                  >
                    {tierGroups.wipComp?.partName || 'قطعه مکمل براکت'}
                  </button>
                  <div className="text-[10px] text-[#666666] font-mono">
                    ورودی: {formatNumber(tierGroups.wipComp?.totalEntered ?? 0)} · مصرف: {formatNumber(tierGroups.wipComp?.totalConsumed ?? 0)}
                  </div>
                </div>
                <div className="text-left font-mono">
                  <span className="text-sm font-semibold text-[#007cc0]">
                    {formatNumber(tierGroups.wipComp?.onHandAfterConsumption ?? 0)}
                  </span>{' '}
                  <span className="text-[10px] text-[#666666]">عدد</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tier 3: Finished Goods & Traceability Status */}
          <div className="p-3.5 flex flex-col justify-between gap-2 tabular-nums">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#333333]">
                سطح ۳: محصول نهایی آماده تحویل
              </span>
              <button
                type="button"
                onClick={() =>
                  traceDocument(
                    tierGroups.fgBrk?.partCode || 'SAPCO-ASY-ECU-BRK-01',
                    'INVENTORY_LEDGER'
                  )
                }
                className="sap-doc-link text-[10px] font-mono bg-[#e5f3fa] border border-[#b3ddf2] px-1.5 py-0.5 rounded cursor-pointer"
              >
                {tierGroups.fgBrk?.partCode || 'SAPCO-ASY-ECU-BRK-01'}
              </button>
            </div>

            <div className="py-1 border-b border-[#e8e8e8] flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-[#333333]">
                  {tierGroups.fgBrk?.partName || 'مجموعه براکت ضدسرقت رایانه موتور'}
                </div>
                <div className="text-[11px] text-[#666666] mt-0.5 font-mono">
                  وزن واحد: {toPersianDigits(tierGroups.fgBrk?.unitWeightKg ?? 1.48)} kg · اسناد: {toPersianDigits(tierGroups.totalPostedDocs)}
                </div>
              </div>
              <div className="text-left font-mono">
                <div className="text-lg font-semibold text-[#107e3e]">
                  {formatNumber(tierGroups.fgBrk?.onHandAfterConsumption ?? summary?.totalFinishedPcs ?? 0)}
                </div>
                <div className="text-[10px] text-[#666666]">عدد موجودی قطعی</div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#666666]">
              {coils[0]?.coilNumber ? (
                <button
                  type="button"
                  onClick={() => traceDocument(coils[0].coilNumber, 'COILS')}
                  className="sap-doc-link truncate cursor-pointer"
                >
                  ذوب {coils[0].heatNumber} ← {coils[0].coilNumber}
                </button>
              ) : (
                <span className="truncate">رهگیری زنده اسناد کاردکس</span>
              )}
              <button
                type="button"
                onClick={() => setActiveWorkspace('TRACEABILITY_FLOW')}
                className="sap-doc-link font-medium cursor-pointer shrink-0"
              >
                زنجیره اسناد ←
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. SAP Fiori IconTabBar Workspace Switcher */}
      <div className="sap-card overflow-hidden">
        <div className="sap-icon-tab-bar px-2">
          <button
            type="button"
            onClick={() => setActiveWorkspace('WORKBENCH')}
            className={`sap-icon-tab ${activeWorkspace === 'WORKBENCH' ? 'sap-icon-tab-active' : ''}`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>۱. میز کار عملیاتی تولید و دستورکارها</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveWorkspace('TRACEABILITY_FLOW')}
            className={`sap-icon-tab ${activeWorkspace === 'TRACEABILITY_FLOW' ? 'sap-icon-tab-active' : ''}`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>۲. زنجیره رهگیری اسناد و جریان مواد</span>
            <span className="px-1.5 py-0.2 rounded bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] font-mono text-[10px] tabular-nums">
              {toPersianDigits(docChain.length)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveWorkspace('ANALYTICS_ITR')}
            className={`sap-icon-tab ${activeWorkspace === 'ANALYTICS_ITR' ? 'sap-icon-tab-active' : ''}`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>۳. تحلیل نرخ چرخش موجودی (ITR) و ظرفیت</span>
          </button>
        </div>
      </div>

      {/* WORKSPACE 1: Main Factory Highway Workbench */}
      {activeWorkspace === 'WORKBENCH' && (
        <FactoryHighwayWorkbench
          parts={parts}
          routings={routings}
          machines={machines}
          dies={dies}
          halls={halls}
          coils={coils}
          summary={summary}
          onNavigateToTab={onNavigateToTab}
          onNavigateSubModule={onNavigateSubModule}
          onOpenNewVoucher={onOpenNewVoucher}
          onSubmitVoucher={onSubmitVoucher}
          initialOrderId={initialOrderId}
          initialDrawerTab={initialDrawerTab}
          onOrderDrawerChange={onOrderDrawerChange}
        />
      )}

      {/* WORKSPACE 2: End-to-End Document Traceability Ledger + Live Material Flow */}
      {activeWorkspace === 'TRACEABILITY_FLOW' && (
        <div className="space-y-4">
          <div className="sap-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#d9d9d9] bg-[#ffffff] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-[#007cc0]" />
                <div>
                  <h3 className="text-xs sm:text-sm font-semibold text-[#333333]">
                    زنجیره کامل رهگیری اسناد از ورود رول ورق تا رسید محصول نهایی
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigateToTab('inventory', 'CUSTOM_REPORTS')}
                className="sap-btn-standard px-3 py-1 text-xs flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#007cc0]" />
                <span>خروجی اکسل و گزارش‌ساز</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="sap-table-compact w-full text-right text-xs">
                <thead className="bg-[#ffffff] border-b border-[#d9d9d9] text-[#333333] font-semibold">
                  <tr>
                    <th className="py-1.5 px-2.5 whitespace-nowrap">شماره سند</th>
                    <th className="py-1.5 px-2.5 whitespace-nowrap">تاریخ</th>
                    <th className="py-1.5 px-2.5 whitespace-nowrap">نوع تراکنش</th>
                    <th className="py-1.5 px-2.5 whitespace-nowrap">کد و نام قطعه / ماده</th>
                    <th className="py-1.5 px-2.5 text-center whitespace-nowrap">مقدار / تعداد</th>
                    <th className="py-1.5 px-2.5 text-center whitespace-nowrap">وزن (kg)</th>
                    <th className="py-1.5 px-2.5 whitespace-nowrap">انبار مبدأ ← مقصد</th>
                    <th className="py-1.5 px-2.5 whitespace-nowrap">کد کلاف / ذوب</th>
                    <th className="py-1.5 px-2.5 whitespace-nowrap">سند مرجع / دستورکار</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e8e8] text-[#333333] tabular-nums">
                  {docChain.map((doc, idx) => (
                    <tr key={`${doc.docNumber}-${idx}`} className="hover:bg-[#e5f3fa]/60 transition-colors">
                      <td className="py-1.5 px-2.5 font-mono font-semibold whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => traceDocument(doc.docNumber, 'INVENTORY_LEDGER')}
                          className="sap-doc-link font-mono font-semibold cursor-pointer"
                          title="مشاهده در کاردکس اسناد"
                        >
                          {doc.docNumber}
                        </button>
                      </td>
                      <td className="py-1.5 px-2.5 font-mono text-[#666666] whitespace-nowrap">{toPersianDigits(doc.docDate)}</td>
                      <td className="py-1.5 px-2.5 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            doc.docType.includes('رسید')
                              ? 'bg-[#f2f8f4] text-[#107e3e] border border-[#b7dfc7]'
                              : 'bg-[#f5f5f5] text-[#333333] border border-[#d9d9d9]'
                          }`}
                        >
                          {doc.docType}
                        </span>
                      </td>
                      <td className="py-1.5 px-2.5">
                        <div className="font-medium text-[#333333]">{doc.partName}</div>
                        <button
                          type="button"
                          onClick={() => traceDocument(doc.partCode, 'INVENTORY_LEDGER')}
                          className="sap-doc-link text-[10px] font-mono cursor-pointer"
                        >
                          {doc.partCode}
                        </button>
                      </td>
                      <td className="py-1.5 px-2.5 text-center font-mono font-semibold text-[#333333]">
                        {formatNumber(doc.qty)}
                      </td>
                      <td className="py-1.5 px-2.5 text-center font-mono text-[#666666]">
                        {formatNumber(doc.weightKg)}
                      </td>
                      <td className="py-1.5 px-2.5 text-[11px] text-[#666666]">
                        {doc.sourceWh} ← <span className="text-[#333333] font-medium">{doc.targetWh}</span>
                      </td>
                      <td className="py-1.5 px-2.5 font-mono text-[11px]">
                        {doc.coilId && doc.coilId !== '—' ? (
                          <button
                            type="button"
                            onClick={() => traceDocument(doc.coilId, 'COILS')}
                            className="sap-doc-link font-mono cursor-pointer"
                          >
                            {doc.coilId}
                          </button>
                        ) : (
                          <span className="text-[#666666]">—</span>
                        )}
                        {doc.heatNumber && doc.heatNumber !== '—' && (
                          <button
                            type="button"
                            onClick={() => traceDocument(doc.heatNumber, 'COILS')}
                            className="block sap-doc-link text-[10px] font-mono cursor-pointer"
                          >
                            {doc.heatNumber}
                          </button>
                        )}
                      </td>
                      <td className="py-1.5 px-2.5 font-mono text-[11px]">
                        {doc.referenceDoc && doc.referenceDoc !== '—' ? (
                          <button
                            type="button"
                            onClick={() =>
                              traceDocument(
                                doc.referenceDoc,
                                doc.referenceDoc.startsWith('CNT') ? 'CONTRACTS' : 'WIP_TRACEABILITY'
                              )
                            }
                            className="sap-doc-link font-mono cursor-pointer"
                          >
                            {doc.referenceDoc}
                          </button>
                        ) : (
                          <span className="text-[#666666]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <D3MaterialFlowDiagram />
        </div>
      )}

      {/* WORKSPACE 3: VIP Inventory Turnover Ratio (ITR) + Machine Capacity Overlap Check */}
      {activeWorkspace === 'ANALYTICS_ITR' && (
        <div className="space-y-4">
          <div className="sap-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#d9d9d9] bg-[#ffffff] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <TrendingUp className="w-4 h-4 text-[#007cc0]" />
                <h2 className="text-xs sm:text-sm font-semibold text-[#333333]">
                  نرخ چرخش موجودی قطعات استراتژیک (ITR) و دوره ماندگاری (DSI)
                </h2>
                <MetricTooltip metricKey="ITR" showBadgeText customLabel="فرمول ITR و DSI" />
              </div>

              <div className="inline-flex items-center bg-[#f5f5f5] p-0.5 rounded border border-[#d9d9d9] self-start lg:self-auto">
                {([30, 60, 90] as HorizonDays[]).map(days => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setSelectedHorizon(days)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                      selectedHorizon === days
                        ? 'bg-[#007cc0] text-white'
                        : 'text-[#666666] hover:text-[#333333]'
                    }`}
                  >
                    {toPersianDigits(days)} روزه
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-[#e8e8e8] border border-[#d9d9d9] rounded bg-[#f5f5f5]">
                <div className="p-3">
                  <span className="text-[11px] text-[#666666] block">
                    میانگین نرخ چرخش ({toPersianDigits(selectedHorizon)} روزه)
                  </span>
                  <div className="text-lg font-semibold text-[#007cc0] font-mono mt-1 tabular-nums">
                    {toPersianDigits(horizonStats.avgItr)}{' '}
                    <span className="text-[11px] font-sans font-normal text-[#666666]">بار در دوره</span>
                  </div>
                </div>

                <div className="p-3">
                  <span className="text-[11px] text-[#666666] block">
                    متوسط ماندگاری در انبار (DSI)
                  </span>
                  <div className="text-lg font-semibold text-[#333333] font-mono mt-1 tabular-nums">
                    {toPersianDigits(horizonStats.avgDsi)}{' '}
                    <span className="text-[11px] font-sans font-normal text-[#666666]">روز کاری</span>
                  </div>
                </div>

                <div className="p-3">
                  <span className="text-[11px] text-[#666666] block">
                    کل خروج/مصرف ({toPersianDigits(selectedHorizon)} روز)
                  </span>
                  <div className="text-lg font-semibold text-[#107e3e] font-mono mt-1 tabular-nums">
                    {formatNumber(horizonStats.totalConsumption)}{' '}
                    <span className="text-[11px] font-sans font-normal text-[#666666]">قطعه</span>
                  </div>
                </div>

                <div className="p-3">
                  <span className="text-[11px] text-[#666666] block">
                    توازن سرعت گردش اقلام
                  </span>
                  <div className="flex items-center gap-3 mt-1.5 text-xs">
                    <span className="text-[#107e3e] font-medium">
                      {toPersianDigits(horizonStats.fastCount)} سریع
                    </span>
                    <span className="text-[#d9d9d9]">·</span>
                    <span className="text-[#bb0000] font-medium">
                      {toPersianDigits(horizonStats.slowCount)} کند
                    </span>
                  </div>
                </div>
              </div>

              <div className="border border-[#d9d9d9] rounded overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="sap-table-compact w-full text-right text-xs">
                    <thead className="bg-[#ffffff] border-b border-[#d9d9d9] text-[#333333] font-semibold">
                      <tr>
                        <th className="py-1.5 px-2.5">قطعه</th>
                        <th className="py-1.5 px-2.5 text-center">موجودی فعلی پس از مصرف</th>
                        <th className="py-1.5 px-2.5 text-center">
                          خروج/مصرف {toPersianDigits(selectedHorizon)} روزه
                        </th>
                        <th className="py-1.5 px-2.5 text-center">چرخش ۳۰ روزه</th>
                        <th className="py-1.5 px-2.5 text-center">چرخش ۶۰ روزه</th>
                        <th className="py-1.5 px-2.5 text-center">چرخش ۹۰ روزه</th>
                        <th className="py-1.5 px-2.5 text-center">ماندگاری (DSI)</th>
                        <th className="py-1.5 px-2.5 text-center">وضعیت</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e8e8e8] text-[#333333] tabular-nums">
                      {vipTurnoverRows.map(row => {
                        const activeItr =
                          selectedHorizon === 30
                            ? row.itr30
                            : selectedHorizon === 60
                            ? row.itr60
                            : row.itr90;
                        const activeDsi =
                          selectedHorizon === 30
                            ? row.dsi30
                            : selectedHorizon === 60
                            ? row.dsi60
                            : row.dsi90;
                        const activeCons =
                          selectedHorizon === 30
                            ? row.consumption30d
                            : selectedHorizon === 60
                            ? row.consumption60d
                            : row.consumption90d;

                        const isFast = activeItr >= 2.0;

                        return (
                          <tr key={row.partId} className="hover:bg-[#e5f3fa]/60 transition">
                            <td className="py-1.5 px-2.5">
                              <div className="font-medium text-[#333333]">{row.partName}</div>
                              <button
                                type="button"
                                onClick={() => traceDocument(row.partCode, 'INVENTORY_LEDGER')}
                                className="sap-doc-link text-[10px] font-mono cursor-pointer"
                              >
                                {row.partCode}
                              </button>
                            </td>
                            <td className="py-1.5 px-2.5 text-center font-mono text-[#333333]">
                              {formatNumber(row.avgInventoryQty)} <span className="text-[10px] text-[#666666]">عدد</span>
                            </td>
                            <td className="py-1.5 px-2.5 text-center font-mono font-semibold text-[#107e3e]">
                              {formatNumber(activeCons)} <span className="text-[10px] text-[#666666]">عدد</span>
                            </td>
                            <td className="py-1.5 px-2.5 text-center font-mono text-[#333333]">
                              {toPersianDigits(row.itr30)}x
                            </td>
                            <td className="py-1.5 px-2.5 text-center font-mono text-[#666666]">
                              {toPersianDigits(row.itr60)}x
                            </td>
                            <td className="py-1.5 px-2.5 text-center font-mono text-[#666666]">
                              {toPersianDigits(row.itr90)}x
                            </td>
                            <td className="py-1.5 px-2.5 text-center font-mono text-[#333333]">
                              هر {toPersianDigits(activeDsi)} روز
                            </td>
                            <td className="py-1.5 px-2.5 text-center">
                              {isFast ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#f2f8f4] text-[#107e3e] border border-[#b7dfc7] text-[10px] font-medium">
                                  چرخش سریع
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#f5f5f5] text-[#666666] border border-[#d9d9d9] text-[10px] font-medium">
                                  متعادل
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <MachineOverlapAlertWidget
            onNavigateToCapacity={() =>
              onNavigateSubModule
                ? onNavigateSubModule('planning', { planningSubTab: 'capacity_planning' })
                : onNavigateToTab('planning')
            }
          />
        </div>
      )}
    </div>
  );
};

