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
import { useErpRouter } from '../../context/RouterContext';

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
  const { traceDocument } = useErpRouter();
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
      <div className="sap-card p-4 space-y-3.5 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2 rounded-sm bg-[#e5f3fa] border border-[#b3ddf2] text-[#007cc0] shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#333333]">
                برنامه روزانه کارخانه به تفکیک سالن و دستور کار زنده (Live Daily Schedule)
              </h2>
              <p className="text-xs text-[#666666] mt-0.5">
                متصل به دستور کارهای فعال کارگاه (WIP Orders)، سالن‌های استقرار و آمار لحظه‌ای تولید سالم/ضایعات
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={loadScheduleFromLiveOrders}
              disabled={loading}
              className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>بروزرسانی زنده</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="sap-btn-emphasized flex items-center gap-1.5 px-3.5 py-1.5 text-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>چاپ برنامه روزانه</span>
            </button>
          </div>
        </div>

        <div className="pt-3 border-t border-[#e8e8e8] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 bg-[#f7f7f7] border border-[#d9d9d9] rounded-sm px-3 py-1">
              <Building className="w-3.5 h-3.5 text-[#007cc0]" />
              <span className="text-[#666666] font-medium">سالن استقرار:</span>
              <select
                value={selectedHall}
                onChange={e => setSelectedHall(e.target.value)}
                className="bg-transparent font-bold text-[#333333] focus:outline-none cursor-pointer"
              >
                <option value="ALL">همه سالن‌ها ({toPersianDigits(items.length)} عملیات)</option>
                {halls.map(h => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="inline-flex items-center gap-2 bg-[#f7f7f7] border border-[#d9d9d9] rounded-sm px-3 py-1">
              <Clock className="w-3.5 h-3.5 text-[#666666]" />
              <span className="text-[#666666] font-medium">شیفت:</span>
              <select
                value={selectedShift}
                onChange={e => setSelectedShift(e.target.value)}
                className="bg-transparent font-bold text-[#333333] focus:outline-none cursor-pointer"
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
            <span className="text-[#666666]">
              برنامه: <strong className="text-[#333333]">{formatNumber(totalPlanned)}</strong>
            </span>
            <span className="text-[#107e3e]">
              تحقق‌یافته: <strong>{formatNumber(totalProduced)}</strong> ({toPersianDigits(achievementRate)}٪)
            </span>
          </div>
        </div>
      </div>

      {/* Live Table */}
      <div className="sap-card overflow-hidden">
        {loading && items.length === 0 ? (
          <div className="p-10 text-center text-xs text-[#666666]">در حال بارگذاری برنامه زنده سالن‌ها...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-10 text-center text-xs text-[#666666]">
            هیچ مرحله عملیاتی فعالی برای نمایش در این فیلتر وجود ندارد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="sap-table-compact w-full text-right text-xs">
              <thead className="bg-[#f5f5f5] border-b border-[#d9d9d9] text-[#666666] font-bold">
                <tr>
                  <th>تاریخ / شیفت</th>
                  <th>سالن و ماشین</th>
                  <th>دستور کار / مرحله</th>
                  <th>قطعه</th>
                  <th className="text-center">هدف برنامه</th>
                  <th className="text-center text-[#107e3e]">تولید سالم</th>
                  <th className="text-center text-[#bb0000]">ضایعات</th>
                  <th>اپراتور</th>
                  <th className="text-center">وضعیت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e8e8] tabular-nums">
                {filteredItems.map(item => (
                  <tr key={item.id} className="hover:bg-[#f5f5f5] transition-colors">
                    <td>
                      <div className="font-mono font-bold text-[#333333]">{scheduleDate}</div>
                      <div className="text-[11px] text-[#666666]">{item.shiftName}</div>
                    </td>
                    <td>
                      <div className="font-bold text-[#333333] flex items-center gap-1">
                        <Cpu className="w-3.5 h-3.5 text-[#007cc0]" />
                        <span>{item.machineName}</span>
                      </div>
                      <div className="text-[11px] text-[#666666]">{item.hallName}</div>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => traceDocument(item.moNumber, 'WIP_TRACEABILITY')}
                        className="sap-doc-link font-mono font-bold"
                        title="رهگیری دستور کار در جریان ساخت"
                      >
                        {item.moNumber}
                      </button>
                      <div className="text-[11px] text-[#666666]">
                        {item.stepCode} — {item.stepName}
                      </div>
                    </td>
                    <td>
                      <div className="font-semibold text-[#333333]">{item.partName}</div>
                      <button
                        type="button"
                        onClick={() => traceDocument(item.partCode, 'INVENTORY_LEDGER')}
                        className="sap-doc-link text-[11px] font-mono"
                        title="رهگیری قطعه در انبار و کاردکس"
                      >
                        {item.partCode}
                      </button>
                    </td>
                    <td className="text-center font-mono font-bold text-[#333333]">
                      {formatNumber(item.plannedQuantity)}
                    </td>
                    <td className="text-center font-mono font-bold text-[#107e3e]">
                      {formatNumber(item.actualProducedQuantity)}
                    </td>
                    <td className="text-center font-mono text-[#bb0000]">
                      {formatNumber(item.scrapQuantity)}
                    </td>
                    <td className="text-[#333333]">
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3 h-3 text-[#666666]" />
                        {item.operatorName}
                      </span>
                    </td>
                    <td className="text-center">
                      {item.status === 'COMPLETED' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#107e3e]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          تکمیل
                        </span>
                      ) : item.status === 'IN_PROGRESS' ? (
                        <span className="text-[11px] font-bold text-[#e9730c]">در حال تولید</span>
                      ) : (
                        <span className="text-[11px] text-[#666666]">برنامه‌ریزی‌شده</span>
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
