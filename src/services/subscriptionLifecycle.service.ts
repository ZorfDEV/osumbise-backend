import { prisma } from '../config/prisma';

// Applique le résultat d'un paiement (succès ou échec) : met à jour le
// paiement, et en cas de succès, active/prolonge l'abonnement d'un mois.
// Appelé quand Airtel répond à notre propre demande (getPaymentStatus) ou
// quand l'administrateur de la plateforme tranche. Un paiement n'est traité
// qu'une fois : sans effet s'il n'est plus PENDING (applied: false).
// requireFullAmount : un paiement inférieur au prix de la formule (changée
// depuis) n'active rien et attend la décision de l'administrateur.
export async function applyPaymentResult(
  paymentId: string,
  isSuccess: boolean,
  rawResponse?: unknown,
  options: { requireFullAmount?: boolean } = {}
) {
  return prisma.$transaction(async (tx) => {
    let checkedPlanId: string | undefined;
    if (isSuccess && options.requireFullAmount) {
      const current = await tx.subscriptionPayment.findUniqueOrThrow({
        where: { id: paymentId },
        include: { subscription: { include: { plan: true } } },
      });
      if (Number(current.amount) < Number(current.subscription.plan.price)) {
        const { subscription: _subscription, ...payment } = current;
        return { payment, applied: false };
      }
      checkedPlanId = current.subscription.planId;
    }

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

      // Formule changée depuis la vérification du montant : tout est annulé, le
      // paiement reste PENDING
      const activated = await tx.subscription.updateMany({
        where: { id: payment.subscriptionId, planId: checkedPlanId },
        data: { status: 'ACTIVE', currentPeriodEnd: periodEnd },
      });
      if (activated.count === 0) throw new Error('Formule modifiée pendant la validation du paiement');
    }

    return { payment, applied: count > 0 };
  });
}
