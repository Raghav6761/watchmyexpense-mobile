import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonList,
  IonItem,
  IonLabel,
  IonButton,
  IonIcon,
  IonFab,
  IonFabButton,
  IonInput,
  IonNote,
  IonChip,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonSegment,
  IonSegmentButton,
  AlertController,
  ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, createOutline, trashOutline, cardOutline } from 'ionicons/icons';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { TransactionStorageService } from '../../services/transaction-storage.service';

interface MasterLiability {
  name: string;
  creditLimit: number;
  interestRate: number;
  billingCycle: string;
  sourceKeyword: string;
}

interface MonthlyLiability {
  name: string;
  spent: number;
  paid: number;
  outstanding: number;
  dueDate: string;
  minDue: number;
}

@Component({
  selector: 'app-liabilities',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
    IonCard, IonCardContent, IonCardHeader, IonCardTitle,
    IonList, IonItem, IonLabel, IonButton, IonIcon,
    IonFab, IonFabButton, IonInput, IonNote, IonChip,
    IonItemSliding, IonItemOptions, IonItemOption,
    IonSegment, IonSegmentButton
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/settings"></ion-back-button>
        </ion-buttons>
        <ion-title>Liabilities</ion-title>
      </ion-toolbar>

      <ion-toolbar>
        <ion-segment [(ngModel)]="selectedSegment">
          <ion-segment-button value="master">
            <ion-label>Cards & Loans</ion-label>
          </ion-segment-button>
          <ion-segment-button value="monthly">
            <ion-label>This Month</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true">
      <!-- Master Register -->
      @if (selectedSegment === 'master') {
        <ion-list>
          @for (item of masterLiabilities(); track item.name) {
            <ion-item-sliding>
              <ion-item>
                <ion-icon name="card-outline" slot="start" class="card-icon"></ion-icon>
                <ion-label>
                  <h2>{{ item.name }}</h2>
                  <p>
                    @if (item.creditLimit) {
                      Limit: {{ item.creditLimit | currency:'INR':'symbol-narrow':'1.0-0' }}
                    }
                    @if (item.interestRate) {
                      &middot; {{ item.interestRate }}% APR
                    }
                    @if (item.billingCycle) {
                      &middot; {{ item.billingCycle }}
                    }
                  </p>
                  @if (item.sourceKeyword) {
                    <p class="source-hint">Auto-tracks: "{{ item.sourceKeyword }}" transactions</p>
                  }
                </ion-label>
              </ion-item>
              <ion-item-options side="end">
                <ion-item-option color="primary" (click)="editMaster(item)">
                  <ion-icon slot="icon-only" name="create-outline"></ion-icon>
                </ion-item-option>
                <ion-item-option color="danger" (click)="deleteMaster(item.name)">
                  <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
                </ion-item-option>
              </ion-item-options>
            </ion-item-sliding>
          }

          @if (masterLiabilities().length === 0) {
            <ion-item>
              <ion-label class="ion-text-center">
                <p>No cards or loans registered yet</p>
                <p>Tap + to add one</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }

      <!-- Monthly Entries -->
      @if (selectedSegment === 'monthly') {
        <ion-list>
          @for (item of monthlyLiabilities(); track item.name) {
            <ion-card>
              <ion-card-content>
                <div class="monthly-header">
                  <h2>{{ item.name }}</h2>
                  <ion-chip [color]="item.outstanding <= 0 && item.spent > 0 ? 'success' : (item.paid === 0 && item.spent > 0 ? 'danger' : 'warning')" outline="true">
                    {{ item.outstanding <= 0 && item.spent > 0 ? 'Paid' : (item.paid === 0 && item.spent > 0 ? 'Unpaid' : 'Partial') }}
                  </ion-chip>
                </div>
                <div class="monthly-grid">
                  <div class="grid-item">
                    <span class="grid-label">Spent</span>
                    <span class="grid-value">{{ item.spent | currency:'INR':'symbol-narrow':'1.0-0' }}</span>
                  </div>
                  <div class="grid-item">
                    <span class="grid-label">Paid</span>
                    <span class="grid-value paid">{{ item.paid | currency:'INR':'symbol-narrow':'1.0-0' }}</span>
                  </div>
                  <div class="grid-item">
                    <span class="grid-label">Outstanding</span>
                    <span class="grid-value outstanding">{{ item.outstanding | currency:'INR':'symbol-narrow':'1.0-0' }}</span>
                  </div>
                  <div class="grid-item">
                    <span class="grid-label">Min Due</span>
                    <span class="grid-value">{{ item.minDue | currency:'INR':'symbol-narrow':'1.0-0' }}</span>
                  </div>
                </div>
                <ion-button expand="block" fill="outline" size="small" (click)="updateMonthly(item)">
                  Update
                </ion-button>
              </ion-card-content>
            </ion-card>
          }

          @if (monthlyLiabilities().length === 0 && masterLiabilities().length > 0) {
            <ion-item>
              <ion-label class="ion-text-center">
                <p>No entries this month yet</p>
                <ion-button fill="outline" size="small" (click)="initMonthlyFromMaster()">
                  Initialize from registered cards
                </ion-button>
              </ion-label>
            </ion-item>
          }

          @if (masterLiabilities().length === 0) {
            <ion-item>
              <ion-label class="ion-text-center">
                <p>Register your cards & loans first in the "Cards & Loans" tab</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }

      @if (selectedSegment === 'master') {
        <ion-fab vertical="bottom" horizontal="end" slot="fixed">
          <ion-fab-button (click)="addMaster()">
            <ion-icon name="add-outline"></ion-icon>
          </ion-fab-button>
        </ion-fab>
      }
    </ion-content>
  `,
  styles: [`
    .card-icon { color: var(--ion-color-primary); font-size: 24px; }

    .monthly-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .monthly-header h2 { margin: 0; font-size: 16px; font-weight: 600; }

    .monthly-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 12px;
    }
    .grid-item {
      display: flex;
      flex-direction: column;
    }
    .grid-label { font-size: 11px; color: var(--ion-color-medium); }
    .grid-value { font-size: 16px; font-weight: 600; }
    .grid-value.paid { color: var(--ion-color-success); }
    .grid-value.outstanding { color: var(--ion-color-danger); }

    ion-card { margin: 8px 12px; }
    .source-hint { color: var(--ion-color-primary); font-size: 12px; font-style: italic; }
  `]
})
export class LiabilitiesPage implements OnInit {
  private http = inject(HttpClient);
  private storage = inject(TransactionStorageService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  masterLiabilities = signal<MasterLiability[]>([]);
  monthlyLiabilities = signal<MonthlyLiability[]>([]);
  selectedSegment: 'master' | 'monthly' = 'master';

  private get baseUrl() { return this.storage.backendUrl(); }

  constructor() {
    addIcons({ addOutline, createOutline, trashOutline, cardOutline });
  }

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    try {
      // Fetch master liabilities
      const masterRes = await firstValueFrom(
        this.http.get<{ liabilities: MasterLiability[] }>(`${this.baseUrl}/api/liabilities/master`)
      );
      this.masterLiabilities.set(masterRes.liabilities || []);

      // Fetch current month's liabilities
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const monthlyRes = await firstValueFrom(
        this.http.get<{ liabilities: MonthlyLiability[] }>(`${this.baseUrl}/api/liabilities/${year}/${month}`)
      );
      this.monthlyLiabilities.set(monthlyRes.liabilities || []);
    } catch (error) {
      console.error('Error loading liabilities:', error);
    }
  }

  async addMaster() {
    const alert = await this.alertCtrl.create({
      header: 'Add Card / Loan',
      inputs: [
        { name: 'name', type: 'text', placeholder: 'Name (e.g. HDFC Credit Card)' },
        { name: 'sourceKeyword', type: 'text', placeholder: 'Source keyword (e.g. HDFC) — auto-tracks spending' },
        { name: 'creditLimit', type: 'number', placeholder: 'Credit Limit / Principal' },
        { name: 'interestRate', type: 'number', placeholder: 'Interest Rate %' },
        { name: 'billingCycle', type: 'text', placeholder: 'Billing Cycle (e.g. 1st-30th)' }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Add',
          handler: async (data) => {
            if (!data.name?.trim()) return false;
            try {
              await firstValueFrom(this.http.post(`${this.baseUrl}/api/liabilities/master`, {
                name: data.name.trim(),
                creditLimit: parseFloat(data.creditLimit) || 0,
                interestRate: parseFloat(data.interestRate) || 0,
                billingCycle: data.billingCycle || '',
                sourceKeyword: data.sourceKeyword?.trim() || ''
              }));
              await this.loadData();
              await this.showToast(`"${data.name}" added`, 'success');
            } catch (error) {
              await this.showToast('Failed to add', 'danger');
            }
            return true;
          }
        }
      ]
    });
    await alert.present();
  }

  async editMaster(item: MasterLiability) {
    const alert = await this.alertCtrl.create({
      header: 'Edit Card / Loan',
      inputs: [
        { name: 'name', type: 'text', value: item.name, placeholder: 'Name' },
        { name: 'sourceKeyword', type: 'text', value: item.sourceKeyword || '', placeholder: 'Source keyword (e.g. HDFC)' },
        { name: 'creditLimit', type: 'number', value: item.creditLimit?.toString() || '', placeholder: 'Credit Limit' },
        { name: 'interestRate', type: 'number', value: item.interestRate?.toString() || '', placeholder: 'Interest Rate %' },
        { name: 'billingCycle', type: 'text', value: item.billingCycle || '', placeholder: 'Billing Cycle' }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: async (data) => {
            if (!data.name?.trim()) return false;
            try {
              await firstValueFrom(this.http.post(`${this.baseUrl}/api/liabilities/master`, {
                name: data.name.trim(),
                creditLimit: parseFloat(data.creditLimit) || 0,
                interestRate: parseFloat(data.interestRate) || 0,
                billingCycle: data.billingCycle || '',
                sourceKeyword: data.sourceKeyword?.trim() || ''
              }));
              await this.loadData();
              await this.showToast('Updated', 'success');
            } catch (error) {
              await this.showToast('Failed to update', 'danger');
            }
            return true;
          }
        }
      ]
    });
    await alert.present();
  }

  async deleteMaster(name: string) {
    const alert = await this.alertCtrl.create({
      header: 'Delete',
      message: `Remove "${name}" from registered cards/loans?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          handler: async () => {
            try {
              await firstValueFrom(this.http.post(`${this.baseUrl}/api/liabilities/master/delete`, { name }));
              await this.loadData();
              await this.showToast(`"${name}" removed`, 'success');
            } catch (error) {
              await this.showToast('Failed to delete', 'danger');
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async updateMonthly(item: MonthlyLiability) {
    const alert = await this.alertCtrl.create({
      header: item.name,
      message: 'Update this month\'s values',
      inputs: [
        { name: 'spent', type: 'number', value: item.spent?.toString() || '0', placeholder: 'Spent' },
        { name: 'paid', type: 'number', value: item.paid?.toString() || '0', placeholder: 'Paid' },
        { name: 'outstanding', type: 'number', value: item.outstanding?.toString() || '0', placeholder: 'Outstanding' },
        { name: 'dueDate', type: 'text', value: item.dueDate || '', placeholder: 'Due Date (e.g. 15/04/2026)' },
        { name: 'minDue', type: 'number', value: item.minDue?.toString() || '0', placeholder: 'Min Due' }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: async (data) => {
            try {
              const now = new Date();
              await firstValueFrom(this.http.post(`${this.baseUrl}/api/liabilities`, {
                date: now.toISOString(),
                name: item.name,
                spent: parseFloat(data.spent) || 0,
                paid: parseFloat(data.paid) || 0,
                outstanding: parseFloat(data.outstanding) || 0,
                dueDate: data.dueDate || '',
                minDue: parseFloat(data.minDue) || 0
              }));
              await this.loadData();
              await this.showToast('Updated', 'success');
            } catch (error) {
              await this.showToast('Failed to update', 'danger');
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async initMonthlyFromMaster() {
    const master = this.masterLiabilities();
    const now = new Date();

    for (const item of master) {
      try {
        await firstValueFrom(this.http.post(`${this.baseUrl}/api/liabilities`, {
          date: now.toISOString(),
          name: item.name,
          spent: 0,
          paid: 0,
          outstanding: 0,
          dueDate: '',
          minDue: 0
        }));
      } catch (error) {
        console.error(`Error initializing ${item.name}:`, error);
      }
    }

    await this.loadData();
    await this.showToast(`Initialized ${master.length} entries`, 'success');
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({
      message, duration: 2000, color, position: 'bottom'
    });
    await toast.present();
  }
}
