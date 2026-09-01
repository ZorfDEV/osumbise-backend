import { api } from '@/lib/axios';
import { Establishment } from './types';

export const fetchEstablishments = async (): Promise<Establishment[]> => {
  const res = await api.get('/establishments');
  return res.data.establishments;
};

export interface EstablishmentPayload {
  name: string;
  type: string;
  address?: string;
}

export const createEstablishment = async (
  payload: EstablishmentPayload
): Promise<Establishment> => {
  const res = await api.post('/establishments', payload);
  return res.data.establishment;
};

export const updateEstablishment = async (
  id: string,
  payload: Partial<EstablishmentPayload>
): Promise<Establishment> => {
  const res = await api.patch(`/establishments/${id}`, payload);
  return res.data.establishment;
};
