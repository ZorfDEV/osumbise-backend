import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { applyPaymentResult } from '../services/subscriptionLifecycle.service';

// ✅ Format confirmé par la documentation Airtel Developer (Callback With/
// Without Authentication) pour l'application "osumbise" :
// {
//   "transaction": {
//     "id": "...",
//     "message": "...",
//     "status_code": "TS",              <- pas "status", bien "status_code"
//     "airtel_money_id": "..."
//   },
//   "hash": "..."                       <- seulement si l'authentification des
// }                                        callbacks est activée côté Airtel

// ⚠️ HYPOTHÈSE À VÉRIFIER EMPIRIQUEMENT : on suppose que le hash porte sur
// JSON.stringify({ transaction: {...} }) recalculé depuis notre lecture du
// corps, avec HmacSHA256 + la clé privée (AIRTEL_CALLBACK_PRIVATE_KEY,
// visible dans les paramètres de l'application sur le portail développeur),
// encodé en Base64. Tant que ce n'est pas confirmé par un vrai test sandbox,
// on se contente de LOGGUER un avertissement en cas de désaccord plutôt que
// de rejeter le webhook — un mauvais calcul de notre part ne doit pas
// bloquer un vrai paiement. À durcir (rejeter réellement) une fois vérifié.
function verifySignature(rawBody: Buffer | undefined, receivedHash: unknown): boolean {
  const privateKey = process.env.AIRTEL_CALLBACK_PRIVATE_KEY;
  if (!privateKey || typeof receivedHash !== 'string' || !rawBody) return false;

  try {
    const parsed = JSON.parse(rawBody.toString('utf-8'));
    const toSign = JSON.stringify({ transaction: parsed.transaction });
    const computed = crypto.createHmac('sha256', privateKey).update(toSign).digest('base64');
    return computed === receivedHash;
  } catch {
    return false;
  }
}

// POST /api/webhooks/airtel-money — appelé par Airtel, pas par un utilisateur
// de l'app. Le chemin réel est celui configuré dans les paramètres de
// l'application sur le portail développeur Airtel (le "/callback_path" de
// leur doc n'est qu'un nom d'exemple) — vérifie qu'il pointe bien vers cette
// route une fois déployé (ou vers ton URL ngrok + ce chemin en test local).
export const handleAirtelMoneyWebhook = async (req: Request, res: Response) => {
  const externalRef: string | undefined = req.body?.transaction?.id;
  const isSuccess: boolean = req.body?.transaction?.status_code === 'TS';

  if (!externalRef) {
    return res.status(400).json({ message: 'Référence de transaction manquante' });
  }

  if (req.body?.hash) {
    const isValid = verifySignature(req.rawBody, req.body.hash);
    if (!isValid) {
      console.warn(
        `[airtel-webhook] Signature non vérifiée pour la transaction ${externalRef} — ` +
          'à examiner avant de durcir la vérification (voir commentaire verifySignature).'
      );
    }
  }

  const payment = await prisma.subscriptionPayment.findUnique({ where: { externalRef } });

  if (!payment || payment.status !== 'PENDING') {
    // On répond 200 même si on ignore la notification : sinon Airtel
    // réessaiera indéfiniment pour un paiement déjà traité ou inconnu.
    return res.status(200).json({ received: true });
  }

  await applyPaymentResult(payment.id, isSuccess, req.body);

  res.status(200).json({ received: true });
};
