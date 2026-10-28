import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CatalogService } from '@platform/i18n/catalog.service';
import { LocaleService } from '@platform/i18n';
import { HiringReason } from '../../model/crm-enums';
import { HEAD_DIFF_FIELD_KEYS, formatHeadDiffValue, headDiffFieldLabel } from './head-diff-format';

describe('headDiffFieldLabel / formatHeadDiffValue', () => {
  let catalog: CatalogService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [CatalogService, LocaleService] });
    catalog = TestBed.inject(CatalogService);
  });

  describe('headDiffFieldLabel', () => {
    it('resolves every PascalCase field the backend Flatten() emits to a real label', () => {
      const fields = [
        'UnitType',
        'UnitCondition',
        'Address',
        'FloorNo',
        'UnitsPerFloor',
        'AreaSqm',
        'BuildingKind',
        'IsLicensed',
        'Position',
        'ElevatorStatus',
        'UtilityMetersNote',
        'ReceivesFrequentVisitors',
        'VisitorsNote',
        'ParentsHobbies',
        'ChildrenHobbies',
        'HobbiesInDesign',
        'UsedDesignerBefore',
        'DesignerExperience',
        'DesignerExperienceReason',
        'HiringReasons',
        'PreferredStyle',
        'PreferredColors',
        'FurnitureStatus',
        'ExpectedBudget',
        'TimelinePressure',
        'ArchitecturalRequests',
        'OtherNeeds',
        'LastMeetingId',
      ];
      for (const field of fields) {
        expect(HEAD_DIFF_FIELD_KEYS[field]).toBeDefined();
        expect(headDiffFieldLabel(field, catalog)).toBe(catalog.t(HEAD_DIFF_FIELD_KEYS[field]));
      }
    });

    it('falls back to the raw field name for an unknown field, rather than throwing', () => {
      expect(headDiffFieldLabel('SomeFutureField', catalog)).toBe('SomeFutureField');
    });
  });

  describe('formatHeadDiffValue', () => {
    it('renders null as an em dash, for any field', () => {
      expect(formatHeadDiffValue('Address', null, catalog)).toBe('—');
      expect(formatHeadDiffValue('UnitType', null, catalog)).toBe('—');
    });

    it("translates an enum field's bare integer through its option catalog key", () => {
      expect(formatHeadDiffValue('UnitType', '2', catalog)).toBe(catalog.t('brief.optVilla'));
    });

    it('translates lowercase "true"/"false" bool fields to Yes/No — never the raw string', () => {
      expect(formatHeadDiffValue('IsLicensed', 'true', catalog)).toBe(catalog.t('common.yes'));
      expect(formatHeadDiffValue('ReceivesFrequentVisitors', 'false', catalog)).toBe(
        catalog.t('common.no'),
      );
    });

    it('decomposes the HiringReasons bitmask into every set flag, joined', () => {
      const mask = HiringReason.ReliefFromCraftsmen | HiringReason.OrganizeAndComfort;
      const result = formatHeadDiffValue('HiringReasons', String(mask), catalog);
      expect(result).toContain(catalog.t('brief.optHiringRelief'));
      expect(result).toContain(catalog.t('brief.optHiringOrganize'));
      expect(result).not.toContain(catalog.t('brief.optHiringSaveTime'));
    });

    it('renders HiringReasons=0 (None) as an em dash, not an empty join', () => {
      expect(formatHeadDiffValue('HiringReasons', '0', catalog)).toBe('—');
    });

    it('passes a plain scalar field through as-is', () => {
      expect(formatHeadDiffValue('Address', 'Plot 12, El-Horyia district', catalog)).toBe(
        'Plot 12, El-Horyia district',
      );
      expect(formatHeadDiffValue('AreaSqm', '180', catalog)).toBe('180');
    });

    it('falls back to the raw value if an enum integer has no matching option', () => {
      expect(formatHeadDiffValue('UnitType', '99', catalog)).toBe('99');
    });

    it('renders IsRented through the tenure labels — not Yes/No', () => {
      expect(formatHeadDiffValue('IsRented', 'true', catalog)).toBe(catalog.t('tenure.rent'));
      expect(formatHeadDiffValue('IsRented', 'false', catalog)).toBe(catalog.t('tenure.own'));
    });
  });
});
