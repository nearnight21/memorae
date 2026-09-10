const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function parseDateParts(dateString?: string): { year: number; month: number; day: number } {
  if (dateString) {
    const matched = dateString.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (matched) {
      const year = Number(matched[1]);
      const month = Number(matched[2]);
      const day = Number(matched[3]);
      if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day) && month >= 1 && month <= 12) {
        const maxDay = daysInMonth(year, month);
        return { year, month, day: Math.min(Math.max(1, day), maxDay) };
      }
    }
  }
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

export function formatDateString(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function localizedDateSummary(year: number, month: number, day: number): string {
  const weekdayIndex = new Date(year, month - 1, day).getDay();
  const weekday = WEEKDAYS[weekdayIndex] ?? '';
  return `${year}年${month}月${day}日 · ${weekday}`;
}
