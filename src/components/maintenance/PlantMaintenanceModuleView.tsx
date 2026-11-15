import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Wrench,
  Cpu,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Layers,
  Activity,
  Gauge,
  SlidersHorizontal,
  FileText,
  DollarSign,
  UserCheck,
  ShieldAlert,
  ChevronRight,
  TrendingUp,
  X,
  Printer,
  Download,
  Boxes,
  Zap,
} from 'lucide-react';
import {
  MaintenanceRequest,
  PreventiveMaintenancePlan,
  MaintenanceSparePart,
  TpmMetricsSummary,
  MaintenanceStage,
  MaintenancePriority,
  FailureCategory,
  PmScheduleFrequency,
} from '../../types/maintenance';
import { Machine, DieMold, Operator } from '../../types/inventory';
import { formatNumber, toPersianDigits } from '../../utils/formatters';

interface PlantMaintenanceModuleViewProps {
  machines: Machine[];
  dies?: DieMold[];
  operators?: Operator[];
  onRefreshGlobalData?: () => Promise<void>;
}

type MaintenanceSubTab =
  | 'WORK_ORDERS'
  | 'PREVENTIVE_PLANS'
  | 'EQUIPMENT_LEDGER'
  | 'DIE_TOOLING'
  | 'SPARE_PARTS'
  | 'TPM_ANALYTICS';

const STAGE_LABELS: Record<MaintenanceStage, { label: string; color: string; badgeBg: string }> = {
  NEW: { label: 'درخواست جدید', color: 'text-blue-700', badgeBg: 'bg-blue-50 border-blue-200' },
  IN_PROGRESS: { label: 'در دست اقدام نت', color: 'text-amber-700', badgeBg: 'bg-amber-50 border-amber-200' },
  WAITING_SPARES: { label: 'در انتظار قطعه یدکی', color: 'text-[#e9730c]', badgeBg: 'bg-[#fff5eb] border-[#f5d0a9]' },
  REPAIRED: { label: 'تعمیر شده / تست ضرب', color: 'text-emerald-700', badgeBg: 'bg-emerald-50 border-emerald-200' },
  CLOSED: { label: 'تأیید کیفی و بسته‌شده', color: 'text-slate-600', badgeBg: 'bg-slate-100 border-slate-300' },
};

const PRIORITY_BADGES: Record<MaintenancePriority, { label: string; cls: string }> = {
  LOW: { label: 'عادی', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  MEDIUM: { label: 'متوسط', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  HIGH: { label: 'فوری / توقف خط', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
  CRITICAL: { label: 'بحرانی / خطر ایمنی', cls: 'bg-rose-50 text-rose-800 border-rose-300 font-bold' },
};

const FAILURE_CATEGORY_LABELS: Record<FailureCategory, string> = {
  MECHANICAL: 'مکانیکی (شاتون، یاتاقان، لقی)',
  ELECTRICAL: 'برق و اتوماسیون (سنسور، رله، PLC)',
  HYDRAULIC: 'هیدرولیک (پمپ، پکینگ، شیر برقی)',
  PNEUMATIC: 'پنوماتیک (کلاچ، ترمز، رگلاتور)',
  DIE_MOLD: 'قالب و سنبه‌ماتریس (شکست فنر، پریدگی لبه)',
  OPERATOR_ERROR: 'خطای اپراتوری یا بارگذاری ورق',
  LUBRICATION: 'روانکاری و داغ‌کردن قطعات',
};

export const PlantMaintenanceModuleView: React.FC<PlantMaintenanceModuleViewProps> = ({
  machines,
  dies = [],
  operators = [],
  onRefreshGlobalData,
}) => {
  const [activeTab, setActiveTab] = useState<MaintenanceSubTab>('WORK_ORDERS');
  const [loading, setLoading] = useState(false);

  // Data Stores
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [pmPlans, setPmPlans] = useState<PreventiveMaintenancePlan[]>([]);
  const [spareParts, setSpareParts] = useState<MaintenanceSparePart[]>([]);
  const [tpmMetrics, setTpmMetrics] = useState<TpmMetricsSummary | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMachineFilter, setSelectedMachineFilter] = useState('ALL');
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState('ALL');
  const [selectedStageFilter, setSelectedStageFilter] = useState('ALL');

  // Modals
  const [isNewRequestModalOpen, setIsNewRequestModalOpen] = useState(false);
  const [isNewPmModalOpen, setIsNewPmModalOpen] = useState(false);
  const [selectedRequestDetails, setSelectedRequestDetails] = useState<MaintenanceRequest | null>(null);
  const [selectedPmForExecution, setSelectedPmForExecution] = useState<PreventiveMaintenancePlan | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  // Form States for New Request
  const [newReqTitle, setNewReqTitle] = useState('');
  const [newReqMachineId, setNewReqMachineId] = useState(machines[0]?.id || 'MCH-01');
  const [newReqDieId, setNewReqDieId] = useState('');
  const [newReqType, setNewReqType] = useState<MaintenanceRequest['type']>('CORRECTIVE');
  const [newReqPriority, setNewReqPriority] = useState<MaintenancePriority>('HIGH');
  const [newReqCategory, setNewReqCategory] = useState<FailureCategory>('HYDRAULIC');
  const [newReqDescription, setNewReqDescription] = useState('');
  const [newReqReporter, setNewReqReporter] = useState('سرپرست سالن پرس');
  const [newReqTeam, setNewReqTeam] = useState('تیم مکانیک و هیدرولیک');

  // Load All Data from Server
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes, pmRes, sparesRes, metricsRes] = await Promise.all([
        fetch('/api/maintenance/requests').then(r => r.json()),
        fetch('/api/maintenance/pm-plans').then(r => r.json()),
        fetch('/api/maintenance/spare-parts').then(r => r.json()),
        fetch('/api/maintenance/tpm-metrics').then(r => r.json()),
      ]);

      if (reqRes.success) setRequests(reqRes.data);
      if (pmRes.success) setPmPlans(pmRes.data);
      if (sparesRes.success) setSpareParts(sparesRes.data);
      if (metricsRes.success) setTpmMetrics(metricsRes.data);
    } catch (err) {
      console.error('Failed to load maintenance data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Create New Request
  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const selMachine = machines.find(m => m.id === newReqMachineId);
    const selDie = dies.find(d => d.id === newReqDieId);

    try {
      const res = await fetch('/api/maintenance/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newReqTitle,
          machineId: newReqMachineId,
          machineCode: selMachine?.code || 'PRS-800T',
          machineName: selMachine?.name || 'پرس هیدرولیک ۸۰۰ تن',
          dieMoldId: selDie?.id,
          dieMoldName: selDie?.name,
          type: newReqType,
          priority: newReqPriority,
          failureCategory: newReqCategory,
          description: newReqDescription,
          reportedBy: newReqReporter,
          team: newReqTeam,
          requestedDate: new Date().toLocaleDateString('fa-IR'),
          downtimeMinutes: newReqPriority === 'CRITICAL' || newReqPriority === 'HIGH' ? 45 : 0,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsNewRequestModalOpen(false);
        setNewReqTitle('');
        setNewReqDescription('');
        setFeedbackNotice(data.message || 'درخواست با موفقیت ثبت شد.');
        await loadData();
        if (onRefreshGlobalData) await onRefreshGlobalData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Change Request Stage
  const handleUpdateStage = async (id: string, nextStage: MaintenanceStage) => {
    try {
      const res = await fetch(`/api/maintenance/requests/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: nextStage }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackNotice(`وضعیت درخواست به «${STAGE_LABELS[nextStage].label}» تغییر یافت.`);
        await loadData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Mark PM Complete
  const handleCompletePm = async (planId: string) => {
    try {
      const res = await fetch(`/api/maintenance/pm-plans/${planId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executionDate: new Date().toLocaleDateString('fa-IR'),
          notes: 'تمام آیتم‌های چک‌لیست بازرسی، روان‌کاری و آچارکشی با تأیید سرپرست نت انجام شد.',
          technician: 'تیم کشیک نت',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedPmForExecution(null);
        setFeedbackNotice(data.message || 'سرویس نت پیشگیرانه ثبت شد.');
        await loadData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Filtered Requests
  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      if (selectedMachineFilter !== 'ALL' && r.machineId !== selectedMachineFilter) return false;
      if (selectedPriorityFilter !== 'ALL' && r.priority !== selectedPriorityFilter) return false;
      if (selectedStageFilter !== 'ALL' && r.stage !== selectedStageFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          r.title.toLowerCase().includes(q) ||
          r.requestCode.toLowerCase().includes(q) ||
          r.machineName.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [requests, selectedMachineFilter, selectedPriorityFilter, selectedStageFilter, searchQuery]);

  return (
    <div className="space-y-5 text-right font-sans" dir="rtl">
      {/* Module Header (SAP Fiori) */}
      <div className="sap-card p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm bg-[#e5f3fa] border border-[#b3ddf2] text-[#007cc0] flex items-center justify-center shrink-0">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-[#333333] flex items-center gap-2 flex-wrap">
                <span>مدیریت نگهداری و تعمیرات، قابلیت اطمینان و TPM تجهیزات</span>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-sm bg-[#f5f5f5] text-[#333333] border border-[#d9d9d9]">
                  SAP PM / TPM Reliability Workbench
                </span>
              </h1>
              <p className="text-xs text-[#666666] mt-0.5">
                ثبت درخواست‌های تعمیرات شکست، پایش توقفات، تقویم سرویس‌های دوره‌ای (PM)، شمارنده ضرب قالب‌ها و قطعات یدکی
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs"
              title="بروزرسانی داده‌ها"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#007cc0]' : ''}`} />
              <span>بروزرسانی</span>
            </button>
            <button
              type="button"
              onClick={() => setIsNewRequestModalOpen(true)}
              className="sap-btn-emphasized flex items-center gap-1.5 px-3.5 py-1.5 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ثبت درخواست تعمیرات (Breakdown/CM)</span>
            </button>
          </div>
        </div>

        {/* Feedback Notice */}
        {feedbackNotice && (
          <div className="p-3 bg-[#ebf7ef] border border-[#a9dfbf] text-[#107e3e] rounded-sm flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#107e3e]" />
              <span>{feedbackNotice}</span>
            </div>
            <button type="button" onClick={() => setFeedbackNotice(null)} className="cursor-pointer">
              ✕
            </button>
          </div>
        )}

        {/* Sub-Tabs Navigation */}
        <div className="pt-3 border-t border-[#e8e8e8] flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'WORK_ORDERS', label: 'دستورکارهای تعمیرات (CM)', count: requests.length },
              { id: 'PREVENTIVE_PLANS', label: 'سرویس‌های دوره‌ای (PM)', count: pmPlans.length },
              { id: 'EQUIPMENT_LEDGER', label: 'شناسنامه خطوط و پرس‌ها', count: machines.length },
              { id: 'DIE_TOOLING', label: 'نت و ضرب قالب‌های سنبه‌ماتریس', count: dies.length },
              { id: 'SPARE_PARTS', label: 'انبار قطعات یدکی نت', count: spareParts.length },
              { id: 'TPM_ANALYTICS', label: 'شاخص‌های TPM و قابلیت اطمینان (MTBF/MTTR)' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as MaintenanceSubTab)}
                className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-colors cursor-pointer border flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-[#e5f3fa] text-[#007cc0] border-[#007cc0] font-bold'
                    : 'bg-[#ffffff] hover:bg-[#f5f5f5] text-[#666666] border-[#d9d9d9]'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-sm bg-[#f0f0f0] text-[#333333]">
                    {toPersianDigits(tab.count)}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="text-[11px] text-[#666666]">
            توقفات ثبت‌شده: {toPersianDigits(tpmMetrics?.totalDowntimeHours || 0)} ساعت • MTBF:{' '}
            {toPersianDigits(tpmMetrics?.mtbfHours || 0)} ساعت
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: KANBAN & WORK ORDERS (ODOO MAINTENANCE WORK ORDERS)           */}
      {/* ==================================================================== */}
      {activeTab === 'WORK_ORDERS' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="sap-card p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative min-w-[200px] flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-[#666666]" />
                <input
                  type="text"
                  placeholder="جستجو در کد، عنوان، ماشین یا شرح عیب..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm pr-8 pl-3 py-1.5 text-xs text-[#333333] placeholder-[#888888] focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <select
                value={selectedMachineFilter}
                onChange={e => setSelectedMachineFilter(e.target.value)}
                className="bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-2.5 py-1.5 text-xs text-[#333333] font-medium"
              >
                <option value="ALL">همه پرس‌ها و ماشین‌آلات</option>
                {machines.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.code})
                  </option>
                ))}
              </select>

              <select
                value={selectedPriorityFilter}
                onChange={e => setSelectedPriorityFilter(e.target.value)}
                className="bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-2.5 py-1.5 text-xs text-[#333333] font-medium"
              >
                <option value="ALL">همه اولویت‌ها</option>
                <option value="CRITICAL">بحرانی / خطر ایمنی</option>
                <option value="HIGH">فوری / توقف خط</option>
                <option value="MEDIUM">متوسط</option>
                <option value="LOW">عادی</option>
              </select>
            </div>

            <span className="text-[#666666] text-[11px]">
              تعداد دستور کارها: {toPersianDigits(filteredRequests.length)}
            </span>
          </div>

          {/* Kanban Board Columns (New -> In Progress -> Waiting Spares -> Repaired -> Closed) */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 overflow-x-auto pb-2">
            {(['NEW', 'IN_PROGRESS', 'WAITING_SPARES', 'REPAIRED', 'CLOSED'] as MaintenanceStage[]).map(stageKey => {
              const stageRequests = filteredRequests.filter(r => r.stage === stageKey);
              const meta = STAGE_LABELS[stageKey];

              return (
                <div
                  key={stageKey}
                  className="bg-[#f7f7f7] border border-[#d9d9d9] rounded-sm p-3 flex flex-col min-w-[240px] space-y-2.5"
                >
                  <div className="flex items-center justify-between border-b border-[#d9d9d9] pb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-[#333333]">{meta.label}</span>
                    </div>
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-sm bg-[#ffffff] text-[#333333] border border-[#d9d9d9]">
                      {toPersianDigits(stageRequests.length)}
                    </span>
                  </div>

                  <div className="space-y-2 flex-1 overflow-y-auto max-h-[600px] pr-0.5">
                    {stageRequests.length === 0 ? (
                      <div className="text-center py-8 text-[#666666] text-[11px] border border-dashed border-[#d9d9d9] rounded-sm">
                        بدون دستور کار
                      </div>
                    ) : (
                      stageRequests.map(item => (
                        <div
                          key={item.id}
                          className="bg-[#ffffff] border border-[#d9d9d9] hover:border-[#007cc0] rounded-sm p-3 space-y-2 transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[10px] text-[#333333] font-bold bg-[#f5f5f5] px-1.5 py-0.5 rounded-sm border border-[#d9d9d9]">
                              {item.requestCode}
                            </span>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded-sm border font-semibold ${
                                PRIORITY_BADGES[item.priority].cls
                              }`}
                            >
                              {PRIORITY_BADGES[item.priority].label}
                            </span>
                          </div>

                          <h4 className="font-bold text-xs text-[#333333] leading-snug line-clamp-2">
                            {item.title}
                          </h4>

                          <div className="space-y-1 text-[10px] text-[#666666] bg-[#f7f7f7] p-2 rounded-sm border border-[#e8e8e8]">
                            <div className="flex items-center justify-between">
                              <span className="text-[#666666]">تجهیز:</span>
                              <strong className="text-[#333333]">{item.machineName}</strong>
                            </div>
                            {item.dieMoldName && (
                              <div className="flex items-center justify-between">
                                <span className="text-[#666666]">قالب:</span>
                                <span className="text-[#007cc0] font-medium truncate max-w-[130px]">
                                  {item.dieMoldName}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <span className="text-[#666666]">توقف خط:</span>
                              <strong className="text-[#bb0000] font-mono">
                                {formatNumber(item.downtimeMinutes)} دقیقه
                              </strong>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[#666666]">تیم فنی:</span>
                              <span>{item.team}</span>
                            </div>
                          </div>

                          {/* Quick Stage Transitions */}
                          <div className="pt-2 border-t border-[#e8e8e8] flex items-center justify-between gap-1 text-[10px]">
                            {stageKey === 'NEW' && (
                              <button
                                type="button"
                                onClick={() => handleUpdateStage(item.id, 'IN_PROGRESS')}
                                className="w-full py-1 bg-[#e9730c] hover:bg-[#d16308] text-white rounded-sm font-bold cursor-pointer transition text-center"
                              >
                                شروع اقدام نت
                              </button>
                            )}
                            {stageKey === 'IN_PROGRESS' && (
                              <div className="grid grid-cols-2 gap-1 w-full">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateStage(item.id, 'WAITING_SPARES')}
                                  className="py-1 bg-[#fff4e5] hover:bg-[#ffe8c7] text-[#e9730c] rounded-sm border border-[#f9d6a7] font-bold cursor-pointer transition"
                                >
                                  انتظار قطعه
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateStage(item.id, 'REPAIRED')}
                                  className="py-1 bg-[#107e3e] hover:bg-[#0d6832] text-white rounded-sm font-bold cursor-pointer transition"
                                >
                                  تعمیر شد
                                </button>
                              </div>
                            )}
                            {stageKey === 'WAITING_SPARES' && (
                              <button
                                type="button"
                                onClick={() => handleUpdateStage(item.id, 'IN_PROGRESS')}
                                className="w-full py-1 bg-[#e5f3fa] hover:bg-[#d0ebf7] text-[#007cc0] rounded-sm border border-[#b3ddf2] font-bold cursor-pointer transition"
                              >
                                دریافت قطعه و ادامه
                              </button>
                            )}
                            {stageKey === 'REPAIRED' && (
                              <button
                                type="button"
                                onClick={() => handleUpdateStage(item.id, 'CLOSED')}
                                className="sap-btn-emphasized w-full py-1 font-bold text-center"
                              >
                                تأیید QC و بستن
                              </button>
                            )}
                            {stageKey === 'CLOSED' && (
                              <span className="w-full text-center text-[#107e3e] font-bold py-0.5">
                                ✓ رفع عیب و تحویل
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: PREVENTIVE MAINTENANCE (PM) SCHEDULES & CHECKLISTS            */}
      {/* ==================================================================== */}
      {activeTab === 'PREVENTIVE_PLANS' && (
        <div className="space-y-4">
          <div className="p-3 rounded-sm bg-[#e5f3fa] border border-[#b3ddf2] text-xs text-[#333333] flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#007cc0] shrink-0" />
              <span>
                <strong>برنامه‌ریزی نت پیشگیرانه (PM):</strong> سرویس‌های برنامه‌ریزی‌شده بر اساس تقویم هفتگی/ماهانه یا تعداد ضرب قالب (Stroke Counter) جهت جلوگیری از خرابی‌های ناگهانی خطوط پرسکاری.
              </span>
            </div>
            <span className="font-mono text-xs bg-[#ffffff] px-2 py-1 rounded-sm border border-[#b3ddf2] font-bold text-[#007cc0]">
              نرخ اجرای به موقع PM: {toPersianDigits(tpmMetrics?.preventiveComplianceRate || 92)}٪
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pmPlans.map(plan => {
              const isDue = plan.status === 'DUE' || plan.status === 'OVERDUE';

              return (
                <div
                  key={plan.id}
                  className={`sap-card p-4 space-y-3 transition-all ${
                    isDue ? 'border-r-4 border-r-[#e9730c]' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 border-b border-[#e8e8e8] pb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[#333333] font-bold bg-[#f5f5f5] border border-[#d9d9d9] px-2 py-0.5 rounded-sm">
                          {plan.planCode}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-sm bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2]">
                          {plan.frequency === 'DAILY'
                            ? 'روزانه'
                            : plan.frequency === 'WEEKLY'
                            ? 'هفتگی'
                            : plan.frequency === 'MONTHLY'
                            ? 'ماهانه'
                            : 'بر اساس تعداد ضرب'}
                        </span>
                      </div>
                      <h3 className="font-bold text-sm text-[#333333] mt-1">{plan.title}</h3>
                    </div>

                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-sm font-bold border ${
                        plan.status === 'COMPLETED'
                          ? 'bg-[#ebf7ef] text-[#107e3e] border-[#a9dfbf]'
                          : isDue
                          ? 'bg-[#fff4e5] text-[#e9730c] border-[#f9d6a7]'
                          : 'bg-[#f5f5f5] text-[#333333] border-[#d9d9d9]'
                      }`}
                    >
                      {plan.status === 'COMPLETED'
                        ? 'انجام‌شده'
                        : isDue
                        ? 'سررسید شده'
                        : 'زمان‌بندی‌شده'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-[#f7f7f7] p-2.5 rounded-sm border border-[#e8e8e8]">
                    <div>
                      <span className="text-[#666666] text-[11px] block">تجهیز مرتبط:</span>
                      <strong className="text-[#333333]">{plan.machineName}</strong>
                    </div>
                    <div>
                      <span className="text-[#666666] text-[11px] block">تیم مجری:</span>
                      <span className="text-[#333333]">{plan.assignedTeam}</span>
                    </div>
                    <div>
                      <span className="text-[#666666] text-[11px] block">آخرین اجرا:</span>
                      <span className="font-mono text-[#333333]">{plan.lastPerformedDate || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[#666666] text-[11px] block">موعد بعدی:</span>
                      <strong className="font-mono text-[#e9730c]">{plan.nextDueDate}</strong>
                    </div>
                  </div>

                  {/* Checklist Items */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-[#333333] block">
                      آیتم‌های چک‌لیست بازرسی و سرویس ({toPersianDigits(plan.checklistItems.length)} مورد):
                    </span>
                    <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                      {plan.checklistItems.map((chk, cIdx) => (
                        <div
                          key={chk.id || cIdx}
                          className="flex items-start justify-between bg-[#f7f7f7] p-2 rounded-sm text-[11px] border border-[#e8e8e8]"
                        >
                          <div className="flex items-start gap-1.5 flex-1">
                            <span className="font-mono text-[10px] text-[#666666] shrink-0">
                              {toPersianDigits(cIdx + 1)}.
                            </span>
                            <span className="text-[#333333] leading-snug">{chk.taskDescription}</span>
                          </div>
                          {chk.standardValue && (
                            <span className="text-[10px] font-mono text-[#666666] bg-[#ffffff] px-1.5 py-0.5 rounded-sm border border-[#d9d9d9] shrink-0 mr-2">
                              {chk.standardValue}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="pt-2 border-t border-[#e8e8e8] flex items-center justify-between">
                    <span className="text-[11px] text-[#666666]">
                      زمان تخمینی: {toPersianDigits(plan.estimatedDurationMinutes)} دقیقه
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCompletePm(plan.id)}
                      className="sap-btn-emphasized px-3.5 py-1.5 text-xs flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>ثبت انجام کامل سرویس PM</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: EQUIPMENT & PRESS MACHINES LEDGER                             */}
      {/* ==================================================================== */}
      {activeTab === 'EQUIPMENT_LEDGER' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {machines.map(m => {
              const machineRequests = requests.filter(r => r.machineId === m.id);
              const totalMchDowntime = machineRequests.reduce(
                (sum, r) => sum + (Number(r.downtimeMinutes) || 0),
                0
              );

              return (
                <div
                  key={m.id}
                  className="sap-card p-4 space-y-3"
                >
                  <div className="flex items-start justify-between border-b border-[#e8e8e8] pb-2.5">
                    <div>
                      <span className="font-mono text-xs font-bold text-[#333333] bg-[#f5f5f5] border border-[#d9d9d9] px-2 py-0.5 rounded-sm">
                        {m.code}
                      </span>
                      <h3 className="font-bold text-sm text-[#333333] mt-1">{m.name}</h3>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-sm font-bold border ${
                        m.status === 'ACTIVE'
                          ? 'bg-[#ebf7ef] text-[#107e3e] border-[#a9dfbf]'
                          : m.status === 'MAINTENANCE'
                          ? 'bg-[#ffecec] text-[#bb0000] border-[#f5b7b1]'
                          : 'bg-[#fff4e5] text-[#e9730c] border-[#f9d6a7]'
                      }`}
                    >
                      {m.status === 'ACTIVE' ? 'در حال تولید' : m.status === 'MAINTENANCE' ? 'تحت تعمیرات' : 'متوقف'}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between py-1 border-b border-[#e8e8e8]">
                      <span className="text-[#666666]">تناژ اسمی:</span>
                      <strong className="text-[#333333] font-mono">
                        {m.tonnage ? `${formatNumber(m.tonnage)} تن` : '—'}
                      </strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#e8e8e8]">
                      <span className="text-[#666666]">ابعاد میز و کورس:</span>
                      <span className="font-mono text-[#333333]">{m.bolsterSize || '—'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#e8e8e8]">
                      <span className="text-[#666666]">محل استقرار:</span>
                      <span className="text-[#333333]">{m.location}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#e8e8e8]">
                      <span className="text-[#666666]">توقفات ثبت‌شده در شیفت:</span>
                      <strong className="text-[#bb0000] font-mono">
                        {toPersianDigits(totalMchDowntime)} دقیقه
                      </strong>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-[#666666]">تعداد خرابی‌های شکست:</span>
                      <strong className="text-[#333333] font-mono">
                        {toPersianDigits(machineRequests.length)} مورد
                      </strong>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#e8e8e8] flex items-center justify-between">
                    <span className="text-[11px] text-[#666666]">اپراتور: {m.operatorName || 'شیفت عمومی'}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setNewReqMachineId(m.id);
                        setIsNewRequestModalOpen(true);
                      }}
                      className="sap-btn-standard px-2.5 py-1 text-xs"
                    >
                      + ثبت خرابی
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: DIE & MOLD TOOLING LIFESPAN & STROKE COUNTERS                 */}
      {/* ==================================================================== */}
      {activeTab === 'DIE_TOOLING' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {dies.map(die => {
              const currentStrokes = die.currentStrokes || 0;
              const targetLife = die.strokeLifeTarget || 200000;
              const wearPercent = Math.min(100, Math.round((currentStrokes / targetLife) * 100));

              return (
                <div
                  key={die.id}
                  className="sap-card p-4 space-y-3"
                >
                  <div className="flex items-start justify-between border-b border-[#e8e8e8] pb-2.5">
                    <div>
                      <span className="font-mono text-xs font-bold text-[#333333] bg-[#f5f5f5] border border-[#d9d9d9] px-2 py-0.5 rounded-sm">
                        {die.code}
                      </span>
                      <h3 className="font-bold text-sm text-[#333333] mt-1">{die.name}</h3>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-sm font-bold border ${
                        die.status === 'READY'
                          ? 'bg-[#ebf7ef] text-[#107e3e] border-[#a9dfbf]'
                          : die.status === 'UNDER_MAINTENANCE'
                          ? 'bg-[#ffecec] text-[#bb0000] border-[#f5b7b1]'
                          : 'bg-[#fff4e5] text-[#e9730c] border-[#f9d6a7]'
                      }`}
                    >
                      {die.status === 'READY'
                        ? 'آماده پرسکاری'
                        : die.status === 'UNDER_MAINTENANCE'
                        ? 'در دست پولیش/تیزکاری'
                        : 'کالیبراسیون و فیلرگیری'}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-[#666666]">میزان کارکرد و استهلاک سنبه‌ماتریس:</span>
                        <strong className="font-mono text-[#333333]">{toPersianDigits(wearPercent)}٪</strong>
                      </div>
                      <div className="w-full bg-[#e8e8e8] h-2 rounded-sm overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            wearPercent > 80 ? 'bg-[#bb0000]' : wearPercent > 50 ? 'bg-[#e9730c]' : 'bg-[#107e3e]'
                          }`}
                          style={{ width: `${wearPercent}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex justify-between py-1 border-b border-[#e8e8e8]">
                      <span className="text-[#666666]">تعداد ضرب زده‌شده:</span>
                      <strong className="font-mono text-[#333333]">
                        {formatNumber(currentStrokes)} / {formatNumber(targetLife)} ضرب
                      </strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#e8e8e8]">
                      <span className="text-[#666666]">تناژ مورد نیاز:</span>
                      <span className="font-mono text-[#333333]">{formatNumber(die.requiredTonnage || 250)} تن</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-[#666666]">محل نگهداری در انبار قالب:</span>
                      <span className="text-[#333333] font-medium">{die.location || 'قفسه عمومی'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 5: SPARE PARTS INVENTORY FOR MAINTENANCE                         */}
      {/* ==================================================================== */}
      {activeTab === 'SPARE_PARTS' && (
        <div className="space-y-4">
          <div className="sap-card overflow-hidden">
            <div className="p-4 border-b border-[#d9d9d9] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-[#333333]">انبار قطعات یدکی بحرانی و لوازم مصرفی نت</h3>
                <p className="text-xs text-[#666666] mt-0.5">
                  پکینگ‌های هیدرولیک، شیرهای پروپورشنال، فنرهای نیتروژنی، روغن هیدرولیک و سنسورهای پرده نوری
                </p>
              </div>
              <span className="text-xs text-[#666666]">
                کل اقلام یدکی: {toPersianDigits(spareParts.length)} قلم
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="sap-table-compact w-full text-right text-xs">
                <thead>
                  <tr>
                    <th>کد قطعه</th>
                    <th>نام قطعه یدکی و مشخصات فنی</th>
                    <th>دسته‌بندی فنی</th>
                    <th className="text-center">موجودی فعلی</th>
                    <th className="text-center">نقطه سفارش (حداقل)</th>
                    <th>دستگاه‌های سازگار</th>
                    <th>موقعیت در انبار نت</th>
                    <th className="text-left">ارزش واحد (ریال)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e8e8]">
                  {spareParts.map(sp => {
                    const isLowStock = sp.currentStock <= sp.minStockAlert;

                    return (
                      <tr key={sp.id} className="hover:bg-[#f5f5f5] transition">
                        <td className="font-mono font-bold text-[#007cc0]">{sp.code}</td>
                        <td className="font-bold text-[#333333]">{sp.name}</td>
                        <td>
                          <span className="px-2 py-0.5 rounded-sm text-[10px] bg-[#f5f5f5] text-[#333333] border border-[#d9d9d9] font-mono">
                            {sp.category}
                          </span>
                        </td>
                        <td className="text-center font-mono font-bold tabular-nums">
                          <span
                            className={`px-2 py-0.5 rounded-sm ${
                              isLowStock
                                ? 'bg-[#ffecec] text-[#bb0000] border border-[#f5b7b1] font-bold'
                                : 'text-[#333333]'
                            }`}
                          >
                            {formatNumber(sp.currentStock)} {sp.unit}
                          </span>
                        </td>
                        <td className="text-center font-mono text-[#666666] tabular-nums">
                          {formatNumber(sp.minStockAlert)} {sp.unit}
                        </td>
                        <td className="text-[#666666] font-mono text-[11px]">
                          {sp.compatibleMachines.join('، ') || 'عمومی'}
                        </td>
                        <td className="text-[#666666]">{sp.storageLocation}</td>
                        <td className="text-left font-mono font-bold text-[#333333] tabular-nums">
                          {sp.unitPrice ? `${formatNumber(sp.unitPrice)}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 6: TPM ANALYTICS, MTBF, MTTR & RELIABILITY DASHBOARD             */}
      {/* ==================================================================== */}
      {activeTab === 'TPM_ANALYTICS' && tpmMetrics && (
        <div className="space-y-4">
          {/* Top 4 KPI Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="sap-card border-r-4 border-r-[#107e3e] p-3.5 space-y-1">
              <span className="text-[11px] text-[#666666] font-medium">MTBF (میانگین زمان بین خرابی‌ها)</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-bold font-mono text-[#333333] tabular-nums">
                  {toPersianDigits(tpmMetrics.mtbfHours)}
                </span>
                <span className="text-xs text-[#666666]">ساعت</span>
              </div>
              <p className="text-[10px] text-[#107e3e] font-medium">شاخص پایداری و سلامت تجهیزات کارخانه</p>
            </div>

            <div className="sap-card border-r-4 border-r-[#e9730c] p-3.5 space-y-1">
              <span className="text-[11px] text-[#666666] font-medium">MTTR (میانگین زمان تعمیر تجهیز)</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-bold font-mono text-[#e9730c] tabular-nums">
                  {toPersianDigits(tpmMetrics.mttrHours)}
                </span>
                <span className="text-xs text-[#666666]">ساعت</span>
              </div>
              <p className="text-[10px] text-[#e9730c] font-medium">سرعت پاسخ‌دهی و مهارت تکنسین‌های نت</p>
            </div>

            <div className="sap-card border-r-4 border-r-[#107e3e] p-3.5 space-y-1">
              <span className="text-[11px] text-[#666666] font-medium">نرخ دسترسی تجهیزات (Availability)</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-bold font-mono text-[#107e3e] tabular-nums">
                  {toPersianDigits(tpmMetrics.availabilityRatePercent)}٪
                </span>
              </div>
              <p className="text-[10px] text-[#666666] font-medium">زمان آماده‌به‌کاری نسبت به برنامه شیفت</p>
            </div>

            <div className="sap-card border-r-4 border-r-[#007cc0] p-3.5 space-y-1">
              <span className="text-[11px] text-[#666666] font-medium">نسبت نت برنامه‌ریزی‌شده (PMP Ratio)</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-xl font-bold font-mono text-[#007cc0] tabular-nums">
                  {toPersianDigits(tpmMetrics.pmpRatio)}٪
                </span>
              </div>
              <p className="text-[10px] text-[#007cc0] font-medium">غلبه نت پیشگیرانه بر توقفات اضطراری</p>
            </div>
          </div>

          {/* Breakdown Pareto Breakdown by Cause */}
          <div className="sap-card p-4 space-y-3.5">
            <div>
              <h3 className="font-bold text-sm text-[#333333]">پارتوی علل ریشه‌ای توقفات خطوط پرسکاری</h3>
              <p className="text-xs text-[#666666] mt-0.5">
                تفکیک دقایق توقف خطوط بر اساس منشأ خرابی (سیستم هیدرولیک، قالب و سنبه، مدار برق، پنوماتیک)
              </p>
            </div>

            <div className="space-y-3">
              {tpmMetrics.topFailureCauses.map(item => {
                const label = FAILURE_CATEGORY_LABELS[item.cause as FailureCategory] || item.cause;

                return (
                  <div key={item.cause} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#333333]">{label}</span>
                      <div className="flex items-center gap-2 font-mono tabular-nums">
                        <span className="text-[#666666]">
                          {toPersianDigits(item.count)} حادثه ({formatNumber(item.downtimeMinutes)} دقیقه)
                        </span>
                        <strong className="text-[#333333]">{toPersianDigits(item.percentage)}٪</strong>
                      </div>
                    </div>
                    <div className="w-full bg-[#e8e8e8] h-2 rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-[#007cc0] transition-all"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CREATE NEW MAINTENANCE REQUEST (BREAKDOWN / CORRECTIVE)       */}
      {/* ==================================================================== */}
      {isNewRequestModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#333333]/40 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-[#d9d9d9] rounded-sm max-w-lg w-full p-5 shadow-md space-y-4 text-right text-xs">
            <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-sm bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2]">
                  <Wrench className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-sm text-[#333333]">
                  ثبت درخواست جدید تعمیرات خط و ماشین‌آلات (Corrective Maintenance)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setIsNewRequestModalOpen(false)}
                className="text-[#666666] hover:text-[#333333] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="space-y-3">
              <div>
                <label className="block font-bold text-[#333333] mb-1">عنوان خلاصه عیب یا خرابی *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: نشت روغن هیدرولیک سیلندر بالشتک یا شکست پین پران"
                  value={newReqTitle}
                  onChange={e => setNewReqTitle(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 font-medium text-[#333333] focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#333333] mb-1">پرس یا دستگاه دچار عیب *</label>
                  <select
                    value={newReqMachineId}
                    onChange={e => setNewReqMachineId(e.target.value)}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs font-bold text-[#333333]"
                  >
                    {machines.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#333333] mb-1">قالب روی دستگاه (اختیاری)</label>
                  <select
                    value={newReqDieId}
                    onChange={e => setNewReqDieId(e.target.value)}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333]"
                  >
                    <option value="">بدون درگیری قالب</option>
                    {dies.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-[#333333] mb-1">سطح اولویت و حساسیت *</label>
                  <select
                    value={newReqPriority}
                    onChange={e => setNewReqPriority(e.target.value as MaintenancePriority)}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs font-bold text-[#333333]"
                  >
                    <option value="CRITICAL">بحرانی / خطر ایمنی یا خرابی فاجعه‌بار</option>
                    <option value="HIGH">فوری / توقف کامل خط تولید</option>
                    <option value="MEDIUM">متوسط / توقف احتمالی در ساعات آتی</option>
                    <option value="LOW">عادی / سرویس در اولین فرصت توقف</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-[#333333] mb-1">دسته‌بندی فنی عیب *</label>
                  <select
                    value={newReqCategory}
                    onChange={e => setNewReqCategory(e.target.value as FailureCategory)}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333]"
                  >
                    <option value="HYDRAULIC">هیدرولیک (پمپ، پکینگ، شیر)</option>
                    <option value="DIE_MOLD">قالب و سنبه‌ماتریس (شکست، پریدگی)</option>
                    <option value="ELECTRICAL">برق و اتوماسیون (سنسور، پرده نوری)</option>
                    <option value="MECHANICAL">مکانیکی (شاتون، یاتاقان، لقی)</option>
                    <option value="PNEUMATIC">پنوماتیک (کلاچ، ترمز، فیلتر)</option>
                    <option value="LUBRICATION">روانکاری و داغ‌کردن قطعات</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#333333] mb-1">شرح دقیق عیب و نشانه‌های مشاهده‌شده</label>
                <textarea
                  rows={3}
                  placeholder="علائم، صدای غیرعادی، فشار سنج‌ها، وضعیت قطعه خروجی..."
                  value={newReqDescription}
                  onChange={e => setNewReqDescription(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#e8e8e8]">
                <button
                  type="button"
                  onClick={() => setIsNewRequestModalOpen(false)}
                  className="sap-btn-standard px-4 py-1.5 font-bold"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="sap-btn-emphasized px-5 py-1.5 font-bold"
                >
                  ثبت دستور کار نت و اعزام تکنیسین
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
