import { prisma } from '../config/prisma';
import { Role } from '@prisma/client';

export interface TenantContext {
  organizationId: string;
  establishmentId: string | null;
  role: Role;
}

// Chemin (depuis chaque modèle, potentiellement via une relation) vers le champ
// qui identifie le tenant.
// scope 'organization' : la ligne appartient directement à une organisation.
// scope 'establishment' : la ligne appartient (directement ou via une relation)
// à un établissement.
const MODEL_SCOPES: Record<
  string,
  { path: string; scope: 'organization' | 'establishment' }
> = {
  User: { path: 'organizationId', scope: 'organization' },
  Establishment: { path: 'organizationId', scope: 'organization' },
  AuditLog: { path: 'organizationId', scope: 'organization' },
  Subscription: { path: 'organizationId', scope: 'organization' },

  Category: { path: 'establishmentId', scope: 'establishment' },
  Product: { path: 'establishmentId', scope: 'establishment' },
  DiningTable: { path: 'establishmentId', scope: 'establishment' },
  Order: { path: 'establishmentId', scope: 'establishment' },
  CashRegister: { path: 'establishmentId', scope: 'establishment' },

  RecipeItem: { path: 'product.establishmentId', scope: 'establishment' },
  OrderItem: { path: 'order.establishmentId', scope: 'establishment' },
  OrderStatusHistory: { path: 'order.establishmentId', scope: 'establishment' },
  Payment: { path: 'order.establishmentId', scope: 'establishment' },
  StockMovement: { path: 'product.establishmentId', scope: 'establishment' },
  CashSession: { path: 'cashRegister.establishmentId', scope: 'establishment' },
  CashMovement: {
    path: 'cashSession.cashRegister.establishmentId',
    scope: 'establishment',
  },

  Supplier: { path: 'establishmentId', scope: 'establishment' },
  PurchaseOrder: { path: 'establishmentId', scope: 'establishment' },
  PurchaseItem: { path: 'purchaseOrder.establishmentId', scope: 'establishment' },

  ExpenseCategory: { path: 'establishmentId', scope: 'establishment' },
  Expense: { path: 'establishmentId', scope: 'establishment' },
};

// Opérations pour lesquelles Prisma accepte de façon fiable des filtres `where`
// additionnels. findUnique/update/delete (par id) sont volontairement exclues :
// Prisma n'y accepte que les champs de la contrainte unique. Pour un accès par id,
// utilise `findFirst` (couvert ici) pour vérifier l'appartenance au tenant AVANT
// d'appeler `update`/`delete` — voir l'exemple en bas de fichier.
const FILTERABLE_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'updateMany',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

const buildNestedWhere = (path: string, value: string): Record<string, unknown> =>
  path
    .split('.')
    .reduceRight((acc, key) => ({ [key]: acc }), value as unknown as Record<string, unknown>);

// 'product.establishmentId' -> 'product.establishment.organizationId'
const toOrganizationPath = (path: string): string =>
  path.replace(/establishmentId$/, 'establishment.organizationId');

export const getScopedPrisma = (user: TenantContext) => {
  return prisma.$extends({
    name: 'tenantScope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const config = model ? MODEL_SCOPES[model] : undefined;

          if (config && FILTERABLE_OPERATIONS.has(operation)) {
            let scopeWhere: Record<string, unknown>;

            if (config.scope === 'organization') {
              scopeWhere = buildNestedWhere(config.path, user.organizationId);
            } else if (user.establishmentId) {
              // Rôles limités à un seul établissement (tous sauf OWNER)
              scopeWhere = buildNestedWhere(config.path, user.establishmentId);
            } else {
              // OWNER sans établissement fixe : accès à tous les établissements
              // de son organisation
              scopeWhere = buildNestedWhere(
                toOrganizationPath(config.path),
                user.organizationId
              );
            }

            // AND plutôt que spread : évite toute collision si le controller
            // avait déjà un filtre sur le même champ
            args.where = { AND: [args.where ?? {}, scopeWhere] };
          }

          return query(args);
        },
      },
    },
  });
};

export type ScopedPrismaClient = ReturnType<typeof getScopedPrisma>;

// Exemple d'usage sûr pour un accès par id (dans un controller) :
//
//   const product = await req.db.product.findFirst({ where: { id } }); // scopé
//   if (!product) return res.status(404).json({ message: 'Introuvable' });
//   await prisma.product.update({ where: { id }, data }); // sûr : l'appartenance
//                                                          // vient d'être vérifiée
