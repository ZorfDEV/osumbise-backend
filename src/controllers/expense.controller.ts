import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { resolveEstablishmentId } from '../utils/resolveEstablishmentId';
import { assertInScope } from '../utils/assertInScope';
import {
  CreateExpenseCategoryInput,
  CreateExpenseInput,
} from '../validators/expense.validator';

export const listExpenseCategories = async (req: Request, res: Response) => {
  const categories = await req.db.expenseCategory.findMany({ orderBy: { name: 'asc' } });
  res.status(200).json({ categories });
};

export const createExpenseCategory = async (req: Request, res: Response) => {
  const { name } = req.body as CreateExpenseCategoryInput;
  const establishmentId = await resolveEstablishmentId(req);

  const category = await prisma.expenseCategory.create({
    data: { name, establishmentId },
  });

  res.status(201).json({ category });
};

export const listExpenses = async (req: Request, res: Response) => {
  const { startDate, endDate, expenseCategoryId } = req.query as Record<
    string,
    string | undefined
  >;

  const expenses = await req.db.expense.findMany({
    where: {
      ...(expenseCategoryId ? { expenseCategoryId } : {}),
      ...(startDate && endDate
        ? { createdAt: { gte: new Date(startDate), lt: new Date(endDate) } }
        : {}),
    },
    include: {
      expenseCategory: { select: { name: true } },
      user: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json({ expenses });
};

export const createExpense = async (req: Request, res: Response) => {
  const { expenseCategoryId, amount, note } = req.body as CreateExpenseInput;
  const establishmentId = await resolveEstablishmentId(req);

  await assertInScope(
    () => req.db.expenseCategory.findFirst({ where: { id: expenseCategoryId } }),
    'Catégorie de dépense introuvable'
  );

  const expense = await prisma.expense.create({
    data: { establishmentId, expenseCategoryId, amount, note, userId: req.user!.id },
    include: { expenseCategory: { select: { name: true } } },
  });

  res.status(201).json({ expense });
};
