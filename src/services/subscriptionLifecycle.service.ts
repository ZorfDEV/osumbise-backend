import { prisma } from '../config/prisma';

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
  const payment = await prisma.subscriptionPayment.update({
    where: { id: paymentId },
    data: {
      status: isSuccess ? 'SUCCESS' : 'FAILED',
      providerResponse: rawResponse as object,
    },
  });

  if (isSuccess) {
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await prisma.subscription.update({
      where: { id: payment.subscriptionId },
      data: { status: 'ACTIVE', currentPeriodEnd: periodEnd },
    });
  }

  return payment;
}
