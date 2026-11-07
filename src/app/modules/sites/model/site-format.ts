import { formatCairoDate } from '@platform/i18n/intl-locale';
import type { Locale } from '@platform/i18n/locale.service';
import { SiteItemDataType } from './site-enums';
import type { SiteSchemaField } from './site-definition.model';
import type { SitePivotCell } from './site.model';

/** The number locale of the UI language (the capture grid's convention). */
export function numberLocale(locale: string): string {
  return locale === 'ar' ? 'ar-EG' : 'en-GB';
}

/** A number in the UI locale with at most `digits` decimals; null → "—". */
export function formatNumber(value: number | null | undefined, locale: string, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(numberLocale(locale), { maximumFractionDigits: digits }).format(
    value,
  );
}

/**
 * One pivot cell for display (S-5 read view, S-6 summaries, S-7 family columns): number + unit,
 * Yes/No, the option name in the UI language, the date in Africa/Cairo, or the text. Empty → "—".
 */
export function formatCell(
  f: Pick<SiteSchemaField, 'dataType' | 'unit'>,
  cell: SitePivotCell | null | undefined,
  locale: Locale,
  yesNo: (v: boolean) => string,
): string {
  if (!cell) return '—';
  switch (f.dataType) {
    case SiteItemDataType.Number:
      return cell.valueNumber == null
        ? '—'
        : `${formatNumber(cell.valueNumber, locale, 4)}${f.unit ? ' ' + f.unit : ''}`;
    case SiteItemDataType.Bool:
      return cell.valueBool == null ? '—' : yesNo(cell.valueBool);
    case SiteItemDataType.Select:
      return (
        (locale === 'ar'
          ? cell.optionNameAr || cell.optionNameEn
          : cell.optionNameEn || cell.optionNameAr) ?? '—'
      );
    case SiteItemDataType.Date:
      return cell.valueDate ? formatCairoDate(`${cell.valueDate}T12:00:00Z`, locale) : '—';
    default:
      return cell.valueText ?? '—';
  }
}
