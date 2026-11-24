// Les établissements clients sont au Gabon : une journée va de minuit à minuit à
// Libreville (UTC+1 toute l'année), quel que soit le fuseau du serveur (UTC chez
// Render). Sans cela, une vente de 0 h 30 compterait pour la veille.
export const LOCAL_TIME_ZONE = 'Africa/Libreville';
const OFFSET_MS = 60 * 60 * 1000;

const badRequest = (message: string) => Object.assign(new Error(message), { status: 400 });

// Même instant, lisible avec les méthodes getUTC… comme une heure de Libreville
const asLocal = (date: Date) => new Date(date.getTime() + OFFSET_MS);

// Minuit à Libreville (mois 1-12 ; les débordements passent au mois/jour suivant)
const midnight = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day) - OFFSET_MS);

// Jour « AAAA-MM-JJ » et heure (0-23) d'un instant à Libreville
export const localDay = (date: Date) => asLocal(date).toISOString().slice(0, 10);
export const localHour = (date: Date) => asLocal(date).getUTCHours();

const parseDay = (value: unknown) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) throw badRequest('Date attendue au format AAAA-MM-JJ');
  const [year, month, day] = match.slice(1).map(Number);
  const start = midnight(year, month, day);
  // 31 février, mois 13…
  if (localDay(start) !== value) throw badRequest('Date invalide');
  return { year, month, day, start };
};

export const parseDayRange = (dateParam?: string) => {
  const { year, month, day, start } = parseDay(dateParam || localDay(new Date()));
  return { start, end: midnight(year, month, day + 1) };
};

// monthParam au format "YYYY-MM" ; par défaut le mois en cours
export const parseMonthRange = (monthParam?: string) => {
  const { year, month, start } = parseDay(`${monthParam || localDay(new Date()).slice(0, 7)}-01`);
  return { start, end: midnight(year, month + 1, 1) };
};

// yearParam au format "YYYY" ; par défaut l'année en cours
export const parseYearRange = (yearParam?: string) => {
  const { year, start } = parseDay(`${yearParam || localDay(new Date()).slice(0, 4)}-01-01`);
  return { start, end: midnight(year + 1, 1, 1) };
};

// Filtre « du … au … » (bornes facultatives, journée de fin comprise)
export const parseOptionalRange = (from?: string, to?: string): { gte?: Date; lt?: Date } => ({
  ...(from ? { gte: parseDayRange(from).start } : {}),
  ...(to ? { lt: parseDayRange(to).end } : {}),
});

interface ReportQuery {
  startDate?: string;
  endDate?: string;
  period?: string;
  date?: string;
}

// Priorité : startDate/endDate explicites > period=year|month > jour unique (défaut)
export const parseReportRange = (query: ReportQuery) => {
  const { startDate, endDate, period, date } = query;

  if (startDate && endDate) {
    // borne exclusive : inclut toute la journée de fin
    return { start: parseDayRange(startDate).start, end: parseDayRange(endDate).end };
  }

  if (period === 'year') {
    return parseYearRange(date);
  }

  if (period === 'month') {
    return parseMonthRange(date);
  }

  return parseDayRange(date);
};
