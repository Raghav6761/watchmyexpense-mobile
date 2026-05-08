import { Injectable, signal, computed } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

const DISMISS_KEY = 'pwa_install_dismissed_at';
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Manages the "Add to Home Screen" install prompt for the web/PWA target.
 *
 * Two flavors of install need to be handled separately because of platform
 * differences:
 *
 *   - **Chromium (Android Chrome, Edge, desktop Chrome)**: fires the
 *     `beforeinstallprompt` event when the PWA install criteria are met. We
 *     intercept it, hold the native event, and trigger it on our own button
 *     click (so we control timing instead of relying on the now-deprecated
 *     mini-infobar). After install, `appinstalled` fires.
 *
 *   - **iOS Safari**: never fires `beforeinstallprompt`. The only way to
 *     install is the user's manual "Share → Add to Home Screen" gesture.
 *     We detect iOS Safari and show a different banner with instructions.
 *
 * Inside the Capacitor WebView (mobile native shell) the service worker
 * doesn't register and `beforeinstallprompt` won't fire — `canPromptInstall`
 * stays false, banner stays hidden. That's the correct behavior; the user
 * already has a real native app, they don't need the PWA install nudge.
 */
@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  /** Chromium fired beforeinstallprompt and user has not yet installed. */
  canPromptInstall = signal(false);

  /** App is currently running in standalone (installed PWA) mode. */
  isInstalled = signal(false);

  /** User is on iOS Safari and not already running as installed PWA. */
  isIOS = signal(false);

  /** Last dismissal timestamp (ms since epoch), persisted across sessions. */
  private dismissedAt = signal<number | null>(null);

  /**
   * The banner should show if:
   *   - We are not already running as the installed PWA, AND
   *   - Either the browser is ready to prompt, OR we are on iOS (manual install), AND
   *   - The user has not dismissed within the last 7 days.
   */
  shouldShowBanner = computed(() => {
    if (this.isInstalled()) return false;

    const dismissed = this.dismissedAt();
    if (dismissed && Date.now() - dismissed < DISMISS_COOLDOWN_MS) return false;

    return this.canPromptInstall() || this.isIOS();
  });

  constructor() {
    this.detectInstalledState();
    this.detectIOS();
    void this.loadDismissedAt();
    this.attachInstallPromptListener();
    this.attachInstalledListener();
  }

  private detectInstalledState() {
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    this.isInstalled.set(!!isStandalone);
  }

  private detectIOS() {
    const ua = navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua);
    const isStandaloneIOS = (navigator as { standalone?: boolean }).standalone === true;
    this.isIOS.set(isIOSDevice && !isStandaloneIOS);
  }

  private async loadDismissedAt() {
    try {
      const { value } = await Preferences.get({ key: DISMISS_KEY });
      if (value) this.dismissedAt.set(parseInt(value, 10));
    } catch {
      /* Preferences not available (e.g. SSR) — ignore. */
    }
  }

  private attachInstallPromptListener() {
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.canPromptInstall.set(true);
    });
  }

  private attachInstalledListener() {
    window.addEventListener('appinstalled', () => {
      this.isInstalled.set(true);
      this.canPromptInstall.set(false);
      this.deferredPrompt = null;
    });
  }

  /** Trigger the native install prompt. Resolves true if user accepted. */
  async promptInstall(): Promise<boolean> {
    if (!this.deferredPrompt) return false;
    await this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    this.canPromptInstall.set(false);
    return outcome === 'accepted';
  }

  /** Persist a dismissal — banner stays hidden for the cooldown window. */
  async dismiss() {
    const now = Date.now();
    this.dismissedAt.set(now);
    try {
      await Preferences.set({ key: DISMISS_KEY, value: String(now) });
    } catch {
      /* Preferences not available — banner just won't persist dismissal. */
    }
  }
}

/**
 * Type for the non-standard `beforeinstallprompt` event. Not in lib.dom.d.ts.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}
