import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { resolveEstablishmentId } from '../utils/resolveEstablishmentId';
import { assertInScope } from '../utils/assertInScope';
import { emitToEstablishment } from '../realtime/socket';
import { HotelServiceInput, StayChargeInput, UpdateHotelServiceInput } from '../validators/hotel.validator';
import { httpError, stayDetailInclude, withTotals } from '../services/stay.service';

// Prestations de l'hôtel (pressing, blanchisserie, room service…) : un
// catalogue de prix, et des lignes ajoutées à la facture d'un séjour.

const notify = (establishmentId: string) => emitToEstablishment(establishmentId, 'hotel:updated', {});

// GET /api/hotel/services
export const listHotelServices = async (req: Request, res: Response) => {
  const services = await req.db.hotelService.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  res.status(200).json({ services });
};

// POST /api/hotel/services
export const createHotelService = async (req: Request, res: Response) => {
  const data = req.body as HotelServiceInput;
  const establishmentId = await resolveEstablishmentId(req);
  const service = await prisma.hotelService.create({
    data: { establishmentId, name: data.name, category: data.category, price: data.price },
  });
  res.status(201).json({ service });
};

// PATCH /api/hotel/services/:id
export const updateHotelService = async (req: Request, res: Response) => {
  const data = req.body as UpdateHotelServiceInput;
  await assertInScope(() => req.db.hotelService.findFirst({ where: { id: req.params.id } }), 'Prestation introuvable');
  const service = await prisma.hotelService.update({ where: { id: req.params.id }, data });
  res.status(200).json({ service });
};

const OPEN_STATUSES = ['RESERVED', 'CHECKED_IN'];

const loadOpenStay = async (req: Request, id: string) => {
  const stay = await assertInScope(() => req.db.stay.findFirst({ where: { id } }), 'Séjour introuvable');
  if (!OPEN_STATUSES.includes(stay.status)) {
    throw httpError('Séjour terminé ou annulé : la facture ne peut plus être modifiée', 409);
  }
  return stay;
};

// POST /api/hotel/stays/:id/charges — ajoute une prestation à la facture
export const addStayCharge = async (req: Request, res: Response) => {
  const stay = await loadOpenStay(req, req.params.id);
  const data = req.body as StayChargeInput;

  const service = data.serviceId
    ? await assertInScope(
        () => req.db.hotelService.findFirst({ where: { id: data.serviceId, isActive: true } }),
        'Prestation introuvable ou retirée'
      )
    : null;

  await prisma.stayCharge.create({
    data: {
      stayId: stay.id,
      serviceId: service?.id ?? null,
      label: data.label || service!.name,
      category: data.category || service?.category || 'Autre',
      quantity: data.quantity,
      unitPrice: data.unitPrice ?? service!.price,
      note: data.note || null,
      userId: req.user!.id,
    },
  });

  const updated = await prisma.stay.findUniqueOrThrow({ where: { id: stay.id }, include: stayDetailInclude });
  notify(stay.establishmentId);
  res.status(201).json({ stay: withTotals(updated) });
};

// DELETE /api/hotel/stays/:id/charges/:chargeId — erreur de saisie
export const deleteStayCharge = async (req: Request, res: Response) => {
  const stay = await loadOpenStay(req, req.params.id);
  const charge = await prisma.stayCharge.findFirst({ where: { id: req.params.chargeId, stayId: stay.id } });
  if (!charge) throw httpError('Prestation introuvable sur ce séjour', 404);

  await prisma.stayCharge.delete({ where: { id: charge.id } });
  const updated = await prisma.stay.findUniqueOrThrow({ where: { id: stay.id }, include: stayDetailInclude });
  notify(stay.establishmentId);
  res.status(200).json({ stay: withTotals(updated) });
};
