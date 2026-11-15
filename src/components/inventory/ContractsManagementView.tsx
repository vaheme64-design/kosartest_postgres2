import React, { useState, useMemo, useEffect } from 'react';
import {
  FileSignature,
  Search,
  Filter,
  Plus,
  RefreshCw,
  Building2,
  Calendar,
  Scale,
  Layers,
  Package,
  PackageCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  Download,
  Link as LinkIcon,
  ChevronDown,
  ChevronUp,
  Edit3,
  History,
  X,
  Save,
  PauseCircle,
  Ban,
} from 'lucide-react';
import {
  SapcoContract,
  Part,
  PhysicalCoil,
  ContractCommercialLine,
  ContractRevisionEntry,
} from '../../types/inventory';
import {
  formatNumber,
  formatWeightKg,
  toPersianDigits,
  formatDate,
  exportToCsv,
} from '../../utils/formatters';
import { ContractCreateModal } from './ContractCreateModal';
import { useEnterpriseUx } from '../../context/EnterpriseUxContext';
import { useErpRouter } from '../../context/RouterContext';
import { FormulaTooltip } from '../common/FormulaTooltip';

interface ContractsManagementViewProps {
  contracts: SapcoContract[];
  parts: Part[];
  coils: PhysicalCoil[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onViewContractLedger?: (contractId: string) => void;
  initialSearchQuery?: string;
  currentUser: { uid: string; displayName: string; role: string };
}

const CONTRACT_REVISIONS_STORAGE_KEY = 'kpims_contract_revisions_v1';
const CONTRACT_LOCAL_OVERRIDES_KEY = 'kpims_contract_overrides_v1';

const DEFAULT_SEEDED_REVISIONS: Record<string, ContractRevisionEntry[]> = {
  'CNT-SAPCO-1403-Q3': [
    {
      id: 'REV-SEED-1',
      revisionNumber: 2,
      timestamp: '۱۴۰۴/۰۲/۱۲ - ۱۰:۳۰',
      actor: 'مهندس رضایی (واحد بازرگانی)',
      fieldLabelFa: 'سهمیه وزنی قرارداد (الحاقیه بهاره)',
      oldQty: 40000,
      newQty: 50000,
      unit: 'کیلوگرم',
      oldStatus: 'ACTIVE',
      newStatus: 'ACTIVE',
      reasonFa: 'افزایش برنامه تولید پژو ۲۰۶ و تخصیص ۱۰ تن ورق کششی اضافه از ساپکو',
    },
    {
      id: 'REV-SEED-0',
      revisionNumber: 1,
      timestamp: '۱۴۰۴/۰۱/۱۰ - ۰۸:۱۵',
      actor: 'سیستم بازرگانی ساپکو',
      fieldLabelFa: 'ثبت اولیه سهمیه قرارداد',
      oldQty: 0,
      newQty: 40000,
      unit: 'کیلوگرم',
      oldStatus: 'ACTIVE',
      newStatus: 'ACTIVE',
      reasonFa: 'ابلاغ رسمی قرارداد تأمین ورق و تحویل قطعات فصل اول',
    },
  ],
};

export const ContractsManagementView: React.FC<ContractsManagementViewProps> = ({
  contracts,
  parts,
  coils,
  loading,
  onRefresh,
  onViewContractLedger,
  initialSearchQuery,
  currentUser,
}) => {
  const { requestConfirm, showUndoToast, recordAudit } = useEnterpriseUx();
  const { route, traceDocument } = useErpRouter();
  const [searchTerm, setSearchTerm] = useState(initialSearchQuery || route.docQuery || '');
  const [selectedCustomer, setSelectedCustomer] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [expandedContractId, setExpandedContractId] = useState<string | null>(null);

  useEffect(() => {
    const q = initialSearchQuery || route.docQuery;
    if (q) {
      setSearchTerm(q);
    }
  }, [initialSearchQuery, route.docQuery]);

  // Local overrides & revisions state so edits are immediate and persistent
  const [localContractOverrides, setLocalContractOverrides] = useState<Record<string, Partial<SapcoContract>>>(() => {
    try {
      const saved = window.localStorage.getItem(CONTRACT_LOCAL_OVERRIDES_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [revisionsMap, setRevisionsMap] = useState<Record<string, ContractRevisionEntry[]>>(() => {
    try {
      const saved = window.localStorage.getItem(CONTRACT_REVISIONS_STORAGE_KEY);
      return saved ? { ...DEFAULT_SEEDED_REVISIONS, ...JSON.parse(saved) } : DEFAULT_SEEDED_REVISIONS;
    } catch {
      return DEFAULT_SEEDED_REVISIONS;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(CONTRACT_LOCAL_OVERRIDES_KEY, JSON.stringify(localContractOverrides));
    } catch {
      // ignore
    }
  }, [localContractOverrides]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CONTRACT_REVISIONS_STORAGE_KEY, JSON.stringify(revisionsMap));
    } catch {
      // ignore
    }
  }, [revisionsMap]);

  // Merge server contracts with local edits & revisions
  const mergedContracts = useMemo(() => {
    return contracts.map(c => {
      const ov = localContractOverrides[c.id] || localContractOverrides[c.contractNumber] || {};
      const revs =
        revisionsMap[c.id] ||
        revisionsMap[c.contractNumber] ||
        c.revisions ||
        DEFAULT_SEEDED_REVISIONS[c.contractNumber] ||
        [];
      return {
        ...c,
        ...ov,
        revisions: revs,
      } as SapcoContract;
    });
  }, [contracts, localContractOverrides, revisionsMap]);

  // Slide-Over Details & Edit Drawer State
  const [drawerContractId, setDrawerContractId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<'EDIT' | 'REVISIONS'>('EDIT');
  const [editTitle, setEditTitle] = useState('');
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editMaterialGrade, setEditMaterialGrade] = useState('');
  const [editAllocatedWeightKg, setEditAllocatedWeightKg] = useState<number>(0);
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'SUSPENDED' | 'TERMINATED'>('ACTIVE');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editRevisionReason, setEditRevisionReason] = useState('');
  const [editCommercialLines, setEditCommercialLines] = useState<ContractCommercialLine[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const activeDrawerContract = useMemo(
    () => mergedContracts.find(c => c.id === drawerContractId || c.contractNumber === drawerContractId) || null,
    [mergedContracts, drawerContractId]
  );

  const openContractDrawer = (contract: SapcoContract, tab: 'EDIT' | 'REVISIONS' = 'EDIT') => {
    setDrawerContractId(contract.id);
    setDrawerTab(tab);
    setEditTitle(contract.title || '');
    setEditCustomerName(contract.customerName || 'شرکت ساپکو');
    setEditMaterialGrade(contract.materialGrade || 'DC04');
    setEditAllocatedWeightKg(Number(contract.allocatedWeightKg) || 0);
    const normalizedStatus =
      contract.status === 'SUSPENDED'
        ? 'SUSPENDED'
        : contract.status === 'TERMINATED' || contract.status === 'FULFILLED' || contract.status === 'EXPIRED'
        ? 'TERMINATED'
        : 'ACTIVE';
    setEditStatus(normalizedStatus);
    setEditStartDate(contract.startDate ? contract.startDate.slice(0, 10) : '2026-03-21');
    setEditEndDate(contract.endDate ? contract.endDate.slice(0, 10) : '2026-09-22');
    setEditNotes(contract.notes || '');
    setEditRevisionReason('');
    setEditCommercialLines(
      contract.commercialLines ? JSON.parse(JSON.stringify(contract.commercialLines)) : []
    );
  };

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [allocatingContract, setAllocatingContract] = useState<SapcoContract | null>(null);
  const [selectedCoilToAllocate, setSelectedCoilToAllocate] = useState<string>('');
  const [allocateWeight, setAllocateWeight] = useState<number>(1000);
  const [allocateLoading, setAllocateLoading] = useState(false);
  const [allocateError, setAllocateError] = useState<string | null>(null);

  // Extract unique customers
  const customers = useMemo(() => {
    const set = new Set<string>();
    mergedContracts.forEach(c => {
      if (c.customerName) set.add(c.customerName);
    });
    return Array.from(set);
  }, [mergedContracts]);

  // Aggregate Metrics
  const totalAllocatedKg = mergedContracts.reduce((sum, c) => sum + (c.allocatedWeightKg || 0), 0);
  const totalReceivedKg = mergedContracts.reduce((sum, c) => sum + (c.totalReceivedKg || 0), 0);
  const totalConsumedKg = mergedContracts.reduce((sum, c) => sum + (c.totalConsumedKg || 0), 0);
  const totalClosingBalanceKg = mergedContracts.reduce((sum, c) => sum + (c.closingBalanceKg || 0), 0);

  const totalCommittedProducts = mergedContracts.reduce((sum, c) => {
    const lines = c.commercialLines || [];
    return sum + lines.filter(l => l.lineType === 'FINISHED_PRODUCT_DELIVERY').reduce((s, l) => s + l.contractQty, 0);
  }, 0);

  const totalDeliveredProducts = mergedContracts.reduce((sum, c) => {
    const lines = c.commercialLines || [];
    return sum + lines.filter(l => l.lineType === 'FINISHED_PRODUCT_DELIVERY').reduce((s, l) => s + l.deliveredOrReceivedQty, 0);
  }, 0);

  // Filtered Contracts
  const filteredContracts = useMemo(() => {
    return mergedContracts.filter(c => {
      if (selectedCustomer !== 'ALL' && c.customerName !== selectedCustomer) {
        return false;
      }
      if (selectedType !== 'ALL' && c.contractType !== selectedType) {
        return false;
      }
      if (selectedStatus !== 'ALL') {
        if (selectedStatus === 'TERMINATED') {
          if (c.status !== 'TERMINATED' && c.status !== 'FULFILLED' && c.status !== 'EXPIRED') return false;
        } else if (c.status !== selectedStatus) {
          return false;
        }
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchHeader =
          c.contractNumber.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          (c.customerName && c.customerName.toLowerCase().includes(q)) ||
          (c.materialGrade && c.materialGrade.toLowerCase().includes(q));
        const matchLines = (c.commercialLines || []).some(
          l => l.partName.toLowerCase().includes(q) || l.partCode.toLowerCase().includes(q)
        );
        const matchCoils = (c.coils || []).some(
          cl => cl.coilId.toLowerCase().includes(q) || (cl.coilPackNumber && cl.coilPackNumber.toLowerCase().includes(q))
        );
        return matchHeader || matchLines || matchCoils;
      }
      return true;
    });
  }, [mergedContracts, selectedCustomer, selectedType, selectedStatus, searchTerm]);

  const handleSaveContractEdit = () => {
    if (!activeDrawerContract) return;
    const oldContract = activeDrawerContract;
    const oldQuota = Number(oldContract.allocatedWeightKg) || 0;
    const newQuota = Number(editAllocatedWeightKg) || 0;
    const oldCommQty = (oldContract.commercialLines || []).reduce((s, l) => s + (Number(l.contractQty) || 0), 0);
    const newCommQty = editCommercialLines.reduce((s, l) => s + (Number(l.contractQty) || 0), 0);
    const isStatusChanged = oldContract.status !== editStatus;
    const isSensitiveStatus = isStatusChanged && (editStatus === 'SUSPENDED' || editStatus === 'TERMINATED');

    const executeSave = async () => {
      setSavingEdit(true);
      const prevOverrides = { ...localContractOverrides };
      const prevRevisions = { ...revisionsMap };

      const existingRevs = [
        ...(revisionsMap[oldContract.id] ||
          revisionsMap[oldContract.contractNumber] ||
          oldContract.revisions ||
          []),
      ];

      const newRevEntries: ContractRevisionEntry[] = [];

      if (newQuota !== oldQuota) {
        newRevEntries.push({
          id: `REV-QT-${Date.now()}`,
          revisionNumber: existingRevs.length + newRevEntries.length + 1,
          timestamp: new Date().toLocaleString('fa-IR'),
          actor: currentUser?.displayName || 'مدیر بازرگانی و قراردادها',
          fieldLabelFa: 'سهمیه وزنی ورق قرارداد (Allocated Quota)',
          oldQty: oldQuota,
          newQty: newQuota,
          unit: 'کیلوگرم',
          oldStatus: oldContract.status,
          newStatus: editStatus,
          reasonFa: editRevisionReason.trim() || 'اصلاحیه سهمیه وزنی قرارداد در کشوی مدیریت قراردادها',
        });
      }

      if (newCommQty !== oldCommQty) {
        newRevEntries.push({
          id: `REV-LN-${Date.now() + 1}`,
          revisionNumber: existingRevs.length + newRevEntries.length + 1,
          timestamp: new Date().toLocaleString('fa-IR'),
          actor: currentUser?.displayName || 'مدیر بازرگانی و قراردادها',
          fieldLabelFa: 'مجموع تیراژ ردیف‌های تعهد محصول / مواد',
          oldQty: oldCommQty,
          newQty: newCommQty,
          unit: 'واحد/کیلوگرم',
          oldStatus: oldContract.status,
          newStatus: editStatus,
          reasonFa: editRevisionReason.trim() || 'بازنگری تیراژ ردیف‌های تجاری قرارداد',
        });
      }

      if (newRevEntries.length === 0 && (isStatusChanged || editRevisionReason.trim())) {
        newRevEntries.push({
          id: `REV-ST-${Date.now() + 2}`,
          revisionNumber: existingRevs.length + 1,
          timestamp: new Date().toLocaleString('fa-IR'),
          actor: currentUser?.displayName || 'مدیر بازرگانی و قراردادها',
          fieldLabelFa: isStatusChanged ? 'تغییر وضعیت اجرایی قرارداد' : 'ثبت یادداشت بازنگری قرارداد',
          oldQty: oldQuota,
          newQty: newQuota,
          unit: 'کیلوگرم',
          oldStatus: oldContract.status,
          newStatus: editStatus,
          reasonFa: editRevisionReason.trim() || `تغییر وضعیت از ${oldContract.status} به ${editStatus}`,
        });
      }

      const updatedRevs = [...newRevEntries, ...existingRevs];
      const updatedCommercialLines = editCommercialLines.map(l => ({
        ...l,
        contractQty: Number(l.contractQty) || 0,
        remainingQty: Math.max(0, (Number(l.contractQty) || 0) - (Number(l.deliveredOrReceivedQty) || 0)),
      }));

      const updatedPatch: Partial<SapcoContract> = {
        title: editTitle.trim() || oldContract.title,
        customerName: editCustomerName.trim() || oldContract.customerName,
        materialGrade: editMaterialGrade.trim() || oldContract.materialGrade,
        allocatedWeightKg: newQuota,
        closingBalanceKg: Math.max(0, newQuota - (oldContract.totalConsumedKg || 0)),
        status: editStatus,
        startDate: editStartDate,
        endDate: editEndDate,
        notes: editNotes,
        commercialLines: updatedCommercialLines,
        revisions: updatedRevs,
      };

      setLocalContractOverrides(prev => ({
        ...prev,
        [oldContract.id]: updatedPatch,
      }));
      setRevisionsMap(prev => ({
        ...prev,
        [oldContract.id]: updatedRevs,
        [oldContract.contractNumber]: updatedRevs,
      }));

      try {
        await fetch(`/api/inventory/contracts/${oldContract.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...updatedPatch,
            actor: currentUser?.displayName,
            revisionReasonFa: editRevisionReason.trim(),
          }),
        });
        await onRefresh();
      } catch {
        // local state already updated
      } finally {
        setSavingEdit(false);
      }

      recordAudit({
        actionType: 'UPDATE',
        module: 'مدیریت قراردادها (SalesContracts)',
        entityId: oldContract.id,
        entityCode: oldContract.contractNumber,
        summaryFa: `ویرایش قرارداد «${oldContract.contractNumber}» — وضعیت: ${
          editStatus === 'ACTIVE' ? 'فعال' : editStatus === 'SUSPENDED' ? 'معلق' : 'خاتمه‌یافته'
        } | سهمیه: ${formatNumber(newQuota)} ک.گ`,
        beforeSnapshot: {
          allocatedWeightKg: oldQuota,
          status: oldContract.status,
          title: oldContract.title,
        },
        afterSnapshot: {
          allocatedWeightKg: newQuota,
          status: editStatus,
          title: editTitle,
        },
      });

      showUndoToast({
        title: `قرارداد «${oldContract.contractNumber}» به‌روزرسانی شد`,
        description:
          newRevEntries.length > 0
            ? `تغییرات تیراژ/وضعیت در تب «تاریخچه تغییرات تیراژ (Revisions)» ثبت شد.`
            : 'مشخصات قرارداد با موفقیت ذخیره شد.',
        onUndo: () => {
          setLocalContractOverrides(prevOverrides);
          setRevisionsMap(prevRevisions);
        },
      });

      setEditRevisionReason('');
      setDrawerTab('REVISIONS');
    };

    if (isSensitiveStatus || newQuota !== oldQuota || newCommQty !== oldCommQty) {
      requestConfirm({
        title: isSensitiveStatus
          ? `تغییر وضعیت قرارداد «${oldContract.contractNumber}»`
          : `ثبت ویرایش و بازنگری تیراژ قرارداد «${oldContract.contractNumber}»`,
        description: `آیا از اعمال تغییرات روی قرارداد «${oldContract.title}» اطمینان دارید؟`,
        consequenceText: isSensitiveStatus
          ? editStatus === 'SUSPENDED'
            ? 'با تعلیق این قرارداد، صدور حواله‌های جدید از محل سهمیه این قرارداد متوقف می‌شود.'
            : 'با خاتمه این قرارداد، پرونده تجاری آن بسته شده و در لیست قراردادهای خاتمه‌یافته قرار می‌گیرد.'
          : `تغییر سهمیه از ${formatNumber(oldQuota)} به ${formatNumber(
              newQuota
            )} کیلوگرم به صورت رسمی در تاریخچه ویرایش‌ها (Revisions) ثبت خواهد شد.`,
        severity: isSensitiveStatus ? 'warning' : 'info',
        confirmLabel: 'تأیید و ثبت در تاریخچه قرارداد',
        onConfirm: executeSave,
      });
    } else {
      executeSave();
    }
  };

  // Handle quick coil allocation to contract
  const handleConfirmAllocateCoil = async () => {
    if (!allocatingContract || !selectedCoilToAllocate) return;
    setAllocateLoading(true);
    setAllocateError(null);

    try {
      const res = await fetch(`/api/inventory/contracts/${allocatingContract.id}/allocate-coil`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coilId: selectedCoilToAllocate,
          allocatedWeightKg: Number(allocateWeight) || 0,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setAllocateError(data.error || 'خطا در تخصیص کلاف به قرارداد');
      } else {
        setAllocatingContract(null);
        setSelectedCoilToAllocate('');
        await onRefresh();
      }
    } catch (err: any) {
      setAllocateError(err.message || 'خطا در ارتباط با سرور');
    } finally {
      setAllocateLoading(false);
    }
  };

  const handleExportContractsCsv = () => {
    const headers = [
      'شماره قرارداد',
      'عنوان قرارداد',
      'مشتری / طرف حساب',
      'نوع قرارداد',
      'گرید ورق',
      'سهمیه کل ورق (kg)',
      'دریافتی (kg)',
      'مصرف شده (kg)',
      'مانده سهمیه (kg)',
      'تعداد ویرایش تیراژ (Revisions)',
      'وضعیت',
    ];

    const rows = filteredContracts.map(c => [
      c.contractNumber,
      c.title,
      c.customerName || 'شرکت ساپکو',
      c.contractType || 'HYBRID',
      c.materialGrade,
      c.allocatedWeightKg,
      c.totalReceivedKg,
      c.totalConsumedKg,
      c.closingBalanceKg,
      (c.revisions || []).length,
      c.status === 'ACTIVE'
        ? 'فعال'
        : c.status === 'SUSPENDED'
        ? 'معلق'
        : 'خاتمه‌یافته',
    ]);

    exportToCsv(`گزارش_قراردادها_و_تعهدات_${Date.now()}`, headers, rows);
  };

  const contractTypeBadges: Record<string, { label: string; color: string }> = {
    CONSIGNMENT_MATERIAL: { label: 'تأمین مواد امانی', color: 'bg-amber-500/15 text-amber-800 border-amber-500/30' },
    SALES_DELIVERY: { label: 'فروش و تحویل محصول', color: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
    HYBRID: { label: 'ترکیبی (تأمین ورق + تحویل قطعه)', color: 'bg-blue-500/15 text-blue-700 border-blue-500/30' },
  };

  const getContractStatusBadge = (status: SapcoContract['status']) => {
    if (status === 'ACTIVE') {
      return {
        label: 'فعال (Active)',
        cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      };
    }
    if (status === 'SUSPENDED') {
      return {
        label: 'معلق (Suspended)',
        cls: 'bg-amber-50 text-amber-800 border border-amber-300',
      };
    }
    return {
      label: 'خاتمه‌یافته (Terminated)',
      cls: 'bg-slate-100 text-slate-700 border border-slate-300',
    };
  };

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="sap-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#ffffff] p-4">
        <div>
          <h2 className="text-sm font-semibold text-[#333333] flex items-center gap-2">
            <FileSignature className="w-4 h-4 text-[#007cc0]" />
            <span>مدیریت قراردادها، وضعیت اجرایی (فعال / معلق / خاتمه‌یافته) و تاریخچه تیراژ (Revisions)</span>
          </h2>
          <p className="text-xs text-[#666666] mt-1">
            ویرایش کامل مفاد قرارداد، تغییر وضعیت اجرایی و ثبت خودکار تاریخچه تغییرات تیراژ (Revisions) در کشوی جزئیات هر قرارداد
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="sap-btn-emphasized flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>ثبت قرارداد جدید</span>
          </button>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>به‌روزرسانی</span>
          </button>

          <button
            onClick={handleExportContractsCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#107e3e] hover:bg-[#0d6832] text-white rounded text-xs font-medium transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>خروجی اکسل</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="sap-card p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#666666]">تعداد کل قراردادها</span>
            <FileSignature className="w-4 h-4 text-[#007cc0]" />
          </div>
          <div className="text-lg font-semibold text-[#333333] mt-1 font-mono">
            {toPersianDigits(mergedContracts.length)}{' '}
            <span className="text-xs font-normal text-[#666666]">قرارداد</span>
          </div>
          <div className="text-[11px] text-[#666666] mt-1 flex items-center gap-2">
            <span className="text-[#107e3e] font-semibold">
              فعال: {toPersianDigits(mergedContracts.filter(c => c.status === 'ACTIVE').length)}
            </span>
            <span>|</span>
            <span className="text-[#e9730c] font-semibold">
              معلق: {toPersianDigits(mergedContracts.filter(c => c.status === 'SUSPENDED').length)}
            </span>
            <span>|</span>
            <span className="text-[#666666] font-semibold">
              خاتمه:{' '}
              {toPersianDigits(
                mergedContracts.filter(c => c.status === 'TERMINATED' || c.status === 'FULFILLED' || c.status === 'EXPIRED').length
              )}
            </span>
          </div>
        </div>

        <div className="sap-card p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#666666]">کل سهمیه ورق قراردادها</span>
            <Scale className="w-4 h-4 text-[#e9730c]" />
          </div>
          <div className="text-lg font-semibold text-[#e9730c] mt-1 font-mono">
            {formatWeightKg(totalAllocatedKg)}
          </div>
          <div className="text-[11px] text-[#666666] mt-1">
            دریافت شده: {formatWeightKg(totalReceivedKg)} | مصرف: {formatWeightKg(totalConsumedKg)}
          </div>
        </div>

        <div className="sap-card p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#666666] flex items-center">
              <span>مانده تعهد ورق امانی</span>
              <FormulaTooltip
                title="فرمول مانده سهمیه ورق قرارداد"
                formula="ClosingQuota = AllocatedQuota - TotalConsumedKg"
                description="مانده سهمیه ورق امانی ساپکو که هنوز به محصول نهایی تبدیل و تسویه نشده است."
              />
            </span>
            <Layers className="w-4 h-4 text-[#107e3e]" />
          </div>
          <div className="text-lg font-semibold text-[#107e3e] mt-1 font-mono">
            {formatWeightKg(totalClosingBalanceKg)}
          </div>
          <div className="text-[11px] text-[#666666] mt-1">
            موجودی ورق در تعهد کارخانه نزد مشتری
          </div>
        </div>

        <div className="sap-card p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#666666]">تعهد تحویل قطعات نهایی</span>
            <PackageCheck className="w-4 h-4 text-[#007cc0]" />
          </div>
          <div className="text-lg font-semibold text-[#007cc0] mt-1 font-mono">
            {formatNumber(totalDeliveredProducts)} / {formatNumber(totalCommittedProducts)}
          </div>
          <div className="text-[11px] text-[#666666] mt-1">
            مانده تحویل به مشتری: {formatNumber(Math.max(0, totalCommittedProducts - totalDeliveredProducts))} عدد
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="sap-card p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-[#666666] absolute right-3 top-2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="جستجوی شماره قرارداد، مشتری، قطعه، کویل‌پک..."
            className="w-full bg-[#ffffff] border border-[#d9d9d9] rounded pr-9 pl-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
          />
        </div>

        <select
          value={selectedCustomer}
          onChange={e => setSelectedCustomer(e.target.value)}
          className="bg-[#ffffff] border border-[#d9d9d9] rounded px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
        >
          <option value="ALL">همه مشتریان / طرف‌حساب‌ها</option>
          {customers.map(cust => (
            <option key={cust} value={cust}>
              {cust}
            </option>
          ))}
        </select>

        <select
          value={selectedType}
          onChange={e => setSelectedType(e.target.value)}
          className="bg-[#ffffff] border border-[#d9d9d9] rounded px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
        >
          <option value="ALL">همه انواع قرارداد</option>
          <option value="HYBRID">ترکیبی (دریافت مواد + تحویل محصول)</option>
          <option value="CONSIGNMENT_MATERIAL">فقط دریافت مواد و ورق امانی</option>
          <option value="SALES_DELIVERY">فقط فروش و تحویل محصول نهایی</option>
        </select>

        <select
          value={selectedStatus}
          onChange={e => setSelectedStatus(e.target.value)}
          className="bg-[#ffffff] border border-[#d9d9d9] rounded px-3 py-1.5 text-xs text-[#333333] font-semibold focus:outline-none focus:border-[#007cc0]"
        >
          <option value="ALL">همه وضعیت‌ها (فعال / معلق / خاتمه‌یافته)</option>
          <option value="ACTIVE">فعال (Active)</option>
          <option value="SUSPENDED">معلق (Suspended)</option>
          <option value="TERMINATED">خاتمه‌یافته (Terminated)</option>
        </select>
      </div>

      {/* Contracts List */}
      <div className="space-y-4">
        {filteredContracts.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs bg-white border border-slate-200 rounded-xl">
            قراردادی با شرایط فیلتر انتخاب شده یافت نشد.
          </div>
        ) : (
          filteredContracts.map(contract => {
            const isExpanded = expandedContractId === contract.id;
            const badge = contractTypeBadges[contract.contractType || 'HYBRID'] || contractTypeBadges.HYBRID;
            const statusBadge = getContractStatusBadge(contract.status);
            const commercialLines = contract.commercialLines || [];
            const incomingMaterials = commercialLines.filter(l => l.lineType === 'CUSTOMER_SUPPLIED_MATERIAL');
            const productDeliveries = commercialLines.filter(l => l.lineType === 'FINISHED_PRODUCT_DELIVERY');
            const connectedCoils = contract.coils || [];
            const revCount = (contract.revisions || []).length;

            const quotaProgress = contract.allocatedWeightKg > 0
              ? Math.min(100, Math.round(((contract.totalConsumedKg || 0) / contract.allocatedWeightKg) * 100))
              : 0;

            return (
              <div
                key={contract.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs transition-all"
              >
                {/* Contract Summary Bar */}
                <div className="p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border-b border-[#e8e8e8]">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => openContractDrawer(contract, 'EDIT')}
                        className="font-mono text-xs font-semibold px-2.5 py-0.5 bg-[#007cc0] hover:bg-[#006299] text-white rounded transition-colors cursor-pointer"
                        title="کلیک جهت باز کردن کشوی جزئیات، ویرایش و تاریخچه تیراژ"
                      >
                        {contract.contractNumber}
                      </button>
                      <h3 className="text-sm font-semibold text-[#333333]">{contract.title}</h3>
                      <span className={`px-2 py-0.5 text-[10px] font-medium border rounded ${badge.color}`}>
                        {badge.label}
                      </span>
                      <span className={`px-2.5 py-0.5 text-[10px] font-semibold rounded ${statusBadge.cls}`}>
                        {statusBadge.label}
                      </span>
                      {revCount > 0 && (
                        <button
                          type="button"
                          onClick={() => openContractDrawer(contract, 'REVISIONS')}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#e5f3fa] hover:bg-[#d5ecfa] text-[#007cc0] border border-[#b3ddf2] text-[10px] font-semibold cursor-pointer"
                        >
                          <History className="w-3 h-3" />
                          <span>{toPersianDigits(revCount)} ویرایش تیراژ (Rev)</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-[#666666] flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-[#666666]" />
                        <span>طرف حساب: <strong className="text-[#333333]">{contract.customerName || 'شرکت ساپکو'}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-[#666666]" />
                        <span>
                          دوره: {formatDate(contract.startDate)} الی {formatDate(contract.endDate)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Scale className="w-3.5 h-3.5 text-[#666666]" />
                        <span>گرید اصلی: <strong className="font-mono text-[#333333]">{contract.materialGrade}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end flex-wrap">
                    {/* Quota Progress */}
                    <div className="text-left font-mono">
                      <div className="text-[11px] text-[#666666]">
                        مانده سهمیه: <strong className="text-[#333333]">{formatNumber(contract.closingBalanceKg)}</strong> / {formatNumber(contract.allocatedWeightKg)} kg
                      </div>
                      <div className="w-36 h-2 bg-[#f0f0f0] border border-[#d9d9d9] rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full bg-[#007cc0] rounded-full"
                          style={{ width: `${quotaProgress}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => openContractDrawer(contract, 'EDIT')}
                        className="sap-btn-emphasized flex items-center gap-1 px-2.5 py-1 text-xs cursor-pointer"
                        title="ویرایش کامل قرارداد، تغییر وضعیت و ثبت بازنگری تیراژ"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>ویرایش قرارداد</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openContractDrawer(contract, 'REVISIONS')}
                        className="sap-btn-standard flex items-center gap-1 px-2.5 py-1 text-xs cursor-pointer"
                        title="مشاهده تاریخچه تغییرات تیراژ (Revisions)"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>تاریخچه تیراژ</span>
                      </button>

                      <button
                        onClick={() => {
                          setAllocatingContract(contract);
                          setAllocateWeight(1000);
                        }}
                        className="sap-btn-standard flex items-center gap-1 px-2.5 py-1 text-xs cursor-pointer"
                        title="تخصیص کلاف یا رول جدید به این قرارداد"
                      >
                        <LinkIcon className="w-3.5 h-3.5" />
                        <span>تخصیص کلاف</span>
                      </button>

                      <button
                        onClick={() =>
                          onViewContractLedger
                            ? onViewContractLedger(contract.contractNumber)
                            : traceDocument(contract.contractNumber, 'INVENTORY_LEDGER')
                        }
                        className="sap-btn-standard flex items-center gap-1 px-2.5 py-1 text-xs cursor-pointer"
                        title="مشاهده کاردکس و گردش اسناد این قرارداد"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>کاردکس</span>
                      </button>

                      <button
                        onClick={() => setExpandedContractId(isExpanded ? null : contract.id)}
                        className="p-1.5 bg-[#f5f5f5] hover:bg-[#e5f3fa] text-[#333333] border border-[#d9d9d9] rounded transition-colors cursor-pointer"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Details Sections */}
                {isExpanded && (
                  <div className="p-4 bg-[#f5f5f5] space-y-4 border-t border-[#d9d9d9]">
                    {/* SECTION 1: INCOMING MATERIALS */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold text-[#333333] flex items-center gap-1.5">
                          <Package className="w-4 h-4 text-[#007cc0]" />
                          مواد و قطعات دریافتی از مشتری / تأمین‌کننده (سهمیه ورق، پیچ و مهره، لاستیک)
                        </h4>
                        <span className="text-[11px] text-[#666666]">
                          {toPersianDigits(incomingMaterials.length)} ردیف تعریف شده
                        </span>
                      </div>

                      {incomingMaterials.length === 0 ? (
                        <div className="p-3 text-center text-xs text-[#666666] bg-white border border-[#d9d9d9] rounded">
                          ردیف تفکیک شده ماده‌ای برای این قرارداد ثبت نشده است (سهمیه کلی: {formatNumber(contract.allocatedWeightKg)} kg).
                        </div>
                      ) : (
                        <div className="overflow-x-auto border border-[#d9d9d9] rounded bg-white">
                          <table className="w-full text-xs text-right sap-table-compact">
                            <thead className="bg-[#ffffff] text-[#333333] border-b border-[#d9d9d9]">
                              <tr>
                                <th className="px-2.5 py-1.5">کد قطعه/ماده</th>
                                <th className="px-2.5 py-1.5">شرح کالا</th>
                                <th className="px-2.5 py-1.5">واحد</th>
                                <th className="px-2.5 py-1.5 text-left font-mono">سهمیه قرارداد</th>
                                <th className="px-2.5 py-1.5 text-left font-mono">دریافت شده</th>
                                <th className="px-2.5 py-1.5 text-left font-mono">مانده سهمیه</th>
                                <th className="px-2.5 py-1.5">توضیحات</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#e8e8e8]">
                              {incomingMaterials.map(mat => (
                                <tr key={mat.id} className="hover:bg-[#e5f3fa]">
                                  <td className="px-2.5 py-1.5 font-mono">
                                    <button
                                      type="button"
                                      onClick={() => traceDocument(mat.partCode, 'INVENTORY_LEDGER')}
                                      className="sap-doc-link"
                                    >
                                      {mat.partCode}
                                    </button>
                                  </td>
                                  <td className="px-2.5 py-1.5 font-medium text-[#333333]">{mat.partName}</td>
                                  <td className="px-2.5 py-1.5 text-[#666666]">{mat.unit === 'KG' ? 'کیلوگرم' : 'عدد'}</td>
                                  <td className="px-2.5 py-1.5 text-left font-mono text-[#333333] font-semibold">
                                    {formatNumber(mat.contractQty)}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-left font-mono text-[#107e3e]">
                                    {formatNumber(mat.deliveredOrReceivedQty || 0)}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-left font-mono text-[#e9730c] font-semibold">
                                    {formatNumber(mat.remainingQty || mat.contractQty)}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-[#666666] text-[11px]">{mat.notes || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* SECTION 2: PRODUCT DELIVERY COMMITMENTS */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold text-[#333333] flex items-center gap-1.5">
                          <PackageCheck className="w-4 h-4 text-[#107e3e]" />
                          تعهدات تجاری تحویل محصول نهایی به مشتری (ارسال جنس طبق قرارداد)
                        </h4>
                        <span className="text-[11px] text-[#666666]">
                          {toPersianDigits(productDeliveries.length)} تعهد محصول
                        </span>
                      </div>

                      {productDeliveries.length === 0 ? (
                        <div className="p-3 text-center text-xs text-[#666666] bg-white border border-[#d9d9d9] rounded">
                          تعهد محصول نهایی به صورت مجزا در این قرارداد درج نشده است.
                        </div>
                      ) : (
                        <div className="overflow-x-auto border border-[#d9d9d9] rounded bg-white">
                          <table className="w-full text-xs text-right sap-table-compact">
                            <thead className="bg-[#ffffff] text-[#333333] border-b border-[#d9d9d9]">
                              <tr>
                                <th className="px-2.5 py-1.5">کد محصول</th>
                                <th className="px-2.5 py-1.5">عنوان قطعه نهایی</th>
                                <th className="px-2.5 py-1.5 text-left font-mono">تیراژ تعهد شده</th>
                                <th className="px-2.5 py-1.5 text-left font-mono">تحویل شده تاکنون</th>
                                <th className="px-2.5 py-1.5 text-left font-mono">مانده تعهد تحویل</th>
                                <th className="px-2.5 py-1.5 text-center">درصد پیشرفت</th>
                                <th className="px-2.5 py-1.5">ملاحظات تحویل</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#e8e8e8]">
                              {productDeliveries.map(prod => {
                                const progress = prod.contractQty > 0
                                  ? Math.min(100, Math.round(((prod.deliveredOrReceivedQty || 0) / prod.contractQty) * 100))
                                  : 0;

                                return (
                                  <tr key={prod.id} className="hover:bg-[#e5f3fa]">
                                    <td className="px-2.5 py-1.5 font-mono">
                                      <button
                                        type="button"
                                        onClick={() => traceDocument(prod.partCode, 'WIP_TRACEABILITY')}
                                        className="sap-doc-link"
                                      >
                                        {prod.partCode}
                                      </button>
                                    </td>
                                    <td className="px-2.5 py-1.5 font-medium text-[#333333]">{prod.partName}</td>
                                    <td className="px-2.5 py-1.5 text-left font-mono text-[#333333] font-semibold">
                                      {formatNumber(prod.contractQty)} عدد
                                    </td>
                                    <td className="px-2.5 py-1.5 text-left font-mono text-[#107e3e] font-semibold">
                                      {formatNumber(prod.deliveredOrReceivedQty || 0)} عدد
                                    </td>
                                    <td className="px-2.5 py-1.5 text-left font-mono text-[#007cc0] font-semibold">
                                      {formatNumber(prod.remainingQty || prod.contractQty)} عدد
                                    </td>
                                    <td className="px-2.5 py-1.5 text-center">
                                      <div className="flex items-center justify-center gap-1.5 font-mono text-[11px]">
                                        <div className="w-16 h-1.5 bg-[#f0f0f0] rounded-full overflow-hidden border border-[#d9d9d9]">
                                          <div
                                            className="h-full bg-[#107e3e] rounded-full"
                                            style={{ width: `${progress}%` }}
                                          />
                                        </div>
                                        <span>{progress}%</span>
                                      </div>
                                    </td>
                                    <td className="px-2.5 py-1.5 text-[#666666] text-[11px]">{prod.notes || 'تحویل ماهیانه'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* SECTION 3: CONNECTED COILS & PACKS */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold text-[#333333] flex items-center gap-1.5">
                          <Layers className="w-4 h-4 text-[#007cc0]" />
                          کلاف‌های ورق و کویل‌پک‌های متصل به این قرارداد
                        </h4>
                        <span className="text-[11px] text-[#666666]">
                          {toPersianDigits(connectedCoils.length)} کلاف متصل
                        </span>
                      </div>

                      {connectedCoils.length === 0 ? (
                        <div className="p-3 text-center text-xs text-[#666666] bg-white border border-[#d9d9d9] rounded">
                          کلافی به صورت مستقیم به این قرارداد لینک نشده است. با دکمه «تخصیص کلاف» می‌توانید کلاف‌های موجود در انبار را متصل کنید.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {connectedCoils.map((coil, idx) => (
                            <div
                              key={idx}
                              className="p-3 bg-white border border-[#d9d9d9] rounded flex flex-col justify-between gap-2"
                            >
                              <div className="flex items-center justify-between">
                                <button
                                  type="button"
                                  onClick={() => traceDocument(coil.coilId, 'COILS')}
                                  className="sap-doc-link text-xs"
                                  title="مشاهده شناسنامه کلاف در انبار رول‌ها"
                                >
                                  {coil.coilId}
                                </button>
                                <span className="px-1.5 py-0.5 bg-[#f5f5f5] border border-[#d9d9d9] text-[10px] text-[#333333] font-mono rounded">
                                  پکینگ: {coil.coilPackNumber || '—'}
                                </span>
                              </div>
                              <div className="text-[11px] text-[#666666] space-y-0.5">
                                <div>گرید: {coil.materialGrade || contract.materialGrade}</div>
                                {coil.thicknessMm && <div>ضخامت: {coil.thicknessMm}mm | عرض: {coil.widthMm}mm</div>}
                              </div>
                              <div className="pt-2 border-t border-[#e8e8e8] flex items-center justify-between text-xs font-mono">
                                <span className="text-[#666666]">سهم تخصیصی:</span>
                                <span className="font-semibold text-[#333333]">{formatNumber(coil.allocatedWeightKg)} kg</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ==================================================================== */}
      {/* SLIDE-OVER DRAWER: CONTRACT EDIT, STATUS & REVISIONS HISTORY          */}
      {/* ==================================================================== */}
      {activeDrawerContract && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-[#333333]/40 backdrop-blur-[1px] animate-in fade-in duration-150"
          dir="rtl"
          onClick={() => setDrawerContractId(null)}
        >
          <div
            className="w-full max-w-2xl bg-[#ffffff] h-full shadow-2xl border-r border-[#d9d9d9] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Sticky Header */}
            <div className="sticky top-0 z-20 bg-[#ffffff] text-[#333333] px-5 py-3.5 flex items-center justify-between border-b border-[#d9d9d9]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] font-mono text-xs font-semibold">
                    {activeDrawerContract.contractNumber}
                  </span>
                  <h3 className="text-sm font-semibold text-[#333333]">{activeDrawerContract.title}</h3>
                </div>
                <p className="text-[11px] text-[#666666] mt-1">
                  طرف حساب: {activeDrawerContract.customerName || 'شرکت ساپکو'} · گرید پایه: {activeDrawerContract.materialGrade}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerContractId(null)}
                className="p-1.5 rounded bg-[#f5f5f5] hover:bg-[#e5f3fa] text-[#333333] border border-[#d9d9d9] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Sub-Tabs */}
            <div className="sap-icon-tab-bar px-5">
              <button
                type="button"
                onClick={() => setDrawerTab('EDIT')}
                className={`sap-icon-tab ${drawerTab === 'EDIT' ? 'sap-icon-tab-active' : ''}`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>۱. ویرایش مشخصات، تیراژ و وضعیت قرارداد</span>
              </button>

              <button
                type="button"
                onClick={() => setDrawerTab('REVISIONS')}
                className={`sap-icon-tab ${drawerTab === 'REVISIONS' ? 'sap-icon-tab-active' : ''}`}
              >
                <History className="w-3.5 h-3.5" />
                <span>
                  ۲. تاریخچه تغییرات تیراژ (Revisions) ({toPersianDigits((activeDrawerContract.revisions || []).length)})
                </span>
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {drawerTab === 'EDIT' ? (
                <>
                  {/* Status Selector Banner */}
                  <div className="p-4 rounded bg-[#f7f7f7] border border-[#d9d9d9] space-y-2.5">
                    <label className="block text-xs font-semibold text-[#333333]">
                      وضعیت اجرایی قرارداد (Contract Status):
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditStatus('ACTIVE')}
                        className={`p-2.5 rounded border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                          editStatus === 'ACTIVE'
                            ? 'bg-[#107e3e] text-white border-[#107e3e]'
                            : 'bg-white text-[#333333] border-[#d9d9d9] hover:bg-[#eef8f2]'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>فعال (Active)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditStatus('SUSPENDED')}
                        className={`p-2.5 rounded border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                          editStatus === 'SUSPENDED'
                            ? 'bg-[#e9730c] text-white border-[#e9730c]'
                            : 'bg-white text-[#333333] border-[#d9d9d9] hover:bg-[#fff5eb]'
                        }`}
                      >
                        <PauseCircle className="w-4 h-4" />
                        <span>معلق (Suspended)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditStatus('TERMINATED')}
                        className={`p-2.5 rounded border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                          editStatus === 'TERMINATED'
                            ? 'bg-[#666666] text-white border-[#666666]'
                            : 'bg-white text-[#333333] border-[#d9d9d9] hover:bg-[#f5f5f5]'
                        }`}
                      >
                        <Ban className="w-4 h-4" />
                        <span>خاتمه‌یافته (Terminated)</span>
                      </button>
                    </div>
                  </div>

                  {/* General Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="sm:col-span-2">
                      <label className="block text-[#333333] font-semibold mb-1">عنوان قرارداد:</label>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        className="w-full px-3 py-2 rounded border border-[#bfbfbf] bg-white text-[#333333] focus:outline-none focus:border-[#007cc0]"
                      />
                    </div>

                    <div>
                      <label className="block text-[#333333] font-semibold mb-1">مشتری / طرف حساب:</label>
                      <input
                        type="text"
                        value={editCustomerName}
                        onChange={e => setEditCustomerName(e.target.value)}
                        className="w-full px-3 py-2 rounded border border-[#bfbfbf] bg-white text-[#333333] focus:outline-none focus:border-[#007cc0]"
                      />
                    </div>

                    <div>
                      <label className="block text-[#333333] font-semibold mb-1">گرید ورق پایه:</label>
                      <input
                        type="text"
                        value={editMaterialGrade}
                        onChange={e => setEditMaterialGrade(e.target.value)}
                        className="w-full px-3 py-2 rounded border border-[#bfbfbf] bg-white font-mono text-[#333333] focus:outline-none focus:border-[#007cc0]"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1">
                        سهمیه وزنی کل قرارداد (کیلوگرم):
                      </label>
                        <input
                          type="number"
                          min={0}
                          value={editAllocatedWeightKg}
                          onChange={e => setEditAllocatedWeightKg(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded border border-[#007cc0] bg-[#e5f3fa]/40 font-mono font-semibold text-[#333333] focus:outline-none focus:border-[#006299]"
                        />
                        <span className="text-[10px] text-[#666666] mt-1 block">
                          مقدار قبلی: {formatNumber(activeDrawerContract.allocatedWeightKg)} kg (هرگونه تغییر در Revisions ثبت می‌شود)
                        </span>
                      </div>

                      <div>
                        <label className="block text-[#333333] font-semibold mb-1">بازه زمانی قرارداد:</label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="date"
                            value={editStartDate}
                            onChange={e => setEditStartDate(e.target.value)}
                            className="px-2 py-2 rounded border border-[#d9d9d9] bg-white font-mono text-[11px]"
                          />
                          <input
                            type="date"
                            value={editEndDate}
                            onChange={e => setEditEndDate(e.target.value)}
                            className="px-2 py-2 rounded border border-[#d9d9d9] bg-white font-mono text-[11px]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Commercial Lines Quantity Editor */}
                    {editCommercialLines.length > 0 && (
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-[#333333]">
                          ویرایش تیراژ ردیف‌های تعهد محصول و مواد قرارداد:
                        </label>
                        <div className="border border-[#d9d9d9] rounded overflow-hidden">
                          <table className="w-full text-right text-xs sap-table-compact">
                            <thead className="bg-[#ffffff] border-b border-[#d9d9d9] text-[#333333]">
                              <tr>
                                <th className="py-1.5 px-2.5">کد و نام کالا</th>
                                <th className="py-1.5 px-2.5">نوع ردیف</th>
                                <th className="py-1.5 px-2.5">تیراژ تعهد شده</th>
                                <th className="py-1.5 px-2.5">تحویل/دریافت شده</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#e8e8e8]">
                              {editCommercialLines.map((line, idx) => (
                                <tr key={line.id || idx}>
                                  <td className="py-1.5 px-2.5">
                                    <div className="font-semibold text-[#333333]">{line.partName}</div>
                                    <div className="text-[10px] font-mono text-[#666666]">{line.partCode}</div>
                                  </td>
                                  <td className="py-1.5 px-2.5 text-[11px] text-[#666666]">
                                    {line.lineType === 'CUSTOMER_SUPPLIED_MATERIAL' ? 'سهمیه ورق/ماده' : 'تعهد تحویل قطعه'}
                                  </td>
                                  <td className="py-1.5 px-2.5">
                                    <input
                                      type="number"
                                      min={0}
                                      value={line.contractQty}
                                      onChange={e => {
                                        const val = Number(e.target.value) || 0;
                                        setEditCommercialLines(prev =>
                                          prev.map((item, i) => (i === idx ? { ...item, contractQty: val } : item))
                                        );
                                      }}
                                      className="w-28 px-2.5 py-1 rounded border border-[#d9d9d9] font-mono font-semibold text-[#333333]"
                                    />
                                  </td>
                                  <td className="py-1.5 px-2.5 font-mono text-[#107e3e]">
                                    {formatNumber(line.deliveredOrReceivedQty || 0)} {line.unit === 'KG' ? 'kg' : 'عدد'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Revision Reason & Notes */}
                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="block text-[#333333] font-semibold mb-1">
                          علت بازنگری تیراژ / شماره الحاقیه (جهت ثبت در تاریخچه Revisions):
                        </label>
                        <input
                          type="text"
                          value={editRevisionReason}
                          onChange={e => setEditRevisionReason(e.target.value)}
                          placeholder="مثلاً: ابلاغ الحاقیه شماره ۳ ساپکو و افزایش سهمیه ورق کششی..."
                          className="w-full px-3 py-2 rounded border border-[#d9d9d9] bg-[#fffcf5] text-[#333333] focus:outline-none focus:border-[#007cc0]"
                        />
                      </div>

                      <div>
                        <label className="block text-[#333333] font-semibold mb-1">توضیحات کلی قرارداد:</label>
                        <textarea
                          rows={2}
                          value={editNotes}
                          onChange={e => setEditNotes(e.target.value)}
                          className="w-full px-3 py-2 rounded border border-[#d9d9d9] bg-white text-[#333333] focus:outline-none focus:border-[#007cc0]"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  /* TAB 2: QUANTITY REVISIONS HISTORY TIMELINE */
                  <div className="space-y-4">
                    <div className="p-3.5 rounded bg-[#e5f3fa] border border-[#b3ddf2] flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-[#333333]">
                          تاریخچه رسمی تغییرات تیراژ و وضعیت قرارداد (Contract Revisions Log)
                        </div>
                        <div className="text-[11px] text-[#666666] mt-0.5">
                          تمامی اصلاحیه‌های سهمیه ورق، تیراژ قطعات و تغییرات وضعیت به صورت تغییرناپذیر ثبت می‌شوند.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDrawerTab('EDIT')}
                        className="sap-btn-emphasized px-3 py-1.5 cursor-pointer shrink-0"
                      >
                        + ثبت ویرایش جدید
                      </button>
                    </div>

                    {(activeDrawerContract.revisions || []).length === 0 ? (
                      <div className="p-8 text-center text-xs text-[#666666] bg-[#f5f5f5] rounded border border-[#d9d9d9]">
                        هنوز هیچ تغییر تیراژی روی این قرارداد ثبت نشده است.
                      </div>
                    ) : (
                      <div className="relative pr-6 border-r-2 border-[#b3ddf2] space-y-4 mr-2">
                        {(activeDrawerContract.revisions || []).map((rev, index) => {
                          const delta = (rev.newQty || 0) - (rev.oldQty || 0);
                          return (
                            <div
                              key={rev.id || index}
                              className="relative bg-white border border-[#d9d9d9] rounded p-3.5 shadow-2xs space-y-2"
                            >
                              <span className="absolute -right-[31px] top-4 w-4 h-4 rounded-full bg-[#007cc0] border-2 border-white shadow" />
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8e8e8] pb-2">
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 rounded bg-[#007cc0] text-white font-mono text-[11px] font-semibold">
                                    Rev #{toPersianDigits(rev.revisionNumber || index + 1)}
                                  </span>
                                  <span className="text-xs font-semibold text-[#333333]">{rev.fieldLabelFa}</span>
                                </div>
                                <span className="text-[11px] font-mono text-[#666666]">{rev.timestamp}</span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-[#f5f5f5] p-2.5 rounded text-xs font-mono">
                                <div>
                                  <span className="text-[10px] text-[#666666] block font-sans">تیراژ / سهمیه قبلی:</span>
                                  <strong className="text-[#333333]">
                                    {formatNumber(rev.oldQty)} {rev.unit}
                                  </strong>
                                </div>
                                <div>
                                  <span className="text-[10px] text-[#666666] block font-sans">تیراژ / سهمیه جدید:</span>
                                  <strong className="text-[#333333]">
                                    {formatNumber(rev.newQty)} {rev.unit}
                                  </strong>
                                </div>
                                <div>
                                  <span className="text-[10px] text-[#666666] block font-sans">میزان تغییرات (Delta):</span>
                                  <strong
                                    className={
                                      delta > 0
                                        ? 'text-[#107e3e]'
                                        : delta < 0
                                        ? 'text-[#bb0000]'
                                        : 'text-[#666666]'
                                    }
                                  >
                                    {delta > 0 ? `+${formatNumber(delta)}` : formatNumber(delta)} {rev.unit}
                                  </strong>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#666666] pt-1">
                                <div>
                                  <strong>علت بازنگری: </strong>
                                  <span>{rev.reasonFa}</span>
                                </div>
                                <div className="text-[#666666]">
                                  ثبت‌کننده: <strong className="text-[#333333]">{rev.actor}</strong>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Sticky Footer */}
              <div className="bg-[#f5f5f5] border-t border-[#d9d9d9] px-5 py-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setDrawerContractId(null)}
                  className="sap-btn-standard px-4 py-1.5 text-xs cursor-pointer"
                >
                  بستن کشو
                </button>

                {drawerTab === 'EDIT' && (
                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={handleSaveContractEdit}
                    className="sap-btn-emphasized px-5 py-1.5 text-xs flex items-center gap-2 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{savingEdit ? 'در حال ثبت تغییرات...' : 'ذخیره تغییرات و ثبت در تاریخچه تیراژ (Revisions)'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      {/* Contract Create Modal */}
      <ContractCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={async () => {
          await onRefresh();
        }}
        parts={parts}
        coils={coils}
        currentUser={currentUser}
      />

      {/* Quick Allocate Coil Modal */}
      {allocatingContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#333333]/40 backdrop-blur-[1px]" dir="rtl">
          <div className="w-full max-w-md bg-[#ffffff] border border-[#d9d9d9] rounded p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-3">
              <div>
                <h3 className="text-xs font-bold text-[#333333]">تخصیص کلاف به قرارداد</h3>
                <span className="text-[11px] font-mono text-[#007cc0]">{allocatingContract.contractNumber}</span>
              </div>
              <button
                onClick={() => setAllocatingContract(null)}
                className="text-[#666666] hover:text-[#333333] cursor-pointer"
              >
                ✕
              </button>
            </div>

            {allocateError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded">
                {allocateError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#333333] mb-1">انتخاب کلاف موجود در انبار</label>
                <select
                  value={selectedCoilToAllocate}
                  onChange={e => {
                    setSelectedCoilToAllocate(e.target.value);
                    const selected = coils.find(c => c.coilId === e.target.value || c.id === e.target.value);
                    if (selected) {
                      setAllocateWeight(selected.remainingWeightKg);
                    }
                  }}
                  className="w-full px-3 py-1.5 bg-[#ffffff] border border-[#d9d9d9] rounded text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                >
                  <option value="">-- انتخاب کلاف و کویل‌پک --</option>
                  {coils.map(c => (
                    <option key={c.id} value={c.coilId}>
                      [{c.coilId}] پکینگ: {c.coilPackNumber} | {c.materialGrade} {c.thicknessMm}mm | مانده: {formatNumber(c.remainingWeightKg)} kg
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#333333] mb-1">
                  وزن تخصیصی به این قرارداد (کیلوگرم)
                </label>
                <input
                  type="number"
                  min="1"
                  value={allocateWeight}
                  onChange={e => setAllocateWeight(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-[#ffffff] border border-[#d9d9d9] rounded text-xs text-[#333333] font-mono text-left focus:outline-none focus:border-[#007cc0]"
                  dir="ltr"
                />
                <span className="text-[10px] text-[#666666] mt-1 block">
                  می‌توانید کل وزن کلاف یا بخشی از آن (تخصیص چندقراردادی) را به این قرارداد متصل نمایید.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#e8e8e8]">
              <button
                type="button"
                onClick={() => setAllocatingContract(null)}
                className="sap-btn-standard px-3 py-1.5 text-xs cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={!selectedCoilToAllocate || allocateLoading}
                onClick={handleConfirmAllocateCoil}
                className="sap-btn-emphasized px-4 py-1.5 text-xs cursor-pointer disabled:opacity-50"
              >
                {allocateLoading ? 'در حال ثبت...' : 'تأیید و اتصال کلاف'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
