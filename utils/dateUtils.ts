
export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const differenceInDays = (dateLeft: Date, dateRight: Date): number => {
  const timeDiff = dateLeft.getTime() - dateRight.getTime();
  return Math.round(timeDiff / (1000 * 3600 * 24));
};

export const formatDate = (date: Date): string => {
  // 修正：不使用 toISOString()，因為它會轉換為 UTC 時區導致日期偏差
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getDatesInRange = (start: Date, end: Date): Date[] => {
  const dates = [];
  let current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

export const startOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};
