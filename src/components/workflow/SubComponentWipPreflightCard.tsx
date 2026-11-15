import React from 'react';
import {
  Boxes,
  Layers,
  GitBranch,
  CheckCircle2,
  AlertTriangle,
  Zap,
  ArrowUpRight,
  ExternalLink,
  Flame,
  Check,
} from 'lucide-react';
import { HighwayPartScenario } from './FactoryHighwayWorkbench';
import { formatNumber } from '../../utils/formatters';
import { useErpRouter } from '../../context/RouterContext';

interface SubComponentWipPreflightCardProps {
  order: HighwayPartScenario;
  onOpenFullInspectionModal: () => void;
  onQuickIssueSubMo?: (partCode: string, partName: string, requiredQty: number) => void;
}

export const SubComponentWipPreflightCard: React.FC<SubComponentWipPreflightCardProps> = ({
  order,
  onOpenFullInspectionModal,
  onQuickIssueSubMo,
}) => {
  const { traceDocument } = useErpRouter();
  const isEcuBracket =
    order.partCode?.includes('ECU') ||
    order.partName?.includes('ECU') ||
    order.partName?.includes('ضدسرقت');

  const isTaraBracket =
    order.partCode?.includes('TARA') || order.partName?.includes('تارا');

  // If this part doesn't have sub-components, return simple helper
  if (!isEcuBracket && !isTaraBracket && !order.bomSubComponents?.length) {
    return (
      <div className="p-3 rounded bg-[#f5f5f5] border border-[#d9d9d9] text-xs text-[#666666] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#666666]" />
          <span>تولید تک‌مرحله‌ای (فاقد قطعات پیش‌ساخته فرعی)</span>
        </div>
        <button
          type="button"
          onClick={onOpenFullInspectionModal}
          className="text-[#007cc0] hover:underline font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
        >
          <span>بررسی جریان بین‌مراحل (WIP)</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // Realistic stock calculations for ECU Bracket
  const orderQty = Math.max(1, order.orderQty || 1000);
  const mainPartRequired = orderQty;
  const mainPartAvail = 1200 + 1500; // Wh (1200) + Floor WIP (1500)
  const mainShortage = Math.max(0, mainPartRequired - mainPartAvail);

  const compPartRequired = orderQty;
  const compPartAvail = 900 + 800; // Wh (900) + Floor WIP (800)
  const compShortage = Math.max(0, compPartRequired - compPartAvail);

  const hasShortage = mainShortage > 0 || compShortage > 0;

  return (
    <div className="p-3 rounded bg-[#e5f3fa]/40 border border-[#b3ddf2] text-xs space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded bg-[#007cc0] text-[#ffffff]">
            <Boxes className="w-3.5 h-3.5" />
          </span>
          <div>
            <span className="font-semibold text-[#333333] block text-xs">
              موجودی قطعات پیش‌ساخته و موجودی بین‌مراحل (WIP Pre-Flight)
            </span>
            <span className="text-[10px] text-[#666666]">
              ارزیابی برخط بدون نیاز به مراجعه به سایر بخش‌های نرم‌افزار
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenFullInspectionModal}
          className="sap-btn-emphasized px-2.5 py-1 text-[11px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
        >
          <span>فرم جامع ارزیابی بین‌مراحل</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      {/* Sub-Components Quick Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* Component 1: Main Plate */}
        <div className="p-2.5 rounded bg-[#ffffff] border border-[#d9d9d9] space-y-1.5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => traceDocument('WIP-ECU-MAIN-BRK', 'WIP_TRACEABILITY')}
              className="sap-doc-link font-semibold text-[11px] cursor-pointer text-right"
            >
              ۱. صفحه براکت اصلی (WIP-ECU-MAIN-BRK)
            </button>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-[#f5f5f5] border border-[#d9d9d9] text-[#333333] font-mono">
              ۱ در هر مجموعه
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-center tabular-nums">
            <div className="bg-[#f5f5f5] p-1.5 rounded">
              <span className="text-[#666666] block font-sans">نیاز بچ:</span>
              <span className="font-semibold text-[#333333]">{formatNumber(mainPartRequired)}</span>
            </div>
            <div className="bg-[#f5f5f5] p-1.5 rounded">
              <span className="text-[#666666] block font-sans">موجود (انبار+پای خط):</span>
              <span className="font-semibold text-[#007cc0]">{formatNumber(mainPartAvail)}</span>
            </div>
            <div className="bg-[#f5f5f5] p-1.5 rounded">
              <span className="text-[#666666] block font-sans">وضعیت:</span>
              {mainShortage === 0 ? (
                <span className="font-semibold text-[#107e3e]">تکمیل</span>
              ) : (
                <span className="font-semibold text-[#bb0000]">کسری: {formatNumber(mainShortage)}</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-[#e8e8e8] text-[10px]">
            <span className="text-[#666666] font-mono">
              بافر پای پرس‌جوش: <strong>۱,۵۰۰ عدد</strong>
            </span>
            {mainShortage > 0 && onQuickIssueSubMo && (
              <button
                type="button"
                onClick={() =>
                  onQuickIssueSubMo(
                    'WIP-ECU-MAIN-BRK',
                    'صفحه براکت اصلی ضدسرقت',
                    mainShortage
                  )
                }
                className="text-[#007cc0] hover:underline font-semibold flex items-center gap-0.5 cursor-pointer"
              >
                <Zap className="w-3 h-3 text-[#e9730c]" />
                <span>صدور Sub-MO</span>
              </button>
            )}
          </div>
        </div>

        {/* Component 2: Complementary Plate */}
        <div className="p-2.5 rounded bg-[#ffffff] border border-[#d9d9d9] space-y-1.5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => traceDocument('WIP-ECU-COMP-BRK', 'WIP_TRACEABILITY')}
              className="sap-doc-link font-semibold text-[11px] cursor-pointer text-right"
            >
              ۲. مکمل براکت ضدسرقت (WIP-ECU-COMP-BRK)
            </button>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-[#f5f5f5] border border-[#d9d9d9] text-[#333333] font-mono">
              ۱ در هر مجموعه
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-center tabular-nums">
            <div className="bg-[#f5f5f5] p-1.5 rounded">
              <span className="text-[#666666] block font-sans">نیاز بچ:</span>
              <span className="font-semibold text-[#333333]">{formatNumber(compPartRequired)}</span>
            </div>
            <div className="bg-[#f5f5f5] p-1.5 rounded">
              <span className="text-[#666666] block font-sans">موجود (انبار+پای خط):</span>
              <span className="font-semibold text-[#007cc0]">{formatNumber(compPartAvail)}</span>
            </div>
            <div className="bg-[#f5f5f5] p-1.5 rounded">
              <span className="text-[#666666] block font-sans">وضعیت:</span>
              {compShortage === 0 ? (
                <span className="font-semibold text-[#107e3e]">تکمیل</span>
              ) : (
                <span className="font-semibold text-[#bb0000]">کسری: {formatNumber(compShortage)}</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-[#e8e8e8] text-[10px]">
            <span className="text-[#666666] font-mono">
              بافر پای پرس‌جوش: <strong>۸۰۰ عدد</strong>
            </span>
            {compShortage > 0 && onQuickIssueSubMo && (
              <button
                type="button"
                onClick={() =>
                  onQuickIssueSubMo(
                    'WIP-ECU-COMP-BRK',
                    'مکمل براکت ضدسرقت',
                    compShortage
                  )
                }
                className="text-[#007cc0] hover:underline font-semibold flex items-center gap-0.5 cursor-pointer"
              >
                <Zap className="w-3 h-3 text-[#e9730c]" />
                <span>صدور Sub-MO</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Raw Material + Fasteners Summary Line */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-[#b3ddf2] text-[11px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[#666666]">مواد و اتصالات:</span>
          <span className="font-mono text-[#333333]">
            ورق DC01A ذوب{' '}
            <button
              type="button"
              onClick={() => traceDocument(order.heatNumber || 'HT-99412-MOB', 'COILS')}
              className="sap-doc-link font-mono font-semibold cursor-pointer"
            >
              {order.heatNumber || 'HT-99412-MOB'}
            </button>{' '}
            (موجود: {formatNumber(order.warehouseAvailableKg || 18500)} ک.گ)
          </span>
          <span className="text-[#d9d9d9]">|</span>
          <span className="font-mono text-[#107e3e] font-semibold">
            مهره M6: ۴۵,۰۰۰ عدد
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {hasShortage ? (
            <span className="text-[#e9730c] font-semibold flex items-center gap-1 bg-[#fff4e5] px-2 py-0.5 rounded border border-[#f5cba7]">
              <AlertTriangle className="w-3 h-3" />
              <span>کسری قطعه پیش‌ساخته برای تیراژ کامل</span>
            </span>
          ) : (
            <span className="text-[#107e3e] font-semibold flex items-center gap-1 bg-[#ebf5ec] px-2 py-0.5 rounded border border-[#b7dfbf]">
              <CheckCircle2 className="w-3 h-3" />
              <span>پوشش کامل قطعات پیش‌ساخته</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
