import React, { useState, useMemo } from 'react';
import {
  X,
  Boxes,
  Layers,
  GitBranch,
  CheckCircle2,
  AlertTriangle,
  Zap,
  ShieldCheck,
  Package,
  Wrench,
  ChevronDown,
  ChevronUp,
  Flame,
  Info,
  Check,
  PlusCircle,
  FileText,
  Calendar,
} from 'lucide-react';
import { HighwayPartScenario } from './FactoryHighwayWorkbench';
import { formatNumber, toPersianDigits } from '../../utils/formatters';
import { INITIAL_ADVANCED_BOMS, getAllBoms } from '../../server/bomAndParallelEngine';
import { useErpRouter } from '../../context/RouterContext';

export interface PreMoWipInspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: HighwayPartScenario;
  onConfirmIssueOrder?: (updatedOrder: HighwayPartScenario) => void;
  onIssueSubMo?: (subMoData: {
    parentMoId: string;
    parentOrderCode: string;
    componentPartId: string;
    componentPartCode: string;
    componentPartName: string;
    requiredQty: number;
    subRoutingId?: string;
  }) => void;
}

export interface InterStageWipStep {
  stepCode: string;
  stepName: string;
  processType: string;
  machineName: string;
  hallName: string;
  waitingInputQty: number;
  inProgressQty: number;
  goodBufferQty: number;
  scrapQty: number;
  normScrapPercent: number;
}

export interface SubComponentInspectionRow {
  id: string;
  partId: string;
  partCode: string;
  partName: string;
  componentType: 'SUB_ASSEMBLY' | 'RAW_SHEET' | 'FASTENER' | 'OTHER';
  quantityPerAssembly: number;
  unit: string;
  totalRequiredQty: number;
  warehouseStockQty: number;
  interStageWipQty: number;
  totalAvailableQty: number;
  shortageQty: number;
  coveragePercent: number;
  status: 'COVERED' | 'SHORTAGE' | 'CRITICAL';
  subMoRequired: boolean;
  subRoutingId?: string;
  subMoIssued?: boolean;
  issuedSubMoCode?: string;
  stages: InterStageWipStep[];
  rawMaterialInfo?: {
    materialName: string;
    coilNumber?: string;
    heatNumber?: string;
    requiredKg: number;
    availableKg: number;
  };
}

export const PreMoWipInspectionModal: React.FC<PreMoWipInspectionModalProps> = ({
  isOpen,
  onClose,
  order,
  onConfirmIssueOrder,
  onIssueSubMo,
}) => {
  const { traceDocument } = useErpRouter();
  const [issuedSubMos, setIssuedSubMos] = useState<Record<string, { code: string; qty: number }>>({});
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({
    'CMP-ECU-MAIN': true,
    'CMP-ECU-COMP': true,
  });
  const [viewMode, setViewMode] = useState<'TREE_VIEW' | 'STATIONS_DETAIL'>('TREE_VIEW');

  // Match BOM for current part
  const matchedBom = useMemo(() => {
    const allBoms = getAllBoms();
    const found = allBoms.find(
      b =>
        b.assemblyPartId === order.partId ||
        b.assemblyPartCode === order.partCode ||
        order.partName.includes('ECU') ||
        order.partName.includes('ضدسرقت') ||
        order.partId?.includes('ECU')
    );
    if (found) return found;

    if (order.partName.includes('تارا') || order.partCode?.includes('TARA')) {
      return allBoms.find(b => b.assemblyPartCode.includes('TARA')) || allBoms[1];
    }
    if (order.partName.includes('۲۰۶') || order.partName.includes('قفل')) {
      return allBoms[0];
    }
    return INITIAL_ADVANCED_BOMS[2] || allBoms[0];
  }, [order.partId, order.partCode, order.partName]);

  // Build realistic, industrial inspection rows for sub-components
  const subComponents = useMemo<SubComponentInspectionRow[]>(() => {
    const orderQty = Math.max(1, order.orderQty);
    const isEcuBracket =
      order.partCode?.includes('ECU') ||
      order.partName?.includes('ECU') ||
      order.partName?.includes('ضدسرقت');

    if (isEcuBracket) {
      // 1. صفحه براکت اصلی ضدسرقت
      const mainStages: InterStageWipStep[] = [
        {
          stepCode: 'OP10_SLIT',
          stepName: 'نواربری و برش کویل ورق DC01A (عرض ۱۱۴۰)',
          processType: 'SHEARING',
          machineName: 'خط نواربر رول ۲',
          hallName: 'سالن برشکاری و آماده‌سازی بلنک',
          waitingInputQty: 0,
          inProgressQty: 250,
          goodBufferQty: 450,
          scrapQty: 8,
          normScrapPercent: 0.8,
        },
        {
          stepCode: 'OP15_SHEAR',
          stepName: 'برش با گیوتین هیدرولیک و ابعاددهی شیت اولیه',
          processType: 'SHEARING',
          machineName: 'قیچی گیوتین هیدرولیک',
          hallName: 'سالن برشکاری و آماده‌سازی بلنک',
          waitingInputQty: 100,
          inProgressQty: 180,
          goodBufferQty: 320,
          scrapQty: 4,
          normScrapPercent: 0.5,
        },
        {
          stepCode: 'OP20_BLNK',
          stepName: 'بلنکینگ و خالی‌بری کانتور اصلی براکت',
          processType: 'BLANKING',
          machineName: 'پرس ضربه‌ای ۲۵۰ تن ۱',
          hallName: 'سالن پرس‌های سنگین',
          waitingInputQty: 300,
          inProgressQty: 400,
          goodBufferQty: 1100,
          scrapQty: 22,
          normScrapPercent: 1.2,
        },
        {
          stepCode: 'OP30_BEND',
          stepName: 'خم لبه‌ها و فلنجینگ حاشیه‌ای براکت اصلی',
          processType: 'BENDING',
          machineName: 'پرس برک CNC خط ۱',
          hallName: 'سالن پرس‌های متوسط و برک CNC',
          waitingInputQty: 200,
          inProgressQty: 250,
          goodBufferQty: 680,
          scrapQty: 12,
          normScrapPercent: 0.5,
        },
        {
          stepCode: 'OP40_PNCH',
          stepName: 'پانچ دوبل سوراخ‌های موقعیت‌دهی و نشیمنگاه مهره‌ها',
          processType: 'PUNCH_FORM',
          machineName: 'پرس شولر ۴۰۰ تن',
          hallName: 'سالن پرس‌های سنگین',
          waitingInputQty: 150,
          inProgressQty: 300,
          goodBufferQty: 850,
          scrapQty: 15,
          normScrapPercent: 0.6,
        },
        {
          stepCode: 'OP50_WELD_NUT15',
          stepName: 'پرس‌جوش مقاومتی ۱۵ عدد مهره M6 پایه‌دار',
          processType: 'SPOT_WELD',
          machineName: 'دستگاه پرس‌جوش ۷۵kVA',
          hallName: 'سالن جوشکاری و پرس‌جوش مقاومتی',
          waitingInputQty: 200,
          inProgressQty: 350,
          goodBufferQty: 1500,
          scrapQty: 10,
          normScrapPercent: 0.6,
        },
      ];

      // 2. مکمل براکت ضدسرقت
      const compStages: InterStageWipStep[] = [
        {
          stepCode: 'OP10_SLIT',
          stepName: 'برش شیت از رول ۲×۱۱۴۰ با گیوتین',
          processType: 'SHEARING',
          machineName: 'خط نواربر رول ۲',
          hallName: 'سالن برشکاری و آماده‌سازی بلنک',
          waitingInputQty: 50,
          inProgressQty: 150,
          goodBufferQty: 600,
          scrapQty: 5,
          normScrapPercent: 0.8,
        },
        {
          stepCode: 'OP20_BLNK',
          stepName: 'پرسکاری بلنکینگ فرم هندسی مکمل',
          processType: 'BLANKING',
          machineName: 'پرس ضربه‌ای ۱۶۰ تن',
          hallName: 'سالن پرس‌های متوسط',
          waitingInputQty: 200,
          inProgressQty: 300,
          goodBufferQty: 1400,
          scrapQty: 18,
          normScrapPercent: 1.0,
        },
        {
          stepCode: 'OP30_BEND',
          stepName: 'خم‌کاری زوایای مکمل براکت',
          processType: 'BENDING',
          machineName: 'پرس برک CNC خط ۲',
          hallName: 'سالن پرس‌های متوسط و برک CNC',
          waitingInputQty: 150,
          inProgressQty: 250,
          goodBufferQty: 900,
          scrapQty: 10,
          normScrapPercent: 0.5,
        },
        {
          stepCode: 'OP40_PNCH',
          stepName: 'پانچ سوراخ‌ها و محل پیچ‌های جوشی',
          processType: 'PUNCH_FORM',
          machineName: 'پرس مکانیکی ۱۰۰ تن',
          hallName: 'سالن پرس‌های متوسط',
          waitingInputQty: 100,
          inProgressQty: 200,
          goodBufferQty: 1150,
          scrapQty: 8,
          normScrapPercent: 0.4,
        },
        {
          stepCode: 'OP50_WELD_BOLT2',
          stepName: 'پرس‌جوش مقاومتی ۲ عدد پیچ پایه جوشی M6x20',
          processType: 'SPOT_WELD',
          machineName: 'دستگاه پرس‌جوش ۷۵kVA خط ۲',
          hallName: 'سالن جوشکاری و پرس‌جوش مقاومتی',
          waitingInputQty: 120,
          inProgressQty: 180,
          goodBufferQty: 800,
          scrapQty: 6,
          normScrapPercent: 0.5,
        },
      ];

      const mainRequired = orderQty * 1;
      const mainWhStock = 1200;
      const mainWipFloorStock = 1500;
      const mainSubMo = issuedSubMos['CMP-ECU-MAIN'];
      const mainTotalAvail = mainWhStock + mainWipFloorStock + (mainSubMo ? mainSubMo.qty : 0);
      const mainShortage = mainSubMo ? 0 : Math.max(0, mainRequired - (mainWhStock + mainWipFloorStock));

      const compRequired = orderQty * 1;
      const compWhStock = 900;
      const compWipFloorStock = 800;
      const compSubMo = issuedSubMos['CMP-ECU-COMP'];
      const compTotalAvail = compWhStock + compWipFloorStock + (compSubMo ? compSubMo.qty : 0);
      const compShortage = compSubMo ? 0 : Math.max(0, compRequired - (compWhStock + compWipFloorStock));

      return [
        {
          id: 'CMP-ECU-MAIN',
          partId: 'PRT-WIP-ECU-MAIN',
          partCode: 'WIP-ECU-MAIN-BRK',
          partName: 'صفحه براکت اصلی ضدسرقت رایانه موتور',
          componentType: 'SUB_ASSEMBLY',
          quantityPerAssembly: 1,
          unit: 'عدد',
          totalRequiredQty: mainRequired,
          warehouseStockQty: mainWhStock,
          interStageWipQty: mainWipFloorStock,
          totalAvailableQty: mainTotalAvail,
          shortageQty: mainShortage,
          coveragePercent: Math.min(100, Math.round((mainTotalAvail / mainRequired) * 100)),
          status: mainShortage === 0 ? 'COVERED' : mainShortage > 1000 ? 'CRITICAL' : 'SHORTAGE',
          subMoRequired: true,
          subRoutingId: 'RTG-ECU-MAIN',
          subMoIssued: Boolean(mainSubMo),
          issuedSubMoCode: mainSubMo?.code,
          stages: mainStages,
          rawMaterialInfo: {
            materialName: 'کویل ورق سرد روغنی DC01A ضخامت 2mm ابعاد 2x1140',
            coilNumber: order.coilNumber || 'MOB-2025-DC01-409',
            heatNumber: order.heatNumber || 'HT-99412-MOB',
            requiredKg: Math.round(orderQty * 0.95),
            availableKg: order.warehouseAvailableKg || 18500,
          },
        },
        {
          id: 'CMP-ECU-COMP',
          partId: 'PRT-WIP-ECU-COMP',
          partCode: 'WIP-ECU-COMP-BRK',
          partName: 'مکمل براکت ضدسرقت رایانه موتور',
          componentType: 'SUB_ASSEMBLY',
          quantityPerAssembly: 1,
          unit: 'عدد',
          totalRequiredQty: compRequired,
          warehouseStockQty: compWhStock,
          interStageWipQty: compWipFloorStock,
          totalAvailableQty: compTotalAvail,
          shortageQty: compShortage,
          coveragePercent: Math.min(100, Math.round((compTotalAvail / compRequired) * 100)),
          status: compShortage === 0 ? 'COVERED' : compShortage > 1000 ? 'CRITICAL' : 'SHORTAGE',
          subMoRequired: true,
          subRoutingId: 'RTG-ECU-COMP',
          subMoIssued: Boolean(compSubMo),
          issuedSubMoCode: compSubMo?.code,
          stages: compStages,
          rawMaterialInfo: {
            materialName: 'کویل ورق سرد روغنی DC01A ضخامت 2mm ابعاد 2x1140 (یا 2x1000)',
            coilNumber: order.coilNumber || 'MOB-2025-DC01-409',
            heatNumber: order.heatNumber || 'HT-99412-MOB',
            requiredKg: Math.round(orderQty * 0.45),
            availableKg: order.warehouseAvailableKg || 18500,
          },
        },
        {
          id: 'CMP-ECU-NUT15',
          partId: 'PRT-FST-NUT-M6',
          partCode: 'FST-NUT-WELD-M6',
          partName: 'مهره جوشی چهارگوش پایه‌دار M6 (استاندارد خودرویی DIN 928)',
          componentType: 'FASTENER',
          quantityPerAssembly: 15,
          unit: 'عدد',
          totalRequiredQty: orderQty * 15,
          warehouseStockQty: 45000,
          interStageWipQty: 3000,
          totalAvailableQty: 48000,
          shortageQty: Math.max(0, orderQty * 15 - 48000),
          coveragePercent: Math.min(100, Math.round((48000 / (orderQty * 15)) * 100)),
          status: orderQty * 15 <= 48000 ? 'COVERED' : 'SHORTAGE',
          subMoRequired: false,
          stages: [],
        },
        {
          id: 'CMP-ECU-BLT2',
          partId: 'PRT-FST-BLT-M6-20',
          partCode: 'FST-BOLT-WELD-M6-20',
          partName: 'پیچ پایه جوشی مقاومتی M6x20 استاندارد خودرویی',
          componentType: 'FASTENER',
          quantityPerAssembly: 2,
          unit: 'عدد',
          totalRequiredQty: orderQty * 2,
          warehouseStockQty: 12000,
          interStageWipQty: 1000,
          totalAvailableQty: 13000,
          shortageQty: Math.max(0, orderQty * 2 - 13000),
          coveragePercent: Math.min(100, Math.round((13000 / (orderQty * 2)) * 100)),
          status: orderQty * 2 <= 13000 ? 'COVERED' : 'SHORTAGE',
          subMoRequired: false,
          stages: [],
        },
      ];
    }

    // Generic fallback for other BOMs
    if (matchedBom && matchedBom.components.length > 0) {
      return matchedBom.components.map((c, idx) => {
        const required = orderQty * c.quantityPerAssembly;
        const whStock = Math.round(required * (0.6 + (idx % 3) * 0.3));
        const wipStock = Math.round(required * 0.35);
        const subMo = issuedSubMos[c.id];
        const totalAvail = whStock + wipStock + (subMo ? subMo.qty : 0);
        const shortage = subMo ? 0 : Math.max(0, required - (whStock + wipStock));

        return {
          id: c.id,
          partId: c.componentPartId,
          partCode: c.componentPartCode,
          partName: c.componentPartName,
          componentType:
            c.componentType === 'FASTENER_HARDWARE'
              ? 'FASTENER'
              : c.componentType === 'RAW_SHEET'
              ? 'RAW_SHEET'
              : 'SUB_ASSEMBLY',
          quantityPerAssembly: c.quantityPerAssembly,
          unit: c.unit === 'PCS' ? 'عدد' : c.unit,
          totalRequiredQty: required,
          warehouseStockQty: whStock,
          interStageWipQty: wipStock,
          totalAvailableQty: totalAvail,
          shortageQty: shortage,
          coveragePercent: Math.min(100, Math.round((totalAvail / required) * 100)),
          status: shortage === 0 ? 'COVERED' : shortage > required * 0.5 ? 'CRITICAL' : 'SHORTAGE',
          subMoRequired: c.subMoRequired,
          subRoutingId: c.subRoutingId,
          subMoIssued: Boolean(subMo),
          issuedSubMoCode: subMo?.code,
          stages: [
            {
              stepCode: 'OP10_PREP',
              stepName: 'آماده‌سازی و برش اولیه شیت',
              processType: 'SHEARING',
              machineName: 'خط برش و نواربر',
              hallName: 'سالن برشکاری',
              waitingInputQty: 50,
              inProgressQty: 100,
              goodBufferQty: Math.round(wipStock * 0.4),
              scrapQty: 5,
              normScrapPercent: 0.5,
            },
            {
              stepCode: 'OP20_FORM',
              stepName: 'فرم‌دهی و پرسکاری قطعه نیمه‌ساخته',
              processType: 'BLANKING',
              machineName: 'پرس ضربه‌ای ۲۵۰ تن',
              hallName: 'سالن پرس‌ها',
              waitingInputQty: 100,
              inProgressQty: 150,
              goodBufferQty: Math.round(wipStock * 0.6),
              scrapQty: 10,
              normScrapPercent: 0.8,
            },
          ],
        };
      });
    }

    return [];
  }, [order, matchedBom, issuedSubMos]);

  const overallShortages = useMemo(() => {
    return subComponents.filter(c => c.shortageQty > 0 && !c.subMoIssued);
  }, [subComponents]);

  const canProceed = overallShortages.length === 0;

  const handleIssueSingleSubMo = (row: SubComponentInspectionRow) => {
    const shortageAmount = row.shortageQty > 0 ? row.shortageQty : row.totalRequiredQty;
    const cleanCode = row.partCode.replace(/[^A-Za-z0-9]/g, '').slice(-6);
    const subMoCode = `SUB-MO-1404-${cleanCode}-${Math.floor(100 + Math.random() * 900)}`;

    setIssuedSubMos(prev => ({
      ...prev,
      [row.id]: { code: subMoCode, qty: shortageAmount },
    }));

    if (onIssueSubMo) {
      onIssueSubMo({
        parentMoId: order.id,
        parentOrderCode: order.orderCode,
        componentPartId: row.partId,
        componentPartCode: row.partCode,
        componentPartName: row.partName,
        requiredQty: shortageAmount,
        subRoutingId: row.subRoutingId,
      });
    }
  };

  const handleIssueAllMissingSubMos = () => {
    overallShortages.forEach(row => {
      if (row.subMoRequired) {
        handleIssueSingleSubMo(row);
      }
    });
  };

  const toggleExpand = (rowId: string) => {
    setExpandedStages(prev => ({
      ...prev,
      [rowId]: !prev[rowId],
    }));
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wip-preflight-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#333333]/40 overflow-y-auto"
    >
      <div className="bg-[#ffffff] rounded shadow-xl border border-[#d9d9d9] w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-right">
        {/* HEADER */}
        <div className="p-4 border-b border-[#d9d9d9] bg-[#ffffff] text-[#333333] flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                کنترل ارزیابی پیش‌نیازها و موجودی بین‌مراحل (Material Availability Check)
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#f5f5f5] text-[#333333] border border-[#d9d9d9]">
                دستور کار: {order.orderCode}
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#f5f5f5] text-[#007cc0] border border-[#d9d9d9]">
                بچ: {order.productionBatchCode}
              </span>
            </div>

            <h2 id="wip-preflight-title" className="text-sm sm:text-base font-semibold text-[#333333] flex items-center gap-2">
              <Boxes className="w-4 h-4 text-[#007cc0] shrink-0" />
              <span>ارزیابی درختی BOM و موجودی قطعات نیمه‌ساخته (WIP) پیش از صدور دستور کار</span>
            </h2>

            <p className="text-xs text-[#666666]">
              بررسی همزمان نیاز درختی محصول، موجودی انبار نیمه‌ساخته، موجودی بافر پای خط و امکان صدور مستقیم دستور کار فرعی (Sub-MO)
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-[#666666] hover:text-[#333333] p-1.5 rounded hover:bg-[#f5f5f5] border border-[#d9d9d9] transition-colors cursor-pointer shrink-0"
            aria-label="بستن فرم"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* EXECUTIVE KPI BAR */}
        <div className="bg-[#f5f5f5] border-b border-[#d9d9d9] p-3 grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="bg-[#ffffff] p-2.5 rounded border border-[#d9d9d9] flex items-center gap-2.5">
            <div className="w-9 h-9 rounded bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] flex items-center justify-center shrink-0">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] text-[#666666] font-medium">تیراژ درخواستی دستور کار:</div>
              <div className="text-sm font-bold text-[#333333] font-mono tabular-nums">
                {formatNumber(order.orderQty)} <span className="text-xs text-[#666666] font-normal">عدد</span>
              </div>
            </div>
          </div>

          <div className="bg-[#ffffff] p-2.5 rounded border border-[#d9d9d9] flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded flex items-center justify-center shrink-0 ${
                canProceed ? 'bg-[#ebf5ec] text-[#107e3e] border border-[#b7dfbf]' : 'bg-[#fff4e5] text-[#e9730c] border border-[#f5cba7]'
              }`}
            >
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] text-[#666666] font-medium">قطعات نیمه‌ساخته درختی:</div>
              <div className="text-xs font-semibold text-[#333333]">
                {subComponents.filter(c => c.componentType === 'SUB_ASSEMBLY').length} قطعه پیش‌ساخته فرعی
              </div>
              <div className="text-[11px] text-[#666666]">
                {subComponents.filter(c => c.shortageQty === 0).length} قطعه پوشش کامل ۱۰۰٪
              </div>
            </div>
          </div>

          <div className="bg-[#ffffff] p-2.5 rounded border border-[#d9d9d9] flex items-center gap-2.5">
            <div className="w-9 h-9 rounded bg-[#fff4e5] text-[#e9730c] border border-[#f5cba7] flex items-center justify-center shrink-0">
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] text-[#666666] font-medium">کلاف و شماره ذوب رسمی:</div>
              <button
                type="button"
                onClick={() => traceDocument(order.heatNumber || 'HT-99412-MOB', 'COILS')}
                className="sap-doc-link text-xs font-semibold font-mono cursor-pointer"
              >
                {order.heatNumber || 'HT-99412-MOB'}
              </button>
              <div className="text-[11px] text-[#107e3e] font-mono tabular-nums">
                موجود: {formatNumber(order.warehouseAvailableKg || 18500)} کیلوگرم
              </div>
            </div>
          </div>

          <div
            className={`p-2.5 rounded border flex items-center gap-2.5 ${
              canProceed
                ? 'bg-[#ebf5ec] border-[#b7dfbf] text-[#107e3e]'
                : 'bg-[#fff4e5] border-[#f5cba7] text-[#e9730c]'
            }`}
          >
            <div
              className={`w-9 h-9 rounded flex items-center justify-center shrink-0 ${
                canProceed ? 'bg-[#107e3e] text-[#ffffff]' : 'bg-[#e9730c] text-[#ffffff]'
              }`}
            >
              {canProceed ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            </div>
            <div>
              <div className="text-[11px] font-semibold">وضعیت تایید پیش‌نیازها:</div>
              <div className="text-xs font-bold">
                {canProceed ? 'آماده صدور و ابلاغ به خط' : `${toPersianDigits(overallShortages.length)} مورد کسری پیش‌ساخته`}
              </div>
              <div className="text-[10px]">
                {canProceed ? 'تمام قطعات پیش‌ساخته آماده هستند' : 'از دکمه روبروی هر سطر برای صدور Sub-MO استفاده کنید'}
              </div>
            </div>
          </div>
        </div>

        {/* TREE-VIEW & MATERIAL AVAILABILITY CHECK */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3.5 bg-[#f0f0f0]">
          <div className="p-3 rounded bg-[#e5f3fa] border border-[#b3ddf2] text-xs text-[#333333] flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-[#007cc0] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold">
                  نمای درختی ساختار محصول (Hierarchical BOM Tree) و موازنه موجودی بین‌مراحل:
                </div>
                <p className="text-[11px] leading-relaxed text-[#666666]">
                  برای تولید مجموعه نهایی، قطعات نیمه‌ساخته باید به میزان ضریب مصرف در تیراژ هدف موجود باشند.
                  در جدول درختی زیر، موجودی انبار نیمه‌ساخته و موجودی در جریان پای کار سالن‌ها (WIP) به صورت تفکیک‌شده نمایش داده شده است.
                  در صورت کسری، دقیقاً روبروی قطعه دکمه <strong>«صدور دستور تولید فرعی (Sub-MO)»</strong> قرار دارد تا بدون ترک این صفحه کسری را برطرف نمایید.
                </p>
              </div>
            </div>

            {overallShortages.length > 0 && (
              <button
                type="button"
                onClick={handleIssueAllMissingSubMos}
                className="px-3 py-1.5 rounded bg-[#e9730c] hover:bg-[#c85f05] text-[#ffffff] font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>صدور خودکار کلیه Sub-MO های دارای کسری</span>
              </button>
            )}
          </div>

          {/* HIERARCHICAL TREE CONTAINER */}
          <div className="bg-[#ffffff] rounded border border-[#d9d9d9] p-4 space-y-3.5">
            {/* 1. ROOT NODE: PARENT ASSEMBLY */}
            <div className="p-3.5 rounded bg-[#e5f3fa] border border-[#007cc0] text-[#333333] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded bg-[#007cc0] text-[#ffffff] flex items-center justify-center font-bold shrink-0">
                  <Boxes className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-[#007cc0] text-[#ffffff] font-semibold text-[10px]">
                      محصول نهایی (Parent Assembly)
                    </span>
                    <button
                      type="button"
                      onClick={() => traceDocument(order.partCode, 'INVENTORY_LEDGER')}
                      className="sap-doc-link font-mono text-xs cursor-pointer"
                    >
                      {order.partCode}
                    </button>
                  </div>
                  <h3 className="text-sm font-semibold text-[#333333] mt-1">
                    {order.partName}
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2.5 text-left font-mono">
                <div className="bg-[#ffffff] px-3 py-1.5 rounded border border-[#b3ddf2] text-center">
                  <div className="text-[10px] text-[#666666] font-sans">تیراژ هدف دستور کار</div>
                  <div className="text-sm font-bold text-[#107e3e] tabular-nums">
                    {formatNumber(order.orderQty)} عدد
                  </div>
                </div>
                <div className="bg-[#ffffff] px-3 py-1.5 rounded border border-[#b3ddf2] text-center">
                  <div className="text-[10px] text-[#666666] font-sans">شماره دستور تولید (MO)</div>
                  <div className="text-xs font-semibold text-[#007cc0]">
                    {order.orderCode}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. TREE BRANCHES (CHILDREN NODES) */}
            <div className="mr-3 sm:mr-5 pr-3 sm:pr-5 border-r-2 border-[#007cc0]/40 space-y-3">
              <div className="text-xs font-semibold text-[#666666] flex items-center gap-1.5">
                <GitBranch className="w-4 h-4 text-[#007cc0]" />
                <span>اجزای متشکله پیش‌ساخته، قطعات نیمه‌ساخته و اتصالات درختی (Child Components):</span>
              </div>

              {subComponents.map((component) => {
                const isSubMoIssued = component.subMoIssued || Boolean(issuedSubMos[component.id]);
                const currentSubMoCode = component.issuedSubMoCode || issuedSubMos[component.id]?.code;
                const isExpanded = Boolean(expandedStages[component.id]);

                return (
                  <div
                    key={component.id}
                    className={`rounded border p-3.5 transition-colors ${
                      component.shortageQty === 0
                        ? 'bg-[#ebf5ec]/50 border-[#b7dfbf]'
                        : isSubMoIssued
                        ? 'bg-[#e5f3fa]/50 border-[#b3ddf2]'
                        : 'bg-[#fff4e5]/60 border-[#f5cba7]'
                    }`}
                  >
                    {/* Node Header Row */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <div
                          className={`w-8 h-8 rounded flex items-center justify-center font-semibold text-xs shrink-0 border ${
                            component.componentType === 'SUB_ASSEMBLY'
                              ? 'bg-[#e5f3fa] text-[#007cc0] border-[#b3ddf2]'
                              : component.componentType === 'FASTENER'
                              ? 'bg-[#f5f5f5] text-[#333333] border-[#d9d9d9]'
                              : 'bg-[#f7f7f7] text-[#333333] border-[#d9d9d9]'
                          }`}
                        >
                          {component.componentType === 'SUB_ASSEMBLY' ? '⚙️' : component.componentType === 'FASTENER' ? '🔩' : '🛢️'}
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-[#333333] text-xs">
                              {component.partName}
                            </span>
                            <button
                              type="button"
                              onClick={() => traceDocument(component.partCode, 'INVENTORY_LEDGER')}
                              className="sap-doc-link font-mono text-[11px] cursor-pointer"
                            >
                              {component.partCode}
                            </button>
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#f5f5f5] text-[#333333] border border-[#d9d9d9] font-mono">
                              ضریب BOM: {toPersianDigits(component.quantityPerAssembly)} {component.unit}
                            </span>
                            {component.subRoutingId && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2]">
                                مسیر: {component.subRoutingId}
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-[#666666] mt-1">
                            {component.componentType === 'SUB_ASSEMBLY'
                              ? 'قطعه نیمه‌ساخته پرسی نیازمند عملیات نواربری، بلنک، خم‌کاری و پرس‌جوش'
                              : component.componentType === 'FASTENER'
                              ? 'اقلام استاندارد خودرویی نیازمند تأمین انبار قطعات استاندارد'
                              : 'مواد اولیه پایه'}
                          </div>
                        </div>
                      </div>

                      {/* FAST ACTION BUTTON (DIRECT SUB-MO ISSUANCE) */}
                      <div className="flex items-center gap-2 shrink-0">
                        {component.subMoRequired ? (
                          isSubMoIssued ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#ebf5ec] text-[#107e3e] font-semibold text-xs border border-[#b7dfbf]">
                              <CheckCircle2 className="w-4 h-4 text-[#107e3e]" />
                              <span>دستور ساخت فرعی صادر شد:</span>
                              {currentSubMoCode && (
                                <button
                                  type="button"
                                  onClick={() => traceDocument(currentSubMoCode, 'WIP_TRACEABILITY')}
                                  className="sap-doc-link font-mono cursor-pointer"
                                >
                                  {currentSubMoCode}
                                </button>
                              )}
                            </span>
                          ) : component.shortageQty > 0 ? (
                            <button
                              type="button"
                              onClick={() => handleIssueSingleSubMo(component)}
                              className="sap-btn-emphasized px-3 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer"
                            >
                              <Zap className="w-3.5 h-3.5" />
                              <span>صدور دستور تولید فرعی (Sub-MO) به تیراژ {formatNumber(component.shortageQty)} عدد</span>
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-[#ebf5ec] text-[#107e3e] font-semibold text-xs border border-[#b7dfbf]">
                              <Check className="w-3.5 h-3.5" />
                              <span>موجودی تکمیل و پوشش ۱۰۰٪</span>
                            </span>
                          )
                        ) : (
                          <span className="text-[11px] font-semibold text-[#666666] bg-[#ffffff] px-2.5 py-1 rounded border border-[#d9d9d9]">
                            تأمین از انبار اتصالات
                          </span>
                        )}
                      </div>
                    </div>

                    {/* QUANTITATIVE BALANCE GRID */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-3 mt-3 border-t border-[#e8e8e8] text-xs font-mono">
                      <div className="bg-[#ffffff] p-2 rounded border border-[#d9d9d9] text-center">
                        <span className="text-[10px] text-[#666666] font-sans block">نیاز کل برای این بچ</span>
                        <span className="text-sm font-bold text-[#333333] tabular-nums">
                          {formatNumber(component.totalRequiredQty)} {component.unit}
                        </span>
                      </div>

                      <div className="bg-[#ffffff] p-2 rounded border border-[#d9d9d9] text-center">
                        <span className="text-[10px] text-[#666666] font-sans block">موجودی انبار نیمه‌ساخته</span>
                        <span className="text-sm font-bold text-[#333333] tabular-nums">
                          {formatNumber(component.warehouseStockQty)} {component.unit}
                        </span>
                      </div>

                      <div className="bg-[#ffffff] p-2 rounded border border-[#d9d9d9] text-center">
                        <span className="text-[10px] text-[#666666] font-sans block">WIP پای خط (بین‌ایستگاهی)</span>
                        <span className="text-sm font-bold text-[#007cc0] tabular-nums">
                          {formatNumber(component.interStageWipQty)} {component.unit}
                        </span>
                      </div>

                      <div className="bg-[#ffffff] p-2 rounded border border-[#d9d9d9] text-center">
                        <span className="text-[10px] text-[#666666] font-sans block">کل موجودی قابل‌اتکا</span>
                        <span className="text-sm font-bold text-[#333333] tabular-nums">
                          {formatNumber(component.totalAvailableQty)} {component.unit}
                        </span>
                      </div>

                      <div
                        className={`p-2 rounded border text-center ${
                          component.shortageQty === 0
                            ? 'bg-[#ebf5ec] border-[#b7dfbf] text-[#107e3e]'
                            : 'bg-[#ffecec] border-[#f5b7b1] text-[#bb0000]'
                        }`}
                      >
                        <span className="text-[10px] font-sans block">وضعیت کسری / مازاد</span>
                        <span className="text-sm font-bold tabular-nums">
                          {component.shortageQty === 0 ? (
                            'تکمیل ۱۰۰٪'
                          ) : (
                            `کسری: -${formatNumber(component.shortageQty)} عدد`
                          )}
                        </span>
                      </div>
                    </div>

                    {/* COLLAPSIBLE STAGES BREAKDOWN */}
                    {component.stages && component.stages.length > 0 && (
                      <div className="mt-2.5 pt-2">
                        <button
                          type="button"
                          onClick={() => toggleExpand(component.id)}
                          className="text-[11px] font-semibold text-[#007cc0] hover:text-[#0058c4] flex items-center gap-1 cursor-pointer select-none"
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          <span>
                            {isExpanded
                              ? `بستن جزئیات ایستگاه‌های مسیر تولید (${toPersianDigits(component.stages.length)} ایستگاه)`
                              : `مشاهده تفکیک موجودی بین‌مراحل (WIP) در خطوط (${toPersianDigits(component.stages.length)} ایستگاه)`}
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mt-2 pt-2 border-t border-[#e8e8e8]">
                            {component.stages.map(stage => (
                              <div
                                key={stage.stepCode}
                                className="p-2 rounded bg-[#ffffff] border border-[#d9d9d9] text-[10px] space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="px-1.5 py-0.5 rounded bg-[#007cc0] text-[#ffffff] font-mono font-semibold text-[9px]">
                                    {stage.stepCode}
                                  </span>
                                  <span className="text-[#107e3e] font-mono font-semibold text-[10px] tabular-nums">
                                    بافر: {formatNumber(stage.goodBufferQty)}
                                  </span>
                                </div>
                                <div className="font-semibold text-[#333333] truncate" title={stage.stepName}>
                                  {stage.stepName}
                                </div>
                                <div className="text-[#666666] truncate" title={stage.machineName}>
                                  {stage.machineName}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 3. RAW MATERIAL COIL NODE */}
              <div className="rounded border border-[#b3ddf2] bg-[#e5f3fa]/40 p-3.5 space-y-2 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded bg-[#ffffff] border border-[#b3ddf2] text-[#007cc0] flex items-center justify-center font-bold">
                      🛢️
                    </span>
                    <div>
                      <div className="font-semibold text-[#333333]">
                        کویل ورق سرد روغنی پایه (DC01A ضخامت 2.0 میلیمتر عرض 1140)
                      </div>
                      <div className="text-[11px] text-[#666666] font-mono mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>کلاف:</span>
                        <button
                          type="button"
                          onClick={() => traceDocument(order.coilNumber || 'MOB-2025-DC01-409', 'COILS')}
                          className="sap-doc-link font-mono cursor-pointer"
                        >
                          {order.coilNumber || 'MOB-2025-DC01-409'}
                        </button>
                        <span>· شماره ذوب:</span>
                        <button
                          type="button"
                          onClick={() => traceDocument(order.heatNumber || 'HT-99412-MOB', 'COILS')}
                          className="sap-doc-link font-mono cursor-pointer"
                        >
                          {order.heatNumber || 'HT-99412-MOB'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="text-left font-mono text-xs tabular-nums">
                    <div className="font-semibold text-[#333333]">
                      مصرف ناخالص کل: {formatNumber(Math.round(order.orderQty * (order.unitWeightKg || 1.25) * 1.035))} کیلوگرم
                    </div>
                    <div className="text-[#107e3e] font-semibold text-[11px]">
                      موجودی آزاد انبار رول: {formatNumber(order.warehouseAvailableKg || 18500)} کیلوگرم
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* FOOTER ACTIONS                                                    */}
        {/* ================================================================= */}
        <div className="p-3.5 sm:px-5 border-t border-[#d9d9d9] bg-[#f7f7f7] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                canProceed ? 'bg-[#107e3e]' : 'bg-[#e9730c]'
              }`}
            />
            <span className="font-semibold text-[#333333]">
              {canProceed
                ? 'کلیه پیش‌نیازها و موجودی قطعات پیش‌ساخته تایید شدند. آماده صدور نهایی دستور کار.'
                : 'برای ردیف‌های دارای کسری، روی دکمه «صدور دستور تولید فرعی» کلیک کنید یا با پذیرش ریسک ادامه دهید.'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="sap-btn-standard px-3.5 py-1.5 text-xs cursor-pointer"
            >
              انصراف / ویرایش مشخصات
            </button>

            {onConfirmIssueOrder && (
              <button
                type="button"
                onClick={() => {
                  onConfirmIssueOrder(order);
                  onClose();
                }}
                className={`px-4 py-1.5 rounded text-xs font-semibold text-[#ffffff] transition-colors flex items-center gap-1.5 cursor-pointer ${
                  canProceed
                    ? 'bg-[#007cc0] hover:bg-[#0058c4]'
                    : 'bg-[#e9730c] hover:bg-[#c85e04]'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {canProceed
                    ? 'تایید نهایی و صدور دستور تولید اصلی (Confirm MO)'
                    : 'تایید و صدور دستور تولید همراه با Sub-MOهای صادره'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
