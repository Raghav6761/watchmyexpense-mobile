import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Browser } from '@capacitor/browser';
import { Preferences } from '@capacitor/preferences';
import { App, URLOpenListenerEvent } from '@capacitor/app';

import { TransactionStorageService } from './transaction-storage.service';

const STORAGE_KEYS = {
  JWT: 'auth_jwt',
  EMAIL: 'auth_email'
} as const;

/**
 * Multi-tenant auth service.
 *
 * Holds the user's JWT (issued by our backend after Google OAuth) in Capacitor
 * Preferences. The JWT is sent as `Authorization: Bearer <jwt>` on every backend
 * request via the HTTP interceptor.
 *
 * Sign-in flow:
 *   1. signIn() → backend returns Google OAuth URL → open in system browser.
 *   2. User signs in with Google → browser is redirected to backend /auth/callback.
 *   3. Backend exchanges code, mints JWT, redirects browser to deep link
 *      `watchmyexpense://auth?jwt=...`.
 *   4. Android matches the scheme to our intent-filter → resumes the app.
 *   5. Capacitor App emits `appUrlOpen` → we extract JWT, store, set signals.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private storage = inject(TransactionStorageService);

  private _jwt = signal<string | null>(null);
  private _email = signal<string | null>(null);
  private _ready = signal(false);

  // Public reactive state. Templates & guards read these; never mutate.
  public jwt = this._jwt.asReadonly();
  public currentEmail = this._email.asReadonly();
  public signedIn = computed(() => this._jwt() !== null);
  public ready = this._ready.asReadonly();

  // Resolves once we've finished loading any persisted JWT from disk.
  // HTTP calls made before this resolves will lack the auth header, so callers
  // that need it (anything hitting /api/*) should await this on app boot.
  private readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.init();
    this.attachDeepLinkListener();
  }

  /** Wait for persisted state to load. Idempotent. */
  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  private async init() {
    const [jwtRes, emailRes] = await Promise.all([
      Preferences.get({ key: STORAGE_KEYS.JWT }),
      Preferences.get({ key: STORAGE_KEYS.EMAIL })
    ]);

    if (jwtRes.value) {
      this._jwt.set(jwtRes.value);
      this._email.set(emailRes.value || null);
    }

    this._ready.set(true);

    // If we restored a JWT, ask the backend whether it's still valid.
    // /auth/status is a soft check (always 200, never 401) — returns
    // { authenticated: false } for expired/revoked sessions.
    if (jwtRes.value) {
      this.refreshStatus().catch(() => { /* offline is fine */ });
    }
  }

  /**
   * Verify the stored JWT against the backend. If the backend says it's no
   * longer valid (revoked, expired, etc.), we clear local state.
   */
  async refreshStatus(): Promise<boolean> {
    try {
      const baseUrl = this.storage.backendUrl();
      console.log('[Auth] refreshStatus calling', `${baseUrl}/auth/status`);
      const res = await firstValueFrom(
        this.http.get<{ authenticated: boolean; email?: string }>(`${baseUrl}/auth/status`)
      );
      console.log('[Auth] /auth/status returned:', res);
      if (!res.authenticated) {
        console.warn('[Auth] Backend says not authenticated → clearing local session');
        await this.clearLocalSession();
        return false;
      }
      if (res.email && res.email !== this._email()) {
        this._email.set(res.email);
        await Preferences.set({ key: STORAGE_KEYS.EMAIL, value: res.email });
      }
      return true;
    } catch (e) {
      console.warn('[Auth] refreshStatus network error, keeping local state:', e);
      return this._jwt() !== null;
    }
  }

  /**
   * Kick off Google OAuth. Opens the system browser; returns immediately.
   * Completion is async — the deep-link listener (attachDeepLinkListener) sets
   * the JWT once Google + backend redirect back.
   */
  async signIn(): Promise<void> {
    const baseUrl = this.storage.backendUrl();
    const { url } = await firstValueFrom(
      this.http.get<{ url: string }>(`${baseUrl}/auth/url`)
    );
    await Browser.open({ url });
  }

  async signOut(): Promise<void> {
    // Best-effort backend revoke; clear local even if the call fails.
    try {
      const baseUrl = this.storage.backendUrl();
      await firstValueFrom(this.http.post(`${baseUrl}/auth/logout`, {}));
    } catch (e) {
      console.warn('[Auth] Backend logout failed (clearing local anyway):', e);
    }
    await this.clearLocalSession();
  }

  /**
   * Called by the HTTP interceptor on 401. Means the JWT is no longer accepted —
   * clear it so the UI flips to "Connect Google" and the user re-auths.
   */
  async handleUnauthorized(): Promise<void> {
    if (this._jwt() !== null) {
      console.warn('[Auth] Backend returned 401 — clearing local session');
      await this.clearLocalSession();
    }
  }

  private async clearLocalSession() {
    this._jwt.set(null);
    this._email.set(null);
    await Promise.all([
      Preferences.remove({ key: STORAGE_KEYS.JWT }),
      Preferences.remove({ key: STORAGE_KEYS.EMAIL })
    ]);
  }

  // ─── Deep link handling ─────────────────────────────────────────────────

  private attachDeepLinkListener() {
    // Fired when app is resumed via a deep link (warm start).
    App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
      console.log('[Auth] appUrlOpen fired:', event.url);
      this.handleDeepLink(event.url).catch(err =>
        console.error('[Auth] Deep link error:', err)
      );
    });

    // Cold start: app was launched by tapping the deep link from the browser.
    // The launch URL is available right after construction.
    App.getLaunchUrl().then(launch => {
      console.log('[Auth] getLaunchUrl resolved:', launch?.url || '(none)');
      if (launch?.url) {
        this.handleDeepLink(launch.url).catch(err =>
          console.error('[Auth] Launch URL error:', err)
        );
      }
    });
  }

  private async handleDeepLink(rawUrl: string) {
    console.log('[Auth] handleDeepLink:', rawUrl);
    if (!rawUrl.startsWith('watchmyexpense://auth')) {
      console.log('[Auth] URL does not match watchmyexpense://auth — ignoring');
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch (e) {
      console.error('[Auth] Could not parse deep link URL:', rawUrl, e);
      return;
    }

    const jwt = parsed.searchParams.get('jwt');
    console.log('[Auth] Parsed jwt param:', jwt ? `(${jwt.length} chars)` : '(missing)');
    if (!jwt) {
      console.error('[Auth] Deep link missing jwt param. Full URL was:', rawUrl);
      return;
    }

    // ORDER MATTERS: set the signal BEFORE awaiting storage.
    // Otherwise, while we're awaiting Preferences.set, the foreground event
    // fires and app.component triggers a /auth/status check — which reads
    // auth.jwt() (still null) and gets back { authenticated: false }, which
    // then clears the JWT we'd just stored. Setting the signal first means
    // any racing reader sees the JWT immediately.
    this._jwt.set(jwt);
    console.log('[Auth] _jwt signal set, signedIn() is now true');
    await Preferences.set({ key: STORAGE_KEYS.JWT, value: jwt });
    console.log('[Auth] JWT persisted to Preferences');

    // Close the in-app browser if it's still up.
    try { await Browser.close(); } catch { /* not always open */ }

    // Backend gives us the email via /auth/status.
    const stillValid = await this.refreshStatus();
    console.log('[Auth] refreshStatus result:', stillValid, 'email:', this._email());
  }
}
