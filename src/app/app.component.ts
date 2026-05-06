import { Component, OnInit, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { App } from '@capacitor/app';

import { TransactionStorageService } from './services/transaction-storage.service';
import { NotificationService } from './services/notification.service';
import { SyncService } from './services/sync.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
    </ion-app>
  `,
})
export class AppComponent implements OnInit {
  private storage = inject(TransactionStorageService);
  private notificationService = inject(NotificationService);
  private syncService = inject(SyncService);

  ngOnInit() {
    this.initializeApp();
  }

  async initializeApp() {
    // Request notification permission upfront (used by upcoming smart-notification
    // / habit-reminder features). Harmless to ask early on web/iOS too — the
    // service falls back to no-op if denied.
    await this.notificationService.requestPermission();

    // Storage exposes a signal so any consumer reading transactions automatically
    // sees the loaded set. Touch it once here so the file gets pulled into memory
    // on cold boot.
    void this.storage.transactions();

    // Check auth status and fetch categories + liability master register on
    // startup. Liabilities feed source-keyword matching for manual entries.
    await this.syncService.checkAuthStatus();
    if (this.syncService.isAuthenticated()) {
      await this.syncService.fetchCategories();
      await this.syncService.fetchLiabilitiesMaster();
    }

    // Refresh on resume — catches token refreshes that happen while the app
    // is backgrounded, plus any updates the user made on web in another tab.
    App.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive) return;
      await this.syncService.checkAuthStatus();
      if (this.syncService.isAuthenticated()) {
        await this.syncService.fetchCategories();
        await this.syncService.fetchLiabilitiesMaster();
      }
    });
  }
}
