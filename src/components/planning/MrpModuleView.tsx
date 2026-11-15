import React, { useState, useEffect, useCallback } from 'react';
import {
  Calculator,
  ClipboardCheck,
  Download,
  Printer,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileSpreadsheet,
  PackageCheck,
  ShieldAlert,
  Boxes,
  Layers,
  ArrowRight,
  TrendingUp,
  Clock,
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Lock,
  Pin,
  ShoppingCart,
  GitBranch,
  Plus,
  Trash2,
  X,
  Edit3,
} from 'lucide-react';
import {
  MrpRunResult,
  MrpMaterialRow,
  MrpPartRow,
  MoMaterialCheckResult,
} from '../../types/mrp';
import { formatNumber, toPersianDigits } from '../../utils/formatters';
import { ReportModuleSkeleton } from '../common/Skeleton';
import { FormulaTooltip } from '../common/FormulaTooltip';
import { useEnterpriseUx } from '../../context/EnterpriseUxContext';
import { useErpRouter } from '../../context/RouterContext';
import {
  loadQcHoldMap,
  loadVipPartsMap,
  QcHoldRecord,
} from '../../utils/qcHoldStore';

interface TechDocResolution {
  partId: string;
  partCode: string;
  hasBom: boolean;
  hasRouting: boolean;
  materialGrade: string;
  thicknessMm: number;
  unitWeightKg: number;
  scrapAllowancePct: number;
  hardwareComponentName?: string;
  hardwareQtyPerUnit?: number;
  operations: Array<{
    stepCode: string;
    stepName: string;
    machineName: string;
    cycleTimeSec: number;
  }>;
  updatedAt: string;
}

interface IssuedPrRecord {
  prNumber: string;
  materialCode: string;
  materialName: string;
  quantity: number;
  unit: string;
  createdAt: string;
}

interface MrpModuleViewProps {
  onRefreshGlobal?: () => Promise<void>;
}

export const MrpModuleView: React.FC<MrpModuleViewProps> = ({ onRefreshGlobal }) => {
  const { requestConfirm, showUndoToast, recordAudit } = useEnterpriseUx();
  const { traceDocument } = useErpRouter();
  const [activeTab, setActiveTab] = useState<'materials' | 'pre_issue' | 'parts' | 'simulation'>('materials');
  const [rawMrpData, setMrpData] = useState<MrpRunResult | null>(null);
  const [qcHoldMap, setQcHoldMap] = useState<Record<string, QcHoldRecord>>(() => loadQcHoldMap());
  const [vipMap, setVipMap] = useState<Record<string, boolean>>(() => loadVipPartsMap());

  // Persisted Technical Docs Resolutions (BOM & Routing defined inline via MRP Drawer)
  const [techDocsMap, setTechDocsMap] = useState<Record<string, TechDocResolution>>(() => {
    try {
      const saved = localStorage.getItem('kpims_mrp_tech_docs_v1');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Persisted Purchase Requisitions (PR) issued for shortage rows
  const [issuedPrMap, setIssuedPrMap] = useState<Record<string, IssuedPrRecord>>(() => {
    try {
      const saved = localStorage.getItem('kpims_mrp_issued_prs_v1');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Inline Slide-Over Drawer State for defining BOM / Routing directly inside MRP
  const [bomRoutingDrawerPart, setBomRoutingDrawerPart] = useState<MrpPartRow | null>(null);
  const [drawerFocusSection, setDrawerFocusSection] = useState<'BOM' | 'ROUTING'>('BOM');
  const [drawerBomGrade, setDrawerBomGrade] = useState<string>('DC04');
  const [drawerBomThickness, setDrawerBomThickness] = useState<string>('1.2');
  const [drawerBomUnitWeight, setDrawerBomUnitWeight] = useState<string>('1.45');
  const [drawerBomScrapPct, setDrawerBomScrapPct] = useState<string>('12');
  const [drawerBomHardware, setDrawerBomHardware] = useState<string>('مهره جوشی چهارگوش M8 DIN 928');
  const [drawerBomHardwareQty, setDrawerBomHardwareQty] = useState<string>('2');
  const [drawerOps, setDrawerOps] = useState<
    Array<{ stepCode: string; stepName: string; machineName: string; cycleTimeSec: number }>
  >([
    { stepCode: 'OP-10', stepName: 'برش ورق و بلنک‌زنی اولیه', machineName: 'قیچی گیوتین ۶ متری ۱', cycleTimeSec: 6 },
    { stepCode: 'OP-20', stepName: 'کشش عمیق و فرم‌دهی اصلی', machineName: 'پرس هیدرولیک ۴۰۰ تن ۱', cycleTimeSec: 12 },
    { stepCode: 'OP-30', stepName: 'پانچ، دوربری و کالیبره نهایی', machineName: 'پرس ضربه‌ای ۲۵۰ تن ۱', cycleTimeSec: 10 },
  ]);

  // Simulation Parameters
  const [simGrowth, setSimGrowth] = useState<number>(0);
  const [simHorizon, setSimHorizon] = useState<number>(30);
  const [simIncludeWip, setSimIncludeWip] = useState<boolean>(true);
  const [simIncludeConsignment, setSimIncludeConsignment] = useState<boolean>(true);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    const onHold = () => {
      setQcHoldMap(loadQcHoldMap());
    };
    const onVip = () => {
      setVipMap(loadVipPartsMap());
    };
    window.addEventListener('kpims-qc-hold-changed', onHold);
    window.addEventListener('kpims-vip-parts-changed', onVip);
    return () => {
      window.removeEventListener('kpims-qc-hold-changed', onHold);
      window.removeEventListener('kpims-vip-parts-changed', onVip);
    };
  }, []);

  // Dynamically recompute MRP ATP, VIP priority, and Inline BOM/Routing Resolutions
  const mrpData = React.useMemo<MrpRunResult | null>(() => {
    if (!rawMrpData) return null;

    const updatedParts = rawMrpData.parts
      .map(p => {
        const isVIP = Boolean(p.isVIP || vipMap[p.partId] || vipMap[p.partCode]);
        const resolvedDoc = techDocsMap[p.partId] || techDocsMap[p.partCode];
        const partHoldQty = Object.values(qcHoldMap)
          .filter(h => h.isHeld && (h.partId === p.partId || h.partCode === p.partCode))
          .reduce((s, h) => s + (h.heldQty || 0), 0);
        const effectiveFgStock = Math.max(0, p.coveredByFgStock - partHoldQty);
        const netRequirement = Math.max(
          0,
          p.grossDemand - effectiveFgStock - p.coveredByWip - p.coveredByActiveMos
        );
        return {
          ...p,
          isVIP,
          hasBom: Boolean(p.hasBom || resolvedDoc?.hasBom),
          hasRouting: Boolean(p.hasRouting || resolvedDoc?.hasRouting),
          coveredByFgStock: effectiveFgStock,
          netRequirement,
        };
      })
      .sort((a, b) => {
        if (Boolean(a.isVIP) !== Boolean(b.isVIP)) return a.isVIP ? -1 : 1;
        return b.netRequirement - a.netRequirement;
      });

    const updatedMaterials = rawMrpData.materials.map(m => {
      const extraHoldKg = Object.values(qcHoldMap)
        .filter(h => {
          if (!h.isHeld) return false;
          const matchCode = h.partCode === m.materialCode || (h.lotNumber && m.matchingCoils?.some(c => c.coilNumber === h.lotNumber || c.coilId === h.key));
          const matchName = h.partName && m.materialGrade && h.partName.toLowerCase().includes(m.materialGrade.toLowerCase());
          return Boolean(matchCode || matchName);
        })
        .reduce((s, h) => s + (m.unitCode === 'KG' ? (h.heldWeightKg || h.heldQty || 0) : (h.heldQty || h.heldWeightKg || 0)), 0);

      const effectiveQuarantined = Math.max(m.onHandQuarantined || 0, extraHoldKg);
      const totalPhysical = (m.onHandOwned || 0) + (simIncludeConsignment ? m.onHandConsignment || 0 : 0);
      // Direct subtraction of QC Hold (onHandQuarantined) from Free Available (ATP):
      const netAvailable = Math.max(0, totalPhysical - (m.reservedActive || 0) - effectiveQuarantined);
      const targetRequired = m.unitCode === 'KG' ? m.requiredWeightKg : m.requiredQuantity;
      const shortageQuantity = Math.max(0, Math.round((targetRequired - netAvailable) * 10) / 10);
      const coveredByContract = Math.min(shortageQuantity, m.openContractQuantity || 0);
      const hardShortageQuantity = Math.max(0, Math.round((shortageQuantity - coveredByContract) * 10) / 10);

      let severity: MrpMaterialRow['severity'] = 'OK';
      if (shortageQuantity > 0) {
        severity = hardShortageQuantity === 0 ? 'SHORTAGE_COVERED_BY_CONTRACT' : 'HARD_SHORTAGE';
      }

      return {
        ...m,
        onHandQuarantined: effectiveQuarantined,
        netAvailable,
        shortageQuantity,
        coveredByContract,
        hardShortageQuantity,
        severity,
      };
    });

    updatedMaterials.sort((a, b) => {
      const aVip = a.demandedByParts.some(dp => vipMap[dp.partId] || vipMap[dp.partCode]);
      const bVip = b.demandedByParts.some(dp => vipMap[dp.partId] || vipMap[dp.partCode]);
      if (aVip && a.severity !== 'OK' && !(bVip && b.severity !== 'OK')) return -1;
      if (bVip && b.severity !== 'OK' && !(aVip && a.severity !== 'OK')) return 1;
      const sevScore = { HARD_SHORTAGE: 3, SHORTAGE_COVERED_BY_CONTRACT: 2, OK: 1 };
      return sevScore[b.severity] - sevScore[a.severity] || b.shortageQuantity - a.shortageQuantity;
    });

    return {
      ...rawMrpData,
      parts: updatedParts,
      materials: updatedMaterials,
      summary: {
        ...rawMrpData.summary,
        ok: updatedMaterials.filter(m => m.severity === 'OK').length,
        contractCovered: updatedMaterials.filter(m => m.severity === 'SHORTAGE_COVERED_BY_CONTRACT').length,
        hardShortages: updatedMaterials.filter(m => m.severity === 'HARD_SHORTAGE').length,
        totalShortageWeightKg: updatedMaterials.reduce((s, m) => s + m.hardShortageQuantity, 0),
      },
    };
  }, [rawMrpData, qcHoldMap, vipMap, simIncludeConsignment, techDocsMap]);

  // Open Inline Slide-Over Drawer for defining missing BOM or Routing without leaving MRP
  const handleOpenBomRoutingDrawer = (part: MrpPartRow, section: 'BOM' | 'ROUTING') => {
    const existing = techDocsMap[part.partId] || techDocsMap[part.partCode];
    setBomRoutingDrawerPart(part);
    setDrawerFocusSection(section);
    setDrawerBomGrade(existing?.materialGrade || (part.partName.includes('گالوانیزه') ? 'DX51D' : 'DC04'));
    setDrawerBomThickness(String(existing?.thicknessMm || 1.2));
    setDrawerBomUnitWeight(String(existing?.unitWeightKg || 1.45));
    setDrawerBomScrapPct(String(existing?.scrapAllowancePct || 12));
    setDrawerBomHardware(existing?.hardwareComponentName || 'مهره جوشی چهارگوش M8 DIN 928');
    setDrawerBomHardwareQty(String(existing?.hardwareQtyPerUnit ?? 2));
    if (existing?.operations && existing.operations.length > 0) {
      setDrawerOps(existing.operations);
    } else {
      setDrawerOps([
        { stepCode: 'OP-10', stepName: 'برش ورق و بلنک‌زنی اولیه', machineName: 'قیچی گیوتین ۶ متری ۱', cycleTimeSec: 6 },
        { stepCode: 'OP-20', stepName: `کشش و فرم‌دهی ${part.partName}`, machineName: 'پرس هیدرولیک ۴۰۰ تن ۱', cycleTimeSec: 12 },
        { stepCode: 'OP-30', stepName: 'پانچ، خم نهایی و کنترل کیفیت', machineName: 'پرس ضربه‌ای ۲۵۰ تن ۱', cycleTimeSec: 10 },
      ]);
    }
  };

  const handleSaveBomRoutingFromDrawer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bomRoutingDrawerPart) return;
    const prevDocs = { ...techDocsMap };
    const resolution: TechDocResolution = {
      partId: bomRoutingDrawerPart.partId,
      partCode: bomRoutingDrawerPart.partCode,
      hasBom: true,
      hasRouting: drawerOps.length > 0,
      materialGrade: drawerBomGrade,
      thicknessMm: Math.max(0.4, parseFloat(drawerBomThickness) || 1.2),
      unitWeightKg: Math.max(0.05, parseFloat(drawerBomUnitWeight) || 1.2),
      scrapAllowancePct: Math.max(0, parseFloat(drawerBomScrapPct) || 10),
      hardwareComponentName: drawerBomHardware,
      hardwareQtyPerUnit: Math.max(0, parseInt(drawerBomHardwareQty, 10) || 0),
      operations: drawerOps,
      updatedAt: new Date().toLocaleString('fa-IR'),
    };

    const nextDocs = {
      ...techDocsMap,
      [bomRoutingDrawerPart.partId]: resolution,
      [bomRoutingDrawerPart.partCode]: resolution,
    };
    setTechDocsMap(nextDocs);
    try {
      localStorage.setItem('kpims_mrp_tech_docs_v1', JSON.stringify(nextDocs));
    } catch {
      // ignore
    }

    // Persist Part, Routing AND Advanced BOM to backend APIs so server MRP/Backflush stay synced
    try {
      const rawMaterialCode = `RM-SHEET-${resolution.materialGrade}-${resolution.thicknessMm}`;
      const grossWeight = Number(
        (resolution.unitWeightKg * (1 + resolution.scrapAllowancePct / 100)).toFixed(3)
      );
      const bomComponents: Array<Record<string, unknown>> = [
        {
          id: `BOM-CMP-${resolution.partCode}-RAW`,
          componentPartId: rawMaterialCode,
          componentPartCode: rawMaterialCode,
          componentPartName: `ورق خام گرید ${resolution.materialGrade} ضخامت ${resolution.thicknessMm}mm`,
          componentType: 'RAW_SHEET',
          quantityPerAssembly: 1,
          unit: 'PCS',
          grossWeightKg: grossWeight,
          netWeightKg: resolution.unitWeightKg,
          scrapAllowancePercent: resolution.scrapAllowancePct,
          joiningProcess: 'STAMPING',
          subMoRequired: false,
          stageJoinedStepNumber: 10,
          supplierSource: 'COMPANY_PURCHASED',
        },
      ];

      if (resolution.hardwareComponentName && (resolution.hardwareQtyPerUnit || 0) > 0) {
        bomComponents.push({
          id: `BOM-CMP-${resolution.partCode}-HW`,
          componentPartId: `HW-${resolution.partCode}`,
          componentPartCode: `HW-${resolution.partCode}`,
          componentPartName: resolution.hardwareComponentName,
          componentType: 'FASTENER_HARDWARE',
          quantityPerAssembly: resolution.hardwareQtyPerUnit,
          unit: 'PCS',
          grossWeightKg: Number(((resolution.hardwareQtyPerUnit || 1) * 0.008).toFixed(3)),
          netWeightKg: Number(((resolution.hardwareQtyPerUnit || 1) * 0.008).toFixed(3)),
          scrapAllowancePercent: 0,
          joiningProcess: 'SPOT_WELD',
          subMoRequired: false,
          stageJoinedStepNumber: 30,
          supplierSource: 'COMPANY_PURCHASED',
        });
      }

      await Promise.all([
        fetch('/api/parts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: bomRoutingDrawerPart.partId,
            code: bomRoutingDrawerPart.partCode,
            name: bomRoutingDrawerPart.partName,
            category: 'FINISHED_GOOD',
            unit: 'PCS',
            materialGrade: resolution.materialGrade,
            thicknessMm: resolution.thicknessMm,
            weightPerUnitKg: resolution.unitWeightKg,
          }),
        }).catch(() => {}),
        fetch('/api/routings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            partId: bomRoutingDrawerPart.partId,
            partCode: bomRoutingDrawerPart.partCode,
            partName: bomRoutingDrawerPart.partName,
            operations: resolution.operations.map((op, i) => ({
              stepNumber: (i + 1) * 10,
              stepCode: op.stepCode,
              stepName: op.stepName,
              processType: i === 0 ? 'SHEARING' : 'STAMPING',
              machineName: op.machineName,
              standardCycleTimeSec: op.cycleTimeSec,
            })),
          }),
        }).catch(() => {}),
        fetch('/api/production/boms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: `BOM-${bomRoutingDrawerPart.partCode}`,
            assemblyPartId: bomRoutingDrawerPart.partId,
            assemblyPartCode: bomRoutingDrawerPart.partCode,
            assemblyPartName: bomRoutingDrawerPart.partName,
            version: 'V1.0',
            isActive: true,
            components: bomComponents,
          }),
        }).catch(() => {}),
      ]);
      await loadMrp();
      if (onRefreshGlobal) await onRefreshGlobal();
    } catch {
      // local state updated
    }

    const savedPartName = bomRoutingDrawerPart.partName;
    const savedPartCode = bomRoutingDrawerPart.partCode;
    setBomRoutingDrawerPart(null);

    recordAudit({
      actionType: 'UPDATE',
      module: 'ماژول برنامه‌ریزی و MRP (رفع بن‌بست فنی)',
      entityId: resolution.partId,
      entityCode: savedPartCode,
      summaryFa: `تعریف و تایید درجا (Inline) درخت محصول (BOM: ورق ${resolution.materialGrade} ضخامت ${resolution.thicknessMm}mm) و مسیر تولید (${resolution.operations.length} ایستگاه OP) برای «${savedPartName}»`,
    });

    showUndoToast({
      title: `BOM و مسیر تولید «${savedPartName}» ثبت و تأیید شد`,
      description: 'وضعیت مستندات فنی در جدول تقاضای قطعات بدون خروج از MRP به «تأییدشده» تغییر یافت.',
      variant: 'success',
      onUndo: () => {
        setTechDocsMap(prevDocs);
        try {
          localStorage.setItem('kpims_mrp_tech_docs_v1', JSON.stringify(prevDocs));
        } catch {
          // ignore
        }
      },
    });
  };

  // Issue Purchase Requisition (PR) for a material row with shortage (🛒 صدور درخواست خرید)
  const handleIssuePurchaseRequisition = (
    materialCode: string,
    materialName: string,
    shortageQty: number,
    unit: string = 'kg',
    grade?: string
  ) => {
    const reqQty = Math.max(100, Math.ceil(shortageQty));
    requestConfirm({
      title: `صدور درخواست خرید رسمی (PR) — «${materialName}»`,
      description: `آیا از صدور درخواست خرید (Purchase Requisition) به مقدار ${formatNumber(reqQty)} ${unit} برای جبران کسری موجودی «${materialName}» اطمینان دارید؟`,
      consequences: [
        `ثبت سند رسمی درخواست خرید (PR) به مقدار ${formatNumber(reqQty)} ${unit} و ارسال به واحد بازرگانی / تامین ساپکو`,
        `رزرو سفارش خرید در موازنه نیازمندی‌های مواد (MRP) برای جلوگیری از توقف خط پرس`,
        'ثبت رویداد در لاگ ممیزی (Audit Trail) با قابلیت لغو فوری (Undo)',
      ],
      confirmLabel: 'تأیید و صدور درخواست خرید (PR)',
      variant: 'indigo',
      onConfirm: async () => {
        const prevPrs = { ...issuedPrMap };
        const proposedPrNumber = `PR-1404-${Math.floor(1000 + Math.random() * 8999)}`;
        try {
          const res = await fetch('/api/mrp/purchase-requisitions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prNumber: proposedPrNumber,
              materialCode,
              materialName,
              materialGrade: grade,
              quantity: reqQty,
              unit,
            }),
          });
          const json = await res.json();
          if (!res.ok || !json.success) {
            setError(json.error || 'خطا در صدور درخواست خرید (PR)');
            return;
          }
          const saved = json.data;
          const finalPrNumber = saved?.prNumber || proposedPrNumber;
          const newPr: IssuedPrRecord = {
            prNumber: finalPrNumber,
            materialCode,
            materialName,
            quantity: saved?.quantity || reqQty,
            unit: saved?.unit || unit,
            createdAt: saved?.createdAtFa || new Date().toLocaleString('fa-IR'),
          };
          const nextPrs = { ...issuedPrMap, [materialCode]: newPr };
          setIssuedPrMap(nextPrs);
          try {
            localStorage.setItem('kpims_mrp_issued_prs_v1', JSON.stringify(nextPrs));
          } catch {
            // ignore
          }

          recordAudit({
            actionType: 'CREATE',
            module: 'ماژول برنامه‌ریزی و MRP (تدارکات و خرید)',
            entityId: finalPrNumber,
            entityCode: materialCode,
            summaryFa: `صدور درخواست خرید (${finalPrNumber}) برای «${materialName}» (${grade || materialCode}) به مقدار ${formatNumber(reqQty)} ${unit}`,
          });

          setNotice(
            `درخواست خرید شماره ${finalPrNumber} برای «${materialName}» به مقدار ${formatNumber(reqQty)} ${unit} با موفقیت در سرور ثبت و به واحد تدارکات/ساپکو ارسال شد.`
          );

          showUndoToast({
            title: `🛒 درخواست خرید ${finalPrNumber} صادر شد`,
            description: `مقدار ${formatNumber(reqQty)} ${unit} «${materialName}» در صف تامین بازرگانی ثبت گردید.`,
            variant: 'success',
            onUndo: async () => {
              await fetch(`/api/mrp/purchase-requisitions/${encodeURIComponent(finalPrNumber)}`, {
                method: 'DELETE',
              }).catch(() => {});
              setIssuedPrMap(prevPrs);
              try {
                localStorage.setItem('kpims_mrp_issued_prs_v1', JSON.stringify(prevPrs));
              } catch {
                // ignore
              }
            },
          });
        } catch (err: any) {
          setError(err?.message || 'خطا در ارتباط با سرور برای صدور درخواست خرید');
        }
      },
    });
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filters for materials table
  const [materialSearch, setMaterialSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'HARD_SHORTAGE' | 'SHORTAGE_COVERED_BY_CONTRACT' | 'OK'>('ALL');
  const [gradeFilter, setGradeFilter] = useState<string>('ALL');

  // Pre-Issue Check State
  const [moList, setMoList] = useState<{ id: string; moNumber: string; partCode: string; partName: string; targetQuantity: number; status: string }[]>([]);
  const [selectedMoId, setSelectedMoId] = useState<string>('');
  const [moCheckResult, setMoCheckResult] = useState<MoMaterialCheckResult | null>(null);
  const [checkingMo, setCheckingMo] = useState(false);
  const [reservingMo, setReservingMo] = useState(false);

  // Detail Modal / Popover for parts demanded
  const [expandedMaterialCode, setExpandedMaterialCode] = useState<string | null>(null);

  const loadMrp = useCallback(async (params?: { growth?: number; horizon?: number; includeWip?: boolean; includeConsignment?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (params?.growth !== undefined) q.append('growth', String(params.growth));
      if (params?.horizon !== undefined) q.append('horizonDays', String(params.horizon));
      if (params?.includeWip !== undefined) q.append('includeWip', String(params.includeWip));
      if (params?.includeConsignment !== undefined) q.append('includeConsignment', String(params.includeConsignment));

      const res = await fetch(`/api/mrp/run?${q.toString()}`);
      const json = await res.json();
      if (json.success && json.data) {
        setMrpData(json.data);
      } else {
        setError(json.error || 'خطا در بارگذاری محاسبات MRP');
      }
    } catch (err: any) {
      setError(err.message || 'خطا در ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMoList = useCallback(async () => {
    try {
      const res = await fetch('/api/mrp/mos');
      const json = await res.json();
      if (json.success && json.data) {
        setMoList(json.data);
        if (json.data.length > 0 && !selectedMoId) {
          setSelectedMoId(json.data[0].id);
        }
      }
    } catch {
      // ignore
    }
  }, [selectedMoId]);

  const loadPurchaseRequisitions = useCallback(async () => {
    try {
      const res = await fetch('/api/mrp/purchase-requisitions');
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const serverMap: Record<string, IssuedPrRecord> = {};
        for (const r of json.data) {
          if (r.status !== 'CANCELLED') {
            serverMap[r.materialCode] = {
              prNumber: r.prNumber,
              materialCode: r.materialCode,
              materialName: r.materialName,
              quantity: r.quantity,
              unit: r.unit,
              createdAt: r.createdAtFa || r.createdAt,
            };
          }
        }
        setIssuedPrMap(prev => ({ ...prev, ...serverMap }));
      }
    } catch {
      // keep local fallback
    }
  }, []);

  useEffect(() => {
    loadMrp();
    loadMoList();
    loadPurchaseRequisitions();
  }, [loadMrp, loadMoList, loadPurchaseRequisitions]);

  // Run Pre-issue check when selected MO changes
  const runMoCheck = async (moIdToTest?: string) => {
    const targetId = moIdToTest || selectedMoId;
    if (!targetId) return;
    setCheckingMo(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/mrp/mos/${encodeURIComponent(targetId)}/check`);
      const json = await res.json();
      if (json.success && json.data) {
        setMoCheckResult(json.data);
      } else {
        setError(json.error || 'خطا در بررسی مواد دستور کار');
      }
    } catch (err: any) {
      setError(err.message || 'خطا در بررسی مواد');
    } finally {
      setCheckingMo(false);
    }
  };

  useEffect(() => {
    if (selectedMoId && activeTab === 'pre_issue') {
      runMoCheck(selectedMoId);
    }
  }, [selectedMoId, activeTab]);

  const handleAutoReserve = async () => {
    if (!selectedMoId) return;
    setReservingMo(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/mrp/mos/${encodeURIComponent(selectedMoId)}/reserve`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.success) {
        const count = json.data?.reserved?.length || 0;
        setNotice(`موجودی آزاد با موفقیت برای دستور کار ${json.data?.moNumber} رزرو شد (${toPersianDigits(count)} ردیف رزرو جدید).`);
        await runMoCheck(selectedMoId);
        await loadMrp();
        if (onRefreshGlobal) await onRefreshGlobal();
      } else {
        setError(json.error || 'خطا در رزرو خودکار مواد');
      }
    } catch (err: any) {
      setError(err.message || 'خطا در انجام عملیات رزرو');
    } finally {
      setReservingMo(false);
    }
  };

  const handleRunSimulation = async () => {
    setSimulating(true);
    setError(null);
    try {
      await loadMrp({
        growth: simGrowth,
        horizon: simHorizon,
        includeWip: simIncludeWip,
        includeConsignment: simIncludeConsignment,
      });
      setActiveTab('materials');
    } finally {
      setSimulating(false);
    }
  };

  const handleExportCsv = () => {
    if (!mrpData) return;
    const headers = [
      'کد ماده اولیه',
      'عنوان ماده',
      'گرید',
      'ضخامت (mm)',
      'واحد',
      'نیاز کل ناخالص',
      'نیاز وزنی (kg)',
      'موجودی ملکی',
      'موجودی امانی ساپکو',
      'قرنطینه کیفی',
      'رزرو فعال',
      'موجودی خالص آزاد (ATP)',
      'قرارداد باز ساپکو',
      'کسری کل',
      'پوشش با قرارداد',
      'کسری قطعی',
      'وضعیت نهایی',
    ];

    const rows = mrpData.materials.map(m => [
      m.materialCode,
      `"${m.materialName.replace(/"/g, '""')}"`,
      m.materialGrade,
      m.thicknessMm,
      m.unitCode,
      m.requiredQuantity,
      m.requiredWeightKg,
      m.onHandOwned,
      m.onHandConsignment,
      m.onHandQuarantined,
      m.reservedActive,
      m.netAvailable,
      m.openContractQuantity,
      m.shortageQuantity,
      m.coveredByContract,
      m.hardShortageQuantity,
      m.severity === 'OK' ? 'پوشش کامل' : m.severity === 'SHORTAGE_COVERED_BY_CONTRACT' ? 'پوشش با قرارداد' : 'کسری قطعی',
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MRP_Material_Forecast_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered materials
  const filteredMaterials = (mrpData?.materials || []).filter(m => {
    if (severityFilter !== 'ALL' && m.severity !== severityFilter) return false;
    if (gradeFilter !== 'ALL' && !m.materialGrade.toLowerCase().includes(gradeFilter.toLowerCase())) return false;
    if (materialSearch.trim()) {
      const q = materialSearch.toLowerCase();
      const matchCode = m.materialCode.toLowerCase().includes(q);
      const matchName = m.materialName.toLowerCase().includes(q);
      const matchGrade = m.materialGrade.toLowerCase().includes(q);
      if (!matchCode && !matchName && !matchGrade) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4 print:space-y-3">
      {/* SAP HANA Fiori Header & IconTabBar */}
      <div className="sap-card overflow-hidden no-print">
        <div className="px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#d9d9d9]">
          <div className="flex items-start gap-2.5">
            <span className="p-2 rounded bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] shrink-0">
              <Calculator className="w-4 h-4" />
            </span>
            <div>
              <h1 className="text-sm font-semibold text-[#333333] flex items-center gap-2 flex-wrap">
                پیش‌بینی نیازمندی مواد و موازنه کلاف (MRP)
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2]">
                  ATP & BOM Explosion
                </span>
              </h1>
              <p className="text-xs text-[#666666] mt-0.5">
                انفجار درخت محصول (BOM)، کسر موجودی آزاد ملکی و امانی ساپکو، حذف قرنطینه و پیش‌بینی پوشش قراردادها
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {mrpData && (
              <div className="text-[11px] text-[#666666] font-mono hidden lg:flex items-center gap-1.5 bg-[#f5f5f5] px-2.5 py-1 rounded border border-[#d9d9d9]">
                <Clock className="w-3.5 h-3.5 text-[#007cc0]" />
                <span>آخرین محاسبه:</span>
                <span className="text-[#333333] font-semibold">{mrpData.ranAtFa}</span>
              </div>
            )}

            <button
              onClick={() => loadMrp()}
              disabled={loading}
              className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#007cc0]' : ''}`} />
              <span>محاسبه مجدد</span>
            </button>

            <button
              onClick={handleExportCsv}
              disabled={!mrpData}
              className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-[#107e3e]" />
              <span>خروجی اکسل</span>
            </button>

            <button
              onClick={() => window.print()}
              className="sap-btn-emphasized flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>چاپ رسمی</span>
            </button>
          </div>
        </div>

        <div className="sap-icon-tab-bar px-2 border-b-0">
          {[
            { id: 'materials', label: `۱. موازنه کلاف‌ها و مواد اولیه (${toPersianDigits(mrpData?.materials.length || 0)})` },
            { id: 'pre_issue', label: '۲. کنترل پیش از حواله دستور کار (Pre-Issue ATP)' },
            { id: 'parts', label: `۳. موازنه تقاضای قطعات (${toPersianDigits(mrpData?.parts.length || 0)})` },
            { id: 'simulation', label: '۴. شبیه‌ساز What-If' },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as any)}
              className={`sap-icon-tab ${activeTab === t.id ? 'sap-icon-tab-active' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error & Notice Banners */}
      {error && (
        <div className="p-3 rounded bg-[#ffecec] border border-[#f5b7b1] text-[#bb0000] text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-[#bb0000]" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-[#bb0000] hover:underline text-xs cursor-pointer">بستن</button>
        </div>
      )}

      {notice && (
        <div className="p-3 rounded bg-[#ebf5ec] border border-[#b7dfbf] text-[#107e3e] text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-[#107e3e]" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-[#107e3e] hover:underline text-xs cursor-pointer">بستن</button>
        </div>
      )}

      {/* Skeleton Loading State */}
      {loading && !mrpData && (
        <ReportModuleSkeleton kpiCount={6} showChart={false} tableRows={6} tableColumns={9} theme="light" />
      )}

      {/* KPI Cards Summary */}
      {mrpData && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <div className="sap-card p-3 text-right">
            <span className="text-[11px] text-[#666666] font-semibold block">تعداد مواد و کلاف‌ها</span>
            <div className="text-lg font-bold text-[#333333] font-mono mt-0.5 tabular-nums">
              {toPersianDigits(mrpData.summary.materialsConsidered)}
            </div>
            <span className="text-[10px] text-[#666666] mt-0.5 block">اقلام فعال در BOM</span>
          </div>

          <div className="sap-card p-3 text-right border-r-2 border-r-[#107e3e]">
            <span className="text-[11px] text-[#107e3e] font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              پوشش کامل با موجودی
            </span>
            <div className="text-lg font-bold text-[#107e3e] font-mono mt-0.5 tabular-nums">
              {toPersianDigits(mrpData.summary.ok)}
            </div>
            <span className="text-[10px] text-[#666666] mt-0.5 block">تأمین تضمین‌شده</span>
          </div>

          <div className="sap-card p-3 text-right border-r-2 border-r-[#e9730c]">
            <span className="text-[11px] text-[#e9730c] font-semibold flex items-center gap-1">
              <Info className="w-3.5 h-3.5" />
              پوشش با قرارداد باز
            </span>
            <div className="text-lg font-bold text-[#e9730c] font-mono mt-0.5 tabular-nums">
              {toPersianDigits(mrpData.summary.contractCovered)}
            </div>
            <span className="text-[10px] text-[#666666] mt-0.5 block">در انتظار تحویل سهمیه</span>
          </div>

          <div className="sap-card p-3 text-right border-r-2 border-r-[#bb0000]">
            <span className="text-[11px] text-[#bb0000] font-semibold flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              کسری قطعی مواد
            </span>
            <div className="text-lg font-bold text-[#bb0000] font-mono mt-0.5 tabular-nums">
              {toPersianDigits(mrpData.summary.hardShortages)}
            </div>
            <span className="text-[10px] text-[#bb0000] mt-0.5 block font-semibold">هشدار توقف پرس</span>
          </div>

          <div className="sap-card p-3 text-right">
            <span className="text-[11px] text-[#666666] font-semibold block">کل وزن ناخالص مواد</span>
            <div className="text-base font-bold text-[#333333] font-mono mt-0.5 tabular-nums">
              {formatNumber(mrpData.summary.totalGrossWeightKg)} <span className="text-xs font-normal text-[#666666]">kg</span>
            </div>
            <span className="text-[10px] text-[#666666] mt-0.5 block">شامل نرم ضایعات</span>
          </div>

          <div className="sap-card p-3 text-right border-r-2 border-r-[#bb0000]">
            <span className="text-[11px] text-[#bb0000] font-semibold block">کسری وزنی کل کلاف‌ها</span>
            <div className="text-base font-bold text-[#bb0000] font-mono mt-0.5 tabular-nums">
              {formatNumber(mrpData.summary.totalShortageWeightKg)} <span className="text-xs font-normal text-[#bb0000]">kg</span>
            </div>
            <span className="text-[10px] text-[#666666] mt-0.5 block">نیاز به خرید / حواله</span>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 1: MATERIALS NETTING MATRIX
          ========================================================================= */}
      {activeTab === 'materials' && (
        <div className="space-y-3">
          {/* Filters Bar */}
          <div className="sap-card p-3 flex flex-col sm:flex-row items-center justify-between gap-2.5 no-print">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 text-[#666666] absolute right-2.5 top-2" />
                <input
                  type="text"
                  placeholder="جستجو در کد، نام کلاف یا گرید..."
                  value={materialSearch}
                  onChange={e => setMaterialSearch(e.target.value)}
                  className="w-full bg-[#f5f5f5] border border-[#bfbfbf] rounded pr-8 pl-3 py-1 text-xs text-[#333333] placeholder-[#888888] focus:bg-[#ffffff] focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <select
                value={gradeFilter}
                onChange={e => setGradeFilter(e.target.value)}
                className="bg-[#ffffff] border border-[#bfbfbf] rounded px-2.5 py-1 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
              >
                <option value="ALL">همه گریدها</option>
                <option value="DC04">DC04 (کشش عمیق)</option>
                <option value="ST14">ST14 (روغنی فرم‌دهی)</option>
                <option value="DX51">DX51D (گالوانیزه)</option>
                <option value="ST37">ST37 (شیت سیاه)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <span className="text-[11px] text-[#666666] ml-1">فیلتر وضعیت:</span>
              <button
                onClick={() => setSeverityFilter('ALL')}
                className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition ${
                  severityFilter === 'ALL'
                    ? 'bg-[#007cc0] text-[#ffffff]'
                    : 'bg-[#ffffff] text-[#333333] hover:bg-[#e5f3fa] border border-[#d9d9d9]'
                }`}
              >
                همه ({toPersianDigits(mrpData?.materials.length || 0)})
              </button>

              <button
                onClick={() => setSeverityFilter('HARD_SHORTAGE')}
                className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition flex items-center gap-1 ${
                  severityFilter === 'HARD_SHORTAGE'
                    ? 'bg-[#bb0000] text-[#ffffff]'
                    : 'bg-[#ffffff] text-[#bb0000] hover:bg-[#ffecec] border border-[#f5b7b1]'
                }`}
              >
                <ShieldAlert className="w-3 h-3" />
                کسری قطعی ({toPersianDigits(mrpData?.summary.hardShortages || 0)})
              </button>

              <button
                onClick={() => setSeverityFilter('SHORTAGE_COVERED_BY_CONTRACT')}
                className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition flex items-center gap-1 ${
                  severityFilter === 'SHORTAGE_COVERED_BY_CONTRACT'
                    ? 'bg-[#e9730c] text-[#ffffff]'
                    : 'bg-[#ffffff] text-[#e9730c] hover:bg-[#fff4e5] border border-[#f5cba7]'
                }`}
              >
                <Info className="w-3 h-3" />
                پوشش با قرارداد ({toPersianDigits(mrpData?.summary.contractCovered || 0)})
              </button>

              <button
                onClick={() => setSeverityFilter('OK')}
                className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition flex items-center gap-1 ${
                  severityFilter === 'OK'
                    ? 'bg-[#107e3e] text-[#ffffff]'
                    : 'bg-[#ffffff] text-[#107e3e] hover:bg-[#ebf5ec] border border-[#b7dfbf]'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                کافی ({toPersianDigits(mrpData?.summary.ok || 0)})
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="sap-card overflow-hidden printable-area">
            {/* Print Header shown only during print */}
            <div className="hidden print:block p-4 border-b border-[#d9d9d9] text-center">
              <span className="text-xs text-[#666666] block">شرکت تولیدی قطعات خودرو (زنجیره تامین ساپکو)</span>
              <h2 className="text-base font-bold text-[#333333] mt-1">گزارش رسمی پیش‌بینی نیازمندی مواد و موازنه کلاف (MRP)</h2>
              <span className="text-[10px] text-[#666666] font-mono">تاریخ موازنه: {mrpData?.ranAtFa || 'امروز'}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="sap-table-compact w-full text-right">
                <thead>
                  <tr>
                    <th className="py-1.5 px-2.5">کد و عنوان ماده اولیه</th>
                    <th className="py-1.5 px-2.5 text-center">گرید و ضخامت</th>
                    <th className="py-1.5 px-2.5 text-center text-[#007cc0]">
                      <span className="inline-flex items-center">
                        <span>نیاز کل (kg)</span>
                        <FormulaTooltip
                          title="فرمول نیاز ناخالص ماده اولیه (BOM Explosion)"
                          formula="GrossKg = Σ (NetPartDemand × UnitWeight × (1 + ScrapPct))"
                          description="حاصل‌ضرب نیاز خالص تولید هر قطعه در وزن استاندارد واحد به علاوه ضریب پرت و ضایعات مصوب."
                          badgeColor="indigo"
                        />
                      </span>
                    </th>
                    <th className="py-1.5 px-2.5 text-center">موجودی ملکی</th>
                    <th className="py-1.5 px-2.5 text-center text-[#107e3e]">امانی ساپکو</th>
                    <th className="py-1.5 px-2.5 text-center text-[#bb0000]">قرنطینه (QC Hold)</th>
                    <th className="py-1.5 px-2.5 text-center text-[#e9730c]">رزرو فعال</th>
                    <th className="py-1.5 px-2.5 text-center text-[#107e3e]">
                      <span className="inline-flex items-center">
                        <span>موجودی آزاد (ATP)</span>
                        <FormulaTooltip
                          title="فرمول موجودی آزاد قابل برنامه‌ریزی (ATP)"
                          formula="ATP = (Owned + Consignment) - Reserved - QCHold"
                          description="هر کالا یا رول ورقی که در قرنطینه کیفی (QC Hold) قرار گیرد، مستقیماً از موجودی آزاد (ATP) کسر شده و در تولید لحاظ نمی‌گردد."
                          badgeColor="emerald"
                        />
                      </span>
                    </th>
                    <th className="py-1.5 px-2.5 text-center text-[#007cc0]">قرارداد باز</th>
                    <th className="py-1.5 px-2.5 text-center text-[#bb0000]">
                      <span className="inline-flex items-center">
                        <span>کسری قطعی</span>
                        <FormulaTooltip
                          title="فرمول کسری قطعی (Hard Shortage)"
                          formula="HardShortage = max(0, (RequiredKg - ATP) - OpenContractKg)"
                          description="مقدار کسری ماده اولیه که نه با موجودی آزاد انبار (ATP) و نه با سهمیه قراردادهای باز ساپکو پوشش داده نمی‌شود."
                          badgeColor="rose"
                        />
                      </span>
                    </th>
                    <th className="py-1.5 px-2.5 text-center">وضعیت تأمین</th>
                    <th className="py-1.5 px-2.5 text-center no-print">اکشن سریع تدارکات (PR)</th>
                    <th className="py-1.5 px-2.5 text-center no-print">قطعات متقاضی</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {filteredMaterials.map(m => {
                    const isExpanded = expandedMaterialCode === m.materialCode;
                    const hasVipDemand = m.demandedByParts.some(dp => vipMap[dp.partId] || vipMap[dp.partCode]);
                    const issuedPr = issuedPrMap[m.materialCode];
                    const effectiveShortage = m.hardShortageQuantity > 0 ? m.hardShortageQuantity : m.shortageQuantity;
                    return (
                      <React.Fragment key={m.materialId}>
                        <tr
                          className={`transition ${
                            hasVipDemand ? 'bg-[#fff9f0] hover:bg-[#fff4e5]' : 'hover:bg-[#e5f3fa]'
                          }`}
                        >
                          <td className="py-1.5 px-2.5 font-sans">
                            <div className="font-semibold text-[#333333] flex items-center gap-1.5 flex-wrap">
                              <span>{m.materialName}</span>
                              {hasVipDemand && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-[#fff4e5] text-[#e9730c] border border-[#f5cba7] text-[9px] font-semibold">
                                  <Pin className="w-2.5 h-2.5 fill-[#e9730c]" />
                                  VIP
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => traceDocument(m.materialCode, 'INVENTORY_LEDGER')}
                              className="sap-doc-link text-[11px] font-mono cursor-pointer"
                            >
                              {m.materialCode}
                            </button>
                          </td>
                          <td className="py-1.5 px-2.5 text-center">
                            <span className="px-1.5 py-0.5 rounded bg-[#f5f5f5] border border-[#d9d9d9] text-[#333333] font-semibold text-[11px]">
                              {m.materialGrade}
                            </span>
                            {m.thicknessMm > 0 && (
                              <span className="block text-[10px] text-[#666666] font-mono mt-0.5">
                                {toPersianDigits(m.thicknessMm)} mm
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 px-2.5 text-center text-[#007cc0] font-semibold">
                            {formatNumber(m.requiredWeightKg)}
                          </td>
                          <td className="py-1.5 px-2.5 text-center text-[#333333]">
                            {formatNumber(m.onHandOwned)}
                          </td>
                          <td className="py-1.5 px-2.5 text-center text-[#107e3e] font-semibold">
                            {formatNumber(m.onHandConsignment)}
                          </td>
                          <td className="py-1.5 px-2.5 text-center text-[#bb0000]">
                            {m.onHandQuarantined > 0 ? (
                              <span className="text-[#bb0000] font-semibold underline" title="خارج از چرخه تخصیص">
                                {formatNumber(m.onHandQuarantined)}
                              </span>
                            ) : (
                              '۰'
                            )}
                          </td>
                          <td className="py-1.5 px-2.5 text-center text-[#e9730c]">
                            {formatNumber(m.reservedActive)}
                          </td>
                          <td className="py-1.5 px-2.5 text-center text-[#107e3e] font-bold bg-[#ebf5ec]">
                            {formatNumber(m.netAvailable)}
                          </td>
                          <td className="py-1.5 px-2.5 text-center text-[#007cc0]">
                            {formatNumber(m.openContractQuantity)}
                          </td>
                          <td className="py-1.5 px-2.5 text-center font-bold">
                            {m.hardShortageQuantity > 0 ? (
                              <span className="text-[#bb0000] px-1.5 py-0.5 rounded bg-[#ffecec] border border-[#f5b7b1]">
                                {formatNumber(m.hardShortageQuantity)}
                              </span>
                            ) : (
                              <span className="text-[#666666]">-</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2.5 text-center font-sans">
                            {m.severity === 'OK' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#ebf5ec] text-[#107e3e] border border-[#b7dfbf] inline-flex items-center gap-1 whitespace-nowrap">
                                <CheckCircle2 className="w-3 h-3" />
                                پوشش کامل
                              </span>
                            )}
                            {m.severity === 'SHORTAGE_COVERED_BY_CONTRACT' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#fff4e5] text-[#e9730c] border border-[#f5cba7] inline-flex items-center gap-1 whitespace-nowrap">
                                <Info className="w-3 h-3" />
                                پوشش قرارداد
                              </span>
                            )}
                            {m.severity === 'HARD_SHORTAGE' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#ffecec] text-[#bb0000] border border-[#f5b7b1] inline-flex items-center gap-1 whitespace-nowrap">
                                <ShieldAlert className="w-3 h-3" />
                                کسری قطعی
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 px-2.5 text-center font-sans no-print">
                            {issuedPr ? (
                              <div className="inline-flex flex-col items-center gap-0.5">
                                <span className="px-2 py-0.5 rounded bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] font-mono text-[10px] font-semibold">
                                  ✓ {issuedPr.prNumber}
                                </span>
                                <span className="text-[9px] text-[#666666]">
                                  {formatNumber(issuedPr.quantity)} {issuedPr.unit}
                                </span>
                              </div>
                            ) : effectiveShortage > 0 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  handleIssuePurchaseRequisition(
                                    m.materialCode,
                                    m.materialName,
                                    effectiveShortage,
                                    'kg',
                                    m.materialGrade
                                  )
                                }
                                title="صدور فوری درخواست خرید (Purchase Requisition) برای جبران کسری"
                                className="px-2.5 py-1 rounded bg-[#bb0000] hover:bg-[#990000] text-[#ffffff] text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                              >
                                <ShoppingCart className="w-3 h-3" />
                                <span>صدور درخواست خرید (PR)</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-[#888888]">نیاز ندارد</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2.5 text-center">
                            <button
                              onClick={() => setExpandedMaterialCode(isExpanded ? null : m.materialCode)}
                              className="sap-btn-standard px-2 py-0.5 text-[11px] font-sans inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            >
                              <span>{toPersianDigits(m.demandedByParts.length)} قطعه</span>
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          </td>
                        </tr>

                        {/* Expanded Drawer for Demanded Parts & Matching Coils */}
                        {isExpanded && (
                          <tr className="bg-[#f5f5f5] border-b border-[#d9d9d9] font-sans">
                            <td colSpan={13} className="p-3">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                {/* Demanded by Parts */}
                                <div className="bg-[#ffffff] border border-[#d9d9d9] rounded p-3">
                                  <h4 className="font-semibold text-[#333333] mb-2 flex items-center gap-2">
                                    <Boxes className="w-4 h-4 text-[#007cc0]" />
                                    قطعات متقاضی این متریال در برنامه:
                                  </h4>
                                  <div className="space-y-1.5">
                                    {m.demandedByParts.map((dp, idx) => (
                                      <div
                                        key={idx}
                                        className="flex items-center justify-between p-2 rounded bg-[#f7f7f7] border border-[#e8e8e8]"
                                      >
                                        <div>
                                          <div className="font-semibold text-[#333333]">{dp.partName}</div>
                                          <button
                                            type="button"
                                            onClick={() => traceDocument(dp.partCode, 'INVENTORY_LEDGER')}
                                            className="sap-doc-link text-[10px] font-mono cursor-pointer"
                                          >
                                            {dp.partCode}
                                          </button>
                                        </div>
                                        <div className="text-left font-mono">
                                          <div className="text-[#007cc0] font-semibold">
                                            {formatNumber(dp.weightKg)} <span className="text-[10px] font-sans text-[#666666]">kg</span>
                                          </div>
                                          <div className="text-[10px] text-[#666666]">
                                            ({formatNumber(dp.requiredQuantity)} عدد)
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Physical Matching Coils in Plant */}
                                <div className="bg-[#ffffff] border border-[#d9d9d9] rounded p-3">
                                  <h4 className="font-semibold text-[#333333] mb-2 flex items-center gap-2">
                                    <Layers className="w-4 h-4 text-[#107e3e]" />
                                    کلاف‌ها و رول‌های فیزیکی منطبق پای پرس:
                                  </h4>
                                  {m.matchingCoils.length > 0 ? (
                                    <div className="space-y-1.5">
                                      {m.matchingCoils.map((c, idx) => (
                                        <div
                                          key={idx}
                                          className="flex items-center justify-between p-2 rounded bg-[#f7f7f7] border border-[#e8e8e8]"
                                        >
                                          <div>
                                            <button
                                              type="button"
                                              onClick={() => traceDocument(c.coilNumber, 'COILS')}
                                              className="sap-doc-link font-semibold font-mono cursor-pointer"
                                            >
                                              {c.coilNumber}
                                            </button>
                                            <div className="text-[10px] text-[#666666]">
                                              {c.ownership === 'SAPCO_CONSIGNMENT' ? 'امانی ساپکو' : 'ملکی کارخانه'} • {c.warehouseLocation}
                                            </div>
                                          </div>
                                          <div className="text-left font-mono">
                                            <span className="text-[#107e3e] font-semibold text-xs">
                                              {formatNumber(c.remainingWeightKg)} kg
                                            </span>
                                            <span className="block text-[10px] text-[#666666]">
                                              ضخامت {toPersianDigits(c.thicknessMm)}mm
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-[#666666] text-[11px] p-3 text-center bg-[#f7f7f7] rounded">
                                      هیچ رول فیزیکی با این مشخصات در انبار ثبت نشده است.
                                    </div>
                                  )}
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
        </div>
      )}

      {/* =========================================================================
          TAB 2: PRE-ISSUE CHECK & AUTO-RESERVE (بررسی پیش از حواله)
          ========================================================================= */}
      {activeTab === 'pre_issue' && (
        <div className="space-y-4">
          {/* MO Selector & ATP Status Card */}
          <div className="sap-card p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-[#333333] mb-1.5">
                  انتخاب دستور کار ساخت (MO) جهت بررسی موجودی مواد پیش از صدور حواله:
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedMoId}
                    onChange={e => setSelectedMoId(e.target.value)}
                    className="flex-1 max-w-xl bg-[#ffffff] border border-[#bfbfbf] rounded px-3 py-1.5 text-xs text-[#333333] font-medium focus:outline-none focus:border-[#007cc0]"
                  >
                    {moList.map(mo => (
                      <option key={mo.id} value={mo.id}>
                        {mo.moNumber} — {mo.partName} ({formatNumber(mo.targetQuantity)} عدد) [وضعیت: {mo.status}]
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => runMoCheck(selectedMoId)}
                    disabled={checkingMo}
                    className="sap-btn-standard px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${checkingMo ? 'animate-spin text-[#007cc0]' : ''}`} />
                    <span>بررسی در لحظه</span>
                  </button>
                </div>
              </div>

              {moCheckResult && (
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded border ${
                    moCheckResult.readyToIssue
                      ? 'bg-[#ebf5ec] border-[#b7dfbf] text-[#107e3e]'
                      : 'bg-[#ffecec] border-[#f5b7b1] text-[#bb0000]'
                  }`}>
                    <div className="flex items-center gap-2 font-semibold text-xs">
                      {moCheckResult.readyToIssue ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-[#107e3e]" />
                          <span>آماده صدور حواله خروج پای پرس</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-[#bb0000]" />
                          <span>دارای کسری مواد / عدم امکان حواله</span>
                        </>
                      )}
                    </div>
                    <p className="text-[11px] text-[#666666] mt-0.5">
                      {moCheckResult.readyToIssue
                        ? 'کلیه ورق‌ها و قطعات این دستور کار در انبار آزاد و موجود است.'
                        : 'یک یا چند قلم متریال در انبار آزاد نبوده و نیازمند حواله یا تأمین است.'}
                    </p>
                  </div>

                  <button
                    onClick={handleAutoReserve}
                    disabled={reservingMo}
                    className="sap-btn-emphasized px-4 py-2 text-xs font-semibold transition cursor-pointer disabled:opacity-50 flex flex-col items-center justify-center gap-0.5 text-center whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      <span>رزرو خودکار موجودی آزاد (ATP)</span>
                    </div>
                    <span className="text-[10px] opacity-90 font-normal">
                      قفل کردن مواد در انبار برای این دستور کار
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* BOM Materials Availability Table */}
          {moCheckResult && (
            <div className="sap-card overflow-hidden">
              <div className="px-4 py-2.5 bg-[#ffffff] border-b border-[#d9d9d9] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-[#107e3e]" />
                  <h3 className="text-xs font-semibold text-[#333333]">
                    جدول موازنه اقلام BOM دستور کار{' '}
                    <button
                      type="button"
                      onClick={() => traceDocument(moCheckResult.moNumber, 'WIP_TRACEABILITY')}
                      className="sap-doc-link font-mono cursor-pointer"
                    >
                      {moCheckResult.moNumber}
                    </button>{' '}
                    ({moCheckResult.partName})
                  </h3>
                </div>
                <span className="text-xs text-[#666666] font-mono tabular-nums">
                  تیراژ مصوب: {formatNumber(moCheckResult.targetQuantity)} عدد
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="sap-table-compact w-full text-right">
                  <thead>
                    <tr>
                      <th className="py-1.5 px-2.5">کد و عنوان قطعه / ماده در BOM</th>
                      <th className="py-1.5 px-2.5 text-center">واحد</th>
                      <th className="py-1.5 px-2.5 text-center text-[#007cc0]">کل نیاز سفارش</th>
                      <th className="py-1.5 px-2.5 text-center">حواله شده قبلی</th>
                      <th className="py-1.5 px-2.5 text-center">باقیمانده نیاز</th>
                      <th className="py-1.5 px-2.5 text-center">موجودی انبار</th>
                      <th className="py-1.5 px-2.5 text-center text-[#e9730c]">رزرو همین MO</th>
                      <th className="py-1.5 px-2.5 text-center text-[#bb0000]">رزرو سایر MOها</th>
                      <th className="py-1.5 px-2.5 text-center text-[#107e3e]">آزاد برای این MO</th>
                      <th className="py-1.5 px-2.5 text-center text-[#bb0000]">کسری</th>
                      <th className="py-1.5 px-2.5 text-center">وضعیت ردیف</th>
                      <th className="py-1.5 px-2.5 text-center">اکشن سریع خرید (PR)</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono tabular-nums">
                    {moCheckResult.lines.map((l, idx) => {
                      const linePr = issuedPrMap[l.materialCode];
                      return (
                        <tr key={idx} className="hover:bg-[#e5f3fa] transition">
                          <td className="py-1.5 px-2.5 font-sans">
                            <div className="font-semibold text-[#333333]">{l.materialName}</div>
                            <button
                              type="button"
                              onClick={() => traceDocument(l.materialCode, 'INVENTORY_LEDGER')}
                              className="sap-doc-link text-[11px] font-mono cursor-pointer"
                            >
                              {l.materialCode}
                            </button>
                            {l.notes.length > 0 && (
                              <div className="text-[10px] text-[#666666] mt-0.5">{l.notes.join(' • ')}</div>
                            )}
                          </td>
                          <td className="py-1.5 px-2.5 text-center text-[#666666]">{l.unitCode}</td>
                          <td className="py-1.5 px-2.5 text-center text-[#007cc0] font-semibold">{formatNumber(l.requiredQuantity)}</td>
                          <td className="py-1.5 px-2.5 text-center text-[#666666]">{formatNumber(l.alreadyIssuedQuantity)}</td>
                          <td className="py-1.5 px-2.5 text-center text-[#333333] font-semibold">{formatNumber(l.remainingRequired)}</td>
                          <td className="py-1.5 px-2.5 text-center text-[#333333]">{formatNumber(l.onHandApproved)}</td>
                          <td className="py-1.5 px-2.5 text-center text-[#e9730c] font-semibold">{formatNumber(l.reservedForThisMo)}</td>
                          <td className="py-1.5 px-2.5 text-center text-[#bb0000]">{formatNumber(l.reservedForOthers)}</td>
                          <td className="py-1.5 px-2.5 text-center text-[#107e3e] font-bold bg-[#ebf5ec]">
                            {formatNumber(l.availableForThisMo)}
                          </td>
                          <td className="py-1.5 px-2.5 text-center font-bold">
                            {l.shortageQuantity > 0 ? (
                              <span className="text-[#bb0000] px-1.5 py-0.5 rounded bg-[#ffecec] border border-[#f5b7b1]">
                                {formatNumber(l.shortageQuantity)}
                              </span>
                            ) : (
                              <span className="text-[#666666]">۰</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2.5 text-center font-sans">
                            {l.status === 'READY' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#ebf5ec] text-[#107e3e] border border-[#b7dfbf] inline-flex items-center gap-1 whitespace-nowrap">
                                <CheckCircle2 className="w-3 h-3" />
                                آماده حواله
                              </span>
                            )}
                            {l.status === 'SHORTAGE' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#ffecec] text-[#bb0000] border border-[#f5b7b1] inline-flex items-center gap-1 whitespace-nowrap">
                                <AlertTriangle className="w-3 h-3" />
                                کسری موجودی
                              </span>
                            )}
                            {l.status === 'NOT_REQUIRED' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#f5f5f5] text-[#666666] border border-[#d9d9d9] whitespace-nowrap">
                                تأمین کامل شده
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 px-2.5 text-center font-sans">
                            {linePr ? (
                              <span className="px-2 py-0.5 rounded bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] font-mono text-[10px] font-semibold">
                                ✓ {linePr.prNumber}
                              </span>
                            ) : l.shortageQuantity > 0 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  handleIssuePurchaseRequisition(
                                    l.materialCode,
                                    l.materialName,
                                    l.shortageQuantity,
                                    l.unitCode
                                  )
                                }
                                className="px-2.5 py-1 rounded bg-[#bb0000] hover:bg-[#990000] text-[#ffffff] text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer transition whitespace-nowrap"
                              >
                                <ShoppingCart className="w-3 h-3" />
                                <span>صدور درخواست خرید (PR)</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-[#888888]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 3: PARTS DEMAND NETTING (موازنه تقاضای قطعات - با دکمه کشوی تعریف درجا BOM/مسیر)
          ========================================================================= */}
      {activeTab === 'parts' && mrpData && (
        <div className="sap-card overflow-hidden">
          <div className="px-4 py-3 bg-[#ffffff] border-b border-[#d9d9d9] flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-[#333333] flex items-center gap-2">
                <Boxes className="w-4 h-4 text-[#007cc0]" />
                موازنه تیراژ قطعات نهایی خودرویی (تقاضای باز مشتریان نسبت به موجودی و WIP)
              </h3>
              <p className="text-[11px] text-[#666666] mt-0.5">
                بر روی وضعیت‌های <strong className="text-[#bb0000]">«فاقد BOM»</strong> یا <strong className="text-[#e9730c]">«فاقد مسیر»</strong> کلیک کنید تا کشوی جانبی تعریف سریع مستندات فنی باز شود (بدون خروج از ماژول MRP).
              </p>
            </div>
            <span className="text-xs text-[#666666] font-mono">
              {toPersianDigits(mrpData.parts.length)} محصول
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="sap-table-compact w-full text-right">
              <thead>
                <tr>
                  <th className="py-1.5 px-2.5">کد و نام قطعه خودرویی</th>
                  <th className="py-1.5 px-2.5">خودرو</th>
                  <th className="py-1.5 px-2.5 text-center text-[#007cc0]">تقاضای ناخالص</th>
                  <th className="py-1.5 px-2.5 text-center text-[#107e3e]">موجودی محصول نهایی</th>
                  <th className="py-1.5 px-2.5 text-center text-[#e9730c]">رزرو محصول</th>
                  <th className="py-1.5 px-2.5 text-center text-[#007cc0]">کار در جریان (WIP)</th>
                  <th className="py-1.5 px-2.5 text-center text-[#007cc0]">دستور کار باز (MO)</th>
                  <th className="py-1.5 px-2.5 text-center text-[#bb0000]">نیاز خالص تولید</th>
                  <th className="py-1.5 px-2.5 text-center">وضعیت مستندات فنی (کلیک برای تکمیل در کشو)</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {mrpData.parts.map(p => (
                  <tr
                    key={p.partId}
                    className={`transition ${
                      p.isVIP ? 'bg-[#fff9f0] hover:bg-[#fff4e5]' : 'hover:bg-[#e5f3fa]'
                    }`}
                  >
                    <td className="py-1.5 px-2.5 font-sans">
                      <div className="font-semibold text-[#333333] flex items-center gap-1.5 flex-wrap">
                        <span>{p.partName}</span>
                        {p.isVIP && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-[#fff4e5] text-[#e9730c] text-[10px] font-semibold border border-[#f5cba7]">
                            <Pin className="w-2.5 h-2.5 fill-[#e9730c]" />
                            VIP
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => traceDocument(p.partCode, 'INVENTORY_LEDGER')}
                        className="sap-doc-link text-[11px] font-mono cursor-pointer"
                      >
                        {p.partCode}
                      </button>
                    </td>
                    <td className="py-1.5 px-2.5 font-sans text-[#333333]">{p.carModel || '-'}</td>
                    <td className="py-1.5 px-2.5 text-center text-[#007cc0] font-semibold">
                      {formatNumber(p.grossDemand)}
                    </td>
                    <td className="py-1.5 px-2.5 text-center text-[#107e3e] font-semibold">
                      {formatNumber(p.coveredByFgStock)}
                    </td>
                    <td className="py-1.5 px-2.5 text-center text-[#e9730c]">
                      {formatNumber(p.coveredByFgReservations)}
                    </td>
                    <td className="py-1.5 px-2.5 text-center text-[#007cc0] font-semibold">
                      {formatNumber(p.coveredByWip)}
                    </td>
                    <td className="py-1.5 px-2.5 text-center text-[#007cc0]">
                      {formatNumber(p.coveredByActiveMos)}
                    </td>
                    <td className="py-1.5 px-2.5 text-center font-bold">
                      {p.netRequirement > 0 ? (
                        <span className="px-2 py-0.5 rounded bg-[#ffecec] text-[#bb0000] border border-[#f5b7b1]">
                          {formatNumber(p.netRequirement)}
                        </span>
                      ) : (
                        <span className="text-[#107e3e] font-semibold">پوشش کامل (۰)</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2.5 text-center font-sans">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenBomRoutingDrawer(p, 'BOM')}
                          title={
                            p.hasBom
                              ? 'مشاهده یا ویرایش درخت محصول (BOM) در کشوی جانبی'
                              : 'کلیک جهت تعریف سریع BOM در کشوی جانبی بدون خروج از MRP'
                          }
                          className={`px-2 py-1 rounded text-[10px] font-semibold inline-flex items-center gap-1 transition cursor-pointer whitespace-nowrap ${
                            p.hasBom
                              ? 'bg-[#ebf5ec] text-[#107e3e] border border-[#b7dfbf] hover:bg-[#d8eedb]'
                              : 'bg-[#bb0000] hover:bg-[#990000] text-[#ffffff] border border-[#bb0000]'
                          }`}
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                          <span>{p.hasBom ? 'BOM تأییدشده' : 'فاقد BOM (تعریف +)'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenBomRoutingDrawer(p, 'ROUTING')}
                          title={
                            p.hasRouting
                              ? 'مشاهده یا ویرایش مسیر تولید (Routing) در کشوی جانبی'
                              : 'کلیک جهت تعریف سریع مسیر تولید در کشوی جانبی بدون خروج از MRP'
                          }
                          className={`px-2 py-1 rounded text-[10px] font-semibold inline-flex items-center gap-1 transition cursor-pointer whitespace-nowrap ${
                            p.hasRouting
                              ? 'bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] hover:bg-[#d1eafa]'
                              : 'bg-[#e9730c] hover:bg-[#c85f05] text-[#ffffff] border border-[#e9730c]'
                          }`}
                        >
                          <GitBranch className="w-2.5 h-2.5" />
                          <span>{p.hasRouting ? 'مسیر ساخت' : 'فاقد مسیر (تعریف +)'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: DEMAND SIMULATION (شبیه‌ساز سناریوی تقاضا)
          ========================================================================= */}
      {activeTab === 'simulation' && (
        <div className="sap-card p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[#333333] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#007cc0]" />
              شبیه‌ساز پیش‌بینی نیازمندی مواد و سناریوی رشد تقاضا (What-If Simulation)
            </h3>
            <p className="text-xs text-[#666666] mt-0.5">
              تنظیم سناریوهای رشد تقاضای ساپکو، افق زمانی برنامه‌ریزی، و سنجش میزان کسری کلاف قبل از تعهد تجاری
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-[#f5f5f5] border border-[#d9d9d9] rounded p-3.5">
              <label className="block text-xs font-semibold text-[#333333] mb-2">
                درصد رشد تقاضای سفارشات:
              </label>
              <div className="flex items-center gap-1.5">
                {[0, 15, 25, 50].map(pct => (
                  <button
                    key={pct}
                    onClick={() => setSimGrowth(pct)}
                    className={`flex-1 py-1.5 rounded text-xs font-semibold transition cursor-pointer ${
                      simGrowth === pct
                        ? 'bg-[#007cc0] text-[#ffffff]'
                        : 'bg-[#ffffff] text-[#666666] hover:text-[#333333] border border-[#d9d9d9]'
                    }`}
                  >
                    {pct === 0 ? 'مبنا (۰٪)' : `+${toPersianDigits(pct)}٪`}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[#f5f5f5] border border-[#d9d9d9] rounded p-3.5">
              <label className="block text-xs font-semibold text-[#333333] mb-2">
                افق زمانی برنامه‌ریزی:
              </label>
              <div className="flex items-center gap-1.5">
                {[7, 14, 30, 90].map(days => (
                  <button
                    key={days}
                    onClick={() => setSimHorizon(days)}
                    className={`flex-1 py-1.5 rounded text-xs font-semibold transition cursor-pointer ${
                      simHorizon === days
                        ? 'bg-[#007cc0] text-[#ffffff]'
                        : 'bg-[#ffffff] text-[#666666] hover:text-[#333333] border border-[#d9d9d9]'
                    }`}
                  >
                    {toPersianDigits(days)} روزه
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[#f5f5f5] border border-[#d9d9d9] rounded p-3.5 flex flex-col justify-between">
              <label className="block text-xs font-semibold text-[#333333] mb-2">
                ملاحظات چرخه ساخت و موجودی:
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-[#333333] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simIncludeWip}
                    onChange={e => setSimIncludeWip(e.target.checked)}
                    className="accent-[#007cc0] rounded"
                  />
                  <span>لحاظ کردن موجودی کار در جریان (WIP)</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-[#333333] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simIncludeConsignment}
                    onChange={e => setSimIncludeConsignment(e.target.checked)}
                    className="accent-[#007cc0] rounded"
                  />
                  <span>شمارش موجودی امانی ساپکو</span>
                </label>
              </div>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleRunSimulation}
                disabled={simulating}
                className="sap-btn-emphasized w-full py-3 text-xs font-semibold transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>اجرای شبیه‌سازی سناریو</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SLIDE-OVER DRAWER FOR INLINE BOM & ROUTING DEFINITION INSIDE MRP
          ========================================================================= */}
      {bomRoutingDrawerPart && (
        <div
          className="fixed inset-0 z-[85] flex justify-end bg-[#333333]/40"
          dir="rtl"
          onClick={() => setBomRoutingDrawerPart(null)}
        >
          <div
            className="relative w-full max-w-xl bg-[#ffffff] h-full shadow-xl border-r border-[#d9d9d9] flex flex-col justify-between overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Sticky Header */}
            <div className="sticky top-0 z-20 p-4 border-b border-[#d9d9d9] bg-[#ffffff] flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] inline-block mb-1">
                  حل بن‌بست فنی درجا (Inline MRP Technical Resolution)
                </span>
                <h3 className="text-sm font-semibold text-[#333333]">
                  تعریف BOM و مسیر تولید: {bomRoutingDrawerPart.partName}
                </h3>
                <p className="text-[11px] text-[#666666] font-mono mt-0.5">
                  {bomRoutingDrawerPart.partCode} | تقاضای خالص: {formatNumber(bomRoutingDrawerPart.netRequirement)} عدد
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBomRoutingDrawerPart(null)}
                className="p-1.5 rounded border border-[#d9d9d9] bg-[#f5f5f5] hover:bg-[#e8e8e8] text-[#666666] hover:text-[#333333] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Section Switcher Tabs */}
            <div className="sap-icon-tab-bar px-4 bg-[#f7f7f7]">
              <button
                type="button"
                onClick={() => setDrawerFocusSection('BOM')}
                className={`sap-icon-tab ${drawerFocusSection === 'BOM' ? 'sap-icon-tab-active' : ''}`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>۱. ساختار درخت محصول (BOM ورق و اقلام)</span>
              </button>
              <button
                type="button"
                onClick={() => setDrawerFocusSection('ROUTING')}
                className={`sap-icon-tab ${drawerFocusSection === 'ROUTING' ? 'sap-icon-tab-active' : ''}`}
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span>۲. مسیر تولید و ایستگاه‌ها (Routing / OP)</span>
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveBomRoutingFromDrawer} className="flex-1 p-4 space-y-4 text-xs">
              {/* BOM Section */}
              <div
                className={`p-3.5 rounded border space-y-3 ${
                  drawerFocusSection === 'BOM'
                    ? 'bg-[#e5f3fa]/50 border-[#007cc0]'
                    : 'bg-[#f7f7f7] border-[#d9d9d9]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#333333] flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-[#007cc0]" />
                    <span>مشخصات ماده اولیه و درخت محصول (BOM)</span>
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#ffffff] text-[#007cc0] border border-[#b3ddf2]">
                    انفجار خودکار در MRP
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-[#333333] mb-1">گرید ورق فولادی (Grade):</label>
                    <select
                      value={drawerBomGrade}
                      onChange={e => setDrawerBomGrade(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-[#ffffff] border border-[#bfbfbf] text-[#333333] font-semibold focus:border-[#007cc0] focus:outline-none"
                    >
                      <option value="DC04">DC04 (ورق روغنی کشش عمیق ساپکو)</option>
                      <option value="ST14">ST14 (ورق روغنی فوق کشش)</option>
                      <option value="ST12">ST12 (ورق سرد معمولی)</option>
                      <option value="DX51D">DX51D (ورق گالوانیزه ضدخوردگی)</option>
                      <option value="S355MC">S355MC (ورق استحکام بالا شاسی)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-[#333333] mb-1">ضخامت ورق (mm):</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.4"
                      max="6.0"
                      value={drawerBomThickness}
                      onChange={e => setDrawerBomThickness(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-[#ffffff] border border-[#bfbfbf] text-[#333333] font-mono tabular-nums focus:border-[#007cc0] focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[#333333] mb-1">وزن خالص قطعه (kg):</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.05"
                      value={drawerBomUnitWeight}
                      onChange={e => setDrawerBomUnitWeight(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-[#ffffff] border border-[#bfbfbf] text-[#333333] font-mono tabular-nums focus:border-[#007cc0] focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[#333333] mb-1">ضریب پرت و ضایعات برش (%):</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="40"
                      value={drawerBomScrapPct}
                      onChange={e => setDrawerBomScrapPct(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-[#ffffff] border border-[#bfbfbf] text-[#333333] font-mono tabular-nums focus:border-[#007cc0] focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#e8e8e8]">
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-[#333333] mb-1">قطعه/یراق مونتاژی فرعی (Sub-Component):</label>
                    <input
                      type="text"
                      value={drawerBomHardware}
                      onChange={e => setDrawerBomHardware(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-[#ffffff] border border-[#bfbfbf] text-[#333333] focus:border-[#007cc0] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-[#333333] mb-1">ضریب مصرف در واحد:</label>
                    <input
                      type="number"
                      min="0"
                      value={drawerBomHardwareQty}
                      onChange={e => setDrawerBomHardwareQty(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-[#ffffff] border border-[#bfbfbf] text-[#333333] font-mono tabular-nums focus:border-[#007cc0] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Routing Section */}
              <div
                className={`p-3.5 rounded border space-y-3 ${
                  drawerFocusSection === 'ROUTING'
                    ? 'bg-[#e5f3fa]/50 border-[#007cc0]'
                    : 'bg-[#f7f7f7] border-[#d9d9d9]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#333333] flex items-center gap-1.5">
                    <GitBranch className="w-4 h-4 text-[#007cc0]" />
                    <span>ایستگاه‌های مسیر تولید (Routing Operations)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setDrawerOps(prev => [
                        ...prev,
                        {
                          stepCode: `OP-${(prev.length + 1) * 10}`,
                          stepName: 'ایستگاه عملیاتی جدید',
                          machineName: 'پرس ضربه‌ای ۱۶۰ تن ۱',
                          cycleTimeSec: 10,
                        },
                      ])
                    }
                    className="sap-btn-emphasized px-2.5 py-1 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>افزودن ایستگاه OP</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {drawerOps.map((op, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded bg-[#ffffff] border border-[#d9d9d9] grid grid-cols-12 gap-2 items-center"
                    >
                      <div className="col-span-2">
                        <input
                          type="text"
                          value={op.stepCode}
                          onChange={e =>
                            setDrawerOps(prev =>
                              prev.map((item, i) => (i === idx ? { ...item, stepCode: e.target.value } : item))
                            )
                          }
                          className="w-full px-2 py-1 rounded bg-[#f5f5f5] border border-[#d9d9d9] font-mono text-[11px] font-semibold text-[#007cc0]"
                        />
                      </div>
                      <div className="col-span-4">
                        <input
                          type="text"
                          value={op.stepName}
                          onChange={e =>
                            setDrawerOps(prev =>
                              prev.map((item, i) => (i === idx ? { ...item, stepName: e.target.value } : item))
                            )
                          }
                          placeholder="شرح عملیات"
                          className="w-full px-2 py-1 rounded bg-[#f5f5f5] border border-[#d9d9d9] text-[11px]"
                        />
                      </div>
                      <div className="col-span-4">
                        <input
                          type="text"
                          value={op.machineName}
                          onChange={e =>
                            setDrawerOps(prev =>
                              prev.map((item, i) => (i === idx ? { ...item, machineName: e.target.value } : item))
                            )
                          }
                          placeholder="ماشین / پرس"
                          className="w-full px-2 py-1 rounded bg-[#f5f5f5] border border-[#d9d9d9] text-[11px]"
                        />
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-1">
                        <input
                          type="number"
                          min="1"
                          value={op.cycleTimeSec}
                          onChange={e =>
                            setDrawerOps(prev =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, cycleTimeSec: Number(e.target.value) || 8 } : item
                              )
                            )
                          }
                          title="زمان سیکل (ثانیه)"
                          className="w-12 px-1.5 py-1 rounded bg-[#f5f5f5] border border-[#d9d9d9] font-mono text-[11px] text-center"
                        />
                        {drawerOps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setDrawerOps(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-[#666666] hover:text-[#bb0000] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="sticky bottom-0 pt-3 pb-2 bg-[#ffffff] border-t border-[#d9d9d9] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBomRoutingDrawerPart(null)}
                  className="sap-btn-standard px-4 py-1.5 text-xs cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="sap-btn-emphasized px-4 py-1.5 text-xs cursor-pointer"
                >
                  ذخیره مستندات فنی و بروزرسانی درجا در MRP
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
