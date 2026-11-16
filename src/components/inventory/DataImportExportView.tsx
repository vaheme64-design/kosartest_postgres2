import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Info,
  Check,
  FileUp,
  Plus,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatNumber, toPersianDigits, exportToCsv } from '../../utils/formatters';

interface DataImportExportViewProps {
  currentUser: {
    uid: string;
    displayName: string;
  };
  initialTemplateType?: string;
  onSuccess?: () => void | Promise<void>;
}

const PART_COLUMN_ALIASES: Record<string, string[]> = {
  code: ['code', 'partCode', 'partNumber', 'part_code', 'part_number', 'کد کالا / قطعه', 'کد قطعه', 'کد کالا', 'کد کاتالوگ', 'کد کاتالوگ قطعه', 'شماره فنی', 'کد فنی'],
  name: ['name', 'partName', 'part_name', 'title', 'description', 'نام کالا / قطعه', 'نام قطعه', 'نام کالا', 'شرح قطعه', 'شرح کالا', 'عنوان فارسی قطعه', 'عنوان قطعه', 'عنوان کامل قطعه در خط تولید'],
  category: ['category', 'partCategory', 'type', 'دسته کالا', 'دسته‌بندی', 'دسته بندی', 'نوع کالا', 'نوع قطعه'],
  unit: ['unit', 'uom', 'unitCode', 'واحد سنجش', 'واحد اندازه‌گیری', 'واحد اندازه گیری', 'واحد پایه', 'واحد'],
  weightPerUnitKg: ['weightPerUnitKg', 'weightKg', 'unitWeight', 'وزن واحد (kg)', 'وزن واحد (کیلوگرم)', 'وزن واحد', 'وزن (kg)', 'وزن'],
  materialGrade: ['materialGrade', 'grade', 'گرید ورق', 'گرید فولاد', 'گرید ماده', 'جنس ورق', 'جنس', 'گرید'],
  thicknessMm: ['thicknessMm', 'thickness', 'ضخامت (mm)', 'ضخامت ورق (mm)', 'ضخامت ورق', 'ضخامت'],
  carModel: ['carModel', 'vehicle', 'مدل خودرو', 'خودرو', 'خانواده خودرو', 'پروژه'],
  sapcoCode: ['sapcoCode', 'oemCode', 'کد ساپکو / ایران‌خودرو', 'کد ساپکو', 'کد OEM', 'شماره ساپکو'],
  minStock: ['minStock', 'safetyStock', 'حداقل موجودی (نقطه سفارش)', 'حداقل موجودی اطمینان', 'حداقل موجودی', 'نقطه سفارش'],
  maxStock: ['maxStock', 'حداکثر موجودی', 'حداکثر ظرفیت'],
};

function normalizeUploadedRowKeys(rawRow: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = { ...rawRow };
  const rawEntries = Object.entries(rawRow || {}).map(([k, v]) => [
    k.trim().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ').replace(/\s+/g, ' '),
    v,
  ] as const);

  for (const [canonicalKey, aliases] of Object.entries(PART_COLUMN_ALIASES)) {
    if (normalized[canonicalKey] !== undefined && String(normalized[canonicalKey]).trim() !== '') continue;
    for (const alias of aliases) {
      const normAlias = alias.trim().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ').replace(/\s+/g, ' ').toLowerCase();
      const match = rawEntries.find(([rk]) => rk.toLowerCase() === normAlias);
      if (match && match[1] !== undefined && String(match[1]).trim() !== '') {
        normalized[canonicalKey] = match[1];
        break;
      }
    }
  }
  return normalized;
}

function detectBatchTypeFromRows(rows: Record<string, any>[], currentType: string): string {
  if (!rows || rows.length === 0) return currentType;
  const keys = Object.keys(rows[0] || {}).map(k =>
    k.trim().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ').replace(/\s+/g, ' ').toLowerCase()
  );
  const hasCoilCols = keys.some(k =>
    k.includes('پکینگ') || k.includes('کویل') || k.includes('coilpack') || k.includes('شماره ذوب')
  );
  const hasContractCols = keys.some(k =>
    k.includes('شماره قرارداد') || k.includes('سقف تخصیص') || k.includes('contractnumber')
  );
  const hasPartCols = keys.some(k =>
    k === 'کد قطعه' ||
    k === 'کد کالا / قطعه' ||
    k === 'کد کاتالوگ' ||
    k === 'نام قطعه' ||
    k === 'عنوان فارسی قطعه' ||
    k === 'شرح قطعه' ||
    k === 'دسته کالا' ||
    k === 'دسته بندی' ||
    k === 'partcode' ||
    k === 'partnumber' ||
    (k === 'code' && keys.includes('category'))
  );
  if (hasPartCols && !hasCoilCols && !hasContractCols) return 'PARTS';
  return currentType;
}

export const DataImportExportView: React.FC<DataImportExportViewProps> = ({
  currentUser,
  initialTemplateType = 'PARTS',
  onSuccess,
}) => {
  const [activeMode, setActiveMode] = useState<'IMPORT' | 'EXPORT'>('IMPORT');
  const [templateType, setTemplateType] = useState<string>(initialTemplateType);
  const [templateData, setTemplateData] = useState<any>(null);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCreatingMasterData, setIsCreatingMasterData] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Export mode state
  const [exportDataset, setExportDataset] = useState<'STOCK' | 'COILS' | 'CONTRACTS'>('COILS');
  const [exportFilterGrade, setExportFilterGrade] = useState<string>('ALL');
  const [exportPreviewList, setExportPreviewList] = useState<any[]>([]);
  const [exportLoading, setExportLoading] = useState(false);

  const fetchTemplate = async (type: string, preserveExistingPreview = false) => {
    try {
      const res = await fetch(`/api/inventory/import/templates/${type}`);
      const data = await res.json();
      if (data.success) {
        setTemplateData(data.data);
        if (!preserveExistingPreview && data.data.sampleRows) {
          setPreviewRows(data.data.sampleRows);
        }
      }
    } catch (err) {
      console.error('Error fetching template:', err);
    }
  };

  useEffect(() => {
    fetchTemplate(templateType);
    setValidationResult(null);
  }, [templateType]);

  // Load live data for Export Center
  useEffect(() => {
    if (activeMode !== 'EXPORT') return;
    setExportLoading(true);
    const endpoint =
      exportDataset === 'COILS'
        ? '/api/inventory/coils'
        : exportDataset === 'CONTRACTS'
        ? '/api/inventory/contracts'
        : '/api/inventory/stock-inquiry';

    fetch(endpoint)
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          setExportPreviewList(res.data || []);
        }
      })
      .catch(() => {})
      .finally(() => setExportLoading(false));
  }, [activeMode, exportDataset]);

  const applyUploadedRows = async (rawParsed: any[], fileNameLabel: string) => {
    const normalizedRows = rawParsed.map(r => normalizeUploadedRowKeys(r));
    const detectedType = detectBatchTypeFromRows(normalizedRows, templateType);
    if (detectedType !== templateType) {
      setTemplateType(detectedType);
      await fetchTemplate(detectedType, true);
    }
    setPreviewRows(normalizedRows);
    setValidationResult(null);
    setNotification({
      type: 'success',
      message: `تعداد ${toPersianDigits(normalizedRows.length)} ردیف از فایل «${fileNameLabel}» خوانده شد. اکنون دکمه «بررسی و اعتبارسنجی ردیف‌ها» را بزنید.`,
    });
  };

  // Parse uploaded Excel (.xlsx, .xls) or CSV file into previewRows using sheetjs
  const handleExcelFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !templateData) return;

    const fileName = file.name.toLowerCase();
    const reader = new FileReader();

    if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
      reader.onload = async evt => {
        try {
          const text = String(evt.target?.result || '').replace(/^\uFEFF/, '');
          const workbook = XLSX.read(text, { type: 'string' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const parsed = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Record<string, any>[];

          if (!parsed || parsed.length === 0) {
            setNotification({
              type: 'error',
              message: 'فایل انتخاب‌شده فاقد ردیف داده است. لطفاً فایل معتبری انتخاب کنید.',
            });
            return;
          }

          await applyUploadedRows(parsed, file.name);
        } catch (err) {
          setNotification({ type: 'error', message: 'خطا در خواندن فایل CSV. لطفاً ساختار فایل را بررسی فرمایید.' });
        }
      };
      reader.readAsText(file, 'utf-8');
    } else {
      reader.onload = async evt => {
        try {
          const data = new Uint8Array(evt.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const parsed = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Record<string, any>[];

          if (!parsed || parsed.length === 0) {
            setNotification({
              type: 'error',
              message: 'فایل اکسل انتخاب‌شده خالی است یا برگه اول آن فاقد ردیف داده است.',
            });
            return;
          }

          await applyUploadedRows(parsed, file.name);
        } catch (err) {
          setNotification({ type: 'error', message: 'خطا در خواندن فایل اکسل. فایل ممکن است آسیب‌دیده یا رمزگذاری‌شده باشد.' });
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const safeParseResponse = async (res: Response): Promise<any> => {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await res.json();
    }
    const text = await res.text();
    if (res.status === 413) {
      throw new Error('حجم فایل انتخاب‌شده بیش از حد مجاز سرور است (خطای ۴۱۳). لطفاً فایل را در بخش‌های کوچکتری وارد نمایید.');
    }
    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      throw new Error(`خطای پاسخ سرور (${res.status}). لطفاً دوباره تلاش نمایید.`);
    }
    throw new Error(text || `خطای سرور (${res.status})`);
  };

  const handleValidate = async () => {
    setIsValidating(true);
    setValidationResult(null);
    try {
      const normalizedRows = previewRows.map(r => normalizeUploadedRowKeys(r));
      const res = await fetch('/api/inventory/import/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchType: templateType,
          rows: normalizedRows,
        }),
      });

      const data = await safeParseResponse(res);
      if (!res.ok || !data.success) {
        setNotification({ type: 'error', message: data.error || 'خطا در بررسی اطلاعات' });
      } else {
        setValidationResult(data);
        if (data.invalidRowsCount === 0 && !data.missingMasterData?.hasMissingMasterData) {
          setNotification({
            type: 'success',
            message: 'همه ردیف‌ها معتبر هستند و اطلاعات پایه کامل است. می‌توانید دکمه «تایید و ثبت نهایی» را بزنید.',
          });
        } else if (data.missingMasterData?.hasMissingMasterData) {
          setNotification({
            type: 'error',
            message: 'اطلاعات پایه جدید (واحد، انبار، کالا، یا مشتری) در فایل شناسایی شد. جهت افزودن سریع دکمه «افزودن خودکار به اطلاعات پایه» را بزنید.',
          });
        } else {
          setNotification({
            type: 'error',
            message: `در ${toPersianDigits(data.invalidRowsCount)} ردیف خطا مشاهده شد. لطفاً جدول خطاها در پایین را بررسی کنید.`,
          });
        }
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'خطا در ارتباط با سرور' });
    } finally {
      setIsValidating(false);
    }
  };

  const handleCreateMissingMasterData = async () => {
    if (!validationResult?.missingMasterData) return;
    setIsCreatingMasterData(true);
    try {
      const res = await fetch('/api/inventory/import/create-missing-master-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validationResult.missingMasterData),
      });

      const data = await safeParseResponse(res);
      if (!res.ok || !data.success) {
        setNotification({ type: 'error', message: data.error || 'خطا در ثبت اطلاعات پایه' });
      } else {
        setNotification({
          type: 'success',
          message: `${data.message || 'اطلاعات پایه جدید با موفقیت در دیتابیس اصلی ثبت شدند.'} اکنون جهت ثبت نهایی ردیف‌ها، دکمه «تایید و ثبت نهایی در نرم‌افزار» را کلیک کنید.`,
        });
        if (onSuccess) await onSuccess();
        // Automatically re-validate so previewRows validation passes 100%
        await handleValidate();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'خطای شبکه' });
    } finally {
      setIsCreatingMasterData(false);
    }
  };

  const handleConfirmImport = async () => {
    if (previewRows.length === 0) return;
    setIsConfirming(true);
    try {
      const normalizedRows = previewRows.map(r => normalizeUploadedRowKeys(r));
      const res = await fetch('/api/inventory/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: `BATCH-${Date.now()}`,
          batchType: templateType,
          rows: normalizedRows,
          user: currentUser,
        }),
      });

      const data = await safeParseResponse(res);
      if (!res.ok || !data.success) {
        setNotification({ type: 'error', message: data.error || 'خطا در ثبت اطلاعات در پایگاه داده' });
      } else {
        setNotification({
          type: 'success',
          message: `${data.message || 'اطلاعات با موفقیت در دیتابیس اصلی PostgreSQL ثبت شد.'} هم‌اکنون کلیه قطعات و ردیف‌ها در کاتالوگ اصلی قطعات و استعلام موجودی قابل مشاهده می‌باشند.`,
        });
        setValidationResult(null);
        if (onSuccess) await onSuccess();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'خطای شبکه' });
    } finally {
      setIsConfirming(false);
    }
  };

  const handleDownloadSampleCsv = () => {
    if (!templateData) return;
    const cols = templateData.columns || [];
    const headers = cols.map((c: any) => c.titlePersian || c.label || c.key).join(',');
    const sampleRows = (templateData.sampleRows || []).map((row: any) =>
      cols.map((c: any) => `"${row[c.key] ?? ''}"`).join(',')
    );
    const csvContent = '\uFEFF' + [headers, ...sampleRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `قالب_ورود_${templateType}.csv`;
    a.click();
  };

  const handleExecuteExport = () => {
    if (exportDataset === 'COILS') {
      const rows = exportPreviewList
        .filter(c => exportFilterGrade === 'ALL' || c.materialGrade === exportFilterGrade)
        .map(c => [
          c.coilId,
          c.coilPackNumber,
          c.partName || 'ورق فولادی',
          c.materialGrade,
          c.thicknessMm,
          c.widthMm,
          c.originalWeightKg,
          c.remainingWeightKg,
          c.ownership === 'SAPCO_SUPPLIER_OWNED' ? 'امانی ساپکو' : 'ملکی کارخانه',
          (c.allocations || []).map((a: any) => `${a.contractNumber || a.contractId}:${a.allocatedWeightKg}kg`).join(' | ') || 'آزاد',
        ]);
      exportToCsv(
        `گزارش_رول_و_کویل_پک_${Date.now()}`,
        [
          'کد رول فیزیکی',
          'شماره کویل‌پک',
          'نام کالا',
          'جنس / گرید ورق',
          'ضخامت (mm)',
          'عرض (mm)',
          'وزن اولیه (kg)',
          'وزن باقی‌مانده (kg)',
          'نوع مالکیت',
          'قراردادهای متصل',
        ],
        rows
      );
    } else if (exportDataset === 'CONTRACTS') {
      const rows = exportPreviewList.map(c => [
        c.contractNumber,
        c.title,
        c.customerName || 'ساپکو',
        c.materialGrade,
        c.allocatedWeightKg,
        c.totalReceivedKg,
        c.totalConsumedKg,
        c.closingBalanceKg,
        c.status,
      ]);
      exportToCsv(
        `گزارش_قراردادها_${Date.now()}`,
        [
          'شماره قرارداد',
          'عنوان قرارداد',
          'نام مشتری / کارفرما',
          'گرید ورق',
          'سقف سهمیه (kg)',
          'ورودی کل (kg)',
          'مصرف‌شده (kg)',
          'مانده تعهد (kg)',
          'وضعیت',
        ],
        rows
      );
    } else {
      const rows = exportPreviewList.map(b => [
        b.partCode,
        b.partName,
        b.warehouseName,
        b.lotNumber || '—',
        b.contractNumber || '—',
        b.physicalQty,
        b.availableQty,
        b.unit,
        b.physicalKg,
      ]);
      exportToCsv(
        `گزارش_موجودی_انبار_${Date.now()}`,
        ['کد کالا', 'نام کالا', 'انبار', 'کویل‌پک / بچ', 'قرارداد', 'موجودی فیزیکی', 'موجودی آزاد', 'واحد', 'وزن کل (kg)'],
        rows
      );
    }
  };

  return (
    <div className="space-y-4 text-right" dir="rtl">
      {/* Header & Mode Switcher */}
      <div className="sap-card p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-[#333333] flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#107e3e]" />
            <span>مرکز ورود اطلاعات از اکسل (.xlsx / .csv) و دریافت خروجی‌های کارخانه‌ای</span>
          </h2>
          <p className="text-xs text-[#666666] mt-1">
            ورود گروهی رول‌ها، کالاها (ورق، پیچ و مهره، لاستیک)، انبارها و قراردادها همراه با پشتیبانی مستقیم از فایل‌های اکسل Excel
          </p>
        </div>

        <div className="flex items-center gap-1 bg-[#f5f5f5] p-1 rounded-sm border border-[#d9d9d9]">
          <button
            type="button"
            onClick={() => setActiveMode('IMPORT')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors cursor-pointer ${
              activeMode === 'IMPORT' ? 'bg-[#007cc0] text-white' : 'text-[#333333] hover:bg-[#e5f3fa]'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>۱. ورود اطلاعات از اکسل (Import)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('EXPORT')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors cursor-pointer ${
              activeMode === 'EXPORT' ? 'bg-[#007cc0] text-white' : 'text-[#333333] hover:bg-[#e5f3fa]'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>۲. خروجی اکسل و گزارشات (Export)</span>
          </button>
        </div>
      </div>

      {notification && (
        <div
          className={`p-3 rounded-sm border flex items-center justify-between text-xs ${
            notification.type === 'success'
              ? 'bg-[#ebf7ef] border-[#a9dfbf] text-[#107e3e]'
              : 'bg-[#ffecec] border-[#f5b7b1] text-[#bb0000]'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-xs opacity-70 hover:opacity-100 cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {activeMode === 'IMPORT' ? (
        <div className="space-y-4">
          {/* Step 1 & 2: Choose Type & Download Template */}
          <div className="sap-card p-4 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e8e8e8] pb-3">
              <div>
                <h3 className="text-xs font-bold text-[#333333]">
                  گام اول: نوع اطلاعاتی که می‌خواهید وارد کنید را انتخاب نمایید
                </h3>
                <p className="text-[11px] text-[#666666] mt-0.5">
                  پس از انتخاب نوع اطلاعات، فایل نمونه اکسل را دانلود کرده و طبق راهنمای ستون‌ها تکمیل کنید.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadSampleCsv}
                className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs shrink-0"
              >
                <Download className="w-3.5 h-3.5 text-[#107e3e]" />
                <span>دانلود فایل نمونه اکسل (CSV/Excel)</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
              {[
                { id: 'PHYSICAL_COILS', label: 'رول‌های ورق و کویل‌پک' },
                { id: 'CONTRACTS', label: 'قراردادها و سهمیه‌ها' },
                { id: 'PARTS', label: 'کالاها (ورق، پیچ، لاستیک)' },
                { id: 'WAREHOUSES', label: 'انبارها' },
                { id: 'CUSTOMERS', label: 'مشتریان و خودروسازان' },
                { id: 'OPENING_BALANCES', label: 'موجودی اول دوره' },
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplateType(t.id)}
                  className={`p-2.5 rounded-sm border text-xs font-semibold transition-all cursor-pointer ${
                    templateType === t.id
                      ? 'bg-[#e5f3fa] text-[#007cc0] border-[#007cc0]'
                      : 'bg-[#f5f5f5] text-[#333333] border-[#d9d9d9] hover:bg-[#e8e8e8]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Step 3: Persian Column Guide Table */}
          {templateData && (
            <div className="sap-card p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[#333333]">
                <Info className="w-4 h-4 text-[#007cc0]" />
                <span>گام دوم: راهنمای ستون‌های فایل اکسل «{templateData.title}»</span>
              </div>

              <div className="overflow-x-auto rounded-sm border border-[#d9d9d9]">
                <table className="w-full text-right text-xs sap-table-compact">
                  <thead className="bg-[#ffffff] text-[#333333] border-b border-[#d9d9d9]">
                    <tr>
                      <th>عنوان ستون</th>
                      <th>نام لاتین ستون (کلید)</th>
                      <th>وضعیت الزامی</th>
                      <th>نمونه مقدار معتبر</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e8e8]">
                    {(templateData.columns || []).map((col: any) => (
                      <tr key={col.key} className="hover:bg-[#e5f3fa]">
                        <td className="font-bold text-[#333333]">{col.titlePersian || col.label || col.key}</td>
                        <td className="font-mono text-[#007cc0]">{col.key}</td>
                        <td>
                          {col.required ? (
                            <span className="text-[#bb0000] font-semibold">الزامی (*)</span>
                          ) : (
                            <span className="text-[#666666]">اختیاری</span>
                          )}
                        </td>
                        <td className="font-mono text-[#107e3e]">{String(col.example ?? '—')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 4 & 5: File Upload + Visual Table Preview */}
          <div className="sap-card p-4 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-[#333333]">
                  گام سوم: بارگذاری فایل اکسل (.xlsx / .csv) و پیش‌نمایش
                </h3>
                <p className="text-[11px] text-[#666666] mt-0.5">
                  فایل اکسل خود را انتخاب فرمایید. سیستم به صورت اتوماتیک ستون‌ها را اعتبارسنجی می‌کند.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs">
                  <FileUp className="w-4 h-4 text-[#107e3e]" />
                  <span>انتخاب فایل اکسل (.xlsx / .csv)</span>
                  <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={handleExcelFileUpload} className="hidden" />
                </label>

                <button
                  type="button"
                  onClick={handleValidate}
                  disabled={isValidating || previewRows.length === 0}
                  className="sap-btn-emphasized flex items-center gap-1.5 px-3.5 py-1.5 text-xs disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isValidating ? 'در حال اعتبارسنجی...' : 'بررسی و اعتبارسنجی ردیف‌ها'}</span>
                </button>
              </div>
            </div>

            {/* Visual Table Preview */}
            {previewRows.length > 0 && templateData && (
              <div className="overflow-x-auto rounded-sm border border-[#d9d9d9] max-h-80">
                <table className="w-full text-right text-xs sap-table-compact">
                  <thead className="bg-[#ffffff] text-[#333333] border-b border-[#d9d9d9] sticky top-0">
                    <tr>
                      <th className="w-12">ردیف</th>
                      {(templateData.columns || []).map((c: any) => (
                        <th key={c.key}>
                          {c.titlePersian || c.label || c.key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e8e8]">
                    {previewRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#e5f3fa]">
                        <td className="font-mono text-[#666666]">{toPersianDigits(idx + 1)}</td>
                        {(templateData.columns || []).map((c: any) => {
                          const val = row[c.key] ?? row[c.titlePersian] ?? row[c.label] ?? '';
                          return (
                            <td key={c.key} className="font-mono text-[#333333]">
                              <input
                                type="text"
                                value={val}
                                onChange={e => {
                                  const next = [...previewRows];
                                  next[idx] = { ...next[idx], [c.key]: e.target.value };
                                  setPreviewRows(next);
                                }}
                                className="w-full bg-transparent border-b border-transparent focus:border-[#007cc0] focus:bg-[#ffffff] px-1 py-0.5 rounded-sm focus:outline-none"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Step 6 & 7: Validation Results & Confirm Import */}
            {validationResult && (
              <div className="pt-3 border-t border-[#e8e8e8] space-y-3">
                {/* Missing Master Data Auto-Addition Prompt Section */}
                {validationResult.missingMasterData && validationResult.missingMasterData.hasMissingMasterData && (
                  <div className="bg-[#fff4e5] border border-[#f9d6a7] p-3.5 rounded-sm space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-5 h-5 text-[#e9730c] shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-xs font-bold text-[#333333]">
                            شناسایی اطلاعات پایه جدید (واحدهای سنجش، دسته‌بندی‌ها، انبارها، قطعات یا مشتریان غیرموجود)
                          </h4>
                          <p className="text-[11px] text-[#666666] mt-0.5">
                            در این فایل اکسل، مواردی یافت شد که هنوز در اطلاعات پایه نرم‌افزار ثبت نشده‌اند. نیازی به اصلاح فایل اکسل نیست؛ با کلیک دکمه زیر، این موارد خودکار به اطلاعات پایه افزوده شده و اعتبارسنجی تکمیل می‌شود.
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleCreateMissingMasterData}
                        disabled={isCreatingMasterData}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-[#e9730c] hover:bg-[#d06408] text-white rounded-sm text-xs font-bold transition-colors cursor-pointer shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                        <span>
                          {isCreatingMasterData
                            ? 'در حال افزودن اطلاعات پایه...'
                            : 'افزودن خودکار به اطلاعات پایه و تکمیل فایل'}
                        </span>
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2 border-t border-[#f9d6a7] text-[11px]">
                      {validationResult.missingMasterData.units?.map((u: any, idx: number) => (
                        <span key={`u-${idx}`} className="bg-[#ffffff] border border-[#f9d6a7] text-[#333333] px-2.5 py-1 rounded-sm flex items-center gap-1">
                          <span className="font-semibold text-[#e9730c]">واحد سنجش:</span> <span className="font-mono font-bold">{u.symbol}</span> ({toPersianDigits(u.count)} ردیف)
                        </span>
                      ))}
                      {validationResult.missingMasterData.categories?.map((c: any, idx: number) => (
                        <span key={`cat-${idx}`} className="bg-[#ffffff] border border-[#f9d6a7] text-[#333333] px-2.5 py-1 rounded-sm flex items-center gap-1">
                          <span className="font-semibold text-[#e9730c]">دسته کالا:</span> {c.name} ({toPersianDigits(c.count)} ردیف)
                        </span>
                      ))}
                      {validationResult.missingMasterData.parts?.map((p: any, idx: number) => (
                        <span key={`p-${idx}`} className="bg-[#ffffff] border border-[#f9d6a7] text-[#333333] px-2.5 py-1 rounded-sm flex items-center gap-1">
                          <span className="font-semibold text-[#e9730c]">کالا/ورق:</span> <span className="font-mono font-bold">{p.code}</span> ({p.name})
                        </span>
                      ))}
                      {validationResult.missingMasterData.warehouses?.map((w: any, idx: number) => (
                        <span key={`wh-${idx}`} className="bg-[#ffffff] border border-[#f9d6a7] text-[#333333] px-2.5 py-1 rounded-sm flex items-center gap-1">
                          <span className="font-semibold text-[#e9730c]">انبار:</span> <span className="font-mono font-bold">{w.code}</span> ({w.name})
                        </span>
                      ))}
                      {validationResult.missingMasterData.customers?.map((cust: any, idx: number) => (
                        <span key={`cust-${idx}`} className="bg-[#ffffff] border border-[#f9d6a7] text-[#333333] px-2.5 py-1 rounded-sm flex items-center gap-1">
                          <span className="font-semibold text-[#e9730c]">مشتری:</span> {cust.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 bg-[#f7f7f7] p-3 rounded-sm border border-[#d9d9d9]">
                  <div className="flex items-center gap-4 text-xs">
                    <span>
                      کل ردیف‌های خوانده‌شده: <strong className="font-mono">{formatNumber(validationResult.totalRows)}</strong>
                    </span>
                    <span className="text-[#107e3e] font-bold">
                      معتبر و قابل ثبت: <strong className="font-mono">{formatNumber(validationResult.validRowsCount)}</strong>
                    </span>
                    <span className="text-[#bb0000] font-bold">
                      دارای خطا: <strong className="font-mono">{formatNumber(validationResult.invalidRowsCount)}</strong>
                    </span>
                  </div>

                  {validationResult.validRowsCount > 0 && (
                    <button
                      type="button"
                      onClick={handleConfirmImport}
                      disabled={isConfirming}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#107e3e] hover:bg-[#0d6832] text-white rounded-sm text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>
                        {isConfirming
                          ? 'در حال ذخیره‌سازی در بانک اطلاعاتی...'
                          : `تایید و ثبت نهایی در نرم‌افزار (${toPersianDigits(validationResult.validRowsCount)} ردیف)`}
                      </span>
                    </button>
                  )}
                </div>

                {validationResult.invalidRowsCount > 0 && validationResult.errors && (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {validationResult.errors.map((err: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-2 bg-[#ffecec] border border-[#f5b7b1] rounded-sm text-xs text-[#bb0000] flex items-center justify-between"
                      >
                        <span className="font-bold">ردیف شماره {toPersianDigits(err.rowNumber)}:</span>
                        <span>{err.errorMessage}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* TAB 2: Export Builder */
        <div className="sap-card p-4 space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e8e8e8] pb-3">
            <div>
              <h3 className="font-bold text-[#333333] text-sm">دریافت خروجی اکسل (CSV / XLSX فارسی)</h3>
              <p className="text-[#666666] mt-0.5">
                گزارش مورد نظر خود را انتخاب کرده، پیش‌نمایش را مشاهده کنید و فایل اکسل را دانلود نمایید.
              </p>
            </div>

            <button
              type="button"
              onClick={handleExecuteExport}
              className="sap-btn-emphasized flex items-center gap-1.5 px-4 py-1.5"
            >
              <Download className="w-4 h-4" />
              <span>دانلود فایل اکسل (CSV)</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { id: 'COILS', title: 'لیست رول‌های ورق و کویل‌پک‌ها', desc: 'شامل کد کویل‌پک، ضخامت، جنس، وزن باقی‌مانده و قراردادها' },
              { id: 'STOCK', title: 'موجودی لحظه‌ای همه انبارها', desc: 'شامل ورق، پیچ و مهره، لاستیک و قطعات محصول نهایی' },
              { id: 'CONTRACTS', title: 'وضعیت قراردادها و تعهدات', desc: 'شامل سقف قرارداد، مقدار دریافتی، مصرفی و مانده' },
            ].map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setExportDataset(item.id as any)}
                className={`p-3.5 rounded-sm border text-right transition-all cursor-pointer ${
                  exportDataset === item.id
                    ? 'bg-[#e5f3fa] text-[#007cc0] border-[#007cc0]'
                    : 'bg-[#f5f5f5] text-[#333333] border-[#d9d9d9] hover:bg-[#e8e8e8]'
                }`}
              >
                <div className="font-bold">{item.title}</div>
                <div className={`text-[11px] mt-1 ${exportDataset === item.id ? 'text-[#006299]' : 'text-[#666666]'}`}>
                  {item.desc}
                </div>
              </button>
            ))}
          </div>

          <div className="pt-2 text-[#666666]">
            تعداد رکوردهای آماده خروجی: <strong className="text-[#333333] font-mono">{formatNumber(exportPreviewList.length)}</strong> ردیف
            {exportLoading && <span className="mr-2">(در حال بارگذاری...)</span>}
          </div>
        </div>
      )}
    </div>
  );
};
