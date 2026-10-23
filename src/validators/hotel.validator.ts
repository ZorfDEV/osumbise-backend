import { z } from 'zod';

const ROOM_CATEGORIES = ['STANDARD', 'VIP', 'SUITE'] as const;
const ROOM_STATUSES = ['AVAILABLE', 'OCCUPIED', 'CLEANING', 'OUT_OF_SERVICE'] as const;

// Date "jour" au format YYYY-MM-DD (arrivée, départ)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ');

// --- Chambres ---------------------------------------------------------

export const createRoomSchema = z.object({
  number: z.string().trim().min(1, 'Le numéro de chambre est requis').max(20),
  category: z.enum(ROOM_CATEGORIES),
  floor: z.string().trim().max(20).optional(),
  // Facultatif : nom du bâtiment (ex. Bâtiment A, Annexe)
  building: z.string().trim().max(40).optional(),
  capacity: z.number().int().min(1).max(20).default(2),
  nightlyRate: z.number().nonnegative('Le tarif ne peut pas être négatif'),
  notes: z.string().max(500).optional(),
  // OWNER sans établissement actif (cf. resolveEstablishmentId)
  establishmentId: z.string().uuid().optional(),
});

export const updateRoomSchema = createRoomSchema
  .omit({ establishmentId: true })
  .partial()
  .extend({ isActive: z.boolean().optional() });

// Changement d'état manuel (ménage terminé, hors service…). OCCUPIED n'est
// pas proposé : il découle d'une arrivée enregistrée.
export const updateRoomStatusSchema = z
  .object({
    status: z.enum(ROOM_STATUSES).refine((s) => s !== 'OCCUPIED', {
      message: 'Une chambre devient occupée en enregistrant l’arrivée d’un client',
    }),
    // Obligatoire pour mettre la chambre hors service
    reason: z.string().trim().max(200).optional(),
  })
  .refine((d) => d.status !== 'OUT_OF_SERVICE' || (d.reason ?? '').length >= 3, {
    message: 'Indiquez le motif de la mise hors service',
    path: ['reason'],
  });

// --- Taxe de séjour ----------------------------------------------------

export const updateTaxRatesSchema = z.object({
  rates: z
    .array(z.object({ category: z.enum(ROOM_CATEGORIES), taxPerNight: z.number().nonnegative() }))
    .min(1),
  establishmentId: z.string().uuid().optional(),
});

// --- Séjours -----------------------------------------------------------

const stayBase = z.object({
  roomId: z.string().uuid(),
  guestName: z.string().trim().min(2, 'Le nom du client est requis').max(120),
  guestPhone: z.string().trim().max(30).optional(),
  guestIdNumber: z.string().trim().max(60).optional(),
  adults: z.number().int().min(1).max(20).default(1),
  children: z.number().int().min(0).max(20).default(0),
  checkInDate: day,
  checkOutDate: day,
  notes: z.string().max(1000).optional(),
  // Tarif négocié ; sinon celui de la chambre
  nightlyRate: z.number().nonnegative().optional(),
  // Client enregistré (compte client) ; null le détache
  customerId: z.string().uuid().nullable().optional(),
});

const datesInOrder = (s: { checkInDate?: string; checkOutDate?: string }) =>
  !s.checkInDate || !s.checkOutDate || s.checkOutDate > s.checkInDate;
const datesMessage = { message: 'La date de départ doit être après la date d’arrivée', path: ['checkOutDate'] };

export const createStaySchema = stayBase
  .extend({
    // Enregistrer l'arrivée tout de suite (client sans réservation)
    checkInNow: z.boolean().optional(),
    establishmentId: z.string().uuid().optional(),
  })
  .refine(datesInOrder, datesMessage);

export const updateStaySchema = stayBase.partial().refine(datesInOrder, datesMessage);

export const addStayPaymentSchema = z
  .object({
    // ROOM exclu : un séjour ne se paie pas « sur la chambre ».
    // CREDIT : le montant passe sur le compte d'un client (customerId), qui
    // le réglera plus tard — aucun argent n'entre en caisse.
    method: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'TRANSFER', 'CREDIT']),
    amount: z.number().positive('Le montant doit être positif'),
    note: z.string().max(200).optional(),
    customerId: z.string().uuid().optional(),
    // Session de caisse ouverte : les versements espèces/carte/mobile y entrent
    cashSessionId: z.string().uuid().optional(),
  })
  .refine((p) => p.method !== 'CREDIT' || !!p.customerId, {
    message: 'Choisissez le compte client à débiter',
    path: ['customerId'],
  });

// --- Réservations de groupe ------------------------------------------------

export const createStayGroupSchema = z
  .object({
    name: z.string().trim().min(2, 'Le nom du groupe est requis').max(120),
    customerId: z.string().uuid().optional(),
    contactPhone: z.string().trim().max(30).optional(),
    checkInDate: day,
    checkOutDate: day,
    notes: z.string().max(1000).optional(),
    checkInNow: z.boolean().optional(),
    establishmentId: z.string().uuid().optional(),
    rooms: z
      .array(
        z.object({
          roomId: z.string().uuid(),
          // Occupant ; à défaut, le nom du groupe
          guestName: z.string().trim().max(120).optional(),
          adults: z.number().int().min(1).max(20).default(1),
          children: z.number().int().min(0).max(20).default(0),
          nightlyRate: z.number().nonnegative().optional(),
        })
      )
      .min(1, 'Choisissez au moins une chambre')
      .max(200),
  })
  .refine(datesInOrder, datesMessage)
  .refine((g) => new Set(g.rooms.map((r) => r.roomId)).size === g.rooms.length, {
    message: 'Une même chambre est choisie deux fois',
    path: ['rooms'],
  });

export const groupPaymentSchema = addStayPaymentSchema;

// Annulation d'une réservation : que faire de l'avance déjà versée ?
// REFUND = rendue au client (sortie de caisse), RETAIN = conservée (frais
// d'annulation, comptée dans les rapports)
export const cancelStaySchema = z.object({
  advance: z.enum(['REFUND', 'RETAIN']).optional(),
  cashSessionId: z.string().uuid().optional(),
});

// --- Prestations (pressing, room service…) ---------------------------------

export const hotelServiceSchema = z.object({
  name: z.string().trim().min(2, 'Le nom est requis').max(80),
  category: z.string().trim().min(2).max(40).default('Pressing'),
  price: z.number().nonnegative('Le prix ne peut pas être négatif'),
  isActive: z.boolean().optional(),
  establishmentId: z.string().uuid().optional(),
});
export const updateHotelServiceSchema = hotelServiceSchema.omit({ establishmentId: true }).partial();

// Depuis le catalogue (serviceId), ou saisie libre (label + unitPrice)
export const stayChargeSchema = z
  .object({
    serviceId: z.string().uuid().optional(),
    label: z.string().trim().min(2).max(80).optional(),
    category: z.string().trim().max(40).optional(),
    quantity: z.number().int().min(1).max(500).default(1),
    unitPrice: z.number().nonnegative().optional(),
    note: z.string().trim().max(200).optional(),
  })
  .refine((c) => !!c.serviceId || (!!c.label && c.unitPrice !== undefined), {
    message: 'Choisissez une prestation ou saisissez son libellé et son prix',
  });

export type HotelServiceInput = z.infer<typeof hotelServiceSchema>;
export type UpdateHotelServiceInput = z.infer<typeof updateHotelServiceSchema>;
export type StayChargeInput = z.infer<typeof stayChargeSchema>;
export type CancelStayInput = z.infer<typeof cancelStaySchema>;

export type CreateStayGroupInput = z.infer<typeof createStayGroupSchema>;
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
export type UpdateTaxRatesInput = z.infer<typeof updateTaxRatesSchema>;
export type CreateStayInput = z.infer<typeof createStaySchema>;
export type UpdateStayInput = z.infer<typeof updateStaySchema>;
export type AddStayPaymentInput = z.infer<typeof addStayPaymentSchema>;
