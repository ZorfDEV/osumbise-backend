import axios from 'axios';

// URLs confirmées par la documentation Airtel Developer (section "Base URLs")
// pour l'application "osumbise", Gabon
const BASE_URL =
  process.env.AIRTEL_ENV === 'production'
    ? 'https://openapi.airtel.ga'
    : 'https://openapiuat.airtel.ga';




let cachedToken: { value: string; expiresAt: number } | null = null;

// Authentification OAuth2 client_credentials — confirmée identique sur tous
// les pays Airtel Money d'après la documentation publique consultée.
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const res = await axios.post(`${BASE_URL}/auth/oauth2/token`, {
    client_id: process.env.AIRTEL_CLIENT_ID,
    client_secret: process.env.AIRTEL_CLIENT_SECRET,
    grant_type: 'client_credentials',
  });

  const { access_token, expires_in } = res.data as {
    access_token: string;
    expires_in: number;
  };

  // Marge de sécurité de 60s avant l'expiration réelle du jeton
  cachedToken = { value: access_token, expiresAt: Date.now() + (expires_in - 60) * 1000 };
  return access_token;
}

interface InitiateCollectionParams {
  phone: string; // numéro Airtel Money du client, sans le préfixe pays
  amount: number;
  reference: string; // notre propre référence (ex. l'id du SubscriptionPayment)
}

interface CollectionResult {
  externalRef: string;
  raw: unknown;
}

// ✅ Chemin et en-têtes confirmés par la documentation Airtel Developer
// (Collection-APIs > Payments - USSD Push) pour l'application "osumbise".
//
// ⚠️ CHIFFREMENT MANQUANT : x-signature (payload chiffré) et x-key (clé AES
// + iv chiffrés en RSA) sont exigés mais pas encore implémentés — il manque
// la clé publique RSA d'Airtel et le détail exact de l'algorithme
// (padding RSA, mode AES...). Tant que ces deux en-têtes ne sont pas
// correctement calculés, cet appel échouera. Voir buildEncryptedHeaders
// ci-dessous : à compléter dès qu'on a ces informations.
//
// ⚠️ X-Country/X-Currency : la doc montre l'exemple 'CFA'/'GA' (inversé par
// rapport à l'intuition GA=pays, CFA=devise) — on suit leur exemple à la
// lettre ; à inverser si l'appel échoue avec une erreur de pays/devise.
export async function initiateCollection({
  phone,
  amount,
  reference,
}: InitiateCollectionParams): Promise<CollectionResult> {
  const token = await getAccessToken();
  const encryptedHeaders = buildEncryptedHeaders({ phone /* , pin si requis */ });

  const res = await axios.post(
    `${BASE_URL}/merchant/v2/payments/`,
    {
      reference,
      subscriber: { country: 'CFA', currency: 'GA', msisdn: phone },
      transaction: { amount, country: 'CFA', currency: 'GA', id: reference },
    },
    {
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/json',
        'X-Country': 'CFA',
        'X-Currency': 'GA',
        Authorization: `Bearer ${token}`,
        ...encryptedHeaders, // x-signature, x-key
      },
    }
  );

  const externalRef =
    res.data?.data?.transaction?.id ?? res.data?.transaction?.id ?? reference;

  return { externalRef, raw: res.data };
}

// ⚠️ SQUELETTE À COMPLÉTER — nécessite la clé publique RSA fournie par
// Airtel (généralement téléchargeable depuis le tableau de bord développeur,
// section Sécurité/Certificats) et la confirmation de l'algorithme exact
// (probablement : générer une clé AES + iv aléatoires, chiffrer le payload
// sensible en AES -> x-signature, chiffrer la clé AES+iv avec la clé
// publique RSA d'Airtel -> x-key). Retourne un objet vide pour l'instant :
// tant que ceci n'est pas complété, initiateCollection échouera à l'appel.
function buildEncryptedHeaders(_data: { phone: string }): Record<string, string> {
  return {};
}

// Vérifie manuellement le statut d'une transaction — utile si le webhook
// tarde ou échoue à nous notifier.
// ⚠️ Chemin non confirmé — la doc partagée ne couvrait que "Payments - USSD
// Push" ; la page "Transaction Enquiry" du même menu (visible dans la doc
// Collection-APIs) donnera le chemin exact.
export async function checkCollectionStatus(externalRef: string): Promise<unknown> {
  const token = await getAccessToken();

  const res = await axios.get(`${BASE_URL}/standard/v1/payments/${externalRef}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Country': 'CFA',
      'X-Currency': 'GA',
    },
  });

  return res.data;
}
