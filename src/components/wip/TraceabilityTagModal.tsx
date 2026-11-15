import React, { useState, useEffect } from 'react';
import {
  Tag,
  QrCode,
  Printer,
  X,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Clock,
  Layers,
  Cpu,
  User,
  ShieldCheck,
  Disc,
  Boxes,
  Sparkles,
} from 'lucide-react';
import { Part, Machine, DieMold, Operator } from '../../types/inventory';
import { TraceabilityTagData } from '../../types/bomAndParallelFlow';
import { toPersianDigits } from '../../utils/formatters';

interface TraceabilityTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  parts: Part[];
  machines: Machine[];
  dies?: DieMold[];
  operators?: Operator[];
  initialPartCode?: string;
  initialMoNumber?: string;
}

export const TraceabilityTagModal: React.FC<TraceabilityTagModalProps> = ({
  isOpen,
  onClose,
  parts,
  machines,
  dies = [],
  operators = [],
  initialPartCode,
  initialMoNumber,
}) => {
  const [selectedPartCode, setSelectedPartCode] = useState(initialPartCode || parts[0]?.code || '');
  const [moNumber, setMoNumber] = useState(initialMoNumber || `MO-1403-1082`);
  const [stepNumber, setStepNumber] = useState(20);
  const [stepCode, setStepCode] = useState('OP20_FORM');
  const [stepName, setStepName] = useState('کشش عمیق و فرم‌دهی پوسته');
  const [machineCode, setMachineCode] = useState(machines[0]?.code || 'PRS-800-01');
  const [dieMoldCode, setDieMoldCode] = useState(dies[0]?.code || 'DIE-206-SEC-OP20');
  const [shift, setShift] = useState<'MORNING' | 'EVENING' | 'NIGHT'>('MORNING');
  const [operatorName, setOperatorName] = useState(operators[0]?.fullName || 'علی رضایی (کد ۴۱۰۲)');
  const [supervisorName, setSupervisorName] = useState('مهندس حسینی (سرپرست خط)');
  const [sourceCoilPack, setSourceCoilPack] = useState('CP-1002 / COIL-ST14-1.5');
  const [heatNumber, setHeatNumber] = useState('HEAT-7712-MOB');
  const [quantity, setQuantity] = useState(250);
  const [qualityStatus, setQualityStatus] = useState<'APPROVED' | 'IN_INSPECTION' | 'QUARANTINE'>('APPROVED');
  const [notes, setNotes] = useState('کنترل چشمی و گیج CMM انجام شد. بدون پلیسه و ترک.');

  const [generatedTag, setGeneratedTag] = useState<TraceabilityTagData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedPart = parts.find(p => p.code === selectedPartCode) || parts[0];

  useEffect(() => {
    if (initialPartCode) setSelectedPartCode(initialPartCode);
    if (initialMoNumber) setMoNumber(initialMoNumber);
  }, [initialPartCode, initialMoNumber]);

  if (!isOpen) return null;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/production/traceability/generate-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partCode: selectedPart?.code || selectedPartCode,
          partName: selectedPart?.name || 'قطعه پرسی خودرو',
          carModel: selectedPart?.carModel || 'مشترک',
          manufacturingOrderNumber: moNumber,
          stepNumber,
          stepCode,
          stepName,
          machineCode,
          dieMoldCode,
          shift,
          operatorName,
          supervisorName,
          sourceCoilPackNumber: sourceCoilPack,
          heatNumber,
          quantity: Number(quantity),
          unit: selectedPart?.unit || 'عدد',
          qualityStatus,
          notes,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'خطا در صدور کارت رهگیری');
      }

      setGeneratedTag(data.data);
      setSuccessMsg(`کارت شناسایی سری ساخت ${data.data.lotNumber} با موفقیت صادر گردید.`);
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در ارتباط با سرور');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#333333]/40 flex items-center justify-center p-3 sm:p-5 overflow-y-auto font-sans text-right">
      <div className="bg-[#ffffff] border border-[#d9d9d9] rounded-sm max-w-4xl w-full shadow-md overflow-hidden my-auto">
        {/* Header */}
        <div className="bg-[#ffffff] border-b border-[#d9d9d9] text-[#333333] p-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#e5f3fa] border border-[#b3ddf2] rounded-sm text-[#007cc0]">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold flex items-center gap-2 flex-wrap">
                <span>صدور کارت شناسایی و ردیابی فرآیند (Lot &amp; Batch Tag Generator)</span>
                <span className="text-[11px] bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] px-2 py-0.5 rounded-sm font-mono">
                  استاندارد ساپکو / ایران‌خودرو
                </span>
              </h3>
              <p className="text-xs text-[#666666] mt-0.5">
                تفکیک و کدگذاری سری‌های ساخت، ثبت مشخصات دستگاه و قالب، و صدور لیبل بارکددار پالت و سبد خط تولید
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-sm text-[#666666] hover:text-[#333333] hover:bg-[#f0f0f0] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 bg-[#ffecec] border border-[#f5b7b1] rounded-sm text-xs text-[#bb0000] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#bb0000] shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-[#ebf7ef] border border-[#a9dfbf] rounded-sm text-xs text-[#107e3e] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#107e3e] shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleGenerate} className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
            {/* Part Selection */}
            <div className="space-y-1 md:col-span-2">
              <label className="font-bold text-[#333333]">قطعه خودرویی تحت تولید:</label>
              <select
                value={selectedPartCode}
                onChange={e => setSelectedPartCode(e.target.value)}
                className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
              >
                {parts.map(p => (
                  <option key={p.id} value={p.code}>
                    [{p.code}] {p.name} {p.carModel ? `(${p.carModel})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* MO Number */}
            <div className="space-y-1">
              <label className="font-bold text-[#333333]">شماره دستور ساخت (MO):</label>
              <input
                type="text"
                value={moNumber}
                onChange={e => setMoNumber(e.target.value)}
                className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs font-mono font-bold text-[#333333] focus:outline-none focus:border-[#007cc0]"
                placeholder="MO-1403-1082"
                required
              />
            </div>

            {/* Operation Step */}
            <div className="space-y-1">
              <label className="font-bold text-[#333333]">مرحله و عنوان عملیات:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={stepCode}
                  onChange={e => setStepCode(e.target.value)}
                  className="w-28 bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-2.5 py-1.5 text-xs font-mono font-bold text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  placeholder="OP20_FORM"
                />
                <input
                  type="text"
                  value={stepName}
                  onChange={e => setStepName(e.target.value)}
                  className="flex-1 bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-2.5 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  placeholder="عنوان عملیات"
                />
              </div>
            </div>

            {/* Machine */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">دستگاه / پرس تولیدکننده:</label>
              <select
                value={machineCode}
                onChange={e => setMachineCode(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none"
              >
                {machines.map(m => (
                  <option key={m.id} value={m.code}>
                    [{m.code}] {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Die / Mold */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">قالب / ابزار تولید:</label>
              <input
                type="text"
                value={dieMoldCode}
                onChange={e => setDieMoldCode(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none"
                placeholder="DIE-206-SEC-OP20"
              />
            </div>

            {/* Shift & Quantity */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">شیفت کاری:</label>
              <select
                value={shift}
                onChange={e => setShift(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none"
              >
                <option value="MORNING">شیفت صبح (۰۷:۰۰ الی ۱۵:۳۰)</option>
                <option value="EVENING">شیفت عصر (۱۵:۳۰ الی ۲۳:۳۰)</option>
                <option value="NIGHT">شیفت شب (۲۳:۳۰ الی ۰۷:۰۰)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">تعداد در سبد / پالت:</label>
              <input
                type="number"
                value={quantity}
                onChange={e => setQuantity(Number(e.target.value))}
                min={1}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none"
                required
              />
            </div>

            {/* Source Coil / Heat */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">شماره کلاف / پکینگ ورق:</label>
              <input
                type="text"
                value={sourceCoilPack}
                onChange={e => setSourceCoilPack(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none"
                placeholder="CP-1002 / COIL-ST14-1.5"
              />
            </div>

            {/* Operator & Supervisor */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">اپراتور پرس:</label>
              <input
                type="text"
                value={operatorName}
                onChange={e => setOperatorName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">سرپرست خط / شیفت:</label>
              <input
                type="text"
                value={supervisorName}
                onChange={e => setSupervisorName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none"
              />
            </div>

            {/* Quality Status */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-700">وضعیت کیفی QC:</label>
              <select
                value={qualityStatus}
                onChange={e => setQualityStatus(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none"
              >
                <option value="APPROVED">تایید شده کیفی (QC PASSED)</option>
                <option value="IN_INSPECTION">در انتظار کنترل CMM</option>
                <option value="QUARANTINE">قرنطینه و مشکوک</option>
              </select>
            </div>

            <div className="md:col-span-3 flex justify-end gap-2 pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="sap-btn-emphasized px-5 py-2 text-xs flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>صدور کارت شناسایی سری ساخت</span>
              </button>
            </div>
          </form>

          {/* Printable Label Preview */}
          {generatedTag && (
            <div className="space-y-3 pt-4 border-t border-[#d9d9d9]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#333333] flex items-center gap-1.5">
                  <Printer className="w-4 h-4 text-[#007cc0]" />
                  پیش‌نمایش لیبل فیزیکی سبد / پالت (قابل چاپ مستقیم):
                </span>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="sap-btn-standard px-4 py-1.5 text-xs flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>چاپ کارت ردیابی (Print Tag)</span>
                </button>
              </div>

              {/* Tag Physical Frame */}
              <div
                id="printable-tag"
                className="bg-[#ffffff] border-2 border-[#333333] rounded-sm p-4 space-y-3 font-mono text-[#333333] printable-area"
              >
                {/* Tag Top Header */}
                <div className="flex items-start justify-between border-b-2 border-[#333333] pb-2.5">
                  <div className="text-right">
                    <span className="text-[11px] font-bold text-[#666666] block font-sans">
                      سیستم مدیریت تولید و زنجیره تامین قطعات ساپکو (KPIMS)
                    </span>
                    <h2 className="text-base font-bold text-[#333333] font-sans mt-0.5">
                      کارت شناسایی و رهگیری فرآیند قطعات پای خط
                    </h2>
                    <span className="text-xs font-bold text-[#007cc0]">
                      شماره بچ / لات: {generatedTag.lotNumber}
                    </span>
                  </div>
                  <div className="text-left bg-[#f5f5f5] border border-[#d9d9d9] text-[#333333] px-3 py-1.5 rounded-sm">
                    <span className="text-[10px] block text-[#666666]">شماره کارت رهگیری</span>
                    <span className="text-xs font-bold font-mono">{generatedTag.tagNumber}</span>
                  </div>
                </div>

                {/* Main Table Info */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-sans">
                  <div className="p-2 border border-[#d9d9d9] rounded-sm bg-[#f7f7f7]">
                    <span className="text-[10px] text-[#666666] block">کد فنی قطعه:</span>
                    <span className="font-bold text-[#333333] font-mono text-sm">{generatedTag.partCode}</span>
                  </div>
                  <div className="p-2 border border-[#d9d9d9] rounded-sm bg-[#f7f7f7] col-span-2">
                    <span className="text-[10px] text-[#666666] block">نام قطعه و خودرو:</span>
                    <span className="font-bold text-[#333333]">{generatedTag.partName} ({generatedTag.carModel})</span>
                  </div>
                  <div className="p-2 border border-[#a9dfbf] rounded-sm bg-[#ebf7ef] text-[#107e3e]">
                    <span className="text-[10px] text-[#107e3e] block">تعداد در بسته:</span>
                    <span className="font-bold text-base font-mono">{toPersianDigits(generatedTag.quantity)} {generatedTag.unit}</span>
                  </div>

                  <div className="p-2 border border-[#d9d9d9] rounded-sm">
                    <span className="text-[10px] text-[#666666] block">دستور ساخت (MO):</span>
                    <span className="font-bold font-mono">{generatedTag.manufacturingOrderNumber}</span>
                  </div>
                  <div className="p-2 border border-[#d9d9d9] rounded-sm">
                    <span className="text-[10px] text-[#666666] block">مرحله و ایستگاه:</span>
                    <span className="font-bold font-mono">{generatedTag.stepCode} - {generatedTag.stepName}</span>
                  </div>
                  <div className="p-2 border border-[#d9d9d9] rounded-sm">
                    <span className="text-[10px] text-[#666666] block">دستگاه پرس / قالب:</span>
                    <span className="font-bold font-mono">{generatedTag.machineCode} / {generatedTag.dieMoldCode}</span>
                  </div>
                  <div className="p-2 border border-[#d9d9d9] rounded-sm">
                    <span className="text-[10px] text-[#666666] block">شیفت و تاریخ:</span>
                    <span className="font-bold">{generatedTag.shift === 'MORNING' ? 'صبح' : generatedTag.shift === 'EVENING' ? 'عصر' : 'شب'} - {generatedTag.productionDate}</span>
                  </div>

                  <div className="p-2 border border-[#d9d9d9] rounded-sm">
                    <span className="text-[10px] text-[#666666] block">شماره کلاف ورق:</span>
                    <span className="font-bold font-mono">{generatedTag.sourceCoilPackNumber}</span>
                  </div>
                  <div className="p-2 border border-[#d9d9d9] rounded-sm">
                    <span className="text-[10px] text-[#666666] block">اپراتور تولید:</span>
                    <span className="font-bold">{generatedTag.operatorName}</span>
                  </div>
                  <div className="p-2 border border-[#d9d9d9] rounded-sm">
                    <span className="text-[10px] text-[#666666] block">سرپرست خط:</span>
                    <span className="font-bold">{generatedTag.supervisorName}</span>
                  </div>
                  <div className="p-2 border border-[#b3ddf2] rounded-sm bg-[#e5f3fa] text-[#007cc0]">
                    <span className="text-[10px] text-[#007cc0] block">وضعیت کیفی QC:</span>
                    <span className="font-bold flex items-center gap-1 mt-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#007cc0]" />
                      <span>{generatedTag.qualityStatus === 'APPROVED' ? 'تایید کیفی ۱۰۰٪' : 'مشروط'}</span>
                    </span>
                  </div>
                </div>

                {/* Barcode & Scan Block */}
                <div className="p-3 bg-[#ffffff] border border-[#bfbfbf] rounded-sm flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-right">
                  <div className="space-y-1">
                    <div className="tracking-widest font-mono text-xs font-bold text-[#333333]">
                      {generatedTag.barcodeValue}
                    </div>
                    <div className="h-9 flex items-center justify-center sm:justify-start gap-1 overflow-hidden bg-[#ffffff] p-1">
                      {[2,1,3,1,1,2,4,1,2,1,3,2,1,2,1,3,1,2,1,4,1,2,1,3,1,2,1,3,1,2].map((w, i) => (
                        <span
                          key={i}
                          className="h-full bg-[#333333] inline-block"
                          style={{ width: `${w * 2.2}px` }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-[#f5f5f5] px-3 py-1.5 rounded-sm border border-[#d9d9d9] shrink-0">
                    <QrCode className="w-8 h-8 text-[#333333]" />
                    <span className="text-[10px] text-[#333333] font-sans font-medium text-right">
                      اسکن بارکد رهگیری<br />سامانه ردیابی پای خط ساپکو
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-[#f7f7f7] border-t border-[#e8e8e8] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="sap-btn-standard px-5 py-1.5 text-xs font-bold"
          >
            بستن پنجره
          </button>
        </div>
      </div>
    </div>
  );
};
