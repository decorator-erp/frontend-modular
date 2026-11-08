import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '@platform/http/api.service';
import { handled } from '@platform/http/handled-errors';
import { CatalogAttributeType } from '../model/crm-enums';
import type { CatalogItem, ItemAttributeValue } from '../model';

/**
 * Sync F4f (S10): `GET /api/crm/catalog/items/{itemId}` → `CrmCatalogItemDetailResponse` — the item
 * fields, `descriptionEn/Ar` + `imageUri` (S9) and `attributeValues` (`{ attributeId, valueText?,
 * valueNumber?, valueBool?, valueDate?, optionId? }`), `crm.catalog.read`; 404 = missing item. A
 * response without the S9/S10 fields reads as no description, image or values. Apart from
 * `CrmCatalogService` so only the lazy item dialog pulls it in; values are written through
 * `CrmCatalogService.setItemAttributeValues`.
 */
@Injectable({ providedIn: 'root' })
export class CrmCatalogItemDetailService extends ApiService {
  getItemDetail(itemId: string): Observable<CatalogItem> {
    return this.get<unknown>(`/crm/catalog/items/${itemId}`, undefined, {
      context: handled(404),
    }).pipe(map((r) => this.normalize(this.unwrap<unknown>(r))));
  }

  private normalize(source: unknown): CatalogItem {
    const values = this.field<unknown[]>(source, 'attributeValues', 'attributes') ?? [];
    return {
      id: this.field<string>(source, 'id') ?? '',
      categoryId: this.field<string>(source, 'categoryId') ?? '',
      code: this.field<string>(source, 'code') ?? '',
      nameEn: this.field<string>(source, 'nameEn') ?? '',
      nameAr: this.field<string>(source, 'nameAr') ?? '',
      descriptionEn: this.field<string | null>(source, 'descriptionEn') ?? null,
      descriptionAr: this.field<string | null>(source, 'descriptionAr') ?? null,
      imageUri: this.field<string | null>(source, 'imageUri') ?? null,
      isPurchasable: this.field<boolean>(source, 'isPurchasable') ?? true,
      sortOrder: this.field<number>(source, 'sortOrder') ?? 0,
      isActive: this.field<boolean>(source, 'isActive') ?? true,
      attributes: values.map((v) => this.value(v)),
      trackKey: this.trackKeyFor(source, 'CatalogItemDetail.id', 'id'),
    };
  }

  /** A `CatalogAttributeValueData`; the definition fields come from the category chain, not here. */
  private value(source: unknown): ItemAttributeValue {
    return {
      attributeId: this.field<string>(source, 'attributeId') ?? '',
      code: this.field<string>(source, 'code') ?? '',
      nameEn: this.field<string>(source, 'nameEn') ?? '',
      nameAr: this.field<string>(source, 'nameAr') ?? '',
      dataType: this.field<number>(source, 'dataType') ?? CatalogAttributeType.Text,
      unit: this.field<string | null>(source, 'unit') ?? null,
      valueText: this.field<string | null>(source, 'valueText') ?? null,
      valueNumber: this.field<number | null>(source, 'valueNumber') ?? null,
      valueBool: this.field<boolean | null>(source, 'valueBool') ?? null,
      valueDate: this.field<string | null>(source, 'valueDate') ?? null,
      optionId: this.field<string | null>(source, 'optionId') ?? null,
      optionNameEn: this.field<string | null>(source, 'optionNameEn') ?? null,
      optionNameAr: this.field<string | null>(source, 'optionNameAr') ?? null,
    };
  }
}
