export type MaterialDiscipline =
  | 'Stone'
  | 'Tile'
  | 'Joinery'
  | 'Fabric'
  | 'Paint'
  | 'Lighting'
  | 'Hardware'
  | 'Plumbing'
  | 'Glass'
  | 'Wood';

export interface MaterialVendor {
  vendorId: string;
  name: string;
  price: number;
  leadTime: number;
}

export interface Material {
  id: string;
  name: string;
  nameAr?: string;
  brand: string;
  code: string;
  discipline: MaterialDiscipline;
  /** Legitimate exception — real physical material colour. */
  swatchHex: string;
  pricePerSqm?: number;
  unit: 'm²' | 'pc' | 'm';
  leadTimeDays: number;
  countryOfOrigin: string;
  vendors: MaterialVendor[];
  usedInProjects: number;
  status: 'Available' | 'Discontinued' | 'On-order';
  certifications?: string[];
}
