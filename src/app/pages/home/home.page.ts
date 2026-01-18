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
  flaskOutline,
  refreshOutline
} from 'ionicons/icons';

import { TransactionStorageService } from '../../services/transaction-storage.service';
import { SyncService } from '../../services/sync.service';
import { SmsListenerService } from '../../services/sms-listener.service';
import { SmsParserService } from '../../services/sms-parser.service';
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
          @if (isDevMode) {
            <ion-button (click)="simulateTransaction()" title="Simulate SMS">
              <ion-icon slot="icon-only" name="flask-outline"></ion-icon>
            </ion-button>
          }
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
          <p>Transactions from SMS will appear here automatically.</p>
          @if (isDevMode) {
            <ion-button fill="outline" size="small" (click)="simulateTransaction()">
              <ion-icon name="flask-outline" slot="start"></ion-icon>
              Simulate SMS
            </ion-button>
          }
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
  private smsListener = inject(SmsListenerService);
  private smsParser = inject(SmsParserService);

  // Dev mode flag (enable for testing)
  isDevMode = true; // Set to false in production

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
      flaskOutline,
      refreshOutline
    });
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
    const modal = await this.modalCtrl.create({
      component: TransactionOverlayComponent,
      componentProps: { transaction, isEditing },
      cssClass: 'transaction-overlay',
      initialBreakpoint: 0.6,
      breakpoints: [0, 0.6, 0.85],
      handleBehavior: 'cycle'
    });

    await modal.present();

    const { data, role } = await modal.onDidDismiss();

    if (data?.saved) {
      const message = data.synced ? 'Transaction saved and synced!' : 'Transaction saved.';
      await this.showToast(message, 'success');
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

  simulateTransaction() {
    const testMessages = this.smsParser.getTestMessages();
    const randomMessage = testMessages[Math.floor(Math.random() * testMessages.length)];
    this.smsListener.simulateSms(randomMessage.sender, randomMessage.message);
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
