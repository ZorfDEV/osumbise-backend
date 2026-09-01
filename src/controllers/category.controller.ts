import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { resolveEstablishmentId } from '../utils/resolveEstablishmentId';
import { CreateCategoryInput, UpdateCategoryInput } from '../validators/category.validator';

export const listCategories = async (req: Request, res: Response) => {
  const categories = await req.db.category.findMany({
    orderBy: { name: 'asc' },
  });
  res.status(200).json({ categories });
};

export const createCategory = async (req: Request, res: Response) => {
  const { name } = req.body as CreateCategoryInput;
  const establishmentId = await resolveEstablishmentId(req);

  const category = await prisma.category.create({
    data: { name, establishmentId },
  });

  res.status(201).json({ category });
};

export const updateCategory = async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = req.body as UpdateCategoryInput;

  // findFirst via req.db : confirme que cette catégorie appartient bien au
  // tenant de l'utilisateur avant toute modification
  const existing = await req.db.category.findFirst({ where: { id } });
  if (!existing) {
    return res.status(404).json({ message: 'Catégorie introuvable' });
  }

  const category = await prisma.category.update({ where: { id }, data });
  res.status(200).json({ category });
};

export const deleteCategory = async (req: Request, res: Response) => {
  const { id } = req.params;

  const existing = await req.db.category.findFirst({ where: { id } });
  if (!existing) {
    return res.status(404).json({ message: 'Catégorie introuvable' });
  }

  // Un produit doit toujours appartenir à une catégorie : on refuse de
  // supprimer une catégorie encore utilisée plutôt que de laisser des
  // produits orphelins
  const productCount = await req.db.product.count({ where: { categoryId: id } });
  if (productCount > 0) {
    return res.status(409).json({
      message: `Impossible de supprimer : ${productCount} produit(s) utilisent encore cette catégorie`,
    });
  }

  await prisma.category.delete({ where: { id } });
  res.status(204).send();
};
