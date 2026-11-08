import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { resolveEstablishmentId } from '../utils/resolveEstablishmentId';
import { CreateProductInput, UpdateProductInput, UpdateProductSidesInput } from '../validators/product.validator';
import { PRODUCT_IMAGES_DIR } from '../middlewares/upload.middleware';
import { DiscountableProduct, getEffectivePrice, isTagActive } from '../utils/productPricing';

// Ajoute le prix réellement facturable (après remise, si active à l'instant
// présent) — évite de dupliquer la logique de fenêtre de remise côté frontend
const serializeProduct = <T extends DiscountableProduct>(product: T) => ({
  ...product,
  effectivePrice: getEffectivePrice(product),
  discountActive: isTagActive(product),
});

// Plat composé (avec recette, ex. Spaghettis au thon) : préparé à la commande,
// jamais stocké en portions — pas de stock propre ni de seuil d'alerte, ce
// sont ses ingrédients qui portent le seuil
const withComposition = <T extends DiscountableProduct & { _count: { recipeItems: number } }>(
  { _count, ...product }: T
) => ({ ...serializeProduct(product), isComposed: _count.recipeItems > 0 });

// Accompagnements encore actifs, triés par nom : [{ id, name }]
const flattenSides = (sides: { sideProduct: { id: string; name: string; isActive: boolean } }[]) =>
  sides
    .map((s) => s.sideProduct)
    .filter((s) => s.isActive)
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

// PUT /api/products/:id/sides — accompagnements proposés avec un plat
export const updateProductSides = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { sideProductIds, sideRequired } = req.body as UpdateProductSidesInput;

  const product = await req.db.product.findFirst({ where: { id } });
  if (!product) return res.status(404).json({ message: 'Produit introuvable' });

  const ids = [...new Set(sideProductIds)].filter((x) => x !== id);
  // Les accompagnements doivent être des produits du même établissement
  const found = await req.db.product.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (found.length !== ids.length) return res.status(400).json({ message: 'Accompagnement introuvable' });

  await prisma.$transaction([
    prisma.productSide.deleteMany({ where: { productId: id } }),
    prisma.productSide.createMany({ data: ids.map((sideProductId) => ({ productId: id, sideProductId })) }),
    prisma.product.update({ where: { id }, data: { sideRequired: ids.length > 0 && sideRequired } }),
  ]);

  const sides = await prisma.productSide.findMany({
    where: { productId: id },
    include: { sideProduct: { select: { id: true, name: true, isActive: true } } },
  });
  res.status(200).json({ sides: flattenSides(sides), sideRequired: ids.length > 0 && sideRequired });
};

export const listProducts = async (req: Request, res: Response) => {
  const { categoryId, isActive } = req.query;

  const products = await req.db.product.findMany({
    where: {
      ...(categoryId ? { categoryId: categoryId as string } : {}),
      ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
    },
    include: {
      category: true,
      _count: { select: { recipeItems: true } },
      // Accompagnements proposés au POS quand on choisit ce plat
      sides: { include: { sideProduct: { select: { id: true, name: true, isActive: true } } } },
    },
    orderBy: { name: 'asc' },
  });

  res.status(200).json({
    products: products.map(({ sides, ...p }) => ({ ...withComposition(p), sides: flattenSides(sides) })),
  });
};

export const getProduct = async (req: Request, res: Response) => {
  const { id } = req.params;

  const product = await req.db.product.findFirst({
    where: { id },
    include: {
      category: true,
      recipeItems: { include: { ingredientProduct: true } },
      sides: { include: { sideProduct: { select: { id: true, name: true, isActive: true } } } },
    },
  });

  if (!product) {
    return res.status(404).json({ message: 'Produit introuvable' });
  }

  const { sides, ...rest } = product;
  res.status(200).json({
    product: { ...serializeProduct(rest), isComposed: product.recipeItems.length > 0, sides: flattenSides(sides) },
  });
};

export const createProduct = async (req: Request, res: Response) => {
  const data = req.body as CreateProductInput;
  const establishmentId = await resolveEstablishmentId(req);

  // Un produit doit appartenir à une catégorie EXISTANTE DU MÊME établissement —
  // sans ça, un client pourrait rattacher un produit à la catégorie d'un autre
  // établissement en devinant/forçant son id
  const category = await req.db.category.findFirst({
    where: { id: data.categoryId },
  });
  if (!category) {
    return res.status(400).json({ message: 'categoryId invalide pour cet établissement' });
  }

  const product = await prisma.product.create({
    data: { ...data, establishmentId },
    include: { category: true },
  });

  res.status(201).json({ product: serializeProduct(product) });
};

export const updateProduct = async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = req.body as UpdateProductInput;

  const existing = await req.db.product.findFirst({
    where: { id },
    include: { _count: { select: { recipeItems: true } } },
  });
  if (!existing) {
    return res.status(404).json({ message: 'Produit introuvable' });
  }

  if (data.categoryId) {
    const category = await req.db.category.findFirst({ where: { id: data.categoryId } });
    if (!category) {
      return res.status(400).json({ message: 'categoryId invalide pour cet établissement' });
    }
  }

  const isComposed = existing._count.recipeItems > 0;
  const product = await prisma.product.update({
    where: { id },
    // Un plat composé n'a pas de seuil d'alerte : il est porté par ses ingrédients
    data: isComposed ? { ...data, stockMin: 0 } : data,
    include: { category: true },
  });

  res.status(200).json({ product: serializeProduct(product) });
};

export const uploadProductImage = async (req: Request, res: Response) => {
  const { id } = req.params;

  const existing = await req.db.product.findFirst({ where: { id } });
  if (!existing) {
    return res.status(404).json({ message: 'Produit introuvable' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'Aucun fichier reçu' });
  }

  // Le fichier précédent n'est plus référencé par aucun produit une fois
  // remplacé : on le supprime pour éviter d'accumuler des orphelins sur le
  // disque (best-effort, une erreur ici ne doit pas faire échouer la requête)
  if (existing.image?.startsWith('/uploads/products/')) {
    const previousPath = path.join(PRODUCT_IMAGES_DIR, path.basename(existing.image));
    fs.unlink(previousPath, () => {});
  }

  const image = `/uploads/products/${req.file.filename}`;

  const product = await prisma.product.update({
    where: { id },
    data: { image },
    include: { category: true },
  });

  res.status(200).json({ product: serializeProduct(product) });
};

export const deleteProduct = async (req: Request, res: Response) => {
  const { id } = req.params;

  const existing = await req.db.product.findFirst({ where: { id } });
  if (!existing) {
    return res.status(404).json({ message: 'Produit introuvable' });
  }

  // Désactivation plutôt que suppression réelle : un produit déjà vendu est
  // référencé par des order_items / stock_movements qui doivent rester
  // consultables dans l'historique (et Postgres refuserait de toute façon la
  // suppression à cause des clés étrangères)
  const product = await prisma.product.update({
    where: { id },
    data: { isActive: false },
  });

  res.status(200).json({ product: serializeProduct(product) });
};
