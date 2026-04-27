import { Component, OnInit, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonButton,
  IonButtons,
  IonIcon,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonList,
  IonItem,
  IonNote,
  IonProgressBar,
  IonText,
  IonSpinner,
  IonChip,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  AlertController,
  ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chevronBackOutline,
  chevronForwardOutline,
  walletOutline,
  trendingUpOutline,
  trendingDownOutline,
  cashOutline,
  addOutline,
  createOutline,
  trashOutline,
  cardOutline
} from 'ionicons/icons';
import { Chart, registerables } from 'chart.js';

import { AnalyticsService, MonthlySnapshot, MonthlyBudgetData } from '../../services/analytics.service';
import { TransactionStorageService } from '../../services/transaction-storage.service';
import { MasterLiability } from '../../models/transaction.model';

Chart.register(...registerables);

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonButton,
    IonButtons,
    IonIcon,
    IonLabel,
    IonSegment,
    IonSegmentButton,
    IonList,
    IonItem,
    IonNote,
    IonProgressBar,
    IonText,
    IonSpinner,
    IonChip,
    IonItemSliding,
    IonItemOptions,
    IonItemOption
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Analytics</ion-title>
      </ion-toolbar>

      <!-- Month Navigator -->
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="prevMonth()">
            <ion-icon slot="icon-only" name="chevron-back-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title class="month-title">{{ analytics.selectedMonthName() }} {{ analytics.selectedYear() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="nextMonth()">
            <ion-icon slot="icon-only" name="chevron-forward-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true">

      @if (snapshot()) {
        <!-- Balance Card -->
        @if (balance()) {
          <ion-card class="balance-card">
            <ion-card-content>
              <div class="balance-row">
                <div class="balance-item">
                  <span class="balance-label">Start Balance</span>
                  <span class="balance-value">{{ balance()!.startBalance | currency:'INR':'symbol-narrow':'1.0-0' }}</span>
                </div>
                <ion-icon name="chevron-forward-outline" class="balance-arrow"></ion-icon>
                <div class="balance-item">
                  <span class="balance-label">End Balance</span>
                  <span class="balance-value" [class.positive]="balance()!.endBalance >= balance()!.startBalance" [class.negative]="balance()!.endBalance < balance()!.startBalance">
                    {{ balance()!.endBalance | currency:'INR':'symbol-narrow':'1.0-0' }}
                  </span>
                </div>
              </div>
            </ion-card-content>
          </ion-card>
        }

        <!-- Summary Cards -->
        <div class="summary-row">
          <ion-card class="summary-card expense-card">
            <ion-card-content>
              <ion-icon name="trending-down-outline" class="card-icon expense-icon"></ion-icon>
              <span class="card-amount">{{ snapshot()!.totalExpenses | currency:'INR':'symbol-narrow':'1.0-0' }}</span>
              <span class="card-label">Spent</span>
            </ion-card-content>
          </ion-card>

          <ion-card class="summary-card income-card">
            <ion-card-content>
              <ion-icon name="trending-up-outline" class="card-icon income-icon"></ion-icon>
              <span class="card-amount">{{ snapshot()!.totalIncome | currency:'INR':'symbol-narrow':'1.0-0' }}</span>
              <span class="card-label">Earned</span>
            </ion-card-content>
          </ion-card>

          <ion-card class="summary-card savings-card">
            <ion-card-content>
              <ion-icon name="wallet-outline" class="card-icon savings-icon"></ion-icon>
              <span class="card-amount" [class.positive]="snapshot()!.netSavings >= 0" [class.negative]="snapshot()!.netSavings < 0">
                {{ snapshot()!.netSavings | currency:'INR':'symbol-narrow':'1.0-0' }}
              </span>
              <span class="card-label">Saved</span>
            </ion-card-content>
          </ion-card>
        </div>

        <!-- Category Segment -->
        <ion-segment [(ngModel)]="viewSegment" (ionChange)="onSegmentChange()" scrollable="true">
          <ion-segment-button value="expenses">
            <ion-label>Expenses</ion-label>
          </ion-segment-button>
          <ion-segment-button value="income">
            <ion-label>Income</ion-label>
          </ion-segment-button>
          <ion-segment-button value="daily">
            <ion-label>Daily</ion-label>
          </ion-segment-button>
          @if (budgetData()) {
            <ion-segment-button value="budget">
              <ion-label>Budget</ion-label>
            </ion-segment-button>
          }
          <ion-segment-button value="liabilities">
            <ion-label>Liabilities</ion-label>
          </ion-segment-button>
          <ion-segment-button value="trends">
            <ion-label>Trends</ion-label>
          </ion-segment-button>
        </ion-segment>

        <!-- Expense Donut Chart -->
        @if (viewSegment === 'expenses') {
          <ion-card>
            <ion-card-content>
              @if (snapshot()!.expensesByCategory.length > 0) {
                <div class="chart-container">
                  <canvas #expenseChart></canvas>
                </div>
                <ion-list>
                  @for (cat of snapshot()!.expensesByCategory; track cat.category) {
                    <ion-item button (click)="openCategoryDetail(cat.category, 'expense')">
                      <ion-label>
                        <h3>{{ cat.category }}</h3>
                        <p>{{ cat.count }} transaction{{ cat.count > 1 ? 's' : '' }}</p>
                      </ion-label>
                      <ion-note slot="end" class="expense-amount">
                        {{ cat.amount | currency:'INR':'symbol-narrow':'1.0-0' }}
                        <br><small>{{ cat.percentage | number:'1.1-1' }}%</small>
                      </ion-note>
                    </ion-item>
                  }
                </ion-list>
              } @else {
                <div class="empty-state">
                  <ion-icon name="cash-outline" class="empty-icon"></ion-icon>
                  <p>No expenses this month</p>
                </div>
              }
            </ion-card-content>
          </ion-card>
        }

        <!-- Income Donut Chart -->
        @if (viewSegment === 'income') {
          <ion-card>
            <ion-card-content>
              @if (snapshot()!.incomeByCategory.length > 0) {
                <div class="chart-container">
                  <canvas #incomeChart></canvas>
                </div>
                <ion-list>
                  @for (cat of snapshot()!.incomeByCategory; track cat.category) {
                    <ion-item button (click)="openCategoryDetail(cat.category, 'income')">
                      <ion-label>
                        <h3>{{ cat.category }}</h3>
                        <p>{{ cat.count }} transaction{{ cat.count > 1 ? 's' : '' }}</p>
                      </ion-label>
                      <ion-note slot="end" class="income-amount">
                        {{ cat.amount | currency:'INR':'symbol-narrow':'1.0-0' }}
                        <br><small>{{ cat.percentage | number:'1.1-1' }}%</small>
                      </ion-note>
                    </ion-item>
                  }
                </ion-list>
              } @else {
                <div class="empty-state">
                  <ion-icon name="cash-outline" class="empty-icon"></ion-icon>
                  <p>No income this month</p>
                </div>
              }
            </ion-card-content>
          </ion-card>
        }

        <!-- Daily Bar Chart -->
        @if (viewSegment === 'daily') {
          <ion-card>
            <ion-card-content>
              @if (snapshot()!.totalExpenses > 0) {
                <div class="chart-container chart-wide">
                  <canvas #dailyChart></canvas>
                </div>
              } @else {
                <div class="empty-state">
                  <ion-icon name="cash-outline" class="empty-icon"></ion-icon>
                  <p>No expenses this month</p>
                </div>
              }
            </ion-card-content>
          </ion-card>
        }

        <!-- Budget vs Actual -->
        @if (viewSegment === 'budget' && budgetData()) {
          <ion-card>
            <ion-card-header>
              <ion-card-title>Expenses: Budget vs Actual</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              @for (item of budgetData()!.expenses; track item.category) {
                @if (item.category) {
                  <div class="budget-row">
                    <div class="budget-category">{{ item.category }}</div>
                    <div class="budget-bar-container">
                      <ion-progress-bar
                        [value]="item.planned > 0 ? Math.min(item.actual / item.planned, 1) : 0"
                        [color]="item.actual > item.planned && item.planned > 0 ? 'danger' : 'primary'">
                      </ion-progress-bar>
                    </div>
                    <div class="budget-values">
                      <span [class.over-budget]="item.diff < 0">
                        {{ item.actual | currency:'INR':'symbol-narrow':'1.0-0' }}
                      </span>
                      <span class="budget-planned">/ {{ item.planned | currency:'INR':'symbol-narrow':'1.0-0' }}</span>
                    </div>
                  </div>
                }
              }
            </ion-card-content>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-title>Income: Budget vs Actual</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              @for (item of budgetData()!.income; track item.category) {
                @if (item.category) {
                  <div class="budget-row">
                    <div class="budget-category">{{ item.category }}</div>
                    <div class="budget-bar-container">
                      <ion-progress-bar
                        [value]="item.planned > 0 ? Math.min(item.actual / item.planned, 1) : 0"
                        [color]="'success'">
                      </ion-progress-bar>
                    </div>
                    <div class="budget-values">
                      <span>{{ item.actual | currency:'INR':'symbol-narrow':'1.0-0' }}</span>
                      <span class="budget-planned">/ {{ item.planned | currency:'INR':'symbol-narrow':'1.0-0' }}</span>
                    </div>
                  </div>
                }
              }
            </ion-card-content>
          </ion-card>
        }

        <!-- Liabilities Dashboard -->
        @if (viewSegment === 'liabilities') {
          @if (isLoadingLiabilities()) {
            <div class="liability-loading">
              <ion-spinner name="crescent"></ion-spinner>
              <p>Loading liabilities...</p>
            </div>
          } @else if (masterLiabilities().length === 0) {
            <div class="empty-state">
              <ion-icon name="wallet-outline" class="empty-icon"></ion-icon>
              <p>No cards or loans registered yet</p>
              <ion-button fill="solid" (click)="addMaster()">
                <ion-icon slot="start" name="add-outline"></ion-icon>
                Add Card / Loan
              </ion-button>
            </div>
          } @else {
            <ion-card>
              <ion-card-content>
                <!-- Donut chart of outstanding by card (only when there's something to show) -->
                @if (liabilityChartData().length > 0) {
                  <div class="chart-container">
                    <canvas #liabilityChart></canvas>
                  </div>
                } @else {
                  <div class="liability-no-chart">
                    <ion-icon name="wallet-outline"></ion-icon>
                    <p>No outstanding this month</p>
                  </div>
                }

                <!-- Total Outstanding summary row -->
                <div class="liability-total-row">
                  <span class="liability-total-label">Total Outstanding</span>
                  <span class="liability-total-value">{{ totalLiabilities() | currency:'INR':'symbol-narrow':'1.0-0' }}</span>
                </div>

                <!-- Per-card list. Tap a row to update Paid / Due / Min Due. -->
                <!-- Swipe a row to access Edit / Delete master settings.    -->
                <ion-list>
                  @for (card of unifiedLiabilities(); track card.name) {
                    <ion-item-sliding>
                      <ion-item button (click)="openLiabilityDetail(card.name)" detail="true"
                        [class.paid-full]="card.outstanding <= 0 && card.spent > 0"
                        [class.due-soon]="isDueSoon(card.dueDate) && card.outstanding > 0"
                        [class.unpaid]="card.outstanding > 0 && card.paid === 0">
                        <ion-label>
                          <h3>{{ card.name }}</h3>
                          <p class="liability-meta">
                            @if (card.creditLimit) {
                              Limit: {{ card.creditLimit | currency:'INR':'symbol-narrow':'1.0-0' }}
                            }
                            @if (card.billingCycle) {
                              &middot; {{ card.billingCycle }}
                            }
                          </p>
                          <p class="liability-stats-line">
                            Spent {{ card.spent | currency:'INR':'symbol-narrow':'1.0-0' }}
                            &middot; Paid <span class="paid-value">{{ card.paid | currency:'INR':'symbol-narrow':'1.0-0' }}</span>
                          </p>
                          @if (card.sourceKeyword) {
                            <p class="source-hint">Auto-tracks: "{{ card.sourceKeyword }}"</p>
                          }
                        </ion-label>
                        <ion-note slot="end" class="liability-amount">
                          {{ card.outstanding | currency:'INR':'symbol-narrow':'1.0-0' }}
                          <br><small>outstanding</small>
                        </ion-note>
                      </ion-item>
                      <ion-item-options side="end">
                        <ion-item-option color="primary" (click)="editMaster(card)">
                          <ion-icon slot="icon-only" name="create-outline"></ion-icon>
                        </ion-item-option>
                        <ion-item-option color="danger" (click)="deleteMaster(card.name)">
                          <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
                        </ion-item-option>
                      </ion-item-options>
                    </ion-item-sliding>
                  }
                </ion-list>

                <!-- Helper add button — small, secondary, at the bottom. -->
                <ion-button fill="clear" size="small" class="add-card-helper" (click)="addMaster()">
                  <ion-icon slot="start" name="add-outline"></ion-icon>
                  Add another card / loan
                </ion-button>
              </ion-card-content>
            </ion-card>
          }
        }

        <!-- Trends -->
        @if (viewSegment === 'trends') {
          <ion-card>
            <ion-card-header>
              <ion-card-title>Expenses vs Income (6 months)</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              @if (hasTrendData()) {
                <div class="chart-container chart-wide">
                  <canvas #trendChart></canvas>
                </div>
              } @else {
                <div class="empty-state">
                  <p>Not enough data for trends yet</p>
                </div>
              }
            </ion-card-content>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-title>Savings Trend</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              @if (hasTrendData()) {
                <div class="chart-container chart-wide">
                  <canvas #savingsChart></canvas>
                </div>
              } @else {
                <div class="empty-state">
                  <p>Not enough data for trends yet</p>
                </div>
              }
            </ion-card-content>
          </ion-card>

          @if (hasTrendData()) {
            <ion-card>
              <ion-card-header>
                <ion-card-title>Top Spending Categories</ion-card-title>
              </ion-card-header>
              <ion-card-content>
                @for (cat of topCategories; track cat.category) {
                  <div class="top-cat-row">
                    <span class="top-cat-name">{{ cat.category }}</span>
                    <span class="top-cat-avg">{{ cat.avgAmount | currency:'INR':'symbol-narrow':'1.0-0' }}/mo</span>
                  </div>
                }
              </ion-card-content>
            </ion-card>
          }
        }
      }
    </ion-content>
  `,
  styles: [`
    .month-title {
      text-align: center;
      font-size: 16px;
      font-weight: 600;
    }

    .balance-card {
      margin: 12px;
    }
    .balance-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .balance-item {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .balance-label {
      font-size: 12px;
      color: var(--ion-color-medium);
    }
    .balance-value {
      font-size: 18px;
      font-weight: 700;
    }
    .balance-arrow {
      font-size: 20px;
      color: var(--ion-color-medium);
    }

    .summary-row {
      display: flex;
      gap: 8px;
      padding: 0 12px;
    }
    .summary-card {
      flex: 1;
      margin: 0;
    }
    .summary-card ion-card-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 12px 8px;
    }
    .card-icon {
      font-size: 24px;
      margin-bottom: 4px;
    }
    .expense-icon { color: var(--ion-color-danger); }
    .income-icon { color: var(--ion-color-success); }
    .savings-icon { color: var(--ion-color-primary); }
    .card-amount {
      font-size: 14px;
      font-weight: 700;
    }
    .card-label {
      font-size: 11px;
      color: var(--ion-color-medium);
    }

    .positive { color: var(--ion-color-success) !important; }
    .negative { color: var(--ion-color-danger) !important; }

    ion-segment {
      margin: 12px;
    }
    ion-segment-button {
      min-width: 80px;
      --padding-start: 8px;
      --padding-end: 8px;
      font-size: 13px;
    }

    .chart-container {
      height: 220px;
      display: flex;
      justify-content: center;
      align-items: center;
      margin-bottom: 12px;
    }
    .chart-wide {
      height: 180px;
    }

    .expense-amount {
      text-align: right;
      color: var(--ion-color-danger);
      font-weight: 600;
    }
    .income-amount {
      text-align: right;
      color: var(--ion-color-success);
      font-weight: 600;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px;
      color: var(--ion-color-medium);
    }
    .empty-icon {
      font-size: 48px;
      margin-bottom: 8px;
    }

    .budget-row {
      margin-bottom: 14px;
      padding: 8px 12px;
      background: var(--ion-color-light);
      border-radius: 8px;
    }
    .budget-category {
      font-size: 14px;
      font-weight: 600;
      color: var(--ion-text-color);
      margin-bottom: 6px;
    }
    .budget-bar-container {
      margin-bottom: 4px;
    }
    .budget-values {
      font-size: 13px;
      color: var(--ion-text-color);
    }
    .budget-planned {
      color: var(--ion-color-medium-shade);
      font-size: 12px;
    }
    .over-budget {
      color: var(--ion-color-danger);
      font-weight: 700;
    }

    .liability-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px;
      color: var(--ion-color-medium);
    }
    .liability-loading p { margin-top: 8px; font-size: 14px; }

    .liability-no-chart {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px;
      color: var(--ion-color-medium);
    }
    .liability-no-chart ion-icon { font-size: 36px; margin-bottom: 6px; }
    .liability-no-chart p { font-size: 13px; margin: 0; }

    .liability-total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 4px 12px;
      border-bottom: 1px solid var(--ion-color-light);
      margin-bottom: 4px;
    }
    .liability-total-label { font-size: 14px; font-weight: 600; color: var(--ion-color-medium); }
    .liability-total-value { font-size: 18px; font-weight: 700; color: var(--ion-color-danger); }

    .liability-meta { font-size: 12px; color: var(--ion-color-medium); }
    .liability-stats-line { font-size: 12px; color: var(--ion-color-medium); }
    .liability-stats-line .paid-value { color: var(--ion-color-success); font-weight: 600; }

    .source-hint {
      color: var(--ion-color-primary);
      font-size: 11px;
      font-style: italic;
    }

    .liability-amount {
      text-align: right;
      color: var(--ion-color-danger);
      font-weight: 600;
      font-size: 14px;
    }
    .liability-amount small {
      font-weight: normal;
      font-size: 10px;
      color: var(--ion-color-medium);
    }

    ion-item.paid-full { --border-color: var(--ion-color-success); border-left: 3px solid var(--ion-color-success); }
    ion-item.due-soon { --border-color: var(--ion-color-warning); border-left: 3px solid var(--ion-color-warning); }
    ion-item.unpaid { --border-color: var(--ion-color-danger); border-left: 3px solid var(--ion-color-danger); }

    .add-card-helper {
      margin-top: 8px;
      --color: var(--ion-color-primary);
    }

    .top-cat-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid var(--ion-color-light);
    }
    .top-cat-row:last-child { border-bottom: none; }
    .top-cat-name { font-size: 14px; font-weight: 500; }
    .top-cat-avg { font-size: 14px; color: var(--ion-color-danger); font-weight: 600; }
  `]
})
export class AnalyticsPage implements OnInit {
  private router = inject(Router);
  private http = inject(HttpClient);
  private storage = inject(TransactionStorageService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  analytics = inject(AnalyticsService);

  snapshot = signal<MonthlySnapshot | null>(null);
  budgetData = signal<MonthlyBudgetData | null>(null);
  balance = signal<{ startBalance: number; endBalance: number; savings: number } | null>(null);
  liabilities = signal<{ name: string; spent: number; paid: number; outstanding: number; dueDate: string; minDue: number }[] | null>(null);
  totalLiabilities = signal(0);
  masterLiabilities = signal<MasterLiability[]>([]);
  isLoadingLiabilities = signal(false);

  // Master register joined with this-month rows. Every registered card always
  // appears in the list — if monthly data is missing for a card, its stats
  // default to 0 so the row is still rendered. Lets the user see every card
  // even before any spending has been picked up.
  unifiedLiabilities = computed(() => {
    const master = this.masterLiabilities();
    const monthly = this.liabilities() || [];
    const monthlyMap = new Map(monthly.map(m => [m.name, m]));
    return master.map(card => {
      const m = monthlyMap.get(card.name);
      return {
        name: card.name,
        creditLimit: card.creditLimit,
        interestRate: card.interestRate,
        billingCycle: card.billingCycle,
        sourceKeyword: card.sourceKeyword,
        spent: m?.spent || 0,
        paid: m?.paid || 0,
        outstanding: m?.outstanding || 0,
        dueDate: m?.dueDate || '',
        minDue: m?.minDue || 0
      };
    });
  });

  // Chart data: outstanding per card, only including cards with non-zero
  // outstanding so the donut isn't a sea of zero slices.
  liabilityChartData = computed(() => {
    return this.unifiedLiabilities()
      .filter(c => c.outstanding > 0)
      .map(c => ({ category: c.name, amount: c.outstanding }));
  });

  viewSegment: 'expenses' | 'income' | 'daily' | 'budget' | 'liabilities' | 'trends' = 'expenses';
  topCategories: { category: string; avgAmount: number }[] = [];

  private get baseUrl() { return this.storage.backendUrl(); }

  Math = Math; // expose to template

  @ViewChild('expenseChart') expenseChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('incomeChart') incomeChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('dailyChart') dailyChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('trendChart') trendChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('savingsChart') savingsChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('liabilityChart') liabilityChartRef!: ElementRef<HTMLCanvasElement>;

  private expenseChartInstance?: Chart;
  private incomeChartInstance?: Chart;
  private dailyChartInstance?: Chart;
  private trendChartInstance?: Chart;
  private savingsChartInstance?: Chart;
  private liabilityChartInstance?: Chart;

  private chartColors = [
    '#E87526', '#009688', '#374759', '#4A86C8', '#CC0000',
    '#38761D', '#9C27B0', '#FF9800', '#607D8B', '#795548',
    '#3F51B5', '#00BCD4', '#CDDC39', '#FF5722', '#8BC34A',
    '#673AB7', '#FFC107', '#03A9F4', '#E91E63'
  ];

  constructor() {
    addIcons({
      chevronBackOutline, chevronForwardOutline,
      walletOutline, trendingUpOutline, trendingDownOutline, cashOutline,
      addOutline, createOutline, trashOutline, cardOutline
    });
  }

  ngOnInit() {
    // Initial load is handled by ionViewWillEnter so the same refresh-on-entry
    // behavior fires on first mount and on every subsequent visit. Avoids a
    // duplicate fetch on first mount.
  }

  // Fires every time the Analytics tab becomes active (Ionic-specific).
  // Pattern matches what the user sees in Liabilities: local cached data shows
  // immediately (snapshot is computed from in-memory transactions); backend
  // fetches go out in parallel and update the corresponding signal as each
  // resolves. Liabilities have their own loader because they also auto-init.
  async ionViewWillEnter() {
    this.loadData();
    await this.loadLiabilitiesData();
    // After liabilities resolve, re-render the active chart in case the user
    // is sitting on the Liabilities tab and it just got fresh data.
    setTimeout(() => this.renderCharts(), 50);
  }

  prevMonth() {
    this.analytics.navigateMonth(-1);
    this.loadData();
    this.loadLiabilitiesData();
  }

  nextMonth() {
    this.analytics.navigateMonth(1);
    this.loadData();
    this.loadLiabilitiesData();
  }

  onSegmentChange() {
    // renderCharts already routes to the right method per active segment
    // (expenses / income / daily / trends / liabilities).
    setTimeout(() => this.renderCharts(), 100);
  }

  hasTrendData(): boolean {
    const trends = this.analytics.getTrends(6);
    return trends.expenses.some(v => v > 0) || trends.income.some(v => v > 0);
  }

  isDueSoon(dueDate: string): boolean {
    if (!dueDate) return false;
    const due = new Date(dueDate);
    const now = new Date();
    const diffDays = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 5;
  }

  openCategoryDetail(category: string, type: 'expense' | 'income') {
    this.router.navigate(['/category-detail'], {
      queryParams: { category, type }
    });
  }

  openLiabilityDetail(name: string) {
    this.router.navigate(['/liability-detail'], {
      queryParams: { name }
    });
  }

  async loadData() {
    // 1. Show whatever's in local storage immediately so the user sees data
    //    instantly (no spinner on top-level numbers / charts).
    this.snapshot.set(this.analytics.getMonthlySnapshot());

    // 2. Fire all backend fetches in parallel. Each updates its own signal
    //    when the response lands — none of them block the others.
    this.analytics.fetchBudgetData().then(data => this.budgetData.set(data));
    this.analytics.fetchBalanceData().then(data => this.balance.set(data));

    // 3. Pull raw transactions from the sheet → updates local cache → re-snap
    //    the analytics view. This is what makes Spent / Earned / Saved /
    //    Expenses / Income / Daily / Trends "live": their numbers come from
    //    the snapshot which is recomputed from the freshly-pulled cache.
    const year = this.analytics.selectedYear();
    const month = this.analytics.selectedMonth();
    this.analytics.pullTransactions(year, month).then(() => {
      this.snapshot.set(this.analytics.getMonthlySnapshot());
      setTimeout(() => this.renderCharts(), 50);
    });

    // 4. Initial chart render with local cache data — don't wait for the pull
    //    to complete (the pull's .then will re-render on top of this).
    setTimeout(() => this.renderCharts(), 100);
  }

  // Re-renders the chart for whichever segment is currently active. Called
  // both from onSegmentChange (when the user switches tabs) and from the
  // post-fetch paths in ionViewWillEnter / loadData / loadLiabilitiesData,
  // so each sub-tab redraws with the latest data on every entry.
  private renderCharts() {
    const snap = this.snapshot();

    if (this.viewSegment === 'expenses' && snap && this.expenseChartRef) {
      this.renderDonutChart('expense', snap.expensesByCategory);
    }
    if (this.viewSegment === 'income' && snap && this.incomeChartRef) {
      this.renderDonutChart('income', snap.incomeByCategory);
    }
    if (this.viewSegment === 'daily' && snap && this.dailyChartRef) {
      this.renderDailyChart(snap.dailyExpenses);
    }
    if (this.viewSegment === 'trends') {
      this.renderTrendCharts();
    }
    if (this.viewSegment === 'liabilities') {
      this.renderLiabilityChart();
    }
  }

  private renderDonutChart(type: 'expense' | 'income', data: { category: string; amount: number }[]) {
    const ref = type === 'expense' ? this.expenseChartRef : this.incomeChartRef;
    if (!ref?.nativeElement) return;

    const instance = type === 'expense' ? this.expenseChartInstance : this.incomeChartInstance;
    if (instance) instance.destroy();

    const chart = new Chart(ref.nativeElement, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.category),
        datasets: [{
          data: data.map(d => d.amount),
          backgroundColor: this.chartColors.slice(0, data.length),
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { boxWidth: 12, font: { size: 11 } }
          }
        },
        cutout: '60%'
      }
    });

    if (type === 'expense') this.expenseChartInstance = chart;
    else this.incomeChartInstance = chart;
  }

  private renderLiabilityChart() {
    const data = this.liabilityChartData();
    if (!this.liabilityChartRef?.nativeElement) return;
    if (this.liabilityChartInstance) {
      this.liabilityChartInstance.destroy();
      this.liabilityChartInstance = undefined;
    }
    if (data.length === 0) return; // no outstanding to chart

    this.liabilityChartInstance = new Chart(this.liabilityChartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.category),
        datasets: [{
          data: data.map(d => d.amount),
          backgroundColor: this.chartColors.slice(0, data.length),
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { boxWidth: 12, font: { size: 11 } }
          }
        },
        cutout: '60%'
      }
    });
  }

  private renderDailyChart(data: { day: number; amount: number }[]) {
    if (!this.dailyChartRef?.nativeElement) return;
    if (this.dailyChartInstance) this.dailyChartInstance.destroy();

    this.dailyChartInstance = new Chart(this.dailyChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: data.map(d => d.day.toString()),
        datasets: [{
          data: data.map(d => d.amount),
          backgroundColor: data.map(d => d.amount > 0 ? '#E87526' : '#e0e0e0'),
          borderRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 9 }, maxRotation: 0 }
          },
          y: {
            beginAtZero: true,
            ticks: {
              font: { size: 10 },
              callback: (val) => '₹' + val
            }
          }
        }
      }
    });
  }

  private renderTrendCharts() {
    const trends = this.analytics.getTrends(6);

    // Compute top categories over the 6-month period
    const recentMonths = this.analytics.getRecentMonths(6);
    const catTotals = new Map<string, number>();
    for (const m of recentMonths) {
      const txns = this.analytics.getTransactionsForMonth(m.year, m.month);
      for (const t of txns.filter(t => t.type === 'expense')) {
        const cat = t.category || 'Uncategorized';
        catTotals.set(cat, (catTotals.get(cat) || 0) + t.amount);
      }
    }
    this.topCategories = Array.from(catTotals.entries())
      .map(([category, total]) => ({ category, avgAmount: total / 6 }))
      .sort((a, b) => b.avgAmount - a.avgAmount)
      .slice(0, 5);

    // Expense vs Income line chart
    if (this.trendChartRef?.nativeElement) {
      if (this.trendChartInstance) this.trendChartInstance.destroy();

      this.trendChartInstance = new Chart(this.trendChartRef.nativeElement, {
        type: 'line',
        data: {
          labels: trends.months,
          datasets: [
            {
              label: 'Expenses',
              data: trends.expenses,
              borderColor: '#CC0000',
              backgroundColor: 'rgba(204,0,0,0.1)',
              fill: true,
              tension: 0.3
            },
            {
              label: 'Income',
              data: trends.income,
              borderColor: '#38761D',
              backgroundColor: 'rgba(56,118,29,0.1)',
              fill: true,
              tension: 0.3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { font: { size: 10 }, callback: (val) => '₹' + val }
            }
          }
        }
      });
    }

    // Savings trend bar chart
    if (this.savingsChartRef?.nativeElement) {
      if (this.savingsChartInstance) this.savingsChartInstance.destroy();

      this.savingsChartInstance = new Chart(this.savingsChartRef.nativeElement, {
        type: 'bar',
        data: {
          labels: trends.months,
          datasets: [{
            label: 'Net Savings',
            data: trends.savings,
            backgroundColor: trends.savings.map(v => v >= 0 ? 'rgba(56,118,29,0.7)' : 'rgba(204,0,0,0.7)'),
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              ticks: { font: { size: 10 }, callback: (val) => '₹' + val }
            }
          }
        }
      });
    }
  }

  // ─── Liability data loading + auto-init ─────────────────────────────
  //
  // Called on every entry to the Analytics tab and on month navigation.
  // Sequence:
  //   1. Fetch master register + this month's monthly rows in parallel.
  //   2. For every master card with no monthly row this month, create one
  //      (zeros). This is what replaces the old "Initialize from registered
  //      cards" button — but we only init the *missing* cards, so any Paid
  //      amount the user already entered survives.
  //   3. Refetch monthly so the just-created rows appear in the UI.
  async loadLiabilitiesData() {
    this.isLoadingLiabilities.set(true);
    try {
      const [masterRes, monthly] = await Promise.all([
        firstValueFrom(this.http.get<{ liabilities: MasterLiability[] }>(`${this.baseUrl}/api/liabilities/master`)),
        this.analytics.fetchLiabilities()
      ]);

      const master = masterRes.liabilities || [];
      this.masterLiabilities.set(master);
      await this.storage.updateLiabilities(master);

      const monthlyList = monthly || [];
      const monthlyNames = new Set(monthlyList.map(m => m.name));
      const missing = master.filter(card => !monthlyNames.has(card.name));

      if (missing.length > 0) {
        const now = new Date().toISOString();
        await Promise.all(missing.map(card =>
          firstValueFrom(this.http.post(`${this.baseUrl}/api/liabilities`, {
            date: now,
            name: card.name,
            spent: 0, paid: 0, outstanding: 0, dueDate: '', minDue: 0
          })).catch(err => console.error(`Auto-init failed for ${card.name}:`, err))
        ));
        const refreshed = await this.analytics.fetchLiabilities();
        this.liabilities.set(refreshed || []);
      } else {
        this.liabilities.set(monthlyList);
      }

      const current = this.liabilities();
      this.totalLiabilities.set(
        current ? current.reduce((sum, l) => sum + (l.outstanding || 0), 0) : 0
      );
    } catch (error) {
      console.error('Error loading liabilities:', error);
    } finally {
      this.isLoadingLiabilities.set(false);
    }
  }

  async addMaster() {
    const alert = await this.alertCtrl.create({
      header: 'Add Card / Loan',
      inputs: [
        { name: 'name', type: 'text', placeholder: 'Name (e.g. HDFC Credit Card)' },
        { name: 'sourceKeyword', type: 'text', placeholder: 'Match keywords (e.g. "HDFC, 1525") — comma-separated, all must match' },
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
              await this.loadLiabilitiesData();
              await this.showToast(`"${data.name}" added`, 'success');
            } catch {
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
        { name: 'sourceKeyword', type: 'text', value: item.sourceKeyword || '', placeholder: 'Source keyword (e.g. HDFC, 1525)' },
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
              await this.loadLiabilitiesData();
              await this.showToast('Updated', 'success');
            } catch {
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
              await this.loadLiabilitiesData();
              await this.showToast(`"${name}" removed`, 'success');
            } catch {
              await this.showToast('Failed to delete', 'danger');
            }
          }
        }
      ]
    });
    await alert.present();
  }

  async updateMonthly(item: { name: string; spent: number; paid: number; outstanding: number; dueDate: string; minDue: number }) {
    const alert = await this.alertCtrl.create({
      header: item.name,
      message: 'Update this month\'s values',
      inputs: [
        { name: 'paid', type: 'number', value: item.paid?.toString() || '0', placeholder: 'Paid' },
        { name: 'dueDate', type: 'text', value: item.dueDate || '', placeholder: 'Due Date (e.g. 15/04/2026)' },
        { name: 'minDue', type: 'number', value: item.minDue?.toString() || '0', placeholder: 'Min Due' }
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
                name: item.name,
                spent: item.spent || 0,
                paid: parseFloat(data.paid) || 0,
                outstanding: 0,  // backend overwrites with =P-Q formula
                dueDate: data.dueDate || '',
                minDue: parseFloat(data.minDue) || 0
              }));
              await this.loadLiabilitiesData();
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
