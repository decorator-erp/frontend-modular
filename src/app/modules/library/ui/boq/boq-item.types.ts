export type BoqDiscipline = 'Joinery' | 'Stone' | 'Tile' | 'Lighting' | 'MEP' | 'Finishing';

export type BoqUnit = 'm' | 'm²' | 'm³' | 'pc' | 'set';

export type BoqStatus = 'Draft' | 'Pending quote' | 'Quoted' | 'Approved' | 'Issued' | 'Delivered';

export interface BoqItem {
  id: string;
  code: string;
  itemName: string;
  itemNameAr?: string;
  discipline: BoqDiscipline;
  spec: string;
  quantity: number;
  unit: BoqUnit;
  unitRate: number;
  total: number;
  vendorId?: string;
  vendorName?: string;
  status: BoqStatus;
  updatedAt: string;
}
