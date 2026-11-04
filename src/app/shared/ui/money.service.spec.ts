import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { MoneyService } from './money.service';

describe('MoneyService.parse (crm-prod L-fe-2)', () => {
  it('normalises Arabic-Indic and Extended Arabic-Indic digits and separators to ASCII', () => {
    const money = TestBed.inject(MoneyService);
    expect(money.parse('١٢٬٣٤٥٫٦٧')).toBe('12345.67');
    expect(money.parse('۹۸۷۶')).toBe('9876');
    expect(money.parse('-٥٠')).toBe('-50');
    expect(money.parse('1,234.5')).toBe('1234.5');
  });
});
