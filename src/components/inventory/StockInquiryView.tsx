import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Download,
  Building2,
  RefreshCw,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Layers,
  Boxes,
  BookmarkCheck,
  FileSpreadsheet,
  ArrowDownLeft,
  ArrowUpRight,
  History,
  CheckCircle2,
  AlertTriangle,
  GitBranch,
  Pin,
  ShieldAlert,
  Lock,
  Unlock,
} from 'lucide-react';
import {
  DetailedStockBalance,
  Part,
  WarehouseDefinition,
  StockOwnership,
  InventoryDocument,
} from '../../types/inventory';
import {
  formatNumber,
  formatWeightKg,
  toPersianDigits,
  formatDateTime,
  exportToCsv,
} from '../../utils/formatters';
import { CoilSlittingGenealogyPanel } from './CoilSlittingGenealogyPanel';
import { useEnterpriseUx } from '../../context/EnterpriseUxContext';
import { useErpRouter } from '../../context/RouterContext';
import { FormulaTooltip } from '../common/FormulaTooltip';
import {
  loadQcHoldMap,
  saveQcHoldMap,
  loadVipPartsMap,
  isPartVip,
  QcHoldRecord,
} from '../../utils/qcHoldStore';

export type StockGroupingKey =
  | 'NONE'
  | 'PART'
  | 'WAREHOUSE'
  | 'OWNERSHIP'
  | 'CONTRACT'
  | 'COIL_PACK'
  | 'GRADE'
  | 'THICKNESS';

interface StockInquiryViewProps {
  balances: DetailedStockBalance[];
  parts: Part[];
  warehouses: WarehouseDefinition[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}

const DEFAULT_VISIBLE_COLUMNS = {
  partCode: true,
  partName: true,
  warehouse: true,
  lotNumber: true,
  contract: true,
  ownership: true,
  physicalQty: true,
  availableQty: true,
  reservedQty: true,
  blockedQty: false,
  physicalKg: true,
  lastTx: false,
};

export const StockInquiryView: React.FC<StockInquiryViewProps> = ({
  balances: rawBalances,
  parts,
  warehouses,
  loading,
  onRefresh,
}) => {
  const { requestConfirm, showUndoToast, recordAudit } = useEnterpriseUx();
  const { route, traceDocument, clearDocQuery } = useErpRouter();
  const [qcHoldMap, setQcHoldMap] = useState<Record<string, QcHoldRecord>>(() => loadQcHoldMap());
  const [vipMap, setVipMap] = useState<Record<string, boolean>>(() => loadVipPartsMap());

  useEffect(() => {
    const onHoldChange = () => setQcHoldMap(loadQcHoldMap());
    const onVipChange = () => setVipMap(loadVipPartsMap());
    window.addEventListener('kpims-qc-hold-changed', onHoldChange);
    window.addEventListener('kpims-vip-parts-changed', onVipChange);
    return () => {
      window.removeEventListener('kpims-qc-hold-changed', onHoldChange);
      window.removeEventListener('kpims-vip-parts-changed', onVipChange);
    };
  }, []);

  // Apply QC Hold overrides directly to balances so Available (ATP) = Physical - Reserved - QCHold
  const balances = useMemo(() => {
    return rawBalances.map(b => {
      const hold =
        qcHoldMap[b.id] ||
        (b.lotNumber ? qcHoldMap[b.lotNumber] : undefined) ||
        qcHoldMap[`${b.partId}-${b.warehouseId}`];
      if (!hold || !hold.isHeld) return b;
      const heldQty = Number(hold.heldQty || b.physicalQty || 0);
      const effectiveBlocked = Math.min(b.physicalQty, Math.max(b.qualityBlockedQty || 0, heldQty));
      const newAvailableQty = Math.max(0, b.physicalQty - b.reservedQty - effectiveBlocked);
      const unitWeight = b.physicalQty > 0 ? b.physicalKg / b.physicalQty : 1;
      return {
        ...b,
        qualityBlockedQty: effectiveBlocked,
        availableQty: newAvailableQty,
        availableKg: Math.round(newAvailableQty * unitWeight * 100) / 100,
      };
    });
  }, [rawBalances, qcHoldMap]);

  // Mandatory QC Hold Reason Modal State
  const [qcHoldTargetBalance, setQcHoldTargetBalance] = useState<DetailedStockBalance | null>(null);
  const [qcHoldReasonText, setQcHoldReasonText] = useState('');
  const [qcHoldReasonError, setQcHoldReasonError] = useState('');

  const STOCK_QC_HOLD_PRESETS: string[] = [
    'زنگ‌زدگی سطحی یا اکسیداسیون ورق در انبار',
    'مغایرت ابعادی / ضخامت با نقشه فنی ساپکو',
    'عدم تأیید آزمایشگاه متالورژی (گواهی ذوب)',
    'آسیب فیزیکی پالت یا لبه کلاف در جابجایی',
    'مشکوک به مخلوط شدن بچ تولیدی (نیاز به سورتینگ ۱۰۰٪)',
  ];

  const executeBalanceQcHoldChange = async (
    b: DetailedStockBalance,
    nextHeld: boolean,
    mandatoryReasonFa?: string
  ) => {
    const holdKey = b.id;
    const qtyToHold = b.physicalQty;
    const weightToHold = b.physicalKg || b.physicalQty;
    const finalReason = (mandatoryReasonFa || '').trim() || 'قرنطینه کیفی در جدول موجودی انبار (QC Hold)';

    const prevMap = { ...qcHoldMap };
    const updatedMap = { ...qcHoldMap };

    if (nextHeld) {
      const rec: QcHoldRecord = {
        key: holdKey,
        partId: b.partId,
        partCode: b.partCode,
        partName: b.partName,
        lotNumber: b.lotNumber,
        warehouseName: b.warehouseName,
        isHeld: true,
        heldQty: qtyToHold,
        heldWeightKg: weightToHold,
        unit: b.unit === 'KG' ? 'KG' : 'PCS',
        reasonFa: finalReason,
        updatedAt: new Date().toLocaleString('fa-IR'),
        actor: 'مدیریت کنترل کیفیت (QC)',
      };
      updatedMap[holdKey] = rec;
      if (b.lotNumber) updatedMap[b.lotNumber] = rec;
    } else {
      delete updatedMap[holdKey];
      if (b.lotNumber) delete updatedMap[b.lotNumber];
    }

    setQcHoldMap(updatedMap);
    saveQcHoldMap(updatedMap);

    try {
      await fetch('/api/inventory/qc-hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: holdKey,
          partId: b.partId,
          partCode: b.partCode,
          materialGrade: b.materialGrade,
          lotNumber: b.lotNumber,
          isHeld: nextHeld,
          heldQty: qtyToHold,
          heldWeightKg: weightToHold,
          reasonFa: finalReason,
        }),
      });
      await onRefresh();
    } catch {
      // local state already updated
    }

    recordAudit({
      actionType: 'STATUS_CHANGE',
      module: 'انبار و قرنطینه کیفی (QC Hold)',
      entityId: b.id,
      entityCode: b.lotNumber || b.partCode,
      summaryFa: nextHeld
        ? `قرنطینه کیفی (QC Hold) «${b.partName}» به مقدار ${formatNumber(qtyToHold)} ${b.unit} — علت: ${finalReason}`
        : `رفع قرنطینه کیفی «${b.partName}» و بازگشت به موجودی آزاد (ATP)`,
      details: nextHeld
        ? `علت قرنطینه (QC Hold Reason): ${finalReason} | کسر مستقیم از ATP در انبار و MRP`
        : `آزادسازی موجودی ${b.partName} و بازگشت به ATP`,
      beforeSnapshot: { availableQty: b.availableQty, qualityBlockedQty: b.qualityBlockedQty },
      afterSnapshot: {
        availableQty: nextHeld ? 0 : b.physicalQty - b.reservedQty,
        qualityBlockedQty: nextHeld ? qtyToHold : 0,
        qcHoldReason: nextHeld ? finalReason : null,
      },
    });

    showUndoToast({
      title: nextHeld
        ? `🔒 «${b.partName}» در قرنطینه کیفی (QC Hold) قرار گرفت`
        : `🔓 قرنطینه کیفی «${b.partName}» آزاد شد`,
      description: nextHeld
        ? `علت: ${finalReason} | مقدار ${formatNumber(qtyToHold)} ${b.unit === 'KG' ? 'kg' : 'عدد'} از ATP کسر گردید.`
        : 'موجودی به چرخه آزاد تولید بازگشت.',
      onUndo: () => {
        setQcHoldMap(prevMap);
        saveQcHoldMap(prevMap);
      },
    });
  };

  const handleToggleQcHoldOnBalance = (b: DetailedStockBalance) => {
    const holdKey = b.id;
    const isCurrentlyHeld = Boolean(
      qcHoldMap[holdKey]?.isHeld ||
        (b.lotNumber && qcHoldMap[b.lotNumber]?.isHeld) ||
        b.qualityBlockedQty > 0
    );
    const nextHeld = !isCurrentlyHeld;
    const qtyToHold = b.physicalQty;

    if (nextHeld) {
      setQcHoldTargetBalance(b);
      setQcHoldReasonText('');
      setQcHoldReasonError('');
      return;
    }

    requestConfirm({
      title: `رفع قرنطینه کیفی (Release QC Hold) «${b.partName}»`,
      description: `آیا از تایید کیفی و آزادسازی موجودی «${b.lotNumber || b.partCode}» اطمینان دارید؟`,
      consequenceText: `مقدار ${formatNumber(qtyToHold)} ${
        b.unit === 'KG' ? 'کیلوگرم' : 'عدد'
      } مجدداً به «موجودی آزاد قابل برنامه‌ریزی (ATP)» در انبار و MRP اضافه خواهد شد.`,
      severity: 'info',
      confirmLabel: 'تأیید رفع قرنطینه',
      onConfirm: async () => {
        await executeBalanceQcHoldChange(b, false);
      },
    });
  };

  const handleConfirmStockQcHoldModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qcHoldTargetBalance) return;
    const trimmed = qcHoldReasonText.trim();
    if (!trimmed) {
      setQcHoldReasonError('ثبت «علت قرنطینه (QC Hold Reason)» پیش از فریز کردن موجودی الزامی است.');
      return;
    }
    const target = qcHoldTargetBalance;
    setQcHoldTargetBalance(null);
    setQcHoldReasonText('');
    setQcHoldReasonError('');
    await executeBalanceQcHoldChange(target, true, trimmed);
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPartFilter, setSelectedPartFilter] = useState('ALL');
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState('ALL');
  const [selectedOwnershipFilter, setSelectedOwnershipFilter] = useState<'ALL' | StockOwnership>('ALL');
  const [selectedGradeFilter, setSelectedGradeFilter] = useState('ALL');
  const [selectedContractFilter, setSelectedContractFilter] = useState('ALL');
  const [selectedLotFilter, setSelectedLotFilter] = useState('ALL');
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  // View Mode: ANALYTICAL_TABLE vs PART_CARDEX vs COIL_SLITTING
  const [inquiryMode, setInquiryMode] = useState<'PART_CARDEX' | 'ANALYTICAL_TABLE' | 'COIL_SLITTING'>('PART_CARDEX');
  const [onlyBelowReorderPoint, setOnlyBelowReorderPoint] = useState(false);
  const [selectedCardexPartId, setSelectedCardexPartId] = useState<string>('');
  const [partSearchQuery, setPartSearchQuery] = useState<string>('');
  const [allDocuments, setAllDocuments] = useState<InventoryDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState<boolean>(false);

  // Grouping & Expandable Details
  const [groupBy, setGroupBy] = useState<StockGroupingKey>('NONE');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [savedViewNotice, setSavedViewNotice] = useState(false);

  // Fetch inventory documents for Cardex calculation
  useEffect(() => {
    setDocsLoading(true);
    fetch('/api/inventory/documents?limit=500')
      .then(r => r.json())
      .then(res => {
        if (res.success && Array.isArray(res.data)) {
          setAllDocuments(res.data);
        }
      })
      .catch(() => {})
      .finally(() => setDocsLoading(false));
  }, [balances]);

  // Select default part for Cardex or jump directly from URL docQuery
  useEffect(() => {
    const q = (route.docQuery || '').trim();
    if (q) {
      const qLower = q.toLowerCase();
      setSearchTerm(q);
      const matchedPart = parts.find(
        p => p.code.toLowerCase() === qLower || p.code.toLowerCase().includes(qLower) || p.name.toLowerCase().includes(qLower)
      );
      if (matchedPart) {
        setSelectedCardexPartId(matchedPart.id);
        setPartSearchQuery(matchedPart.code);
        setInquiryMode('PART_CARDEX');
        return;
      }
      const matchedDoc = allDocuments.find(
        d => d.documentNumber.toLowerCase().includes(qLower) || (d.referenceNumber || '').toLowerCase().includes(qLower)
      );
      if (matchedDoc && matchedDoc.lines && matchedDoc.lines.length > 0) {
        const linePart = parts.find(p => p.id === matchedDoc.lines[0].partId || p.code === matchedDoc.lines[0].partCode);
        if (linePart) {
          setSelectedCardexPartId(linePart.id);
          setInquiryMode('PART_CARDEX');
          return;
        }
      }
      const matchedBal = balances.find(
        b =>
          (b.lotNumber && b.lotNumber.toLowerCase().includes(qLower)) ||
          (b.heatNumber && b.heatNumber.toLowerCase().includes(qLower)) ||
          (b.contractNumber && b.contractNumber.toLowerCase().includes(qLower))
      );
      if (matchedBal) {
        setInquiryMode('ANALYTICAL_TABLE');
        return;
      }
    }
    if (!selectedCardexPartId && parts.length > 0) {
      const partWithStock = parts.find(p => balances.some(b => b.partId === p.id || b.partCode === p.code));
      setSelectedCardexPartId((partWithStock || parts[0]).id);
    }
  }, [route.docQuery, parts, balances, allDocuments, selectedCardexPartId]);

  // Saved Column Preferences
  const [visibleCols, setVisibleCols] = useState<typeof DEFAULT_VISIBLE_COLUMNS>(() => {
    if (typeof window === 'undefined') return DEFAULT_VISIBLE_COLUMNS;
    try {
      const saved = window.localStorage.getItem('kpims_stock_inquiry_cols_v2');
      return saved ? { ...DEFAULT_VISIBLE_COLUMNS, ...JSON.parse(saved) } : DEFAULT_VISIBLE_COLUMNS;
    } catch {
      return DEFAULT_VISIBLE_COLUMNS;
    }
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Sorting
  const [sortField, setSortField] = useState<keyof DetailedStockBalance>('physicalKg');
  const [sortAsc, setSortAsc] = useState(false);

  // Unique material grades
  const grades = useMemo(() => {
    const set = new Set<string>();
    parts.forEach(p => {
      if (p.materialGrade) set.add(p.materialGrade);
    });
    balances.forEach(b => {
      if (b.materialGrade) set.add(b.materialGrade);
    });
    return Array.from(set);
  }, [parts, balances]);

  // Unique contracts
  const contractNumbers = useMemo(() => {
    const set = new Set<string>();
    balances.forEach(b => {
      if (b.contractNumber) set.add(b.contractNumber);
    });
    return Array.from(set);
  }, [balances]);

  // Unique coil-packs / lot numbers dynamically matching current part/grade
  const matchingPacksOrLots = useMemo(() => {
    let list = balances;
    if (selectedPartFilter !== 'ALL') {
      list = list.filter(b => b.partId === selectedPartFilter);
    }
    if (selectedGradeFilter !== 'ALL') {
      list = list.filter(b => b.materialGrade === selectedGradeFilter);
    }
    if (selectedContractFilter !== 'ALL') {
      list = list.filter(b => b.contractNumber === selectedContractFilter);
    }
    const set = new Set<string>();
    list.forEach(b => {
      if (b.lotNumber) set.add(b.lotNumber);
    });
    return Array.from(set);
  }, [balances, selectedPartFilter, selectedGradeFilter, selectedContractFilter]);

  const filteredBalances = useMemo(() => {
    return balances
      .filter(item => {
        if (selectedPartFilter !== 'ALL' && item.partId !== selectedPartFilter) return false;
        if (selectedWarehouseFilter !== 'ALL' && item.warehouseId !== selectedWarehouseFilter) return false;
        if (selectedOwnershipFilter !== 'ALL' && item.ownership !== selectedOwnershipFilter) return false;
        if (selectedGradeFilter !== 'ALL' && item.materialGrade !== selectedGradeFilter) return false;
        if (selectedContractFilter !== 'ALL' && item.contractNumber !== selectedContractFilter) return false;
        if (selectedLotFilter !== 'ALL' && item.lotNumber !== selectedLotFilter) return false;
        if (onlyAvailable && item.availableQty <= 0) return false;

        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          const matchesName = item.partName.toLowerCase().includes(q);
          const matchesCode = item.partCode.toLowerCase().includes(q);
          const matchesLot = item.lotNumber ? item.lotNumber.toLowerCase().includes(q) : false;
          const matchesHeat = item.heatNumber ? item.heatNumber.toLowerCase().includes(q) : false;
          const matchesContract = item.contractNumber ? item.contractNumber.toLowerCase().includes(q) : false;
          const matchesGrade = item.materialGrade ? item.materialGrade.toLowerCase().includes(q) : false;
          const matchesWh = item.warehouseName.toLowerCase().includes(q);
          if (
            !matchesName &&
            !matchesCode &&
            !matchesLot &&
            !matchesHeat &&
            !matchesContract &&
            !matchesGrade &&
            !matchesWh
          ) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const valA = a[sortField] ?? 0;
        const valB = b[sortField] ?? 0;
        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      });
  }, [
    balances,
    searchTerm,
    selectedPartFilter,
    selectedWarehouseFilter,
    selectedOwnershipFilter,
    selectedGradeFilter,
    selectedContractFilter,
    selectedLotFilter,
    onlyAvailable,
    sortField,
    sortAsc,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    selectedPartFilter,
    selectedWarehouseFilter,
    selectedOwnershipFilter,
    selectedGradeFilter,
    selectedContractFilter,
    selectedLotFilter,
    onlyAvailable,
    groupBy,
  ]);

  // Aggregate stats (strictly physical without duplication)
  const totalPhysicalKg = filteredBalances.reduce((sum, b) => sum + b.physicalKg, 0);
  const totalAvailableKg = filteredBalances.reduce((sum, b) => sum + b.availableKg, 0);
  const totalReservedKg = filteredBalances.reduce((sum, b) => sum + b.reservedKg, 0);
  const totalSapcoKg = filteredBalances
    .filter(b => b.ownership === 'SAPCO_SUPPLIER_OWNED')
    .reduce((sum, b) => sum + b.physicalKg, 0);

  // Grouped View Calculation
  const groupedData = useMemo(() => {
    if (groupBy === 'NONE') return [];
    const map = new Map<
      string,
      {
        groupKey: string;
        groupTitle: string;
        items: DetailedStockBalance[];
        totalPhysicalKg: number;
        totalAvailableKg: number;
        coilsCount: number;
      }
    >();

    filteredBalances.forEach(item => {
      let key = 'نامشخص';
      let title = 'نامشخص';
      if (groupBy === 'PART') {
        key = item.partId;
        title = `${item.partName} (${item.partCode})`;
      } else if (groupBy === 'WAREHOUSE') {
        key = item.warehouseId;
        title = item.warehouseName;
      } else if (groupBy === 'OWNERSHIP') {
        key = item.ownership;
        title = item.ownership === 'SAPCO_SUPPLIER_OWNED' ? 'ورق و اقلام امانی ساپکو' : 'مالکیت شرکت کوثر';
      } else if (groupBy === 'CONTRACT') {
        key = item.contractNumber || 'FREE';
        title = item.contractNumber ? `قرارداد شماره ${item.contractNumber}` : 'آزاد / بدون قرارداد مشخص';
      } else if (groupBy === 'COIL_PACK') {
        key = item.lotNumber || 'NO_LOT';
        title = item.lotNumber ? `کویل‌پک / بچ: ${item.lotNumber}` : 'بدون شماره کویل‌پک';
      } else if (groupBy === 'GRADE') {
        key = item.materialGrade || 'OTHER';
        title = item.materialGrade ? `جنس / گرید ورق: ${item.materialGrade}` : 'سایر اقلام (پیچ، مهره، لاستیک و قطعات)';
      } else if (groupBy === 'THICKNESS') {
        key = item.thicknessMm ? `${item.thicknessMm}` : 'NO_THICK';
        title = item.thicknessMm ? `ضخامت ورق: ${item.thicknessMm} میلی‌متر` : 'اقلام غیرورق (بدون ضخامت)';
      }

      const existing = map.get(key) || {
        groupKey: key,
        groupTitle: title,
        items: [],
        totalPhysicalKg: 0,
        totalAvailableKg: 0,
        coilsCount: 0,
      };
      existing.items.push(item);
      existing.totalPhysicalKg += item.physicalKg;
      existing.totalAvailableKg += item.availableKg;
      if (item.lotNumber) existing.coilsCount += 1;
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.totalPhysicalKg - a.totalPhysicalKg);
  }, [filteredBalances, groupBy]);

  const totalPages = Math.max(1, Math.ceil(filteredBalances.length / pageSize));
  const paginatedBalances = filteredBalances.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSaveViewPreferences = () => {
    try {
      window.localStorage.setItem('kpims_stock_inquiry_cols_v2', JSON.stringify(visibleCols));
      setSavedViewNotice(true);
      setTimeout(() => setSavedViewNotice(false), 2500);
    } catch {
      // ignore
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'کد کالا',
      'عنوان کالا / ورق',
      'جنس/گرید ورق',
      'ضخامت (mm)',
      'انبار',
      'جایگاه',
      'شماره کویل‌پک / بچ',
      'شماره ذوب',
      'شماره قرارداد',
      'نوع مالکیت',
      'موجودی فیزیکی',
      'موجودی قابل استفاده (آزاد)',
      'رزرو شده',
      'قرنطینه کیفی',
      'واحد',
      'وزن کل (کیلوگرم)',
      'وزن آزاد (کیلوگرم)',
      'آخرین گردش',
    ];

    const rows = filteredBalances.map(b => [
      b.partCode,
      b.partName,
      b.materialGrade || '—',
      b.thicknessMm ? `${b.thicknessMm}` : '—',
      b.warehouseName,
      b.locationCode,
      b.lotNumber || '—',
      b.heatNumber || '—',
      b.contractNumber || '—',
      b.ownership === 'SAPCO_SUPPLIER_OWNED' ? 'امانی ساپکو' : 'ملکی کارخانه',
      b.physicalQty,
      b.availableQty,
      b.reservedQty,
      b.qualityBlockedQty,
      b.unit === 'KG' ? 'کیلوگرم' : 'عدد',
      b.physicalKg,
      b.availableKg,
      formatDateTime(b.lastTransactionAt),
    ]);

    exportToCsv(`گزارش_موجودی_انبار_${Date.now()}`, headers, rows);
  };

  const handleSort = (field: keyof DetailedStockBalance) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // Helper to get effective Reorder Point (نقطه سفارش) for any Part
  const getPartReorderPoint = (part?: Part, unit?: string, category?: string): number => {
    if (part && typeof part.minStock === 'number' && part.minStock > 0) {
      return part.minStock;
    }
    const effectiveUnit = part?.unit || unit || 'PCS';
    const effectiveCategory = part?.category || category || 'RAW_MATERIAL';
    if (effectiveUnit === 'KG' || effectiveCategory === 'RAW_MATERIAL') {
      return 3500; // Default 3,500 kg reorder threshold for coils/sheets
    }
    return 1000; // Default 1,000 pcs reorder threshold for components
  };

  // Master-Detail Part List with aggregated stock & Reorder Point status for PART_CARDEX mode
  const catalogPartsWithStock = useMemo(() => {
    const q = partSearchQuery.trim().toLowerCase();
    return parts
      .map(p => {
        const pBalances = balances.filter(b => b.partId === p.id || b.partCode === p.code);
        const physicalTotal = pBalances.reduce((s, b) => s + b.physicalQty, 0);
        const availableTotal = pBalances.reduce((s, b) => s + b.availableQty, 0);
        const lotsCount = pBalances.length;
        const reorderPoint = getPartReorderPoint(p);
        const needsPurchase = availableTotal < reorderPoint;
        const isCriticalShortage = availableTotal <= reorderPoint * 0.5;
        const isVIP = isPartVip(p, vipMap);
        const blockedTotal = pBalances.reduce((s, b) => s + (b.qualityBlockedQty || 0), 0);
        return {
          part: { ...p, isVIP, isPinned: isVIP },
          isVIP,
          physicalTotal,
          availableTotal,
          blockedTotal,
          lotsCount,
          balances: pBalances,
          reorderPoint,
          needsPurchase,
          isCriticalShortage,
        };
      })
      .filter(item => {
        if (onlyBelowReorderPoint && !item.needsPurchase) return false;
        if (!q) return true;
        return (
          item.part.name.toLowerCase().includes(q) ||
          item.part.code.toLowerCase().includes(q) ||
          (item.part.materialGrade && item.part.materialGrade.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        // Priority 1: VIP parts with shortage first!
        if (a.isVIP && a.needsPurchase && !(b.isVIP && b.needsPurchase)) return -1;
        if (b.isVIP && b.needsPurchase && !(a.isVIP && a.needsPurchase)) return 1;
        // Priority 2: VIP parts in general
        if (a.isVIP !== b.isVIP) return a.isVIP ? -1 : 1;
        // Priority 3: Any part needing purchase
        if (a.needsPurchase !== b.needsPurchase) return a.needsPurchase ? -1 : 1;
        return b.physicalTotal - a.physicalTotal;
      });
  }, [parts, balances, partSearchQuery, onlyBelowReorderPoint, vipMap]);

  const activeCardexPartSummary =
    catalogPartsWithStock.find(
      c => c.part.id === selectedCardexPartId || c.part.code === selectedCardexPartId
    ) || catalogPartsWithStock[0];

  // Compute chronological Cardex (ورود، خروج و مانده لحظه‌ای) for the selected part
  const selectedPartCardexRows = useMemo(() => {
    if (!activeCardexPartSummary) return [];
    const targetPart = activeCardexPartSummary.part;

    const matchingTx: Array<{
      id: string;
      docId: string;
      docNumber: string;
      docDate: string;
      docType: string;
      warehouseName: string;
      lotNumber: string;
      contractNumber: string;
      referenceNumber: string;
      inQty: number;
      outQty: number;
      unit: string;
      notes: string;
    }> = [];

    // Sort documents ascending by date to compute running balance accurately
    const sortedDocs = [...allDocuments]
      .filter(d => d.postingStatus === 'POSTED')
      .sort((a, b) => new Date(a.documentDate).getTime() - new Date(b.documentDate).getTime());

    for (const doc of sortedDocs) {
      for (const line of doc.lines || []) {
        if (line.partId !== targetPart.id && line.partCode !== targetPart.code) continue;
        const qty = Number(line.quantity) || 0;
        const docTypeStr = String(doc.documentType);
        const isReceipt =
          docTypeStr === 'OPENING_BALANCE' ||
          docTypeStr === 'RECEIPT_RAW_MATERIAL' ||
          docTypeStr === 'RECEIPT_FINISHED_GOODS' ||
          docTypeStr === 'PRODUCTION_RECEIPT' ||
          docTypeStr === 'RETURN_FROM_PRODUCTION';

        const isIssue =
          docTypeStr === 'ISSUE_RAW_MATERIAL' ||
          docTypeStr === 'ISSUE_FINISHED_GOODS' ||
          docTypeStr === 'DELIVERY_CUSTOMER' ||
          docTypeStr === 'SHIPMENT_CUSTOMER' ||
          docTypeStr === 'ISSUE_TO_PRODUCTION' ||
          docTypeStr === 'DELIVERY_TO_CUSTOMER';

        matchingTx.push({
          id: `${doc.id}-${line.id || line.lineNumber}`,
          docId: doc.id,
          docNumber: doc.documentNumber,
          docDate: doc.documentDate,
          docType: doc.documentType,
          warehouseName: doc.warehouseName,
          lotNumber: line.lotNumber || 'عمومی',
          contractNumber: line.contractNumber || doc.contractNumber || 'آزاد',
          referenceNumber: doc.referenceNumber || '—',
          inQty: isReceipt ? qty : 0,
          outQty: isIssue ? qty : 0,
          unit: line.unit || targetPart.unit,
          notes: line.notes || doc.auditNote || '',
        });
      }
    }

    let runningBalance = 0;
    const withRunning = matchingTx.map(tx => {
      runningBalance = Math.max(0, Number((runningBalance + tx.inQty - tx.outQty).toFixed(3)));
      return {
        ...tx,
        runningBalance,
      };
    });

    // Return newest first for display
    return withRunning.reverse();
  }, [activeCardexPartSummary, allDocuments]);

  const getDocTypeBadge = (docType: string) => {
    switch (docType) {
      case 'OPENING_BALANCE':
        return { label: 'موجودی اول دوره', color: 'bg-[#e5f3fa] text-[#007cc0] border-[#b3ddf2]' };
      case 'RECEIPT_RAW_MATERIAL':
        return { label: 'رسید ورود به انبار', color: 'bg-[#f2f8f4] text-[#107e3e] border-[#b7dfc7]' };
      case 'RECEIPT_FINISHED_GOODS':
      case 'PRODUCTION_RECEIPT':
        return { label: 'رسید تولید از خط', color: 'bg-[#f2f8f4] text-[#107e3e] border-[#b7dfc7]' };
      case 'ISSUE_RAW_MATERIAL':
      case 'ISSUE_TO_PRODUCTION':
        return { label: 'حواله ارسال به خط تولید', color: 'bg-amber-50 text-amber-900 border-amber-200' };
      case 'ISSUE_FINISHED_GOODS':
      case 'DELIVERY_CUSTOMER':
      case 'SHIPMENT_CUSTOMER':
      case 'DELIVERY_TO_CUSTOMER':
        return { label: 'حواله تحویل به مشتری', color: 'bg-rose-50 text-rose-800 border-rose-200' };
      default:
        return { label: docType, color: 'bg-[#f5f5f5] text-[#333333] border-[#d9d9d9]' };
    }
  };

  return (
    <div className="space-y-4">
      {/* SAP Fiori IconTabBar & Actions */}
      <div className="sap-card overflow-hidden">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2 px-3 bg-[#ffffff] border-b border-[#d9d9d9]">
          <div className="sap-icon-tab-bar border-b-0 flex-1">
            <button
              type="button"
              onClick={() => setInquiryMode('PART_CARDEX')}
              className={`sap-icon-tab ${inquiryMode === 'PART_CARDEX' ? 'sap-icon-tab-active' : ''}`}
            >
              <History className="w-3.5 h-3.5" />
              <span>۱. فهرست قطعات و کاردکس کالا</span>
            </button>

            <button
              type="button"
              onClick={() => setInquiryMode('ANALYTICAL_TABLE')}
              className={`sap-icon-tab ${inquiryMode === 'ANALYTICAL_TABLE' ? 'sap-icon-tab-active' : ''}`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>۲. جدول تحلیلی کل موجودی انبارها</span>
            </button>

            <button
              type="button"
              onClick={() => setInquiryMode('COIL_SLITTING')}
              className={`sap-icon-tab ${inquiryMode === 'COIL_SLITTING' ? 'sap-icon-tab-active' : ''}`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>۳. شجره‌نامه برش کلاف</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 py-2 lg:py-0">
            {route.docQuery && (
              <button
                type="button"
                onClick={() => {
                  clearDocQuery();
                  setSearchTerm('');
                  setPartSearchQuery('');
                }}
                className="px-2.5 py-1 rounded bg-[#e5f3fa] border border-[#b3ddf2] text-[#007cc0] text-[11px] font-medium cursor-pointer whitespace-nowrap"
                title="پاک کردن فیلتر رهگیری سند"
              >
                فیلتر رهگیری: {route.docQuery} ×
              </button>
            )}
            {inquiryMode === 'ANALYTICAL_TABLE' && (
              <button
                type="button"
                onClick={() => setShowColumnPicker(!showColumnPicker)}
                className="sap-btn-standard flex items-center gap-1.5 px-2.5 py-1 text-xs cursor-pointer whitespace-nowrap"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>تنظیم ستون‌ها</span>
              </button>
            )}
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="sap-btn-standard flex items-center gap-1.5 px-2.5 py-1 text-xs cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>به‌روزرسانی</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1 bg-[#107e3e] hover:bg-[#0d6832] text-white rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>خروجی اکسل (CSV)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODE 3: VISUAL COIL SLITTING GENEALOGY (شجره‌نامه برش کلاف)           */}
      {/* ==================================================================== */}
      {inquiryMode === 'COIL_SLITTING' ? (
        <CoilSlittingGenealogyPanel />
      ) : inquiryMode === 'PART_CARDEX' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* SAP Master-Detail Right List (3 columns) */}
          <div className="lg:col-span-3 sap-card overflow-hidden">
            <div className="p-3 border-b border-[#d9d9d9] bg-[#ffffff] space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[#333333]">فهرست اقلام و ورق‌ها</h3>
                <span className="text-[11px] font-mono tabular-nums bg-[#e5f3fa] px-2 py-0.5 rounded border border-[#b3ddf2] text-[#007cc0]">
                  {toPersianDigits(catalogPartsWithStock.length)} قلم
                </span>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#666666] absolute right-2.5 top-2" />
                <input
                  type="text"
                  value={partSearchQuery}
                  onChange={e => setPartSearchQuery(e.target.value)}
                  placeholder="جستجوی نام یا کد کالا..."
                  className="w-full bg-[#ffffff] border border-[#d9d9d9] rounded pr-8 pl-2.5 py-1 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                />
              </div>
              <label className="flex items-center gap-1.5 text-[11px] font-normal text-[#666666] cursor-pointer pt-0.5">
                <input
                  type="checkbox"
                  checked={onlyBelowReorderPoint}
                  onChange={e => setOnlyBelowReorderPoint(e.target.checked)}
                  className="rounded border-[#cccccc] text-[#007cc0] focus:ring-[#007cc0]"
                />
                <span>فقط اقلام زیر نقطه سفارش</span>
              </label>
            </div>

            <div className="max-h-[660px] overflow-y-auto divide-y divide-[#e8e8e8] bg-[#ffffff]">
              {catalogPartsWithStock.map(item => {
                const isSelected =
                  activeCardexPartSummary?.part.id === item.part.id;
                return (
                  <button
                    key={item.part.id}
                    type="button"
                    onClick={() => setSelectedCardexPartId(item.part.id)}
                    className={`w-full text-right px-3 py-2 transition-colors flex items-start justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-[#e5f3fa] text-[#007cc0] border-r-[3px] border-[#007cc0]'
                        : 'hover:bg-[#e5f3fa]/50 text-[#333333]'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className={`text-xs leading-snug truncate ${isSelected ? 'font-semibold text-[#007cc0]' : 'font-normal text-[#333333]'}`}>
                        {item.part.name}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          isSelected
                            ? 'bg-[#ffffff] text-[#007cc0] border border-[#b3ddf2]'
                            : 'bg-[#f5f5f5] text-[#666666] border border-[#e8e8e8]'
                        }`}>
                          {item.part.code}
                        </span>
                        {item.blockedTotal > 0 && (
                          <span className="w-2 h-2 rounded-full bg-[#bb0000]" title="دارای موجودی قرنطینه کیفی" />
                        )}
                        {item.needsPurchase && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#fff0f0] text-[#bb0000]">
                            کسری
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-left shrink-0 tabular-nums">
                      <div
                        className={`text-xs font-mono font-semibold whitespace-nowrap ${
                          item.needsPurchase
                            ? 'text-[#bb0000]'
                            : item.availableTotal > 0
                            ? 'text-[#107e3e]'
                            : 'text-[#666666]'
                        }`}
                      >
                        {formatNumber(item.availableTotal)}{' '}
                        <span className="text-[10px] font-sans font-normal">
                          {item.part.unit === 'KG' ? 'kg' : 'عدد'}
                        </span>
                      </div>
                      <div className="text-[10px] mt-0.5 font-mono whitespace-nowrap text-[#666666]">
                        حداقل: {formatNumber(item.reorderPoint)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Left Main Panel: Selected Part Stock Breakdown + Chronological Cardex (9 columns) */}
          <div className="lg:col-span-9 space-y-4">
            {activeCardexPartSummary ? (
              <>
                {/* SAP Object Header & Warehouse Stock Breakdown */}
                <div className="sap-card overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-[#d9d9d9] bg-[#ffffff] flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] font-mono text-xs font-semibold whitespace-nowrap">
                          {activeCardexPartSummary.part.code}
                        </span>
                        <h3 className="text-sm font-semibold text-[#333333]">
                          {activeCardexPartSummary.part.name}
                        </h3>
                        {activeCardexPartSummary.needsPurchase ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#fff0f0] text-[#bb0000] border border-[#f5b7b1] whitespace-nowrap">
                            <AlertTriangle className="w-3 h-3" />
                            زیر نقطه سفارش
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#f2f8f4] text-[#107e3e] border border-[#b7dfc7] whitespace-nowrap">
                            <CheckCircle2 className="w-3 h-3" />
                            موجودی ایمن
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#666666]">
                        واحد سنجش:{' '}
                        <strong className="text-[#333333]">
                          {activeCardexPartSummary.part.unit === 'KG' ? 'کیلوگرم (KG)' : 'عدد (PCS)'}
                        </strong>
                        {activeCardexPartSummary.part.materialGrade && (
                          <span>
                            {' '}
                            · گرید: <strong className="text-[#333333]">{activeCardexPartSummary.part.materialGrade}</strong>
                          </span>
                        )}
                        {activeCardexPartSummary.part.thicknessMm && (
                          <span>
                            {' '}
                            · ضخامت: <strong className="text-[#333333]">{activeCardexPartSummary.part.thicknessMm} mm</strong>
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Clean Inline KPI Strip */}
                    <div className="flex flex-wrap items-center gap-4 text-xs bg-[#f5f5f5] px-3 py-1.5 rounded border border-[#d9d9d9] tabular-nums">
                      <div>
                        <span className="text-[#666666] text-[11px] ml-1.5">موجودی فیزیکی:</span>
                        <strong className="font-mono text-[#333333]">
                          {formatNumber(activeCardexPartSummary.physicalTotal)}
                        </strong>
                      </div>
                      <div className="h-3.5 w-px bg-[#d9d9d9]" />
                      <div>
                        <span className="text-[#666666] text-[11px] ml-1.5">قرنطینه:</span>
                        <strong className="font-mono text-[#bb0000]">
                          {formatNumber(activeCardexPartSummary.blockedTotal)}
                        </strong>
                      </div>
                      <div className="h-3.5 w-px bg-[#d9d9d9]" />
                      <div>
                        <span className="text-[#666666] text-[11px] ml-1.5">موجودی آزاد (ATP):</span>
                        <strong className="font-mono text-sm text-[#107e3e]">
                          {formatNumber(activeCardexPartSummary.availableTotal)}{' '}
                          <span className="text-[11px] font-sans font-normal">
                            {activeCardexPartSummary.part.unit === 'KG' ? 'kg' : 'عدد'}
                          </span>
                        </strong>
                      </div>
                      <div className="h-3.5 w-px bg-[#d9d9d9]" />
                      <div>
                        <span className="text-[#666666] text-[11px] ml-1.5">نقطه سفارش:</span>
                        <strong className="font-mono text-[#333333]">
                          {formatNumber(activeCardexPartSummary.reorderPoint)}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Section A: Warehouse & Coil-Pack Balances for this Part */}
                  <div className="p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-[#333333] flex items-center gap-1.5">
                        <Boxes className="w-3.5 h-3.5 text-[#007cc0]" />
                        <span>
                          الف) تفکیک موجودی در انبارها و بچ‌ها ({toPersianDigits(activeCardexPartSummary.balances.length)} ردیف)
                        </span>
                      </h4>
                    </div>

                    {activeCardexPartSummary.balances.length === 0 ? (
                      <div className="p-4 bg-[#f5f5f5] border border-[#d9d9d9] rounded text-xs text-[#666666] text-center">
                        در حال حاضر هیچ موجودی فعالی برای این قطعه در انبارها ثبت نشده است.
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-[#d9d9d9] rounded">
                        <table className="sap-table-compact w-full text-right text-xs">
                          <thead className="bg-[#ffffff] border-b border-[#d9d9d9] text-[#333333] font-semibold">
                            <tr>
                              <th className="py-1.5 px-2.5 whitespace-nowrap">انبار و جایگاه</th>
                              <th className="py-1.5 px-2.5 whitespace-nowrap">شماره کویل‌پک / بچ</th>
                              <th className="py-1.5 px-2.5 whitespace-nowrap">قرارداد مرتبط</th>
                              <th className="py-1.5 px-2.5 whitespace-nowrap">مالکیت</th>
                              <th className="py-1.5 px-2.5 whitespace-nowrap">موجودی فیزیکی</th>
                              <th className="py-1.5 px-2.5 whitespace-nowrap text-[#bb0000]">قرنطینه کیفی</th>
                              <th className="py-1.5 px-2.5 whitespace-nowrap text-[#107e3e]">
                                <span className="inline-flex items-center">
                                  <span>موجودی آزاد (ATP)</span>
                                  <FormulaTooltip
                                    title="فرمول موجودی آزاد قابل تخصیص (ATP)"
                                    formula="ATP = OnHand - Reserved - QCHold"
                                    description="هر کالایی که در وضعیت قرنطینه کیفی (QC Hold) قرار گیرد، بلافاصله از موجودی آزاد و محاسبات MRP کسر می‌گردد."
                                    badgeColor="emerald"
                                  />
                                </span>
                              </th>
                              <th className="py-1.5 px-2.5 text-center whitespace-nowrap">وضعیت کیفی</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#e8e8e8] tabular-nums">
                            {activeCardexPartSummary.balances.map(b => {
                              const isHeld = b.qualityBlockedQty > 0;
                              return (
                                <tr
                                  key={b.id}
                                  className={isHeld ? 'bg-rose-50/50 hover:bg-rose-50' : 'hover:bg-[#e5f3fa]/60'}
                                >
                                  <td className="py-1.5 px-2.5 font-medium text-[#333333] whitespace-nowrap">
                                    <span>{b.warehouseName}</span>{' '}
                                    <span className="text-[10px] font-mono text-[#666666]">
                                      ({b.locationCode})
                                    </span>
                                  </td>
                                  <td className="py-1.5 px-2.5 font-mono font-semibold whitespace-nowrap">
                                    {b.lotNumber ? (
                                      <button
                                        type="button"
                                        onClick={() => traceDocument(b.lotNumber!, 'COILS')}
                                        className="sap-doc-link font-mono font-semibold cursor-pointer"
                                        title="مشاهده مشخصات رول / بچ"
                                      >
                                        {b.lotNumber}
                                      </button>
                                    ) : (
                                      <span className="text-[#666666]">عمومی</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2.5 font-mono whitespace-nowrap">
                                    {b.contractNumber ? (
                                      <button
                                        type="button"
                                        onClick={() => traceDocument(b.contractNumber!, 'CONTRACTS')}
                                        className="sap-doc-link font-mono cursor-pointer"
                                        title="مشاهده قرارداد مرتبط"
                                      >
                                        {b.contractNumber}
                                      </button>
                                    ) : (
                                      <span className="text-[#666666]">آزاد</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2.5 whitespace-nowrap">
                                    {b.ownership === 'SAPCO_SUPPLIER_OWNED' ? (
                                      <span className="text-amber-800 font-medium">امانی ساپکو</span>
                                    ) : (
                                      <span className="text-[#666666]">ملکی شرکت</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-2.5 font-mono font-bold text-[#333333] whitespace-nowrap">
                                    {formatNumber(b.physicalQty)} {b.unit === 'KG' ? 'kg' : 'عدد'}
                                  </td>
                                  <td className="py-1.5 px-2.5 font-mono font-bold text-[#bb0000] whitespace-nowrap">
                                    {b.qualityBlockedQty > 0
                                      ? `${formatNumber(b.qualityBlockedQty)} ${b.unit === 'KG' ? 'kg' : 'عدد'}`
                                      : '—'}
                                  </td>
                                  <td className="py-1.5 px-2.5 font-mono font-bold text-[#107e3e] whitespace-nowrap">
                                    {formatNumber(b.availableQty)} {b.unit === 'KG' ? 'kg' : 'عدد'}
                                  </td>
                                  <td className="py-1.5 px-2.5 text-center whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleQcHoldOnBalance(b)}
                                      className={`px-2 py-0.5 rounded text-[11px] font-semibold inline-flex items-center gap-1 border transition-colors cursor-pointer whitespace-nowrap ${
                                        isHeld
                                          ? 'bg-rose-600 text-white border-rose-700 hover:bg-rose-700'
                                          : 'bg-[#ffffff] text-[#333333] border-[#d9d9d9] hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200'
                                      }`}
                                    >
                                      {isHeld ? <Unlock className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                                      <span>{isHeld ? 'رفع قرنطینه' : 'قرنطینه کیفی'}</span>
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section B: Chronological Stock Cardex (کاردکس جامع ورود و خروج قطعه) */}
                <div className="sap-card p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-[#333333] flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-[#007cc0]" />
                      <span>
                        ب) کاردکس گردش کالا («{activeCardexPartSummary.part.name}»)
                      </span>
                    </h4>
                    <span className="text-[11px] text-[#666666] tabular-nums">
                      تعداد اسناد گردش:{' '}
                      <strong className="font-mono text-[#333333]">
                        {toPersianDigits(selectedPartCardexRows.length)}
                      </strong>{' '}
                      تراکنش
                    </span>
                  </div>

                  {docsLoading ? (
                    <div className="py-8 text-center text-xs text-[#666666]">
                      در حال بارگذاری کاردکس گردش کالا...
                    </div>
                  ) : selectedPartCardexRows.length === 0 ? (
                    <div className="py-6 text-center text-xs text-[#666666] bg-[#f5f5f5] rounded border border-[#d9d9d9]">
                      هنوز هیچ سند ورود یا خروجی برای این کالا در کاردکس ثبت نشده است.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-[#d9d9d9] rounded">
                      <table className="sap-table-compact w-full text-right text-xs">
                        <thead className="bg-[#ffffff] border-b border-[#d9d9d9] text-[#333333] font-semibold">
                          <tr>
                            <th className="py-1.5 px-2.5 whitespace-nowrap">تاریخ و ساعت</th>
                            <th className="py-1.5 px-2.5 whitespace-nowrap">شماره سند</th>
                            <th className="py-1.5 px-2.5 whitespace-nowrap">نوع عملیات</th>
                            <th className="py-1.5 px-2.5 whitespace-nowrap">انبار</th>
                            <th className="py-1.5 px-2.5 whitespace-nowrap">کویل‌پک / بچ</th>
                            <th className="py-1.5 px-2.5 whitespace-nowrap text-[#107e3e]">وارده (+)</th>
                            <th className="py-1.5 px-2.5 whitespace-nowrap text-[#bb0000]">صادره (-)</th>
                            <th className="py-1.5 px-2.5 whitespace-nowrap bg-[#f5f5f5] font-bold text-[#333333]">
                              مانده پس از سند
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e8e8e8] tabular-nums">
                          {selectedPartCardexRows.map(tx => {
                            const badge = getDocTypeBadge(tx.docType);
                            return (
                              <tr key={tx.id} className="hover:bg-[#e5f3fa]/60">
                                <td className="py-1.5 px-2.5 font-mono text-[11px] text-[#666666] whitespace-nowrap">
                                  {formatDateTime(tx.docDate)}
                                </td>
                                <td className="py-1.5 px-2.5 font-mono font-semibold text-[#333333] whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => traceDocument(tx.docNumber, 'INVENTORY_LEDGER')}
                                    className="sap-doc-link font-mono font-semibold cursor-pointer"
                                  >
                                    {tx.docNumber}
                                  </button>
                                  {tx.referenceNumber !== '—' && (
                                    <div className="text-[10px] text-[#666666] font-normal">
                                      مرجع:{' '}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          traceDocument(
                                            tx.referenceNumber,
                                            tx.referenceNumber.startsWith('CNT') ? 'CONTRACTS' : 'WIP_TRACEABILITY'
                                          )
                                        }
                                        className="sap-doc-link font-mono cursor-pointer"
                                      >
                                        {tx.referenceNumber}
                                      </button>
                                    </div>
                                  )}
                                </td>
                                <td className="py-1.5 px-2.5 whitespace-nowrap">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded border text-[10px] font-semibold ${badge.color}`}
                                  >
                                    {badge.label}
                                  </span>
                                </td>
                                <td className="py-1.5 px-2.5 text-[#333333] whitespace-nowrap">{tx.warehouseName}</td>
                                <td className="py-1.5 px-2.5 font-mono text-[#333333] whitespace-nowrap">
                                  {tx.lotNumber && tx.lotNumber !== 'عمومی' ? (
                                    <button
                                      type="button"
                                      onClick={() => traceDocument(tx.lotNumber, 'COILS')}
                                      className="sap-doc-link font-mono cursor-pointer"
                                    >
                                      {tx.lotNumber}
                                    </button>
                                  ) : (
                                    <span>{tx.lotNumber}</span>
                                  )}
                                </td>
                                <td className="py-1.5 px-2.5 font-mono font-bold text-[#107e3e] whitespace-nowrap">
                                  {tx.inQty > 0 ? (
                                    <span className="inline-flex items-center gap-0.5">
                                      <ArrowDownLeft className="w-3.5 h-3.5" />+{formatNumber(tx.inQty)}
                                    </span>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td className="py-1.5 px-2.5 font-mono font-bold text-[#bb0000] whitespace-nowrap">
                                  {tx.outQty > 0 ? (
                                    <span className="inline-flex items-center gap-0.5">
                                      <ArrowUpRight className="w-3.5 h-3.5" />-{formatNumber(tx.outQty)}
                                    </span>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td className="py-1.5 px-2.5 font-mono font-bold text-[#333333] bg-[#f5f5f5] whitespace-nowrap">
                                  {formatNumber(tx.runningBalance)}{' '}
                                  <span className="text-[10px] font-normal text-[#666666]">
                                    {tx.unit === 'KG' ? 'kg' : 'عدد'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <>

      {/* Column Visibility Customizer Drawer */}
      {showColumnPicker && (
        <div className="sap-card p-3.5 space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-2">
            <span className="font-bold text-[#333333]">انتخاب ستون‌های قابل نمایش در جدول موجودی:</span>
            <div className="flex items-center gap-2">
              {savedViewNotice && (
                <span className="text-[#107e3e] font-semibold flex items-center gap-1">
                  <BookmarkCheck className="w-3.5 h-3.5" />
                  <span>نمای دلخواه شما ذخیره شد</span>
                </span>
              )}
              <button
                type="button"
                onClick={handleSaveViewPreferences}
                className="sap-btn-emphasized px-3 py-1 text-[11px] cursor-pointer"
              >
                ذخیره به عنوان پیش‌فرض من
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {[
              { key: 'partCode', label: 'کد کالا' },
              { key: 'partName', label: 'نام و مشخصات فنی' },
              { key: 'warehouse', label: 'انبار و جایگاه' },
              { key: 'lotNumber', label: 'کویل‌پک / ذوب' },
              { key: 'contract', label: 'شماره قرارداد' },
              { key: 'ownership', label: 'نوع مالکیت' },
              { key: 'physicalQty', label: 'موجودی فیزیکی' },
              { key: 'availableQty', label: 'موجودی قابل استفاده' },
              { key: 'reservedQty', label: 'رزرو شده' },
              { key: 'blockedQty', label: 'قرنطینه کیفی' },
              { key: 'physicalKg', label: 'وزن کل (کیلوگرم)' },
              { key: 'lastTx', label: 'تاریخ آخرین گردش' },
            ].map(col => (
              <label key={col.key} className="flex items-center gap-1.5 text-[#333333] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={(visibleCols as any)[col.key]}
                  onChange={e => setVisibleCols(prev => ({ ...prev, [col.key]: e.target.checked }))}
                  className="rounded border-[#cccccc] text-[#007cc0]"
                />
                <span>{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="sap-card p-3.5">
          <span className="text-xs text-[#666666]">موجودی فیزیکی کل (نتایج فیلترشده)</span>
          <div className="text-lg font-bold text-[#333333] mt-1 font-mono tabular-nums">
            {formatWeightKg(totalPhysicalKg)}
          </div>
        </div>
        <div className="sap-card p-3.5">
          <span className="text-xs text-[#666666]">موجودی قابل استفاده (آزاد جهت تولید)</span>
          <div className="text-lg font-bold text-[#107e3e] mt-1 font-mono tabular-nums">
            {formatWeightKg(totalAvailableKg)}
          </div>
        </div>
        <div className="sap-card p-3.5">
          <span className="text-xs text-[#666666]">ورق و اقلام امانی ساپکو</span>
          <div className="text-lg font-bold text-amber-700 mt-1 font-mono tabular-nums">
            {formatWeightKg(totalSapcoKg)}
          </div>
        </div>
        <div className="sap-card p-3.5">
          <span className="text-xs text-[#666666]">رزرو شده جهت خطوط تولید</span>
          <div className="text-lg font-bold text-[#007cc0] mt-1 font-mono tabular-nums">
            {formatWeightKg(totalReservedKg)}
          </div>
        </div>
      </div>

      {/* Filter & Grouping Bar */}
      <div className="sap-card p-3.5 space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#666666] absolute right-3 top-2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="جستجوی نام کالا، کد، کویل‌پک، شماره قرارداد..."
              className="w-full bg-[#ffffff] border border-[#d9d9d9] rounded pr-9 pl-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
            />
          </div>

          {/* Part Filter */}
          <select
            value={selectedPartFilter}
            onChange={e => setSelectedPartFilter(e.target.value)}
            className="bg-[#ffffff] border border-[#d9d9d9] rounded px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
          >
            <option value="ALL">همه کالاها (ورق، پیچ و مهره، لاستیک، قطعه)</option>
            {parts.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>

          {/* Grade Filter */}
          <select
            value={selectedGradeFilter}
            onChange={e => {
              setSelectedGradeFilter(e.target.value);
              setSelectedLotFilter('ALL');
            }}
            className="bg-[#ffffff] border border-[#d9d9d9] rounded px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
          >
            <option value="ALL">همه جنس‌ها و گریدهای ورق</option>
            {grades.map(g => (
              <option key={g} value={g}>
                جنس / گرید ورق: {g}
              </option>
            ))}
          </select>

          {/* Dynamic Coil Pack Filter */}
          <select
            value={selectedLotFilter}
            onChange={e => setSelectedLotFilter(e.target.value)}
            className="bg-[#ffffff] border border-[#d9d9d9] rounded px-3 py-1.5 text-xs text-[#333333] font-mono focus:outline-none focus:border-[#007cc0]"
          >
            <option value="ALL">همه کویل‌پک‌ها و بچ‌ها ({toPersianDigits(matchingPacksOrLots.length)})</option>
            {matchingPacksOrLots.map(lot => (
              <option key={lot} value={lot}>
                {lot}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Warehouse Filter */}
          <select
            value={selectedWarehouseFilter}
            onChange={e => setSelectedWarehouseFilter(e.target.value)}
            className="bg-[#ffffff] border border-[#d9d9d9] rounded px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
          >
            <option value="ALL">همه انبارهای کارخانه</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          {/* Contract Filter */}
          <select
            value={selectedContractFilter}
            onChange={e => setSelectedContractFilter(e.target.value)}
            className="bg-[#ffffff] border border-[#d9d9d9] rounded px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
          >
            <option value="ALL">همه قراردادها</option>
            {contractNumbers.map(cn => (
              <option key={cn} value={cn}>
                قرارداد: {cn}
              </option>
            ))}
          </select>

          {/* Ownership Filter */}
          <select
            value={selectedOwnershipFilter}
            onChange={e => setSelectedOwnershipFilter(e.target.value as any)}
            className="bg-[#ffffff] border border-[#d9d9d9] rounded px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
          >
            <option value="ALL">همه انواع مالکیت</option>
            <option value="SAPCO_SUPPLIER_OWNED">فقط امانی ساپکو / مشتری</option>
            <option value="COMPANY_OWNED">فقط ملکی کارخانه کوثر</option>
          </select>

          {/* Grouping Selector */}
          <div className="flex items-center gap-2 bg-[#e5f3fa] border border-[#b3ddf2] rounded px-3 py-1">
            <Layers className="w-4 h-4 text-[#007cc0] shrink-0" />
            <span className="text-[11px] font-semibold text-[#007cc0] whitespace-nowrap">گروه‌بندی:</span>
            <select
              value={groupBy}
              onChange={e => setGroupBy(e.target.value as StockGroupingKey)}
              className="w-full bg-transparent text-xs font-bold text-[#333333] focus:outline-none cursor-pointer"
            >
              <option value="NONE">بدون گروه‌بندی (لیست تفضیلی)</option>
              <option value="THICKNESS">بر اساس ضخامت ورق (mm)</option>
              <option value="GRADE">بر اساس جنس / گرید ورق</option>
              <option value="COIL_PACK">بر اساس شماره کویل‌پک</option>
              <option value="CONTRACT">بر اساس شماره قرارداد</option>
              <option value="PART">بر اساس نام کالا</option>
              <option value="WAREHOUSE">بر اساس انبار</option>
              <option value="OWNERSHIP">بر اساس نوع مالکیت</option>
            </select>
          </div>
        </div>

        {/* Dynamic Matching Coil Pack Quick Tags */}
        {matchingPacksOrLots.length > 0 &&
          (selectedPartFilter !== 'ALL' || selectedGradeFilter !== 'ALL' || selectedContractFilter !== 'ALL') && (
            <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-[#e8e8e8] text-[11px]">
              <span className="text-[#666666] font-medium">کویل‌پک‌های موجود برای این فیلتر (کلیک جهت انتخاب):</span>
              {matchingPacksOrLots.map(lot => (
                <button
                  key={lot}
                  type="button"
                  onClick={() => setSelectedLotFilter(selectedLotFilter === lot ? 'ALL' : lot)}
                  className={`px-2 py-0.5 rounded font-mono text-[11px] transition-colors border cursor-pointer ${
                    selectedLotFilter === lot
                      ? 'bg-[#007cc0] text-white border-[#007cc0]'
                      : 'bg-[#f5f5f5] text-[#333333] border-[#d9d9d9] hover:bg-[#e5f3fa]'
                  }`}
                >
                  {lot}
                </button>
              ))}
            </div>
          )}

        <div className="flex flex-wrap items-center justify-between pt-2 border-t border-[#e8e8e8] gap-2">
          <label className="flex items-center gap-2 text-xs text-[#333333] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyAvailable}
              onChange={e => setOnlyAvailable(e.target.checked)}
              className="rounded border-[#cccccc] text-[#007cc0] focus:ring-0"
            />
            <span>فقط نمایش رول‌ها و کالاهای دارای موجودی قابل استفاده (&gt; 0)</span>
          </label>

          <div className="text-xs text-[#666666]">
            تعداد رکوردهای منطبق: <strong className="text-[#333333] font-mono tabular-nums">{formatNumber(filteredBalances.length)}</strong>
          </div>
        </div>
      </div>

      {/* Grouped View OR Detailed Table View */}
      {groupBy !== 'NONE' ? (
        <div className="space-y-3">
          {groupedData.map(group => (
            <div key={group.groupKey} className="sap-card overflow-hidden">
              <div className="bg-[#f5f5f5] px-4 py-2 border-b border-[#d9d9d9] flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#007cc0]" />
                  <strong className="text-[#333333] text-sm">{group.groupTitle}</strong>
                  <span className="text-[#666666]">
                    ({toPersianDigits(group.items.length)} ردیف موجودی
                    {group.coilsCount > 0 ? ` · ${toPersianDigits(group.coilsCount)} کویل/بچ` : ''})
                  </span>
                </div>
                <div className="flex items-center gap-4 font-mono tabular-nums">
                  <span className="text-[#666666]">
                    وزن فیزیکی گروه: <strong className="text-[#333333]">{formatWeightKg(group.totalPhysicalKg)}</strong>
                  </span>
                  <span className="text-[#107e3e]">
                    قابل استفاده: <strong>{formatWeightKg(group.totalAvailableKg)}</strong>
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="sap-table-compact w-full text-right text-xs">
                  <thead className="bg-[#ffffff] border-b border-[#d9d9d9] text-[#333333] font-semibold">
                    <tr>
                      <th className="py-1.5 px-2.5">کالا / ورق</th>
                      <th className="py-1.5 px-2.5">انبار و جایگاه</th>
                      <th className="py-1.5 px-2.5">شماره کویل‌پک / بچ</th>
                      <th className="py-1.5 px-2.5">شماره قرارداد</th>
                      <th className="py-1.5 px-2.5">موجودی فیزیکی</th>
                      <th className="py-1.5 px-2.5 text-[#107e3e]">موجودی قابل استفاده</th>
                      <th className="py-1.5 px-2.5">وزن کل (کیلوگرم)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e8e8] tabular-nums">
                    {group.items.map(item => (
                      <tr key={item.id} className="hover:bg-[#e5f3fa]/60">
                        <td className="py-1.5 px-2.5 font-medium text-[#333333]">
                          {item.partName}{' '}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCardexPartId(item.partId);
                              setInquiryMode('PART_CARDEX');
                            }}
                            className="sap-doc-link font-mono cursor-pointer"
                          >
                            ({item.partCode})
                          </button>
                        </td>
                        <td className="py-1.5 px-2.5 text-[#666666]">
                          {item.warehouseName} · <span className="font-mono">{item.locationCode}</span>
                        </td>
                        <td className="py-1.5 px-2.5 font-mono font-semibold text-[#333333]">
                          {item.lotNumber ? (
                            <button
                              type="button"
                              onClick={() => traceDocument(item.lotNumber!, 'COILS')}
                              className="sap-doc-link font-mono cursor-pointer"
                            >
                              {item.lotNumber}
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-1.5 px-2.5 font-mono text-[#333333]">
                          {item.contractNumber ? (
                            <button
                              type="button"
                              onClick={() => traceDocument(item.contractNumber!, 'CONTRACTS')}
                              className="sap-doc-link font-mono cursor-pointer"
                            >
                              {item.contractNumber}
                            </button>
                          ) : (
                            'آزاد'
                          )}
                        </td>
                        <td className="py-1.5 px-2.5 font-mono font-bold text-[#333333]">
                          {formatNumber(item.physicalQty)} {item.unit === 'KG' ? 'kg' : 'عدد'}
                        </td>
                        <td className="py-1.5 px-2.5 font-mono font-bold text-[#107e3e]">
                          {formatNumber(item.availableQty)} {item.unit === 'KG' ? 'kg' : 'عدد'}
                        </td>
                        <td className="py-1.5 px-2.5 font-mono text-[#333333]">
                          {formatWeightKg(item.physicalKg)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Standard Table with Expandable Details */
        <div className="sap-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="sap-table-compact w-full text-right text-xs">
              <thead>
                <tr className="bg-[#ffffff] border-b border-[#d9d9d9] text-[#333333] font-semibold select-none">
                  <th className="py-1.5 px-2.5 w-8" />
                  {visibleCols.partCode && <th className="py-1.5 px-2.5">کد کالا</th>}
                  {visibleCols.partName && <th className="py-1.5 px-2.5">نام کالا و مشخصات فنی</th>}
                  {visibleCols.warehouse && <th className="py-1.5 px-2.5">انبار و جایگاه</th>}
                  {visibleCols.lotNumber && <th className="py-1.5 px-2.5">شماره کویل‌پک / ذوب</th>}
                  {visibleCols.contract && <th className="py-1.5 px-2.5">شماره قرارداد</th>}
                  {visibleCols.ownership && <th className="py-1.5 px-2.5">نوع مالکیت</th>}
                  {visibleCols.physicalQty && (
                    <th
                      onClick={() => handleSort('physicalQty')}
                      className="py-1.5 px-2.5 cursor-pointer hover:text-[#007cc0]"
                    >
                      <div className="flex items-center gap-1">
                        <span>موجودی فیزیکی</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                  )}
                  {visibleCols.availableQty && (
                    <th
                      onClick={() => handleSort('availableQty')}
                      className="py-1.5 px-2.5 cursor-pointer hover:text-[#107e3e] text-[#107e3e]"
                    >
                      <div className="flex items-center gap-1">
                        <span>موجودی قابل استفاده</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                  )}
                  {visibleCols.reservedQty && <th className="py-1.5 px-2.5 text-[#007cc0]">رزرو شده</th>}
                  {visibleCols.blockedQty && <th className="py-1.5 px-2.5 text-[#bb0000]">قرنطینه کیفی</th>}
                  {visibleCols.physicalKg && (
                    <th
                      onClick={() => handleSort('physicalKg')}
                      className="py-1.5 px-2.5 cursor-pointer hover:text-[#007cc0]"
                    >
                      <div className="flex items-center gap-1">
                        <span>وزن کل (کیلوگرم)</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                  )}
                  {visibleCols.lastTx && <th className="py-1.5 px-2.5">آخرین گردش</th>}
                  <th className="py-1.5 px-2.5 text-left">کنترل کیفی</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8e8] tabular-nums">
                {paginatedBalances.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="py-10 text-center text-[#666666]">
                      <div className="font-semibold text-[#333333] mb-1">
                        هیچ موجودی منطبق با فیلترهای انتخابی یافت نشد.
                      </div>
                      <div className="text-[11px] text-[#666666]">
                        پیشنهاد: فیلترهای بالا را روی «همه» قرار دهید یا از طریق دکمه «ثبت رسید کالا / رول» موجودی جدید وارد کنید.
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedBalances.map(item => {
                    const isExpanded = expandedRowId === item.id;
                    return (
                      <React.Fragment key={item.id}>
                        <tr
                          onClick={() => setExpandedRowId(isExpanded ? null : item.id)}
                          className="hover:bg-[#e5f3fa]/60 transition-colors cursor-pointer"
                        >
                          <td className="py-1.5 px-2.5 text-[#666666]">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </td>
                          {visibleCols.partCode && (
                            <td className="py-1.5 px-2.5 font-mono font-bold text-[#333333]" onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedCardexPartId(item.partId);
                                  setInquiryMode('PART_CARDEX');
                                }}
                                className="sap-doc-link font-mono font-bold cursor-pointer"
                                title="مشاهده کاردکس گردش این کالا"
                              >
                                {item.partCode}
                              </button>
                            </td>
                          )}
                          {visibleCols.partName && (
                            <td className="py-1.5 px-2.5 font-medium text-[#333333]">
                              <div>{item.partName}</div>
                              {item.materialGrade && (
                                <div className="text-[11px] text-[#666666] mt-0.5">
                                  جنس {item.materialGrade}
                                  {item.thicknessMm ? ` · ضخامت ${item.thicknessMm} میلی‌متر` : ''}
                                </div>
                              )}
                            </td>
                          )}
                          {visibleCols.warehouse && (
                            <td className="py-1.5 px-2.5 text-[#333333]">
                              <div className="flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-[#666666]" />
                                <span>{item.warehouseName}</span>
                              </div>
                              <div className="text-[10px] font-mono text-[#666666]">{item.locationCode}</div>
                            </td>
                          )}
                          {visibleCols.lotNumber && (
                            <td className="py-1.5 px-2.5 font-mono" onClick={e => e.stopPropagation()}>
                              {item.lotNumber ? (
                                <div>
                                  <button
                                    type="button"
                                    onClick={() => traceDocument(item.lotNumber!, 'COILS')}
                                    className="sap-doc-link font-mono font-semibold cursor-pointer"
                                  >
                                    {item.lotNumber}
                                  </button>
                                  {item.heatNumber && (
                                    <button
                                      type="button"
                                      onClick={() => traceDocument(item.heatNumber!, 'COILS')}
                                      className="block sap-doc-link text-[10px] font-mono cursor-pointer"
                                    >
                                      ذوب: {item.heatNumber}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[#666666]">—</span>
                              )}
                            </td>
                          )}
                          {visibleCols.contract && (
                            <td className="py-1.5 px-2.5 font-mono text-[#333333]" onClick={e => e.stopPropagation()}>
                              {item.contractNumber ? (
                                <button
                                  type="button"
                                  onClick={() => traceDocument(item.contractNumber!, 'CONTRACTS')}
                                  className="sap-doc-link font-mono cursor-pointer"
                                >
                                  {item.contractNumber}
                                </button>
                              ) : (
                                'آزاد / عمومی'
                              )}
                            </td>
                          )}
                          {visibleCols.ownership && (
                            <td className="py-1.5 px-2.5 text-[#333333]">
                              {item.ownership === 'SAPCO_SUPPLIER_OWNED' ? (
                                <span className="text-amber-800 font-semibold">امانی ساپکو</span>
                              ) : (
                                <span className="text-[#333333]">ملکی شرکت</span>
                              )}
                            </td>
                          )}
                          {visibleCols.physicalQty && (
                            <td className="py-1.5 px-2.5 font-bold text-[#333333] font-mono">
                              {formatNumber(item.physicalQty)} <span className="text-[10px] font-normal text-[#666666]">{item.unit === 'KG' ? 'kg' : 'عدد'}</span>
                            </td>
                          )}
                          {visibleCols.availableQty && (
                            <td className="py-1.5 px-2.5 font-bold text-[#107e3e] font-mono">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span>
                                  {formatNumber(item.availableQty)}{' '}
                                  <span className="text-[10px] font-normal text-[#107e3e]">
                                    {item.unit === 'KG' ? 'kg' : 'عدد'}
                                  </span>
                                </span>
                                {(() => {
                                  const matchedPart = parts.find(
                                    p => p.id === item.partId || p.code === item.partCode
                                  );
                                  const reorderThreshold = getPartReorderPoint(matchedPart, item.unit);
                                  if (item.availableQty < reorderThreshold) {
                                    const isCrit = item.availableQty <= reorderThreshold * 0.5;
                                    return (
                                      <span
                                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-sans font-bold border ${
                                          isCrit
                                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                                            : 'bg-amber-50 text-amber-800 border-amber-200'
                                        }`}
                                        title={`نقطه سفارش: ${formatNumber(reorderThreshold)} ${item.unit === 'KG' ? 'kg' : 'عدد'}`}
                                      >
                                        <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                        نیاز به خرید
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            </td>
                          )}
                          {visibleCols.reservedQty && (
                            <td className="py-1.5 px-2.5 font-mono text-[#007cc0]">
                              {item.reservedQty > 0 ? formatNumber(item.reservedQty) : '—'}
                            </td>
                          )}
                          {visibleCols.blockedQty && (
                            <td className="py-1.5 px-2.5 font-mono text-[#bb0000]">
                              {item.qualityBlockedQty > 0 ? formatNumber(item.qualityBlockedQty) : '—'}
                            </td>
                          )}
                          {visibleCols.physicalKg && (
                            <td className="py-1.5 px-2.5 font-bold text-[#333333] font-mono">
                              {formatWeightKg(item.physicalKg)}
                            </td>
                          )}
                          {visibleCols.lastTx && (
                            <td className="py-1.5 px-2.5 text-[#666666] text-[11px] font-mono">
                              {formatDateTime(item.lastTransactionAt)}
                            </td>
                          )}
                          <td className="py-1.5 px-2.5 text-left" onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleToggleQcHoldOnBalance(item)}
                              className={`px-2 py-0.5 rounded text-[11px] font-bold inline-flex items-center gap-1 border transition-colors cursor-pointer whitespace-nowrap ${
                                item.qualityBlockedQty > 0
                                  ? 'bg-rose-600 text-white border-rose-700 hover:bg-rose-700'
                                  : 'bg-[#ffffff] text-rose-700 border-rose-200 hover:bg-rose-50'
                              }`}
                            >
                              <ShieldAlert className="w-3 h-3" />
                              <span>{item.qualityBlockedQty > 0 ? 'رفع قرنطینه' : 'قرنطینه کیفی'}</span>
                            </button>
                          </td>
                        </tr>

                        {/* Expandable Details Row */}
                        {isExpanded && (
                          <tr className="bg-[#f5f5f5]">
                            <td colSpan={14} className="p-3.5 border-t border-[#d9d9d9]">
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                                <div className="bg-[#ffffff] p-3 rounded border border-[#d9d9d9]">
                                  <span className="text-[#666666] block">تفکیک وضعیت موجودی این ردیف:</span>
                                  <div className="mt-1.5 space-y-1 font-mono">
                                    <div className="flex justify-between">
                                      <span>فیزیکی کل:</span>
                                      <strong>{formatNumber(item.physicalQty)} {item.unit}</strong>
                                    </div>
                                    <div className="flex justify-between text-[#107e3e]">
                                      <span>قابل استفاده (آزاد):</span>
                                      <strong>{formatNumber(item.availableQty)} {item.unit}</strong>
                                    </div>
                                    <div className="flex justify-between text-[#007cc0]">
                                      <span>رزرو تولید:</span>
                                      <strong>{formatNumber(item.reservedQty)} {item.unit}</strong>
                                    </div>
                                    <div className="flex justify-between text-[#bb0000]">
                                      <span>قرنطینه کیفی:</span>
                                      <strong>{formatNumber(item.qualityBlockedQty)} {item.unit}</strong>
                                    </div>
                                  </div>
                                </div>

                                <div className="bg-[#ffffff] p-3 rounded border border-[#d9d9d9]">
                                  <span className="text-[#666666] block">ردیابی کویل‌پک و ذوب:</span>
                                  <div className="mt-1.5 space-y-1">
                                    <div>
                                      کویل‌پک / بچ:{' '}
                                      {item.lotNumber ? (
                                        <button
                                          type="button"
                                          onClick={() => traceDocument(item.lotNumber!, 'COILS')}
                                          className="sap-doc-link font-mono font-bold cursor-pointer"
                                        >
                                          {item.lotNumber}
                                        </button>
                                      ) : (
                                        <strong className="font-mono text-[#333333]">ثبت نشده</strong>
                                      )}
                                    </div>
                                    <div>
                                      شماره ذوب:{' '}
                                      {item.heatNumber ? (
                                        <button
                                          type="button"
                                          onClick={() => traceDocument(item.heatNumber!, 'COILS')}
                                          className="sap-doc-link font-mono font-bold cursor-pointer"
                                        >
                                          {item.heatNumber}
                                        </button>
                                      ) : (
                                        <strong className="font-mono text-[#333333]">—</strong>
                                      )}
                                    </div>
                                    <div>
                                      جنس و ضخامت: <strong>{item.materialGrade || '—'} {item.thicknessMm ? `(${item.thicknessMm} mm)` : ''}</strong>
                                    </div>
                                  </div>
                                </div>

                                <div className="bg-[#ffffff] p-3 rounded border border-[#d9d9d9]">
                                  <span className="text-[#666666] block">اطلاعات مالکیت و قرارداد:</span>
                                  <div className="mt-1.5 space-y-1">
                                    <div>
                                      مالکیت: <strong>{item.ownership === 'SAPCO_SUPPLIER_OWNED' ? 'امانی ساپکو / مشتری' : 'ملکی شرکت کوثر'}</strong>
                                    </div>
                                    <div>
                                      شماره قرارداد:{' '}
                                      {item.contractNumber ? (
                                        <button
                                          type="button"
                                          onClick={() => traceDocument(item.contractNumber!, 'CONTRACTS')}
                                          className="sap-doc-link font-mono font-bold cursor-pointer"
                                        >
                                          {item.contractNumber}
                                        </button>
                                      ) : (
                                        <strong className="font-mono text-[#333333]">آزاد / بدون قرارداد</strong>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="bg-[#ffffff] p-3 rounded border border-[#d9d9d9]">
                                  <span className="text-[#666666] block">موقعیت مکانی و آخرین گردش:</span>
                                  <div className="mt-1.5 space-y-1">
                                    <div>
                                      انبار: <strong>{item.warehouseName}</strong>
                                    </div>
                                    <div>
                                      جایگاه / پالت: <strong className="font-mono">{item.locationCode}</strong>
                                    </div>
                                    <div>
                                      آخرین سند: <span className="font-mono">{formatDateTime(item.lastTransactionAt)}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          {totalPages > 1 && (
            <div className="px-4 py-2.5 bg-[#ffffff] border-t border-[#d9d9d9] flex items-center justify-between text-xs">
              <span className="text-[#666666]">
                صفحه {toPersianDigits(currentPage)} از {toPersianDigits(totalPages)}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="sap-btn-standard px-3 py-1 disabled:opacity-40 cursor-pointer"
                >
                  قبلی
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="sap-btn-standard px-3 py-1 disabled:opacity-40 cursor-pointer"
                >
                  بعدی
                </button>
              </div>
            </div>
          )}
        </div>
      )}
        </>
      )}

      {/* Mandatory QC Hold Reason Modal (ثبت اجباری علت قرنطینه کیفی در انبار) */}
      {qcHoldTargetBalance && (
        <div
          className="fixed inset-0 bg-[#333333]/40 flex items-center justify-center z-50 p-4"
          onClick={() => setQcHoldTargetBalance(null)}
        >
          <div
            className="bg-[#ffffff] border border-[#d9d9d9] rounded max-w-lg w-full p-4 text-right shadow-lg space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#e8e8e8] pb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded bg-[#ffecec] border border-[#f5b7b1] text-[#bb0000] flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#333333]">
                    ثبت اجباری علت قرنطینه کیفی (QC Hold) — {qcHoldTargetBalance.partName}
                  </h3>
                  <p className="text-[11px] text-[#666666] mt-0.5">
                    کویل‌پک / بچ: <span className="font-mono font-semibold text-[#333333]">{qcHoldTargetBalance.lotNumber || qcHoldTargetBalance.partCode}</span> | مقدار درگیر:{' '}
                    <span className="font-mono font-semibold text-[#bb0000] tabular-nums">
                      {formatNumber(qcHoldTargetBalance.physicalQty)} {qcHoldTargetBalance.unit}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQcHoldTargetBalance(null)}
                className="px-2 py-1 rounded text-[#666666] hover:text-[#333333] hover:bg-[#f5f5f5] text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmStockQcHoldModal} className="space-y-3 text-xs">
              <div className="p-2.5 rounded bg-[#ffecec] border border-[#f5b7b1] text-[#bb0000] text-[11px] leading-relaxed">
                <strong>هشدار کنترل کیفیت و کسر از ATP:</strong> با فریز و قرنطینه کردن این ردیف، مقدار{' '}
                <strong className="font-mono tabular-nums">
                  {formatNumber(qcHoldTargetBalance.physicalQty)} {qcHoldTargetBalance.unit}
                </strong>{' '}
                بلافاصله از موجودی آزاد (ATP) در انبار و ماژول MRP کسر می‌گردد. ثبت علت دقیق قرنطینه جهت درج در لاگ حسابرسی (Audit Trail) اجباری است.
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#333333] mb-1.5">
                  انتخاب سریع از دلایل متداول عدم انطباق کیفی:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {STOCK_QC_HOLD_PRESETS.map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setQcHoldReasonText(preset);
                        setQcHoldReasonError('');
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] border transition cursor-pointer ${
                        qcHoldReasonText === preset
                          ? 'bg-[#bb0000] text-[#ffffff] border-[#bb0000] font-semibold'
                          : 'bg-[#f5f5f5] hover:bg-[#e8e8e8] text-[#333333] border-[#d9d9d9]'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#333333] mb-1">
                  علت قرنطینه کیفی (QC Hold Reason) <span className="text-[#bb0000]">* (اجباری)</span>
                </label>
                <textarea
                  rows={3}
                  value={qcHoldReasonText}
                  onChange={e => {
                    setQcHoldReasonText(e.target.value);
                    if (e.target.value.trim()) setQcHoldReasonError('');
                  }}
                  placeholder="علت دقیق قرنطینه کیفی یا شماره گزارش عدم انطباق (NCR) را وارد نمایید..."
                  className="w-full rounded border border-[#bfbfbf] bg-[#ffffff] px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                />
                {qcHoldReasonError && (
                  <p className="text-[11px] text-[#bb0000] font-semibold mt-1">{qcHoldReasonError}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e8e8e8]">
                <button
                  type="button"
                  onClick={() => setQcHoldTargetBalance(null)}
                  className="sap-btn-standard px-3.5 py-1.5 text-xs cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-[#bb0000] hover:bg-[#990000] text-[#ffffff] text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>ثبت علت در لاگ و اعمال قرنطینه (QC Hold)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
