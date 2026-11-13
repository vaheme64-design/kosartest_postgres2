import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Printer,
  CheckCircle2,
  Clock,
  Cpu,
  Building,
  User,
  RefreshCw,
} from 'lucide-react';
import { formatNumber, toPersianDigits } from '../../utils/formatters';
import { formatToJalali } from '../../utils/jalali';
import { JalaliDatePicker } from '../common/JalaliDatePicker';

interface DailyScheduleItem {
  id: string;
  hallId: string;
  hallName: string;
  shift: 'MORNING' | 'EVENING' | 'NIGHT';
  shiftName: string;
  machineCode: string;
  machineName: string;
  dieCode: string;
  dieName: string;
  partCode: string;
  partName: string;
  moNumber: string;
  stepCode: string;
  stepName: string;
  plannedQuantity: number;
  actualProducedQuantity: number;
  scrapQuantity: number;
  operatorName: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'SCHEDULED';
}

export const DailyProductionScheduleView: React.FC = () => {
  const [selectedHall, setSelectedHall] = useState<string>('ALL');
  const [selectedShift, setSelectedShift] = useState<string>('ALL');
  const [scheduleDate, setScheduleDate] = useState<string>(() => formatToJalali(new Date()));
  const [items, setItems] = useState<DailyScheduleItem[]>([]);
  const [halls, setHalls] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  const loadScheduleFromLiveOrders = useCallback(async () => {
    setLoading(true);
    try {
      const [mosRes, hallsRes, machinesRes, diesRes] = await Promise.all([
        fetch('/api/wip/manufacturing-orders').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/halls').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/machines').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/dies').then(r => r.json()).catch(() => ({ success: false })),
      ]);

      const hallsList: any[] = hallsRes.success && Array.isArray(hallsRes.data) ? hallsRes.data : [];
      const machinesList: any[] = machinesRes.success && Array.isArray(machinesRes.data) ? machinesRes.data : [];
      const diesList: any[] = diesRes.success && Array.isArray(diesRes.data) ? diesRes.data : [];
      const mosList: any[] = mosRes.success && Array.isArray(mosRes.data) ? mosRes.data : [];

      setHalls(hallsList);

      const generated: DailyScheduleItem[] = [];
      mosList.forEach(mo => {
        (mo.operations || []).forEach((op: any, idx: number) => {
          const machine = machinesList.find(m => m.id === op.machineId || m.code === op.machineCode);
          const die = diesList.find(d => d.id === op.dieMoldId || d.partCode === mo.partCode);
          const matchedHall =
            hallsList.find(h => h.id === machine?.hallId || h.name === machine?.location) ||
            hallsList[0] || { id: 'HALL-MAIN', name: machine?.location || 'سالن تولید اصلی' };

          const shift: 'MORNING' | 'EVENING' = idx % 2 === 0 ? 'MORNING' : 'EVENING';
          const status: DailyScheduleItem['status'] =
            op.status === 'COMPLETED'
              ? 'COMPLETED'
              : op.status === 'IN_PROGRESS' || op.status === 'READY'
              ? 'IN_PROGRESS'
              : 'SCHEDULED';

          generated.push({
            id: `${mo.id}-${op.id}`,
            hallId: matchedHall.id,
            hallName: matchedHall.name,
            shift,
            shiftName: shift === 'MORNING' ? 'شیفت صبح (۰۷:۰۰ - ۱۵:۰۰)' : 'شیفت عصر (۱۵:۰۰ - ۲۳:۰۰)',
            machineCode: machine?.code || op.machineId || '—',
            machineName: op.machineName || machine?.name || 'ایستگاه کاری کارگاه',
            dieCode: die?.code || op.dieMoldId || '—',
            dieName: die?.name || 'فیکسچر / قالب استاندارد مرحله',
            partCode: mo.partCode,
            partName: mo.partName,
            moNumber: mo.moNumber,
            stepCode: op.stepCode,
            stepName: op.stepName,
            plannedQuantity: mo.targetQuantity || 0,
            actualProducedQuantity: op.goodOutputQty || 0,
            scrapQuantity: op.scrapQty || 0,
            operatorName: op.lastOperatorName || 'سرشیفت سالن',
            status,
          });
        });
      });

      setItems(generated);
    } catch (err) {
      console.error('Failed to load live daily schedule:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadScheduleFromLiveOrders();
  }, [loadScheduleFromLiveOrders]);

  const filteredItems = items.filter(item => {
    if (selectedHall !== 'ALL' && item.hallId !== selectedHall) return false;
    if (selectedShift !== 'ALL' && item.shift !== selectedShift) return false;
    return true;
  });

  const totalPlanned = filteredItems.reduce((acc, i) => acc + i.plannedQuantity, 0);
  const totalProduced = filteredItems.reduce((acc, i) => acc + i.actualProducedQuantity, 0);
  const achievementRate = totalPlanned > 0 ? Math.round((totalProduced / totalPlanned) * 100) : 0;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="bg-white p-4 lg:p-5 rounded-xl border border-slate-200/90 shadow-2xs space-y-4 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 shrink-0">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                برنامه روزانه کارخانه به تفکیک سالن و دستور کار زنده (Live Daily Schedule)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                متصل به دستور کارهای فعال کارگاه (WIP Orders)، سالن‌های استقرار و آمار لحظه‌ای تولید سالم/ضایعات
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={loadScheduleFromLiveOrders}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>بروزرسانی زنده</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 text-orange-400" />
              <span>چاپ برنامه روزانه</span>
            </button>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
              <Building className="w-3.5 h-3.5 text-orange-600" />
              <span className="text-slate-500 font-medium">سالن استقرار:</span>
              <select
                value={selectedHall}
                onChange={e => setSelectedHall(e.target.value)}
                className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
              >
                <option value="ALL">همه سالن‌ها ({toPersianDigits(items.length)} عملیات)</option>
                {halls.map(h => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-500 font-medium">شیفت:</span>
              <select
                value={selectedShift}
                onChange={e => setSelectedShift(e.target.value)}
                className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
              >
                <option value="ALL">همه شیفت‌ها</option>
                <option value="MORNING">شیفت صبح (۰۷:۰۰ - ۱۵:۰۰)</option>
                <option value="EVENING">شیفت عصر (۱۵:۰۰ - ۲۳:۰۰)</option>
              </select>
            </div>

            <div className="inline-flex items-center gap-2">
              <JalaliDatePicker value={scheduleDate} onChange={setScheduleDate} />
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
            <span className="text-slate-600">
              برنامه: <strong className="text-slate-900">{formatNumber(totalPlanned)}</strong>
            </span>
            <span className="text-emerald-700">
              تحقق‌یافته: <strong>{formatNumber(totalProduced)}</strong> ({toPersianDigits(achievementRate)}٪)
            </span>
          </div>
        </div>
      </div>

      {/* Live Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        {loading && items.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">در حال بارگذاری برنامه زنده سالن‌ها...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            هیچ مرحله عملیاتی فعالی برای نمایش در این فیلتر وجود ندارد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="py-3 px-3">تاریخ / شیفت</th>
                  <th className="py-3 px-3">سالن و ماشین</th>
                  <th className="py-3 px-3">دستور کار / مرحله</th>
                  <th className="py-3 px-3">قطعه</th>
                  <th className="py-3 px-3 text-center">هدف برنامه</th>
                  <th className="py-3 px-3 text-center text-emerald-700">تولید سالم</th>
                  <th className="py-3 px-3 text-center text-rose-600">ضایعات</th>
                  <th className="py-3 px-3">اپراتور</th>
                  <th className="py-3 px-3 text-center">وضعیت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {filteredItems.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3">
                      <div className="font-mono font-bold text-slate-800">{scheduleDate}</div>
                      <div className="text-[11px] text-slate-500">{item.shiftName}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 flex items-center gap-1">
                        <Cpu className="w-3.5 h-3.5 text-slate-400" />
                        <span>{item.machineName}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">{item.hallName}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-mono font-bold text-indigo-700">{item.moNumber}</div>
                      <div className="text-[11px] text-slate-600">
                        {item.stepCode} — {item.stepName}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900">{item.partName}</div>
                      <div className="text-[11px] font-mono text-slate-500">{item.partCode}</div>
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-slate-800">
                      {formatNumber(item.plannedQuantity)}
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-emerald-700">
                      {formatNumber(item.actualProducedQuantity)}
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-rose-600">
                      {formatNumber(item.scrapQuantity)}
                    </td>
                    <td className="py-3 px-3 text-slate-700">
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-400" />
                        {item.operatorName}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {item.status === 'COMPLETED' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          تکمیل
                        </span>
                      ) : item.status === 'IN_PROGRESS' ? (
                        <span className="text-[11px] font-bold text-amber-700">در حال تولید</span>
                      ) : (
                        <span className="text-[11px] text-slate-500">برنامه‌ریزی‌شده</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
