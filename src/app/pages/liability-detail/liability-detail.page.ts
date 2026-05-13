import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonCard,
  IonCardContent,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonIcon,
  IonButton,
  IonChip,
  IonSpinner,
  AlertController,
  ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { receiptOutline, cashOutline, walletOutline, createOutline } from 'ionicons/icons';

import { AnalyticsService } from '../../services/analytics.service';
import { TransactionStorageService } from '../../services/transaction-storage.service';
import { Transaction, MasterLiability } from '../../models/transaction.model';

interface MonthlyLiability {
  name: string;
  spent: number;
  paid: number;
  outstanding: number;
  dueDate: string;
  minDue: number;
}

@Component({
  selector: 'app-liability-detail',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
    IonCard, IonCardContent, IonList, IonItem, IonLabel, IonNote, IonIcon,
    IonButton, IonChip, IonSpinner
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/analytics"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ cardName }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true">
      @if (isLoading()) {
        <div class="loading-state">
          <ion-spinner name="crescent"></ion-spinner>
          <p>Loading...</p>
        </div>
      } @else {
        <!-- Stats card -->
        <ion-card>
          <ion-card-content>
            <div class="header-row">
              <ion-chip [color]="statusColor()" outline="true">{{ statusLabel() }}</ion-chip>
              <ion-button fill="solid" size="small" (click)="openUpdate()">
                <ion-icon slot="start" name="create-outline"></ion-icon>
                Update Paid
              </ion-button>
            </div>
            <div class="stats-grid">
              <div class="stat-item">
                <span class="stat-value expense-color">{{ monthly().spent | currency:storage.currency():'symbol-narrow':'1.0-0' }}</span>
                <span class="stat-label">Spent</span>
              </div>
              <div class="stat-item">
                <span class="stat-value income-color">{{ monthly().paid | currency:storage.currency():'symbol-narrow':'1.0-0' }}</span>
                <span class="stat-label">Paid</span>
              </div>
              <div class="stat-item">
                <span class="stat-value danger-color">{{ monthly().outstanding | currency:storage.currency():'symbol-narrow':'1.0-0' }}</span>
                <span class="stat-label">Outstanding</span>
              </div>
              <div class="stat-item">
                <span class="stat-value">{{ transactions().length }}</span>
                <span class="stat-label">Transactions</span>
              </div>
            </div>
            @if (monthly().dueDate || monthly().minDue) {
              <div class="due-row">
                @if (monthly().dueDate) {
                  <span><strong>Due:</strong> {{ monthly().dueDate }}</span>
                }
                @if (monthly().minDue) {
                  <span><strong>Min:</strong> {{ monthly().minDue | currency:storage.currency():'symbol-narrow':'1.0-0' }}</span>
                }
              </div>
            }
          </ion-card-content>
        </ion-card>

        <!-- Master register info -->
        @if (master()) {
          <ion-card>
            <ion-card-content class="master-card">
              <div class="meta-row">
                @if (master()!.creditLimit) {
                  <div class="meta-item">
                    <span class="meta-label">Limit</span>
                    <span class="meta-value">{{ master()!.creditLimit | currency:storage.currency():'symbol-narrow':'1.0-0' }}</span>
                  </div>
                }
                @if (master()!.interestRate) {
                  <div class="meta-item">
                    <span class="meta-label">APR</span>
                    <span class="meta-value">{{ master()!.interestRate }}%</span>
                  </div>
                }
                @if (master()!.billingCycle) {
                  <div class="meta-item">
                    <span class="meta-label">Cycle</span>
                    <span class="meta-value">{{ master()!.billingCycle }}</span>
                  </div>
                }
              </div>
              @if (master()!.sourceKeyword) {
                <div class="source-hint">Auto-tracks SMS containing: "{{ master()!.sourceKeyword }}"</div>
              }
            </ion-card-content>
          </ion-card>
        }

        <!-- Transactions -->
        <ion-card>
          <ion-card-content class="txn-card">
            <div class="section-title">Transactions this month</div>
            @if (transactions().length > 0) {
              <ion-list>
                @for (txn of transactions(); track txn.id) {
                  <ion-item>
                    <ion-icon name="receipt-outline" slot="start" class="txn-icon"></ion-icon>
                    <ion-label>
                      <h3>{{ txn.description || txn.merchant || 'No description' }}</h3>
                      <p>{{ txn.date | date:'dd MMM yyyy' }}{{ txn.category ? ' &middot; ' + txn.category : '' }}</p>
                    </ion-label>
                    <ion-note slot="end" class="expense-color">
                      {{ txn.amount | currency:storage.currency():'symbol-narrow':'1.0-0' }}
                    </ion-note>
                  </ion-item>
                }
              </ion-list>
            } @else {
              <div class="empty-state">
                <ion-icon name="cash-outline" class="empty-icon"></ion-icon>
                <p>No transactions tagged with this card this month</p>
                @if (master()?.sourceKeyword) {
                  <p class="hint">SMS keywords matched: "{{ master()!.sourceKeyword }}"</p>
                }
              </div>
            }
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `,
  styles: [`
    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px;
      color: var(--ion-color-medium);
    }
    .loading-state p { margin-top: 8px; font-size: 14px; }

    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      text-align: center;
    }
    .stat-item {
      display: flex;
      flex-direction: column;
    }
    .stat-value {
      font-size: 20px;
      font-weight: 700;
    }
    .stat-label {
      font-size: 12px;
      color: var(--ion-color-medium);
      margin-top: 2px;
    }
    .expense-color { color: var(--ion-color-danger); }
    .income-color { color: var(--ion-color-success); }
    .danger-color { color: var(--ion-color-danger); }

    .due-row {
      display: flex;
      justify-content: space-around;
      padding-top: 12px;
      margin-top: 12px;
      border-top: 1px solid var(--ion-color-light);
      font-size: 13px;
      color: var(--ion-color-medium);
    }

    .master-card { padding: 12px 16px; }
    .meta-row {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .meta-item {
      display: flex;
      flex-direction: column;
    }
    .meta-label { font-size: 11px; color: var(--ion-color-medium); text-transform: uppercase; }
    .meta-value { font-size: 14px; font-weight: 600; }

    .source-hint {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--ion-color-light);
      color: var(--ion-color-primary);
      font-size: 12px;
      font-style: italic;
    }

    .section-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .txn-card { padding-top: 12px; }
    .txn-icon { color: var(--ion-color-medium); font-size: 20px; }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px;
      color: var(--ion-color-medium);
      text-align: center;
    }
    .empty-icon { font-size: 40px; margin-bottom: 8px; }
    .empty-state .hint { font-size: 12px; font-style: italic; margin-top: 4px; }
  `]
})
export class LiabilityDetailPage implements OnInit {
  private route = inject(ActivatedRoute);
  private analytics = inject(AnalyticsService);
  public storage = inject(TransactionStorageService);
  private http = inject(HttpClient);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  cardName = '';
  isLoading = signal(true);
  master = signal<MasterLiability | null>(null);
  monthly = signal<MonthlyLiability>({
    name: '', spent: 0, paid: 0, outstanding: 0, dueDate: '', minDue: 0
  });
  transactions = signal<Transaction[]>([]);

  statusColor = computed(() => {
    const m = this.monthly();
    if (m.outstanding <= 0 && m.spent > 0) return 'success';
    if (m.paid === 0 && m.outstanding > 0) return 'danger';
    return 'warning';
  });
  statusLabel = computed(() => {
    const m = this.monthly();
    if (m.outstanding <= 0 && m.spent > 0) return 'Paid';
    if (m.paid === 0 && m.outstanding > 0) return 'Unpaid';
    if (m.spent === 0) return 'No activity';
    return 'Partial';
  });

  private get baseUrl() { return this.storage.backendUrl(); }

  constructor() {
    addIcons({ receiptOutline, cashOutline, walletOutline, createOutline });
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.cardName = params['name'] || '';
      this.loadData();
    });
  }

  // Reload when returning to this page (after sync, after update from elsewhere).
  async ionViewWillEnter() {
    if (this.cardName) {
      await this.loadData();
    }
  }

  async loadData() {
    this.isLoading.set(true);
    try {
      // Master register entry — read from cached storage (already fetched by Analytics).
      const cached = this.storage.liabilities().find(l => l.name === this.cardName);
      this.master.set(cached || null);

      // Monthly row for this card from the current selected month.
      const monthlyList = await this.analytics.fetchLiabilities();
      const monthlyMatch = (monthlyList || []).find(l => l.name === this.cardName);
      this.monthly.set(monthlyMatch || {
        name: this.cardName, spent: 0, paid: 0, outstanding: 0, dueDate: '', minDue: 0
      });

      // Transactions tagged with this card as source.
      const year = this.analytics.selectedYear();
      const month = this.analytics.selectedMonth();
      const allTxns = this.analytics.getTransactionsForMonth(year, month);
      const matched = allTxns
        .filter(t => t.type === 'expense' && t.source === this.cardName)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      this.transactions.set(matched);
    } catch (error) {
      console.error('Error loading liability detail:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  async openUpdate() {
    const m = this.monthly();
    const alert = await this.alertCtrl.create({
      header: this.cardName,
      message: 'Update this month\'s values',
      inputs: [
        { name: 'paid', type: 'number', value: m.paid?.toString() || '0', placeholder: 'Paid' },
        { name: 'dueDate', type: 'text', value: m.dueDate || '', placeholder: 'Due Date (e.g. 15/04/2026)' },
        { name: 'minDue', type: 'number', value: m.minDue?.toString() || '0', placeholder: 'Min Due' }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: async (data) => {
            try {
              const now = new Date().toISOString();
              await firstValueFrom(this.http.post(`${this.baseUrl}/api/liabilities`, {
                date: now,
                name: this.cardName,
                spent: m.spent || 0,
                paid: parseFloat(data.paid) || 0,
                outstanding: 0,  // backend overwrites with =P-Q formula
                dueDate: data.dueDate || '',
                minDue: parseFloat(data.minDue) || 0
              }));
              await this.loadData();
              await this.showToast('Updated', 'success');
            } catch {
              await this.showToast('Failed to update', 'danger');
            }
          }
        }
      ]
    });
    await alert.present();
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({
      message, duration: 2000, color, position: 'bottom'
    });
    await toast.present();
  }
}
