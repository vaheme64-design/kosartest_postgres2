import React, { useState } from 'react';
import { Loader2, AlertCircle, RotateCw, Plus, Check } from 'lucide-react';
import { useMasterData, MasterItemOption } from '../../hooks/useMasterData';

export interface DynamicSelectProps {
  categoryCode: string;
  value: string;
  onChange: (value: string, selectedItem?: MasterItemOption) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  selectClassName?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  showCodeBadge?: boolean;
  allowAddOption?: boolean;
  /**
   * Whether the select value matches the item code (e.g. 'DIE_BREAKDOWN')
   * or the item value string (e.g. 'شکستگی سنبه'). Default is true (uses code).
   */
  valueField?: 'code' | 'value';
}

export const DynamicSelect: React.FC<DynamicSelectProps> = ({
  categoryCode,
  value,
  onChange,
  label,
  placeholder = '-- انتخاب گزینه از اطلاعات پایه --',
  className = '',
  selectClassName = '',
  disabled = false,
  required = false,
  error,
  showCodeBadge = false,
  allowAddOption = true,
  valueField = 'code',
}) => {
  const { data, loading, error: fetchError, refetch, addItem, categoryInfo } = useMasterData(categoryCode);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedVal = e.target.value;
    const foundItem = data.find(it => (valueField === 'code' ? it.code : it.value) === selectedVal);
    onChange(selectedVal, foundItem);
  };

  const handleSaveNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || isSubmittingNew) return;

    try {
      setIsSubmittingNew(true);
      const generatedCode = `${categoryCode}_${Date.now().toString().slice(-4)}`;
      const success = await addItem(generatedCode, newTitle.trim(), data.length + 1);
      if (success) {
        const valToSelect = valueField === 'code' ? generatedCode : newTitle.trim();
        onChange(valToSelect, { id: 'temp', code: generatedCode, value: newTitle.trim() });
        setNewTitle('');
        setIsAddingNew(false);
      }
    } finally {
      setIsSubmittingNew(false);
    }
  };

  // Find currently selected item to show code badge if requested
  const selectedItem = data.find(it => (valueField === 'code' ? it.code : it.value) === value);

  return (
    <div className={`space-y-1 text-right ${className}`} dir="rtl">
      {label && (
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold text-[#333333]">
            {label}
            {required && <span className="text-[#bb0000] mr-0.5">*</span>}
          </label>
          <div className="flex items-center gap-1.5 text-[10px]">
            {loading && (
              <span className="text-[#666666] flex items-center gap-1 font-mono">
                <Loader2 className="w-2.5 h-2.5 animate-spin text-[#007cc0]" />
                <span>دیتابیس...</span>
              </span>
            )}
            {categoryInfo?.name && !loading && (
              <span className="text-[#666666] font-normal">({categoryInfo.name})</span>
            )}
            {fetchError && (
              <button
                type="button"
                onClick={() => refetch()}
                className="text-[#e9730c] hover:underline flex items-center gap-0.5 cursor-pointer"
                title="تلاش مجدد جهت بارگذاری از دیتابیس"
              >
                <RotateCw className="w-2.5 h-2.5" />
                <span>تلاش مجدد</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Select Input or Inline Add Form */}
      {isAddingNew ? (
        <form onSubmit={handleSaveNewItem} className="flex items-center gap-1.5 animate-in fade-in duration-150">
          <input
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="عنوان گزینه جدید را بنویسید..."
            autoFocus
            disabled={isSubmittingNew}
            className="flex-1 bg-white border border-[#007cc0] rounded px-3 py-1.5 text-xs text-[#333333] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!newTitle.trim() || isSubmittingNew}
            className="sap-btn-emphasized px-3 py-1.5 text-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            {isSubmittingNew ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>ثبت</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setIsAddingNew(false)}
            className="sap-btn-standard px-2.5 py-1.5 text-xs cursor-pointer"
          >
            انصراف
          </button>
        </form>
      ) : (
        <div className="relative">
          <select
            value={value}
            onChange={handleSelectChange}
            disabled={disabled || loading}
            required={required}
            className={`w-full bg-white border rounded px-3 py-1.5 text-xs font-semibold text-[#333333] focus:outline-none transition cursor-pointer appearance-none ${
              error
                ? 'border-[#bb0000] focus:border-[#bb0000]'
                : 'border-[#bfbfbf] focus:border-[#007cc0]'
            } ${disabled ? 'opacity-60 cursor-not-allowed bg-[#f0f0f0]' : ''} ${selectClassName}`}
          >
            <option value="">{placeholder}</option>
            {data.map(item => {
              const optionValue = valueField === 'code' ? item.code : item.value;
              return (
                <option key={item.id || item.code} value={optionValue}>
                  {item.value} {showCodeBadge ? `(${item.code})` : ''}
                </option>
              );
            })}
          </select>

          {/* Quick Add Button on the Left */}
          {allowAddOption && !disabled && (
            <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsAddingNew(true)}
                title="افزودن گزینه جدید به دیتابیس پایه"
                className="p-1 rounded hover:bg-[#e5f3fa] text-[#666666] hover:text-[#007cc0] transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Selected Item Code Detail or Error feedback */}
      <div className="flex items-center justify-between text-[10px]">
        {error ? (
          <span className="text-[#bb0000] flex items-center gap-1">
            <AlertCircle className="w-3 h-3 shrink-0" />
            <span>{error}</span>
          </span>
        ) : selectedItem && showCodeBadge ? (
          <span className="font-mono text-[#666666]">
            کد سیستمی: <strong className="text-[#333333]">{selectedItem.code}</strong>
          </span>
        ) : null}
      </div>
    </div>
  );
};
