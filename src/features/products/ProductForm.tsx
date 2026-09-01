import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Category } from './types';

const productFormSchema = z.object({
  categoryId: z.string().uuid('Choisis une catégorie'),
  name: z.string().min(2, 'Le nom est requis'),
  sellingPrice: z.number().nonnegative(),
  cost: z.number().nonnegative().optional(),
  unit: z.enum(['UNIT', 'G', 'KG', 'ML', 'CL', 'L']),
  stockMin: z.number().nonnegative().optional(),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

interface Props {
  categories: Category[];
  defaultValues?: Partial<ProductFormValues>;
  submitLabel: string;
  onSubmit: (data: ProductFormValues) => Promise<void>;
  onCancel?: () => void;
}

export default function ProductForm({
  categories,
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
}: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: { unit: 'UNIT', ...defaultValues },
  });

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-3"
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Nom</label>
        <input
          {...register('name')}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Catégorie</label>
        <select
          {...register('categoryId')}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">— Choisir —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.categoryId && (
          <p className="mt-1 text-xs text-red-600">{errors.categoryId.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Unité</label>
        <select
          {...register('unit')}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="UNIT">Unité</option>
          <option value="G">Gramme</option>
          <option value="KG">Kilogramme</option>
          <option value="ML">Millilitre</option>
          <option value="CL">Centilitre</option>
          <option value="L">Litre</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Prix de vente (FCFA)
        </label>
        <input
          type="number"
          step="1"
          {...register('sellingPrice', { valueAsNumber: true })}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        {errors.sellingPrice && (
          <p className="mt-1 text-xs text-red-600">{errors.sellingPrice.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Coût d’achat (FCFA)
        </label>
        <input
          type="number"
          step="1"
          {...register('cost', { valueAsNumber: true })}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Seuil d’alerte stock
        </label>
        <input
          type="number"
          step="1"
          {...register('stockMin', { valueAsNumber: true })}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex gap-3 sm:col-span-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {isSubmitting ? 'Enregistrement...' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
