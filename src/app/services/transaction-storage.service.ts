import { Injectable, signal, computed } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import {
  Transaction,
  TransactionStatus,
  Categories,
  MasterLiability,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES
} from '../models/transaction.model';

const STORAGE_KEYS = {
  TRANSACTIONS: 'payment_tracker_transactions',
  CATEGORIES: 'payment_tracker_categories',
  LIABILITIES: 'payment_tracker_liabilities_master',
  BACKEND_URL: 'payment_tracker_backend_url',
  SHEET_NAME_PATTERN: 'payment_tracker_sheet_pattern',
  YEAR_START_MONTH: 'payment_tracker_year_start_month',
  CURRENCY: 'payment_tracker_currency'
};

// Locales recognized by the Angular currency pipe + matching backend pattern.
// Keep in sync with CURRENCY_PATTERNS on the backend.
export const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD', 'AED'] as const;
export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number];

@Injectable({
  providedIn: 'root'
})
export class TransactionStorageService {
  // Reactive state using signals
  private _transactions = signal<Transaction[]>([]);
  private _categories = signal<Categories>({
    expense: DEFAULT_EXPENSE_CATEGORIES,
    income: DEFAULT_INCOME_CATEGORIES
  });
  private _liabilities = signal<MasterLiability[]>([]);
  private _backendUrl = signal<string>('https://api.watchmyexpense.com');
  private _sheetNamePattern = signal<string>('Monthly budget {month} {year}');
  private _yearStartMonth = signal<number>(1); // 1=January, 4=April, etc.
  private _currency = signal<CurrencyCode>('INR');

  // Public readonly signals
  public transactions = this._transactions.asReadonly();
  public categories = this._categories.asReadonly();
  public liabilities = this._liabilities.asReadonly();
  public backendUrl = this._backendUrl.asReadonly();
  public sheetNamePattern = this._sheetNamePattern.asReadonly();
  public yearStartMonth = this._yearStartMonth.asReadonly();
  public currency = this._currency.asReadonly();

  // Computed values
  public pendingCount = computed(() =>
    this._transactions().filter(t => t.status === 'pending').length
  );

  public readyCount = computed(() =>
    this._transactions().filter(t => t.status === 'ready').length
  );

  public syncedCount = computed(() =>
    this._transactions().filter(t => t.status === 'synced').length
  );

  public errorCount = computed(() =>
    this._transactions().filter(t => t.status === 'error').length
  );

  public pendingTransactions = computed(() =>
    this._transactions().filter(t => t.status === 'pending')
  );

  public readyTransactions = computed(() =>
    this._transactions().filter(t => t.status === 'ready')
  );

  public expenseCategories = computed(() =>
    this._categories().expense || []
  );

  public incomeCategories = computed(() =>
    this._categories().income || []
  );

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Load all data from persistent storage
   */
  private async loadFromStorage(): Promise<void> {
    try {
      // Load transactions
      const { value: transactionsJson } = await Preferences.get({
        key: STORAGE_KEYS.TRANSACTIONS
      });
      if (transactionsJson) {
        const transactions = JSON.parse(transactionsJson) as Transaction[];
        // Convert date strings back to Date objects
        const parsed = transactions.map(t => ({
          ...t,
          date: new Date(t.date),
          createdAt: new Date(t.createdAt),
          syncedAt: t.syncedAt ? new Date(t.syncedAt) : undefined
        }));
        this._transactions.set(parsed);
      }

      // Load categories
      const { value: categoriesJson } = await Preferences.get({
        key: STORAGE_KEYS.CATEGORIES
      });
      if (categoriesJson) {
        this._categories.set(JSON.parse(categoriesJson));
      }

      // Load liabilities master register
      const { value: liabilitiesJson } = await Preferences.get({
        key: STORAGE_KEYS.LIABILITIES
      });
      if (liabilitiesJson) {
        this._liabilities.set(JSON.parse(liabilitiesJson));
      }

      // Load backend URL
      const { value: backendUrl } = await Preferences.get({
        key: STORAGE_KEYS.BACKEND_URL
      });
      if (backendUrl) {
        this._backendUrl.set(backendUrl);
      }

      // Load sheet name pattern
      const { value: sheetPattern } = await Preferences.get({
        key: STORAGE_KEYS.SHEET_NAME_PATTERN
      });
      if (sheetPattern) {
        this._sheetNamePattern.set(sheetPattern);
      }

      // Load year start month
      const { value: yearStartMonth } = await Preferences.get({
        key: STORAGE_KEYS.YEAR_START_MONTH
      });
      if (yearStartMonth) {
        this._yearStartMonth.set(parseInt(yearStartMonth, 10));
      }

      // Load currency preference
      const { value: currency } = await Preferences.get({ key: STORAGE_KEYS.CURRENCY });
      if (currency && SUPPORTED_CURRENCIES.includes(currency as CurrencyCode)) {
        this._currency.set(currency as CurrencyCode);
      }
    } catch (error) {
      console.error('Error loading from storage:', error);
    }
  }

  /**
   * Save transactions to persistent storage
   */
  private async saveTransactions(): Promise<void> {
    try {
      await Preferences.set({
        key: STORAGE_KEYS.TRANSACTIONS,
        value: JSON.stringify(this._transactions())
      });
    } catch (error) {
      console.error('Error saving transactions:', error);
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Add a new transaction
   */
  async addTransaction(transaction: Transaction): Promise<void> {
    this._transactions.update(transactions => [transaction, ...transactions]);
    await this.saveTransactions();
  }

  /**
   * Update an existing transaction
   */
  async updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
    this._transactions.update(transactions =>
      transactions.map(t => t.id === id ? { ...t, ...updates } : t)
    );
    await this.saveTransactions();
  }

  /**
   * Mark transaction as ready to sync (has category)
   */
  async markReady(id: string, description: string, category: string): Promise<void> {
    await this.updateTransaction(id, {
      description,
      category,
      status: 'ready'
    });
  }

  /**
   * Mark transaction as synced
   */
  async markSynced(id: string): Promise<void> {
    await this.updateTransaction(id, {
      status: 'synced',
      syncedAt: new Date()
    });
  }

  /**
   * Mark transaction as error
   */
  async markError(id: string, errorMessage: string): Promise<void> {
    await this.updateTransaction(id, {
      status: 'error',
      errorMessage
    });
  }

  /**
   * Mark transaction as pending (retry)
   */
  async markPending(id: string): Promise<void> {
    await this.updateTransaction(id, {
      status: 'pending',
      errorMessage: undefined
    });
  }

  /**
   * Delete a transaction
   */
  async deleteTransaction(id: string): Promise<void> {
    this._transactions.update(transactions =>
      transactions.filter(t => t.id !== id)
    );
    await this.saveTransactions();
  }

  /**
   * Get transaction by ID
   */
  getTransaction(id: string): Transaction | undefined {
    return this._transactions().find(t => t.id === id);
  }

  /**
   * Get transactions by status
   */
  getTransactionsByStatus(status: TransactionStatus): Transaction[] {
    return this._transactions().filter(t => t.status === status);
  }

  /**
   * Update categories from backend
   */
  async updateCategories(categories: Categories): Promise<void> {
    this._categories.set(categories);
    await Preferences.set({
      key: STORAGE_KEYS.CATEGORIES,
      value: JSON.stringify(categories)
    });
  }

  /**
   * Update the liability master register cache (called after fetch from backend
   * or after local edits). Persisted so the SMS parser can match cards offline.
   */
  async updateLiabilities(liabilities: MasterLiability[]): Promise<void> {
    this._liabilities.set(liabilities);
    await Preferences.set({
      key: STORAGE_KEYS.LIABILITIES,
      value: JSON.stringify(liabilities)
    });
  }

  /**
   * Update backend URL
   */
  async setBackendUrl(url: string): Promise<void> {
    this._backendUrl.set(url);
    await Preferences.set({
      key: STORAGE_KEYS.BACKEND_URL,
      value: url
    });
  }

  /**
   * Update sheet name pattern
   */
  async setSheetNamePattern(pattern: string): Promise<void> {
    this._sheetNamePattern.set(pattern);
    await Preferences.set({
      key: STORAGE_KEYS.SHEET_NAME_PATTERN,
      value: pattern
    });
  }

  /**
   * Update fiscal year start month
   */
  async setYearStartMonth(month: number): Promise<void> {
    this._yearStartMonth.set(month);
    await Preferences.set({
      key: STORAGE_KEYS.YEAR_START_MONTH,
      value: month.toString()
    });
  }

  /**
   * Update preferred currency. The mobile app uses this for display formatting.
   * Caller should also POST to /api/config/currency so the backend remembers it
   * and applies the right format on newly-created sheets.
   */
  async setCurrency(code: CurrencyCode): Promise<void> {
    this._currency.set(code);
    await Preferences.set({
      key: STORAGE_KEYS.CURRENCY,
      value: code
    });
  }

  /**
   * Clear all synced transactions (cleanup)
   */
  async clearSynced(): Promise<void> {
    this._transactions.update(transactions =>
      transactions.filter(t => t.status !== 'synced')
    );
    await this.saveTransactions();
  }

  /**
   * Clear all transactions (reset)
   */
  async clearAll(): Promise<void> {
    this._transactions.set([]);
    await this.saveTransactions();
  }

  /**
   * Replace the entire local transactions list. Used by the pullTransactions
   * flow — caller is responsible for deciding the merged shape (e.g. preserve
   * pending/ready/error rows, swap in synced rows from backend).
   */
  async replaceAllTransactions(transactions: Transaction[]): Promise<void> {
    this._transactions.set(transactions);
    await this.saveTransactions();
  }

  /**
   * Add manual transaction
   */
  async addManualTransaction(
    type: 'expense' | 'income',
    amount: number,
    date: Date,
    description: string,
    category: string
  ): Promise<Transaction> {
    const transaction: Transaction = {
      id: this.generateId(),
      type,
      amount,
      date,
      merchant: 'Manual Entry',
      description,
      category,
      source: 'Manual',
      status: 'ready',
      createdAt: new Date()
    };

    await this.addTransaction(transaction);
    return transaction;
  }
}
