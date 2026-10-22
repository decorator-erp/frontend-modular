// The notifications barrel: only what a foreign consumer needs (charter §3; spec 005). Each export
// names its consumer.

// layouts/app-shell/topbar (the bell in the office topbar).
export { NotificationBellComponent } from './ui/notification-bell.component';

// layouts/app-shell (instantiated app-wide so its onInit wires the real-time lifecycle).
export { NotificationStore } from './ui/notification.store';

// app.routes.ts — single-page route, exported per the recipe's single-page exception.
export { NotificationsPageComponent } from './ui/notifications-page.component';
