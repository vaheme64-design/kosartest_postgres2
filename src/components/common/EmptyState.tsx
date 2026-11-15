import React from 'react';
import {
  Inbox,
  Filter,
  Plus,
  RefreshCw,
  Search,
  PackageSearch,
  FileQuestion,
  CalendarX2,
  Wrench,
  AlertTriangle,
  Layers,
  LucideIcon,
} from 'lucide-react';

export type EmptyStateVariant =
  | 'NO_DATA'
  | 'FILTER_NO_MATCH'
  | 'SEARCH_NO_MATCH'
  | 'NO_SCHEDULE'
  | 'NO_DOWNTIME'
  | 'NO_WIP'
  | 'NO_CONTRACTS'
  | 'CUSTOM';

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  icon?: LucideIcon;
  title?: string;
  description?: string;
  steps?: string[];
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
  compact?: boolean;
}

const PRESET_CONFIGS: Record<
  EmptyStateVariant,
  {
    icon: LucideIcon;
    title: string;
    description: string;
    steps: string[];
    actionLabel?: string;
    secondaryActionLabel?: string;
  }
> = {
  NO_DATA: {
    icon: Inbox,
    title: 'هنوز هیچ داده‌ای ثبت نشده است',
    description: 'برای آغاز کار با این بخش از سیستم، اولین رکورد را در سیستم ثبت کنید.',
    steps: [
      'گام ۱: از دکمه افزودن جدید در بالای جدول استفاده کنید.',
      'گام ۲: فیلدهای الزامی فرم را تکمیل کرده و ذخیره نمایید.',
    ],
    actionLabel: 'ثبت اولین رکورد',
  },
  FILTER_NO_MATCH: {
    icon: Filter,
    title: 'هیچ ردیفی با فیلترهای انتخابی یافت نشد',
    description: 'فیلترهای اعمال‌شده (مثل سالن، شیفت یا وضعیت) باعث محدود شدن نتایج جدول شده‌اند.',
    steps: [
      'فیلترهای بالای جدول را روی «همه» یا حالت عمومی‌تر تنظیم کنید.',
      'یا با زدن دکمه زیر، تمامی فیلترهای جستجو را ریست نمایید.',
    ],
    actionLabel: 'پاک‌کردن فیلترها',
  },
  SEARCH_NO_MATCH: {
    icon: Search,
    title: 'نتیجه‌ای برای جستجوی شما یافت نشد',
    description: 'کلمه کلیدی یا کد واردشده با هیچ‌یک از ردیف‌های فعال سیستم تطابق ندارد.',
    steps: [
      'املای کد فنی یا نام قطعه را بررسی کنید.',
      'از وارد کردن عبارات کوتاه‌تر یا بخشی از کد قطعه استفاده کنید.',
    ],
    actionLabel: 'پاک‌کردن متن جستجو',
  },
  NO_SCHEDULE: {
    icon: CalendarX2,
    title: 'هیچ برنامه تولیدی برای این روز یا شیفت تعریف نشده است',
    description: 'در تقویم تولید انتخابی، هنوز دستور کار فعالی زمان‌بندی نشده است.',
    steps: [
      'گام ۱: از تب «ماتریس برنامه‌ریزی» روز و شیفت مورد نظر را برای قطعات تایید کنید.',
      'گام ۲: یا از دکمه «انتقال مانده به شیفت بعد» جهت سرریز کار شیفت قبل استفاده نمایید.',
    ],
    actionLabel: 'تنظیم برنامه جدید در ماتریس',
  },
  NO_DOWNTIME: {
    icon: Wrench,
    title: 'هیچ توقف ثبت‌شده‌ای در این بازه وجود ندارد',
    description: 'خطوط تولید در بالاترین سطح آمادگی (Availability ۱۰۰٪) کار کرده‌اند و لاگ توقفی ثبت نشده است.',
    steps: [
      'در صورت وقوع خرابی یا تعویض قالب (SMED)، از دکمه زیر جهت ثبت توقف جدید استفاده نمایید.',
    ],
    actionLabel: 'ثبت لاگ توقف دستگاه',
  },
  NO_WIP: {
    icon: Layers,
    title: 'بافر بین‌ایستگاهی (WIP) خالی است',
    description: 'در حال حاضر هیچ قطعه نیمه‌ساخته‌ای بین مراحل این عملیات انباشته نشده است.',
    steps: [
      'گام ۱: مرحله ماقبل (OP قبلی) باید تولید سالم ثبت کند تا بافر ورودی تغذیه شود.',
      'گام ۲: مواد اولیه یا ورق رول پای دستگاه تخصیص داده شود.',
    ],
    actionLabel: 'مشاهده ماتریس تغذیه خط',
  },
  NO_CONTRACTS: {
    icon: PackageSearch,
    title: 'قرارداد یا سفارش بازی برای تحویل وجود ندارد',
    description: 'تمام قراردادهای ساپکو تحویل شده یا هنوز قراردادی در سیستم وارد نشده است.',
    steps: [
      'شماره سفارش یا متمم قرارداد تیراژ خودروساز را وارد نمایید.',
    ],
    actionLabel: 'ثبت قرارداد جدید با ساپکو',
  },
  CUSTOM: {
    icon: FileQuestion,
    title: 'اطلاعاتی یافت نشد',
    description: 'برای ادامه، ورودی‌های لازم را تکمیل کنید.',
    steps: [],
  },
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  variant = 'NO_DATA',
  icon,
  title,
  description,
  steps,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  className = '',
  compact = false,
}) => {
  const config = PRESET_CONFIGS[variant] || PRESET_CONFIGS.NO_DATA;
  const FinalIcon = icon || config.icon;
  const finalTitle = title || config.title;
  const finalDescription = description || config.description;
  const finalSteps = steps || config.steps;
  const finalActionLabel = actionLabel || config.actionLabel;
  const finalSecondaryLabel = secondaryActionLabel || config.secondaryActionLabel;

  if (compact) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-5 text-center text-[#666666] rounded border border-dashed border-[#bfbfbf] bg-[#f7f7f7] ${className}`}
      >
        <div className="w-9 h-9 rounded bg-[#e5f3fa] border border-[#b3ddf2] flex items-center justify-center text-[#007cc0] mb-2">
          <FinalIcon className="w-4 h-4 stroke-[1.6]" />
        </div>
        <h4 className="font-bold text-xs text-[#333333]">{finalTitle}</h4>
        <p className="text-[11px] text-[#666666] max-w-sm mt-1 leading-relaxed">
          {finalDescription}
        </p>
        {finalActionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="sap-btn-emphasized mt-3 px-3 py-1.5 text-xs cursor-pointer"
          >
            {finalActionLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center justify-center p-6 md:p-10 text-center rounded-md border border-dashed border-[#bfbfbf] bg-white ${className}`}
    >
      {/* Icon with layered backdrop */}
      <div className="relative mb-3">
        <div className="w-14 h-14 rounded-md bg-[#e5f3fa] border border-[#b3ddf2] flex items-center justify-center text-[#007cc0]">
          <FinalIcon className="w-7 h-7 stroke-[1.5]" />
        </div>
        <div className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full bg-[#007cc0] text-white flex items-center justify-center text-[10px] font-mono font-bold">
          0
        </div>
      </div>

      {/* Title & Description */}
      <h3 className="font-bold text-sm md:text-base text-[#333333] mb-1">{finalTitle}</h3>
      <p className="text-xs text-[#666666] max-w-md mx-auto leading-relaxed mb-4">
        {finalDescription}
      </p>

      {/* Enterprise Instructional Steps */}
      {finalSteps && finalSteps.length > 0 && (
        <div className="bg-[#f7f7f7] border border-[#d9d9d9] rounded p-3 max-w-md w-full text-right text-xs mb-4">
          <div className="text-[11px] font-bold text-[#333333] mb-1.5 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#007cc0]" />
            <span>راهنمای گام‌به‌گام برای شروع:</span>
          </div>
          <ul className="space-y-1 text-[#666666] text-[11px]">
            {finalSteps.map((step, sIdx) => (
              <li key={sIdx} className="flex items-start gap-2">
                <span className="font-mono text-[10px] font-bold text-[#007cc0] shrink-0 mt-0.5">
                  ●
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Call To Actions */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {finalActionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="sap-btn-emphasized flex items-center gap-1.5 px-4 py-1.5 text-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{finalActionLabel}</span>
          </button>
        )}

        {finalSecondaryLabel && onSecondaryAction && (
          <button
            type="button"
            onClick={onSecondaryAction}
            className="sap-btn-standard flex items-center gap-1.5 px-3.5 py-1.5 text-xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#007cc0]" />
            <span>{finalSecondaryLabel}</span>
          </button>
        )}
      </div>
    </div>
  );
};
