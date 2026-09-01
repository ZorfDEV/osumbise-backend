export type EstablishmentType = 'BAR' | 'RESTAURANT' | 'HOTEL';

export interface Establishment {
  id: string;
  name: string;
  type: EstablishmentType;
  address: string | null;
}
