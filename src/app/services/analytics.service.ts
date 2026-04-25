import { Injectable, inject, signal, computed } from '@angular/core';
import { TransactionStorageService } from './transaction-storage.service';
import { SyncService } from './sync.service';
import { Transaction } from '../models/transaction.model';

export interface CategoryBreakdown {
  category: string;
  amount: number;
  percentage: number;
  count: number;
}

export interface MonthlySnapshot {
  year: number;
  month: number;
  monthName: string;
  totalExpenses: number;
  totalIncome: number;
  netSavings: number;
  expensesByCategory: CategoryBreakdown[];
  incomeByCategory: CategoryBreakdown[];
  dailyExpenses: { day: number; amount: number }[];
  transactionCount: number;
}

export interface BudgetComparison {
  category: string;
  planned: number;
  actual: number;
  diff: number;
}

export interface MonthlyBudgetData {
  expenses: BudgetComparison[];
  income: BudgetComparison[];
  totals: {
    expensePlanned: number;
    expenseActual: number;
    expenseDiff: number;
    incomePlanned: number;
    incomeActual: number;
    incomeDiff: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private storage = inject(TransactionStorageService);
  private syncService = inject(SyncService);

  private _selectedYear = signal(new Date().getFullYear());
  private _selectedMonth = signal(new Date().getMonth() + 1); // 1-based

  public selectedYear = this._selectedYear.asReadonly();
  public selectedMonth = this._selectedMonth.asReadonly();

  public selectedMonthName = computed(() => {
    const names = ['', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return names[this._selectedMonth()];
  });

  setMonth(year: number, month: number) {
    this._selectedYear.set(year);
    this._selectedMonth.set(month);
  }

  navigateMonth(direction: -1 | 1) {
    let month = this._selectedMonth() + direction;
    let year = this._selectedYear();
    if (month < 1) { month = 12; year--; }
    if (month > 12) { month = 1; year++; }
    this._selectedYear.set(year);
    this._selectedMonth.set(month);
  }

  getMonthlySnapshot(): MonthlySnapshot {
    const year = this._selectedYear();
    const month = this._selectedMonth();
    const transactions = this.getTransactionsForMonth(year, month);

    const expenses = transactions.filter(t => t.type === 'expense');
    const income = transactions.filter(t => t.type === 'income');

    const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);
    const totalIncome = income.reduce((sum, t) => sum + t.amount, 0);

    return {
      year,
      month,
      monthName: this.selectedMonthName(),
      totalExpenses,
      totalIncome,
      netSavings: totalIncome - totalExpenses,
      expensesByCategory: this.groupByCategory(expenses, totalExpenses),
      incomeByCategory: this.groupByCategory(income, totalIncome),
      dailyExpenses: this.getDailyBreakdown(expenses, year, month),
      transactionCount: transactions.length
    };
  }

  async fetchBudgetData(): Promise<MonthlyBudgetData | null> {
    if (!this.syncService.isAuthenticated()) return null;

    try {
      const year = this._selectedYear();
      const month = this._selectedMonth();
      const baseUrl = this.storage.backendUrl();

      const response = await fetch(
        `${baseUrl}/api/budget/${year}/${month}`
      );

      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async fetchLiabilities(): Promise<{ name: string; spent: number; paid: number; outstanding: number; dueDate: string; minDue: number }[] | null> {
    if (!this.syncService.isAuthenticated()) return null;

    try {
      const year = this._selectedYear();
      const month = this._selectedMonth();
      const baseUrl = this.storage.backendUrl();

      const response = await fetch(
        `${baseUrl}/api/liabilities/${year}/${month}`
      );

      if (!response.ok) return null;
      const data = await response.json();
      return data.liabilities || [];
    } catch {
      return null;
    }
  }

  async fetchBalanceData(): Promise<{ startBalance: number; endBalance: number; savings: number } | null> {
    if (!this.syncService.isAuthenticated()) return null;

    try {
      const year = this._selectedYear();
      const month = this._selectedMonth();
      const baseUrl = this.storage.backendUrl();

      const response = await fetch(
        `${baseUrl}/api/balance/${year}/${month}`
      );

      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  getTransactionsForMonth(year: number, month: number): Transaction[] {
    const all = this.storage.transactions();
    return all.filter((t: Transaction) => {
      const d = new Date(t.date);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
  }

  getRecentMonths(count: number): { year: number; month: number; monthName: string }[] {
    const months = [];
    let year = this._selectedYear();
    let month = this._selectedMonth();

    for (let i = 0; i < count; i++) {
      const names = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      months.push({ year, month, monthName: names[month] });
      month--;
      if (month < 1) { month = 12; year--; }
    }

    return months.reverse();
  }

  getTrends(monthCount: number = 6): {
    months: string[];
    expenses: number[];
    income: number[];
    savings: number[];
  } {
    const recentMonths = this.getRecentMonths(monthCount);
    const months: string[] = [];
    const expenses: number[] = [];
    const income: number[] = [];
    const savings: number[] = [];

    for (const m of recentMonths) {
      const txns = this.getTransactionsForMonth(m.year, m.month);
      const exp = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      const inc = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);

      months.push(m.monthName);
      expenses.push(exp);
      income.push(inc);
      savings.push(inc - exp);
    }

    return { months, expenses, income, savings };
  }

  private groupByCategory(transactions: Transaction[], total: number): CategoryBreakdown[] {
    const map = new Map<string, { amount: number; count: number }>();

    for (const t of transactions) {
      const cat = t.category || 'Uncategorized';
      const existing = map.get(cat) || { amount: 0, count: 0 };
      existing.amount += t.amount;
      existing.count++;
      map.set(cat, existing);
    }

    return Array.from(map.entries())
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        percentage: total > 0 ? (data.amount / total) * 100 : 0,
        count: data.count
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  private getDailyBreakdown(expenses: Transaction[], year: number, month: number): { day: number; amount: number }[] {
    const daysInMonth = new Date(year, month, 0).getDate();
    const daily: { day: number; amount: number }[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dayTotal = expenses
        .filter(t => new Date(t.date).getDate() === day)
        .reduce((sum, t) => sum + t.amount, 0);
      daily.push({ day, amount: dayTotal });
    }

    return daily;
  }
}
