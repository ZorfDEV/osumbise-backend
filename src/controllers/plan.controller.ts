import { Request, Response } from 'express';
import { prisma } from '../config/prisma';

// GET /api/plans — public, consommé par la page d'inscription pour afficher
// les formules disponibles avant même la création d'un compte
export const listPlans = async (_req: Request, res: Response) => {
  const plans = await prisma.plan.findMany({ orderBy: { price: 'asc' } });
  res.status(200).json({ plans });
};
