import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Factory,
  Database,
  Trash2,
  RefreshCw,
  Search,
  Bell,
  BellRing,
  UserCheck,
  ArrowLeft,
  Compass,
  Zap,
  Boxes,
  Palette,
  Grid,
  LogOut,
  LayoutDashboard,
  ScrollText,
  Hammer,
  GitCommit,
  CalendarDays,
  Cpu,
  Layers,
  FileSpreadsheet,
  Settings,
  Sparkles,
  Plus,
  Disc,
} from 'lucide-react';
import { Part, UserRoleProfile } from '../types/inventory';
import { GlobalSearchPaletteModal } from './common/GlobalSearchPaletteModal';
import {
  ErpLayoutTemplate,
  ErpColorTheme,
  COLOR_THEMES,
} from '../types/theme';
import { formatToJalali } from '../utils/jalali';
import { toPersianDigits } from '../utils/formatters';
import { TabKey } from './Sidebar';
import { InventorySubTab } from './inventory/InventoryModuleView';
import { PWAInstallButton } from './pwa/PWAInstallButton';

interface NavbarProps {
  activeTab: TabKey;
  layoutTemplate: ErpLayoutTemplate;
  colorTheme: ErpColorTheme;
  currentUser: UserRoleProfile;
  parts?: Part[];
  coilsCount?: number;
  reorderAlertsCount?: number;
  criticalAlertsCount?: number;
  onRoleChange: (role: UserRoleProfile['role']) => void;
  onNavigate?: (
    tab: TabKey,
    subTab?: InventorySubTab,
    actionModal?: 'RECEIPT' | 'ISSUE' | 'RETURN' | 'TRANSFER'
  ) => void;
  onOpenTemplateModal: () => void;
  onQuickTemplateChange: (tpl: ErpLayoutTemplate) => void;
  onOpenAiAssistant?: () => void;
  onSeedDemo: () => Promise<void>;
  onCleanDemo: () => Promise<void>;
  onOpenErpModal: () => void;
  loading: boolean;
}

interface SearchableModuleItem {
  label: string;
  category: string;
  keywords: string;
  tab: TabKey;
  subTab?: InventorySubTab;
}

const TAB_TITLES: Record<TabKey, string> = {
  dashboard: 'داشبورد مدیریتی و خلاصه وضعیت',
  master_data: 'اطلاعات پایه',
  contracts: 'قراردادها و سفارشات (Sales & Contracts)',
  inventory: 'انبار و موجودی',
  production: 'ثبت روزانه تولید و ضایعات',
  wip: 'قطعات در جریان ساخت (WIP)',
  planning: 'برنامه‌ریزی تولید و نیازسنجی (MRP)',
  machines: 'ماشین‌آلات و ظرفیت',
  sapco: 'مواد امانی SAPCO',
  reports: 'گزارش‌های مدیریتی و OEE',
  settings: 'کاربران و تنظیمات',
};

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  layoutTemplate,
  colorTheme,
  currentUser,
  parts = [],
  coilsCount = 0,
  reorderAlertsCount = 0,
  criticalAlertsCount = 0,
  onRoleChange,
  onNavigate,
  onOpenTemplateModal,
  onQuickTemplateChange,
  onOpenAiAssistant,
  onSeedDemo,
  onCleanDemo,
  onOpenErpModal,
  loading,
}) => {
  const [showConfirmClean, setShowConfirmClean] = useState(false);
  const [dbStatus, setDbStatus] = useState<{ isConnected: boolean; isConfigured: boolean } | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAppMatrix, setShowAppMatrix] = useState(false);
  const [isSearchPaletteOpen, setIsSearchPaletteOpen] = useState(false);
  const [showQuickCreateMenu, setShowQuickCreateMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const themeMeta = COLOR_THEMES[colorTheme];
  const isDarkHeader = false;

  useEffect(() => {
    fetch('/api/db/status')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setDbStatus(data.data);
        }
      })
      .catch(() => {
        setDbStatus({ isConnected: false, isConfigured: false });
      });
  }, []);

  // Support Ctrl+K / F3 / Ctrl+/ for global search and Ctrl+Space for AI assistant
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'k' || e.key === '/')) {
        e.preventDefault();
        setIsSearchPaletteOpen(true);
      }
      if (e.key === 'F3') {
        e.preventDefault();
        setIsSearchPaletteOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
        e.preventDefault();
        if (onOpenAiAssistant) onOpenAiAssistant();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenAiAssistant]);

  const roleLabels: Record<UserRoleProfile['role'], string> = {
    WAREHOUSE_KEEPER: 'مسئول انبار و کنترل موجودی',
    PRODUCTION_MANAGER: 'مدیر تولید و برنامه‌ریزی',
    LINE_SUPERVISOR: 'سرپرست سالن تولید و پرس',
    QC_INSPECTOR: 'بازرس کنترل کیفیت (QC)',
    ADMIN: 'مدیر سیستم (دسترسی کامل)',
  };

  const allModulesAndSubModules: SearchableModuleItem[] = [
    { label: 'داشبورد و خلاصه وضعیت روزانه', category: 'ماژول اصلی', keywords: 'داشبورد خانه میز کار خلاصه', tab: 'dashboard' },
    { label: 'اطلاعات پایه (قطعات، ورق، BOM، مسیر تولید، شیفت‌ها)', category: 'ماژول اصلی', keywords: 'اطلاعات پایه کالا قطعه ورق ضخامت جنس مسیر ساخت فرمول bom حداقل موجودی', tab: 'master_data' },
    { label: 'پیشخوان و مرکز فرماندهی انبار', category: 'زیرماژول انبار', keywords: 'انبار پیشخوان موجودی', tab: 'inventory', subTab: 'DASHBOARD' },
    { label: 'جستجو و استعلام موجودی انبار', category: 'زیرماژول انبار', keywords: 'استعلام موجودی فیلتر ضخامت جنس ورق', tab: 'inventory', subTab: 'INQUIRY' },
    { label: 'مدیریت رول‌های ورق و کویل‌پک', category: 'زیرماژول انبار', keywords: 'رول ورق کویل پک کلاف برش', tab: 'inventory', subTab: 'COILS' },
    { label: 'مدیریت قراردادها و سهمیه مواد', category: 'زیرماژول انبار', keywords: 'قرارداد ساپکو مشتری امانی سهمیه', tab: 'inventory', subTab: 'CONTRACTS' },
    { label: 'هشدارهای نقطه سفارش و کسری موجودی', category: 'زیرماژول انبار', keywords: 'هشدار کسری نقطه سفارش حداقل اطمینان شارژ reorder alert', tab: 'inventory', subTab: 'ALERTS' },
    { label: 'اسناد ورود و خروج انبار (کاردکس)', category: 'زیرماژول انبار', keywords: 'کاردکس اسناد گردش انبار ابطال', tab: 'inventory', subTab: 'MOVEMENT' },
    { label: 'ورود و خروج اکسل (CSV) با راهنما', category: 'زیرماژول انبار', keywords: 'اکسل ورود اطلاعات خروجی csv راهنما', tab: 'inventory', subTab: 'IMPORT_EXPORT' },
    { label: 'گزارش‌ساز سفارشی انبار', category: 'زیرماژول انبار', keywords: 'گزارش سفارشی شخصی سازی ستون کویل', tab: 'inventory', subTab: 'CUSTOM_REPORTS' },
    { label: 'برنامه‌ریزی تولید و نیازسنجی مواد (MRP)', category: 'ماژول برنامه‌ریزی', keywords: 'برنامه ریزی تولید mrp سفارشات مشتری تخصیص ماشین آلات', tab: 'planning' },
    { label: 'ثبت روزانه تولید، مصرف و ضایعات', category: 'ماژول تولید', keywords: 'ثبت تولید مصرف ضایعات آمار روزانه پرسکاری', tab: 'production' },
    { label: 'قطعات در جریان ساخت (WIP) و ایستگاه‌ها', category: 'ماژول تولید', keywords: 'wip کار در جریان ایستگاه دستور کار انتقال بین مراحل', tab: 'wip' },
    { label: 'ماشین‌آلات و ظرفیت (پرس‌ها و قالب‌ها)', category: 'اطلاعات پایه', keywords: 'ماشین آلات دستگاه پرس قالب سنبه ماتریس اپراتور سالن', tab: 'machines' },
    { label: 'مواد امانی SAPCO', category: 'ماژول امانی', keywords: 'مواد ساپکو امانی رول کویل', tab: 'sapco' },
    { label: 'گزارش‌های جامع مدیریتی و OEE', category: 'گزارش‌ها', keywords: 'گزارش مدیریتی بهای تمام شده راندمان oee ضایعات تحلیل', tab: 'reports' },
    { label: 'مدیریت کاربران و تنظیمات', category: 'تنظیمات', keywords: 'کاربران نقش دسترسی تنظیمات', tab: 'settings' },
  ];

  const appMatrixItems: {
    tab: TabKey;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
  }[] = [
    { tab: 'dashboard', label: 'داشبورد', icon: LayoutDashboard, color: 'bg-emerald-600' },
    { tab: 'master_data', label: 'اطلاعات پایه', icon: ScrollText, color: 'bg-blue-600' },
    { tab: 'inventory', label: 'انبار و موجودی', icon: Boxes, color: 'bg-teal-600' },
    { tab: 'production', label: 'تولید روزانه', icon: Hammer, color: 'bg-amber-600' },
    { tab: 'wip', label: 'کار در جریان (WIP)', icon: GitCommit, color: 'bg-purple-600' },
    { tab: 'planning', label: 'برنامه‌ریزی (MRP)', icon: CalendarDays, color: 'bg-indigo-600' },
    { tab: 'machines', label: 'ماشین‌آلات و ظرفیت', icon: Cpu, color: 'bg-cyan-600' },
    { tab: 'sapco', label: 'مواد SAPCO', icon: Layers, color: 'bg-rose-600' },
    { tab: 'reports', label: 'گزارش‌ها', icon: FileSpreadsheet, color: 'bg-slate-700' },
    { tab: 'settings', label: 'کاربران و تنظیمات', icon: Settings, color: 'bg-slate-800' },
  ];

  const quickActions = [
    { label: 'ثبت رسید کالا / ورود رول ورق جدید', tab: 'inventory' as TabKey, subTab: 'DASHBOARD' as InventorySubTab, modal: 'RECEIPT' as const },
    { label: 'صدور حواله خروج ورق و قطعه به خط تولید', tab: 'inventory' as TabKey, subTab: 'DASHBOARD' as InventorySubTab, modal: 'ISSUE' as const },
    { label: 'ثبت برگشت ورق / ته‌کلاف از خط تولید به انبار', tab: 'inventory' as TabKey, subTab: 'DASHBOARD' as InventorySubTab, modal: 'RETURN' as const },
    { label: 'انتقال کالا بین انبارهای کارخانه', tab: 'inventory' as TabKey, subTab: 'DASHBOARD' as InventorySubTab, modal: 'TRANSFER' as const },
  ];

  const searchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) {
      return {
        modules: allModulesAndSubModules.slice(0, 6),
        actions: quickActions,
        matchedParts: [],
      };
    }

    const modules = allModulesAndSubModules.filter(
      m =>
        m.label.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        m.keywords.toLowerCase().includes(q)
    );
    const actions = quickActions.filter(a => a.label.toLowerCase().includes(q));
    const matchedParts = parts
      .filter(
        p =>
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          (p.materialGrade && p.materialGrade.toLowerCase().includes(q))
      )
      .slice(0, 5);
    return { modules, actions, matchedParts };
  }, [globalSearch, parts]);

  const now = new Date();
  const timeStr = toPersianDigits(
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  );
  const jalaliNumeric = formatToJalali(now);

  return (
    <header className="bg-white/95 backdrop-blur-xs text-slate-800 border-b border-slate-200/60 sticky top-0 z-40 px-4 lg:px-6 py-2 transition-colors">
      <div className="flex flex-col lg:flex-row items-center justify-between gap-2.5">
        {/* RIGHT SIDE: App Matrix + Brand / Active Page Title */}
        <div className="flex items-center justify-between w-full lg:w-auto gap-2.5">
          <div className="flex items-center gap-2.5">
            {/* Minimal App Switcher */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAppMatrix(!showAppMatrix)}
                title="دسترسی سریع ماژول‌ها"
                className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-200/60 transition-colors cursor-pointer"
              >
                <Grid className="w-4 h-4" />
              </button>

              {showAppMatrix && (
                <div className="absolute right-0 top-full mt-2 w-76 bg-white text-slate-800 border border-slate-200/80 rounded-xl shadow-lg p-3.5 z-50">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2.5">
                    <span className="text-xs font-medium text-slate-700">
                      ماژول‌های سامانه
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAppMatrix(false)}
                      className="text-slate-400 hover:text-slate-700 text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {appMatrixItems.map(item => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.tab}
                          type="button"
                          onClick={() => {
                            if (onNavigate) onNavigate(item.tab);
                            setShowAppMatrix(false);
                          }}
                          className={`flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-slate-50 border transition-all cursor-pointer ${
                            activeTab === item.tab
                              ? 'border-slate-300 bg-slate-50/80'
                              : 'border-transparent'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                            <Icon className="w-4 h-4" />
                          </div>
                          <span className="text-[11px] font-medium text-slate-700 text-center leading-tight">
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200/70 flex items-center justify-center text-slate-700 shrink-0">
                <Factory className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-800">
                  {TAB_TITLES[activeTab]}
                </span>
                <span className="text-slate-200 hidden sm:inline">|</span>
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  سامانه تولید و موجودی کوثر
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER: Universal Global Search Bar */}
        <div className="relative w-full lg:max-w-sm flex items-center gap-2">
          <div
            onClick={() => setIsSearchPaletteOpen(true)}
            className="flex-1 relative flex items-center rounded-lg pr-8 pl-12 py-1.5 text-xs cursor-pointer transition-colors select-none bg-slate-50/80 hover:bg-slate-100/70 border border-slate-200/60 text-slate-500"
          >
            <Search className="w-3.5 h-3.5 absolute right-2.5 top-2 pointer-events-none text-slate-400" />
            <span className="truncate text-slate-400 text-[11px]">
              جستجوی قطعات، دستور کار، کویل و اسناد…
            </span>
            <kbd className="absolute left-2 top-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-400 bg-white border border-slate-200/60 pointer-events-none">
              Ctrl+K
            </kbd>
          </div>
        </div>

        {/* LEFT SIDE: Minimal Executive Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton />
          {reorderAlertsCount > 0 && (
            <button
              type="button"
              onClick={() => {
                if (onNavigate) onNavigate('inventory', 'ALERTS');
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer bg-amber-50/60 hover:bg-amber-50 text-amber-700 border-amber-200/60"
              title="مشاهده فهرست اقلام زیر نقطه سفارش"
            >
              <BellRing className="w-3 h-3" />
              <span>{toPersianDigits(reorderAlertsCount)} کسری موجودی</span>
            </button>
          )}

          {/* Operational Notifications Popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-1.5 rounded-lg border border-slate-200/60 bg-white hover:bg-slate-50 text-slate-500 transition-colors cursor-pointer relative"
              title="اعلان‌های خط تولید و انبار"
            >
              <Bell className="w-3.5 h-3.5" />
              {reorderAlertsCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 absolute top-1.5 right-1.5" />
              )}
            </button>

            {showNotifications && (
              <div className="absolute left-0 top-full mt-2 w-80 bg-white text-slate-800 border border-slate-200/80 rounded-xl shadow-lg p-3 z-50 text-xs space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-medium text-slate-800">اعلان‌ها و رویدادهای کارخانه</span>
                  <button
                    type="button"
                    onClick={() => setShowNotifications(false)}
                    className="text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-1.5">
                  {reorderAlertsCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (onNavigate) onNavigate('inventory', 'ALERTS');
                        setShowNotifications(false);
                      }}
                      className="w-full text-right p-2.5 bg-rose-50/40 hover:bg-rose-50/70 rounded-lg border border-rose-200/60 cursor-pointer block"
                    >
                      <div className="font-medium text-rose-800">
                        هشدار کسری نقطه سفارش ({toPersianDigits(reorderAlertsCount)} قلم کالا)
                      </div>
                      <div className="text-[11px] text-rose-600 mt-0.5">
                        بررسی جدول کسری‌ها و صدور دستور خرید یا تولید جبرانی ←
                      </div>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (onNavigate) onNavigate('inventory', 'COILS');
                      setShowNotifications(false);
                    }}
                    className="w-full text-right p-2.5 bg-slate-50/70 hover:bg-slate-100/70 rounded-lg border border-slate-100 cursor-pointer block"
                  >
                    <div className="font-medium text-slate-700">موجودی کلاف‌های ورق در انبار</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {toPersianDigits(coilsCount)} رول فیزیکی با برچسب و کویل‌پک آماده برش در سالن است.
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User Profile & System Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 pl-2.5 pr-1.5 py-1 rounded-lg border border-slate-200/60 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer"
            >
              <div className="w-6 h-6 rounded-md bg-slate-100 text-slate-700 border border-slate-200/70 flex items-center justify-center font-medium text-[11px]">
                {currentUser.displayName ? currentUser.displayName[0] : 'ک'}
              </div>
              <div className="hidden md:block text-right leading-tight">
                <div className="text-[11px] font-medium text-slate-700 truncate max-w-[120px]">
                  {currentUser.displayName || 'مدیر تولید'}
                </div>
                <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                  {roleLabels[currentUser.role] || 'مدیر سیستم'}
                </div>
              </div>
            </button>

            {showUserMenu && (
              <div
                className="absolute left-0 top-full mt-2 w-72 bg-white text-slate-900 border border-slate-200 rounded-xl shadow-xl p-3 z-50 text-xs space-y-3 animate-in fade-in"
                onClick={e => e.stopPropagation()}
              >
                {/* User Info Header */}
                <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900">{currentUser.displayName || 'مدیر کارخانه کوثر'}</div>
                    <div className="text-[11px] text-slate-500">{roleLabels[currentUser.role]}</div>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono tabular-nums">
                    {timeStr} · {jalaliNumeric}
                  </div>
                </div>

                {/* Role Switcher */}
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    تغییر نقش کاربری (دسترسی):
                  </label>
                  <select
                    value={currentUser.role}
                    onChange={e => {
                      onRoleChange(e.target.value as UserRoleProfile['role']);
                      setShowUserMenu(false);
                    }}
                    className="w-full p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    {Object.entries(roleLabels).map(([roleKey, label]) => (
                      <option key={roleKey} value={roleKey}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* System & Database Quick Links */}
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false);
                      onOpenErpModal();
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-50 text-slate-700 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Database className="w-3.5 h-3.5 text-slate-500" />
                      <span>وضعیت پایگاه داده (PostgreSQL)</span>
                    </div>
                    <span className="text-[10px] text-emerald-600 font-bold">متصل</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await onSeedDemo();
                      setShowUserMenu(false);
                    }}
                    disabled={loading}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 text-slate-700 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-blue-500 ${loading ? 'animate-spin' : ''}`} />
                    <span>بازنشانی داده‌های نمونه کارخانه</span>
                  </button>

                  {!showConfirmClean ? (
                    <button
                      type="button"
                      onClick={() => setShowConfirmClean(true)}
                      disabled={loading}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>پاکسازی داده‌های نمونه</span>
                    </button>
                  ) : (
                    <div className="flex items-center justify-between bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-lg text-xs">
                      <span className="text-rose-700 text-[11px] font-bold">تأیید پاکسازی داده‌ها؟</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            await onCleanDemo();
                            setShowConfirmClean(false);
                            setShowUserMenu(false);
                          }}
                          className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-2 py-0.5 rounded text-[10px] cursor-pointer"
                        >
                          بله، حذف
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowConfirmClean(false)}
                          className="text-slate-600 hover:text-slate-900 px-1.5 py-0.5 text-[10px] cursor-pointer"
                        >
                          انصراف
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  <span>سامانه صنعتی کوثر · ویرایش سازمانی</span>
                  <button
                    type="button"
                    onClick={() => setShowUserMenu(false)}
                    className="text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
                  >
                    بستن
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Unified Global Command Palette Modal (Ctrl+K) */}
      <GlobalSearchPaletteModal
        isOpen={isSearchPaletteOpen}
        onClose={() => setIsSearchPaletteOpen(false)}
        onNavigate={(tab, subTab) => {
          if (onNavigate) {
            onNavigate(tab, subTab);
          }
        }}
      />
    </header>
  );
};
