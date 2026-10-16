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
export const updateRoomStatusSchema = z.object({
  status: z.enum(ROOM_STATUSES).refine((s) => s !== 'OCCUPIED', {
    message: 'Une chambre devient occupée en enregistrant l’arrivée d’un client',
  }),
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

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
export type UpdateTaxRatesInput = z.infer<typeof updateTaxRatesSchema>;
export type CreateStayInput = z.infer<typeof createStaySchema>;
export type UpdateStayInput = z.infer<typeof updateStaySchema>;
export type AddStayPaymentInput = z.infer<typeof addStayPaymentSchema>;
