import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { assertInScope } from '../utils/assertInScope';
import { CreateRecipeItemInput, UpdateRecipeItemInput } from '../validators/recipeItem.validator';

export const addRecipeItem = async (req: Request, res: Response) => {
  const { productId } = req.params;
  const { ingredientProductId, quantity } = req.body as CreateRecipeItemInput;

  await assertInScope(
    () => req.db.product.findFirst({ where: { id: productId } }),
    'Produit introuvable'
  );

  if (ingredientProductId === productId) {
    return res
      .status(400)
      .json({ message: 'Un produit ne peut pas être ingrédient de lui-même' });
  }

  // Vérifie que l'ingrédient appartient bien au même tenant (pas juste le
  // produit composé) — sinon un client pourrait référencer un produit d'un
  // autre établissement comme ingrédient
  await assertInScope(
    () => req.db.product.findFirst({ where: { id: ingredientProductId } }),
    'Produit ingrédient introuvable'
  );

  const existing = await prisma.recipeItem.findFirst({
    where: { productId, ingredientProductId },
  });
  if (existing) {
    return res.status(409).json({ message: 'Cet ingrédient est déjà dans la recette' });
  }

  const recipeItem = await prisma.recipeItem.create({
    data: { productId, ingredientProductId, quantity },
    include: { ingredientProduct: { select: { id: true, name: true, unit: true } } },
  });

  res.status(201).json({ recipeItem });
};

export const updateRecipeItem = async (req: Request, res: Response) => {
  const { productId, recipeItemId } = req.params;
  const { quantity } = req.body as UpdateRecipeItemInput;

  await assertInScope(
    () => req.db.product.findFirst({ where: { id: productId } }),
    'Produit introuvable'
  );

  const existing = await prisma.recipeItem.findFirst({
    where: { id: recipeItemId, productId },
  });
  if (!existing) {
    return res.status(404).json({ message: 'Ligne de recette introuvable' });
  }

  const recipeItem = await prisma.recipeItem.update({
    where: { id: recipeItemId },
    data: { quantity },
    include: { ingredientProduct: { select: { id: true, name: true, unit: true } } },
  });

  res.status(200).json({ recipeItem });
};

export const removeRecipeItem = async (req: Request, res: Response) => {
  const { productId, recipeItemId } = req.params;

  await assertInScope(
    () => req.db.product.findFirst({ where: { id: productId } }),
    'Produit introuvable'
  );

  const existing = await prisma.recipeItem.findFirst({
    where: { id: recipeItemId, productId },
  });
  if (!existing) {
    return res.status(404).json({ message: 'Ligne de recette introuvable' });
  }

  await prisma.recipeItem.delete({ where: { id: recipeItemId } });
  res.status(204).send();
};
