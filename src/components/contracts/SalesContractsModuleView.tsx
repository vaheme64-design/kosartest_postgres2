import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileSignature,
  ShoppingBag,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  ArrowUpRight,
  Building2,
  PackageCheck,
  Edit3,
  History,
  X,
  Save,
  PauseCircle,
  Ban,
} from 'lucide-react';
import {
  Part,
  SapcoContract,
  PhysicalCoil,
  UserRoleProfile,
  ContractRevisionEntry,
} from '../../types/inventory';
import { CustomerOrder } from '../../types/productionPlanning';
import { ContractsManagementView } from '../inventory/ContractsManagementView';
import { formatNumber, toPersianDigits } from '../../utils/formatters';
import { useEnterpriseUx } from '../../context/EnterpriseUxContext';
import { useErpRouter } from '../../context/RouterContext';

export type ContractsSubTab = 'CONTRACTS_QUOTAS' | 'CUSTOMER_ORDERS';

interface SalesContractsModuleViewProps {
  parts: Part[];
  currentUser?: UserRoleProfile;
  initialSubTab?: ContractsSubTab;
  onNavigateToPlanning?: () => void;
  onNavigateToInventoryLedger?: (contractId: string) => void;
  onNavigateToTab?: (...args: any[]) => void;
  onNavigateSubModule?: (...args: any[]) => void;
  onGlobalRefresh?: () => void | Promise<void>;
}

const ORDER_REVISIONS_STORAGE_KEY = 'kpims_order_revisions_v1';

export const SalesContractsModuleView: React.FC<SalesContractsModuleViewProps> = ({
  parts,
  currentUser,
  initialSubTab = 'CONTRACTS_QUOTAS',
  onNavigateToPlanning,
  onNavigateToInventoryLedger,
}) => {
  const { requestConfirm, showUndoToast, recordAudit } = useEnterpriseUx();
  const { route, navigate, traceDocument, clearDocQuery } = useErpRouter();
  const [activeTab, setActiveTab] = useState<ContractsSubTab>(initialSubTab);
  const [orderSearchQuery, setOrderSearchQuery] = useState<string>('');
  const [contracts, setContracts] = useState<SapcoContract[]>([]);
  const [coils, setCoils] = useState<PhysicalCoil[]>([]);
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(false);

  // Order Revisions Map persisted in localStorage
  const [orderRevisionsMap, setOrderRevisionsMap] = useState<Record<string, ContractRevisionEntry[]>>(() => {
    try {
      const raw = window.localStorage.getItem(ORDER_REVISIONS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(ORDER_REVISIONS_STORAGE_KEY, JSON.stringify(orderRevisionsMap));
    } catch {
      // ignore
    }
  }, [orderRevisionsMap]);

  // New Customer Order Modal State
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [customerName, setCustomerName] = useState('ساپکو (ایران‌خودرو)');
  const [contractNumber, setContractNumber] = useState('CNT-SAPCO-1403-Q3');
  const [dueDate, setDueDate] = useState('2026-04-20');
  const [priority, setPriority] = useState<1 | 2 | 3>(1);
  const [selectedPartId, setSelectedPartId] = useState('');
  const [orderQuantity, setOrderQuantity] = useState(2500);
  const [orderNotes, setOrderNotes] = useState('');
  const [orderSuccessMsg, setOrderSuccessMsg] = useState<string | null>(null);

  // Edit Customer Order & Revisions Slide-Over Drawer State
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [orderDrawerTab, setOrderDrawerTab] = useState<'EDIT' | 'REVISIONS'>('EDIT');
  const [editOrderCustomer, setEditOrderCustomer] = useState('');
  const [editOrderContractNo, setEditOrderContractNo] = useState('');
  const [editOrderDueDate, setEditOrderDueDate] = useState('');
  const [editOrderPriority, setEditOrderPriority] = useState<1 | 2 | 3>(1);
  const [editOrderStatus, setEditOrderStatus] = useState<'ACTIVE' | 'SUSPENDED' | 'TERMINATED'>('ACTIVE');
  const [editOrderLines, setEditOrderLines] = useState<CustomerOrder['lines']>([]);
  const [editOrderNotes, setEditOrderNotes] = useState('');
  const [editOrderRevReason, setEditOrderRevReason] = useState('');

  useEffect(() => {
    setActiveTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    if (route.docQuery) {
      const q = route.docQuery.trim().toLowerCase();
      setOrderSearchQuery(route.docQuery);
      const matchesContract = contracts.some(
        c => c.contractNumber.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
      );
      const matchesOrder = customerOrders.some(
        o => o.orderNumber.toLowerCase().includes(q) || o.contractNumber.toLowerCase().includes(q)
      );
      if (matchesOrder && !matchesContract) {
        setActiveTab('CUSTOMER_ORDERS');
      } else if (matchesContract) {
        setActiveTab('CONTRACTS_QUOTAS');
      }
    }
  }, [route.docQuery, contracts, customerOrders]);

  const filteredCustomerOrders = useMemo(() => {
    const q = orderSearchQuery.trim().toLowerCase();
    if (!q) return customerOrders;
    return customerOrders.filter(
      o =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.contractNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        (o.lines || []).some(
          l => l.partCode.toLowerCase().includes(q) || l.partName.toLowerCase().includes(q)
        )
    );
  }, [customerOrders, orderSearchQuery]);

  const finishedParts = parts.filter(p => p.category === 'FINISHED_GOOD');

  useEffect(() => {
    if (finishedParts.length > 0 && !selectedPartId) {
      setSelectedPartId(finishedParts[0].id);
    }
  }, [finishedParts, selectedPartId]);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [cntRes, coilRes, ordRes] = await Promise.all([
        fetch('/api/inventory/contracts'),
        fetch('/api/inventory/coils'),
        fetch('/api/planning/customer-orders'),
      ]);
      const [cntJson, coilJson, ordJson] = await Promise.all([
        cntRes.json(),
        coilRes.json(),
        ordRes.json(),
      ]);

      if (cntJson.success) setContracts(cntJson.data || []);
      if (coilJson.success) setCoils(coilJson.data || []);
      if (ordJson.success) setCustomerOrders(ordJson.data || []);
    } catch (err) {
      console.error('Error loading contracts & orders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const activeDrawerOrder = useMemo(
    () => customerOrders.find(o => o.id === editingOrderId) || null,
    [customerOrders, editingOrderId]
  );

  const openOrderEditDrawer = (order: CustomerOrder, tab: 'EDIT' | 'REVISIONS' = 'EDIT') => {
    setEditingOrderId(order.id);
    setOrderDrawerTab(tab);
    setEditOrderCustomer(order.customerName);
    setEditOrderContractNo(order.contractNumber);
    setEditOrderDueDate(order.dueDate);
    setEditOrderPriority(order.priority);
    const normStatus =
      order.status === 'SUSPENDED'
        ? 'SUSPENDED'
        : order.status === 'TERMINATED' || order.status === 'FULFILLED' || order.status === 'CANCELLED'
        ? 'TERMINATED'
        : 'ACTIVE';
    setEditOrderStatus(normStatus);
    setEditOrderLines(JSON.parse(JSON.stringify(order.lines || [])));
    setEditOrderNotes(order.notes || '');
    setEditOrderRevReason('');
  };

  const handleSaveOrderEdit = () => {
    if (!activeDrawerOrder) return;
    const prevOrders = [...customerOrders];
    const oldTotalQty = (activeDrawerOrder.lines || []).reduce((s, l) => s + l.orderedQuantity, 0);
    const newTotalQty = editOrderLines.reduce((s, l) => s + (Number(l.orderedQuantity) || 0), 0);

    const performSave = async () => {
      const existingRevs = [
        ...(orderRevisionsMap[activeDrawerOrder.id] || activeDrawerOrder.revisions || []),
      ];
      const newRev: ContractRevisionEntry = {
        id: `REV-ORD-${Date.now()}`,
        revisionNumber: existingRevs.length + 1,
        timestamp: new Date().toLocaleString('fa-IR'),
        actor: currentUser?.displayName || 'مدیر فروش و برنامه‌ریزی',
        fieldLabelFa:
          newTotalQty !== oldTotalQty ? 'تیراژ سفارش فروش مشتری' : 'وضعیت اجرایی سفارش فروش',
        oldQty: oldTotalQty,
        newQty: newTotalQty,
        unit: 'عدد',
        oldStatus: activeDrawerOrder.status,
        newStatus: editOrderStatus,
        reasonFa: editOrderRevReason.trim() || 'ویرایش تیراژ / وضعیت سفارش در کشوی سفارشات فروش',
      };

      const nextRevs = [newRev, ...existingRevs];
      const updatedLines = editOrderLines.map(l => ({
        ...l,
        orderedQuantity: Number(l.orderedQuantity) || 0,
        deliveredQuantity: Number(l.deliveredQuantity) || 0,
        remainingQuantity: Math.max(0, (Number(l.orderedQuantity) || 0) - (Number(l.deliveredQuantity) || 0)),
      }));

      setOrderRevisionsMap(prev => ({ ...prev, [activeDrawerOrder.id]: nextRevs }));
      setCustomerOrders(prev =>
        prev.map(o =>
          o.id === activeDrawerOrder.id
            ? {
                ...o,
                customerName: editOrderCustomer,
                contractNumber: editOrderContractNo,
                dueDate: editOrderDueDate,
                priority: editOrderPriority,
                status: editOrderStatus,
                lines: updatedLines,
                notes: editOrderNotes,
                revisions: nextRevs,
              }
            : o
        )
      );

      try {
        await fetch(`/api/planning/customer-orders/${activeDrawerOrder.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: editOrderCustomer,
            contractNumber: editOrderContractNo,
            dueDate: editOrderDueDate,
            priority: editOrderPriority,
            status: editOrderStatus,
            lines: updatedLines,
            notes: editOrderNotes,
            revisions: nextRevs,
            actor: currentUser?.displayName,
            revisionReasonFa: editOrderRevReason.trim(),
          }),
        });
      } catch {
        // local state updated
      }

      recordAudit({
        actionType: 'UPDATE',
        module: 'سفارشات فروش (CustomerOrders)',
        entityId: activeDrawerOrder.id,
        entityCode: activeDrawerOrder.orderNumber,
        summaryFa: `ویرایش سفارش فروش «${activeDrawerOrder.orderNumber}» — تیراژ: ${formatNumber(newTotalQty)} عدد`,
        beforeSnapshot: { totalQty: oldTotalQty, status: activeDrawerOrder.status },
        afterSnapshot: { totalQty: newTotalQty, status: editOrderStatus },
      });

      showUndoToast({
        title: `سفارش فروش «${activeDrawerOrder.orderNumber}» ویرایش شد`,
        description: 'تغییرات تیراژ و وضعیت در تاریخچه سفارش (Revisions) ثبت گردید.',
        onUndo: () => setCustomerOrders(prevOrders),
      });

      setEditOrderRevReason('');
      setOrderDrawerTab('REVISIONS');
    };

    if (editOrderStatus !== 'ACTIVE' || newTotalQty !== oldTotalQty) {
      requestConfirm({
        title: `تأیید ویرایش سفارش فروش «${activeDrawerOrder.orderNumber}»`,
        description: `آیا از ثبت تغییرات تیراژ (${formatNumber(oldTotalQty)} ⬅ ${formatNumber(
          newTotalQty
        )} عدد) و وضعیت سفارش اطمینان دارید؟`,
        consequenceText:
          'این تغییر بلافاصله نیازمندی خالص تولید (MRP) را بروزرسانی کرده و در تاریخچه Revisions ثبت می‌شود.',
        severity: editOrderStatus === 'ACTIVE' ? 'info' : 'warning',
        confirmLabel: 'تأیید و ثبت بازنگری سفارش',
        onConfirm: performSave,
      });
    } else {
      performSave();
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const part = parts.find(p => p.id === selectedPartId);
    if (!part) return;

    try {
      const res = await fetch('/api/planning/customer-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: orderNumber || `SO-SAPCO-1405-${Math.floor(100 + Math.random() * 900)}`,
          customerName,
          contractNumber,
          orderDate: new Date().toISOString().slice(0, 10),
          dueDate,
          priority,
          notes: orderNotes,
          lines: [
            {
              id: `OL-${Date.now()}`,
              orderId: '',
              partId: part.id,
              partCode: part.code,
              partName: part.name,
              orderedQuantity: Number(orderQuantity),
              deliveredQuantity: 0,
              remainingQuantity: Number(orderQuantity),
              dueDate,
            },
          ],
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowOrderModal(false);
        setOrderNumber('');
        setOrderNotes('');
        setOrderSuccessMsg('سفارش مشتری با موفقیت ثبت شد و به موتور برنامه‌ریزی تولید و MRP منتقل گردید.');
        setTimeout(() => setOrderSuccessMsg(null), 5000);
        await fetchAllData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Unified Commercial Header & Sub-Navigation */}
      <div className="sap-card overflow-hidden">
        <div className="px-4 py-3 bg-[#ffffff] border-b border-[#d9d9d9] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] text-[11px] font-semibold">
                مدیریت بازرگانی، قراردادها و سفارشات مشتریان
              </span>
              {route.docQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setOrderSearchQuery('');
                    clearDocQuery();
                  }}
                  className="px-2 py-0.5 rounded bg-[#fff8e6] text-[#8a5300] border border-[#f0cf85] text-[11px] font-mono inline-flex items-center gap-1 cursor-pointer"
                  title="پاک کردن فیلتر رهگیری سند"
                >
                  <span>فیلتر سند: {route.docQuery}</span>
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <h1 className="text-base font-semibold text-[#333333]">
              مرکز یکپارچه قراردادهای ساپکو، سهمیه ورق و سفارشات فروش
            </h1>
            <p className="text-xs text-[#666666]">
              ثبت و ویرایش کامل قراردادها، پیگیری تاریخچه تغییرات تیراژ (Revisions) و اتصال مستقیم اسناد به کاردکس و تولید
            </p>
          </div>
        </div>

        {/* Sub-module SAP IconTabBar */}
        <div className="sap-icon-tab-bar px-3">
          <button
            type="button"
            onClick={() => setActiveTab('CONTRACTS_QUOTAS')}
            className={`sap-icon-tab ${activeTab === 'CONTRACTS_QUOTAS' ? 'sap-icon-tab-active' : ''}`}
          >
            <FileSignature className="w-3.5 h-3.5" />
            <span>قراردادها و سهمیه ورق ({toPersianDigits(contracts.length)})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('CUSTOMER_ORDERS')}
            className={`sap-icon-tab ${activeTab === 'CUSTOMER_ORDERS' ? 'sap-icon-tab-active' : ''}`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>سفارشات فروش و تعهدات تحویل ({toPersianDigits(customerOrders.length)})</span>
          </button>
        </div>
      </div>

      {orderSuccessMsg && (
        <div className="p-3 rounded bg-[#f2f8f4] border border-[#b7dfc7] text-[#107e3e] text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#107e3e] shrink-0" />
            <span className="font-medium">{orderSuccessMsg}</span>
          </div>
          {onNavigateToPlanning && (
            <button
              type="button"
              onClick={onNavigateToPlanning}
              className="sap-btn-emphasized px-3 py-1 text-[11px] flex items-center gap-1 cursor-pointer"
            >
              <span>مشاهده در برنامه‌ریزی و MRP</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* TAB 1: CONTRACTS & QUOTAS */}
      {activeTab === 'CONTRACTS_QUOTAS' && (
        <ContractsManagementView
          contracts={contracts}
          parts={parts}
          coils={coils}
          loading={loading}
          onRefresh={fetchAllData}
          initialSearchQuery={route.docQuery || undefined}
          onViewContractLedger={contractId => {
            const matched = contracts.find(c => c.id === contractId || c.contractNumber === contractId);
            if (onNavigateToInventoryLedger) {
              onNavigateToInventoryLedger(matched?.contractNumber || contractId);
            } else {
              traceDocument(matched?.contractNumber || contractId, 'INVENTORY_LEDGER');
            }
          }}
          currentUser={{
            uid: currentUser?.uid || 'USR-COMM-01',
            displayName: currentUser?.displayName || 'مدیر بازرگانی و قراردادها',
            role: currentUser?.role || 'مدیر بازرگانی',
          }}
        />
      )}

      {/* TAB 2: CUSTOMER ORDERS */}
      {activeTab === 'CUSTOMER_ORDERS' && (
        <div className="space-y-3">
          <div className="sap-card p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[#333333] flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-[#007cc0]" />
                <span>فهرست سفارشات قطعی مشتریان (Customer Sales Orders) با قابلیت ویرایش و تاریخچه تیراژ</span>
              </h2>
              <p className="text-xs text-[#666666] mt-0.5">
                هر سفارش ثبت یا ویرایش‌شده مستقیماً به عنوان تقاضای ناخالص وارد MRP و برنامه تولید می‌شود
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={orderSearchQuery}
                onChange={e => setOrderSearchQuery(e.target.value)}
                placeholder="فیلتر شماره سفارش، قرارداد، قطعه..."
                className="px-2.5 py-1.5 bg-[#ffffff] border border-[#d9d9d9] rounded text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
              />
              <button
                type="button"
                onClick={() => setShowOrderModal(true)}
                className="sap-btn-emphasized flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>ثبت سفارش جدید مشتری</span>
              </button>

              {onNavigateToPlanning && (
                <button
                  type="button"
                  onClick={onNavigateToPlanning}
                  className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer whitespace-nowrap"
                >
                  <span>بررسی پوشش مواد در MRP</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={fetchAllData}
                className="sap-btn-standard p-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {filteredCustomerOrders.map(order => {
              const revs = orderRevisionsMap[order.id] || order.revisions || [];
              const isSuspended = order.status === 'SUSPENDED';
              const isTerminated =
                order.status === 'TERMINATED' || order.status === 'FULFILLED' || order.status === 'CANCELLED';

              return (
                <div
                  key={order.id}
                  className="sap-card p-3.5 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8e8e8] pb-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => openOrderEditDrawer(order, 'EDIT')}
                        className="font-mono text-xs font-semibold px-2.5 py-1 bg-[#007cc0] hover:bg-[#006299] text-white rounded cursor-pointer"
                      >
                        {order.orderNumber}
                      </button>
                      <span className="text-xs font-semibold text-[#333333] flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-[#666666]" />
                        {order.customerName}
                      </span>
                      <button
                        type="button"
                        onClick={() => traceDocument(order.contractNumber, 'INVENTORY_LEDGER')}
                        className="sap-doc-link text-[11px] px-2 py-0.5 bg-[#e5f3fa] border border-[#b3ddf2] rounded"
                        title="رهگیری اسناد و کاردکس قرارداد در انبار"
                      >
                        قرارداد: {order.contractNumber}
                      </button>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded font-semibold ${
                          order.priority === 1
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : order.priority === 2
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {order.priority === 1 ? 'اولویت ۱ (فوری)' : order.priority === 2 ? 'اولویت ۲ (عادی)' : 'اولویت ۳'}
                      </span>
                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                          isSuspended
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : isTerminated
                            ? 'bg-slate-100 text-slate-700 border-slate-300'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {isSuspended ? 'معلق (Suspended)' : isTerminated ? 'خاتمه‌یافته (Terminated)' : 'فعال (Active)'}
                      </span>
                      {revs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => openOrderEditDrawer(order, 'REVISIONS')}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] text-[10px] font-semibold cursor-pointer"
                        >
                          <History className="w-3 h-3" />
                          <span>{toPersianDigits(revs.length)} ویرایش تیراژ</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-[#666666] flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-[#666666]" />
                        موعد تحویل: <strong className="font-mono text-[#333333]">{order.dueDate}</strong>
                      </span>

                      <button
                        type="button"
                        onClick={() => traceDocument(order.contractNumber, 'INVENTORY_LEDGER')}
                        className="sap-btn-standard px-2 py-1 text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        <span>کاردکس و تحویل</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </button>

                      <button
                        type="button"
                        onClick={() => traceDocument(order.lines?.[0]?.partCode || order.orderNumber, 'WIP_TRACEABILITY')}
                        className="sap-btn-standard px-2 py-1 text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        <span>رهگیری WIP</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => navigate({ tab: 'planning', planningSubTab: 'mrp', docQuery: order.orderNumber })}
                        className="sap-btn-standard px-2 py-1 text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        <span>بررسی MRP</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openOrderEditDrawer(order, 'EDIT')}
                        className="sap-btn-emphasized px-2.5 py-1 text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>ویرایش سفارش</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openOrderEditDrawer(order, 'REVISIONS')}
                        className="sap-btn-standard px-2.5 py-1 text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <History className="w-3 h-3" />
                        <span>تاریخچه تیراژ</span>
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-[#d9d9d9] rounded">
                    <table className="w-full text-xs text-right sap-table-compact">
                      <thead className="bg-[#ffffff] text-[#333333] border-b border-[#d9d9d9]">
                        <tr>
                          <th className="py-1.5 px-2.5">کد قطعه</th>
                          <th className="py-1.5 px-2.5">نام قطعه خودرویی</th>
                          <th className="py-1.5 px-2.5">تیراژ سفارش</th>
                          <th className="py-1.5 px-2.5">تحویل شده</th>
                          <th className="py-1.5 px-2.5">مانده تعهد</th>
                          <th className="py-1.5 px-2.5">درصد تحقق</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e8e8e8]">
                        {(order.lines || []).map(line => {
                          const pct =
                            line.orderedQuantity > 0
                              ? Math.min(100, Math.round((line.deliveredQuantity / line.orderedQuantity) * 100))
                              : 0;
                          return (
                            <tr key={line.id} className="hover:bg-[#e5f3fa]">
                              <td className="py-1.5 px-2.5 font-mono">
                                <button
                                  type="button"
                                  onClick={() => traceDocument(line.partCode, 'WIP_TRACEABILITY')}
                                  className="sap-doc-link"
                                  title="رهگیری قطعه در کارگاه و انبار"
                                >
                                  {line.partCode}
                                </button>
                              </td>
                              <td className="py-1.5 px-2.5 font-semibold text-[#333333]">{line.partName}</td>
                              <td className="py-1.5 px-2.5 font-mono font-semibold text-[#333333]">
                                {formatNumber(line.orderedQuantity)} عدد
                              </td>
                              <td className="py-1.5 px-2.5 font-mono text-[#107e3e]">
                                {formatNumber(line.deliveredQuantity)} عدد
                              </td>
                              <td className="py-1.5 px-2.5 font-mono font-semibold text-[#e9730c]">
                                {formatNumber(line.remainingQuantity)} عدد
                              </td>
                              <td className="py-1.5 px-2.5">
                                <div className="flex items-center gap-2 font-mono text-[11px]">
                                  <div className="w-20 h-1.5 bg-[#f0f0f0] rounded-full overflow-hidden border border-[#d9d9d9]">
                                    <div
                                      className="h-full bg-[#107e3e] rounded-full"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span>{toPersianDigits(pct)}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SLIDE-OVER DRAWER: CUSTOMER ORDER EDIT & REVISIONS HISTORY           */}
      {/* ==================================================================== */}
      {activeDrawerOrder && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-[#333333]/40 backdrop-blur-[1px] animate-in fade-in duration-150"
          dir="rtl"
          onClick={() => setEditingOrderId(null)}
        >
          <div
            className="w-full max-w-xl bg-[#ffffff] h-full shadow-2xl border-r border-[#d9d9d9] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-[#ffffff] text-[#333333] px-5 py-3.5 flex items-center justify-between border-b border-[#d9d9d9]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] font-mono text-xs font-semibold">
                    {activeDrawerOrder.orderNumber}
                  </span>
                  <h3 className="text-sm font-semibold text-[#333333]">ویرایش سفارش مشتری و تاریخچه تغییرات تیراژ</h3>
                </div>
                <p className="text-[11px] text-[#666666] mt-1">
                  مشتری: {activeDrawerOrder.customerName} · قرارداد:{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingOrderId(null);
                      traceDocument(activeDrawerOrder.contractNumber, 'INVENTORY_LEDGER');
                    }}
                    className="sap-doc-link"
                  >
                    {activeDrawerOrder.contractNumber}
                  </button>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingOrderId(null)}
                className="p-1.5 rounded bg-[#f5f5f5] hover:bg-[#e5f3fa] text-[#333333] border border-[#d9d9d9] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="sap-icon-tab-bar px-5">
              <button
                type="button"
                onClick={() => setOrderDrawerTab('EDIT')}
                className={`sap-icon-tab ${orderDrawerTab === 'EDIT' ? 'sap-icon-tab-active' : ''}`}
              >
                ۱. ویرایش سفارش و وضعیت
              </button>
              <button
                type="button"
                onClick={() => setOrderDrawerTab('REVISIONS')}
                className={`sap-icon-tab ${orderDrawerTab === 'REVISIONS' ? 'sap-icon-tab-active' : ''}`}
              >
                ۲. تاریخچه تغییرات تیراژ (Revisions) (
                {toPersianDigits((orderRevisionsMap[activeDrawerOrder.id] || activeDrawerOrder.revisions || []).length)})
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              {orderDrawerTab === 'EDIT' ? (
                <>
                  <div className="space-y-2">
                    <label className="block font-bold text-slate-900">وضعیت سفارش (Status):</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditOrderStatus('ACTIVE')}
                        className={`p-2.5 rounded-lg border font-bold flex items-center justify-center gap-1 cursor-pointer ${
                          editOrderStatus === 'ACTIVE'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>فعال</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditOrderStatus('SUSPENDED')}
                        className={`p-2.5 rounded-lg border font-bold flex items-center justify-center gap-1 cursor-pointer ${
                          editOrderStatus === 'SUSPENDED'
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        <PauseCircle className="w-3.5 h-3.5" />
                        <span>معلق</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditOrderStatus('TERMINATED')}
                        className={`p-2 rounded border font-bold flex items-center justify-center gap-1 cursor-pointer ${
                          editOrderStatus === 'TERMINATED'
                            ? 'bg-[#333333] text-white border-[#333333]'
                            : 'bg-white text-[#333333] border-[#d9d9d9] hover:bg-[#f5f5f5]'
                        }`}
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>خاتمه‌یافته</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">نام مشتری:</label>
                      <input
                        type="text"
                        value={editOrderCustomer}
                        onChange={e => setEditOrderCustomer(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">موعد تحویل:</label>
                      <input
                        type="date"
                        value={editOrderDueDate}
                        onChange={e => setEditOrderDueDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block font-bold text-slate-900">ویرایش تیراژ اقلام سفارش:</label>
                    {editOrderLines.map((line, idx) => (
                      <div
                        key={line.id || idx}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="font-bold text-slate-900">{line.partName}</div>
                          <div className="text-[10px] font-mono text-slate-500">{line.partCode}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-600">تیراژ:</span>
                          <input
                            type="number"
                            min={1}
                            value={line.orderedQuantity}
                            onChange={e => {
                              const val = Number(e.target.value) || 0;
                              setEditOrderLines(prev =>
                                prev.map((l, i) => (i === idx ? { ...l, orderedQuantity: val } : l))
                              );
                            }}
                            className="w-28 px-2.5 py-1.5 rounded border border-[#007cc0] bg-white font-mono font-semibold text-[#333333]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="block font-semibold text-[#333333] mb-1">علت تغییر تیراژ (ثبت در تاریخچه Revisions):</label>
                    <input
                      type="text"
                      value={editOrderRevReason}
                      onChange={e => setEditOrderRevReason(e.target.value)}
                      placeholder="مثلاً: اصلاح برنامه هفتگی ساپکو..."
                      className="w-full px-3 py-2 rounded border border-[#d9d9d9] bg-[#fffcf5] focus:outline-none focus:border-[#007cc0]"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  {(orderRevisionsMap[activeDrawerOrder.id] || activeDrawerOrder.revisions || []).length === 0 ? (
                    <div className="p-6 text-center text-[#666666] bg-[#f5f5f5] rounded border border-[#d9d9d9]">
                      هنوز ویرایشی روی تیراژ این سفارش ثبت نشده است.
                    </div>
                  ) : (
                    (orderRevisionsMap[activeDrawerOrder.id] || activeDrawerOrder.revisions || []).map((rev, i) => (
                      <div key={rev.id || i} className="p-3.5 rounded border border-[#d9d9d9] bg-white space-y-2">
                        <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-1.5">
                          <span className="px-2 py-0.5 rounded bg-[#007cc0] text-white font-mono text-[10px] font-semibold">
                            Rev #{toPersianDigits(rev.revisionNumber || i + 1)}
                          </span>
                          <span className="font-mono text-[11px] text-[#666666]">{rev.timestamp}</span>
                        </div>
                        <div className="flex items-center justify-between font-mono text-xs bg-[#f5f5f5] p-2.5 rounded">
                          <span>قبلی: {formatNumber(rev.oldQty)} عدد</span>
                          <span>⬅</span>
                          <strong className="text-[#007cc0]">جدید: {formatNumber(rev.newQty)} عدد</strong>
                        </div>
                        <div className="text-[11px] text-[#666666]">
                          علت: {rev.reasonFa} ({rev.actor})
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="bg-[#f5f5f5] border-t border-[#d9d9d9] px-5 py-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setEditingOrderId(null)}
                className="sap-btn-standard px-4 py-1.5 text-xs cursor-pointer"
              >
                بستن
              </button>
              {orderDrawerTab === 'EDIT' && (
                <button
                  type="button"
                  onClick={handleSaveOrderEdit}
                  className="sap-btn-emphasized px-5 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>ذخیره تغییرات سفارش</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal for Creating New Customer Order */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#333333]/40 backdrop-blur-[1px]">
          <div className="bg-white border border-[#d9d9d9] rounded-md w-full max-w-lg overflow-hidden shadow-xl">
            <div className="flex items-center justify-between border-b border-[#d9d9d9] bg-[#ffffff] px-5 py-3">
              <h3 className="text-sm font-semibold text-[#333333] flex items-center gap-2">
                <PackageCheck className="w-4 h-4 text-[#007cc0]" />
                <span>ثبت سفارش جدید مشتری (متصل به قرارداد)</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowOrderModal(false)}
                className="text-[#666666] hover:text-[#333333] text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#333333] font-medium mb-1">شماره سفارش فروش</label>
                  <input
                    type="text"
                    value={orderNumber}
                    onChange={e => setOrderNumber(e.target.value)}
                    placeholder="مثلاً SO-SAPCO-1405-25"
                    className="w-full px-3 py-1.5 bg-white border border-[#bfbfbf] rounded font-mono text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
                <div>
                  <label className="block text-[#333333] font-medium mb-1">مشتری / خودروساز</label>
                  <select
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-[#bfbfbf] rounded text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  >
                    <option value="ساپکو (ایران‌خودرو)">ساپکو (ایران‌خودرو)</option>
                    <option value="سازه‌گستر سایپا">سازه‌گستر سایپا</option>
                    <option value="بهمن موتور">بهمن موتور</option>
                    <option value="بازار یدک (Aftermarket)">بازار یدک (Aftermarket)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#333333] font-medium mb-1">قرارداد مرجع</label>
                  <select
                    value={contractNumber}
                    onChange={e => setContractNumber(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-[#bfbfbf] rounded font-mono text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  >
                    {contracts.map(c => (
                      <option key={c.id} value={c.contractNumber}>
                        {c.contractNumber} - {c.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[#333333] font-medium mb-1">موعد تحویل</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-[#bfbfbf] rounded font-mono text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#333333] font-medium mb-1">قطعه مورد سفارش</label>
                  <select
                    value={selectedPartId}
                    onChange={e => setSelectedPartId(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-[#bfbfbf] rounded text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  >
                    {finishedParts.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[#333333] font-medium mb-1">تیراژ سفارش (عدد)</label>
                  <input
                    type="number"
                    min={1}
                    value={orderQuantity}
                    onChange={e => setOrderQuantity(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-white border border-[#bfbfbf] rounded font-mono text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#333333] font-medium mb-1">اولویت سفارش</label>
                <select
                  value={priority}
                  onChange={e => setPriority(Number(e.target.value) as 1 | 2 | 3)}
                  className="w-full px-3 py-1.5 bg-white border border-[#bfbfbf] rounded text-[#333333] focus:outline-none focus:border-[#007cc0]"
                >
                  <option value={1}>اولویت ۱ - بحرانی / خط خودروساز</option>
                  <option value={2}>اولویت ۲ - برنامه عادی ماهیانه</option>
                  <option value={3}>اولویت ۳ - ذخیره احتیاطی</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#d9d9d9]">
                <button
                  type="button"
                  onClick={() => setShowOrderModal(false)}
                  className="sap-btn-standard px-4 py-1.5 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="sap-btn-emphasized px-4 py-1.5 cursor-pointer"
                >
                  ثبت سفارش و ارسال به برنامه‌ریزی
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
