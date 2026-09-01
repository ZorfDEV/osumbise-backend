export const parseDayRange = (dateParam?: string) => {
  const date = dateParam ? new Date(dateParam) : new Date();
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

// monthParam au format "YYYY-MM" ; par défaut le mois en cours
export const parseMonthRange = (monthParam?: string) => {
  const now = new Date();
  const [year, month] = monthParam
    ? monthParam.split('-').map(Number)
    : [now.getFullYear(), now.getMonth() + 1];

  const start = new Date(year, month - 1, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, month, 1);
  end.setHours(0, 0, 0, 0);
  return { start, end };
};

interface ReportQuery {
  startDate?: string;
  endDate?: string;
  period?: string;
  date?: string;
}

// Priorité : startDate/endDate explicites > period=month > jour unique (défaut)
export const parseReportRange = (query: ReportQuery) => {
  const { startDate, endDate, period, date } = query;

  if (startDate && endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1); // borne exclusive : inclut toute la journée de fin
    return { start, end };
  }

  if (period === 'month') {
    return parseMonthRange(date);
  }

  return parseDayRange(date);
};
