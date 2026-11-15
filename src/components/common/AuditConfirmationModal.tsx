import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  X,
  FileText,
  Clock,
  Send,
  HelpCircle,
} from 'lucide-react';

export interface AuditConfirmationModalProps {
  isOpen: boolean;
  title: string;
  actionSummary: string;
  onConfirm: (reason: string) => void | Promise<void>;
  onCancel: () => void;
  confirmButtonText?: string;
  cancelButtonText?: string;
  entityName?: string;
  entityId?: string;
  actionType?: string;
  isDestructive?: boolean;
}

const QUICK_REASONS = [
  'تغییر شیفت و فوریت سفارش ساپکو',
  'رفع نقص و راه‌اندازی مجدد خط',
  'توقف موقت به علت بررسی قالب',
  'اصلاح تیراژ طبق دستور مدیریت تولید',
  'جابجایی ایستگاه کاری به پرس موازی',
];

export const AuditConfirmationModal: React.FC<AuditConfirmationModalProps> = ({
  isOpen,
  title,
  actionSummary,
  onConfirm,
  onCancel,
  confirmButtonText = 'تایید نهایی و ثبت در ممیزی',
  cancelButtonText = 'انصراف',
  entityName,
  entityId,
  actionType,
  isDestructive = false,
}) => {
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [hasInteracted, setHasInteracted] = useState<boolean>(false);

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setReason('');
      setIsSubmitting(false);
      setHasInteracted(false);
    }
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const trimmedReason = reason.trim();
  const charCount = trimmedReason.length;
  const isReasonValid = charCount >= 10;
  const charsRemaining = Math.max(0, 10 - charCount);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isReasonValid || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onConfirm(trimmedReason);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectQuickReason = (qr: string) => {
    setReason(prev => (prev ? `${prev} - ${qr}` : qr));
    setHasInteracted(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#333333]/40 backdrop-blur-[1px] transition-opacity animate-in fade-in duration-200"
      dir="rtl"
    >
      <div
        className="bg-white border border-[#d9d9d9] rounded-md max-w-lg w-full shadow-xl overflow-hidden flex flex-col text-right text-xs"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-modal-title"
      >
        {/* Header */}
        <div className="bg-[#ffffff] text-[#333333] px-5 py-3.5 flex items-center justify-between border-b border-[#d9d9d9]">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded flex items-center justify-center border ${
                isDestructive
                  ? 'bg-[#fde8e8] text-[#bb0000] border-[#f5b7b7]'
                  : 'bg-[#fff5eb] text-[#e9730c] border-[#f5d0a9]'
              }`}
            >
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 id="audit-modal-title" className="font-bold text-sm text-[#333333]">
                {title}
              </h3>
              <p className="text-[11px] text-[#666666] mt-0.5">
                ثبت سند ممیزی تغییرات حساس (Enterprise Audit Trail)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="p-1 rounded text-[#666666] hover:text-[#333333] hover:bg-[#f0f0f0] transition cursor-pointer disabled:opacity-50"
            title="بستن"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Action Summary Card */}
          <div className="p-3 bg-[#f7f7f7] border border-[#d9d9d9] rounded space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#333333] flex items-center gap-1.5 text-[11px]">
                <FileText className="w-3.5 h-3.5 text-[#007cc0]" />
                <span>شرح عملیات درخواستی:</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] font-bold">
                AUDIT-MANDATORY
              </span>
            </div>
            <p className="text-[#333333] font-medium leading-relaxed text-xs">
              {actionSummary}
            </p>

            {(entityName || entityId || actionType) && (
              <div className="pt-2 border-t border-[#e8e8e8] flex flex-wrap gap-2 text-[10px] font-mono text-[#666666]">
                {entityName && (
                  <span className="bg-white px-2 py-0.5 rounded border border-[#d9d9d9]">
                    موجودیت: <strong className="text-[#333333]">{entityName}</strong>
                  </span>
                )}
                {entityId && (
                  <span className="bg-white px-2 py-0.5 rounded border border-[#d9d9d9]">
                    شناسه: <strong className="text-[#333333]">{entityId}</strong>
                  </span>
                )}
                {actionType && (
                  <span className="bg-white px-2 py-0.5 rounded border border-[#d9d9d9]">
                    نوع عملیات: <strong className="text-[#007cc0]">{actionType}</strong>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Reason Input Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="audit-reason-input"
                className="font-bold text-[#333333] flex items-center gap-1.5"
              >
                <span>دلیل تغییرات / تایید عملیات</span>
                <span className="text-[#bb0000]">*</span>
                <span className="text-[10px] font-normal text-[#666666]">
                  (حداقل ۱۰ کاراکتر الزامی)
                </span>
              </label>

              {/* Character Counter Badge */}
              <div
                className={`text-[10px] font-mono px-2 py-0.5 rounded flex items-center gap-1 font-bold border ${
                  isReasonValid
                    ? 'bg-[#eef8f2] text-[#107e3e] border-[#b5e0c6]'
                    : 'bg-[#fff5eb] text-[#e9730c] border-[#f5d0a9]'
                }`}
              >
                {isReasonValid ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-[#107e3e]" />
                    <span>{charCount} کاراکتر (معتبر)</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-3 h-3 text-[#e9730c]" />
                    <span>{charCount} / ۱۰ ({charsRemaining} کاراکتر باقی‌مانده)</span>
                  </>
                )}
              </div>
            </div>

            <textarea
              id="audit-reason-input"
              rows={3}
              value={reason}
              onChange={e => {
                setReason(e.target.value);
                setHasInteracted(true);
              }}
              placeholder="لطفاً دلیل فنی، مدیریتی یا عملیاتی این اقدام را به صورت مستند بنویسید (مثلاً: تغییر شیفت و فوریت سفارش ساپکو)..."
              className={`w-full p-2.5 rounded border text-xs text-[#333333] leading-relaxed focus:outline-none transition resize-none ${
                hasInteracted && !isReasonValid
                  ? 'border-[#e9730c] bg-[#fff5eb]/30 focus:border-[#e9730c]'
                  : isReasonValid
                  ? 'border-[#107e3e] bg-[#eef8f2]/20 focus:border-[#107e3e]'
                  : 'border-[#bfbfbf] bg-white focus:border-[#007cc0]'
              }`}
              disabled={isSubmitting}
              autoFocus
            />

            {/* Quick Reason Suggestions */}
            <div className="space-y-1">
              <span className="text-[10px] text-[#666666] flex items-center gap-1">
                <HelpCircle className="w-3 h-3 text-[#007cc0]" />
                <span>دلایل پرتکرار پیشنهادی:</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REASONS.map((qr, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectQuickReason(qr)}
                    disabled={isSubmitting}
                    className="text-[10px] px-2 py-0.5 rounded bg-[#f7f7f7] hover:bg-[#e5f3fa] text-[#333333] border border-[#d9d9d9] transition cursor-pointer disabled:opacity-50"
                  >
                    + {qr}
                  </button>
                ))}
              </div>
            </div>

            {hasInteracted && !isReasonValid && (
              <p className="text-[11px] text-[#e9730c] flex items-center gap-1 mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  متن واردشده کمتر از ۱۰ کاراکتر است. ثبت دلیل مستند برای تضمین جامعیت ممیزی الزامی است.
                </span>
              </p>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-[#d9d9d9]">
            <span className="text-[10px] text-[#666666]">
              کلید <kbd className="px-1.5 py-0.5 bg-[#f7f7f7] rounded border border-[#d9d9d9] text-[#333333] font-mono">ESC</kbd> برای انصراف
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className="sap-btn-standard px-4 py-1.5 cursor-pointer disabled:opacity-50"
              >
                {cancelButtonText}
              </button>

              <button
                type="submit"
                disabled={!isReasonValid || isSubmitting}
                className={`px-4 py-1.5 rounded text-white font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                  !isReasonValid || isSubmitting
                    ? 'bg-[#d9d9d9] text-[#888888] cursor-not-allowed'
                    : isDestructive
                    ? 'bg-[#bb0000] hover:bg-[#990000]'
                    : 'sap-btn-emphasized'
                }`}
                title={!isReasonValid ? 'برای تایید ابتدا حداقل ۱۰ کاراکتر دلیل بنویسید' : confirmButtonText}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>در حال ثبت...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>{confirmButtonText}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
