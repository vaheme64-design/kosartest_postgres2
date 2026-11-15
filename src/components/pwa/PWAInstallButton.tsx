import React, { useState } from 'react';
import { Download, WifiOff, CheckCircle2 } from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const isOnline = useOnlineStatus();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  return (
    <>
      {!isOnline && (
        <span
          title="حالت آفلاین کارگاه فعال است — داده‌ها از حافظه محلی و سرویس‌ورکر خوانده می‌شوند"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#fff5eb] border border-[#f5d0a9] text-[#e9730c] text-[11px] font-semibold"
        >
          <WifiOff className="w-3.5 h-3.5 text-[#e9730c]" />
          <span>آفلاین (کارگاه)</span>
        </span>
      )}

      {!isInstalled && isInstallable && (
        <button
          type="button"
          onClick={install}
          className="sap-btn-standard inline-flex items-center gap-1.5 !py-1 text-xs"
          title="نصب اپلیکیشن کارگاه برای استفاده آفلاین"
        >
          <Download className="w-3.5 h-3.5 text-[#007cc0]" />
          <span className="hidden sm:inline">نصب نسخه آفلاین</span>
        </button>
      )}

      {!isInstalled && !isInstallable && isIOS && (
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="sap-btn-standard inline-flex items-center gap-1.5 !py-1 text-xs"
        >
          <Download className="w-3.5 h-3.5 text-[#007cc0]" />
          <span className="hidden sm:inline">نصب در iOS</span>
        </button>
      )}

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#333333]/40 backdrop-blur-[1px] p-4" dir="rtl">
          <div className="w-full max-w-sm rounded-md bg-white p-5 shadow-lg border border-[#d9d9d9] text-right space-y-3">
            <h3 className="text-sm font-bold text-[#333333]">نصب نسخه آفلاین کارگاه روی آیفون / آیپد</h3>
            <p className="text-xs text-[#666666] leading-relaxed">
              ۱. دکمه <strong>Share</strong> در نوار پایین مرورگر Safari را لمس کنید.
              <br />
              ۲. گزینه <strong>Add to Home Screen</strong> را انتخاب نمایید تا برنامه در حالت آفلاین کارگاه نصب شود.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="sap-btn-emphasized w-full text-xs"
            >
              متوجه شدم
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC<{ pendingSyncCount?: number }> = ({
  pendingSyncCount = 0,
}) => {
  const isOnline = useOnlineStatus();

  if (isOnline && pendingSyncCount === 0) return null;

  return (
    <div className="fixed bottom-5 left-5 z-40 flex items-center gap-2 rounded-md bg-white border border-[#d9d9d9] px-3.5 py-2 text-xs font-medium text-[#333333] shadow-md">
      {!isOnline ? (
        <>
          <span className="h-2 w-2 rounded-full bg-[#e9730c] animate-pulse" />
          <WifiOff className="w-3.5 h-3.5 text-[#e9730c]" />
          <span>حالت آفلاین کارگاه فعال است — ثبت اسناد و تولید بدون اینترنت ادامه دارد</span>
        </>
      ) : (
        <>
          <CheckCircle2 className="w-3.5 h-3.5 text-[#107e3e]" />
          <span>آنلاین — همگام‌سازی خودکار داده‌های کارگاه انجام شد</span>
        </>
      )}
    </div>
  );
};
