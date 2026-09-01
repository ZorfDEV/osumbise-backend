import { useEffect, useState } from 'react';
import { api } from '@/lib/axios';
import { useAuth } from '@/features/auth/AuthContext';

// Un OWNER n'a pas d'établissement fixe (il peut en gérer plusieurs) : ce hook
// résout automatiquement le premier établissement de son organisation pour
// les écrans de création qui en ont besoin (catégories, produits, tables...).
// Les autres rôles ont déjà un establishmentId fixe, renvoyé directement sans
// appel réseau.
//
// Simplification assumée : un OWNER avec plusieurs établissements crée
// toujours dans le premier trouvé. Un vrai sélecteur "établissement actif"
// reste à construire si ce cas devient fréquent en pratique.
export const useDefaultEstablishmentId = (): string | undefined => {
  const { user } = useAuth();
  const [establishmentId, setEstablishmentId] = useState<string | undefined>(
    user?.establishmentId ?? undefined
  );

  useEffect(() => {
    if (!user?.establishmentId) {
      api.get('/establishments').then((res) => {
        const list = res.data.establishments;
        if (list.length > 0) setEstablishmentId(list[0].id);
      });
    }
  }, [user]);

  return establishmentId;
};
