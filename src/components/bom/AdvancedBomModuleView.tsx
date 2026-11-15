import React, { useState, useEffect } from 'react';
import {
  ListTree,
  Boxes,
  Layers,
  Wrench,
  Disc,
  Plus,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Scale,
  FileSpreadsheet,
  Link2,
  Trash2,
  Edit3,
  HelpCircle,
  GitFork,
  Printer,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Search,
  Filter,
  X,
} from 'lucide-react';
import { Part } from '../../types/inventory';
import {
  AdvancedBomDefinition,
  BomComponentItem,
  BomComponentType,
  JoiningProcessType,
} from '../../types/bomAndParallelFlow';
import { toPersianDigits, formatNumber } from '../../utils/formatters';
import { MasterDataDifferenceGuideModal } from '../common/MasterDataDifferenceGuideModal';
import { SearchableSelect } from '../common/SearchableSelect';
import { useErpRouter } from '../../context/RouterContext';
import { useEnterpriseUx } from '../../context/EnterpriseUxContext';

interface AdvancedBomModuleViewProps {
  parts: Part[];
  onOpenTraceabilityModal?: (partCode: string) => void;
  onNavigateToParallelFlow?: () => void;
}

export const AdvancedBomModuleView: React.FC<AdvancedBomModuleViewProps> = ({
  parts,
  onOpenTraceabilityModal,
  onNavigateToParallelFlow,
}) => {
  const { traceDocument } = useErpRouter();
  const { requestConfirm, showUndoToast } = useEnterpriseUx();
  const [boms, setBoms] = useState<AdvancedBomDefinition[]>([]);
  const [selectedBomId, setSelectedBomId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // New BOM Modal
  const [isNewBomModalOpen, setIsNewBomModalOpen] = useState(false);
  const [newBomPartId, setNewBomPartId] = useState('');
  const [newBomVersion, setNewBomVersion] = useState('V1.0');
  const [newBomCarModel, setNewBomCarModel] = useState('');
  const [newBomNotes, setNewBomNotes] = useState('');

  // Edit BOM Modal
  const [isEditBomModalOpen, setIsEditBomModalOpen] = useState(false);
  const [editBomVersion, setEditBomVersion] = useState('');
  const [editBomCarModel, setEditBomCarModel] = useState('');
  const [editBomNotes, setEditBomNotes] = useState('');

  // Sub-MO generation modal & status
  const [isGeneratingSubMos, setIsGeneratingSubMos] = useState(false);
  const [subMoModalOpen, setSubMoModalOpen] = useState(false);
  const [plannedQty, setPlannedQty] = useState(500);
  const [masterMoNumber, setMasterMoNumber] = useState('MO-1403-1082');
  const [generatedSubMos, setGeneratedSubMos] = useState<any[]>([]);

  // Add / Edit Component Modal
  const [isComponentModalOpen, setIsComponentModalOpen] = useState(false);
  const [editingCompId, setEditingCompId] = useState<string | null>(null);
  const [compParentId, setCompParentId] = useState<string>('');
  const [compPartId, setCompPartId] = useState('');
  const [compPartCode, setCompPartCode] = useState('');
  const [compPartName, setCompPartName] = useState('');
  const [compType, setCompType] = useState<BomComponentType>('RAW_SHEET');
  const [compQty, setCompQty] = useState(1);
  const [compUnit, setCompUnit] = useState<'PCS' | 'KG' | 'SET'>('PCS');
  const [compGross, setCompGross] = useState(0.5);
  const [compNet, setCompNet] = useState(0.4);
  const [compScrap, setCompScrap] = useState(20);
  const [compJoining, setCompJoining] = useState<JoiningProcessType>('SPOT_WELD');
  const [compSubMo, setCompSubMo] = useState(true);
  const [compStepJoined, setCompStepJoined] = useState(30);
  const [compSupplier, setCompSupplier] = useState<'SAPCO_CONSIGNMENT' | 'INTERNAL_FABRICATED' | 'PURCHASED_MARKET'>('INTERNAL_FABRICATED');

  const loadBoms = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/production/boms');
      const data = await res.json();
      if (data.success && data.data) {
        setBoms(data.data);
        if (!selectedBomId && data.data.length > 0) {
          setSelectedBomId(data.data[0].id);
        }
      }
    } catch (err) {
      console.error('Error loading BOMs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBoms();
  }, []);

  const activeBom = boms.find(b => b.id === selectedBomId) || boms[0];

  // Create New BOM
  const handleCreateNewBom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBomPartId) {
      showUndoToast({ title: 'لطفاً قطعه مورد نظر را انتخاب کنید.', variant: 'warning' });
      return;
    }
    const part = parts.find(p => p.id === newBomPartId);
    if (!part) return;

    const newBomPayload: Partial<AdvancedBomDefinition> = {
      assemblyPartId: part.id,
      assemblyPartCode: part.code,
      assemblyPartName: part.name,
      carModel: newBomCarModel || part.carModel || 'مشترک',
      version: newBomVersion || 'V1.0',
      isActive: true,
      effectiveDate: new Date().toISOString().split('T')[0],
      notes: newBomNotes,
      components: [],
    };

    try {
      const res = await fetch('/api/production/boms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBomPayload),
      });
      const data = await res.json();
      if (data.success && data.data) {
        await loadBoms();
        setSelectedBomId(data.data.id);
        setIsNewBomModalOpen(false);
        setNewBomPartId('');
        setNewBomVersion('V1.0');
        setNewBomNotes('');
        showUndoToast({ title: 'درخت محصول جدید با موفقیت ایجاد شد.', variant: 'success' });
      } else {
        showUndoToast({ title: data.error || 'خطا در ثبت درخت محصول جدید', variant: 'danger' });
      }
    } catch {
      showUndoToast({ title: 'خطا در ارتباط با سرور', variant: 'danger' });
    }
  };

  // Edit Active BOM Details
  const handleOpenEditBom = () => {
    if (!activeBom) return;
    setEditBomVersion(activeBom.version || 'V1.0');
    setEditBomCarModel(activeBom.carModel || '');
    setEditBomNotes(activeBom.notes || '');
    setIsEditBomModalOpen(true);
  };

  const handleSaveEditBom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBom) return;

    const updated = {
      ...activeBom,
      version: editBomVersion,
      carModel: editBomCarModel,
      notes: editBomNotes,
    };

    try {
      const res = await fetch('/api/production/boms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      const data = await res.json();
      if (data.success) {
        await loadBoms();
        setIsEditBomModalOpen(false);
        showUndoToast({ title: 'مشخصات BOM بروزرسانی شد.', variant: 'success' });
      }
    } catch {
      showUndoToast({ title: 'خطا در بروزرسانی مشخصات BOM', variant: 'danger' });
    }
  };

  // Delete Entire BOM
  const handleDeleteBom = () => {
    if (!activeBom) return;
    requestConfirm({
      title: 'حذف درخت محصول',
      message: `آیا از حذف کامل درخت محصول ${activeBom.assemblyPartCode} - ${activeBom.assemblyPartName} اطمینان دارید؟`,
      confirmLabel: 'تایید و حذف',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/production/boms/${activeBom.id}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.success) {
            const remaining = boms.filter(b => b.id !== activeBom.id);
            setBoms(remaining);
            if (remaining.length > 0) setSelectedBomId(remaining[0].id);
            else setSelectedBomId('');
            showUndoToast({ title: 'درخت محصول حذف شد.', variant: 'info' });
          } else {
            showUndoToast({ title: data.error || 'خطا در حذف BOM', variant: 'danger' });
          }
        } catch {
          showUndoToast({ title: 'خطا در حذف BOM', variant: 'danger' });
        }
      },
    });
  };

  // Open Add Component Modal
  // Open Add Component Modal
  const handleOpenAddComponent = (parentId?: string) => {
    setEditingCompId(null);
    setCompParentId(parentId || '');
    setCompPartId('');
    setCompPartCode('');
    setCompPartName('');
    setCompType('RAW_SHEET');
    setCompQty(1);
    setCompUnit('PCS');
    setCompGross(1.0);
    setCompNet(0.85);
    setCompScrap(15);
    setCompJoining('SPOT_WELD');
    setCompSubMo(true);
    setCompStepJoined(30);
    setCompSupplier('INTERNAL_FABRICATED');
    setIsComponentModalOpen(true);
  };

  // Open Edit Component Modal
  const handleOpenEditComponent = (comp: BomComponentItem) => {
    setEditingCompId(comp.id);
    setCompParentId(comp.parentId || '');
    setCompPartId(comp.componentPartId || comp.componentPartCode);
    setCompPartCode(comp.componentPartCode);
    setCompPartName(comp.componentPartName);
    setCompType(comp.componentType);
    setCompQty(comp.quantityPerAssembly);
    setCompUnit((comp.unit as any) || 'PCS');
    setCompGross(comp.grossWeightKg);
    setCompNet(comp.netWeightKg);
    setCompScrap(comp.scrapAllowancePercent);
    setCompJoining(comp.joiningProcess || 'SPOT_WELD');
    setCompSubMo(comp.subMoRequired ?? true);
    setCompStepJoined(comp.stageJoinedStepNumber || 30);
    setCompSupplier(comp.supplierSource || 'INTERNAL_FABRICATED');
    setIsComponentModalOpen(true);
  };

  // Delete Component from BOM
  const handleDeleteComponent = (compId: string) => {
    if (!activeBom) return;
    requestConfirm({
      title: 'حذف جزء از درخت محصول',
      message: 'آیا از حذف این جزء از درخت محصول مطمئن هستید؟',
      confirmLabel: 'حذف جزء',
      variant: 'danger',
      onConfirm: async () => {
        const updatedComponents = activeBom.components.filter(c => c.id !== compId && c.parentId !== compId);
        const totalGross = updatedComponents.reduce((s, c) => s + (c.grossWeightKg || 0), 0);
        const totalNet = updatedComponents.reduce((s, c) => s + (c.netWeightKg || 0), 0);

        const updatedBom: AdvancedBomDefinition = {
          ...activeBom,
          components: updatedComponents,
          totalGrossWeightKg: Math.round(totalGross * 1000) / 1000,
          totalNetWeightKg: Math.round(totalNet * 1000) / 1000,
          yieldEfficiencyPercent: totalGross > 0 ? Math.round((totalNet / totalGross) * 1000) / 10 : 85,
        };

        try {
          const res = await fetch('/api/production/boms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedBom),
          });
          const data = await res.json();
          if (data.success) {
            await loadBoms();
            showUndoToast({ title: 'جزء از درخت محصول حذف شد.', variant: 'info' });
          }
        } catch {
          showUndoToast({ title: 'خطا در حذف جزء', variant: 'danger' });
        }
      },
    });
  };

  // Save Component (Add or Edit)
  const handleSaveComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBom) return;

    const parentItem = compParentId
      ? activeBom.components.find(c => c.id === compParentId || c.componentPartCode === compParentId)
      : undefined;

    const compData: BomComponentItem = {
      id: editingCompId || `CMP-${Date.now()}`,
      bomId: activeBom.id,
      parentId: parentItem?.id,
      parentCode: parentItem?.componentPartCode,
      parentName: parentItem?.componentPartName,
      level: parentItem ? (parentItem.level || 1) + 1 : 1,
      isSubAssembly: false,
      componentPartId: compPartId || compPartCode,
      componentPartCode: compPartCode,
      componentPartName: compPartName || 'جزء مجموعه',
      componentType: compType,
      quantityPerAssembly: Number(compQty),
      unit: compUnit,
      grossWeightKg: Number(compGross),
      netWeightKg: Number(compNet),
      scrapAllowancePercent: Number(compScrap),
      joiningProcess: compJoining,
      subMoRequired: compSubMo,
      stageJoinedStepNumber: Number(compStepJoined),
      supplierSource: compSupplier,
    };

    let updatedComponents: BomComponentItem[] = activeBom.components.map(c => {
      if (c.id === editingCompId) return compData;
      if (parentItem && (c.id === parentItem.id || c.componentPartCode === parentItem.componentPartCode)) {
        return { ...c, isSubAssembly: true };
      }
      return c;
    });

    if (!editingCompId) {
      updatedComponents.push(compData);
      if (parentItem) {
        updatedComponents = updatedComponents.map(c => {
          if (c.id === parentItem.id) return { ...c, isSubAssembly: true };
          return c;
        });
      }
    }

    const totalGross = updatedComponents.reduce((s, c) => s + (c.grossWeightKg || 0), 0);
    const totalNet = updatedComponents.reduce((s, c) => s + (c.netWeightKg || 0), 0);

    const updatedBom: AdvancedBomDefinition = {
      ...activeBom,
      components: updatedComponents,
      totalGrossWeightKg: Math.round(totalGross * 1000) / 1000,
      totalNetWeightKg: Math.round(totalNet * 1000) / 1000,
      yieldEfficiencyPercent: totalGross > 0 ? Math.round((totalNet / totalGross) * 1000) / 10 : 85,
    };

    try {
      const res = await fetch('/api/production/boms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedBom),
      });
      const data = await res.json();
      if (data.success) {
        await loadBoms();
        setIsComponentModalOpen(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Generate Sub-MOs
  const handleGenerateSubMos = async () => {
    if (!activeBom) return;
    setIsGeneratingSubMos(true);
    try {
      const res = await fetch('/api/production/boms/generate-sub-mos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bomId: activeBom.id,
          plannedQty,
          masterMoNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'خطا در صدور دستورهای ساخت فرعی');
      }
      setGeneratedSubMos(data.data);
      setSubMoModalOpen(true);
    } catch (err: any) {
      showUndoToast({ title: err.message || 'خطای سرور', variant: 'danger' });
    } finally {
      setIsGeneratingSubMos(false);
    }
  };

  return (
    <div className="space-y-4 font-sans text-right">
      {/* SAP Fiori Header Banner */}
      <div className="sap-card p-4 text-[#333333] space-y-3">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-sm bg-[#e5f3fa] border border-[#b3ddf2] text-[#007cc0] flex items-center justify-center shrink-0">
              <ListTree className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-[#333333]">
                  مدیریت درخت محصول چندسطحی (Multi-Level BOM &amp; Assemblies)
                </h2>
                <span className="text-[11px] bg-[#ebf7ef] text-[#107e3e] border border-[#a9dfbf] px-2 py-0.5 rounded-sm font-mono font-bold">
                  مهندسی پرسکاری و مونتاژ
                </span>
              </div>
              <p className="text-xs text-[#666666] mt-0.5">
                تعریف ساختار قطعات ترکیبی خودرویی، ورق‌های مختلف، مهره‌های جوشی و صدور دستورات ساخت فرعی کارگاهی
              </p>
            </div>
          </div>

          {/* Action Controls */}
          <div className="flex flex-wrap items-center gap-2 self-end lg:self-auto">
            <button
              type="button"
              onClick={() => setIsNewBomModalOpen(true)}
              className="sap-btn-emphasized flex items-center gap-1.5 px-3 py-1.5 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>تعریف BOM جدید برای محصول</span>
            </button>

            {onNavigateToParallelFlow && (
              <button
                type="button"
                onClick={onNavigateToParallelFlow}
                className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs"
              >
                <GitFork className="w-3.5 h-3.5 text-[#007cc0]" />
                <span>منطق قالب‌های مشترک و قرینه چپ/راست</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsGuideOpen(true)}
              className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs"
            >
              <HelpCircle className="w-3.5 h-3.5 text-[#666666]" />
              <span>راهنمای تفاوت کاتالوگ و BOM</span>
            </button>
          </div>
        </div>

        {/* BOM Selector Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#e8e8e8] text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[#666666] font-medium">انتخاب درخت محصول جاری:</span>
            <select
              value={selectedBomId}
              onChange={e => setSelectedBomId(e.target.value)}
              className="bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333] font-bold focus:outline-none focus:border-[#007cc0] cursor-pointer"
            >
              {boms.map(b => (
                <option key={b.id} value={b.id}>
                  [{b.assemblyPartCode}] {b.assemblyPartName} — نسخه {b.version} ({b.carModel})
                </option>
              ))}
            </select>
          </div>

          <div className="text-[11px] text-[#666666]">
            تعداد BOMهای فعال: <strong>{toPersianDigits(boms.length)}</strong>
          </div>
        </div>
      </div>

      {activeBom && (
        <div className="sap-card p-4 space-y-4">
          {/* Active BOM Summary Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-3 border-b border-[#e8e8e8]">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => traceDocument(activeBom.assemblyPartCode, 'INVENTORY_LEDGER')}
                  className="text-xs px-2 py-0.5 rounded-sm bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] font-mono font-bold hover:underline cursor-pointer"
                  title="رهگیری در کاردکس انبار"
                >
                  {activeBom.assemblyPartCode}
                </button>
                <span className="text-xs px-2 py-0.5 rounded-sm bg-[#fff4e5] text-[#e9730c] border border-[#f9d6a7] font-bold">
                  نسخه {activeBom.version}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-sm bg-[#f5f5f5] text-[#333333] border border-[#d9d9d9] font-medium">
                  مدل خودرو: <strong>{activeBom.carModel}</strong>
                </span>
                <span className="text-xs text-[#666666]">
                  تاریخ اعتبار: <span className="font-mono">{toPersianDigits(activeBom.effectiveDate || '۱۴۰۳/۰۸')}</span>
                </span>
              </div>
              <h3 className="text-base font-bold text-[#333333] mt-2">
                {activeBom.assemblyPartName}
              </h3>
              {activeBom.notes && (
                <p className="text-xs text-[#666666] mt-1 leading-relaxed">
                  توضیحات مهندسی: {activeBom.notes}
                </p>
              )}
            </div>

            {/* Action Buttons for Active BOM */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleOpenAddComponent()}
                className="sap-btn-emphasized px-3 py-1.5 text-xs flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>افزودن جزء / ورق / اتصال به BOM</span>
              </button>

              <button
                type="button"
                onClick={handleOpenEditBom}
                className="sap-btn-standard px-3 py-1.5 text-xs flex items-center gap-1"
                title="ویرایش نسخه و توضیحات BOM"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>ویرایش سند</span>
              </button>

              <button
                type="button"
                onClick={handleDeleteBom}
                className="p-1.5 text-[#bb0000] hover:bg-[#ffecec] rounded-sm transition cursor-pointer border border-[#f5b7b1]"
                title="حذف کامل این BOM"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleGenerateSubMos}
                disabled={isGeneratingSubMos}
                className="sap-btn-standard px-3 py-1.5 text-xs flex items-center gap-1 text-[#007cc0] border-[#b3ddf2] disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#007cc0]" />
                <span>صدور دستورات ساخت فرعی (Sub-MO)</span>
              </button>
            </div>
          </div>

          {/* Key Engineering Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-[#f7f7f7] border border-[#d9d9d9] rounded-sm">
              <span className="text-[11px] text-[#666666] block">وزن ناخالص ورق مصرفی:</span>
              <span className="text-base font-bold text-[#333333] font-mono tabular-nums">
                {toPersianDigits(activeBom.totalGrossWeightKg)} <span className="text-xs font-normal">کیلوگرم</span>
              </span>
              <span className="text-[10px] text-[#666666] block mt-0.5">شامل پرت بلنکینگ</span>
            </div>

            <div className="p-3 bg-[#f7f7f7] border border-[#d9d9d9] rounded-sm">
              <span className="text-[11px] text-[#666666] block">وزن خالص مجموعه نهایی:</span>
              <span className="text-base font-bold text-[#107e3e] font-mono tabular-nums">
                {toPersianDigits(activeBom.totalNetWeightKg)} <span className="text-xs font-normal">کیلوگرم</span>
              </span>
              <span className="text-[10px] text-[#666666] block mt-0.5">وزن تحویلی به خودروساز</span>
            </div>

            <div className="p-3 bg-[#f7f7f7] border border-[#d9d9d9] rounded-sm">
              <span className="text-[11px] text-[#666666] block">راندمان مصرف ورق (Yield):</span>
              <span className="text-base font-bold text-[#e9730c] font-mono tabular-nums">
                {toPersianDigits(activeBom.yieldEfficiencyPercent)}%
              </span>
              <span className="text-[10px] text-[#666666] block mt-0.5">
                نرخ پرت استاندارد: {toPersianDigits(Math.round((100 - activeBom.yieldEfficiencyPercent) * 10) / 10)}%
              </span>
            </div>

            <div className="p-3 bg-[#f7f7f7] border border-[#d9d9d9] rounded-sm">
              <span className="text-[11px] text-[#666666] block">دستورهای ساخت فرعی وابسته:</span>
              <span className="text-base font-bold text-[#007cc0] font-mono tabular-nums">
                {toPersianDigits(activeBom.components.filter(c => c.subMoRequired).length)} <span className="text-xs font-normal">کارت کارگاهی</span>
              </span>
              <span className="text-[10px] text-[#666666] block mt-0.5">تولید موازی در سالن‌ها</span>
            </div>
          </div>

          {/* Components Breakdown Table */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[#333333] flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-[#007cc0]" />
                <span>اجزای متشکله درخت محصول و ضرایب مصرف تفکیکی (Component Breakdown):</span>
              </h4>
              <span className="text-[11px] text-[#666666]">
                {toPersianDigits(activeBom.components.length)} جزء و قطعه متصل
              </span>
            </div>

            <div className="overflow-x-auto border border-[#d9d9d9] rounded-sm">
              <table className="sap-table-compact w-full text-right text-xs">
                <thead>
                  <tr>
                    <th>نوع جزء</th>
                    <th>کد و شرح قطعه / ورق / اتصال</th>
                    <th className="text-center">ضریب مصرف</th>
                    <th>وزن خالص / ناخالص</th>
                    <th className="text-center">درصد ضایعات</th>
                    <th>مرحله و روش اتصال</th>
                    <th>دستور ساخت فرعی؟</th>
                    <th>تأمین‌کننده</th>
                    <th className="text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e8e8] text-[#333333]">
                  {activeBom.components.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-[#666666]">
                        هنوز جزئی به این درخت محصول اضافه نشده است. برای اضافه کردن ورق، پیچ یا قطعات نیمه‌ساخته روی «افزودن جزء جدید» کلیک کنید.
                      </td>
                    </tr>
                  ) : (
                    activeBom.components.map((comp, idx) => (
                      <tr key={comp.id || idx} className="hover:bg-[#f5f5f5] transition-colors">
                        {/* Type Badge */}
                        <td className="whitespace-nowrap">
                          {comp.componentType === 'RAW_SHEET' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-bold bg-[#fff4e5] text-[#e9730c] border border-[#f9d6a7]">
                              <Disc className="w-3 h-3 text-[#e9730c]" />
                              <span>ورق خام اولیه</span>
                            </span>
                          )}
                          {comp.componentType === 'FASTENER_HARDWARE' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-bold bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2]">
                              <Wrench className="w-3 h-3 text-[#007cc0]" />
                              <span>پیچ / مهره جوشی</span>
                            </span>
                          )}
                          {comp.componentType === 'RUBBER_SEAL' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-bold bg-[#f5f5f5] text-[#333333] border border-[#d9d9d9]">
                              <Boxes className="w-3 h-3 text-[#666666]" />
                              <span>لاستیک / دمپر</span>
                            </span>
                          )}
                          {comp.componentType === 'WIP_SUB_PART' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-bold bg-[#ebf7ef] text-[#107e3e] border border-[#a9dfbf]">
                              <Layers className="w-3 h-3 text-[#107e3e]" />
                              <span>نیمه‌ساخته پرسی</span>
                            </span>
                          )}
                        </td>

                        {/* Code & Name with Hierarchy Level Indentation */}
                        <td>
                          <div className={`flex items-center gap-1.5 ${comp.level && comp.level > 1 ? 'pr-3 border-r-2 border-[#007cc0]' : ''}`}>
                            {comp.level && comp.level > 1 && (
                              <span className="text-[10px] font-bold text-[#007cc0] bg-[#e5f3fa] px-1.5 py-0.5 rounded-sm border border-[#b3ddf2] shrink-0">
                                ↳ سطح {toPersianDigits(comp.level)}
                              </span>
                            )}
                            <div>
                              <button
                                type="button"
                                onClick={() => traceDocument(comp.componentPartCode, 'INVENTORY_LEDGER')}
                                className="sap-doc-link font-mono font-bold block text-xs"
                                title="رهگیری این قطعه در کاردکس انبار"
                              >
                                {comp.componentPartCode}
                              </button>
                              <span className="text-[11px] text-[#333333] block mt-0.5">
                                {comp.componentPartName}
                              </span>
                              {comp.parentCode && (
                                <span className="text-[10px] font-semibold text-[#e9730c] block mt-0.5">
                                  متصل به زیرمجموعه: {comp.parentCode} ({comp.parentName})
                                </span>
                              )}
                              {comp.notes && (
                                <span className="text-[10px] text-[#666666] block mt-0.5">
                                  {comp.notes}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Quantity */}
                        <td className="whitespace-nowrap text-center tabular-nums">
                          <span className="font-bold text-[#333333] font-mono text-xs">
                            {toPersianDigits(comp.quantityPerAssembly)}
                          </span>{' '}
                          <span className="text-[11px] text-[#666666]">
                            {comp.unit === 'PCS' ? 'عدد' : comp.unit === 'KG' ? 'کیلوگرم' : 'ست'}
                          </span>
                        </td>

                        {/* Weights */}
                        <td className="whitespace-nowrap text-[11px] tabular-nums">
                          <div>خالص: <strong className="font-mono text-[#333333]">{toPersianDigits(comp.netWeightKg)} kg</strong></div>
                          <div className="text-[#666666]">ناخالص: <span className="font-mono">{toPersianDigits(comp.grossWeightKg)} kg</span></div>
                        </td>

                        {/* Scrap % */}
                        <td className="whitespace-nowrap text-center tabular-nums">
                          {comp.scrapAllowancePercent > 0 ? (
                            <span className="text-[11px] font-bold text-[#e9730c] font-mono bg-[#fff4e5] px-1.5 py-0.5 rounded-sm border border-[#f9d6a7]">
                              {toPersianDigits(comp.scrapAllowancePercent)}%
                            </span>
                          ) : (
                            <span className="text-[11px] text-[#666666] font-mono">۰%</span>
                          )}
                        </td>

                        {/* Joining Operation */}
                        <td className="whitespace-nowrap text-[11px]">
                          <span className="font-bold text-[#333333] block">
                            مرحله {toPersianDigits(comp.stageJoinedStepNumber || 30)}
                          </span>
                          <span className="text-[10px] text-[#666666] block">
                            {comp.joiningProcess === 'SPOT_WELD' && 'پرس‌جوش مقاومتی'}
                            {comp.joiningProcess === 'CO2_WELD' && 'جوش تحت گاز CO2'}
                            {comp.joiningProcess === 'FASTENING' && 'بستن پیچ با ترک‌رنچ'}
                            {comp.joiningProcess === 'HEMMING' && 'همبربندی هیدرولیک'}
                            {comp.joiningProcess === 'PRESS_FIT' && 'جا زدن فشاری بوش'}
                          </span>
                        </td>

                        {/* Sub-MO Required */}
                        <td className="whitespace-nowrap">
                          {comp.subMoRequired ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-bold bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2]">
                              <CheckCircle2 className="w-3 h-3 text-[#007cc0]" />
                              <span>دستور ساخت مجزا</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-[#666666]">تغذیه مستقیم خط</span>
                          )}
                        </td>

                        {/* Supplier */}
                        <td className="whitespace-nowrap text-[11px] text-[#666666]">
                          {comp.supplierSource === 'SAPCO_CONSIGNMENT' && 'امانی ساپکو'}
                          {comp.supplierSource === 'INTERNAL_FABRICATED' && 'تولید داخل کارخانه'}
                          {comp.supplierSource === 'PURCHASED_MARKET' && 'خرید بازار'}
                        </td>

                        {/* Actions: Edit, Sub-Component & Delete */}
                        <td className="text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenAddComponent(comp.id)}
                              className="px-2 py-0.5 bg-[#fff4e5] hover:bg-[#ffe8c7] text-[#e9730c] border border-[#f9d6a7] rounded-sm text-[10px] font-bold transition cursor-pointer flex items-center gap-0.5"
                              title="افزودن جزء متشکله فرعی زیر این قطعه"
                            >
                              <Plus className="w-3 h-3 text-[#e9730c]" />
                              <span>زیر‌جزء</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenEditComponent(comp)}
                              className="p-1 text-[#666666] hover:text-[#333333] hover:bg-[#f0f0f0] rounded-sm transition cursor-pointer"
                              title="ویرایش مشخصات این جزء"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteComponent(comp.id)}
                              className="p-1 text-[#bb0000] hover:bg-[#ffecec] rounded-sm transition cursor-pointer"
                              title="حذف این جزء از درخت محصول"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            {onOpenTraceabilityModal && (
                              <button
                                type="button"
                                onClick={() => onOpenTraceabilityModal(comp.componentPartCode)}
                                title="صدور کارت رهگیری و بچ برای این جزء"
                                className="p-1 text-[#007cc0] hover:bg-[#e5f3fa] rounded-sm transition cursor-pointer"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: Create New BOM */}
      {isNewBomModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#333333]/40 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-[#d9d9d9] rounded-sm max-w-lg w-full p-5 shadow-md space-y-4 text-right">
            <div className="flex items-center justify-between pb-3 border-b border-[#e8e8e8]">
              <h3 className="font-bold text-sm text-[#333333] flex items-center gap-2">
                <ListTree className="w-4 h-4 text-[#007cc0]" />
                <span>تعریف درخت محصول جدید (New BOM)</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsNewBomModalOpen(false)}
                className="text-[#666666] hover:text-[#333333] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNewBom} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-[#333333] mb-1">
                  انتخاب محصول نهایی یا مجموعه از کاتالوگ قطعات *
                </label>
                <SearchableSelect
                  value={newBomPartId}
                  onChange={val => {
                    setNewBomPartId(val);
                    const p = parts.find(item => item.id === val);
                    if (p && p.carModel) setNewBomCarModel(p.carModel);
                  }}
                  placeholder="انتخاب قطعه برای ایجاد درخت محصول..."
                  searchPlaceholder="جستجوی کد یا نام قطعه..."
                  options={parts.map(p => ({
                    value: p.id,
                    label: p.name,
                    sublabel: `${p.code} • ${p.carModel || 'مشترک'}`,
                    badge: p.category === 'FINISHED_GOOD' ? 'محصول نهایی' : p.category === 'WIP_PART' ? 'نیمه‌ساخته' : 'ماده اولیه',
                  }))}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#333333] mb-1">نسخه مهندسی BOM *</label>
                  <input
                    type="text"
                    required
                    value={newBomVersion}
                    onChange={e => setNewBomVersion(e.target.value)}
                    placeholder="V1.0 یا V2.0"
                    className="w-full bg-white border border-[#bfbfbf] rounded px-3 py-2 font-mono text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#333333] mb-1">مدل خودرو / خانواده محصول</label>
                  <input
                    type="text"
                    value={newBomCarModel}
                    onChange={e => setNewBomCarModel(e.target.value)}
                    placeholder="مثال: تارا، پژو ۲۰۶، دنا پلاس"
                    className="w-full bg-white border border-[#bfbfbf] rounded px-3 py-2 text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#333333] mb-1">توضیحات و الزامات فنی مونتاژ</label>
                <textarea
                  rows={2}
                  value={newBomNotes}
                  onChange={e => setNewBomNotes(e.target.value)}
                  placeholder="نکات جوشکاری مقاومتی، تست‌های گشتاور و استانداردهای ساپکو..."
                  className="w-full bg-white border border-[#bfbfbf] rounded p-2.5 text-[#333333] focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#e8e8e8]">
                <button
                  type="button"
                  onClick={() => setIsNewBomModalOpen(false)}
                  className="sap-btn-standard px-4 py-1.5 text-xs"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="sap-btn-emphasized px-5 py-1.5 text-xs"
                >
                  ایجاد درخت محصول
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Edit Active BOM */}
      {isEditBomModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#333333]/40 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-[#d9d9d9] rounded-sm max-w-md w-full p-5 shadow-md space-y-4 text-right">
            <div className="flex items-center justify-between pb-3 border-b border-[#e8e8e8]">
              <h3 className="font-bold text-sm text-[#333333]">ویرایش مشخصات سند درخت محصول</h3>
              <button
                type="button"
                onClick={() => setIsEditBomModalOpen(false)}
                className="text-[#666666] hover:text-[#333333] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditBom} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-[#333333] mb-1">نسخه مهندسی BOM</label>
                <input
                  type="text"
                  required
                  value={editBomVersion}
                  onChange={e => setEditBomVersion(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 font-mono text-[#333333] focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#333333] mb-1">مدل خودرو</label>
                <input
                  type="text"
                  value={editBomCarModel}
                  onChange={e => setEditBomCarModel(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-[#333333] focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#333333] mb-1">توضیحات مهندسی</label>
                <textarea
                  rows={3}
                  value={editBomNotes}
                  onChange={e => setEditBomNotes(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm p-2 text-[#333333] focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#e8e8e8]">
                <button
                  type="button"
                  onClick={() => setIsEditBomModalOpen(false)}
                  className="sap-btn-standard px-4 py-1.5 text-xs"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="sap-btn-emphasized px-5 py-1.5 text-xs"
                >
                  ثبت تغییرات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Add / Edit Component Modal */}
      {isComponentModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#333333]/40 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-[#d9d9d9] rounded-sm max-w-xl w-full p-5 shadow-md space-y-4 text-right max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#e8e8e8]">
              <h3 className="font-bold text-sm text-[#333333]">
                {editingCompId ? 'ویرایش جزء متشکله درخت محصول' : `افزودن جزء جدید به BOM [${activeBom?.assemblyPartCode}]`}
              </h3>
              <button
                type="button"
                onClick={() => setIsComponentModalOpen(false)}
                className="text-[#666666] hover:text-[#333333] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveComponent} className="space-y-3 text-xs">
              {/* Parent Component Selection for Multi-Level Tree */}
              <div className="p-3 bg-[#f7f7f7] border border-[#d9d9d9] rounded-sm space-y-1">
                <label className="block font-bold text-[#333333] mb-1">
                  موقعیت اتکا در درخت محصول (قطعه والد):
                </label>
                <select
                  value={compParentId}
                  onChange={e => setCompParentId(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-[#333333] font-semibold focus:outline-none focus:border-[#007cc0] cursor-pointer"
                >
                  <option value="">
                    مستقیماً متصل به مجموعه اصلی [{activeBom?.assemblyPartCode}] (سطح ۱)
                  </option>
                  {activeBom?.components
                    .filter(c => c.id !== editingCompId)
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        ↳ زیرمجموعه: [{c.componentPartCode}] {c.componentPartName} (سطح {(c.level || 1) + 1})
                      </option>
                    ))}
                </select>
                <span className="text-[10px] text-[#666666] block pt-0.5">
                  برای ایجاد ساختار چندسطحی (مانند متصل کردن صفحه اصلی یا مکمل به مجموعه و سپس اتصال پیچ/مهره به آن) قطعه والد را انتخاب کنید.
                </span>
              </div>

              <div>
                <label className="block font-medium text-[#333333] mb-1">
                  انتخاب جزء از کاتالوگ قطعات یا مواد اولیه *
                </label>
                <SearchableSelect
                  value={compPartId}
                  onChange={val => {
                    setCompPartId(val);
                    const found = parts.find(p => p.id === val || p.code === val);
                    if (found) {
                      setCompPartCode(found.code);
                      setCompPartName(found.name);
                      if (found.category === 'RAW_MATERIAL') setCompType('RAW_SHEET');
                      else if (found.category === 'WIP_PART') setCompType('WIP_SUB_PART');
                      setCompNet(found.weightPerUnitKg || 0.5);
                      setCompGross(Math.round((found.weightPerUnitKg || 0.5) * 1.15 * 100) / 100);
                    }
                  }}
                  placeholder="جستجو و انتخاب کالا / ورق / اتصال..."
                  searchPlaceholder="جستجوی کد یا نام جزء..."
                  options={parts.map(p => ({
                    value: p.code,
                    label: p.name,
                    sublabel: `${p.code} • ${p.weightPerUnitKg || 0}kg`,
                    badge: p.category === 'RAW_MATERIAL' ? 'ماده اولیه' : p.category === 'WIP_PART' ? 'نیمه‌ساخته' : 'محصول',
                  }))}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#333333] mb-1">کد جزء *</label>
                  <input
                    type="text"
                    required
                    value={compPartCode}
                    onChange={e => setCompPartCode(e.target.value)}
                    placeholder="مثال: SHT-ST14-1.2 یا NUT-M8"
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 font-mono text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#333333] mb-1">دسته‌بندی نوع جزء *</label>
                  <select
                    value={compType}
                    onChange={e => setCompType(e.target.value as any)}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  >
                    <option value="RAW_SHEET">ورق خام اولیه (کویل/شیت)</option>
                    <option value="WIP_SUB_PART">قطعه نیمه‌ساخته پرسی</option>
                    <option value="FASTENER_HARDWARE">پیچ / مهره جوشی / خار</option>
                    <option value="RUBBER_SEAL">بوش / دمپر لاستیکی</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#333333] mb-1">نام کامل مهندسی جزء *</label>
                <input
                  type="text"
                  required
                  value={compPartName}
                  onChange={e => setCompPartName(e.target.value)}
                  placeholder="شرح دقیق جزء متشکله"
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-[#333333] focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-[#333333] mb-1">ضریب مصرف (تعداد) *</label>
                  <input
                    type="number"
                    step="any"
                    min={0.001}
                    required
                    value={compQty}
                    onChange={e => setCompQty(Number(e.target.value))}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 font-mono font-bold text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#333333] mb-1">واحد سنجش</label>
                  <select
                    value={compUnit}
                    onChange={e => setCompUnit(e.target.value as any)}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  >
                    <option value="PCS">عدد (PCS)</option>
                    <option value="KG">کیلوگرم (KG)</option>
                    <option value="SET">ست (SET)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#333333] mb-1">روش اتصال در خط</label>
                  <select
                    value={compJoining}
                    onChange={e => setCompJoining(e.target.value as any)}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  >
                    <option value="SPOT_WELD">پرس‌جوش مقاومتی</option>
                    <option value="CO2_WELD">جوش تحت گاز CO2</option>
                    <option value="FASTENING">پیچ و مهره‌کاری</option>
                    <option value="HEMMING">همبربندی هیدرولیک</option>
                    <option value="PRESS_FIT">جا زدن فشاری بوش</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-[#333333] mb-1">وزن خالص (kg)</label>
                  <input
                    type="number"
                    step="any"
                    value={compNet}
                    onChange={e => setCompNet(Number(e.target.value))}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 font-mono text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#333333] mb-1">وزن ناخالص (kg)</label>
                  <input
                    type="number"
                    step="any"
                    value={compGross}
                    onChange={e => setCompGross(Number(e.target.value))}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 font-mono text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#333333] mb-1">درصد ضایعات (%)</label>
                  <input
                    type="number"
                    step="any"
                    value={compScrap}
                    onChange={e => setCompScrap(Number(e.target.value))}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 font-mono text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#333333] mb-1">مرحله اتصال (شماره گام)</label>
                  <input
                    type="number"
                    step={10}
                    value={compStepJoined}
                    onChange={e => setCompStepJoined(Number(e.target.value))}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 font-mono text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#333333] mb-1">منبع تأمین</label>
                  <select
                    value={compSupplier}
                    onChange={e => setCompSupplier(e.target.value as any)}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  >
                    <option value="INTERNAL_FABRICATED">تولید داخل کارخانه</option>
                    <option value="SAPCO_CONSIGNMENT">امانی ساپکو</option>
                    <option value="PURCHASED_MARKET">خرید از بازار</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="subMoCheck"
                  checked={compSubMo}
                  onChange={e => setCompSubMo(e.target.checked)}
                  className="rounded-sm text-[#007cc0] focus:ring-[#007cc0] w-4 h-4"
                />
                <label htmlFor="subMoCheck" className="text-xs text-[#333333] cursor-pointer font-medium">
                  نیاز به صدور دستور ساخت فرعی مجزا (Sub-MO) در سالن پرس دارد
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#e8e8e8]">
                <button
                  type="button"
                  onClick={() => setIsComponentModalOpen(false)}
                  className="sap-btn-standard px-4 py-1.5 text-xs"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="sap-btn-emphasized px-5 py-1.5 text-xs"
                >
                  {editingCompId ? 'ثبت تغییرات جزء' : 'افزودن به درخت محصول'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generated Sub-MOs Modal */}
      {subMoModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#333333]/40 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-[#d9d9d9] rounded-sm max-w-2xl w-full p-5 shadow-md space-y-4 text-right">
            <div className="flex items-center justify-between pb-3 border-b border-[#e8e8e8]">
              <div className="flex items-center gap-2 text-[#107e3e] font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-[#107e3e]" />
                <span>دستورات ساخت فرعی با موفقیت در سیستم تولید صادر گردیدند</span>
              </div>
              <button
                type="button"
                onClick={() => setSubMoModalOpen(false)}
                className="text-[#666666] hover:text-[#333333] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#666666] leading-relaxed">
              بر اساس تیراژ مصوب <strong>{toPersianDigits(plannedQty)} عدد</strong> از مجموعه {activeBom?.assemblyPartName}، دستورهای ساخت قطعات زیر برای ایستگاه‌های پرس و برش فعال شدند:
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto divide-y divide-[#e8e8e8]">
              {generatedSubMos.map((sub, i) => (
                <div key={i} className="flex items-center justify-between py-2 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setSubMoModalOpen(false);
                        traceDocument(sub.subMoNumber, 'WIP_TRACEABILITY');
                      }}
                      className="sap-doc-link font-bold font-mono"
                    >
                      {sub.subMoNumber}
                    </button>
                    <span className="text-[#333333] font-medium">{sub.componentPartName}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSubMoModalOpen(false);
                        traceDocument(sub.componentPartCode, 'INVENTORY_LEDGER');
                      }}
                      className="sap-doc-link text-[11px] font-mono"
                    >
                      ({sub.componentPartCode})
                    </button>
                  </div>
                  <div className="font-mono font-bold text-[#333333] tabular-nums">
                    {toPersianDigits(sub.requiredQty)} {sub.unit === 'PCS' ? 'عدد' : 'kg'}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-3 border-t border-[#e8e8e8]">
              <button
                type="button"
                onClick={() => setSubMoModalOpen(false)}
                className="sap-btn-emphasized px-5 py-1.5 text-xs"
              >
                تایید و بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guide Modal */}
      <MasterDataDifferenceGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />
    </div>
  );
};
