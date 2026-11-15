import React, { useState } from 'react';
import {
  ArrowRightLeft,
  X,
  AlertCircle,
  Truck,
  CheckCircle2,
  Building2,
  Boxes,
} from 'lucide-react';
import { ManufacturingOrder, ManufacturingOperation } from '../../types/productionWip';
import { formatNumber } from '../../utils/formatters';
import { useErpRouter } from '../../context/RouterContext';

interface OperationTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  mo: ManufacturingOrder | null;
  fromOperation: ManufacturingOperation | null;
  onSubmit: (payload: any) => Promise<{ success: boolean; error?: string }>;
}

export const OperationTransferModal: React.FC<OperationTransferModalProps> = ({
  isOpen,
  onClose,
  mo,
  fromOperation,
  onSubmit,
}) => {
  const { traceDocument } = useErpRouter();
  const [selectedToOpId, setSelectedToOpId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [dispatchedBy, setDispatchedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !mo || !fromOperation) return null;

  const readyQty = fromOperation.readyForTransferQty;
  const subsequentOps = mo.operations.filter(o => o.sequence > fromOperation.sequence);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(quantity);

    if (isNaN(qty) || qty <= 0) {
      setErrorMsg('تعداد انتقال باید یک عدد مثبت باشد.');
      return;
    }

    if (qty > readyQty) {
      setErrorMsg(`تعداد نمی‌تواند از موجودی آماده انتقال (${formatNumber(readyQty)} عدد) بیشتر باشد.`);
      return;
    }

    const toOpId = selectedToOpId || (subsequentOps.length > 0 ? subsequentOps[0].id : 'STORE-FINISHED');

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await onSubmit({
        moId: mo.id,
        fromOperationId: fromOperation.id,
        toOperationId: toOpId,
        quantity: qty,
        dispatchedBy: dispatchedBy.trim() || 'سرپرست خط تولید',
        notes: notes.trim(),
      });

      if (res.success) {
        onClose();
      } else {
        setErrorMsg(res.error || 'خطا در صدور حواله انتقال');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در ارتباط با سرور');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#333333]/40">
      <div className="bg-[#ffffff] border border-[#d9d9d9] rounded-sm max-w-lg w-full p-5 space-y-4 shadow-md">
        <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] rounded-sm">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#333333]">صدور حواله انتقال بین‌مراحل (Inter-Op Transfer)</h3>
              <p className="text-xs text-[#666666] flex items-center gap-1 mt-0.5">
                <span>دستور</span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    traceDocument(mo.moNumber, 'WIP_TRACEABILITY');
                  }}
                  className="sap-doc-link font-mono font-bold"
                >
                  {mo.moNumber}
                </button>
                <span>- انتقال از {fromOperation.stepCode}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#666666] hover:text-[#333333] p-1 rounded-sm hover:bg-[#f0f0f0] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-[#ffecec] border border-[#f5b7b1] rounded-sm text-xs text-[#bb0000] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Source Status Card */}
        <div className="p-3 bg-[#f7f7f7] rounded-sm border border-[#d9d9d9] grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[#666666] text-[11px] block">مرحله مبدأ:</span>
            <span className="font-bold text-[#333333] block mt-0.5">{fromOperation.stepName}</span>
            <span className="font-mono text-[11px] text-[#007cc0]">{fromOperation.warehouseLocation}</span>
          </div>
          <div>
            <span className="text-[#666666] text-[11px] block">موجودی آماده انتقال:</span>
            <span className="font-mono font-bold text-[#107e3e] text-sm mt-0.5 block">
              {formatNumber(readyQty)} <span className="text-xs font-normal text-[#666666]">PCS</span>
            </span>
            <span className="text-[10px] text-[#666666]">پشتیبانی از انتقال جزئی (Partial)</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#333333]">
              ایستگاه یا انبار مقصد <span className="text-[#bb0000]">*</span>
            </label>
            <select
              value={selectedToOpId || (subsequentOps.length > 0 ? subsequentOps[0].id : 'STORE-FINISHED')}
              onChange={e => setSelectedToOpId(e.target.value)}
              className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm p-2 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
            >
              {subsequentOps.map(op => (
                <option key={op.id} value={op.id}>
                  {op.stepCode} - {op.stepName} ({op.warehouseLocation})
                </option>
              ))}
              <option value="STORE-FINISHED">انبار محصولات نهایی (تحویل قطعی پالت آماده به ساپکو)</option>
            </select>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#333333]">
                تعداد ارسالی (PCS) <span className="text-[#bb0000]">*</span>
              </label>
              <button
                type="button"
                onClick={() => setQuantity(String(readyQty))}
                className="text-[11px] text-[#007cc0] hover:underline cursor-pointer font-semibold"
              >
                ارسال کل موجودی ({formatNumber(readyQty)})
              </button>
            </div>
            <input
              type="number"
              min="1"
              max={readyQty}
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder={`حداکثر ${readyQty}`}
              className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm p-2 text-xs text-[#333333] font-mono focus:outline-none focus:border-[#007cc0]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#333333]">مسئول ارسال / تحویل‌دهنده</label>
              <input
                type="text"
                value={dispatchedBy}
                onChange={e => setDispatchedBy(e.target.value)}
                placeholder="نام مسئول شیفت مبدأ"
                className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm p-2 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#333333]">شماره پالت / توضیحات</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="پالت فلزی کد A-12..."
                className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm p-2 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
              />
            </div>
          </div>

          <div className="p-2.5 bg-[#e5f3fa] border border-[#b3ddf2] rounded-sm text-[11px] text-[#007cc0] space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5" />
              <span>جلوگیری از دوبارشماری (Zero Double-Counting)</span>
            </div>
            <p className="text-[#333333] leading-relaxed text-[10px]">
              با ثبت این حواله، قطعات به عنوان «در حال انتقال (In-Transit)» ثبت شده و تا زمان تأیید فیزیکی در ایستگاه مقصد، در صف ورودی قرار نمی‌گیرند.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#e8e8e8]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="sap-btn-standard px-4 py-1.5 text-xs"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={isSubmitting || readyQty <= 0}
              className="sap-btn-emphasized flex items-center gap-1.5 px-4 py-1.5 text-xs disabled:opacity-50"
            >
              <ArrowRightLeft className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
              <span>صدور و ارسال حواله انتقال</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
