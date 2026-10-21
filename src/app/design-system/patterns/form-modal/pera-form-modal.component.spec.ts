import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PeraFormModalComponent } from './pera-form-modal.component';

describe('PeraFormModalComponent', () => {
  function make(): ComponentFixture<PeraFormModalComponent> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [PeraFormModalComponent] });
    const f = TestBed.createComponent(PeraFormModalComponent);
    f.componentRef.setInput('eyebrow', 'POST /api/project-tasks');
    f.componentRef.setInput('title', 'New task');
    f.componentRef.setInput('subtitle', 'Add a task to a stage.');
    f.componentRef.setInput('permission', 'stage_tasks.manage');
    f.componentRef.setInput('submitLabel', 'Create task');
    f.detectChanges();
    return f;
  }

  it('renders the eyebrow, title, sub and permission note', () => {
    const text = make().nativeElement.textContent as string;
    expect(text).toContain('POST /api/project-tasks');
    expect(text).toContain('New task');
    expect(text).toContain('Add a task to a stage.');
    expect(text).toContain('stage_tasks.manage');
    expect(text).toContain('Requires');
  });

  it('shows the server-error banner only when errorMessage is set', () => {
    const f = make();
    expect(f.nativeElement.querySelector('[role="alert"]')).toBeNull();
    f.componentRef.setInput('errorMessage', 'That invoice number is already used.');
    f.componentRef.setInput('errorCode', 'invoices.DuplicatedNumber');
    f.detectChanges();
    const banner = f.nativeElement.querySelector('[role="alert"]') as HTMLElement;
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('That invoice number is already used.');
    expect(banner.textContent).toContain('invoices.DuplicatedNumber');
  });

  it('emits cancelled from the Close button and submitted on form submit', () => {
    const f = make();
    let cancelled = 0;
    let submitted = 0;
    f.componentInstance.cancelled.subscribe(() => (cancelled += 1));
    f.componentInstance.submitted.subscribe(() => (submitted += 1));

    (f.nativeElement.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    expect(cancelled).toBe(1);

    f.nativeElement.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(submitted).toBe(1);
  });

  it('disables the submit button while submitting / permission denied', () => {
    const f = make();
    const submit = () =>
      f.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit().disabled).toBe(false);
    f.componentRef.setInput('submitting', true);
    f.detectChanges();
    expect(submit().disabled).toBe(true);
    f.componentRef.setInput('submitting', false);
    f.componentRef.setInput('permissionDenied', true);
    f.detectChanges();
    expect(submit().disabled).toBe(true);
  });
});
