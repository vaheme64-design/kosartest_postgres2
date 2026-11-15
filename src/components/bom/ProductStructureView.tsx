import React, { useState, useEffect } from 'react';
import {
  ListTree,
  Boxes,
  Plus,
  Trash2,
  Edit3,
  ChevronRight,
  ChevronDown,
  Layers,
  Sparkles,
  Search,
  X,
  CheckCircle2,
  FolderTree,
  Info,
} from 'lucide-react';
import { Part } from '../../types/inventory';
import { toPersianDigits } from '../../utils/formatters';
import { SearchableSelect } from '../common/SearchableSelect';
import { useErpRouter } from '../../context/RouterContext';

export interface SubComponentNode {
  id: string;
  partId: string;
  partCode: string;
  partName: string;
  quantity: number;
  unit: string;
  notes?: string;
  subComponents?: SubComponentNode[];
}

export interface ProductStructureData {
  id: string;
  rootPartId: string;
  rootPartCode: string;
  rootPartName: string;
  carModel?: string;
  subComponents: SubComponentNode[];
  notes?: string;
}

const INITIAL_PRODUCT_STRUCTURES: ProductStructureData[] = [
  {
    id: 'PS-ECU-ANTI-THEFT',
    rootPartId: 'PRT-FGD-ECU-BRK',
    rootPartCode: 'SAPCO-ASY-ECU-BRK-01',
    rootPartName: 'مجموعه کامل براکت ضدسرقت رایانه موتور',
    carModel: 'پژو ۲۰۶',
    notes: 'مجموعه مونتاژی ضدسرقت متشکل از صفحه اصلی و مکمل با مهره‌ها و پیچ‌های جوشی',
    subComponents: [
      {
        id: 'SUB-ECU-01',
        partId: 'PRT-WIP-ECU-MAIN',
        partCode: 'WIP-ECU-MAIN-BRK',
        partName: 'صفحه براکت اصلی ضدسرقت',
        quantity: 1,
        unit: 'عدد',
        notes: 'تولید شده از رول ورق DC01A ضخامت ۲',
        subComponents: [
          {
            id: 'RAW-ECU-MAIN-01',
            partId: 'PRT-RM-DC01A-2-1140',
            partCode: 'RM-COIL-DC01A-2.0-1140',
            partName: 'کویل ورق DC01A ضخامت 2mm عرض 1140',
            quantity: 0.95,
            unit: 'کیلوگرم',
            notes: 'برش و گیوتین اولیه',
          },
          {
            id: 'FST-ECU-MAIN-01',
            partId: 'PRT-FST-NUT-M6',
            partCode: 'FST-NUT-WELD-M6',
            partName: 'مهره جوشی M6 استاندارد DIN 928',
            quantity: 15,
            unit: 'عدد',
            notes: 'ایستگاه پرس‌جوش مقاومتی',
          },
        ],
      },
      {
        id: 'SUB-ECU-02',
        partId: 'PRT-WIP-ECU-COMP',
        partCode: 'WIP-ECU-COMP-BRK',
        partName: 'مکمل براکت ضدسرقت',
        quantity: 1,
        unit: 'عدد',
        notes: 'تولید شده از رول ورق DC01A',
        subComponents: [
          {
            id: 'RAW-ECU-COMP-01',
            partId: 'PRT-RM-DC01A-2-1140',
            partCode: 'RM-COIL-DC01A-2.0-1140',
            partName: 'کویل ورق DC01A ضخامت 2mm عرض 1140 (یا 1000)',
            quantity: 0.45,
            unit: 'کیلوگرم',
          },
          {
            id: 'FST-ECU-COMP-01',
            partId: 'PRT-FST-BLT-M6-20',
            partCode: 'FST-BOLT-WELD-M6-20',
            partName: 'پیچ پایه جوشی M6x20',
            quantity: 2,
            unit: 'عدد',
          },
        ],
      },
    ],
  },
];

interface ProductStructureViewProps {
  parts: Part[];
}

const STORAGE_KEY_PRODUCT_STRUCTURES = 'kpims_product_structures_v3';

export const ProductStructureView: React.FC<ProductStructureViewProps> = ({ parts }) => {
  const { traceDocument } = useErpRouter();
  const [structures, setStructures] = useState<ProductStructureData[]>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY_PRODUCT_STRUCTURES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return INITIAL_PRODUCT_STRUCTURES;
  });

  const [selectedStructureId, setSelectedStructureId] = useState<string>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY_PRODUCT_STRUCTURES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].id;
      }
    } catch {
      // ignore
    }
    return INITIAL_PRODUCT_STRUCTURES[0]?.id || '';
  });

  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    'SUB-ECU-01': true,
    'SUB-ECU-02': true,
    'SUB-TAR-01': true,
    'SUB-TAR-02': true,
  });

  // Load from backend if backend has saved structures
  useEffect(() => {
    fetch('/api/production/product-structures')
      .then(r => r.json())
      .then(res => {
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setStructures(res.data);
          window.localStorage.setItem(STORAGE_KEY_PRODUCT_STRUCTURES, JSON.stringify(res.data));
        } else {
          // Seed backend with current localStorage / initial structures
          fetch('/api/production/product-structures', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ structures }),
          }).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const persistStructures = async (nextStructures: ProductStructureData[], msg: string) => {
    setStructures(nextStructures);
    try {
      window.localStorage.setItem(STORAGE_KEY_PRODUCT_STRUCTURES, JSON.stringify(nextStructures));
    } catch {
      // ignore
    }
    setIsSyncing(true);
    try {
      await fetch('/api/production/product-structures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structures: nextStructures }),
      });
    } catch {
      // ignore
    } finally {
      setIsSyncing(false);
      setSaveMessage(msg);
      setTimeout(() => setSaveMessage(null), 4000);
    }
  };

  // Modal State for adding/editing a sub-component recursively
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [targetParentNodeId, setTargetParentNodeId] = useState<string | null>(null); // null means root assembly
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  const [formPartId, setFormPartId] = useState('');
  const [formPartCode, setFormPartCode] = useState('');
  const [formPartName, setFormPartName] = useState('');
  const [formQty, setFormQty] = useState<number>(1);
  const [formUnit, setFormUnit] = useState('عدد');
  const [formNotes, setFormNotes] = useState('');

  // Modal State for New Assembly Root
  const [isNewAssemblyModalOpen, setIsNewAssemblyModalOpen] = useState(false);
  const [newRootPartId, setNewRootPartId] = useState('');
  const [newCarModel, setNewCarModel] = useState('پژو ۲۰۶');
  const [newAssemblyNotes, setNewAssemblyNotes] = useState('');

  const activeStructure = structures.find(s => s.id === selectedStructureId) || structures[0];

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  const handleOpenAddSubComponent = (parentNodeId: string | null) => {
    setEditingNodeId(null);
    setTargetParentNodeId(parentNodeId);
    setFormPartId('');
    setFormPartCode('');
    setFormPartName('');
    setFormQty(1);
    setFormUnit('عدد');
    setFormNotes('');
    setIsModalOpen(true);
  };

  const handleOpenEditSubComponent = (node: SubComponentNode) => {
    setEditingNodeId(node.id);
    setFormPartId(node.partId);
    setFormPartCode(node.partCode);
    setFormPartName(node.partName);
    setFormQty(node.quantity);
    setFormUnit(node.unit);
    setFormNotes(node.notes || '');
    setIsModalOpen(true);
  };

  // Helper to recursively add or edit a node in tree
  const updateTreeNodes = (
    nodes: SubComponentNode[],
    editingId: string | null,
    targetParentId: string | null,
    newNode: SubComponentNode
  ): SubComponentNode[] => {
    if (editingId) {
      return nodes.map(n => {
        if (n.id === editingId) {
          return { ...n, ...newNode, subComponents: n.subComponents };
        }
        if (n.subComponents && n.subComponents.length > 0) {
          return {
            ...n,
            subComponents: updateTreeNodes(n.subComponents, editingId, targetParentId, newNode),
          };
        }
        return n;
      });
    } else {
      if (!targetParentId) {
        return [...nodes, newNode];
      }
      return nodes.map(n => {
        if (n.id === targetParentId) {
          const subs = n.subComponents || [];
          return { ...n, subComponents: [...subs, newNode] };
        }
        if (n.subComponents && n.subComponents.length > 0) {
          return {
            ...n,
            subComponents: updateTreeNodes(n.subComponents, editingId, targetParentId, newNode),
          };
        }
        return n;
      });
    }
  };

  // Helper to recursively delete a node from tree
  const deleteTreeNode = (nodes: SubComponentNode[], deleteId: string): SubComponentNode[] => {
    return nodes
      .filter(n => n.id !== deleteId)
      .map(n => {
        if (n.subComponents && n.subComponents.length > 0) {
          return { ...n, subComponents: deleteTreeNode(n.subComponents, deleteId) };
        }
        return n;
      });
  };

  const handleSaveSubComponent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStructure) return;

    const newNode: SubComponentNode = {
      id: editingNodeId || `NODE-${Date.now()}`,
      partId: formPartId || formPartCode,
      partCode: formPartCode,
      partName: formPartName || 'قطعه زیرمجموعه',
      quantity: Number(formQty) || 1,
      unit: formUnit,
      notes: formNotes,
      subComponents: [],
    };

    const updatedSubComponents = updateTreeNodes(
      activeStructure.subComponents,
      editingNodeId,
      targetParentNodeId,
      newNode
    );

    const updatedStructures = structures.map(s => {
      if (s.id === activeStructure.id) {
        return { ...s, subComponents: updatedSubComponents };
      }
      return s;
    });

    persistStructures(
      updatedStructures,
      editingNodeId
        ? `تغییرات جزء «${newNode.partName}» با موفقیت ذخیره و در MRP همگام‌سازی شد.`
        : `جزء جدید «${newNode.partName}» به ساختار درختی افزوده و ذخیره دائمی شد.`
    );
    if (targetParentNodeId) {
      setExpandedNodes(prev => ({ ...prev, [targetParentNodeId]: true }));
    }
    setIsModalOpen(false);
  };

  const handleDeleteNode = (nodeId: string) => {
    if (!activeStructure) return;
    if (!confirm('آیا از حذف این زیرمجموعه و تمام اجزای وابسته به آن اطمینان دارید؟')) return;

    const updatedSubComponents = deleteTreeNode(activeStructure.subComponents, nodeId);
    const updatedStructures = structures.map(s => {
      if (s.id === activeStructure.id) {
        return { ...s, subComponents: updatedSubComponents };
      }
      return s;
    });

    persistStructures(updatedStructures, 'زیرمجموعه انتخابی حذف شد و ساختار درختی بروزرسانی گردید.');
  };

  const handleCreateNewAssembly = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRootPartId) return;

    const foundPart = parts.find(p => p.id === newRootPartId || p.code === newRootPartId);
    const newStruct: ProductStructureData = {
      id: `PS-${Date.now()}`,
      rootPartId: foundPart ? foundPart.id : newRootPartId,
      rootPartCode: foundPart ? foundPart.code : newRootPartId,
      rootPartName: foundPart ? foundPart.name : newRootPartId,
      carModel: newCarModel || 'مشترک',
      notes: newAssemblyNotes,
      subComponents: [],
    };

    const nextStructures = [...structures, newStruct];
    persistStructures(
      nextStructures,
      `ساختار محصول جدید برای «${newStruct.rootPartName}» ایجاد و در پایگاه داده ذخیره شد.`
    );
    setSelectedStructureId(newStruct.id);
    setIsNewAssemblyModalOpen(false);
    setNewRootPartId('');
    setNewAssemblyNotes('');
  };

  // Recursive Tree Row Renderer Component (Clean Tabular Hierarchy)
  const renderTreeNode = (node: SubComponentNode, depth: number = 1): React.ReactNode => {
    const hasChildren = node.subComponents && node.subComponents.length > 0;
    const isExpanded = expandedNodes[node.id] ?? true;

    return (
      <React.Fragment key={node.id}>
        <tr className="hover:bg-[#f5f5f5] transition-colors">
          <td className="py-2 px-3">
            <div
              className="flex items-center gap-2"
              style={{ paddingRight: `${(depth - 1) * 20}px` }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggleExpand(node.id)}
                  className="w-5 h-5 rounded-sm border border-[#d9d9d9] bg-[#ffffff] flex items-center justify-center text-[#666666] hover:text-[#333333] cursor-pointer shrink-0"
                >
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              ) : (
                <span className="w-5 h-5 flex items-center justify-center text-[#bfbfbf] shrink-0">
                  └
                </span>
              )}
              <span className="font-semibold text-xs text-[#333333]">{node.partName}</span>
            </div>
          </td>
          <td className="py-2 px-3 font-mono text-xs whitespace-nowrap">
            <button
              type="button"
              onClick={() => traceDocument(node.partCode, 'INVENTORY_LEDGER')}
              className="sap-doc-link font-mono"
              title="رهگیری موجودی و کاردکس قطعه"
            >
              {node.partCode}
            </button>
          </td>
          <td className="py-2 px-3 whitespace-nowrap">
            <span
              className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-sm border ${
                depth === 1
                  ? 'bg-[#e5f3fa] text-[#007cc0] border-[#b3ddf2]'
                  : 'bg-[#f5f5f5] text-[#666666] border-[#d9d9d9]'
              }`}
            >
              سطح {toPersianDigits(depth)}
            </span>
          </td>
          <td className="py-2 px-3 font-mono font-bold text-xs text-[#333333] tabular-nums whitespace-nowrap">
            {toPersianDigits(node.quantity)}{' '}
            <span className="text-[11px] font-sans font-normal text-[#666666]">{node.unit}</span>
          </td>
          <td className="py-2 px-3 text-[11px] text-[#666666]">
            {node.notes || '—'}
          </td>
          <td className="py-2 px-3 text-left whitespace-nowrap">
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleOpenAddSubComponent(node.id)}
                className="sap-btn-standard px-2 py-0.5 text-[11px] inline-flex items-center gap-1"
                title="افزودن جزء فرعی زیر این ردیف"
              >
                <Plus className="w-3 h-3" />
                <span>زیرجزء</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenEditSubComponent(node)}
                className="p-1 text-[#666666] hover:text-[#007cc0] hover:bg-[#e5f3fa] rounded-sm transition cursor-pointer"
                title="ویرایش"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleDeleteNode(node.id)}
                className="p-1 text-[#666666] hover:text-[#bb0000] hover:bg-[#ffecec] rounded-sm transition cursor-pointer"
                title="حذف"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </td>
        </tr>
        {hasChildren &&
          isExpanded &&
          node.subComponents!.map(sub => renderTreeNode(sub, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-3.5 text-right font-sans">
      {saveMessage && (
        <div className="bg-[#ebf5ec] border border-[#b7dfbf] text-[#107e3e] rounded-sm px-4 py-2 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#107e3e] shrink-0" />
            <span>{saveMessage}</span>
          </div>
          <span className="text-[10px] font-mono bg-[#ffffff] text-[#107e3e] border border-[#b7dfbf] px-2 py-0.5 rounded-sm">
            همگام با MRP
          </span>
        </div>
      )}

      {/* SAP Fiori Dynamic Header & Structure Selector */}
      <div className="sap-card p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-[#007cc0]" />
            <h3 className="text-sm font-semibold text-[#333333]">ساختار درختی محصول (SAP BOM چندسطحی)</h3>
          </div>
          <div className="h-4 w-px bg-[#d9d9d9] hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#666666]">محصول:</span>
            <select
              value={selectedStructureId}
              onChange={e => setSelectedStructureId(e.target.value)}
              className="bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-xs font-medium text-[#333333] focus:outline-none focus:border-[#007cc0] cursor-pointer"
            >
              {structures.map(s => (
                <option key={s.id} value={s.id}>
                  [{s.rootPartCode}] {s.rootPartName} ({s.carModel})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => handleOpenAddSubComponent(null)}
            className="sap-btn-standard px-3 py-1.5 flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>افزودن زیرمجموعه سطح ۱</span>
          </button>

          <button
            type="button"
            onClick={() => setIsNewAssemblyModalOpen(true)}
            className="sap-btn-standard px-3 py-1.5 flex items-center gap-1.5 text-xs cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>محصول جدید</span>
          </button>

          <button
            type="button"
            disabled={isSyncing}
            onClick={() =>
              persistStructures(
                structures,
                'ساختار درختی محصول در سرور و ماژول برنامه‌ریزی تولید (MRP) ذخیره شد.'
              )
            }
            className="sap-btn-emphasized flex items-center gap-1.5 px-3.5 py-1.5 text-xs cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{isSyncing ? 'در حال ذخیره...' : 'ذخیره در MRP'}</span>
          </button>
        </div>
      </div>

      {/* SAP Fiori Hierarchical BOM Tree Table */}
      {activeStructure && (
        <div className="sap-card overflow-hidden">
          <div className="px-4 py-2.5 bg-[#f7f7f7] border-b border-[#d9d9d9] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => traceDocument(activeStructure.rootPartCode, 'INVENTORY_LEDGER')}
                className="sap-doc-link text-[11px] font-mono font-semibold bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] px-2 py-0.5 rounded-sm"
                title="رهگیری محصول در انبار و کاردکس"
              >
                {activeStructure.rootPartCode}
              </button>
              <span className="text-xs font-semibold text-[#333333]">
                {activeStructure.rootPartName}
              </span>
              <span className="text-[11px] text-[#666666]">
                ({activeStructure.carModel})
              </span>
              {activeStructure.notes && (
                <span className="text-[11px] text-[#666666]">— {activeStructure.notes}</span>
              )}
            </div>
            <span className="text-[11px] text-[#666666] tabular-nums">
              زیرمجموعه‌های سطح اول:{' '}
              <strong className="font-mono text-[#007cc0]">
                {toPersianDigits(activeStructure.subComponents.length)}
              </strong>{' '}
              ردیف
            </span>
          </div>

          {activeStructure.subComponents.length === 0 ? (
            <div className="p-8 text-center text-[#666666] text-xs">
              هنوز هیچ زیرمجموعه‌ای برای این ساختار محصول تعریف نشده است. از دکمه «افزودن زیرمجموعه سطح ۱» استفاده کنید.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="sap-table-compact w-full text-right text-xs">
                <thead className="bg-[#f5f5f5] border-b border-[#d9d9d9] text-[#666666] font-semibold">
                  <tr>
                    <th>نام قطعه / زیرمجموعه (ساختار درختی)</th>
                    <th className="whitespace-nowrap">کد فنی</th>
                    <th className="whitespace-nowrap">سطح</th>
                    <th className="whitespace-nowrap">ضریب مصرف</th>
                    <th>توضیحات فرآیند</th>
                    <th className="text-left whitespace-nowrap">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e8e8]">
                  {activeStructure.subComponents.map(node => renderTreeNode(node, 1))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal 1: Add / Edit Recursive SubComponent */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#333333]/40 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-[#d9d9d9] rounded-sm max-w-lg w-full p-5 shadow-md space-y-3.5 text-right">
            <div className="flex items-center justify-between pb-3 border-b border-[#e8e8e8]">
              <h4 className="font-bold text-sm text-[#333333] flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-[#007cc0]" />
                <span>
                  {editingNodeId
                    ? 'ویرایش جزء متشکله'
                    : targetParentNodeId
                    ? 'افزودن زیرجزء فرعی بازگشتی'
                    : 'افزودن زیرمجموعه سطح ۱'}
                </span>
              </h4>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-[#666666] hover:text-[#333333] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSubComponent} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-[#333333] mb-1">
                  انتخاب قطعه یا ماده اولیه از کاتالوگ *
                </label>
                <SearchableSelect
                  value={formPartId}
                  onChange={val => {
                    setFormPartId(val);
                    const found = parts.find(p => p.id === val || p.code === val);
                    if (found) {
                      setFormPartCode(found.code);
                      setFormPartName(found.name);
                    }
                  }}
                  placeholder="جستجو و انتخاب قطعه یا ورق..."
                  searchPlaceholder="جستجوی کد یا نام قطعه..."
                  options={parts.map(p => ({
                    value: p.code,
                    label: p.name,
                    sublabel: `${p.code} • ${p.weightPerUnitKg || 0}kg`,
                    badge: p.category === 'RAW_MATERIAL' ? 'ماده اولیه' : p.category === 'WIP_PART' ? 'نیمه‌ساخته' : 'محصول',
                  }))}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#333333] mb-1">کد قطعه *</label>
                  <input
                    type="text"
                    required
                    value={formPartCode}
                    onChange={e => setFormPartCode(e.target.value)}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 font-mono text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#333333] mb-1">عنوان کامل قطعه *</label>
                  <input
                    type="text"
                    required
                    value={formPartName}
                    onChange={e => setFormPartName(e.target.value)}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-[#333333] focus:outline-none focus:border-[#007cc0] font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#333333] mb-1">ضریب مصرف (مقدار) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    min={0.001}
                    value={formQty}
                    onChange={e => setFormQty(Number(e.target.value))}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 font-mono font-bold text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#333333] mb-1">واحد سنجش</label>
                  <select
                    value={formUnit}
                    onChange={e => setFormUnit(e.target.value)}
                    className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-[#333333] focus:outline-none focus:border-[#007cc0] font-medium"
                  >
                    <option value="عدد">عدد</option>
                    <option value="کیلوگرم">کیلوگرم</option>
                    <option value="ست">ست</option>
                    <option value="متر">متر</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#333333] mb-1">توضیحات و فرآیند اتصال</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder="نکات جوشکاری، برش ورق، تلرانس ابعادی..."
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm p-2 text-[#333333] focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#e8e8e8]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="sap-btn-standard px-4 py-1.5 text-xs"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="sap-btn-emphasized px-5 py-1.5 text-xs"
                >
                  {editingNodeId ? 'ثبت تغییرات' : 'افزودن به ساختار درختی'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Create New Root Assembly Structure */}
      {isNewAssemblyModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#333333]/40 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-[#d9d9d9] rounded-sm max-w-lg w-full p-5 shadow-md space-y-3.5 text-right">
            <div className="flex items-center justify-between pb-3 border-b border-[#e8e8e8]">
              <h4 className="font-bold text-sm text-[#333333] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#007cc0]" />
                <span>تعریف ساختار درختی جدید برای محصول نهایی</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsNewAssemblyModalOpen(false)}
                className="text-[#666666] hover:text-[#333333] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNewAssembly} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-[#333333] mb-1">انتخاب محصول نهایی ریشه *</label>
                <SearchableSelect
                  value={newRootPartId}
                  onChange={val => setNewRootPartId(val)}
                  placeholder="انتخاب قطعه یا مجموعه نهایی..."
                  searchPlaceholder="جستجوی قطعه نهایی..."
                  options={parts.map(p => ({
                    value: p.code,
                    label: p.name,
                    sublabel: p.code,
                    badge: p.carModel || 'محصول',
                  }))}
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-[#333333] mb-1">مدل خودرو</label>
                <input
                  type="text"
                  value={newCarModel}
                  onChange={e => setNewCarModel(e.target.value)}
                  placeholder="پژو ۲۰۶، تارا، دنا"
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm px-3 py-1.5 text-[#333333] focus:outline-none focus:border-[#007cc0] font-medium"
                />
              </div>

              <div>
                <label className="block font-medium text-[#333333] mb-1">توضیحات کلی مجموعه</label>
                <textarea
                  rows={2}
                  value={newAssemblyNotes}
                  onChange={e => setNewAssemblyNotes(e.target.value)}
                  placeholder="توضیحات و الزامات تحویل به خودروساز..."
                  className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded-sm p-2 text-[#333333] focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#e8e8e8]">
                <button
                  type="button"
                  onClick={() => setIsNewAssemblyModalOpen(false)}
                  className="sap-btn-standard px-4 py-1.5 text-xs"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="sap-btn-emphasized px-5 py-1.5 text-xs"
                >
                  ایجاد ساختار محصول
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
