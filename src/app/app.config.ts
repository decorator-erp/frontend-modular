import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { routes } from './app.routes';
import { CRM_WORKSPACE_PANELS } from '@modules/crm';
import { authInterceptor } from './platform/auth/auth.interceptor';
import { errorInterceptor } from './platform/http/error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(
      withInterceptors([authInterceptor, errorInterceptor]),
      withXsrfConfiguration({
        cookieName: 'XSRF-TOKEN',
        headerName: 'X-XSRF-TOKEN',
      }),
    ),
    provideAnimationsAsync(),
    // Feature 004 — the CRM side of the core TASK_WORKSPACE registry. This is the
    // composition root, not a feature or core file, so importing `features/crm`
    // directly here is not a boundary violation (see contracts/task-workspace-registry.md).
    ...CRM_WORKSPACE_PANELS,
  ],
};
