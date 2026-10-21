import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { LoginComponent } from './login.component';

/**
 * 002b A4. Backend v3 locks an account after repeated failures (401 `authentications.LockedOut`)
 * and rate-limits `/auth/login` per IP with a 429 whose body is EMPTY (`Api/DI.cs:246–259`). A
 * deactivated account now answers `InvalidCredentials`, whose backend copy stays as it was.
 */
describe('LoginComponent — sign-in failure messages (002b A4)', () => {
  let backend: HttpTestingController;
  const LOGIN = `${environment.apiUrl}/auth/login`;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  async function submitAndFail(
    body: object | null,
    status: number,
    statusText: string,
  ): Promise<string> {
    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    component.form.setValue({ email: 'nourhan@pera.test', password: 'Secret#123', remember: true });

    const done = component.submit();
    backend.expectOne(LOGIN).flush(body, { status, statusText });
    await done;
    fixture.detectChanges();

    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    return alert?.textContent?.trim() ?? '';
  }

  const problem = (code: string, message: string) => ({
    title: code,
    status: 401,
    errors: { [code]: [message] },
  });

  it('LockedOut 401 → "Too many attempts. Try again in 15 minutes."', async () => {
    const text = await submitAndFail(
      problem(
        'authentications.LockedOut',
        'This account is temporarily locked after repeated failed sign-ins. Try again later.',
      ),
      401,
      'Unauthorized',
    );
    expect(text).toBe('Too many attempts. Try again in 15 minutes.');
  });

  it('429 with an empty body → "Too many sign-in attempts from this network. Wait a minute."', async () => {
    const text = await submitAndFail(null, 429, 'Too Many Requests');
    expect(text).toBe('Too many sign-in attempts from this network. Wait a minute.');
  });

  it('InvalidCredentials 401 keeps the backend copy, verbatim', async () => {
    const text = await submitAndFail(
      problem('authentications.InvalidCredentials', 'Invalid email or password.'),
      401,
      'Unauthorized',
    );
    expect(text).toBe('Invalid email or password.');
  });
});
