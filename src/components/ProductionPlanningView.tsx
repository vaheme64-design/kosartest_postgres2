import React, { useState } from 'react';
import {
  CalendarDays,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Boxes,
  Layers,
  Filter,
  Search,
  ChevronLeft,
} from 'lucide-react';
import { ProductionPlan, Part } from '../types/inventory';
import { formatNumber, toPersianDigits } from '../utils/formatters';
import { formatToJalali } from '../utils/jalali';
import { useErpRouter } from '../context/RouterContext';

interface ProductionPlanningViewProps {
  plans: ProductionPlan[];
  parts: Part[];
  onRefresh: () => Promise<void>;
  loading: boolean;
}

export const ProductionPlanningView: React.FC<ProductionPlanningViewProps> = ({
  plans,
  parts,
  onRefresh,
  loading,
}) => {
  const { traceDocument } = useErpRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [showNewModal, setShowNewModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New Plan Form State
  const [title, setTitle] = useState('');
  const [selectedPartId, setSelectedPartId] = useState('');
  const [plannedQty, setPlannedQty] = useState<number>(1000);
  const [priority, setPriority] = useState<1 | 2 | 3>(2);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState('');

  const filteredPlans = plans.filter(p => {
    if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        p.title.toLowerCase().includes(q) ||
        p.partName.toLowerCase().includes(q) ||
        p.partCode.toLowerCase().includes(q) ||
        p.planNumber.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !selectedPartId || plannedQty <= 0) {
      setErrorMsg('لطفاً عنوان، قطعه و تیراژ برنامه را وارد نمایید.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          partId: selectedPartId,
          plannedQty: Number(plannedQty),
          priority: Number(priority),
          startDate,
          endDate,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'خطا در ثبت برنامه تولید');
      }

      setShowNewModal(false);
      setTitle('');
      setSelectedPartId('');
      setNotes('');
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'خطا در ثبت برنامه');
    } finally {
      setSubmitting(false);
    }
  };

  const totalPlanned = plans.reduce((acc, p) => acc + p.plannedQty, 0);
  const totalProduced = plans.reduce((acc, p) => acc + p.producedQty, 0);
  const completionRate = totalPlanned > 0 ? Math.round((totalProduced / totalPlanned) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="sap-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-[#007cc0]" />
            <h2 className="text-base font-bold text-[#333333]">برنامه‌ریزی تولید خطوط پرس و مونتاژ</h2>
          </div>
          <p className="text-xs text-[#666666] mt-1">
            برنامه‌ریزی تیراژ هفتگی، ماهانه و تخصیص قطعات به سالن‌های پرس و مونتاژ بر اساس ظرفیت و سفارش ساپکو
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="sap-btn-emphasized flex items-center gap-2 px-4 py-1.5 text-xs"
        >
          <Plus className="w-4 h-4" />
          <span>ثبت برنامه تولید جدید</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="sap-card p-3.5">
          <div className="flex items-center justify-between text-xs text-[#666666] mb-1">
            <span>برنامه‌های در جریان</span>
            <Clock className="w-4 h-4 text-[#e9730c]" />
          </div>
          <div className="text-xl font-bold text-[#333333] tabular-nums font-mono">
            {toPersianDigits(plans.filter(p => p.status === 'IN_PROGRESS').length)}
            <span className="text-xs font-sans font-normal text-[#666666] mr-1.5">برنامه فعال</span>
          </div>
        </div>

        <div className="sap-card p-3.5">
          <div className="flex items-center justify-between text-xs text-[#666666] mb-1">
            <span>مجموع تیراژ مصوب</span>
            <Boxes className="w-4 h-4 text-[#007cc0]" />
          </div>
          <div className="text-xl font-bold text-[#333333] tabular-nums font-mono">
            {formatNumber(totalPlanned)}
            <span className="text-xs font-sans font-normal text-[#666666] mr-1.5">عدد</span>
          </div>
        </div>

        <div className="sap-card p-3.5">
          <div className="flex items-center justify-between text-xs text-[#666666] mb-1">
            <span>تولید محقق‌شده</span>
            <CheckCircle2 className="w-4 h-4 text-[#107e3e]" />
          </div>
          <div className="text-xl font-bold text-[#107e3e] tabular-nums font-mono">
            {formatNumber(totalProduced)}
            <span className="text-xs font-sans font-normal text-[#666666] mr-1.5">عدد</span>
          </div>
        </div>

        <div className="sap-card p-3.5">
          <div className="flex items-center justify-between text-xs text-[#666666] mb-1">
            <span>درصد تحقق کل</span>
            <TrendingUp className="w-4 h-4 text-[#007cc0]" />
          </div>
          <div className="text-xl font-bold text-[#007cc0] tabular-nums font-mono">
            {toPersianDigits(completionRate)}٪
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="sap-card p-3 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute right-3 top-2 text-[#666666]" />
          <input
            type="text"
            placeholder="جستجوی برنامه تولید، قطعه یا کد..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm pr-9 pl-3 py-1.5 text-xs text-[#333333] placeholder-[#888888] focus:outline-none focus:border-[#007cc0]"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {[
            { id: 'ALL', label: 'همه وضعیت‌ها' },
            { id: 'IN_PROGRESS', label: 'در حال اجرا' },
            { id: 'CONFIRMED', label: 'تایید شده' },
            { id: 'COMPLETED', label: 'تکمیل‌شده' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-colors cursor-pointer shrink-0 border ${
                statusFilter === tab.id
                  ? 'bg-[#007cc0] text-white border-[#007cc0]'
                  : 'bg-[#f5f5f5] text-[#333333] border-[#d9d9d9] hover:bg-[#e5f3fa]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Plans List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredPlans.map(plan => {
          const progress = plan.plannedQty > 0 ? Math.min(100, Math.round((plan.producedQty / plan.plannedQty) * 100)) : 0;
          return (
            <div
              key={plan.id}
              className="sap-card p-4 hover:border-[#007cc0] transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => traceDocument(plan.planNumber, 'WIP_TRACEABILITY')}
                    className="sap-doc-link text-[11px] font-mono bg-[#f5f5f5] px-2 py-0.5 rounded-sm border border-[#d9d9d9]"
                    title="رهگیری دستور تولید"
                  >
                    {plan.planNumber}
                  </button>
                  <div className="flex items-center gap-1.5">
                    {plan.priority === 3 && (
                      <span className="text-[10px] bg-[#ffecec] text-[#bb0000] border border-[#f5b7b1] px-2 py-0.5 rounded-sm font-bold">
                        بحرانی ساپکو
                      </span>
                    )}
                    {plan.priority === 2 && (
                      <span className="text-[10px] bg-[#fff4e5] text-[#e9730c] border border-[#f5cba7] px-2 py-0.5 rounded-sm font-bold">
                        فوری
                      </span>
                    )}
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-sm font-medium border ${
                        plan.status === 'IN_PROGRESS'
                          ? 'bg-[#e5f3fa] text-[#007cc0] border-[#b3ddf2]'
                          : plan.status === 'COMPLETED'
                          ? 'bg-[#ebf5ec] text-[#107e3e] border-[#b7dfbf]'
                          : 'bg-[#f5f5f5] text-[#666666] border-[#d9d9d9]'
                      }`}
                    >
                      {plan.status === 'IN_PROGRESS'
                        ? 'در حال اجرا'
                        : plan.status === 'COMPLETED'
                        ? 'تکمیل‌شده'
                        : 'تاییدشده'}
                    </span>
                  </div>
                </div>

                <h3 className="text-sm font-bold text-[#333333] leading-snug mb-1">{plan.title}</h3>
                <div className="text-xs text-[#666666] mb-3 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#007cc0]" />
                  <span>{plan.partName}</span>
                  <button
                    type="button"
                    onClick={() => traceDocument(plan.partCode, 'INVENTORY_LEDGER')}
                    className="sap-doc-link font-mono text-[10px]"
                  >
                    ({plan.partCode})
                  </button>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5 bg-[#f7f7f7] p-2.5 rounded-sm border border-[#d9d9d9] mb-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666666]">پیشرفت تولید:</span>
                    <span className="font-bold text-[#333333] tabular-nums">
                      {formatNumber(plan.producedQty)} از {formatNumber(plan.plannedQty)} عدد ({toPersianDigits(progress)}٪)
                    </span>
                  </div>
                  <div className="w-full bg-[#e8e8e8] rounded-sm h-2 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        progress >= 100 ? 'bg-[#107e3e]' : progress >= 50 ? 'bg-[#007cc0]' : 'bg-[#e9730c]'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2.5 border-t border-[#e8e8e8] flex items-center justify-between text-[11px] text-[#666666]">
                <span>مهلت: {formatToJalali(plan.endDate)}</span>
                {plan.notes && <span className="text-[#666666] truncate max-w-[140px]">{plan.notes}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* New Plan Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#333333]/40">
          <div className="bg-[#ffffff] border border-[#d9d9d9] rounded-sm w-full max-w-lg p-5 shadow-md space-y-4">
            <h3 className="text-sm font-bold text-[#333333] border-b border-[#e8e8e8] pb-2.5">ثبت برنامه تولید جدید</h3>

            {errorMsg && (
              <div className="p-2.5 bg-[#ffecec] border border-[#f5b7b1] text-[#bb0000] text-xs rounded-sm">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreatePlan} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-[#333333] mb-1">عنوان برنامه تولید</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: تولید هفتگی براکت‌های تارا و پژو ۲۰۶"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">انتخاب قطعه هدف</label>
                <select
                  required
                  value={selectedPartId}
                  onChange={e => setSelectedPartId(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                >
                  <option value="">-- انتخاب قطعه از کاتالوگ --</option>
                  {parts.map(p => (
                    <option key={p.id} value={p.id}>
                      [{p.code}] {p.name} ({p.carModel || 'ساپکو'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#333333] mb-1">تیراژ برنامه‌ریزی (عدد)</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={plannedQty}
                    onChange={e => setPlannedQty(Number(e.target.value))}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs font-mono text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#333333] mb-1">اولویت تولید</label>
                  <select
                    value={priority}
                    onChange={e => setPriority(Number(e.target.value) as 1 | 2 | 3)}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  >
                    <option value={1}>۱ - عادی</option>
                    <option value={2}>۲ - فوری</option>
                    <option value={3}>۳ - بحرانی خط خودروساز</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#333333] mb-1">تاریخ شروع</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[#333333] mb-1">تاریخ تحویل</label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">یادداشت فنی و دستورات خاص</label>
                <textarea
                  rows={2}
                  placeholder="دستورات ویژه کیفی یا سهمیه کویل..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#e8e8e8]">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="sap-btn-standard px-4 py-1.5 text-xs"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="sap-btn-emphasized px-5 py-1.5 text-xs disabled:opacity-50"
                >
                  {submitting ? 'در حال ثبت...' : 'ثبت برنامه تولید'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
