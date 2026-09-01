export const assertInScope = async <T>(
  finder: () => Promise<T | null>,
  message = 'Ressource introuvable'
): Promise<T> => {
  const record = await finder();
  if (!record) {
    throw Object.assign(new Error(message), { status: 404 });
  }
  return record;
};
