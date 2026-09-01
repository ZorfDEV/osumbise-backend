import { api } from '@/lib/axios';
import { DashboardSummary, HourlySales, StaffPerformance } from './types';

export const fetchDashboardSummary = async (date?: string): Promise<DashboardSummary> => {
  const res = await api.get('/dashboard/summary', { params: date ? { date } : undefined });
  return res.data;
};

export const fetchHourlySales = async (date?: string): Promise<HourlySales> => {
  const res = await api.get('/dashboard/hourly-sales', { params: date ? { date } : undefined });
  return res.data;
};

export const fetchStaffPerformance = async (date?: string): Promise<StaffPerformance> => {
  const res = await api.get('/dashboard/staff-performance', {
    params: date ? { date } : undefined,
  });
  return res.data;
};
