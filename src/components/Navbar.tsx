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
    { tab: 'dashboard', label: 'داشبورد', icon: LayoutDashboard, color: 'bg-[#007cc0]' },
    { tab: 'master_data', label: 'اطلاعات پایه', icon: ScrollText, color: 'bg-[#007cc0]' },
    { tab: 'inventory', label: 'انبار و موجودی', icon: Boxes, color: 'bg-[#007cc0]' },
    { tab: 'production', label: 'تولید روزانه', icon: Hammer, color: 'bg-[#e9730c]' },
    { tab: 'wip', label: 'کار در جریان (WIP)', icon: GitCommit, color: 'bg-[#007cc0]' },
    { tab: 'planning', label: 'برنامه‌ریزی (MRP)', icon: CalendarDays, color: 'bg-[#007cc0]' },
    { tab: 'machines', label: 'ماشین‌آلات و ظرفیت', icon: Cpu, color: 'bg-[#007cc0]' },
    { tab: 'sapco', label: 'مواد SAPCO', icon: Layers, color: 'bg-[#bb0000]' },
    { tab: 'reports', label: 'گزارش‌ها', icon: FileSpreadsheet, color: 'bg-[#333333]' },
    { tab: 'settings', label: 'کاربران و تنظیمات', icon: Settings, color: 'bg-[#333333]' },
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
    <header className="bg-white text-[#333333] border-b border-[#d9d9d9] sticky top-0 z-40 px-4 lg:px-5 h-12 flex items-center justify-between gap-4 shadow-2xs">
      {/* RIGHT SIDE (RTL): App Finder + SAP Emblem + App Title */}
      <div className="flex items-center gap-3 min-w-0">
        {/* SAP App Finder / Launchpad Tiles Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAppMatrix(!showAppMatrix)}
            title="منوی برنامه‌ها (SAP Fiori App Finder)"
            className="p-1.5 rounded bg-[#f5f5f5] hover:bg-[#e5f3fa] hover:text-[#007cc0] text-[#555555] border border-[#d9d9d9] transition-colors cursor-pointer flex items-center justify-center"
          >
            <Grid className="w-4 h-4" />
          </button>

          {showAppMatrix && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white text-[#333333] border border-[#d9d9d9] rounded-md shadow-xl p-3.5 z-50">
              <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-2 mb-2.5">
                <span className="text-xs font-semibold text-[#333333]">
                  کاتالوگ ماژول‌های SAP HANA
                </span>
                <button
                  type="button"
                  onClick={() => setShowAppMatrix(false)}
                  className="text-[#666666] hover:text-[#333333] text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {appMatrixItems.map(item => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.tab;
                  return (
                    <button
                      key={item.tab}
                      type="button"
                      onClick={() => {
                        if (onNavigate) onNavigate(item.tab);
                        setShowAppMatrix(false);
                      }}
                      className={`flex flex-col items-center gap-1.5 p-2 rounded border transition-all cursor-pointer ${
                        isActive
                          ? 'border-[#007cc0] bg-[#e5f3fa] text-[#007cc0]'
                          : 'border-[#e8e8e8] hover:bg-[#f5f5f5] text-[#333333]'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded flex items-center justify-center ${isActive ? 'bg-[#007cc0] text-white' : 'bg-[#f0f0f0] text-[#007cc0]'}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[11px] font-medium text-center leading-tight">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* SAP Geometric Mark + Shell Context */}
        <button
          type="button"
          onClick={() => onNavigate?.('dashboard')}
          className="flex items-center gap-2.5 cursor-pointer shrink-0 group"
        >
          <div className="px-2 py-0.5 rounded bg-[#007cc0] text-white font-mono text-[11px] font-semibold tracking-normal flex items-center gap-1">
            <span>SAP</span>
            <span className="text-white/90 font-normal">| کوثر</span>
          </div>
          <span className="text-[#d9d9d9] hidden sm:inline">|</span>
          <span className="text-xs font-semibold text-[#333333] truncate max-w-[240px] md:max-w-none group-hover:text-[#007cc0]">
            {TAB_TITLES[activeTab]}
          </span>
        </button>
      </div>

      {/* CENTER: SAP Enterprise Global Search Field */}
      <div className="relative flex-1 max-w-md hidden md:flex items-center">
        <div
          onClick={() => setIsSearchPaletteOpen(true)}
          className="w-full relative flex items-center rounded pr-8 pl-14 py-1.5 text-xs cursor-pointer transition-colors select-none bg-[#f5f5f5] hover:bg-[#eeeeee] border border-[#cccccc] text-[#333333]"
        >
          <Search className="w-3.5 h-3.5 absolute right-2.5 top-1.5 pointer-events-none text-[#007cc0]" />
          <span className="truncate text-[#666666] text-[11px]">
            جستجو در دستورات ساخت، کالاها، قراردادها و اسناد...
          </span>
          <kbd className="absolute left-2 top-1 px-1.5 py-0.2 rounded text-[10px] font-mono text-[#555555] bg-white border border-[#d9d9d9] pointer-events-none">
            Ctrl+K
          </kbd>
        </div>
      </div>

      {/* LEFT SIDE (RTL): Shell Actions & User Profile */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setIsSearchPaletteOpen(true)}
          className="md:hidden p-1.5 rounded bg-[#f5f5f5] hover:bg-[#e5f3fa] text-[#333333] border border-[#d9d9d9] cursor-pointer"
          title="جستجوی سراسری"
        >
          <Search className="w-4 h-4 text-[#007cc0]" />
        </button>

        <PWAInstallButton />

        {reorderAlertsCount > 0 && (
          <button
            type="button"
            onClick={() => {
              if (onNavigate) onNavigate('inventory', 'ALERTS');
            }}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer bg-[#fff4e5] hover:bg-[#ffe8cc] text-[#b45309] border border-[#f5cba7]"
            title="مشاهده فهرست اقلام زیر نقطه سفارش"
          >
            <BellRing className="w-3 h-3 text-[#e9730c]" />
            <span>{toPersianDigits(reorderAlertsCount)} کسری نقطه سفارش</span>
          </button>
        )}

        {/* Operational Notifications Popover */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-1.5 rounded bg-[#f5f5f5] hover:bg-[#e5f3fa] hover:text-[#007cc0] text-[#555555] border border-[#d9d9d9] transition-colors cursor-pointer relative"
            title="اعلان‌های کارخانه"
          >
            <Bell className="w-4 h-4" />
            {reorderAlertsCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-[#e9730c] border border-white absolute top-1 right-1" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute left-0 top-full mt-2 w-80 bg-white text-[#333333] border border-[#d9d9d9] rounded-md shadow-xl p-3 z-50 text-xs space-y-2">
              <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-2">
                <span className="font-semibold text-[#333333]">مرکز اعلان‌های SAP HANA</span>
                <button
                  type="button"
                  onClick={() => setShowNotifications(false)}
                  className="text-[#666666] hover:text-[#333333] cursor-pointer"
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
                    className="w-full text-right p-2.5 bg-[#fff4e5] hover:bg-[#ffe8cc] rounded border border-[#f5cba7] cursor-pointer block"
                  >
                    <div className="font-medium text-[#b45309]">
                      هشدار کسری نقطه سفارش ({toPersianDigits(reorderAlertsCount)} قلم کالا)
                    </div>
                    <div className="text-[11px] text-[#7d3c0a] mt-0.5">
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
                  className="w-full text-right p-2.5 bg-[#f7f7f7] hover:bg-[#e5f3fa] rounded border border-[#e8e8e8] cursor-pointer block"
                >
                  <div className="font-medium text-[#333333]">موجودی کلاف‌های ورق در انبار</div>
                  <div className="text-[11px] text-[#666666] mt-0.5">
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
            className="flex items-center gap-2 pl-2 pr-1 py-1 rounded hover:bg-[#f5f5f5] text-[#333333] transition-colors cursor-pointer"
          >
            <div className="w-7 h-7 rounded-full bg-[#007cc0] text-white flex items-center justify-center font-medium text-xs shrink-0">
              {currentUser.displayName ? currentUser.displayName[0] : 'ک'}
            </div>
            <div className="hidden lg:block text-right leading-tight">
              <div className="text-[11px] font-semibold text-[#333333] truncate max-w-[110px]">
                {currentUser.displayName || 'مدیر تولید'}
              </div>
              <div className="text-[10px] text-[#666666] truncate max-w-[110px]">
                {roleLabels[currentUser.role] || 'مدیر سیستم'}
              </div>
            </div>
          </button>

          {showUserMenu && (
            <div
              className="absolute left-0 top-full mt-2 w-72 bg-white text-[#333333] border border-[#d9d9d9] rounded-md shadow-xl p-3 z-50 text-xs space-y-3"
              onClick={e => e.stopPropagation()}
            >
                {/* User Info Header */}
                <div className="border-b border-[#e8e8e8] pb-2 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-[#333333]">{currentUser.displayName || 'مدیر کارخانه کوثر'}</div>
                    <div className="text-[11px] text-[#666666]">{roleLabels[currentUser.role]}</div>
                  </div>
                  <div className="text-[10px] text-[#666666] font-mono tabular-nums">
                    {timeStr} · {jalaliNumeric}
                  </div>
                </div>

                {/* Role Switcher */}
                <div>
                  <label className="text-[11px] font-bold text-[#666666] block mb-1">
                    تغییر نقش کاربری (دسترسی):
                  </label>
                  <select
                    value={currentUser.role}
                    onChange={e => {
                      onRoleChange(e.target.value as UserRoleProfile['role']);
                      setShowUserMenu(false);
                    }}
                    className="w-full p-1.5 rounded bg-[#ffffff] border border-[#d9d9d9] text-xs font-semibold text-[#333333] focus:outline-none focus:border-[#007cc0] cursor-pointer"
                  >
                    {Object.entries(roleLabels).map(([roleKey, label]) => (
                      <option key={roleKey} value={roleKey}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* System & Database Quick Links */}
                <div className="pt-2 border-t border-[#e8e8e8] space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false);
                      onOpenErpModal();
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-[#e5f3fa] text-[#333333] cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Database className="w-3.5 h-3.5 text-[#007cc0]" />
                      <span>وضعیت پایگاه داده (PostgreSQL)</span>
                    </div>
                    <span className="text-[10px] text-[#107e3e] font-bold">متصل</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await onSeedDemo();
                      setShowUserMenu(false);
                    }}
                    disabled={loading}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-[#e5f3fa] text-[#333333] cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-[#007cc0] ${loading ? 'animate-spin' : ''}`} />
                    <span>بازنشانی داده‌های نمونه کارخانه</span>
                  </button>

                  {!showConfirmClean ? (
                    <button
                      type="button"
                      onClick={() => setShowConfirmClean(true)}
                      disabled={loading}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-[#fdf3f3] text-[#bb0000] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>پاکسازی داده‌های نمونه</span>
                    </button>
                  ) : (
                    <div className="flex items-center justify-between bg-[#fdf3f3] border border-[#e5b3b3] px-2.5 py-1.5 rounded text-xs">
                      <span className="text-[#bb0000] text-[11px] font-bold">تأیید پاکسازی داده‌ها؟</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            await onCleanDemo();
                            setShowConfirmClean(false);
                            setShowUserMenu(false);
                          }}
                          className="bg-[#bb0000] hover:bg-[#990000] text-white font-bold px-2 py-0.5 rounded text-[10px] cursor-pointer"
                        >
                          بله، حذف
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowConfirmClean(false)}
                          className="text-[#666666] hover:text-[#333333] px-1.5 py-0.5 text-[10px] cursor-pointer"
                        >
                          انصراف
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-[#e8e8e8] flex items-center justify-between text-[11px] text-[#666666]">
                  <span>سامانه صنعتی کوثر · ویرایش سازمانی</span>
                  <button
                    type="button"
                    onClick={() => setShowUserMenu(false)}
                    className="text-[#007cc0] hover:underline font-semibold cursor-pointer"
                  >
                    بستن
                  </button>
                </div>
              </div>
            )}
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
