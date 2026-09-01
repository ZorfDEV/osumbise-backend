import { api } from '@/lib/axios';
import { AppUser, AssignableRole } from './types';

export const fetchUsers = async (): Promise<AppUser[]> => {
  const res = await api.get('/users');
  return res.data.users;
};

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: AssignableRole;
  establishmentId?: string;
}

export const createUser = async (payload: CreateUserPayload): Promise<AppUser> => {
  const res = await api.post('/users', payload);
  return res.data.user;
};

export interface UpdateUserPayload {
  role?: AssignableRole;
  isActive?: boolean;
}

export const updateUser = async (id: string, payload: UpdateUserPayload): Promise<AppUser> => {
  const res = await api.patch(`/users/${id}`, payload);
  return res.data.user;
};
