import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Wand2, CheckCircle2, Send, AlertTriangle, Save } from 'lucide-react';
import { formatNumber, toPersianDigits } from '../../utils/formatters';
import { formatToJalali } from '../../utils/jalali';
import { useErpRouter } from '../../context/RouterContext';

type Proposal = {
  id: string;
  proposalNumber: string;
  version: number;
  status: 'DRAFT' | 'APPROVED' | 'SUPERSEDED' | 'RELEASED' | 'CANCELLED';
  generatedAt: string;
  notes?: string | null;
  productionPlan?: { id: string; planNumber: string; status: string } | null;
  lines: any[];
};

const statusLabels: Record<string, string> = {
  DRAFT: 'پیش‌نویس', APPROVED: 'تأییدشده', RELEASED: 'صادرشده به تولید',
  SUPERSEDED: 'نسخه منسوخ', CANCELLED: 'لغوشده',
};

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) {
    throw new Error(body.error || body.message || `خطای درخواست (${response.status})`);
  }
  return body.data as T;
}

export const RelationalPlanProposalView: React.FC<{ onReleased?: () => Promise<void> }> = ({ onReleased }) => {
  const { traceDocument } = useErpRouter();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [machineChoices, setMachineChoices] = useState<Record<string, string>>({});
  const [revisionNote, setRevisionNote] = useState('اصلاح تخصیص ماشین‌آلات');

  const load = useCallback(async (preferredId?: string | null) => {
    setLoading(true);
    try {
      const rows = await api<Proposal[]>('/api/planning/proposals');
      setProposals(rows || []);
      const nextId = preferredId || selectedId || rows?.[0]?.id || null;
      setSelectedId(nextId);
      if (nextId) {
        const selected = await api<any>(`/api/planning/proposals/${nextId}`);
        setDetail(selected);
        const choices: Record<string, string> = {};
        for (const line of selected.lines || []) {
          for (const assignment of (line.operationAssignments || [])) {
            choices[`${line.id}:${assignment.routeOperationId}`] = assignment.machineId || '';
          }
        }
        setMachineChoices(choices);
      } else {
        setDetail(null);
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'خطا در دریافت پیشنهادها' });
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { void load(null); }, []);

  const machines = useMemo(() => {
    const list = detail?.inputSnapshot?.masterData?.machines || [];
    return new Map(list.map((machine: any) => [machine.id, machine]));
  }, [detail]);

  const selectProposal = async (id: string) => {
    setSelectedId(id);
    setMessage(null);
    try {
      const selected = await api<any>(`/api/planning/proposals/${id}`);
      setDetail(selected);
      const choices: Record<string, string> = {};
      for (const line of selected.lines || []) {
        for (const assignment of (line.operationAssignments || [])) {
          choices[`${line.id}:${assignment.routeOperationId}`] = assignment.machineId || '';
        }
      }
      setMachineChoices(choices);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'خطا در دریافت جزئیات' });
    }
  };

  const runAction = async (action: () => Promise<any>, successText: string, released = false) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      const preferredId = result?.id || result?.proposal?.id || selectedId;
      await load(preferredId);
      setMessage({ type: 'success', text: successText });
      if (released && onReleased) await onReleased();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'عملیات ناموفق بود' });
    } finally {
      setBusy(false);
    }
  };

  const regenerate = () => runAction(
    () => api('/api/planning/proposals/regenerate', { method: 'POST', body: JSON.stringify({}) }),
    'پیشنهاد جدید از اطلاعات جاری سفارش، موجودی و WIP ساخته شد.',
  );

  const revise = () => {
    if (!detail) return;
    const changes = (detail.lines || []).map((line: any) => ({
      proposalLineId: line.id,
      operationAssignments: (line.operationAssignments || []).map((assignment: any) => ({
        routeOperationId: assignment.routeOperationId,
        machineId: machineChoices[`${line.id}:${assignment.routeOperationId}`] ?? assignment.machineId ?? null,
      })),
    }));
    return runAction(
      () => api(`/api/planning/proposals/${detail.id}/revise`, {
        method: 'POST', body: JSON.stringify({ note: revisionNote, changes }),
      }),
      'نسخه اصلاح‌شده ایجاد شد؛ نسخه قبلی به‌عنوان سابقه حفظ شد.',
    );
  };

  const approve = () => detail && runAction(
    () => api(`/api/planning/proposals/${detail.id}/approve`, {
      method: 'POST', body: JSON.stringify({ approvedBy: 'مدیر برنامه‌ریزی تولید' }),
    }),
    'پیشنهاد با موفقیت تأیید شد.',
  );

  const release = () => detail && runAction(
    () => api(`/api/planning/proposals/${detail.id}/release`, {
      method: 'POST', body: JSON.stringify({ releasedBy: 'سرپرست برنامه‌ریزی' }),
    }),
    'برنامه تولید و دستورهای ساخت به‌صورت پایدار در پایگاه داده ایجاد شدند.',
    true,
  );

  return (
    <div className="space-y-4" dir="rtl">
      <section className="sap-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#333333]">پیشنهادهای برنامه تولید</h2>
            <p className="mt-1 text-xs text-[#666666]">مبنای محاسبه: سفارش‌های تأییدشده، موجودی محصول، WIP و مسیرهای فعال تولید</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void load(selectedId)} disabled={loading || busy}
              className="sap-btn-standard px-3 py-1.5 text-xs font-semibold disabled:opacity-50 cursor-pointer">
              <RefreshCw className="ml-1 inline h-3.5 w-3.5" />بروزرسانی
            </button>
            <button type="button" onClick={regenerate} disabled={loading || busy}
              className="sap-btn-emphasized px-3 py-1.5 text-xs font-semibold disabled:opacity-50 cursor-pointer">
              <Wand2 className="ml-1 inline h-3.5 w-3.5" />تولید پیشنهاد از اطلاعات جاری
            </button>
          </div>
        </div>
        {message && <div className={`rounded border p-3 text-xs ${message.type === 'error' ? 'border-[#f5b8b8] bg-[#fde8e8] text-[#bb0000]' : 'border-[#b7dfc5] bg-[#eef8f2] text-[#107e3e]'}`}>{message.text}</div>}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="sap-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#333333]">سوابق پیشنهادها</h3>
            <span className="text-[10px] text-[#666666]">{toPersianDigits(proposals.length)} مورد</span>
          </div>
          <div className="space-y-2">
            {proposals.map(item => (
              <button key={item.id} type="button" onClick={() => void selectProposal(item.id)}
                className={`w-full rounded border p-3 text-right transition cursor-pointer ${selectedId === item.id ? 'border-[#007cc0] bg-[#e5f3fa]' : 'border-[#d9d9d9] bg-white hover:border-[#007cc0]/50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#333333] font-mono">{item.proposalNumber}</span>
                  <span className="rounded bg-[#f0f0f0] px-2 py-0.5 text-[10px] text-[#333333]">نسخه {toPersianDigits(item.version)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-[#666666]">
                  <span>{statusLabels[item.status] || item.status}</span>
                  <span>{formatToJalali(item.generatedAt)}</span>
                </div>
                <div className="mt-2 text-[10px] text-[#666666]">{toPersianDigits(item.lines?.length || 0)} ردیف برنامه</div>
              </button>
            ))}
            {!loading && proposals.length === 0 && <p className="rounded bg-[#f5f5f5] p-4 text-center text-xs text-[#666666]">هنوز پیشنهادی ساخته نشده است.</p>}
          </div>
        </aside>

        <main className="min-w-0 space-y-3">
          {!detail ? (
            <div className="sap-card border-dashed p-10 text-center text-xs text-[#666666]">برای مشاهده جزئیات، یک پیشنهاد انتخاب کنید یا پیشنهاد جدید بسازید.</div>
          ) : (
            <>
              <section className="sap-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[#333333] font-mono">{detail.proposalNumber}</h3>
                      <span className="rounded bg-[#f0f0f0] px-2 py-1 text-[10px] text-[#333333]">نسخه {toPersianDigits(detail.version)}</span>
                      <span className="rounded bg-[#e5f3fa] border border-[#b3d7ff] px-2 py-1 text-[10px] font-semibold text-[#007cc0]">{statusLabels[detail.status] || detail.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-[#666666]">{detail.notes || 'بدون توضیحات'}</p>
                  </div>
                  {detail.productionPlan && (
                    <div className="text-xs text-[#107e3e] flex items-center gap-1.5">
                      <span>برنامه صادرشده:</span>
                      <button
                        type="button"
                        onClick={() => traceDocument(detail.productionPlan.planNumber, 'WIP_TRACEABILITY')}
                        className="sap-doc-link font-mono"
                      >
                        {detail.productionPlan.planNumber}
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                  {[
                    ['ردیف تولید', detail.lines?.length || 0],
                    ['جمع تیراژ برنامه', (detail.lines || []).reduce((sum: number, line: any) => sum + Number(line.plannedQty || 0), 0)],
                    ['دارای هشدار', (detail.lines || []).filter((line: any) => (line.warnings || []).length).length],
                    ['تعداد عملیات', (detail.lines || []).reduce((sum: number, line: any) => sum + (line.operationAssignments || []).length, 0)],
                  ].map(([label, value]) => <div key={String(label)} className="rounded border border-[#e8e8e8] bg-[#fafafa] p-3 text-center"><div className="text-[10px] text-[#666666]">{label}</div><div className="mt-1 text-sm font-bold text-[#333333]">{formatNumber(Number(value))}</div></div>)}
                </div>
              </section>

              {(detail.lines || []).map((line: any) => (
                <section key={line.id} className="sap-card p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#e8e8e8] pb-3">
                    <div>
                      <div className="text-sm font-bold text-[#333333] flex items-center gap-1.5 flex-wrap">
                        <span>{line.part?.name || 'قطعه'}</span>
                        {line.part?.partNumber && (
                          <button
                            type="button"
                            onClick={() => traceDocument(line.part.partNumber, 'INVENTORY_LEDGER')}
                            className="sap-doc-link font-mono text-xs"
                          >
                            {line.part.partNumber}
                          </button>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-[#666666] flex items-center gap-1.5 flex-wrap">
                        <span>سفارش:</span>
                        {line.customerOrderLine?.order?.orderNumber ? (
                          <button
                            type="button"
                            onClick={() => traceDocument(line.customerOrderLine.order.orderNumber, 'WIP_TRACEABILITY')}
                            className="sap-doc-link font-mono"
                          >
                            {line.customerOrderLine.order.orderNumber}
                          </button>
                        ) : (
                          <span>—</span>
                        )}
                        <span>· ردیف {toPersianDigits(line.customerOrderLine?.lineNumber || 0)}</span>
                      </div>
                    </div>
                    <div className="text-left text-xs"><div className="font-bold text-[#333333]">{formatNumber(Number(line.plannedQty))} عدد</div><div className="mt-1 text-[#666666]">موعد: {formatToJalali(line.plannedEndDate)}</div></div>
                  </div>
                  {(line.warnings || []).length > 0 && <div className="rounded border border-[#f5d0a9] bg-[#fff5eb] p-2 text-xs text-[#e9730c]"><AlertTriangle className="ml-1 inline h-3.5 w-3.5" />{line.warnings.join(' · ')}</div>}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-[#666666]">تخصیص ماشین به عملیات مسیر</div>
                    {(line.operationAssignments || []).map((assignment: any) => {
                      const key = `${line.id}:${assignment.routeOperationId}`;
                      const eligible = (assignment.eligibleMachineIds || []).map((id: string) => machines.get(id)).filter(Boolean) as any[];
                      return <div key={key} className="grid grid-cols-1 items-center gap-2 rounded border border-[#e8e8e8] bg-[#fafafa] p-2 md:grid-cols-[minmax(0,1fr)_minmax(180px,280px)]">
                        <div><div className="text-xs font-semibold text-[#333333]">{toPersianDigits(assignment.stepNumber)} · {assignment.stepCode} — {assignment.stepName}</div><div className="mt-0.5 text-[10px] text-[#666666]">{assignment.dieId ? 'قالب مشخص‌شده در مسیر' : 'بدون قالب مشخص‌شده'}</div></div>
                        <select value={machineChoices[key] ?? assignment.machineId ?? ''} disabled={detail.status !== 'DRAFT' || eligible.length === 0}
                          onChange={event => setMachineChoices(prev => ({ ...prev, [key]: event.target.value }))}
                          className="w-full rounded border border-[#bfbfbf] bg-white px-2 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0] disabled:opacity-60">
                          <option value="">بدون تخصیص ماشین</option>
                          {eligible.map((machine: any) => <option key={machine.id} value={machine.id}>{machine.code} — {machine.name} ({formatNumber(Number(machine.tonnageCapacity || 0))} تن)</option>)}
                        </select>
                      </div>;
                    })}
                  </div>
                </section>
              ))}

              <section className="flex flex-wrap items-center justify-between gap-3 sap-card p-4">
                {detail.status === 'DRAFT' ? <>
                  <input value={revisionNote} onChange={event => setRevisionNote(event.target.value)} className="min-w-[220px] flex-1 rounded border border-[#bfbfbf] bg-white px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]" aria-label="توضیح بازنگری" />
                  <button type="button" onClick={revise} disabled={busy} className="sap-btn-standard px-3 py-1.5 text-xs font-semibold disabled:opacity-50 cursor-pointer"><Save className="ml-1 inline h-3.5 w-3.5" />ذخیره به‌عنوان نسخه جدید</button>
                  <button type="button" onClick={approve} disabled={busy} className="rounded bg-[#107e3e] hover:bg-[#0c6631] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"><CheckCircle2 className="ml-1 inline h-3.5 w-3.5" />تأیید پیشنهاد</button>
                </> : detail.status === 'APPROVED' ? <button type="button" onClick={release} disabled={busy} className="sap-btn-emphasized px-4 py-1.5 text-xs font-semibold disabled:opacity-50 cursor-pointer"><Send className="ml-1 inline h-3.5 w-3.5" />صدور دستورهای تولید</button> : <p className="text-xs text-[#666666]">برای این پیشنهاد اقدام دیگری در دسترس نیست.</p>}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
};
