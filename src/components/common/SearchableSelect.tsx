import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, X, Check, Plus } from 'lucide-react';

export interface SearchableOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  badgeColor?: string;
  meta?: any;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string;
  onChange: (value: string, option?: SearchableOption) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  onAddNew?: () => void;
  addNewText?: string;
  allowClear?: boolean;
  required?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'انتخاب کنید...',
  searchPlaceholder = 'جستجو در فهرست...',
  className = '',
  disabled = false,
  onAddNew,
  addNewText = '+ افزودن مورد جدید',
  allowClear = false,
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find(o => o.value === value);

  const filteredOptions = options.filter(opt => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    const matchLabel = opt.label.toLowerCase().includes(term);
    const matchSublabel = opt.sublabel?.toLowerCase().includes(term);
    const matchValue = opt.value.toLowerCase().includes(term);
    return matchLabel || matchSublabel || matchValue;
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      setHighlightedIndex(0);
    }
  }, [isOpen]);

  const handleSelect = (opt: SearchableOption) => {
    onChange(opt.value, opt);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchTerm('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions[highlightedIndex]) {
        handleSelect(filteredOptions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 bg-white hover:bg-[#f7f7f7] border rounded text-xs transition-colors cursor-pointer text-right ${
          isOpen ? 'border-[#007cc0] ring-1 ring-[#007cc0]/30' : 'border-[#bfbfbf]'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-[#f0f0f0]' : ''}`}
      >
        <div className="flex-1 truncate">
          {selectedOption ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-semibold text-[#333333] truncate">{selectedOption.label}</span>
              {selectedOption.sublabel && (
                <span className="text-[11px] text-[#666666] font-mono truncate">
                  ({selectedOption.sublabel})
                </span>
              )}
              {selectedOption.badge && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#fff5eb] text-[#e9730c] border border-[#f5d0a9] font-medium">
                  {selectedOption.badge}
                </span>
              )}
            </div>
          ) : (
            <span className="text-[#888888] font-normal">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-[#666666]">
          {allowClear && selectedOption && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 hover:text-[#bb0000] rounded cursor-pointer"
              title="پاک کردن"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180 text-[#007cc0]' : ''}`} />
        </div>
      </button>

      {/* Hidden input for HTML form validation if required */}
      {required && (
        <input
          tabIndex={-1}
          autoComplete="off"
          style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
          value={value}
          onChange={() => {}}
          required={required}
        />
      )}

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full min-w-[260px] bg-white border border-[#d9d9d9] rounded-md shadow-xl overflow-hidden animate-in fade-in-50 zoom-in-95">
          {/* Live Search Input */}
          <div className="p-2 border-b border-[#e8e8e8] bg-[#f7f7f7]">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 absolute right-2.5 text-[#666666] pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                className="w-full pl-7 pr-8 py-1.5 bg-white border border-[#bfbfbf] rounded text-xs text-[#333333] focus:outline-none focus:border-[#007cc0] placeholder:text-[#888888] font-sans"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute left-2.5 text-[#666666] hover:text-[#333333]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-56 overflow-y-auto divide-y divide-[#e8e8e8] p-1">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#666666]">
                موردی با عنوان «{searchTerm}» یافت نشد
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <div
                    key={opt.value}
                    onClick={() => handleSelect(opt)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#e5f3fa] text-[#007cc0] font-bold'
                        : isHighlighted
                        ? 'bg-[#f7f7f7] text-[#333333]'
                        : 'text-[#333333] hover:bg-[#f7f7f7]'
                    }`}
                  >
                    <div className="flex-1 truncate">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate">{opt.label}</span>
                        {opt.badge && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#f0f0f0] text-[#333333] font-medium">
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      {opt.sublabel && (
                        <div className="text-[11px] text-[#666666] font-mono mt-0.5 truncate">
                          {opt.sublabel}
                        </div>
                      )}
                    </div>

                    {isSelected && <Check className="w-4 h-4 text-[#007cc0] shrink-0" />}
                  </div>
                );
              })
            )}
          </div>

          {/* Quick Add Action Button (if provided) */}
          {onAddNew && (
            <div className="p-1.5 bg-[#f7f7f7] border-t border-[#e8e8e8]">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onAddNew();
                }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#107e3e] bg-[#eef8f2] hover:bg-[#ddf1e4] border border-[#b5e0c6] rounded transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{addNewText}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
