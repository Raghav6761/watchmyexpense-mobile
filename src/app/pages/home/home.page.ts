import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonCard,
  IonCardContent,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonBadge,
  IonButton,
  IonButtons,
  IonFab,
  IonFabButton,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonRefresher,
  IonRefresherContent,
  IonNote,
  IonSpinner,
  IonText,
  ModalController,
  ToastController,
  AlertController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  settingsOutline,
  addOutline,
  syncOutline,
  checkmarkCircle,
  alertCircle,
  timeOutline,
  cloudUploadOutline,
  trashOutline,
  createOutline,
  refreshOutline,
  downloadOutline,
  closeOutline
} from 'ionicons/icons';

import { TransactionStorageService } from '../../services/transaction-storage.service';
import { SyncService } from '../../services/sync.service';
import { PwaInstallService } from '../../services/pwa-install.service';
import { TransactionOverlayComponent } from '../../components/transaction-overlay/transaction-overlay.component';
import { Transaction } from '../../models/transaction.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonCard,
    IonCardContent,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonBadge,
    IonButton,
    IonButtons,
    IonFab,
    IonFabButton,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonRefresher,
    IonRefresherContent,
    IonNote,
    IonSpinner,
    IonText
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Watch My Expense</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="goToSettings()">
            <ion-icon slot="icon-only" name="settings-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="handleRefresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <!-- PWA Install banner. Two variants: Chromium auto-prompt + iOS manual. -->
      @if (pwaInstall.shouldShowBanner()) {
        <ion-card class="pwa-install-banner">
          <ion-card-content>
            <div class="pwa-install-row">
              <ion-icon name="download-outline" class="pwa-install-icon"></ion-icon>
              <div class="pwa-install-text">
                @if (pwaInstall.canPromptInstall()) {
                  <h3>Install Watch My Expense</h3>
                  <p>Add to home screen for quicker access.</p>
                } @else if (pwaInstall.isIOS()) {
                  <h3>Add to Home Screen</h3>
                  <p>Tap <strong>Share</strong> in Safari, then <strong>Add to Home Screen</strong>.</p>
                }
              </div>
              @if (pwaInstall.canPromptInstall()) {
                <ion-button size="small" (click)="installPwa()">Install</ion-button>
              }
              <ion-button fill="clear" size="small" (click)="dismissInstallBanner()" aria-label="Dismiss">
                <ion-icon slot="icon-only" name="close-outline"></ion-icon>
              </ion-button>
            </div>
          </ion-card-content>
        </ion-card>
      }

      <!-- Stats Card -->
      <ion-card class="stats-card">
        <ion-card-content>
          <div class="stat-item">
            <div class="stat-value">{{ storage.pendingCount() }}</div>
            <div class="stat-label">Pending</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{{ storage.readyCount() }}</div>
            <div class="stat-label">Ready</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{{ storage.syncedCount() }}</div>
            <div class="stat-label">Synced</div>
          </div>
        </ion-card-content>
      </ion-card>

      <!-- Sync Button -->
      @if (syncService.canSync()) {
        <div class="sync-section">
          <ion-button expand="block" (click)="syncAll()" [disabled]="syncService.isSyncing()">
            @if (syncService.isSyncing()) {
              <ion-spinner name="crescent" slot="start"></ion-spinner>
              Syncing...
            } @else {
              <ion-icon name="sync-outline" slot="start"></ion-icon>
              Sync All ({{ storage.readyCount() }})
            }
          </ion-button>
        </div>
      }

      <!-- Auth Warning -->
      @if (!syncService.isAuthenticated()) {
        <div class="auth-warning">
          <ion-note color="warning">
            Not authenticated. Go to Settings to connect Google Sheets.
          </ion-note>
        </div>
      }

      <!-- Error Transactions -->
      @if (storage.errorCount() > 0) {
        <div class="error-section">
          <ion-note color="danger">
            {{ storage.errorCount() }} transaction(s) failed to sync.
            <ion-button fill="clear" size="small" (click)="retryFailed()">
              <ion-icon name="refresh-outline" slot="start"></ion-icon>
              Retry
            </ion-button>
          </ion-note>
        </div>
      }

      <!-- Transaction List -->
      @if (storage.transactions().length === 0) {
        <div class="empty-state">
          <ion-icon name="time-outline" size="large"></ion-icon>
          <h3>No Transactions</h3>
          <p>Tap the + button to add your first transaction.</p>
        </div>
      } @else {
        <ion-list>
          @for (txn of storage.transactions(); track txn.id) {
            <ion-item-sliding>
              <ion-item (click)="editTransaction(txn)" [button]="true">
                <div class="txn-amount" slot="start" [class]="txn.type === 'expense' ? 'expense' : 'income'">
                  {{ txn.type === 'expense' ? '-' : '+' }}{{ formatAmount(txn.amount) }}
                </div>
                <ion-label>
                  <h2>{{ txn.description || txn.merchant }}</h2>
                  <p>{{ formatDate(txn.date) }} &middot; {{ txn.source }}</p>
                  @if (txn.category) {
                    <ion-badge color="medium" class="category-badge">{{ txn.category }}</ion-badge>
                  }
                </ion-label>
                <ion-icon
                  slot="end"
                  [name]="getStatusIcon(txn.status)"
                  [class]="'status-icon ' + txn.status"
                ></ion-icon>
              </ion-item>

              <ion-item-options side="end">
                @if (txn.status !== 'synced') {
                  <ion-item-option color="primary" (click)="editTransaction(txn)">
                    <ion-icon slot="icon-only" name="create-outline"></ion-icon>
                  </ion-item-option>
                }
                <ion-item-option color="danger" (click)="deleteTransaction(txn)">
                  <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
                </ion-item-option>
              </ion-item-options>
            </ion-item-sliding>
          }
        </ion-list>
      }

      <!-- FAB for manual entry -->
      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="addManualTransaction()">
          <ion-icon name="add-outline"></ion-icon>
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
  styles: [`
    .pwa-install-banner {
      margin: 12px 16px 0;
      border-left: 3px solid var(--ion-color-primary);

      ion-card-content {
        padding: 12px 16px;
      }

      .pwa-install-row {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .pwa-install-icon {
        font-size: 24px;
        color: var(--ion-color-primary);
        flex-shrink: 0;
      }

      .pwa-install-text {
        flex: 1;
        min-width: 0;

        h3 {
          font-size: 14px;
          font-weight: 600;
          margin: 0;
        }

        p {
          font-size: 12px;
          color: var(--ion-color-medium);
          margin: 2px 0 0;
        }
      }

      ion-button {
        flex-shrink: 0;
        --padding-start: 12px;
        --padding-end: 12px;
      }
    }

    .stats-card {
      margin: 16px;

      ion-card-content {
        display: flex;
        justify-content: space-around;
        padding: 16px;
      }

      .stat-item {
        text-align: center;

        .stat-value {
          font-size: 28px;
          font-weight: 700;
          color: var(--ion-color-primary);
        }

        .stat-label {
          font-size: 12px;
          color: var(--ion-color-medium);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
      }
    }

    .sync-section {
      padding: 0 16px 16px;
    }

    .auth-warning, .error-section {
      padding: 8px 16px;

      ion-note {
        display: flex;
        align-items: center;
        gap: 8px;
      }
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      text-align: center;
      color: var(--ion-color-medium);

      ion-icon {
        font-size: 64px;
        margin-bottom: 16px;
      }

      h3 {
        margin: 0 0 8px;
        font-size: 18px;
        font-weight: 600;
      }

      p {
        margin: 0 0 16px;
        font-size: 14px;
      }
    }

    .txn-amount {
      font-weight: 700;
      font-size: 16px;
      min-width: 90px;
      text-align: right;

      &.expense {
        color: var(--ion-color-danger);
      }

      &.income {
        color: var(--ion-color-success);
      }
    }

    ion-item {
      --padding-start: 12px;

      h2 {
        font-weight: 500;
        font-size: 15px;
      }

      p {
        font-size: 13px;
      }
    }

    .category-badge {
      margin-top: 4px;
      font-size: 11px;
    }

    .status-icon {
      font-size: 20px;

      &.pending {
        color: var(--ion-color-warning);
      }

      &.ready {
        color: var(--ion-color-primary);
      }

      &.synced {
        color: var(--ion-color-success);
      }

      &.error {
        color: var(--ion-color-danger);
      }
    }
  `]
})
export class HomePage implements OnInit {
  private router = inject(Router);
  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);

  public storage = inject(TransactionStorageService);
  public syncService = inject(SyncService);
  public pwaInstall = inject(PwaInstallService);

  constructor() {
    addIcons({
      settingsOutline,
      addOutline,
      syncOutline,
      checkmarkCircle,
      alertCircle,
      timeOutline,
      cloudUploadOutline,
      trashOutline,
      createOutline,
      refreshOutline,
      downloadOutline,
      closeOutline
    });
  }

  async installPwa() {
    await this.pwaInstall.promptInstall();
  }

  async dismissInstallBanner() {
    await this.pwaInstall.dismiss();
  }

  async ngOnInit() {
    // Check auth status and fetch categories
    await this.syncService.checkAuthStatus();

    // Fetch categories from backend
    const categories = await this.syncService.fetchCategories();
    if (categories) {
      console.log('[HomePage] Categories loaded successfully');
    } else {
      console.warn('[HomePage] Failed to fetch categories, using defaults');
    }
  }

  async showTransactionOverlay(transaction: Transaction, isEditing: boolean) {
    console.log('[HomePage] showTransactionOverlay called:', {
      transactionId: transaction.id,
      isEditing
    });

    // STEP 1: Validate transaction data
    console.log('[HomePage] Transaction data:', {
      id: transaction.id,
      amount: transaction.amount,
      type: transaction.type,
      status: transaction.status,
      category: transaction.category,
      description: transaction.description
    });

    if (!transaction.amount || transaction.amount <= 0) {
      console.error('[HomePage] Invalid transaction amount:', transaction.amount);
      await this.showToast('Invalid transaction data', 'danger');
      return;
    }

    // STEP 2: Create modal with error handling
    let modal: HTMLIonModalElement;
    try {
      console.log('[HomePage] Creating modal for transaction:', transaction.id);
      modal = await this.modalCtrl.create({
        component: TransactionOverlayComponent,
        componentProps: { transaction, isEditing },
        cssClass: 'transaction-overlay',
        initialBreakpoint: 0.6,
        breakpoints: [0, 0.6, 0.85],
        handleBehavior: 'cycle'
      });
      console.log('[HomePage] Modal created successfully');
    } catch (error) {
      console.error('[HomePage] Modal creation failed:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        transactionId: transaction.id
      });
      await this.showToast('Failed to open transaction overlay. Please try again.', 'danger');
      return;
    }

    // STEP 3: Present modal with error handling
    try {
      console.log('[HomePage] Presenting modal for transaction:', transaction.id);
      await modal.present();
      console.log('[HomePage] Modal presented successfully');
    } catch (error) {
      console.error('[HomePage] Modal presentation failed:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        transactionId: transaction.id
      });
      await this.showToast('Failed to display transaction overlay. Please try again.', 'danger');
      return;
    }

    // STEP 4: Wait for dismissal with error handling
    try {
      console.log('[HomePage] Waiting for modal dismissal...');
      const { data, role } = await modal.onDidDismiss();
      console.log('[HomePage] Modal dismissed with data:', data, 'role:', role);

      if (data?.saved) {
        const message = data.synced ? 'Transaction saved and synced!' : 'Transaction saved.';
        await this.showToast(message, 'success');
      }
    } catch (error) {
      console.error('[HomePage] Modal dismissal error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        transactionId: transaction.id
      });
      // Don't show toast here - modal might have been dismissed successfully but onDidDismiss threw
    }
  }

  async editTransaction(transaction: Transaction) {
    if (transaction.status === 'synced') {
      await this.showToast('Cannot edit synced transactions', 'warning');
      return;
    }

    await this.showTransactionOverlay(transaction, true);
  }

  async deleteTransaction(transaction: Transaction) {
    const alert = await this.alertCtrl.create({
      header: 'Delete Transaction',
      message: 'Are you sure you want to delete this transaction?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            await this.storage.deleteTransaction(transaction.id);
            await this.showToast('Transaction deleted', 'success');
          }
        }
      ]
    });

    await alert.present();
  }

  async addManualTransaction() {
    const alert = await this.alertCtrl.create({
      header: 'Add Transaction',
      inputs: [
        {
          name: 'amount',
          type: 'number',
          placeholder: 'Amount',
          min: 0
        },
        {
          name: 'description',
          type: 'text',
          placeholder: 'Description'
        }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Expense',
          handler: async (data) => {
            if (data.amount && parseFloat(data.amount) > 0) {
              const txn = await this.storage.addManualTransaction(
                'expense',
                parseFloat(data.amount),
                new Date(),
                data.description || 'Manual Entry',
                'Other'
              );
              await this.showTransactionOverlay(txn, true);
            }
          }
        },
        {
          text: 'Income',
          handler: async (data) => {
            if (data.amount && parseFloat(data.amount) > 0) {
              const txn = await this.storage.addManualTransaction(
                'income',
                parseFloat(data.amount),
                new Date(),
                data.description || 'Manual Entry',
                'Other'
              );
              await this.showTransactionOverlay(txn, true);
            }
          }
        }
      ]
    });

    await alert.present();
  }

  async syncAll() {
    const result = await this.syncService.syncAll();

    if (result.synced > 0 || result.failed > 0) {
      const message = result.failed > 0
        ? `Synced ${result.synced}, failed ${result.failed}`
        : `${result.synced} transaction(s) synced!`;
      const color = result.failed > 0 ? 'warning' : 'success';
      await this.showToast(message, color);
    }
  }

  async retryFailed() {
    await this.syncService.retryFailed();
    await this.showToast('Failed transactions queued for retry', 'primary');
  }

  async handleRefresh(event: any) {
    await this.syncService.checkAuthStatus();
    await this.syncService.fetchCategories();
    event.target.complete();
  }

  goToSettings() {
    this.router.navigate(['/settings']);
  }

  formatAmount(amount: number): string {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  formatDate(date: Date): string {
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short'
    });
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'synced': return 'checkmark-circle';
      case 'error': return 'alert-circle';
      case 'ready': return 'cloud-upload-outline';
      default: return 'time-outline';
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
