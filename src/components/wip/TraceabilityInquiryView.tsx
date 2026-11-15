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
import { useErpRouter } from '../../context/RouterContext';

interface TraceabilityInquiryViewProps {
  parts: Part[];
  machines: Machine[];
  dies?: DieMold[];
  operators?: Operator[];
  initialQuery?: string;
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
  initialQuery = '',
}) => {
  const router = useErpRouter();
  const [trackingQuery, setTrackingQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(true);
  const [coils, setCoils] = useState<any[]>([]);
  const [documentChain, setDocumentChain] = useState<TraceabilityDocumentChainRow[]>([]);
  const [wipOrders, setWipOrders] = useState<any[]>([]);
  const [issuedTags, setIssuedTags] = useState<any[]>([]);
  const [selectedMoId, setSelectedMoId] = useState<string>('');
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);

  useEffect(() => {
    if (initialQuery) {
      setTrackingQuery(initialQuery);
    }
  }, [initialQuery]);

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
    <div className="space-y-4" dir="rtl">
      {/* Search Header Banner */}
      <div className="bg-white p-4 rounded-md border border-[#d9d9d9] shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2 rounded bg-[#e5f3fa] border border-[#b3ddf5] text-[#007cc0] shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#333333]">
                سامانه شناسایی و رهگیری سرتاسری مواد، ذوب و دستور کار (Live Traceability)
              </h2>
              <p className="text-xs text-[#666666] mt-0.5">
                ردیابی زنده شجره‌نامه قطعات از ورود رول و شماره ذوب (Heat No) تا مراحل تولید WIP، اسناد کاردکس و تحویل
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadLiveTraceability}
              disabled={loading}
              className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>بروزرسانی</span>
            </button>
            <button
              type="button"
              onClick={() => setIsTagModalOpen(true)}
              className="sap-btn-emphasized flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>صدور کارت ردیابی پالت</span>
            </button>
          </div>
        </div>

        {/* Live Search + Quick Chips */}
        <form onSubmit={handleSearchSubmit} className="space-y-2 pt-2 border-t border-[#e8e8e8]">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#666666]" />
              <input
                type="text"
                value={trackingQuery}
                onChange={e => setTrackingQuery(e.target.value)}
                placeholder="جستجوی زنده با شماره سند، کلاف (COIL-ECU-001)، شماره ذوب (Heat No)، کد قطعه یا شماره دستور کار (MO)..."
                className="w-full pr-9 pl-4 py-1.5 text-xs bg-[#f7f7f7] border border-[#bfbfbf] rounded focus:outline-none focus:bg-white focus:border-[#007cc0] font-mono text-[#333333]"
              />
            </div>
            {trackingQuery && (
              <button
                type="button"
                onClick={() => {
                  setTrackingQuery('');
                  router.clearDocQuery();
                }}
                className="px-3 py-1.5 bg-[#f5f5f5] hover:bg-[#e8e8e8] text-[#333333] border border-[#d9d9d9] rounded text-xs font-medium cursor-pointer"
              >
                پاک کردن
              </button>
            )}
          </div>

          {wipOrders.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
              <span className="text-[#666666] font-medium">انتخاب سریع دستور کار:</span>
              {wipOrders.map(mo => (
                <button
                  key={mo.id}
                  type="button"
                  onClick={() => {
                    setSelectedMoId(mo.id);
                    setTrackingQuery('');
                  }}
                  className={`px-2.5 py-1 rounded border font-mono transition cursor-pointer ${
                    activeMo?.id === mo.id && !trackingQuery
                      ? 'bg-[#007cc0] text-white border-[#007cc0] font-semibold'
                      : 'bg-[#f7f7f7] hover:bg-[#e5f3fa] text-[#333333] border-[#d9d9d9]'
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
      <div className="bg-white border border-[#d9d9d9] rounded-md p-4 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 border-b border-[#e8e8e8] gap-2">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs font-semibold text-[#007cc0] bg-[#e5f3fa] border border-[#b3ddf5] px-2.5 py-1 rounded">
              {activeMo ? activeMo.moNumber : 'بدون دستور کار فعال'}
            </span>
            <span className="text-xs font-semibold text-[#333333]">
              {activeMo ? activeMo.partName : 'لطفاً یک کد کلاف، ذوب یا سند را جستجو کنید'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {activeMo?.moNumber && (
              <button
                type="button"
                onClick={() => router.traceDocument(activeMo.moNumber, 'INVENTORY_LEDGER')}
                className="sap-btn-standard flex items-center gap-1.5 px-2.5 py-1 text-xs cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>اسناد کاردکس این دستور کار</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsTagModalOpen(true)}
              className="sap-btn-standard flex items-center gap-1.5 px-2.5 py-1 text-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>چاپ لیبل ردیابی</span>
            </button>
          </div>
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
            <h3 className="text-xs font-semibold text-[#333333] mb-2 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[#007cc0]" />
              <span>وضعیت زنده عبور قطعه در مراحل عملیات ({activeMo.moNumber}):</span>
            </h3>
            <div className="overflow-x-auto rounded border border-[#d9d9d9]">
              <table className="w-full text-right text-xs sap-table-compact">
                <thead className="bg-white border-b border-[#d9d9d9] text-[#333333] font-semibold">
                  <tr>
                    <th className="py-1.5 px-2.5">کد مرحله</th>
                    <th className="py-1.5 px-2.5">عنوان عملیات</th>
                    <th className="py-1.5 px-2.5">ایستگاه / دستگاه</th>
                    <th className="py-1.5 px-2.5 text-center">در صف ورودی</th>
                    <th className="py-1.5 px-2.5 text-center">در جریان / آماده</th>
                    <th className="py-1.5 px-2.5 text-center">تولید سالم</th>
                    <th className="py-1.5 px-2.5 text-center">ضایعات</th>
                    <th className="py-1.5 px-2.5 text-center">وضعیت مرحله</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e8e8] text-[#333333] font-mono tabular-nums">
                  {activeMo.operations.map((st: any) => (
                    <tr
                      key={st.id}
                      className={
                        st.status === 'IN_PROGRESS' || st.status === 'READY'
                          ? 'bg-[#e5f3fa]/50 font-semibold'
                          : st.status === 'COMPLETED'
                          ? 'hover:bg-[#e5f3fa]/70'
                          : 'opacity-75 bg-[#fafafa]'
                      }
                    >
                      <td className="py-1.5 px-2.5 font-semibold text-[#333333]">{st.stepCode}</td>
                      <td className="py-1.5 px-2.5 font-sans font-medium text-[#333333]">{st.stepName}</td>
                      <td className="py-1.5 px-2.5 text-[#666666] font-sans">{st.machineName || '—'}</td>
                      <td className="py-1.5 px-2.5 text-center">{formatNumber(st.waitingInputQty || 0)}</td>
                      <td className="py-1.5 px-2.5 text-center text-[#007cc0]">
                        {formatNumber((st.inProgressQty || 0) + (st.readyForTransferQty || 0))}
                      </td>
                      <td className="py-1.5 px-2.5 text-center font-semibold text-[#107e3e]">
                        {formatNumber(st.goodOutputQty || 0)}
                      </td>
                      <td className="py-1.5 px-2.5 text-center text-[#bb0000]">
                        {formatNumber(st.scrapQty || 0)}
                      </td>
                      <td className="py-1.5 px-2.5 text-center font-sans">
                        {st.status === 'COMPLETED' ? (
                          <span className="text-[11px] font-semibold text-[#107e3e]">تکمیل شده</span>
                        ) : st.status === 'IN_PROGRESS' || st.status === 'READY' ? (
                          <span className="text-[11px] font-semibold text-[#007cc0]">ایستگاه فعال</span>
                        ) : (
                          <span className="text-[11px] text-[#666666]">در انتظار</span>
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
          <h3 className="text-xs font-semibold text-[#333333] mb-2 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-[#007cc0]" />
            <span>زنجیره زنده اسناد انبار و ردیابی لوت/ذوب (از ورود تا مصرف و محصول):</span>
          </h3>
          {matchingDocuments.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#666666] bg-[#f7f7f7] rounded border border-[#d9d9d9]">
              سندی با این کلیدواژه یافت نشد.
            </div>
          ) : (
            <div className="overflow-x-auto rounded border border-[#d9d9d9]">
              <table className="w-full text-right text-xs sap-table-compact">
                <thead className="bg-white border-b border-[#d9d9d9] text-[#333333] font-semibold">
                  <tr>
                    <th className="py-1.5 px-2.5">شماره سند</th>
                    <th className="py-1.5 px-2.5">تاریخ</th>
                    <th className="py-1.5 px-2.5">نوع تراکنش</th>
                    <th className="py-1.5 px-2.5">کد و نام کالا</th>
                    <th className="py-1.5 px-2.5 text-center">مقدار / وزن</th>
                    <th className="py-1.5 px-2.5">کلاف / لوت</th>
                    <th className="py-1.5 px-2.5">شماره ذوب</th>
                    <th className="py-1.5 px-2.5">مرجع / MO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e8e8] text-[#333333] tabular-nums">
                  {matchingDocuments.slice(0, 30).map(row => (
                    <tr key={row.id} className="hover:bg-[#e5f3fa]/70">
                      <td className="py-1.5 px-2.5">
                        <button
                          type="button"
                          onClick={() => router.traceDocument(row.documentNumber, 'INVENTORY_LEDGER')}
                          className="sap-doc-link"
                          title="مشاهده اصل سند در کاردکس انبار"
                        >
                          {row.documentNumber}
                        </button>
                      </td>
                      <td className="py-1.5 px-2.5 font-mono text-[#666666]">{row.docDate || formatToJalali(new Date())}</td>
                      <td className="py-1.5 px-2.5">{row.docType}</td>
                      <td className="py-1.5 px-2.5">
                        <span className="font-mono font-semibold text-[#333333]">{row.partCode}</span>
                        <span className="text-[#999999] mx-1">·</span>
                        <span>{row.partName}</span>
                      </td>
                      <td className="py-1.5 px-2.5 text-center font-mono font-semibold text-[#107e3e]">
                        {formatNumber(row.qty)} <span className="text-[10px] text-[#666666]">({formatNumber(row.weightKg)} kg)</span>
                      </td>
                      <td className="py-1.5 px-2.5 font-mono">
                        {row.coilId ? (
                          <button
                            type="button"
                            onClick={() => router.traceDocument(row.coilId, 'COILS')}
                            className="sap-doc-link"
                            title="مشاهده وضعیت رول/کلاف در انبار ورق"
                          >
                            {row.coilId}
                          </button>
                        ) : '—'}
                      </td>
                      <td className="py-1.5 px-2.5 font-mono text-[#333333]">{row.heatNumber || '—'}</td>
                      <td className="py-1.5 px-2.5 font-mono">
                        {row.referenceNumber ? (
                          <button
                            type="button"
                            onClick={() => setTrackingQuery(row.referenceNumber)}
                            className="sap-doc-link"
                            title="فیلتر بر اساس مرجع / دستور کار"
                          >
                            {row.referenceNumber}
                          </button>
                        ) : '—'}
                      </td>
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
