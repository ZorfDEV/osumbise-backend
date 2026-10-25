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

// Date jusqu'à laquelle les nuits sont facturées. Client encore présent après
// son départ prévu (séjour prolongé sans changer la date) : les nuits courent
// jusqu'à aujourd'hui. Au départ, checkOutDate prend la date réelle.
export const billedCheckOut = (stay: { status: StayStatus; checkOutDate: Date }) => {
  const now = today();
  return stay.status === 'CHECKED_IN' && now > stay.checkOutDate ? now : stay.checkOutDate;
};

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
  establishment: { select: { name: true, address: true, logo: true, phone: true, email: true, postalBox: true, nif: true, rc: true } },
  room: { select: { id: true, number: true, building: true, category: true, floor: true, status: true } },
  group: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, phone: true, balance: true, creditLimit: true } },
  user: { select: { name: true } },
  payments: {
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { name: true } }, customer: { select: { id: true, name: true } } },
  },
  charges: { orderBy: { createdAt: 'asc' }, include: { user: { select: { name: true } } } },
  orders: {
    where: { status: { in: ['PAYEE', 'FERMEE'] } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      createdAt: true,
      total: true,
      table: { select: { label: true } },
      // Restaurant / bar d'où vient la consommation (peut être un autre établissement)
      establishment: { select: { name: true } },
      items: { select: { id: true, quantity: true, unitPrice: true, product: { select: { name: true } } } },
      payments: { select: { method: true, amount: true } },
    },
  },
} satisfies Prisma.StayInclude;

type StayWithDetail = Prisma.StayGetPayload<{ include: typeof stayDetailInclude }>;

export interface StayTotals {
  nights: number;
  // Nuits comptées jusqu'à cette date (aujourd'hui si le séjour est prolongé)
  billedCheckOutDate: Date;
  // Client toujours présent après sa date de départ prévue
  extended: boolean;
  lodging: number;
  tax: number;
  charges: number;
  // Prestations de l'hôtel (pressing, room service…)
  services: number;
  // Remise accordée (hors taxe de séjour)
  discount: number;
  total: number;
  paid: number;
  balance: number;
}

// Montant dû : nuits × tarif + nuits × taxe de séjour + consommations mises
// sur la chambre (seule la part réglée en ROOM d'une commande y figure),
// moins les versements déjà reçus.
export const computeTotals = (stay: StayWithDetail): StayTotals => {
  // Séjour en cours : la date de départ prévue fait foi jusqu'au départ réel,
  // sauf si le client est resté au-delà (les nuits courent jusqu'à aujourd'hui)
  const billedCheckOutDate = billedCheckOut(stay);
  const extended = billedCheckOutDate > stay.checkOutDate;
  const nights = nightsBetween(stay.checkInDate, billedCheckOutDate);
  const lodging = nights * Number(stay.nightlyRate);
  const tax = nights * Number(stay.taxPerNight);
  const charges = stay.orders.reduce(
    (sum, o) => sum + o.payments.filter((p) => p.method === 'ROOM').reduce((s, p) => s + Number(p.amount), 0),
    0
  );
  const services = stay.charges.reduce((sum, c) => sum + c.quantity * Number(c.unitPrice), 0);
  const paid = stay.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  // Remise sur l'hébergement, les consommations et les prestations ; la taxe
  // de séjour reste due en entier
  const base = lodging + charges + services;
  const discount = stay.discountRate !== null
    ? Math.round((base * Number(stay.discountRate)) / 100)
    : Math.min(Number(stay.discount), base);
  const total = base - discount + tax;
  return {
    nights,
    billedCheckOutDate,
    extended,
    lodging,
    tax,
    charges,
    services,
    discount,
    total,
    paid,
    balance: Math.round((total - paid) * 100) / 100,
  };
};

export const withTotals = (stay: StayWithDetail) => ({ ...stay, totals: computeTotals(stay) });

// Numéro de facture de l'hôtel (séjours et groupes) : compteur de
// l'établissement, incrémenté atomiquement dans la transaction
export const nextHotelInvoiceNumber = async (tx: Prisma.TransactionClient, establishmentId: string) => {
  const counter = await tx.establishment.update({
    where: { id: establishmentId },
    data: { nextHotelInvoiceNumber: { increment: 1 } },
    select: { nextHotelInvoiceNumber: true },
  });
  return counter.nextHotelInvoiceNumber - 1;
};

// « H12 », « h0012 », « R0012 », « 12 » : lettre éventuelle et numéro
export const parseInvoiceQuery = (q: string): { letter: string | null; number: number | null } => {
  const m = q.trim().match(/^([A-Za-z])?\s*#?0*(\d+)$/);
  if (!m) return { letter: null, number: null };
  return { letter: m[1]?.toUpperCase() ?? null, number: Number(m[2]) };
};
