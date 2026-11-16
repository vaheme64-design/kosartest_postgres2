import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Cpu,
  FileSpreadsheet,
  CheckCircle2,
  Calendar,
  Layers,
  AlertTriangle,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Package,
  Send,
  GitBranch,
  Clock,
  Building2,
  FileText,
  Calculator,
  Edit3,
  Trash2,
} from 'lucide-react';
import {
  CustomerOrder,
  PartNetRequirement,
  ProductionPlanSuggestion,
  PlanningDashboardMetrics,
} from '../../types/productionPlanning';
import { Part, Machine, DieMold, Routing } from '../../types/inventory';
import { PlanningDashboardView } from './PlanningDashboardView';
import { RelationalPlanProposalView } from './RelationalPlanProposalView';
import { NewCustomerOrderModal } from './NewCustomerOrderModal';
import { MrpModuleView } from './MrpModuleView';
import { ConsumablesForecastView } from './ConsumablesForecastView';
import { DailyProductionScheduleView } from './DailyProductionScheduleView';
import { ErpProductionWorkbenchView } from '../production/ErpProductionWorkbenchView';
import { ProductionWorkflowDocumentationView } from './ProductionWorkflowDocumentationView';
import { MachineCapacityTimelineView } from './MachineCapacityTimelineView';
import { formatNumber, toPersianDigits } from '../../utils/formatters';
import { formatToJalali } from '../../utils/jalali';
import { PlanningModuleSkeleton } from '../ui/Skeleton';
import { useEnterpriseUx } from '../../context/EnterpriseUxContext';
import { useErpRouter } from '../../context/RouterContext';

export type PlanningSubTabKey =
  | 'erp_workbench'
  | 'workflow_doc'
  | 'dashboard'
  | 'daily_schedule'
  | 'capacity_planning'
  | 'mrp'
  | 'consumables'
  | 'recommendations'
  | 'orders'
  | 'approved_plans';

interface ProductionPlanningModuleViewProps {
  parts: Part[];
  routings?: Routing[];
  machines: Machine[];
  dies: DieMold[];
  initialSubTab?: PlanningSubTabKey;
  onSubTabChange?: (tab: PlanningSubTabKey) => void;
  onGlobalRefresh?: () => Promise<void>;
}

export const ProductionPlanningModuleView: React.FC<ProductionPlanningModuleViewProps> = ({
  parts,
  routings = [],
  machines,
  dies,
  initialSubTab = 'mrp',
  onSubTabChange,
  onGlobalRefresh,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<PlanningSubTabKey>(
    initialSubTab === 'erp_workbench' ? 'mrp' : initialSubTab
  );

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab === 'erp_workbench' ? 'mrp' : initialSubTab);
    }
  }, [initialSubTab]);

  const router = useErpRouter();
  const { requestConfirm, showUndoToast, recordAudit } = useEnterpriseUx();

  const handleSelectSubTab = (tab: PlanningSubTabKey) => {
    setActiveSubTab(tab);
    if (onSubTabChange) onSubTabChange(tab);
    router.navigate({ planningSubTab: tab });
  };

  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<PlanningDashboardMetrics | null>(null);
  const [netRequirements, setNetRequirements] = useState<PartNetRequirement[]>([]);
  const [suggestions, setSuggestions] = useState<ProductionPlanSuggestion[]>([]);
  const [proposalCount, setProposalCount] = useState(0);
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [focusedMachineCode, setFocusedMachineCode] = useState<string | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<CustomerOrder | null>(null);

  // Search & Filter in Orders
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL');

  const loadPlanningData = async () => {
    setLoading(true);
    try {
      const [metricsRes, netRes, proposalRes, ordersRes] = await Promise.all([
        fetch('/api/planning/dashboard-metrics').then(r => r.json()),
        fetch('/api/planning/net-requirements').then(r => r.json()),
        fetch('/api/planning/proposals').then(r => r.json()),
        fetch('/api/planning/customer-orders').then(r => r.json()),
      ]);

      const nextNetReqs: PartNetRequirement[] = netRes.success && Array.isArray(netRes.data) ? netRes.data : [];
      if (metricsRes.success) setMetrics(metricsRes.data);
      if (netRes.success) setNetRequirements(nextNetReqs);
      if (proposalRes.success) {
        const rawProposals = Array.isArray(proposalRes.data) ? proposalRes.data : [];
        setProposalCount(rawProposals.length);
        const mappedSuggestions: ProductionPlanSuggestion[] = rawProposals.flatMap((prop: any) =>
          (prop.lines || []).map((line: any, lineIdx: number) => {
            const pCode = line.part?.partNumber || line.partCode || '';
            const pName = line.part?.name || line.partName || '';
            const netMatch = nextNetReqs.find(n => n.partId === line.partId || n.partCode === pCode);
            const plannedQty = Number(line.plannedQty ?? line.plannedQuantity ?? 0);
            const approvalMap: Record<string, ProductionPlanSuggestion['approvalStatus']> = {
              DRAFT: 'DRAFT_SUGGESTION',
              APPROVED: 'APPROVED',
              RELEASED: 'CONVERTED_TO_MO',
              CANCELLED: 'REJECTED',
              SUPERSEDED: 'REJECTED',
            };
            const assignments = Array.isArray(line.operationAssignments) ? line.operationAssignments : [];
            const proposedOperations = assignments.map((op: any, opIdx: number) => {
              const matchedMachine = machines.find(m => m.id === op.machineId || m.code === op.machine?.code);
              const eligibleCheck = matchedMachine
                ? {
                    machineId: matchedMachine.id,
                    machineCode: matchedMachine.code,
                    machineName: matchedMachine.name,
                    hall: matchedMachine.location || 'سالن پرس‌کاری',
                    processType: matchedMachine.processType,
                    tonnage: matchedMachine.tonnage || 250,
                    isEligible: true,
                    ineligibleReasons: [],
                    processMatch: true,
                    tonnageSufficient: true,
                    dieCompatible: true,
                    isMachineActive: matchedMachine.status === 'ACTIVE',
                    capacityAvailable: true,
                    dailyCapacityHours: 15,
                    currentWorkloadHours: 0,
                    availableHoursRemaining: 15,
                    estimatedSetupTimeMin: 25,
                    estimatedRunTimeHours: Number(((plannedQty * 12) / 3600).toFixed(2)),
                    currentWorkloadPercent: 0,
                    suitabilityScore: 95,
                    recommendationRank: 1,
                    recommendationReason: 'تخصیص‌یافته از پیشنهاد برنامه تولید',
                  }
                : null;
              return {
                stepNumber: op.stepNumber || (opIdx + 1) * 10,
                stepCode: op.stepCode || `OP${(opIdx + 1) * 10}`,
                stepName: op.stepName || `عملیات ${opIdx + 1}`,
                processType: matchedMachine?.processType || 'BLANKING',
                requiredTonnage: matchedMachine?.tonnage || 200,
                plannedQuantity: plannedQty,
                standardCycleTimeSec: 12,
                setupTimeMin: 25,
                estimatedRunHours: Number(((plannedQty * 12) / 3600).toFixed(2)),
                dieMoldId: op.dieId || undefined,
                dieMoldCode: op.die?.code || undefined,
                dieMoldName: op.die?.name || undefined,
                recommendedMachine: eligibleCheck,
                allCandidateMachines: eligibleCheck ? [eligibleCheck] : [],
                isInfeasible: !eligibleCheck,
                infeasibilityReasons: eligibleCheck ? [] : ['ماشین واجد شرایط تخصیص نیافته است'],
              };
            });

            return {
              id: `${prop.id}-${line.id || lineIdx}`,
              planNumber: prop.proposalNumber,
              planVersion: `V${prop.version || 1}.0`,
              partId: line.partId,
              partCode: pCode,
              partName: pName,
              customerOrderIds: line.customerOrderLineId ? [line.customerOrderLineId] : [],
              customerOrderNumbers: line.customerOrderLine?.order?.orderNumber ? [line.customerOrderLine.order.orderNumber] : [],
              targetDueDate: line.plannedEndDate || prop.generatedAt,
              grossDemand: netMatch?.grossDemandQty ?? Number(line.requestedQty || plannedQty),
              availableFg: netMatch?.availableFinishedGoodsQty ?? 0,
              wipCredit: netMatch?.totalDownstreamWip ?? 0,
              netRequiredQuantity: netMatch?.netProductionRequirement ?? plannedQty,
              proposedQuantity: plannedQty,
              materialStatus: {
                requiredGrade: netMatch?.requiredMaterialGrade || 'DC01A',
                requiredWeightKg: netMatch?.requiredMaterialKg ?? 0,
                availableWeightKg: netMatch?.availableRawMaterialKg ?? 0,
                shortageKg: netMatch?.materialShortageKg ?? 0,
                hasShortage: (netMatch?.materialShortageKg ?? 0) > 0,
              },
              proposedOperations,
              overallFeasible: proposedOperations.every((o: any) => !o.isInfeasible),
              infeasibilityWarnings: Array.isArray(line.warnings) ? line.warnings : [],
              estimatedStartDate: line.plannedStartDate || prop.generatedAt,
              estimatedCompletionDate: line.plannedEndDate || prop.generatedAt,
              approvalStatus: approvalMap[prop.status] || 'DRAFT_SUGGESTION',
              createdAt: prop.generatedAt,
              updatedAt: prop.generatedAt,
            };
          }),
        );
        setSuggestions(mappedSuggestions);
      }
      if (ordersRes.success) {
        // PostgreSQL is the source of truth; never let an older browser cache override it.
        setCustomerOrders(Array.isArray(ordersRes.data) ? ordersRes.data : []);
      }
    } catch (err) {
      console.error('Failed to load planning data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlanningData();
  }, []);

  const handleRegenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/planning/proposals/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setPlanToast(data.error || 'تولید پیشنهاد برنامه ناموفق بود.');
        return;
      }
      await loadPlanningData();
      setPlanToast(data.message || 'پیشنهاد برنامه جدید تولید با موفقیت ایجاد شد. برای بررسی و تأیید به تب پیشنهاد برنامه بروید.');
      if (onGlobalRefresh) await onGlobalRefresh();
    } catch (err) {
      setPlanToast(err instanceof Error ? err.message : 'خطا در تولید پیشنهاد برنامه');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomerOrder = async (payload: any) => {
    try {
      const res = await fetch('/api/planning/customer-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'خطا در ثبت سفارش' };
      }

      if (!data.data?.id || !Array.isArray(data.data.lines)) {
        throw new Error('سرور ثبت سفارش را تأیید کرد، اما اطلاعات سفارش ذخیره‌شده را برنگرداند. برای جلوگیری از نمایش اطلاعات غیرواقعی، سفارش به فهرست محلی اضافه نشد.');
      }
      const newOrder: CustomerOrder = data.data;
      setCustomerOrders(prev => [newOrder, ...prev]);

      recordAudit({
        moduleName: 'برنامه‌ریزی تولید',
        actionType: 'CREATE',
        title: `ثبت سفارش جدید ${newOrder.orderNumber}`,
        details: `سفارش مشتری ${payload.customerName} با اولویت ${payload.priority === 1 ? 'فوری' : 'عادی'} ایجاد گردید.`,
      });

      await loadPlanningData();
      if (onGlobalRefresh) await onGlobalRefresh();
      setPlanToast('سفارش مشتری با موفقیت افزوده شد و الزامات MRP بروزرسانی گردید.');
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'خطای شبکه' };
    }
  };

  const handleUpdateCustomerOrder = async (orderId: string, payload: any) => {
    try {
      const response = await fetch(`/api/planning/customer-orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'خطا در ذخیره تغییرات سفارش');
      }

      await loadPlanningData();
      recordAudit({
        moduleName: 'برنامه‌ریزی تولید',
        actionType: 'UPDATE',
        title: `ویرایش سفارش ${orderId}`,
        details: `بروزرسانی تیراژ، موعد تحویل و اولویت (${payload.priority === 1 ? 'فوری' : 'عادی'})`,
      });
      setPlanToast(data.message || 'تغییرات سفارش با موفقیت ذخیره شد و الزامات MRP بروزرسانی گردید.');
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'خطا در ویرایش سفارش' };
    }
  };

  const handleDeleteCustomerOrder = (order: CustomerOrder) => {
    requestConfirm({
      title: `حذف سفارش تعهد تحویل ${order.orderNumber}`,
      message: `آیا از حذف سفارش ${order.orderNumber} مشتری «${order.customerName}» اطمینان دارید؟ با حذف این سفارش، مقادیر تقاضای خالص MRP مجدداً متوازن خواهند شد.`,
      confirmLabel: 'بله، سفارش حذف شود',
      cancelLabel: 'انصراف',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/planning/customer-orders/${order.id}`, { method: 'DELETE' });
          const data = await response.json();
          if (!response.ok || !data.success) {
            throw new Error(data.error || 'خطا در حذف سفارش');
          }
          await loadPlanningData();
          recordAudit({
            moduleName: 'برنامه‌ریزی تولید',
            actionType: 'SOFT_DELETE',
            title: `حذف سفارش ${order.orderNumber}`,
            details: `سفارش مشتری ${order.customerName} حذف شد.`,
          });
          setPlanToast(data.message || 'سفارش مشتری با موفقیت حذف شد.');
        } catch (error) {
          setPlanToast(error instanceof Error ? error.message : 'حذف سفارش ناموفق بود.');
        }
      },
    });
  };

  const handleQuickUpdatePriority = async (orderId: string, newPriority: 1 | 2 | 3) => {
    try {
      const response = await fetch(`/api/planning/customer-orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: newPriority }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'تغییر اولویت سفارش ذخیره نشد.');
      }

      await loadPlanningData();
      recordAudit({
        moduleName: 'برنامه‌ریزی تولید',
        actionType: 'UPDATE',
        title: `تغییر اولویت سفارش ${orderId}`,
        details: `اولویت به ${newPriority === 1 ? 'فوری' : newPriority === 2 ? 'عادی' : 'مازاد'} تغییر یافت.`,
      });
      setPlanToast(data.message || `اولویت سفارش به ${newPriority === 1 ? 'فوری' : newPriority === 2 ? 'عادی' : 'مازاد'} تغییر یافت.`);
    } catch (error) {
      await loadPlanningData();
      setPlanToast(error instanceof Error ? error.message : 'تغییر اولویت سفارش ناموفق بود.');
    }
  };

  const handleApprovePlan = async (id: string, approvedBy: string) => {
    try {
      const res = await fetch(`/api/planning/suggestions/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedBy }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'خطا در تصویب برنامه' };
      }
      await loadPlanningData();
      return { success: true, message: data.message };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'خطای ارتباط' };
    }
  };

  const handleReleaseMo = async (id: string, releasedBy: string) => {
    try {
      const res = await fetch(`/api/planning/suggestions/${id}/release-mo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ releasedBy }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'خطا در آزادسازی به MO' };
      }
      await loadPlanningData();
      if (onGlobalRefresh) await onGlobalRefresh();
      return { success: true, message: data.message, moId: data.data?.manufacturingOrder?.id };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'خطای ارتباط' };
    }
  };

  const handleRevisePlan = async (id: string, changeReason: string) => {
    try {
      const res = await fetch(`/api/planning/suggestions/${id}/revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changeReason }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'خطا در ایجاد بازنگری' };
      }
      await loadPlanningData();
      return { success: true, message: data.message, newPlanId: data.data?.newPlan?.id };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'خطای ارتباط' };
    }
  };

  const navigateToRecommendationsForPart = (partId?: string) => {
    if (partId) {
      const matchingSuggestion = suggestions.find(s => s.partId === partId);
      if (matchingSuggestion) {
        setSelectedSuggestionId(matchingSuggestion.id);
      }
    }
    handleSelectSubTab('recommendations');
  };

  const filteredOrders = customerOrders.filter(o => {
    if (orderStatusFilter !== 'ALL' && o.status !== orderStatusFilter) return false;
    if (orderSearchTerm) {
      const q = orderSearchTerm.toLowerCase();
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.contractNumber.toLowerCase().includes(q) ||
        o.lines.some(l => l.partName.toLowerCase().includes(q) || l.partCode.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const approvedPlans = suggestions.filter(
    s => s.approvalStatus === 'APPROVED' || s.approvalStatus === 'CONVERTED_TO_MO'
  );

  const [planToast, setPlanToast] = useState<string | null>(null);

  if (loading && !metrics && suggestions.length === 0 && customerOrders.length === 0) {
    return <PlanningModuleSkeleton />;
  }

  return (
    <div className="space-y-4">
      {/* SAP Fiori Dynamic Page Header & IconTabBar */}
      <div className="sap-card overflow-hidden">
        <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#d9d9d9]">
          <div>
            <h1 className="text-sm font-semibold text-[#333333]">
              برنامه‌ریزی کلان تولید و نیازسنجی مواد (SAP MRP / PP)
            </h1>
            <p className="text-xs text-[#666666] mt-0.5">
              سفارشات ساپکو، انفجار BOM، محاسبه نیاز خالص ورق و تخصیص پرس‌ها
            </p>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={loadPlanningData}
              disabled={loading}
              className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#007cc0]' : ''}`} />
              <span>بروزرسانی</span>
            </button>
            <button
              type="button"
              onClick={() => setIsOrderModalOpen(true)}
              className="sap-btn-emphasized flex items-center gap-1.5 px-3.5 py-1.5 text-xs cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ثبت سفارش مشتری</span>
            </button>
          </div>
        </div>

        <div className="sap-icon-tab-bar px-2 border-b-0">
          {[
            { id: 'mrp', label: '۱. انفجار BOM و نیاز ورق (MRP)' },
            { id: 'capacity_planning', label: '۲. تقویم ظرفیت ماشین‌آلات (Capacity Planning)' },
            { id: 'orders', label: `۳. سفارشات مشتریان (${toPersianDigits(customerOrders.length)})` },
            { id: 'recommendations', label: `۴. پیشنهاد برنامه و پرس (${toPersianDigits(proposalCount)})` },
            { id: 'daily_schedule', label: '۵. تقویم روزانه سالن‌ها' },
            { id: 'dashboard', label: '۶. موازنه تقاضا و ظرفیت' },
          ].map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectSubTab(item.id as any)}
              className={`sap-icon-tab ${activeSubTab === item.id ? 'sap-icon-tab-active' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {planToast && (
        <div className="p-3 rounded border bg-[#ebf5ec] border-[#b7dfbf] text-[#107e3e] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-[#107e3e]" />
            <span>{planToast}</span>
          </div>
          <button type="button" onClick={() => setPlanToast(null)} className="cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Sub-Tab 0: ERP 5-Stage Workbench (SAP PP / Odoo MRP / Daily Roll-Forward) */}
      {activeSubTab === 'erp_workbench' && (
        <ErpProductionWorkbenchView parts={parts} routings={routings} onRefreshData={loadPlanningData} />
      )}

      {/* Sub-Tab: SAP PP Production Workflow Documentation */}
      {activeSubTab === 'workflow_doc' && <ProductionWorkflowDocumentationView />}

      {/* 1. Dashboard Sub-Tab */}
      {activeSubTab === 'dashboard' && (
        <PlanningDashboardView
          metrics={metrics}
          netRequirements={netRequirements}
          machines={machines}
          suggestions={suggestions}
          onRegenerate={handleRegenerate}
          onOpenNewOrderModal={() => setIsOrderModalOpen(true)}
          onNavigateToRecommendations={navigateToRecommendationsForPart}
          onNavigateToCapacityGantt={(machineCode?: string) => {
            if (machineCode) setFocusedMachineCode(machineCode);
            handleSelectSubTab('capacity_planning');
          }}
          loading={loading}
        />
      )}

      {/* 1.0. Daily Production Schedule Sub-Tab (برنامه روزانه شرکت به تفکیک سالن) */}
      {activeSubTab === 'daily_schedule' && (
        <DailyProductionScheduleView />
      )}

      {/* 1.05. Machine Capacity Timeline Sub-Tab (تقویم ظرفیت ماشین‌آلات - Capacity Planning) */}
      {activeSubTab === 'capacity_planning' && (
        <MachineCapacityTimelineView
          suggestions={suggestions}
          parts={parts}
          machines={machines}
          initialMachineCode={focusedMachineCode}
        />
      )}

      {/* 1.1. MRP & Material Requirements Forecast Sub-Tab */}
      {activeSubTab === 'mrp' && (
        <MrpModuleView onRefreshGlobal={onGlobalRefresh} />
      )}

      {/* 1.2. Consumables & Shop-Floor Supplies Forecast Sub-Tab */}
      {activeSubTab === 'consumables' && (
        <ConsumablesForecastView />
      )}

      {/* 2. Machine Recommendations Sub-Tab */}
      {activeSubTab === 'recommendations' && (
        <RelationalPlanProposalView
          onReleased={async () => {
            await loadPlanningData();
            if (onGlobalRefresh) await onGlobalRefresh();
          }}
        />
      )}

      {/* 3. Customer Orders Sub-Tab */}
      {activeSubTab === 'orders' && (
        <div className="space-y-3.5">
          <div className="sap-card p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#666666] absolute right-2.5 top-2" />
                <input
                  type="text"
                  placeholder="جستجو در سفارشات ساپکو، قطعات..."
                  value={orderSearchTerm}
                  onChange={e => setOrderSearchTerm(e.target.value)}
                  className="bg-[#f5f5f5] border border-[#bfbfbf] rounded pr-8 pl-3 py-1 text-xs text-[#333333] w-64 focus:bg-[#ffffff] focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <select
                value={orderStatusFilter}
                onChange={e => setOrderStatusFilter(e.target.value)}
                className="bg-[#ffffff] border border-[#bfbfbf] rounded px-2.5 py-1 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
              >
                <option value="ALL">همه وضعیت‌ها</option>
                <option value="OPEN">سفارشات باز (در حال برنامه‌ریزی)</option>
                <option value="PARTIALLY_FULFILLED">تحویل بخشی</option>
                <option value="FULFILLED">تکمیل شده</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                setEditingOrder(null);
                setIsOrderModalOpen(true);
              }}
              className="sap-btn-emphasized flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ثبت تعهد تحویل جدید</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredOrders.map(order => (
              <div
                key={order.id}
                className="sap-card p-3.5 space-y-3 hover:border-[#007cc0] transition"
              >
                <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#333333] text-sm font-mono">
                        {order.orderNumber}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          order.priority === 1
                            ? 'bg-[#ffecec] text-[#bb0000] border border-[#f5b7b1]'
                            : order.priority === 2
                            ? 'bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2]'
                            : 'bg-[#f5f5f5] text-[#666666] border border-[#d9d9d9]'
                        }`}
                      >
                        {order.priority === 1 ? 'اولویت فوری' : order.priority === 2 ? 'اولویت عادی' : 'اولویت مازاد'}
                      </span>
                    </div>
                    <div className="text-xs text-[#666666] mt-1 flex items-center gap-2 flex-wrap">
                      <Building2 className="w-3.5 h-3.5 text-[#666666]" />
                      <span>{order.customerName}</span>
                      {order.contractNumber && (
                        <button
                          type="button"
                          onClick={() => router.traceDocument(order.contractNumber, 'CONTRACTS')}
                          className="sap-doc-link font-mono text-[11px] cursor-pointer"
                          title="مشاهده قرارداد در ماژول قراردادها"
                        >
                          ({order.contractNumber})
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="text-left">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#ebf5ec] text-[#107e3e] border border-[#b7dfbf]">
                      سفارش فعال
                    </span>
                    <div className="text-[11px] text-[#666666] mt-1 tabular-nums font-mono">
                      تحویل: {formatToJalali(order.dueDate)}
                    </div>
                  </div>
                </div>

                {/* Order Lines */}
                <div className="space-y-1.5">
                  <div className="text-[11px] text-[#666666] font-medium">اقلام تعهد تحویل:</div>
                  {order.lines.map(line => (
                    <div
                      key={line.id}
                      className="bg-[#f5f5f5] p-2 rounded border border-[#d9d9d9] flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-[#333333]">{line.partName}</div>
                        <button
                          type="button"
                          onClick={() => router.traceDocument(line.partCode, 'INVENTORY_LEDGER')}
                          className="sap-doc-link text-[11px] font-mono cursor-pointer"
                          title="مشاهده موجودی و کاردکس قطعه"
                        >
                          {line.partCode}
                        </button>
                      </div>
                      <div className="text-left tabular-nums">
                        <span className="text-[#333333] font-semibold font-mono">
                          {formatNumber(line.orderedQuantity)}
                        </span>{' '}
                        <span className="text-[#666666] text-[10px]">عدد</span>
                      </div>
                    </div>
                  ))}
                </div>

                {order.notes && (
                  <div className="text-[11px] text-[#666666] bg-[#f5f5f5] p-2 rounded border border-[#d9d9d9]">
                    یادداشت: {order.notes}
                  </div>
                )}

                {/* Enterprise Dynamic Action Bar (Edit / Delete / Dynamic Priority) */}
                <div className="flex items-center justify-between pt-2 border-t border-[#e8e8e8] text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[#666666]">تغییر اولویت:</span>
                    <select
                      value={order.priority}
                      onChange={e => handleQuickUpdatePriority(order.id, Number(e.target.value) as 1 | 2 | 3)}
                      className="text-[11px] font-semibold bg-[#ffffff] border border-[#bfbfbf] rounded px-2 py-0.5 text-[#333333] cursor-pointer focus:outline-none focus:border-[#007cc0]"
                    >
                      <option value={1}>فوری (اولویت ۱)</option>
                      <option value={2}>عادی (اولویت ۲)</option>
                      <option value={3}>مازاد (اولویت ۳)</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingOrder(order);
                        setIsOrderModalOpen(true);
                      }}
                      className="sap-btn-standard px-2.5 py-1 text-[11px] font-semibold cursor-pointer flex items-center gap-1 whitespace-nowrap"
                      title="ویرایش کامل مشخصات و تیراژ سفارش"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-[#007cc0]" />
                      <span>ویرایش</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCustomerOrder(order)}
                      className="px-2.5 py-1 text-[#bb0000] bg-[#ffecec] hover:bg-[#f5b7b1] rounded transition cursor-pointer flex items-center gap-1 text-[11px] font-semibold border border-[#f5b7b1] whitespace-nowrap"
                      title="حذف سفارش"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Approved Plans Sub-Tab */}
      {activeSubTab === 'approved_plans' && (
        <div className="space-y-3.5">
          <div className="sap-card p-3.5">
            <h3 className="text-sm font-semibold text-[#333333] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#107e3e]" />
              سوابق برنامه‌های مصوب مدیر تولید و دستور کارهای صادر شده به کارگاه
            </h3>
            <p className="text-xs text-[#666666] mt-0.5">
              برنامه‌های تأیید شده قابلیت آزادسازی و ایجاد شناسه رسمی دستور کار (MO) در واحد WIP را دارند.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {approvedPlans.length === 0 ? (
              <div className="col-span-2 sap-card p-6 text-center text-[#666666] text-xs">
                هنوز برنامه‌ای به تصویب نرسیده است. از تب «تخصیص ماشین‌آلات و پیشنهاد برنامه» اقدام به تأیید برنامه‌ها نمایید.
              </div>
            ) : (
              approvedPlans.map(plan => (
                <div
                  key={plan.id}
                  className="sap-card p-3.5 space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#333333] text-sm font-mono">
                          {plan.planNumber}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#fff4e5] text-[#e9730c] border border-[#f5cba7]">
                          {plan.planVersion}
                        </span>
                      </div>
                      <div className="text-xs text-[#333333] font-medium mt-1">
                        قطعه: {plan.partName}{' '}
                        <button
                          type="button"
                          onClick={() => router.traceDocument(plan.partCode, 'INVENTORY_LEDGER')}
                          className="sap-doc-link font-mono text-[11px] cursor-pointer"
                        >
                          ({plan.partCode})
                        </button>
                      </div>
                    </div>

                    <div className="text-left">
                      {plan.approvalStatus === 'CONVERTED_TO_MO' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2]">
                          صادر شده به دستور کار
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#ebf5ec] text-[#107e3e] border border-[#b7dfbf]">
                          مصوب مدیر تولید
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-[#f5f5f5] p-2 rounded border border-[#d9d9d9]">
                      <div className="text-[10px] text-[#666666]">تیراژ خالص مصوب</div>
                      <div className="font-semibold text-[#333333] mt-0.5 tabular-nums font-mono">
                        {formatNumber(plan.proposedQuantity)}
                      </div>
                    </div>
                    <div className="bg-[#f5f5f5] p-2 rounded border border-[#d9d9d9]">
                      <div className="text-[10px] text-[#666666]">ورق مورد نیاز</div>
                      <div className="font-semibold text-[#333333] mt-0.5 tabular-nums font-mono">
                        {formatNumber(plan.materialStatus.requiredWeightKg)} kg
                      </div>
                    </div>
                    <div className="bg-[#f5f5f5] p-2 rounded border border-[#d9d9d9]">
                      <div className="text-[10px] text-[#666666]">موعد تحویل</div>
                      <div className="font-semibold text-[#333333] mt-0.5 tabular-nums font-mono">
                        {formatToJalali(plan.targetDueDate)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSuggestionId(plan.id);
                        setActiveSubTab('recommendations');
                      }}
                      className="text-xs text-[#007cc0] hover:underline font-semibold cursor-pointer"
                    >
                      مشاهده جزئیات مراحل و ماشین‌ها ←
                    </button>

                    {plan.approvalStatus === 'APPROVED' && (
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await handleReleaseMo(plan.id, 'سرپرست برنامه‌ریزی');
                          if (res.success) {
                            setPlanToast('دستور کار کارگاهی (MO) با موفقیت صادر و به واحد WIP ارسال شد.');
                          }
                        }}
                        className="sap-btn-emphasized flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer whitespace-nowrap"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>صدور رسمی MO</span>
                      </button>
                    )}

                    {plan.approvalStatus === 'CONVERTED_TO_MO' && plan.createdMoId && (
                      <button
                        type="button"
                        onClick={() => router.traceDocument(plan.createdMoId!, 'WIP_TRACEABILITY')}
                        className="sap-doc-link text-[11px] font-semibold font-mono bg-[#e5f3fa] px-2.5 py-1 rounded border border-[#b3ddf2] cursor-pointer"
                        title="رهگیری دستور کار در WIP"
                      >
                        MO: {plan.createdMoId}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* New / Edit Customer Order Modal */}
      <NewCustomerOrderModal
        isOpen={isOrderModalOpen}
        onClose={() => {
          setIsOrderModalOpen(false);
          setEditingOrder(null);
        }}
        parts={parts}
        onSubmit={handleCreateCustomerOrder}
        orderToEdit={editingOrder}
        onUpdate={handleUpdateCustomerOrder}
      />
    </div>
  );
};
