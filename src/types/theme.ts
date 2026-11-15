export type ErpLayoutTemplate =
  | 'HUB_WORKSPACE'      // قالب ۱: کارتی و فضای کاری (مطابق تصویر ۱ و ERPNext Workspace)
  | 'TABBED_WORKBENCH'   // قالب ۲: میزکار تب‌بندی یکپارچه (مطابق تصویر ۲)
  | 'ODOO_ENTERPRISE'    // قالب ۳: ماتریس ماژولار و نوار ابزار بالا (الهام‌گرفته از Odoo)
  | 'CLASSIC_COMMAND';   // قالب ۴: مرکز فرماندهی صنعتی (قالب قبلی)

export type ErpColorTheme =
  | 'EMERALD_KOSAR'      // سبز زمردی کوثر (مطابق تصاویر ارسالی ۱ و ۲)
  | 'ODOO_PLUM'          // ارغوانی و فیروزه‌ای (سبک Odoo Enterprise)
  | 'ERPNEXT_BLUE'       // آبی مهندسی و تیتانیومی (سبک ERPNext / SAP Fiori)
  | 'INDUSTRIAL_AMBER';  // سرمه‌ای و کهربایی صنعتی (تم کلاسیک)

export interface LayoutTemplateMeta {
  id: ErpLayoutTemplate;
  title: string;
  subtitle: string;
  badge: string;
  sidebarStyle: 'DARK_RIGHT' | 'WHITE_RIGHT' | 'COMPACT_DRAWER' | 'GROUPED_LIGHT';
  headerStyle: 'WHITE_MINIMAL' | 'DARK_NAVY' | 'BRAND_COLORED' | 'COMMAND_BAR';
  defaultMasterDataMode: 'CARDS_HUB' | 'SEGMENTED_TABS';
  uxStrengths: string[];
  uiCharacteristics: string[];
  referenceImage?: string;
}

export interface ColorThemeMeta {
  id: ErpColorTheme;
  name: string;
  description: string;
  primaryHex: string;
  primaryHoverHex: string;
  primarySoftHex: string;
  sidebarDarkHex: string;
  headerDarkHex: string;
  activeBgClass: string;
  activeTextClass: string;
  softBgClass: string;
  softTextClass: string;
  borderAccentClass: string;
  buttonPrimaryClass: string;
}

export interface UnifiedColorPalette {
  appBackground: string;
  surface: string;
  surfaceMuted: string;
  borderSubtle: string;
  borderDefault: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverted: string;
  tableHeaderBg: string;
  tableHeaderText: string;
  tableHeaderBorder: string;
  tableRowBase: string;
  tableRowStripe: string;
  tableRowHover: string;
  tableRowText: string;
  cardBg: string;
  cardBorder: string;
  accentBrand: string;
  accentBadge: string;
  headerBannerBg: string;
  headerBannerText: string;
  headerBannerSubtext: string;
}

export const UNIFIED_COLOR_CONFIG: UnifiedColorPalette = {
  appBackground: 'bg-[#f0f0f0] text-[#333333]',
  surface: 'bg-white',
  surfaceMuted: 'bg-[#f7f7f7]',
  borderSubtle: 'border-[#e8e8e8]',
  borderDefault: 'border-[#d9d9d9]',
  borderStrong: 'border-[#bfbfbf]',
  textPrimary: 'text-[#333333]',
  textSecondary: 'text-[#666666]',
  textMuted: 'text-[#767676]',
  textInverted: 'text-white',
  tableHeaderBg: 'bg-white',
  tableHeaderText: 'text-[#333333] font-semibold',
  tableHeaderBorder: 'border-b border-[#d9d9d9]',
  tableRowBase: 'bg-white',
  tableRowStripe: 'even:bg-[#fafafa]',
  tableRowHover: 'hover:bg-[#e5f3fa]/70 hover:text-[#333333] transition-colors',
  tableRowText: 'text-[#333333]',
  cardBg: 'bg-white',
  cardBorder: 'border border-[#d9d9d9]',
  accentBrand: 'bg-[#007cc0] hover:bg-[#006299] text-white',
  accentBadge: 'bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf5] font-semibold',
  headerBannerBg: 'bg-white border border-[#d9d9d9]',
  headerBannerText: 'text-[#333333] font-semibold',
  headerBannerSubtext: 'text-[#666666]',
};

export const LAYOUT_TEMPLATES: Record<ErpLayoutTemplate, LayoutTemplateMeta> = {
  HUB_WORKSPACE: {
    id: 'HUB_WORKSPACE',
    title: 'قالب ۱: فضای کاری SAP HANA Fiori',
    subtitle: 'نوار هدر سفید #FFFFFF + منوی کناری تمیز + پس‌زمینه #F0F0F0 و تاکید #007CC0',
    badge: 'پیشنهادی برای محیط استاندارد SAP HANA',
    sidebarStyle: 'WHITE_RIGHT',
    headerStyle: 'WHITE_MINIMAL',
    defaultMasterDataMode: 'CARDS_HUB',
    referenceImage: '/assets/aistudio/1_1da4846f.jpg',
    uxStrengths: [
      'کاهش بار ذهنی با الگوی SAP HANA Fiori Launchpad و هدر روشن #FFFFFF.',
      'جداسازی شفاف ناوبری کناری (tnt:SideNavigation) و کادرهای تمیز ۶px.',
      'نمایش جداول متراکم SAP ALV Compact با خط‌کشی ظریف و رنگ‌های معنایی استاندارد.',
    ],
    uiCharacteristics: [
      'نوار بالایی سفید (#FFFFFF) با متن #333333 همراه با جستجوی سراسری',
      'سایدبار روشن با خط شاخص ۳px آبی SAP HANA (#007CC0)',
      'پس‌زمینه #F0F0F0 و جداول متراکم با حاشیه #D9D9D9',
    ],
  },
  TABBED_WORKBENCH: {
    id: 'TABBED_WORKBENCH',
    title: 'قالب ۲: میزکار تب‌بندی یکپارچه SAP IconTabBar',
    subtitle: 'هدر سفید + سایدبار روشن + نوار تب افقی SAP HANA بالای جداول متراکم',
    badge: 'پیشنهادی برای اپراتورها و ورود سریع داده',
    sidebarStyle: 'WHITE_RIGHT',
    headerStyle: 'WHITE_MINIMAL',
    defaultMasterDataMode: 'SEGMENTED_TABS',
    referenceImage: '/assets/aistudio/2_5080a2ed.jpg',
    uxStrengths: [
      'جابجایی تک‌کلیکی بین موجودیت‌ها با نوار SAP IconTabBar.',
      'صرفه‌جویی در ارتفاع صفحه و دسترسی سریع به جداول Compact ALV.',
      'کنتراست استاندارد SAP HANA (#333333 روی #FFFFFF) بدون شلوغی بصری.',
    ],
    uiCharacteristics: [
      'هدر روشن SAP HANA (#FFFFFF)',
      'سایدبار سفید تمیز با شاخص #007CC0',
      'نوار تب IconTabBar با زیرخط آبی #007CC0',
    ],
  },
  ODOO_ENTERPRISE: {
    id: 'ODOO_ENTERPRISE',
    title: 'قالب ۳: ماتریس ماژولار',
    subtitle: 'نوار برند + منوی ماتریسی برنامه‌ها + دکمه‌های آماری',
    badge: 'چیدمان ماژولار',
    sidebarStyle: 'COMPACT_DRAWER',
    headerStyle: 'WHITE_MINIMAL',
    defaultMasterDataMode: 'CARDS_HUB',
    uxStrengths: [
      'کنترل‌پنل یکپارچه و مسیر راهنما در بالای هر صفحه.',
      'سوییچر سریع برنامه‌ها از طریق منوی ماتریسی.',
    ],
    uiCharacteristics: [
      'نوار بالایی سفید و سوییچر سریع برنامه‌ها',
      'سوییچ آنی بین نمای کارتی و نمای جدولی',
    ],
  },
  CLASSIC_COMMAND: {
    id: 'CLASSIC_COMMAND',
    title: 'قالب ۴: میز کار کلاسیک SAP Fiori Compact',
    subtitle: 'نوار جستجوی فرماندهی + منوی درختی گروه‌بندی‌شده',
    badge: 'قالب کلاسیک SAP HANA',
    sidebarStyle: 'GROUPED_LIGHT',
    headerStyle: 'COMMAND_BAR',
    defaultMasterDataMode: 'SEGMENTED_TABS',
    uxStrengths: [
      'منوی درختی تفکیک‌شده بر اساس حوزه انبار و تولید.',
      'نوار جستجوی سراسری ماژول‌ها و عملیات سریع در بالای صفحه.',
    ],
    uiCharacteristics: [
      'پالت روشن SAP HANA (#F0F0F0) با تاکیدهای آبی #007CC0',
      'نوار اعلان وضعیت و جستجوی سریع',
    ],
  },
};

export const COLOR_THEMES: Record<ErpColorTheme, ColorThemeMeta> = {
  EMERALD_KOSAR: {
    id: 'EMERALD_KOSAR',
    name: 'آبی SAP HANA و تایید سبز کوثر',
    description: 'پالت رسمی SAP HANA Fiori با پس‌زمینه #F0F0F0، هدر سفید #FFFFFF و تاکید #007CC0',
    primaryHex: '#007CC0',
    primaryHoverHex: '#006299',
    primarySoftHex: '#E5F3FA',
    sidebarDarkHex: '#FFFFFF',
    headerDarkHex: '#FFFFFF',
    activeBgClass: 'bg-[#E5F3FA] text-[#007CC0] border-r-[3px] border-[#007CC0]',
    activeTextClass: 'text-[#007CC0]',
    softBgClass: 'bg-[#E5F3FA] border-[#B3DDF5]',
    softTextClass: 'text-[#007CC0]',
    borderAccentClass: 'border-r-[3px] border-r-[#007CC0]',
    buttonPrimaryClass: 'bg-[#007CC0] hover:bg-[#006299] text-white',
  },
  ODOO_PLUM: {
    id: 'ODOO_PLUM',
    name: 'کلاسیک SAP HANA Fiori',
    description: 'نسخه SAP HANA Fiori با هدر #FFFFFF، متن #333333 و دکمه‌های #007CC0',
    primaryHex: '#007CC0',
    primaryHoverHex: '#006299',
    primarySoftHex: '#E5F3FA',
    sidebarDarkHex: '#FFFFFF',
    headerDarkHex: '#FFFFFF',
    activeBgClass: 'bg-[#E5F3FA] text-[#007CC0]',
    activeTextClass: 'text-[#007CC0]',
    softBgClass: 'bg-[#E5F3FA] border-[#B3DDF5]',
    softTextClass: 'text-[#007CC0]',
    borderAccentClass: 'border-r-[3px] border-r-[#007CC0]',
    buttonPrimaryClass: 'bg-[#007CC0] hover:bg-[#006299] text-white',
  },
  ERPNEXT_BLUE: {
    id: 'ERPNEXT_BLUE',
    name: 'آبی SAP HANA Fiori (پیش‌فرض)',
    description: 'رنگ سازمانی رسمی SAP HANA Fiori (#007CC0 / #F0F0F0 / #333333)',
    primaryHex: '#007CC0',
    primaryHoverHex: '#006299',
    primarySoftHex: '#E5F3FA',
    sidebarDarkHex: '#FFFFFF',
    headerDarkHex: '#FFFFFF',
    activeBgClass: 'bg-[#007CC0] text-white',
    activeTextClass: 'text-[#007CC0]',
    softBgClass: 'bg-[#E5F3FA] border-[#B3DDF5]',
    softTextClass: 'text-[#007CC0]',
    borderAccentClass: 'border-r-[3px] border-r-[#007CC0]',
    buttonPrimaryClass: 'bg-[#007CC0] hover:bg-[#006299] text-white',
  },
  INDUSTRIAL_AMBER: {
    id: 'INDUSTRIAL_AMBER',
    name: 'استاندارد SAP HANA Clean',
    description: 'نوار بالای سفید (#FFFFFF) همراه با پس‌زمینه #F0F0F0 و تاکید #007CC0',
    primaryHex: '#007CC0',
    primaryHoverHex: '#006299',
    primarySoftHex: '#E5F3FA',
    sidebarDarkHex: '#FFFFFF',
    headerDarkHex: '#FFFFFF',
    activeBgClass: 'bg-[#E5F3FA] text-[#007CC0]',
    activeTextClass: 'text-[#007CC0]',
    softBgClass: 'bg-[#E5F3FA] border-[#B3DDF5]',
    softTextClass: 'text-[#007CC0]',
    borderAccentClass: 'border-r-[3px] border-r-[#007CC0]',
    buttonPrimaryClass: 'bg-[#007CC0] hover:bg-[#006299] text-white',
  },
};
