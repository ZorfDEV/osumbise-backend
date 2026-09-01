export interface TopProduct {
  productId: string;
  name: string;
  quantity: number;
}

export interface TopCategory {
  categoryId: string;
  name: string;
  profit: number;
}

export interface DashboardSummary {
  period: { start: string; end: string };
  revenue: number;
  orderCount: number;
  clientCount: number;
  averageBasket: number;
  profit: number;
  merchandiseCost: number;
  expenses: number;
  margin: number;
  paymentBreakdown: Record<string, number>;
  topProducts: TopProduct[];
  topCategories: TopCategory[];
}

export interface HourlySales {
  period: { start: string; end: string };
  hourly: { hour: number; revenue: number }[];
}

export interface StaffPerformance {
  period: { start: string; end: string };
  staff: {
    userId: string;
    name: string;
    ordersCreated: number;
    revenue: number;
    cancelled: number;
  }[];
}
