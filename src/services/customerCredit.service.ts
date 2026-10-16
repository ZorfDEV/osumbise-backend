// Compte client (« ardoise ») : un client connu consomme maintenant et paie
// plus tard. Le montant dû s'ajoute à Customer.balance ; le plafond
// (creditLimit), s'il est renseigné, ne peut pas être dépassé.

interface CreditCustomer {
  name: string;
  isActive: boolean;
  balance: unknown;
  creditLimit: unknown;
}

const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;

export const assertCreditAllowed = (customer: CreditCustomer, amount: number) => {
  if (!customer.isActive) {
    throw Object.assign(new Error(`Le compte de ${customer.name} est désactivé`), { status: 400 });
  }
  if (customer.creditLimit === null || customer.creditLimit === undefined) return;

  const balance = Number(customer.balance);
  const limit = Number(customer.creditLimit);
  if (balance + amount > limit) {
    const available = Math.max(0, limit - balance);
    throw Object.assign(
      new Error(
        `Plafond de crédit dépassé pour ${customer.name} : ${fcfa(balance)} déjà dus, plafond ${fcfa(limit)} — reste ${fcfa(available)} disponible`
      ),
      { status: 400 }
    );
  }
};
