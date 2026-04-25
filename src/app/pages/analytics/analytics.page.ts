import { Component, OnInit, inject, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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
  IonChip
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chevronBackOutline,
  chevronForwardOutline,
  walletOutline,
  trendingUpOutline,
  trendingDownOutline,
  cashOutline
} from 'ionicons/icons';
import { Chart, registerables } from 'chart.js';

import { AnalyticsService, MonthlySnapshot, MonthlyBudgetData } from '../../services/analytics.service';

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
    IonChip
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
          @if (liabilities() && liabilities()!.length > 0) {
            <ion-segment-button value="liabilities">
              <ion-label>Liabilities</ion-label>
            </ion-segment-button>
          }
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
        @if (viewSegment === 'liabilities' && liabilities()) {
          @if (totalLiabilities() > 0) {
            <ion-card class="liability-total-card">
              <ion-card-content>
                <div class="liability-total">
                  <span class="liability-total-label">Total Outstanding</span>
                  <span class="liability-total-value">{{ totalLiabilities() | currency:'INR':'symbol-narrow':'1.0-0' }}</span>
                </div>
              </ion-card-content>
            </ion-card>
          }

          @for (item of liabilities()!; track item.name) {
            <ion-card class="liability-card" [class.paid-full]="item.outstanding <= 0 && item.spent > 0" [class.due-soon]="isDueSoon(item.dueDate) && item.outstanding > 0" [class.unpaid]="item.outstanding > 0 && item.paid === 0">
              <ion-card-content>
                <div class="liability-header">
                  <span class="liability-name">{{ item.name }}</span>
                  <ion-chip [color]="item.outstanding <= 0 && item.spent > 0 ? 'success' : (item.paid === 0 && item.outstanding > 0 ? 'danger' : 'warning')" outline="true">
                    {{ item.outstanding <= 0 && item.spent > 0 ? 'Paid' : (item.paid === 0 && item.outstanding > 0 ? 'Unpaid' : 'Partial') }}
                  </ion-chip>
                </div>
                <div class="liability-details">
                  <div class="liability-detail">
                    <span class="detail-label">Spent</span>
                    <span class="detail-value">{{ item.spent | currency:'INR':'symbol-narrow':'1.0-0' }}</span>
                  </div>
                  <div class="liability-detail">
                    <span class="detail-label">Paid</span>
                    <span class="detail-value paid-value">{{ item.paid | currency:'INR':'symbol-narrow':'1.0-0' }}</span>
                  </div>
                  <div class="liability-detail">
                    <span class="detail-label">Outstanding</span>
                    <span class="detail-value outstanding-value">{{ item.outstanding | currency:'INR':'symbol-narrow':'1.0-0' }}</span>
                  </div>
                  @if (item.dueDate) {
                    <div class="liability-detail">
                      <span class="detail-label">Due Date</span>
                      <span class="detail-value">{{ item.dueDate }}</span>
                    </div>
                  }
                </div>
              </ion-card-content>
            </ion-card>
          }

          @if (liabilities()!.length === 0) {
            <div class="empty-state">
              <ion-icon name="wallet-outline" class="empty-icon"></ion-icon>
              <p>No liabilities this month</p>
            </div>
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

    .liability-total-card { margin: 12px; }
    .liability-total {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .liability-total-label { font-size: 16px; font-weight: 600; }
    .liability-total-value { font-size: 20px; font-weight: 700; color: var(--ion-color-danger); }

    .liability-card { margin: 8px 12px; }
    .liability-card.paid-full { border-left: 4px solid var(--ion-color-success); }
    .liability-card.due-soon { border-left: 4px solid var(--ion-color-warning); }
    .liability-card.unpaid { border-left: 4px solid var(--ion-color-danger); }

    .liability-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .liability-name { font-size: 16px; font-weight: 600; }

    .liability-details {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .liability-detail {
      display: flex;
      flex-direction: column;
    }
    .detail-label { font-size: 11px; color: var(--ion-color-medium); }
    .detail-value { font-size: 14px; font-weight: 500; }
    .paid-value { color: var(--ion-color-success); }
    .outstanding-value { color: var(--ion-color-danger); }

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
  analytics = inject(AnalyticsService);

  snapshot = signal<MonthlySnapshot | null>(null);
  budgetData = signal<MonthlyBudgetData | null>(null);
  balance = signal<{ startBalance: number; endBalance: number; savings: number } | null>(null);
  liabilities = signal<{ name: string; spent: number; paid: number; outstanding: number; dueDate: string; minDue: number }[] | null>(null);
  totalLiabilities = signal(0);

  viewSegment: 'expenses' | 'income' | 'daily' | 'budget' | 'liabilities' | 'trends' = 'expenses';
  topCategories: { category: string; avgAmount: number }[] = [];

  Math = Math; // expose to template

  @ViewChild('expenseChart') expenseChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('incomeChart') incomeChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('dailyChart') dailyChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('trendChart') trendChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('savingsChart') savingsChartRef!: ElementRef<HTMLCanvasElement>;

  private expenseChartInstance?: Chart;
  private incomeChartInstance?: Chart;
  private dailyChartInstance?: Chart;
  private trendChartInstance?: Chart;
  private savingsChartInstance?: Chart;

  private chartColors = [
    '#E87526', '#009688', '#374759', '#4A86C8', '#CC0000',
    '#38761D', '#9C27B0', '#FF9800', '#607D8B', '#795548',
    '#3F51B5', '#00BCD4', '#CDDC39', '#FF5722', '#8BC34A',
    '#673AB7', '#FFC107', '#03A9F4', '#E91E63'
  ];

  constructor() {
    addIcons({
      chevronBackOutline, chevronForwardOutline,
      walletOutline, trendingUpOutline, trendingDownOutline, cashOutline
    });
  }

  ngOnInit() {
    this.loadData();
  }

  prevMonth() {
    this.analytics.navigateMonth(-1);
    this.loadData();
  }

  nextMonth() {
    this.analytics.navigateMonth(1);
    this.loadData();
  }

  onSegmentChange() {
    setTimeout(() => {
      this.renderCharts();
      if (this.viewSegment === 'trends') {
        this.renderTrendCharts();
      }
    }, 100);
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

  async loadData() {
    this.snapshot.set(this.analytics.getMonthlySnapshot());

    // Fetch budget data from backend (non-blocking)
    this.analytics.fetchBudgetData().then(data => {
      this.budgetData.set(data);
    });

    this.analytics.fetchBalanceData().then(data => {
      this.balance.set(data);
    });

    this.analytics.fetchLiabilities().then(data => {
      this.liabilities.set(data);
      if (data) {
        this.totalLiabilities.set(data.reduce((sum, l) => sum + (l.outstanding || 0), 0));
      }
    });

    setTimeout(() => this.renderCharts(), 200);
  }

  private renderCharts() {
    const snap = this.snapshot();
    if (!snap) return;

    if (this.viewSegment === 'expenses' && this.expenseChartRef) {
      this.renderDonutChart('expense', snap.expensesByCategory);
    }
    if (this.viewSegment === 'income' && this.incomeChartRef) {
      this.renderDonutChart('income', snap.incomeByCategory);
    }
    if (this.viewSegment === 'daily' && this.dailyChartRef) {
      this.renderDailyChart(snap.dailyExpenses);
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
}
