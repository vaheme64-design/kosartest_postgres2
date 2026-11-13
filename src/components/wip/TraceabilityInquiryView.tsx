import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  QrCode,
  Printer,
  CheckCircle2,
  Layers,
  Plus,
  RefreshCw,
  FileText,
  ArrowRight,
} from 'lucide-react';
import { Part, Machine, DieMold, Operator } from '../../types/inventory';
import { toPersianDigits, formatNumber } from '../../utils/formatters';
import { formatToJalali } from '../../utils/jalali';
import { TraceabilityTagModal } from './TraceabilityTagModal';

interface TraceabilityInquiryViewProps {
  parts: Part[];
  machines: Machine[];
  dies?: DieMold[];
  operators?: Operator[];
}

interface TraceabilityDocumentChainRow {
  id: string;
  documentNumber: string;
  docType: string;
  documentType: string;
  docDate: string;
  partCode: string;
  partName: string;
  qty: number;
  weightKg: number;
  coilId: string;
  heatNumber: string;
  referenceNumber: string;
  warehouseName: string;
  description: string;
}

export const TraceabilityInquiryView: React.FC<TraceabilityInquiryViewProps> = ({
  parts,
  machines,
  dies = [],
  operators = [],
}) => {
  const [trackingQuery, setTrackingQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [coils, setCoils] = useState<any[]>([]);
  const [documentChain, setDocumentChain] = useState<TraceabilityDocumentChainRow[]>([]);
  const [wipOrders, setWipOrders] = useState<any[]>([]);
  const [issuedTags, setIssuedTags] = useState<any[]>([]);
  const [selectedMoId, setSelectedMoId] = useState<string>('');
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);

  const loadLiveTraceability = useCallback(async () => {
    setLoading(true);
    try {
      const [chainRes, mosRes, tagsRes] = await Promise.all([
        fetch('/api/traceability/full-chain').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/wip/manufacturing-orders').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/production/traceability/history').then(r => r.json()).catch(() => ({ success: false })),
      ]);

      if (chainRes.success && chainRes.data) {
        setCoils(Array.isArray(chainRes.data.coils) ? chainRes.data.coils : []);
        setDocumentChain(Array.isArray(chainRes.data.documentChain) ? chainRes.data.documentChain : []);
      }
      if (mosRes.success && Array.isArray(mosRes.data)) {
        setWipOrders(mosRes.data);
        setSelectedMoId(prev => prev || mosRes.data[0]?.id || '');
      }
      if (tagsRes.success && Array.isArray(tagsRes.data)) {
        setIssuedTags(tagsRes.data);
      }
    } catch (err) {
      console.error('Error loading live traceability:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLiveTraceability();
  }, [loadLiveTraceability]);

  const normalizedQuery = trackingQuery.trim().toLowerCase();

  // Filter live document ledger & tags by query (coilId, heatNumber, documentNumber, moNumber, partCode, tagNumber)
  const matchingDocuments = useMemo(() => {
    if (!normalizedQuery) return documentChain;
    return documentChain.filter(d =>
      [
        d.documentNumber,
        d.partCode,
        d.partName,
        d.coilId,
        d.heatNumber,
        d.referenceNumber,
        d.warehouseName,
        d.description,
      ].some(val => String(val || '').toLowerCase().includes(normalizedQuery))
    );
  }, [documentChain, normalizedQuery]);

  const matchingTags = useMemo(() => {
    if (!normalizedQuery) return issuedTags;
    return issuedTags.filter(t =>
      [t.tagNumber, t.lotNumber, t.partCode, t.partName, t.moNumber, t.coilNumber, t.heatNumber].some(val =>
        String(val || '').toLowerCase().includes(normalizedQuery)
      )
    );
  }, [issuedTags, normalizedQuery]);

  const activeMo = useMemo(() => {
    if (normalizedQuery) {
      const matched = wipOrders.find(
        m =>
          m.moNumber?.toLowerCase().includes(normalizedQuery) ||
          m.partCode?.toLowerCase().includes(normalizedQuery) ||
          m.partName?.toLowerCase().includes(normalizedQuery) ||
          matchingDocuments.some(d => d.referenceNumber === m.moNumber)
      );
      if (matched) return matched;
    }
    return wipOrders.find(m => m.id === selectedMoId) || wipOrders[0] || null;
  }, [wipOrders, selectedMoId, normalizedQuery, matchingDocuments]);

  const primaryCoil = useMemo(() => {
    if (normalizedQuery) {
      const matched = coils.find(
        c =>
          c.coilId?.toLowerCase().includes(normalizedQuery) ||
          c.heatNumber?.toLowerCase().includes(normalizedQuery) ||
          c.coilPackNumber?.toLowerCase().includes(normalizedQuery)
      );
      if (matched) return matched;
    }
    return coils[0] || null;
  }, [coils, normalizedQuery]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Search Header Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 shrink-0">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                سامانه شناسایی و رهگیری سرتاسری مواد، ذوب و دستور کار (Live Traceability)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                ردیابی زنده شجره‌نامه قطعات از ورود رول و شماره ذوب (Heat No) تا مراحل تولید WIP، اسناد کاردکس و تحویل
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadLiveTraceability}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>بروزرسانی</span>
            </button>
            <button
              type="button"
              onClick={() => setIsTagModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 text-orange-400" />
              <span>صدور کارت ردیابی پالت</span>
            </button>
          </div>
        </div>

        {/* Live Search + Quick Chips */}
        <form onSubmit={handleSearchSubmit} className="space-y-2.5 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={trackingQuery}
                onChange={e => setTrackingQuery(e.target.value)}
                placeholder="جستجوی زنده با شماره سند، کلاف (COIL-ECU-001)، شماره ذوب (Heat No)، کد قطعه یا شماره دستور کار (MO)..."
                className="w-full pr-9 pl-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 font-mono text-slate-900"
              />
            </div>
            {trackingQuery && (
              <button
                type="button"
                onClick={() => setTrackingQuery('')}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                پاک کردن
              </button>
            )}
          </div>

          {wipOrders.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
              <span className="text-slate-500 font-medium">انتخاب سریع دستور کار:</span>
              {wipOrders.map(mo => (
                <button
                  key={mo.id}
                  type="button"
                  onClick={() => {
                    setSelectedMoId(mo.id);
                    setTrackingQuery('');
                  }}
                  className={`px-2.5 py-1 rounded-md border font-mono transition cursor-pointer ${
                    activeMo?.id === mo.id && !trackingQuery
                      ? 'bg-slate-900 text-white border-slate-900 font-bold'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {mo.moNumber} ({mo.partCode})
                </button>
              ))}
            </div>
          )}
        </form>
      </div>

      {/* Live Source Material & MO Genealogy Summary */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs font-bold text-orange-800 bg-orange-50 border border-orange-200 px-3 py-1 rounded-lg">
              {activeMo ? activeMo.moNumber : 'بدون دستور کار فعال'}
            </span>
            <span className="text-xs font-bold text-slate-800">
              {activeMo ? activeMo.partName : 'لطفاً یک کد کلاف، ذوب یا سند را جستجو کنید'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsTagModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>چاپ لیبل ردیابی</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
            <span className="text-[10px] text-slate-500 block">کد قطعه و محصول:</span>
            <span className="font-bold text-slate-900 font-mono">{activeMo?.partCode || '—'}</span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              هدف: {activeMo ? formatNumber(activeMo.targetQuantity) : '—'} عدد
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
            <span className="text-[10px] text-slate-500 block">منبع رول و ذوب (Coil / Heat):</span>
            <span className="font-bold text-slate-900 font-mono">
              {primaryCoil?.coilId || '—'}
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5 font-mono">
              {primaryCoil ? `گرید ${primaryCoil.materialGrade} · ذوب ${primaryCoil.heatNumber || '—'}` : 'در انتظار ثبت کلاف'}
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
            <span className="text-[10px] text-slate-500 block">اسناد کاردکس مرتبط:</span>
            <span className="font-bold text-slate-900 font-mono tabular-nums">
              {toPersianDigits(matchingDocuments.length)} ردیف سند قطعی
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              تگ‌های صادرشده: {toPersianDigits(matchingTags.length)} مورد
            </span>
          </div>

          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900">
            <span className="text-[10px] text-emerald-700 block">وضعیت تولید دستور کار:</span>
            <span className="font-extrabold text-base font-mono tabular-nums">
              {activeMo ? `${formatNumber(activeMo.completedQuantity || 0)} عدد تکمیل` : '—'}
            </span>
            <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1 mt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              ضایعات ثبت‌شده: {activeMo ? formatNumber(activeMo.totalScrapQuantity || 0) : '۰'}
            </span>
          </div>
        </div>

        {/* Live Routing Operations Progress for Active MO */}
        {activeMo && Array.isArray(activeMo.operations) && (
          <div>
            <h3 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-orange-600" />
              <span>وضعیت زنده عبور قطعه در مراحل عملیات ({activeMo.moNumber}):</span>
            </h3>
            <div className="overflow-x-auto rounded-xl border border-slate-200/90">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">کد مرحله</th>
                    <th className="py-2.5 px-3">عنوان عملیات</th>
                    <th className="py-2.5 px-3">ایستگاه / دستگاه</th>
                    <th className="py-2.5 px-3 text-center">در صف ورودی</th>
                    <th className="py-2.5 px-3 text-center">در جریان / آماده</th>
                    <th className="py-2.5 px-3 text-center">تولید سالم</th>
                    <th className="py-2.5 px-3 text-center">ضایعات</th>
                    <th className="py-2.5 px-3 text-center">وضعیت مرحله</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-mono tabular-nums">
                  {activeMo.operations.map((st: any) => (
                    <tr
                      key={st.id}
                      className={
                        st.status === 'IN_PROGRESS' || st.status === 'READY'
                          ? 'bg-amber-50/40 font-semibold'
                          : st.status === 'COMPLETED'
                          ? 'hover:bg-slate-50/70'
                          : 'opacity-75 bg-slate-50/30'
                      }
                    >
                      <td className="py-2.5 px-3 font-bold text-slate-900">{st.stepCode}</td>
                      <td className="py-2.5 px-3 font-sans font-semibold text-slate-900">{st.stepName}</td>
                      <td className="py-2.5 px-3 text-slate-700 font-sans">{st.machineName || '—'}</td>
                      <td className="py-2.5 px-3 text-center">{formatNumber(st.waitingInputQty || 0)}</td>
                      <td className="py-2.5 px-3 text-center text-indigo-700">
                        {formatNumber((st.inProgressQty || 0) + (st.readyForTransferQty || 0))}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-emerald-700">
                        {formatNumber(st.goodOutputQty || 0)}
                      </td>
                      <td className="py-2.5 px-3 text-center text-rose-600">
                        {formatNumber(st.scrapQty || 0)}
                      </td>
                      <td className="py-2.5 px-3 text-center font-sans">
                        {st.status === 'COMPLETED' ? (
                          <span className="text-[11px] font-bold text-emerald-700">تکمیل شده</span>
                        ) : st.status === 'IN_PROGRESS' || st.status === 'READY' ? (
                          <span className="text-[11px] font-bold text-amber-700">ایستگاه فعال</span>
                        ) : (
                          <span className="text-[11px] text-slate-500">در انتظار</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Live Document & Lot Traceability Ledger */}
        <div>
          <h3 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-emerald-700" />
            <span>زنجیره زنده اسناد انبار و ردیابی لوت/ذوب (از ورود تا مصرف و محصول):</span>
          </h3>
          {matchingDocuments.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
              سندی با این کلیدواژه یافت نشد.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200/90">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">شماره سند</th>
                    <th className="py-2.5 px-3">تاریخ</th>
                    <th className="py-2.5 px-3">نوع تراکنش</th>
                    <th className="py-2.5 px-3">کد و نام کالا</th>
                    <th className="py-2.5 px-3 text-center">مقدار / وزن</th>
                    <th className="py-2.5 px-3">کلاف / لوت</th>
                    <th className="py-2.5 px-3">شماره ذوب</th>
                    <th className="py-2.5 px-3">مرجع / MO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 tabular-nums">
                  {matchingDocuments.slice(0, 30).map(row => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono font-bold text-slate-900">{row.documentNumber}</td>
                      <td className="py-2 px-3 font-mono text-slate-600">{row.docDate || formatToJalali(new Date())}</td>
                      <td className="py-2 px-3">{row.docType}</td>
                      <td className="py-2 px-3">
                        <span className="font-mono font-semibold text-slate-800">{row.partCode}</span>
                        <span className="text-slate-400 mx-1">·</span>
                        <span>{row.partName}</span>
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-bold text-emerald-800">
                        {formatNumber(row.qty)} <span className="text-[10px] text-slate-500">({formatNumber(row.weightKg)} kg)</span>
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-700">{row.coilId || '—'}</td>
                      <td className="py-2 px-3 font-mono text-slate-700">{row.heatNumber || '—'}</td>
                      <td className="py-2 px-3 font-mono text-slate-600">{row.referenceNumber || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Issued Traceability Tags */}
        {matchingTags.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
              <span>کارت‌های شناسایی و پالت صادرشده:</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
              {matchingTags.slice(0, 6).map(tag => (
                <div key={tag.id || tag.tagNumber} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="font-mono font-bold text-slate-900">{tag.tagNumber}</div>
                  <div className="text-slate-700 font-medium">{tag.partName || tag.partCode}</div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    MO: {tag.moNumber || '—'} · تعداد: {formatNumber(tag.quantity || 0)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <TraceabilityTagModal
        isOpen={isTagModalOpen}
        onClose={() => {
          setIsTagModalOpen(false);
          loadLiveTraceability();
        }}
        parts={parts}
        machines={machines}
        dies={dies}
        operators={operators}
      />
    </div>
  );
};
