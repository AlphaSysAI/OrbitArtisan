export type WorkCategory = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

export type WorkItem = {
  id: string;
  user_id: string;
  category_id: string | null;
  reference: string | null;
  title: string;
  description: string | null;
  unit: string;
  unit_price_ht: number;
  default_vat_rate: number;
  labor_cost: number;
  material_cost: number;
  estimated_hours: number;
  created_at: string;
  updated_at: string;
};

export type WorkItemWithCategory = WorkItem & {
  category_name: string | null;
};

export type WorkItemInput = {
  id?: string;
  category_id?: string | null;
  reference?: string | null;
  title: string;
  description?: string | null;
  unit: string;
  unit_price_ht: number;
  default_vat_rate: number;
  labor_cost: number;
  material_cost: number;
  estimated_hours: number;
};

export type WorkItemCsvRow = {
  reference: string;
  title: string;
  description: string;
  category: string;
  unit: string;
  unit_price_ht: number;
  default_vat_rate: number;
  labor_cost: number;
  material_cost: number;
  estimated_hours: number;
};
