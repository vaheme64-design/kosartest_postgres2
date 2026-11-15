import React from 'react';
import {
  HelpCircle,
  X,
  Boxes,
  Disc,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Scale,
  Sparkles,
} from 'lucide-react';

interface MasterDataDifferenceGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MasterDataDifferenceGuideModal: React.FC<MasterDataDifferenceGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#333333]/40 backdrop-blur-[1px] flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white border border-[#d9d9d9] rounded-md max-w-4xl w-full shadow-xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200 text-right font-sans">
        {/* Header */}
        <div className="bg-[#ffffff] text-[#333333] border-b border-[#d9d9d9] p-4 sm:p-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#e5f3fa] border border-[#b3ddf2] rounded text-[#007cc0]">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[#333333]">
                راهنمای تفکیک مفاهیم: تفاوت کاتالوگ قطعه، مواد اولیه و کویل انبار
              </h3>
              <p className="text-xs text-[#666666] mt-0.5">
                برای جلوگیری از اشتباه در تعریف اطلاعات پایه و گردش انبار ساپکو
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-[#666666] hover:text-[#333333] hover:bg-[#f0f0f0] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto bg-[#f7f7f7]">
          {/* Summary Box */}
          <div className="bg-[#fff5eb] border border-[#f5d0a9] rounded p-3.5 text-xs text-[#333333] flex items-start gap-3 leading-relaxed">
            <AlertTriangle className="w-5 h-5 text-[#e9730c] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-xs mb-1 text-[#333333]">پاسخ به سوال پرتکرار: چرا ۳ بخش مجزا داریم؟</span>
              در کارخانجات پرسکاری و مجموعه‌سازی خودرو، <strong>«تعریف مهندسی یک قطعه»</strong> با <strong>«موجودی فیزیکی یک رول در انبار»</strong> کاملاً متفاوت است. در زیر ۳ لایه اصلی سیستم توضیح داده شده است:
            </div>
          </div>

          {/* 3 Pillars Comparison Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* 1. Master Part Catalog */}
            <div className="bg-white border border-[#d9d9d9] rounded p-4 flex flex-col justify-between hover:border-[#007cc0] transition">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-[#e5f3fa] text-[#007cc0] rounded">
                    <Boxes className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-[#333333]">۱. کاتالوگ قطعه (Part Catalog)</span>
                </div>
                <p className="text-xs text-[#666666] leading-relaxed">
                  <strong>هویت مهندسی قطعه در نقشه ساپکو:</strong> هر محصول، نیمه‌ساخته (WIP) یا قطعه استاندارد (پیچ، مهره، لاستیک) که در فرآیند کارخانه جریان دارد.
                </p>
                <div className="bg-[#f7f7f7] p-2.5 rounded border border-[#e8e8e8] text-[11px] space-y-1 text-[#333333]">
                  <div>• <strong>کد کالا:</strong> IKCO-206-BRK01</div>
                  <div>• <strong>واحد:</strong> عدد (PCS)</div>
                  <div>• <strong>وزن خالص:</strong> ۶۵۰ گرم</div>
                  <div>• <strong>مدل خودرو:</strong> پژو ۲۰۶</div>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#e8e8e8] text-[11px] text-[#666666]">
                اینجا فقط مشخصات ثابت مهندسی ثبت می‌شود و کاری به وزن رول موجود در انبار ندارد.
              </div>
            </div>

            {/* 2. Raw Material Definition */}
            <div className="bg-white border border-[#d9d9d9] rounded p-4 flex flex-col justify-between hover:border-[#007cc0] transition">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-[#fff5eb] text-[#e9730c] rounded">
                    <Layers className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-[#333333]">۲. تعریف ماده اولیه (Raw Material)</span>
                </div>
                <p className="text-xs text-[#666666] leading-relaxed">
                  <strong>مشخصات جنس ورق و متریال:</strong> گرید فولاد، استاندارد متالورژی، ضخامت اسمی و چگالی که قطعات از آن ساخته می‌شوند.
                </p>
                <div className="bg-[#f7f7f7] p-2.5 rounded border border-[#e8e8e8] text-[11px] space-y-1 text-[#333333]">
                  <div>• <strong>گرید:</strong> DC04 کشش عمیق یا ST14</div>
                  <div>• <strong>ضخامت:</strong> 0.8 میلی‌متر</div>
                  <div>• <strong>واحد سنجش:</strong> کیلوگرم (KG)</div>
                  <div>• <strong>کاربرد:</strong> بلنک پوسته درب و ضد سرقت</div>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#e8e8e8] text-[11px] text-[#666666]">
                در درخت محصول (BOM) مشخص می‌کنید این قطعه از کدام گرید ورق با چه ضریبی تغذیه می‌شود.
              </div>
            </div>

            {/* 3. Physical Coils & Inventory Lots */}
            <div className="bg-white border border-[#d9d9d9] rounded p-4 flex flex-col justify-between hover:border-[#007cc0] transition">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-[#eef8f2] text-[#107e3e] rounded">
                    <Disc className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-[#333333]">۳. کویل فیزیکی انبار (Physical Coil)</span>
                </div>
                <p className="text-xs text-[#666666] leading-relaxed">
                  <strong>موجودی فیزیکی واقعی در کف انبار:</strong> هر رول یا پالت شیت که با بارنامه و قبض باسکول وارد انبار مواد اولیه می‌شود.
                </p>
                <div className="bg-[#f7f7f7] p-2.5 rounded border border-[#e8e8e8] text-[11px] space-y-1 text-[#333333]">
                  <div>• <strong>شماره رول / پکینگ:</strong> CP-1002</div>
                  <div>• <strong>وزن باسکول:</strong> ۷,۴۵۰ کیلوگرم</div>
                  <div>• <strong>شماره ذوب:</strong> HEAT-7712</div>
                  <div>• <strong>قرارداد ساپکو:</strong> CNT-1403-SAPCO</div>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-[#e8e8e8] text-[11px] text-[#666666]">
                یک رول فیزیکی ممکن است برای چند قطعه مختلف استفاده شود، یا بخشی از آن به خط برود و مازاد آن به انبار برگردد.
              </div>
            </div>
          </div>

          {/* Practical Example: Anti-Theft Bracket */}
          <div className="bg-white border border-[#d9d9d9] text-[#333333] rounded p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-[#007cc0] text-xs font-bold">
              <Sparkles className="w-4 h-4" />
              <span>مثال کاربردی واقعی: قطعه «تقویتی قفل ضد سرقت درب»</span>
            </div>
            <div className="text-xs text-[#333333] leading-relaxed space-y-2">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-[#e5f3fa] text-[#007cc0] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">۱</span>
                <span>در <strong>کاتالوگ قطعات</strong>: محصول نهایی «ضد سرقت» با واحد «عدد» و دو قطعه نیمه‌ساخته داخلی آن («پوسته اصلی» و «لچکی زبانه») را تعریف می‌کنید.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-[#e5f3fa] text-[#007cc0] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">۲</span>
                <span>در <strong>درخت محصول (BOM)</strong>: تعریف می‌کنید که این قطعه نیازمند ۰/۵۲ کیلوگرم ورق ST14 (پوسته) + ۰/۲۱ کیلوگرم ورق DC04 (لچکی) + ۲ عدد پیچ M6 + ۲ عدد مهره جوشی M6 است.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-[#e5f3fa] text-[#007cc0] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">۳</span>
                <span>در <strong>انبار کویل‌ها</strong>: هنگام رسید تریلی از ساپکو، رول فیزیکی شماره CP-1002 با وزن ۷ تن ثبت می‌شود. موقع برش، حواله خروج از همین رول فیزیکی کسر می‌گردد و کد رهگیری متناظر به آن متصل می‌شود.</span>
              </div>
            </div>
          </div>

          {/* Do's and Don'ts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
            <div className="p-3.5 bg-[#eef8f2] border border-[#b5e0c6] rounded space-y-2">
              <span className="font-bold text-[#107e3e] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-[#107e3e]" />
                روش صحیح تعریف اطلاعات
              </span>
              <ul className="text-[#333333] space-y-1 list-disc pr-4 text-[11px]">
                <li>برای هر قطعه خودرویی مستقل فقط یک کد در کاتالوگ ثبت شود.</li>
                <li>پیچ و مهره و لاستیک‌ها با واحد «عدد» در کاتالوگ قطعات ثبت شوند.</li>
                <li>ورق‌ها با واحد «کیلوگرم» تعریف شده و در BOM به عنوان مواد اولیه متصل شوند.</li>
                <li>ورود هر محموله با وزن واقعی باسکول در بخش «رسید انبار / کویل» ثبت شود.</li>
              </ul>
            </div>

            <div className="p-3.5 bg-[#fde8e8] border border-[#f5b7b7] rounded space-y-2">
              <span className="font-bold text-[#bb0000] flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-[#bb0000]" />
                اشتباهات رایج که نباید انجام شود
              </span>
              <ul className="text-[#333333] space-y-1 list-disc pr-4 text-[11px]">
                <li>نباید به ازای هر رول ورودی جدید، یک قطعه جدید در کاتالوگ تعریف کنید!</li>
                <li>نباید وزن کل یک کویل ۸ تنی را به عنوان وزن واحد قطعه قرار دهید.</li>
                <li>نباید نام مشتری یا قرارداد را داخل کد فنی قطعه بنویسید (قرارداد جداگانه است).</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#ffffff] border-t border-[#d9d9d9] flex items-center justify-end">
          <button
            onClick={onClose}
            className="sap-btn-emphasized px-5 py-1.5 text-xs cursor-pointer"
          >
            متوجه شدم و بستن راهنما
          </button>
        </div>
      </div>
    </div>
  );
};
