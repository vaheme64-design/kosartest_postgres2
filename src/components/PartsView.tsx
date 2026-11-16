import React, { useState, useMemo, useEffect } from 'react';
import {
  Layers,
  Search,
  Plus,
  Download,
  Filter,
  Car,
  Scale,
  FileCode,
  ShieldAlert,
  X,
  Check,
  Pin,
  Copy,
  Edit3,
  Upload,
} from 'lucide-react';
import { Part, PartCategory, UnitOfMeasure, CarModel } from '../types/inventory';
import { formatNumber, formatWeightKg, exportToCsv, toPersianDigits } from '../utils/formatters';
import { SearchableSelect } from './common/SearchableSelect';
import { loadVipPartsMap, saveVipPartsMap, isPartVip } from '../utils/qcHoldStore';
import { useEnterpriseUx } from '../context/EnterpriseUxContext';
import { useErpRouter } from '../context/RouterContext';
import { DataImportExportView } from './inventory/DataImportExportView';

interface PartsViewProps {
  parts: Part[];
  onSavePart: (part: Partial<Part>) => Promise<{ success: boolean; message?: string; error?: string }>;
  onRefreshParts?: () => void | Promise<void>;
}

export const PartsView: React.FC<PartsViewProps> = ({ parts, onSavePart, onRefreshParts }) => {
  const { showUndoToast, recordAudit } = useEnterpriseUx();
  const { traceDocument } = useErpRouter();
  const [vipMap, setVipMap] = useState<Record<string, boolean>>(() => loadVipPartsMap());
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [carModelFilter, setCarModelFilter] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExcelImportOpen, setIsExcelImportOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<Partial<Part> | null>(null);

  // Form states
  const [formData, setFormData] = useState<Partial<Part>>({
    code: '',
    name: '',
    category: 'WIP_PART',
    unit: 'PCS',
    weightPerUnitKg: 1,
    sapcoCode: '',
    carModel: '',
    thicknessMm: 1.2,
    materialGrade: 'ST14',
    minStock: 100,
    maxStock: 2000,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [carModelsList, setCarModelsList] = useState<CarModel[]>([]);

  useEffect(() => {
    fetch('/api/car-models')
      .then(r => r.json())
      .then(d => {
        if (d.success && Array.isArray(d.data)) setCarModelsList(d.data);
      })
      .catch(() => {});
  }, []);

  // Extract unique car models for filter combining API models & parts
  const carModels = useMemo(() => {
    const set = new Set<string>();
    carModelsList.forEach(c => set.add(c.name));
    parts.forEach(p => {
      if (p.carModel) set.add(p.carModel);
    });
    return Array.from(set);
  }, [parts, carModelsList]);

  useEffect(() => {
    const handler = () => setVipMap(loadVipPartsMap());
    window.addEventListener('kpims-vip-parts-changed', handler);
    return () => window.removeEventListener('kpims-vip-parts-changed', handler);
  }, []);

  const handleToggleVip = async (part: Part) => {
    const currentVip = isPartVip(part, vipMap);
    const nextVip = !currentVip;
    const prevMap = { ...vipMap };
    const updatedMap = {
      ...vipMap,
      [part.id]: nextVip,
      [part.code]: nextVip,
    };
    setVipMap(updatedMap);
    saveVipPartsMap(updatedMap);

    await onSavePart({
      ...part,
      isVIP: nextVip,
      isPinned: nextVip,
    });

    recordAudit({
      actionType: 'UPDATE',
      module: 'اطلاعات پایه کالاها (PartsView - VIP)',
      entityId: part.id,
      entityCode: part.code,
      summaryFa: nextVip
        ? `نشانه‌گذاری قطعه «${part.name}» به عنوان قطعه کلیدی استراتژیک (📌 VIP)`
        : `حذف نشان VIP از قطعه «${part.name}»`,
      beforeSnapshot: { isVIP: currentVip },
      afterSnapshot: { isVIP: nextVip },
    });

    showUndoToast({
      title: nextVip
        ? `📌 قطعه «${part.name}» به لیست قطعات کلیدی (VIP) اضافه شد`
        : `قطعه «${part.name}» از لیست قطعات VIP خارج شد`,
      description: nextVip
        ? 'این قطعه در صدر گزارش‌های کسری انبار، MRP و پیشخوان تولید هایلایت خواهد شد.'
        : 'اولویت نمایش قطعه به حالت عادی بازگشت.',
      onUndo: () => {
        setVipMap(prevMap);
        saveVipPartsMap(prevMap);
        onSavePart({
          ...part,
          isVIP: currentVip,
          isPinned: currentVip,
        });
      },
    });
  };

  const vipPartsCount = useMemo(
    () => parts.filter(p => isPartVip(p, vipMap)).length,
    [parts, vipMap]
  );

  const filteredParts = useMemo(() => {
    return parts
      .map(p => {
        const vip = isPartVip(p, vipMap);
        return { ...p, isVIP: vip, isPinned: vip };
      })
      .filter(p => {
        if (categoryFilter === 'PINNED' && !p.isVIP) return false;
        if (categoryFilter !== 'ALL' && categoryFilter !== 'PINNED' && p.category !== categoryFilter) return false;
        if (carModelFilter !== 'ALL' && p.carModel !== carModelFilter) return false;
        if (searchTerm) {
          const q = searchTerm.toLowerCase();
          const matchesName = p.name.toLowerCase().includes(q);
          const matchesCode = p.code.toLowerCase().includes(q);
          const matchesSapco = p.sapcoCode?.toLowerCase().includes(q) || false;
          if (!matchesName && !matchesCode && !matchesSapco) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (Boolean(a.isVIP) !== Boolean(b.isVIP)) return a.isVIP ? -1 : 1;
        return 0;
      });
  }, [parts, searchTerm, categoryFilter, carModelFilter, vipMap]);

  const handleOpenNewModal = () => {
    setEditingPart(null);
    setFormData({
      code: '',
      name: '',
      category: 'WIP_PART',
      unit: 'PCS',
      weightPerUnitKg: 1,
      sapcoCode: '',
      carModel: '',
      thicknessMm: 1.2,
      materialGrade: 'ST14',
      minStock: 100,
      maxStock: 2000,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleEditPart = (p: Part) => {
    setEditingPart(p);
    setFormData({ ...p });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleDuplicatePart = (p: Part) => {
    setEditingPart(null);
    const clonedCode = `${p.code}-COPY`;
    const clonedName = `${p.name} (کپی)`;
    setFormData({
      ...p,
      id: undefined,
      code: clonedCode,
      name: clonedName,
      sapcoCode: p.sapcoCode ? `${p.sapcoCode}-C` : '',
    });
    setFormError(null);
    setIsModalOpen(true);

    recordAudit({
      actionType: 'CREATE',
      module: 'اطلاعات پایه کالاها (Duplicate)',
      entityId: p.id,
      entityCode: clonedCode,
      summaryFa: `آماده‌سازی کپی‌گیری (Duplicate) از رکورد «${p.name}» با کد پیشنهادی ${clonedCode}`,
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.code || !formData.name) {
      setFormError('کد قطعه و عنوان قطعه الزامی هستند.');
      return;
    }

    setFormLoading(true);
    try {
      const res = await onSavePart(formData);
      if (res.success) {
        setIsModalOpen(false);
      } else {
        setFormError(res.error || 'خطا در ثبت مشخصات قطعه');
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'خطای سرور');
    } finally {
      setFormLoading(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'کد قطعه',
      'عنوان فارسی قطعه',
      'دسته‌بندی',
      'واحد اندازه‌گیری',
      'وزن واحد (کیلوگرم)',
      'کد ساپکو / ایران‌خودرو',
      'مدل خودرو',
      'ضخامت ورق (mm)',
      'گرید فولاد',
      'حداقل موجودی اطمینان',
      'حداکثر ظرفیت',
    ];

    const categoryFa: Record<PartCategory, string> = {
      RAW_MATERIAL: 'ماده اولیه (کویل/ورق)',
      WIP_PART: 'قطعه نیمه‌ساخته (WIP)',
      FINISHED_GOOD: 'محصول نهایی آماده تحویل',
    };

    const rows = filteredParts.map(p => [
      p.code,
      p.name,
      categoryFa[p.category],
      p.unit,
      p.weightPerUnitKg,
      p.sapcoCode || '',
      p.carModel || '',
      p.thicknessMm || '',
      p.materialGrade || '',
      p.minStock || 0,
      p.maxStock || 0,
    ]);

    exportToCsv(`کاتالوگ_قطعات_خودرو_${Date.now()}`, headers, rows);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="sap-card p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[#333333] flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#007cc0]" />
              کاتالوگ جامع قطعات و مواد اولیه ({toPersianDigits(parts.length)} قطعه فعال)
            </h2>
          </div>
          <p className="text-xs text-[#666666] mt-1">
            اطلاعات پایه قطعات بدنه و سازه خودرو (پژو ۲۰۶، تارا، دنا پلاس، شاهین، کوییک)، مشخصات فنی ساپکو و وزن مرجع
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsExcelImportOpen(true)}
            className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs border-[#107e3e] text-[#107e3e] hover:bg-[#ebf7ef]"
          >
            <Upload className="w-3.5 h-3.5 text-[#107e3e]" />
            <span>ورود قطعات از اکسل (.xlsx / .csv)</span>
          </button>
          <button
            onClick={handleExportCsv}
            className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            <Download className="w-3.5 h-3.5 text-[#107e3e]" />
            <span>خروجی اکسل (CSV)</span>
          </button>
          <button
            onClick={handleOpenNewModal}
            className="sap-btn-emphasized flex items-center gap-1.5 px-3.5 py-1.5 text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>تعریف قطعه جدید</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="sap-card p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search */}
          <div className="relative min-w-[240px] flex-1">
            <Search className="w-4 h-4 text-[#666666] absolute right-3 top-2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="جستجوی نام قطعه، کد کاتالوگ یا کد ساپکو..."
              className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm pr-9 pl-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
            />
          </div>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0] font-semibold"
          >
            <option value="ALL">همه دسته‌بندی‌ها</option>
            <option value="PINNED">📌 قطعات کلیدی نشانه‌گذاری‌شده (VIP)</option>
            <option value="RAW_MATERIAL">مواد اولیه (ورق و کویل ساپکو)</option>
            <option value="WIP_PART">قطعات نیمه‌ساخته (WIP)</option>
            <option value="FINISHED_GOOD">محصولات نهایی آماده تحویل</option>
          </select>

          {/* Car Model Filter */}
          <select
            value={carModelFilter}
            onChange={e => setCarModelFilter(e.target.value)}
            className="bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0] font-semibold"
          >
            <option value="ALL">همه خودروها</option>
            {carModels.map(m => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setCategoryFilter(categoryFilter === 'PINNED' ? 'ALL' : 'PINNED')}
            className={`px-3 py-1.5 rounded-sm text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
              categoryFilter === 'PINNED'
                ? 'bg-[#e9730c] text-white border-[#e9730c]'
                : 'bg-[#fff4e5] hover:bg-[#ffe8cc] text-[#e9730c] border-[#f9d6a7]'
            }`}
          >
            <Pin className="w-3.5 h-3.5 fill-current" />
            <span>فقط قطعات کلیدی (VIP): {toPersianDigits(vipPartsCount)}</span>
          </button>
        </div>

        <div className="text-xs text-[#666666]">
          تعداد نمایش: <span className="font-bold text-[#333333]">{formatNumber(filteredParts.length)}</span> قطعه
        </div>
      </div>

      {/* Table */}
      <div className="sap-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs sap-table-compact">
            <thead>
              <tr className="bg-[#ffffff] border-b border-[#d9d9d9] text-[#333333] font-semibold">
                <th className="w-24 text-center">قطعه کلیدی (VIP)</th>
                <th>کد کاتالوگ</th>
                <th>عنوان قطعه / ماده اولیه</th>
                <th>دسته‌بندی</th>
                <th>مدل خودرو</th>
                <th>کد ساپکو</th>
                <th>وزن واحد (kg)</th>
                <th>ضخامت (mm)</th>
                <th>گرید فولاد</th>
                <th>واحد پایه</th>
                <th className="text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e8e8]">
              {filteredParts.map(p => {
                const isRaw = p.category === 'RAW_MATERIAL';
                const isFinished = p.category === 'FINISHED_GOOD';
                const isVip = Boolean(p.isVIP || p.isPinned);
                return (
                  <tr
                    key={p.id}
                    className={`transition-colors ${
                      isVip ? 'bg-[#fff4e5]/60 hover:bg-[#fff4e5]' : 'hover:bg-[#e5f3fa]'
                    }`}
                  >
                    <td className="text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleVip(p)}
                        className={`px-2 py-0.5 rounded-sm border text-[11px] font-semibold inline-flex items-center gap-1 transition-all cursor-pointer ${
                          isVip
                            ? 'bg-[#e9730c] text-white border-[#e9730c] hover:bg-[#d06408]'
                            : 'bg-[#f5f5f5] text-[#666666] border-[#d9d9d9] hover:bg-[#fff4e5] hover:text-[#e9730c] hover:border-[#f9d6a7]'
                        }`}
                        title={isVip ? 'حذف نشان قطعه کلیدی (VIP)' : 'افزودن به قطعات کلیدی استراتژیک (VIP)'}
                      >
                        <Pin className={`w-3 h-3 ${isVip ? 'fill-white' : ''}`} />
                        <span>{isVip ? 'VIP فعال' : 'نشان VIP'}</span>
                      </button>
                    </td>
                    <td className="font-mono font-bold">
                      <button
                        type="button"
                        onClick={() => traceDocument(p.code, 'INVENTORY_LEDGER')}
                        className="sap-doc-link"
                        title="رهگیری کاردکس و سوابق موجودی این قطعه"
                      >
                        {p.code}
                      </button>
                    </td>
                    <td className="text-[#333333] font-medium max-w-xs">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={isVip ? 'font-bold text-[#333333]' : ''}>{p.name}</span>
                        {isVip && (
                          <span className="px-1.5 py-0.5 rounded-sm bg-[#fff4e5] text-[#e9730c] text-[10px] font-semibold border border-[#f9d6a7]">
                            VIP
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`px-2 py-0.5 rounded-sm text-[10px] font-medium border ${
                          isRaw
                            ? 'bg-[#fff4e5] text-[#e9730c] border-[#f9d6a7]'
                            : isFinished
                            ? 'bg-[#ebf7ef] text-[#107e3e] border-[#a9dfbf]'
                            : 'bg-[#e5f3fa] text-[#007cc0] border-[#b3ddf2]'
                        }`}
                      >
                        {isRaw ? 'ماده اولیه' : isFinished ? 'محصول نهایی' : 'نیمه‌ساخته WIP'}
                      </span>
                    </td>
                    <td className="text-[#333333]">
                      <div className="flex items-center gap-1">
                        <Car className="w-3 h-3 text-[#666666]" />
                        <span>{p.carModel || 'مشترک'}</span>
                      </div>
                    </td>
                    <td className="font-mono text-[#666666] text-[11px]">{p.sapcoCode || '-'}</td>
                    <td className="font-bold text-[#333333] font-mono">{p.weightPerUnitKg}</td>
                    <td className="font-mono text-[#333333]">{p.thicknessMm ? `${p.thicknessMm} mm` : '-'}</td>
                    <td className="font-mono text-[#007cc0] font-semibold">{p.materialGrade || '-'}</td>
                    <td className="text-[#666666]">{p.unit}</td>
                    <td>
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleEditPart(p)}
                          className="sap-btn-standard px-2 py-0.5 text-[11px] inline-flex items-center gap-1"
                          title="ویرایش مشخصات قطعه / کلاف"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>ویرایش</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicatePart(p)}
                          className="px-2 py-0.5 rounded-sm text-[11px] font-medium text-[#333333] bg-[#f5f5f5] hover:bg-[#e8e8e8] border border-[#d9d9d9] inline-flex items-center gap-1 transition-colors cursor-pointer"
                          title="کپی‌گیری سریع (Duplicate) برای ایجاد رکورد مشابه"
                        >
                          <Copy className="w-3 h-3" />
                          <span>کپی‌گیری</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for Create/Edit Part */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#333333]/40 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-[#d9d9d9] rounded-sm w-full max-w-xl p-5 shadow-lg">
            <div className="flex items-center justify-between pb-3 border-b border-[#e8e8e8]">
              <h3 className="text-sm font-bold text-[#333333]">
                {editingPart ? 'ویرایش مشخصات قطعه' : 'تعریف قطعه / ماده اولیه جدید'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[#666666] hover:text-[#333333] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="mt-3 p-3 rounded-sm bg-[#ffecec] border border-[#f5b7b1] text-[#bb0000] text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[#333333] font-medium">کد کاتالوگ قطعه *</label>
                  <input
                    type="text"
                    value={formData.code || ''}
                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                    placeholder="مثال: IKCO-206-BRK05"
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-[#333333] font-mono focus:outline-none focus:border-[#007cc0]"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[#333333] font-medium">دسته‌بندی *</label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value as any })}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  >
                    <option value="RAW_MATERIAL">ماده اولیه (کویل/ورق ساپکو)</option>
                    <option value="WIP_PART">قطعه نیمه‌ساخته (WIP)</option>
                    <option value="FINISHED_GOOD">محصول نهایی آماده تحویل</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[#333333] font-medium">عنوان کامل قطعه در خط تولید *</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="مثال: براکت تقویتی ستون وسط تارا با پوشش کاتافورز"
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[#333333] font-medium">واحد اندازه‌گیری *</label>
                  <select
                    value={formData.unit}
                    onChange={e => setFormData({ ...formData, unit: e.target.value as any })}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  >
                    <option value="PCS">عدد (PCS)</option>
                    <option value="KG">کیلوگرم (KG)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[#333333] font-medium">وزن واحد (کیلوگرم) *</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={formData.weightPerUnitKg || 1}
                    onChange={e => setFormData({ ...formData, weightPerUnitKg: parseFloat(e.target.value) || 1 })}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-[#333333] font-mono focus:outline-none focus:border-[#007cc0]"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[#333333] font-medium">ضخامت ورق (mm)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.thicknessMm || ''}
                    onChange={e => setFormData({ ...formData, thicknessMm: parseFloat(e.target.value) || undefined })}
                    placeholder="مثلاً: 1.5"
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-[#333333] font-mono focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[#333333] font-medium">گرید فولاد</label>
                  <input
                    type="text"
                    value={formData.materialGrade || ''}
                    onChange={e => setFormData({ ...formData, materialGrade: e.target.value })}
                    placeholder="ST14, DC04, DX51D"
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-[#333333] font-mono focus:outline-none focus:border-[#007cc0]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[#333333] font-medium">مدل خودرو / خانواده محصول</label>
                  <SearchableSelect
                    value={formData.carModel || ''}
                    onChange={val => setFormData({ ...formData, carModel: val })}
                    placeholder="انتخاب مدل خودرو..."
                    searchPlaceholder="جستجوی مدل خودرو (۲۰۶، تارا، دنا...)"
                    options={[
                      { value: 'مشترک', label: 'مشترک بین چند خودرو' },
                      ...carModelsList.map(c => ({
                        value: c.name,
                        label: c.name,
                        sublabel: c.oem,
                        badge: c.code,
                      })),
                    ]}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[#333333] font-medium">کد ساپکو / OEM</label>
                  <input
                    type="text"
                    value={formData.sapcoCode || ''}
                    onChange={e => setFormData({ ...formData, sapcoCode: e.target.value })}
                    placeholder="SAP-88102"
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-[#333333] font-mono focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#e8e8e8]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="sap-btn-standard px-4 py-1.5"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="sap-btn-emphasized px-5 py-1.5"
                >
                  {formLoading ? 'در حال ذخیره...' : 'ذخیره در کاتالوگ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal for Excel Bulk Import of Parts */}
      {isExcelImportOpen && (
        <div className="fixed inset-0 z-50 bg-[#333333]/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#ffffff] border border-[#d9d9d9] rounded-sm w-full max-w-5xl p-4 shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#e8e8e8]">
              <h3 className="text-sm font-bold text-[#333333]">
                ورود گروهی قطعات و مواد اولیه از فایل اکسل (.xlsx / .csv) به دیتابیس اصلی
              </h3>
              <button
                type="button"
                onClick={() => setIsExcelImportOpen(false)}
                className="text-[#666666] hover:text-[#333333] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <DataImportExportView
              initialTemplateType="PARTS"
              currentUser={{ uid: 'USR-ADMIN', displayName: 'مدیر مهندسی' }}
              onSuccess={async () => {
                if (onRefreshParts) {
                  await onRefreshParts();
                } else {
                  window.dispatchEvent(new CustomEvent('kpims-parts-imported'));
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
