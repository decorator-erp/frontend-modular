import { TestBed } from '@angular/core/testing';
import { PeraSegmentedComponent, SegmentedOption } from './pera-segmented.component';

describe('PeraSegmentedComponent', () => {
  const opts: SegmentedOption[] = [
    { value: 'Low', label: 'Low' },
    { value: 'High', label: 'High' },
  ];

  function make(): PeraSegmentedComponent {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [PeraSegmentedComponent] });
    return TestBed.createComponent(PeraSegmentedComponent).componentInstance;
  }

  it('writeValue reflects the current value and isSelected matches', () => {
    const c = make();
    c.writeValue('High');
    expect(c.value()).toBe('High');
    expect(c.isSelected(opts[1])).toBe(true);
    expect(c.isSelected(opts[0])).toBe(false);
  });

  it('pick sets the value and notifies the form (CVA)', () => {
    const c = make();
    let captured: unknown;
    c.registerOnChange((v) => (captured = v));
    c.pick(opts[0]);
    expect(c.value()).toBe('Low');
    expect(captured).toBe('Low');
  });

  it('does not pick when disabled', () => {
    const c = make();
    let captured: unknown = 'untouched';
    c.registerOnChange((v) => (captured = v));
    c.setDisabledState(true);
    c.pick(opts[0]);
    expect(c.value()).toBeNull();
    expect(captured).toBe('untouched');
  });
});
