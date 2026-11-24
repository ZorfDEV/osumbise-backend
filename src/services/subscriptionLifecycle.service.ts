import { prisma } from '../config/prisma';

// Applique le résultat d'un paiement (succès ou échec) : met à jour le
// paiement, et en cas de succès, active/prolonge l'abonnement d'un mois.
// Appelé quand Airtel répond à notre propre demande (getPaymentStatus) ou
// quand l'administrateur de la plateforme tranche. Un paiement n'est traité
// qu'une fois : sans effet s'il n'est plus PENDING (applied: false).
export async function applyPaymentResult(
  paymentId: string,
  isSuccess: boolean,
  rawResponse?: unknown
) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.subscriptionPayment.updateMany({
      where: { id: paymentId, status: 'PENDING' },
      data: {
        status: isSuccess ? 'SUCCESS' : 'FAILED',
        ...(rawResponse === undefined ? {} : { providerResponse: rawResponse as object }),
      },
    });
    const payment = await tx.subscriptionPayment.findUniqueOrThrow({ where: { id: paymentId } });

    if (isSuccess && count > 0) {
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await tx.subscription.update({
        where: { id: payment.subscriptionId },
        data: { status: 'ACTIVE', currentPeriodEnd: periodEnd },
      });
    }

    return { payment, applied: count > 0 };
  });
}
