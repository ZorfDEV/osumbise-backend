import { prisma } from '../config/prisma';
import { checkCollectionStatus } from './airtelMoney.service';

// Interroge Airtel pour connaître le vrai statut d'une transaction et applique
// le résultat s'il est définitif. C'est la seule source de vérité : le corps
// d'un webhook peut être forgé par n'importe qui, il ne sert que de signal.
// ⚠️ Forme exacte de la réponse à confirmer une fois la doc Gabon en main.
export async function syncPaymentWithAirtel(paymentId: string, externalRef: string) {
  const statusData = (await checkCollectionStatus(externalRef)) as {
    data?: { transaction?: { status?: string } };
    transaction?: { status?: string };
  };
  const txStatus = statusData?.data?.transaction?.status ?? statusData?.transaction?.status;

  if (txStatus === 'TS') return applyPaymentResult(paymentId, true, statusData);
  if (txStatus === 'TF' || txStatus === 'TA') return applyPaymentResult(paymentId, false, statusData);
  // sinon : toujours en cours côté Airtel, rien à changer
  return null;
}

// Applique le résultat d'un paiement (succès ou échec) : met à jour le
// paiement, et en cas de succès, active/prolonge l'abonnement d'un mois.
// Partagé entre le webhook (notification poussée par Airtel) et le sondage
// actif de secours (utile notamment en développement local, où Airtel ne
// peut pas nous notifier directement sur localhost — voir getPaymentStatus).
export async function applyPaymentResult(
  paymentId: string,
  isSuccess: boolean,
  rawResponse: unknown
) {
  // Seulement depuis PENDING : un webhook et un sondage simultanés ne doivent
  // pas prolonger l'abonnement deux fois pour un seul paiement
  const { count } = await prisma.subscriptionPayment.updateMany({
    where: { id: paymentId, status: 'PENDING' },
    data: {
      status: isSuccess ? 'SUCCESS' : 'FAILED',
      providerResponse: rawResponse as object,
    },
  });
  const payment = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: paymentId } });

  if (isSuccess && count > 0) {
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await prisma.subscription.update({
      where: { id: payment.subscriptionId },
      data: { status: 'ACTIVE', currentPeriodEnd: periodEnd },
    });
  }

  return payment;
}
