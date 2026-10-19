import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { ESTABLISHMENT_LOGOS_DIR } from '../middlewares/upload.middleware';
import {
  CreateEstablishmentInput,
  UpdateEstablishmentInput,
} from '../validators/establishment.validator';
import { checkEstablishmentLimit } from '../utils/planLimits';

export const listEstablishments = async (req: Request, res: Response) => {
  // Scopé par organizationId — un OWNER voit tous les établissements de son
  // organisation, les autres rôles ne verraient (via req.db) que le leur
  const establishments = await req.db.establishment.findMany({
    orderBy: { name: 'asc' },
  });
  res.status(200).json({ establishments });
};

export const createEstablishment = async (req: Request, res: Response) => {
  const { name, type, address, logo, phone, email, postalBox, nif, rc } = req.body as CreateEstablishmentInput;

  const limitError = await checkEstablishmentLimit(req.user!.organizationId);
  if (limitError) {
    return res.status(403).json({ message: limitError });
  }

  // Pas besoin de resolveEstablishmentId ici : un établissement est rattaché
  // directement à l'organisation, pas à un autre établissement
  const establishment = await prisma.establishment.create({
    data: {
      name,
      type,
      address,
      logo,
      phone: phone || null,
      email: email || null,
      postalBox: postalBox || null,
      nif: nif || null,
      rc: rc || null,
      organizationId: req.user!.organizationId,
    },
  });

  res.status(201).json({ establishment });
};

export const updateEstablishment = async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = req.body as UpdateEstablishmentInput;

  const existing = await req.db.establishment.findFirst({ where: { id } });
  if (!existing) {
    return res.status(404).json({ message: 'Établissement introuvable' });
  }

  const establishment = await prisma.establishment.update({ where: { id }, data });
  res.status(200).json({ establishment });
};

// Supprime du disque un logo envoyé précédemment (pas les URL externes).
// Best-effort : une erreur ici ne doit pas faire échouer la requête.
const deleteStoredLogo = (logo: string | null) => {
  if (logo?.startsWith('/uploads/establishments/')) {
    fs.unlink(path.join(ESTABLISHMENT_LOGOS_DIR, path.basename(logo)), () => {});
  }
};

// POST /api/establishments/:id/logo — fichier dans le champ "image"
export const uploadEstablishmentLogo = async (req: Request, res: Response) => {
  const { id } = req.params;

  const existing = await req.db.establishment.findFirst({ where: { id } });
  if (!existing) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ message: 'Établissement introuvable' });
  }
  if (!req.file) {
    return res.status(400).json({ message: 'Aucun fichier reçu' });
  }

  deleteStoredLogo(existing.logo);
  const establishment = await prisma.establishment.update({
    where: { id },
    data: { logo: `/uploads/establishments/${req.file.filename}` },
  });
  res.status(200).json({ establishment });
};

// DELETE /api/establishments/:id/logo
export const removeEstablishmentLogo = async (req: Request, res: Response) => {
  const { id } = req.params;

  const existing = await req.db.establishment.findFirst({ where: { id } });
  if (!existing) {
    return res.status(404).json({ message: 'Établissement introuvable' });
  }

  deleteStoredLogo(existing.logo);
  const establishment = await prisma.establishment.update({ where: { id }, data: { logo: null } });
  res.status(200).json({ establishment });
};
