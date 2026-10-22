import { TestBed } from '@angular/core/testing';
import { NotificationEntityType, NotificationType } from '../model/notification-enums';
import { NotificationView } from '../model/notification.model';
import { NotificationItemComponent } from './notification-item.component';

function view(overrides: Partial<NotificationView> = {}): NotificationView {
  return {
    id: 'n1',
    type: NotificationType.TaskAssigned,
    typeName: 'TaskAssigned',
    title: 'Task assigned',
    body: 'Review the drawings',
    entityType: NotificationEntityType.ProjectTask,
    entityId: 't1',
    createdAtUtc: new Date(Date.now() - 3_600_000).toISOString(),
    isUnread: true,
    ...overrides,
  };
}

function render(v: NotificationView) {
  TestBed.configureTestingModule({ imports: [NotificationItemComponent] });
  const f = TestBed.createComponent(NotificationItemComponent);
  f.componentRef.setInput('notification', v);
  f.detectChanges();
  return f;
}

describe('NotificationItemComponent', () => {
  it('renders title, body and a relative time', () => {
    const el = render(view()).nativeElement as HTMLElement;
    expect(el.textContent).toContain('Task assigned');
    expect(el.textContent).toContain('Review the drawings');
    expect(el.textContent?.toLowerCase()).toContain('ago');
  });

  it('marks unread with non-colour cues (dot + sr-only label + heavier title)', () => {
    const el = render(view({ isUnread: true })).nativeElement as HTMLElement;
    expect(el.querySelector('.bg-accent')).not.toBeNull();
    expect(el.querySelector('.sr-only')?.textContent).toContain('Unread');
    expect(el.querySelector('.font-semibold')).not.toBeNull();
  });

  it('read items carry no unread dot or label', () => {
    const el = render(view({ isUnread: false })).nativeElement as HTMLElement;
    expect(el.querySelector('.bg-accent')).toBeNull();
    expect(el.querySelector('.sr-only')).toBeNull();
  });

  it('emits activated on click', () => {
    const f = render(view());
    let fired = false;
    f.componentInstance.activated.subscribe(() => (fired = true));
    (f.nativeElement as HTMLElement).querySelector('button')!.click();
    expect(fired).toBe(true);
  });
});
