import { TestBed } from '@angular/core/testing';
import { LocaleService } from '@platform/i18n';
import { CurrencyContextService } from '@shared/ui/currency.context';
import { PeraCurrencyComponent } from './pera-currency.component';

describe('PeraCurrencyComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PeraCurrencyComponent] }).compileComponents();
  });

  // LocaleService persists to localStorage; keep an `ar` case from leaking.
  afterEach(() => localStorage.removeItem('pera-locale'));

  it('renders grouped amount + default code', () => {
    const f = TestBed.createComponent(PeraCurrencyComponent);
    f.componentRef.setInput('amount', 1234567);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('1,234,567');
    expect(el.textContent).toContain('EGP');
  });

  it('stays ltr in RTL (host has dir=ltr)', () => {
    const f = TestBed.createComponent(PeraCurrencyComponent);
    f.componentRef.setInput('amount', 5);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).getAttribute('dir')).toBe('ltr');
  });

  it('abbreviates thousands and millions when compact', () => {
    const f = TestBed.createComponent(PeraCurrencyComponent);
    f.componentRef.setInput('compact', true);

    f.componentRef.setInput('amount', 1200);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('1.2K');

    f.componentRef.setInput('amount', 3_400_000);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('3.4M');
  });

  it('renders a custom currency code', () => {
    const f = TestBed.createComponent(PeraCurrencyComponent);
    f.componentRef.setInput('amount', 42);
    f.componentRef.setInput('code', 'USD');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('USD');
  });

  it('groups a server decimal string without rounding its fraction', () => {
    const f = TestBed.createComponent(PeraCurrencyComponent);
    f.componentRef.setInput('amount', '1234567.8900');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('1,234,567.8900');
  });

  // --- 003 Batch 0: context-resolved currency + locale-aware grouping ---------

  it('resolves the code from CurrencyContextService when [code] is unset', () => {
    TestBed.inject(CurrencyContextService).set('AED');
    const f = TestBed.createComponent(PeraCurrencyComponent);
    f.componentRef.setInput('amount', 10);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('AED');
  });

  it('lets an explicit [code] override the context', () => {
    TestBed.inject(CurrencyContextService).set('AED');
    const f = TestBed.createComponent(PeraCurrencyComponent);
    f.componentRef.setInput('amount', 10);
    f.componentRef.setInput('code', 'USD');
    f.detectChanges();
    const text = (f.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('USD');
    expect(text).not.toContain('AED');
  });

  it('falls back to EGP as the context default, never a hardcoded code', () => {
    const ctx = TestBed.inject(CurrencyContextService);
    ctx.set('USD');
    ctx.reset();
    const f = TestBed.createComponent(PeraCurrencyComponent);
    f.componentRef.setInput('amount', 1);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('EGP');
  });

  it('applies a 2-decimal minimum to whole amounts', () => {
    const f = TestBed.createComponent(PeraCurrencyComponent);
    f.componentRef.setInput('amount', '1234');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('1,234.00');
  });

  it('keeps a 4-fractional-digit server decimal digit-for-digit', () => {
    const f = TestBed.createComponent(PeraCurrencyComponent);
    f.componentRef.setInput('amount', '9876543210987.6543');
    f.detectChanges();
    // A double round-trip would lose the low-order digits of this value.
    expect((f.nativeElement as HTMLElement).textContent).toContain('9,876,543,210,987.6543');
  });

  it('groups with ar-EG when the locale is Arabic', () => {
    TestBed.inject(LocaleService).locale.set('ar');
    const f = TestBed.createComponent(PeraCurrencyComponent);
    f.componentRef.setInput('amount', 1234567);
    f.detectChanges();
    const text = (f.nativeElement as HTMLElement).textContent ?? '';
    // ar-EG uses Arabic-Indic digits, so the en-US grouping must NOT appear.
    expect(text).not.toContain('1,234,567');
    expect(text).toContain(new Intl.NumberFormat('ar-EG').format(1234567).slice(0, 3));
  });

  it('passes a non-decimal string through untouched', () => {
    const f = TestBed.createComponent(PeraCurrencyComponent);
    f.componentRef.setInput('amount', 'n/a');
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('n/a');
  });
});
