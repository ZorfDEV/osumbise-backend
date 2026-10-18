import { Prisma, StayStatus } from '@prisma/client';
import { prisma } from '../config/prisma';

// Règles de calcul d'un séjour, partagées par les contrôleurs hôtel.

const DAY_MS = 24 * 60 * 60 * 1000;
// Les hôtels clients sont au Gabon : "aujourd'hui" s'entend à l'heure de
// Libreville, pas à celle du serveur (UTC chez Render)
const HOTEL_TIME_ZONE = 'Africa/Libreville';

export const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });

// "AAAA-MM-JJ" → Date à minuit UTC (format des colonnes @db.Date)
export const toDay = (value: string) => new Date(`${value}T00:00:00.000Z`);

// Date du jour à Libreville, au format des colonnes @db.Date
export const today = () => toDay(new Date().toLocaleDateString('en-CA', { timeZone: HOTEL_TIME_ZONE }));

export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);

// Nombre de nuits facturées : au moins une (arrivée et départ le même jour)
export const nightsBetween = (checkIn: Date, checkOut: Date) =>
  Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / DAY_MS));

// Séjours qui bloquent une chambre : réservés ou en cours
const BLOCKING: StayStatus[] = ['RESERVED', 'CHECKED_IN'];

// Refuse un séjour qui chevauche un autre séjour de la même chambre.
// Le jour de départ d'un client peut être le jour d'arrivée du suivant.
export const assertRoomFree = async (
  roomId: string,
  checkIn: Date,
  checkOut: Date,
  excludeStayId?: string
) => {
  const conflict = await prisma.stay.findFirst({
    where: {
      roomId,
      status: { in: BLOCKING },
      id: excludeStayId ? { not: excludeStayId } : undefined,
      checkInDate: { lt: checkOut },
      checkOutDate: { gt: checkIn },
    },
    select: { guestName: true, checkInDate: true, checkOutDate: true },
  });
  if (conflict) {
    const fmt = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');
    throw httpError(
      `Chambre déjà réservée du ${fmt(conflict.checkInDate)} au ${fmt(conflict.checkOutDate)} (${conflict.guestName})`,
      409
    );
  }
};

// Taxe de séjour par nuit pour un type de chambre (0 si non configurée)
export const taxFor = async (establishmentId: string, category: Prisma.RoomCreateInput['category']) => {
  if (!category) return 0;
  const rate = await prisma.roomCategoryTax.findUnique({
    where: { establishmentId_category: { establishmentId, category } },
  });
  return rate ? Number(rate.taxPerNight) : 0;
};

// Détail complet d'un séjour, tel qu'affiché à l'écran et sur la facture
export const stayDetailInclude = {
  // En-tête de la facture : logo, nom et mentions légales
  establishment: { select: { name: true, address: true, logo: true, phone: true, postalBox: true, nif: true, rc: true } },
  room: { select: { id: true, number: true, building: true, category: true, floor: true } },
  group: { select: { id: true, name: true } },
  user: { select: { name: true } },
  payments: {
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { name: true } }, customer: { select: { id: true, name: true } } },
  },
  orders: {
    where: { status: { in: ['PAYEE', 'FERMEE'] } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      createdAt: true,
      total: true,
      table: { select: { label: true } },
      items: { select: { id: true, quantity: true, unitPrice: true, product: { select: { name: true } } } },
      payments: { select: { method: true, amount: true } },
    },
  },
} satisfies Prisma.StayInclude;

type StayWithDetail = Prisma.StayGetPayload<{ include: typeof stayDetailInclude }>;

export interface StayTotals {
  nights: number;
  lodging: number;
  tax: number;
  charges: number;
  total: number;
  paid: number;
  balance: number;
}

// Montant dû : nuits × tarif + nuits × taxe de séjour + consommations mises
// sur la chambre (seule la part réglée en ROOM d'une commande y figure),
// moins les versements déjà reçus.
export const computeTotals = (stay: StayWithDetail): StayTotals => {
  // Séjour en cours : la date de départ prévue fait foi jusqu'au départ réel
  const nights = nightsBetween(stay.checkInDate, stay.checkOutDate);
  const lodging = nights * Number(stay.nightlyRate);
  const tax = nights * Number(stay.taxPerNight);
  const charges = stay.orders.reduce(
    (sum, o) => sum + o.payments.filter((p) => p.method === 'ROOM').reduce((s, p) => s + Number(p.amount), 0),
    0
  );
  const paid = stay.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const total = lodging + tax + charges;
  return { nights, lodging, tax, charges, total, paid, balance: Math.round((total - paid) * 100) / 100 };
};

export const withTotals = (stay: StayWithDetail) => ({ ...stay, totals: computeTotals(stay) });
