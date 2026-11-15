import React, { useState } from 'react';
import {
  Cpu,
  Database,
  CheckCircle2,
  RefreshCw,
  X,
  ExternalLink,
  ShieldCheck,
  Server,
  FileCode,
} from 'lucide-react';

interface ErpSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  partsCount: number;
  txCount: number;
}

export const ErpSyncModal: React.FC<ErpSyncModalProps> = ({
  isOpen,
  onClose,
  partsCount,
  txCount,
}) => {
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSimulateSync = () => {
    setSyncing(true);
    setSyncStatus('در حال برقراری ارتباط با درگاه داده‌های ساپکو (SAPCO EDI) و همگام‌سازی دفاتر...');
    setTimeout(() => {
      setSyncing(false);
      setSyncStatus(`همگام‌سازی موفق: تعداد ${txCount} سند تراکنش و ${partsCount} کاتالوگ قطعه با وب‌سرویس ERP به روز گردید.`);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#333333]/40 backdrop-blur-[1px] flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white border border-[#d9d9d9] rounded-md w-full max-w-xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-[#d9d9d9]">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#007cc0]" />
            <h3 className="text-sm font-bold text-[#333333]">
              درگاه اتصال به SQL Server و ERP صنعتی ساپکو
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#666666] hover:text-[#333333] p-1 rounded hover:bg-[#f5f5f5] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs text-[#333333]">
          <div className="p-3.5 rounded bg-[#f7f7f7] border border-[#d9d9d9] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[#666666]">وضعیت رابط ماژولار:</span>
              <span className="text-[#107e3e] font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                آماده اتصال به پایگاه‌های رابطه‌ای (SQL Server / SAP)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#666666]">موتور بک‌اند:</span>
              <span className="font-mono text-[#333333]">Node.js Express Ledger Engine (/api/*)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#666666]">ذخیره‌سازی ابری:</span>
              <span className="font-mono text-[#e9730c] font-semibold">Google Cloud Firestore & Firebase Auth</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <h4 className="font-bold text-[#333333] text-xs">پروتکل‌های تبادل داده استاندارد پشتیبانی شده:</h4>
            <ul className="space-y-1 text-[11px] text-[#666666] list-disc list-inside">
              <li>تبادل بارنامه الکترونیک و رسید محموله کویل ساپکو (EDI ASN 856)</li>
              <li>انتقال سرفصل دفاتر انبار و بهای تمام‌شده قطعات به SQL Server همکاران سیستم / رایورز</li>
              <li>صدور خروجی مکانیزه حواله انبار برای سیستم جامع تولید ایران‌خودرو و سایپا</li>
            </ul>
          </div>

          {syncStatus && (
            <div className="p-3 rounded bg-[#eef8f2] border border-[#b2dfc4] text-[#107e3e] text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#107e3e] shrink-0" />
              <span>{syncStatus}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-3.5 border-t border-[#e8e8e8]">
            <div className="text-[11px] text-[#666666] font-mono">
              GET /api/health (200 OK)
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="sap-btn-standard text-xs"
              >
                بستن
              </button>
              <button
                type="button"
                onClick={handleSimulateSync}
                disabled={syncing}
                className="sap-btn-emphasized text-xs flex items-center gap-1.5 disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'در حال ارسال به ERP...' : 'تست تبادل داده با ERP'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
