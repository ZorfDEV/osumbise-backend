import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/prisma';

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
// le résultat est seulement écrit dans les journaux : il permettra de vérifier
// le calcul sur de vraies notifications avant de réactiver la validation
// automatique.
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
//
// Route publique : n'importe qui peut envoyer un faux « paiement réussi ». La
// notification n'active donc AUCUN abonnement et ne modifie pas le paiement,
// qui reste PENDING jusqu'à la réponse d'Airtel à notre propre demande
// (getPaymentStatus) ou sa validation par l'administrateur de la plateforme.
export const handleAirtelMoneyWebhook = async (req: Request, res: Response) => {
  const externalRef: unknown = req.body?.transaction?.id;

  if (typeof externalRef !== 'string' || !externalRef) {
    return res.status(400).json({ message: 'Référence de transaction manquante' });
  }

  const payment = await prisma.subscriptionPayment.findUnique({
    where: { externalRef },
    select: { id: true, status: true },
  });

  if (payment?.status === 'PENDING') {
    const signature = verifySignature(req.rawBody, req.body?.hash) ? 'valide' : 'absente ou non vérifiée';
    console.warn(
      `[airtel-webhook] Notification reçue pour le paiement ${payment.id} (signature ${signature}) : à valider par l'administrateur de la plateforme`
    );
  }

  // Toujours 200 : sinon Airtel réessaierait indéfiniment, et la réponse ne
  // révèle pas si la référence existe
  res.status(200).json({ received: true });
};
