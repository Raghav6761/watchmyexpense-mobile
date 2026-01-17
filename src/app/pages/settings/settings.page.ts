import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonButton,
  IonButtons,
  IonBackButton,
  IonIcon,
  IonNote,
  IonToggle,
  IonListHeader,
  ToastController,
  AlertController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  serverOutline,
  logInOutline,
  logOutOutline,
  refreshOutline,
  trashOutline,
  cloudDoneOutline,
  cloudOfflineOutline,
  informationCircleOutline,
  layersOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
  documentTextOutline,
  saveOutline
} from 'ionicons/icons';

import { TransactionStorageService } from '../../services/transaction-storage.service';
import { SyncService } from '../../services/sync.service';
import { SmsListenerService } from '../../services/sms-listener.service';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonInput,
    IonButton,
    IonButtons,
    IonBackButton,
    IonIcon,
    IonNote,
    IonToggle,
    IonListHeader
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/home"></ion-back-button>
        </ion-buttons>
        <ion-title>Settings</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <!-- Connection Status -->
      <ion-list>
        <ion-list-header>
          <ion-label>Connection Status</ion-label>
        </ion-list-header>

        <ion-item>
          <ion-icon
            slot="start"
            [name]="syncService.isOnline() ? 'cloud-done-outline' : 'cloud-offline-outline'"
            [color]="syncService.isOnline() ? 'success' : 'danger'"
          ></ion-icon>
          <ion-label>
            <h2>Network</h2>
            <p>{{ syncService.isOnline() ? 'Online' : 'Offline' }}</p>
          </ion-label>
        </ion-item>

        <ion-item>
          <ion-icon
            slot="start"
            [name]="syncService.isAuthenticated() ? 'log-in-outline' : 'log-out-outline'"
            [color]="syncService.isAuthenticated() ? 'success' : 'warning'"
          ></ion-icon>
          <ion-label>
            <h2>Google Sheets</h2>
            <p>{{ syncService.isAuthenticated() ? 'Connected' : 'Not connected' }}</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <!-- Backend Configuration -->
      <ion-list>
        <ion-list-header>
          <ion-label>Backend Server</ion-label>
        </ion-list-header>

        <ion-item>
          <ion-icon name="server-outline" slot="start"></ion-icon>
          <ion-input
            label="Server URL"
            labelPlacement="stacked"
            [(ngModel)]="backendUrl"
            placeholder="http://localhost:3000"
            (ionBlur)="saveBackendUrl()"
          ></ion-input>
        </ion-item>

        <ion-item>
          <ion-button fill="outline" (click)="testConnection()">
            <ion-icon name="refresh-outline" slot="start"></ion-icon>
            Test Connection
          </ion-button>
        </ion-item>
      </ion-list>

      <!-- Authentication -->
      <ion-list>
        <ion-list-header>
          <ion-label>Google Authentication</ion-label>
        </ion-list-header>

        @if (syncService.isAuthenticated()) {
          <ion-item>
            <ion-label>
              <p>You are connected to Google Sheets.</p>
            </ion-label>
            <ion-button slot="end" fill="outline" color="danger" (click)="logout()">
              <ion-icon name="log-out-outline" slot="start"></ion-icon>
              Disconnect
            </ion-button>
          </ion-item>
        } @else {
          <ion-item>
            <ion-label>
              <p>Connect to sync transactions to Google Sheets.</p>
            </ion-label>
            <ion-button slot="end" (click)="authenticate()">
              <ion-icon name="log-in-outline" slot="start"></ion-icon>
              Connect
            </ion-button>
          </ion-item>
        }
      </ion-list>

      <!-- Sheet Configuration -->
      <ion-list>
        <ion-list-header>
          <ion-label>Sheet Configuration</ion-label>
        </ion-list-header>

        <ion-item>
          <ion-icon name="document-text-outline" slot="start"></ion-icon>
          <ion-input
            label="Sheet Name Pattern"
            labelPlacement="stacked"
            [(ngModel)]="sheetPattern"
            placeholder="Monthly budget {month} {year}"
            helperText="Use {month} and {year} as placeholders"
          ></ion-input>
        </ion-item>

        <ion-item>
          <ion-label>
            <p class="pattern-preview">Preview: <strong>{{ sheetPatternPreview }}</strong></p>
          </ion-label>
        </ion-item>

        <ion-item>
          <ion-button fill="outline" (click)="saveSheetPattern()" [disabled]="!isPatternValid">
            <ion-icon name="save-outline" slot="start"></ion-icon>
            Save Pattern
          </ion-button>
        </ion-item>
      </ion-list>

      <!-- Permissions (Android only) -->
      @if (isAndroid) {
        <ion-list>
          <ion-list-header>
            <ion-label>Permissions</ion-label>
          </ion-list-header>

          <ion-item>
            <ion-icon
              slot="start"
              [name]="hasOverlayPermission ? 'checkmark-circle-outline' : 'alert-circle-outline'"
              [color]="hasOverlayPermission ? 'success' : 'warning'"
            ></ion-icon>
            <ion-label>
              <h2>Display Over Other Apps</h2>
              <p>Show transaction popup when app is in background</p>
            </ion-label>
            <ion-button slot="end" fill="outline" (click)="requestOverlayPermission()" [disabled]="hasOverlayPermission">
              {{ hasOverlayPermission ? 'Granted' : 'Enable' }}
            </ion-button>
          </ion-item>
        </ion-list>
      }

      <!-- Data Management -->
      <ion-list>
        <ion-list-header>
          <ion-label>Data Management</ion-label>
        </ion-list-header>

        <ion-item>
          <ion-label>
            <h2>Clear Synced Transactions</h2>
            <p>Remove transactions that have been synced</p>
          </ion-label>
          <ion-button slot="end" fill="outline" color="medium" (click)="clearSynced()">
            Clear
          </ion-button>
        </ion-item>

        <ion-item>
          <ion-label>
            <h2>Clear All Data</h2>
            <p>Delete all local transactions</p>
          </ion-label>
          <ion-button slot="end" fill="outline" color="danger" (click)="clearAll()">
            <ion-icon name="trash-outline" slot="start"></ion-icon>
            Clear All
          </ion-button>
        </ion-item>
      </ion-list>

      <!-- Info -->
      <ion-list>
        <ion-list-header>
          <ion-label>About</ion-label>
        </ion-list-header>

        <ion-item>
          <ion-icon name="information-circle-outline" slot="start"></ion-icon>
          <ion-label>
            <h2>Payment Tracker</h2>
            <p>Version 1.0.0</p>
            <p>Automatically track payments from SMS</p>
          </ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  `,
  styles: [`
    ion-list-header {
      font-weight: 600;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--ion-color-medium);
      margin-top: 16px;
    }

    ion-item {
      --padding-start: 16px;

      h2 {
        font-weight: 500;
      }

      p {
        font-size: 13px;
      }
    }

    .pattern-preview {
      color: var(--ion-color-medium);

      strong {
        color: var(--ion-color-primary);
      }
    }
  `]
})
export class SettingsPage {
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);

  public storage = inject(TransactionStorageService);
  public syncService = inject(SyncService);
  private smsListener = inject(SmsListenerService);

  backendUrl = '';
  sheetPattern = '';
  isAndroid = false;
  hasOverlayPermission = false;

  // Month names for preview
  private readonly MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  constructor() {
    addIcons({
      serverOutline,
      logInOutline,
      logOutOutline,
      refreshOutline,
      trashOutline,
      cloudDoneOutline,
      cloudOfflineOutline,
      informationCircleOutline,
      layersOutline,
      checkmarkCircleOutline,
      alertCircleOutline,
      documentTextOutline,
      saveOutline
    });

    this.backendUrl = this.storage.backendUrl();
    this.sheetPattern = this.storage.sheetNamePattern();
  }

  get sheetPatternPreview(): string {
    const now = new Date();
    return this.sheetPattern
      .replace('{month}', this.MONTHS[now.getMonth()])
      .replace('{year}', now.getFullYear().toString());
  }

  get isPatternValid(): boolean {
    return this.sheetPattern.includes('{month}') && this.sheetPattern.includes('{year}');
  }

  ionViewWillEnter() {
    // Check platform when view is about to enter
    this.isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    console.log('Settings: isAndroid =', this.isAndroid, 'platform =', Capacitor.getPlatform());

    if (this.isAndroid) {
      this.checkOverlayPermission();
    }
  }

  async checkOverlayPermission() {
    console.log('Checking overlay permission...');
    this.hasOverlayPermission = await this.smsListener.checkOverlayPermission();
    console.log('Overlay permission:', this.hasOverlayPermission);
  }

  async requestOverlayPermission() {
    console.log('Requesting overlay permission...');
    await this.smsListener.requestOverlayPermission();
    await this.showToast('Please enable "Display over other apps" for Payment Tracker', 'primary');

    // Check permission again after a delay (user returns from settings)
    setTimeout(() => this.checkOverlayPermission(), 2000);
  }

  async saveBackendUrl() {
    if (this.backendUrl && this.backendUrl !== this.storage.backendUrl()) {
      await this.storage.setBackendUrl(this.backendUrl);
      await this.showToast('Server URL saved', 'success');
    }
  }

  async saveSheetPattern() {
    if (!this.isPatternValid) {
      await this.showToast('Pattern must include {month} and {year}', 'warning');
      return;
    }

    const result = await this.syncService.updateSheetPattern(this.sheetPattern);

    if (result.success) {
      await this.showToast(`Pattern saved! Example: ${result.example}`, 'success');
    } else {
      // Save locally even if backend fails
      await this.storage.setSheetNamePattern(this.sheetPattern);
      await this.showToast('Pattern saved locally (backend unreachable)', 'warning');
    }
  }

  async testConnection() {
    const isReachable = await this.syncService.healthCheck();

    if (isReachable) {
      await this.showToast('Server is reachable!', 'success');
      // Also refresh auth status
      await this.syncService.checkAuthStatus();
    } else {
      await this.showToast('Cannot reach server. Check the URL.', 'danger');
    }
  }

  async authenticate() {
    try {
      await this.syncService.authenticate();
      await this.showToast('Opening Google authentication...', 'primary');

      // After returning from OAuth, check status
      setTimeout(async () => {
        await this.syncService.checkAuthStatus();
      }, 5000);
    } catch (error) {
      await this.showToast('Authentication failed', 'danger');
    }
  }

  async logout() {
    const alert = await this.alertCtrl.create({
      header: 'Disconnect',
      message: 'Are you sure you want to disconnect from Google Sheets?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Disconnect',
          role: 'destructive',
          handler: async () => {
            await this.syncService.logout();
            await this.showToast('Disconnected from Google Sheets', 'success');
          }
        }
      ]
    });

    await alert.present();
  }

  async clearSynced() {
    const count = this.storage.syncedCount();
    if (count === 0) {
      await this.showToast('No synced transactions to clear', 'primary');
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Clear Synced',
      message: `Remove ${count} synced transaction(s)?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Clear',
          handler: async () => {
            await this.storage.clearSynced();
            await this.showToast('Synced transactions cleared', 'success');
          }
        }
      ]
    });

    await alert.present();
  }

  async clearAll() {
    const count = this.storage.transactions().length;
    if (count === 0) {
      await this.showToast('No transactions to clear', 'primary');
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Clear All Data',
      message: `This will delete all ${count} transaction(s). This cannot be undone.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Clear All',
          role: 'destructive',
          handler: async () => {
            await this.storage.clearAll();
            await this.showToast('All data cleared', 'success');
          }
        }
      ]
    });

    await alert.present();
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
