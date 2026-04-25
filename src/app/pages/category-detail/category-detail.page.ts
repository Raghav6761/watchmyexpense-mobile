import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
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
  IonProgressBar,
  IonIcon,
  IonChip
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { receiptOutline, cashOutline } from 'ionicons/icons';

import { AnalyticsService, MonthlyBudgetData } from '../../services/analytics.service';
import { Transaction } from '../../models/transaction.model';

@Component({
  selector: 'app-category-detail',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
    IonCard, IonCardContent, IonList, IonItem, IonLabel, IonNote,
    IonProgressBar, IonIcon, IonChip
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/analytics"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ categoryName }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true">
      <!-- Stats Card -->
      <ion-card>
        <ion-card-content>
          <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-value" [class]="type === 'expense' ? 'expense-color' : 'income-color'">
                {{ totalAmount | currency:'INR':'symbol-narrow':'1.0-0' }}
              </span>
              <span class="stat-label">Total</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ percentage | number:'1.1-1' }}%</span>
              <span class="stat-label">of {{ type === 'expense' ? 'spending' : 'income' }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ transactionCount }}</span>
              <span class="stat-label">Transactions</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ avgPerTransaction | currency:'INR':'symbol-narrow':'1.0-0' }}</span>
              <span class="stat-label">Average</span>
            </div>
          </div>
        </ion-card-content>
      </ion-card>

      <!-- Budget Indicator -->
      @if (budgetPlanned > 0) {
        <ion-card>
          <ion-card-content>
            <div class="budget-header">
              <span class="budget-title">Budget</span>
              <span [class.over-budget]="totalAmount > budgetPlanned">
                {{ totalAmount | currency:'INR':'symbol-narrow':'1.0-0' }} of {{ budgetPlanned | currency:'INR':'symbol-narrow':'1.0-0' }}
              </span>
            </div>
            <ion-progress-bar
              [value]="budgetPlanned > 0 ? Math.min(totalAmount / budgetPlanned, 1) : 0"
              [color]="totalAmount > budgetPlanned ? 'danger' : 'primary'">
            </ion-progress-bar>
            @if (totalAmount > budgetPlanned) {
              <div class="budget-warning">
                Over budget by {{ totalAmount - budgetPlanned | currency:'INR':'symbol-narrow':'1.0-0' }}
              </div>
            } @else {
              <div class="budget-remaining">
                {{ budgetPlanned - totalAmount | currency:'INR':'symbol-narrow':'1.0-0' }} remaining
              </div>
            }
          </ion-card-content>
        </ion-card>
      }

      <!-- Transaction List -->
      <ion-card>
        <ion-card-content class="txn-card">
          <div class="section-title">Transactions</div>
          @if (transactions.length > 0) {
            <ion-list>
              @for (txn of transactions; track txn.id) {
                <ion-item>
                  <ion-icon name="receipt-outline" slot="start" class="txn-icon"></ion-icon>
                  <ion-label>
                    <h3>{{ txn.description || txn.merchant || 'No description' }}</h3>
                    <p>{{ txn.date | date:'dd MMM yyyy' }}{{ txn.source ? ' - ' + txn.source : '' }}</p>
                  </ion-label>
                  <ion-note slot="end" [class]="type === 'expense' ? 'expense-color' : 'income-color'">
                    {{ txn.amount | currency:'INR':'symbol-narrow':'1.0-0' }}
                  </ion-note>
                </ion-item>
              }
            </ion-list>
          } @else {
            <div class="empty-state">
              <ion-icon name="cash-outline" class="empty-icon"></ion-icon>
              <p>No transactions found</p>
            </div>
          }
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
  styles: [`
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

    .budget-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 14px;
    }
    .budget-title { font-weight: 600; }
    .over-budget { color: var(--ion-color-danger); font-weight: 600; }
    .budget-warning {
      color: var(--ion-color-danger);
      font-size: 12px;
      margin-top: 4px;
    }
    .budget-remaining {
      color: var(--ion-color-success);
      font-size: 12px;
      margin-top: 4px;
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
    }
    .empty-icon { font-size: 40px; margin-bottom: 8px; }

    ion-progress-bar { height: 8px; border-radius: 4px; }
  `]
})
export class CategoryDetailPage implements OnInit {
  private route = inject(ActivatedRoute);
  private analytics = inject(AnalyticsService);

  Math = Math;

  categoryName = '';
  type: 'expense' | 'income' = 'expense';
  transactions: Transaction[] = [];
  totalAmount = 0;
  percentage = 0;
  transactionCount = 0;
  avgPerTransaction = 0;
  budgetPlanned = 0;

  constructor() {
    addIcons({ receiptOutline, cashOutline });
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.categoryName = params['category'] || '';
      this.type = params['type'] === 'income' ? 'income' : 'expense';
      this.loadData();
    });
  }

  async loadData() {
    const year = this.analytics.selectedYear();
    const month = this.analytics.selectedMonth();
    const snapshot = this.analytics.getMonthlySnapshot();

    // Get transactions for this category
    const allMonthTxns = this.analytics.getTransactionsForMonth(year, month);
    this.transactions = allMonthTxns
      .filter(t => t.type === this.type && t.category === this.categoryName)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    this.totalAmount = this.transactions.reduce((sum, t) => sum + t.amount, 0);
    this.transactionCount = this.transactions.length;
    this.avgPerTransaction = this.transactionCount > 0 ? this.totalAmount / this.transactionCount : 0;

    const totalForType = this.type === 'expense' ? snapshot.totalExpenses : snapshot.totalIncome;
    this.percentage = totalForType > 0 ? (this.totalAmount / totalForType) * 100 : 0;

    // Fetch budget data for this category
    const budgetData = await this.analytics.fetchBudgetData();
    if (budgetData) {
      const list = this.type === 'expense' ? budgetData.expenses : budgetData.income;
      const match = list.find(b => b.category === this.categoryName);
      this.budgetPlanned = match?.planned || 0;
    }
  }
}
