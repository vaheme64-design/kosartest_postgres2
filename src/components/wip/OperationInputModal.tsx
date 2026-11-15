import React, { useState } from 'react';
import {
  Play,
  X,
  Cpu,
  AlertCircle,
  Clock,
  Layers,
} from 'lucide-react';
import { ManufacturingOperation } from '../../types/productionWip';
import { Machine, Operator } from '../../types/inventory';
import { formatNumber, toPersianDigits } from '../../utils/formatters';

interface OperationInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  operation: ManufacturingOperation | null;
  machines: Machine[];
  operators: Operator[];
  onSubmit: (payload: any) => Promise<{ success: boolean; error?: string }>;
}

export const OperationInputModal: React.FC<OperationInputModalProps> = ({
  isOpen,
  onClose,
  operation,
  machines,
  operators,
  onSubmit,
}) => {
  const [quantity, setQuantity] = useState('');
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !operation) return null;

  // Set default values on open
  const availableWaiting = operation.waitingInputQty;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(quantity);

    if (isNaN(qty) || qty <= 0) {
      setErrorMsg('تعداد ورودی باید یک عدد مثبت باشد.');
      return;
    }

    if (qty > availableWaiting) {
      setErrorMsg(`تعداد نمی‌تواند از موجودی در انتظار صف (${formatNumber(availableWaiting)} عدد) بیشتر باشد.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await onSubmit({
        moId: operation.moId,
        operationId: operation.id,
        quantity: qty,
        machineId: selectedMachineId || operation.machineId,
        operatorName: operatorName.trim() || 'اپراتور شیفت جاری',
        notes: notes.trim(),
      });

      if (res.success) {
        onClose();
      } else {
        setErrorMsg(res.error || 'خطا در بارگذاری ورودی مرحله');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در ارتباط با سرور');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#333333]/40 backdrop-blur-xs">
      <div className="bg-white border border-[#d9d9d9] rounded-md max-w-lg w-full p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#d9d9d9] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#e5f3fa] text-[#007cc0] border border-[#b3d7ff] rounded">
              <Play className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#333333]">
                شروع فرآیند و ثبت ورودی به دستگاه ({operation.stepCode})
              </h3>
              <p className="text-xs text-[#666666]">{operation.stepName} - دستور {operation.moNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#666666] hover:text-[#333333] p-1 rounded hover:bg-[#f5f5f5] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-[#fde8e8] border border-[#f5b8b8] rounded text-xs text-[#bb0000] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Current Station Status Overview */}
        <div className="p-3 bg-[#fafafa] rounded border border-[#d9d9d9] grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[#666666] block text-[11px]">موجودی در انتظار پای کار:</span>
            <span className="font-mono font-bold text-[#e9730c] text-sm">
              {formatNumber(availableWaiting)} <span className="text-xs font-normal text-[#666666]">PCS</span>
            </span>
          </div>
          <div>
            <span className="text-[#666666] block text-[11px]">موقعیت انبار پای خط:</span>
            <span className="font-mono font-bold text-[#007cc0]">{operation.warehouseLocation}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#333333]">
                تعداد قابل بارگذاری به دستگاه (PCS) <span className="text-[#bb0000]">*</span>
              </label>
              <button
                type="button"
                onClick={() => setQuantity(String(availableWaiting))}
                className="text-[11px] text-[#007cc0] hover:underline cursor-pointer"
              >
                کل موجودی صف ({formatNumber(availableWaiting)})
              </button>
            </div>
            <input
              type="number"
              min="1"
              max={availableWaiting}
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder={`حداکثر ${availableWaiting}`}
              className="w-full bg-white border border-[#bfbfbf] rounded p-2 text-xs text-[#333333] font-mono focus:outline-none focus:border-[#007cc0]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#333333]">دستگاه / خط پرس</label>
              <select
                value={selectedMachineId}
                onChange={e => setSelectedMachineId(e.target.value)}
                className="w-full bg-white border border-[#bfbfbf] rounded p-2 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
              >
                <option value="">{operation.machineName || '-- انتخاب ماشین --'}</option>
                {machines.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.code} - {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#333333]">اپراتور مسئول</label>
              <input
                type="text"
                value={operatorName}
                onChange={e => setOperatorName(e.target.value)}
                placeholder="نام اپراتور شیفت"
                className="w-full bg-white border border-[#bfbfbf] rounded p-2 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#333333]">یادداشت فرآیند</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="توضیحات ستاپ قالب، شماره پالت، فشار پرس..."
              className="w-full bg-white border border-[#bfbfbf] rounded p-2 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#d9d9d9]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="sap-btn-standard px-4 py-1.5 text-xs font-medium cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={isSubmitting || availableWaiting <= 0}
              className="sap-btn-emphasized flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              <Play className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
              <span>انتقال به در حال ساخت و شروع کار</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
