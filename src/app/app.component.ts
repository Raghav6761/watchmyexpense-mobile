import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { IonApp, IonRouterOutlet, ModalController, ToastController, AlertController } from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

import { SmsListenerService, TransactionUpdate } from './services/sms-listener.service';
import { TransactionStorageService } from './services/transaction-storage.service';
import { NotificationService, NotificationAction } from './services/notification.service';
import { SyncService } from './services/sync.service';
import { TransactionOverlayComponent } from './components/transaction-overlay/transaction-overlay.component';
import { ParsedSms } from './models/transaction.model';

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
export class AppComponent implements OnInit, OnDestroy {
  private smsListener = inject(SmsListenerService);
  private storage = inject(TransactionStorageService);
  private notificationService = inject(NotificationService);
  private syncService = inject(SyncService);
  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);

  private transactionSubscription?: Subscription;
  private notificationSubscription?: Subscription;
  private overlayUpdateSubscription?: Subscription;

  ngOnInit() {
    this.initializeApp();
  }

  ngOnDestroy() {
    this.transactionSubscription?.unsubscribe();
    this.notificationSubscription?.unsubscribe();
    this.overlayUpdateSubscription?.unsubscribe();
  }

  async initializeApp() {
    // Request notification permission
    await this.notificationService.requestPermission();

    // Start SMS listener on Android
    await this.smsListener.startListening();

    // Check and prompt for overlay permission on Android
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      await this.checkOverlayPermission();

      // Start background monitoring service (shows persistent notification)
      await this.smsListener.startMonitoring();

      // Process any transactions detected while app was killed
      await this.processPendingTransactions();

      // Process any SMS that arrived while app was killed
      await this.processPendingSms();
    }

    // Subscribe to new transactions from SMS - this works from any screen
    this.transactionSubscription = this.smsListener.transactionDetected$.subscribe(
      (parsed) => this.handleNewTransaction(parsed)
    );

    // Subscribe to notification actions (when user taps notification or action button)
    this.notificationSubscription = this.notificationService.notificationAction$.subscribe(
      (action) => this.handleNotificationAction(action)
    );

    // Subscribe to overlay updates (when user saves from system overlay)
    this.overlayUpdateSubscription = this.smsListener.transactionUpdated$.subscribe(
      (update) => this.handleOverlayUpdate(update)
    );

    // Listen for app resume
    App.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) {
        console.log('[AppState] App resumed');
        // Refresh auth status first (in case token expired or refreshed)
        await this.syncService.checkAuthStatus();
        console.log('[AppState] Auth status refreshed:', this.syncService.isAuthenticated());
        // Process any transactions detected while app was in background
        await this.processPendingTransactions();
        // Then process any pending overlay updates
        await this.processPendingOverlayUpdates();
      }
    });
  }

  private async processPendingTransactions() {
    console.log('[PendingTransactions] Checking for pending transactions...');
    const pendingTransactions = await this.smsListener.getPendingTransactions();

    if (pendingTransactions.length === 0) {
      console.log('[PendingTransactions] No pending transactions found');
      return;
    }

    console.log('[PendingTransactions] Processing', pendingTransactions.length, 'pending transactions');

    for (const pending of pendingTransactions) {
      // Skip dismissed transactions
      if (pending.dismissed) {
        console.log('[PendingTransactions] Skipping dismissed transaction:', pending.transactionId);
        continue;
      }

      // Check if we already have this transaction
      const existing = this.storage.getTransaction(pending.transactionId);
      if (existing) {
        console.log('[PendingTransactions] Transaction already exists:', pending.transactionId);
        continue;
      }

      // Create transaction from pending data
      const transaction = this.storage.createFromPending({
        id: pending.transactionId,
        amount: pending.amount,
        type: pending.type as 'expense' | 'income',
        source: pending.source,
        rawMessage: pending.rawMessage,
        timestamp: pending.timestamp
      });

      // Add to storage
      await this.storage.addTransaction(transaction);
      console.log('[PendingTransactions] Added transaction:', pending.transactionId);
    }

    // Clear processed transactions
    await this.smsListener.clearPendingTransactions();
  }

  private async processPendingSms() {
    console.log('[PendingSms] Checking for pending SMS...');
    const parsedMessages = await this.smsListener.processPendingSms();

    if (parsedMessages.length === 0) {
      console.log('[PendingSms] No pending SMS found');
      return;
    }

    console.log('[PendingSms] Processing', parsedMessages.length, 'pending SMS');
    for (const parsed of parsedMessages) {
      await this.handleNewTransaction(parsed);
    }
  }

  private async processPendingOverlayUpdates() {
    console.log('[PendingUpdates] Checking for pending overlay updates...');
    const pendingUpdates = await this.smsListener.getPendingUpdates();

    if (pendingUpdates.length === 0) {
      console.log('[PendingUpdates] No pending updates found');
      return;
    }

    console.log('[PendingUpdates] Processing', pendingUpdates.length, 'pending updates:', pendingUpdates);

    for (const update of pendingUpdates) {
      await this.handleOverlayUpdate(update);
    }

    // Clear processed updates
    await this.smsListener.clearPendingUpdates();
    console.log('[PendingUpdates] Cleared pending updates');
  }

  private async checkOverlayPermission() {
    const hasPermission = await this.smsListener.checkOverlayPermission();
    console.log('Overlay permission check:', hasPermission);

    if (!hasPermission) {
      // Show prompt to enable overlay permission
      const alert = await this.alertCtrl.create({
        header: 'Enable Popup Permission',
        message: 'To show transaction popups when you receive payment SMS (even when app is closed), please enable "Display over other apps" permission.',
        buttons: [
          {
            text: 'Later',
            role: 'cancel'
          },
          {
            text: 'Enable',
            handler: async () => {
              await this.smsListener.requestOverlayPermission();
            }
          }
        ]
      });
      await alert.present();
    }
  }

  private async handleNewTransaction(parsed: ParsedSms) {
    // Create transaction from parsed SMS
    const transaction = this.storage.createFromParsedSms(parsed);

    // Add to storage
    await this.storage.addTransaction(transaction);

    if (this.notificationService.isInForeground()) {
      // App in foreground - show in-app modal
      await this.showTransactionOverlay(transaction.id);
    } else {
      // App in background - show BOTH overlay AND notification
      // Notification stays until user saves from overlay or addresses it
      await this.notificationService.showTransactionNotification(parsed, transaction.id);

      // Also try to show system overlay if permission granted
      await this.smsListener.showOverlay(transaction.id, parsed);
    }
  }

  private async handleOverlayUpdate(update: TransactionUpdate) {
    console.log('[OverlayUpdate] Received update:', update);

    // Update the transaction with edited values
    await this.storage.updateTransaction(update.transactionId, {
      amount: update.amount,
      description: update.description,
      source: update.source
    });

    // If category was selected, mark as ready, dismiss notification, and sync
    if (update.withCategory && update.category) {
      await this.storage.markReady(
        update.transactionId,
        update.description,
        update.category
      );
      // Cancel the notification (in case native dismissal didn't work)
      await this.notificationService.cancelTransactionNotification(update.transactionId);

      // Sync if authenticated - refresh auth status first since overlay runs separately
      let synced = false;
      await this.syncService.checkAuthStatus();
      const isAuth = this.syncService.isAuthenticated();
      console.log('[OverlayUpdate] Is authenticated:', isAuth);

      if (isAuth) {
        const transaction = this.storage.getTransaction(update.transactionId);
        console.log('[OverlayUpdate] Transaction for sync:', transaction);

        if (transaction) {
          console.log('[OverlayUpdate] Attempting sync...');
          synced = await this.syncService.syncTransaction(transaction);
          console.log('[OverlayUpdate] Sync result:', synced);
        }
      }

      const message = synced ? `Saved and synced as ${update.category}` : `Saved as ${update.category}`;
      await this.showToast(message, 'success');
    } else {
      // User clicked "Later" - notification stays
      await this.showToast('Transaction saved', 'medium');
    }
  }

  private async handleNotificationAction(action: NotificationAction) {
    const transaction = this.storage.getTransaction(action.transactionId);
    if (!transaction) {
      console.error('Transaction not found:', action.transactionId);
      return;
    }

    if (action.action === 'category' && action.category) {
      // User selected category from notification - save directly
      await this.storage.markReady(
        transaction.id,
        transaction.description || transaction.merchant,
        action.category
      );

      // Sync if authenticated - refresh auth status first
      let synced = false;
      await this.syncService.checkAuthStatus();
      if (this.syncService.isAuthenticated()) {
        const updatedTransaction = this.storage.getTransaction(action.transactionId);
        if (updatedTransaction) {
          synced = await this.syncService.syncTransaction(updatedTransaction);
        }
      }

      const message = synced ? `Saved and synced as ${action.category}` : `Saved as ${action.category}`;
      await this.showToast(message, 'success');
    } else {
      // User tapped notification or "More" - show modal
      await this.showTransactionOverlay(transaction.id);
    }
  }

  private async showTransactionOverlay(transactionId: string) {
    const transaction = this.storage.getTransaction(transactionId);
    if (!transaction) return;

    const modal = await this.modalCtrl.create({
      component: TransactionOverlayComponent,
      componentProps: { transaction, isEditing: false },
      cssClass: 'transaction-overlay',
      initialBreakpoint: 0.6,
      breakpoints: [0, 0.6, 0.85],
      handleBehavior: 'cycle'
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();

    if (data?.saved) {
      const message = data.synced ? 'Transaction saved and synced!' : 'Transaction saved.';
      await this.showToast(message, data.synced ? 'success' : 'medium');
    }
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      color,
      position: 'bottom'
    });
    await toast.present();
  }
}
