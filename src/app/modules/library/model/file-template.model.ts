/**
 * Sync F3: mirrors `FileTemplateResponse` (dms Documents.Contracts/FileTemplates). `category` is the
 * `FileTemplateCategory` enum NAME as a string (Documents.Domain/FileTemplateCategory.cs).
 */
export interface FileTemplate {
  id: string;
  name: string;
  description: string | null;
  category: FileTemplateCategory;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  isActive: boolean;
}

/** `FileTemplateCategory` by name, in enum order (Other = 0 … Archive = 5). */
export const FILE_TEMPLATE_CATEGORIES = [
  'Other',
  'Cad',
  'Document',
  'Spreadsheet',
  'Image',
  'Archive',
] as const;
export type FileTemplateCategory = (typeof FILE_TEMPLATE_CATEGORIES)[number];

/** `UpdateFileTemplateRequest { name, category, description? }` (FileTemplateEndpoints.cs:101). */
export interface FileTemplateInput {
  name: string;
  category: FileTemplateCategory;
  description: string | null;
}
