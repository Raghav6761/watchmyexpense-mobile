import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Browser } from '@capacitor/browser';
import { TransactionStorageService } from './transaction-storage.service';
import { SmsListenerService } from './sms-listener.service';
import { Transaction, Categories } from '../models/transaction.model';

export interface AuthStatus {
  authenticated: boolean;
  hasRefreshToken: boolean;
}

export interface SyncResult {
  id: string;
  success: boolean;
  row?: number;
  error?: string;
}

export interface BatchSyncResponse {
  success: boolean;
  synced: number;
  failed: number;
  results: SyncResult[];
  errors: Array<{ id: string; error: string }>;
}

@Injectable({
  providedIn: 'root'
})
export class SyncService {
  private http = inject(HttpClient);
  private storage = inject(TransactionStorageService);
  private smsListener = inject(SmsListenerService);

  // Reactive state
  private _isAuthenticated = signal(false);
  private _isSyncing = signal(false);
  private _isOnline = signal(navigator.onLine);

  // Public signals
  public isAuthenticated = this._isAuthenticated.asReadonly();
  public isSyncing = this._isSyncing.asReadonly();
  public isOnline = this._isOnline.asReadonly();

  // Can sync if online, authenticated, and has ready transactions
  public canSync = computed(() =>
    this._isOnline() &&
    this._isAuthenticated() &&
    this.storage.readyCount() > 0 &&
    !this._isSyncing()
  );

  constructor() {
    // Listen for online/offline events
    window.addEventListener('online', () => this._isOnline.set(true));
    window.addEventListener('offline', () => this._isOnline.set(false));

    // Check auth status on init
    this.checkAuthStatus();
  }

  /**
   * Get the backend URL
   */
  private get baseUrl(): string {
    return this.storage.backendUrl();
  }

  /**
   * Check if backend is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ status: string }>(`${this.baseUrl}/health`)
      );
      return response.status === 'ok';
    } catch {
      return false;
    }
  }

  /**
   * Check authentication status with backend
   */
  async checkAuthStatus(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.get<AuthStatus>(`${this.baseUrl}/auth/status`)
      );
      this._isAuthenticated.set(response.authenticated);
      return response.authenticated;
    } catch {
      this._isAuthenticated.set(false);
      return false;
    }
  }

  /**
   * Start OAuth flow
   */
  async authenticate(): Promise<void> {
    try {
      // Get the OAuth URL from backend
      const response = await firstValueFrom(
        this.http.get<{ url: string }>(`${this.baseUrl}/auth/url`)
      );

      // Open the OAuth URL in system browser
      await Browser.open({ url: response.url });

      // Note: After successful auth, user needs to return to app
      // and we'll check auth status again
    } catch (error) {
      console.error('Authentication error:', error);
      throw error;
    }
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(`${this.baseUrl}/auth/logout`, {})
      );
      this._isAuthenticated.set(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  /**
   * Fetch categories from backend
   */
  async fetchCategories(): Promise<Categories | null> {
    try {
      console.log('[SyncService] Fetching categories from:', `${this.baseUrl}/api/categories`);
      const categories = await firstValueFrom(
        this.http.get<Categories>(`${this.baseUrl}/api/categories`)
      );
      console.log('[SyncService] Received categories:', {
        expenseCount: categories?.expense?.length || 0,
        incomeCount: categories?.income?.length || 0,
        expenses: categories?.expense,
        income: categories?.income
      });
      await this.storage.updateCategories(categories);
      console.log('[SyncService] Categories stored successfully');

      // Also update native overlay categories
      await this.smsListener.setCategories(categories.expense, categories.income);

      return categories;
    } catch (error) {
      console.error('[SyncService] Error fetching categories:', error);
      return null;
    }
  }

  /**
   * Update sheet name pattern on backend
   */
  async updateSheetPattern(pattern: string): Promise<{ success: boolean; example?: string; error?: string }> {
    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean; pattern: string; example: string }>(
          `${this.baseUrl}/api/config/pattern`,
          { pattern }
        )
      );
      // Save locally
      await this.storage.setSheetNamePattern(pattern);
      return { success: true, example: response.example };
    } catch (error: unknown) {
      console.error('Error updating sheet pattern:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to update pattern';
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Update fiscal year start month on backend
   */
  async updateYearStartMonth(month: number): Promise<{ success: boolean; example?: string; error?: string }> {
    try {
      const response = await firstValueFrom(
        this.http.post<{ success: boolean; yearStartMonth: number; spreadsheetNameExample: string }>(
          `${this.baseUrl}/api/config/year-start`,
          { month }
        )
      );
      await this.storage.setYearStartMonth(month);
      return { success: true, example: response.spreadsheetNameExample };
    } catch (error: unknown) {
      console.error('Error updating year start month:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to update';
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Get current backend configuration
   */
  async getBackendConfig(): Promise<{
    yearStartMonth: number;
    example: string;
  } | null> {
    try {
      const response = await firstValueFrom(
        this.http.get<{
          yearStartMonth: number;
          spreadsheetNameExample: string;
        }>(`${this.baseUrl}/api/config`)
      );

      return {
        yearStartMonth: response.yearStartMonth,
        example: response.spreadsheetNameExample
      };
    } catch (error) {
      console.error('Error fetching backend config:', error);
      return null;
    }
  }

  /**
   * Sync a single transaction
   */
  async syncTransaction(transaction: Transaction): Promise<boolean> {
    console.log('[SyncService] Starting sync for transaction:', {
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      category: transaction.category,
      description: transaction.description
    });

    if (!this._isAuthenticated()) {
      console.error('[SyncService] Not authenticated - cannot sync');
      return false;
    }

    try {
      const endpoint = transaction.type === 'expense'
        ? `${this.baseUrl}/api/expense`
        : `${this.baseUrl}/api/income`;

      const payload = {
        date: transaction.date.toISOString(),
        amount: transaction.amount,
        description: transaction.description,
        category: transaction.category,
        source: transaction.source || ''
      };

      console.log('[SyncService] Sending to:', endpoint);
      console.log('[SyncService] Payload:', payload);

      const response = await firstValueFrom(
        this.http.post(endpoint, payload)
      );

      console.log('[SyncService] Sync successful:', response);
      await this.storage.markSynced(transaction.id);
      return true;
    } catch (error) {
      console.error('[SyncService] Sync error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Sync failed';
      await this.storage.markError(transaction.id, errorMessage);
      return false;
    }
  }

  /**
   * Batch sync all ready transactions
   */
  async syncAll(): Promise<{ synced: number; failed: number }> {
    if (!this._isAuthenticated()) {
      return { synced: 0, failed: 0 };
    }

    const readyTransactions = this.storage.readyTransactions();
    if (readyTransactions.length === 0) {
      return { synced: 0, failed: 0 };
    }

    this._isSyncing.set(true);

    try {
      const response = await firstValueFrom(
        this.http.post<BatchSyncResponse>(`${this.baseUrl}/api/sync`, {
          transactions: readyTransactions.map(t => ({
            id: t.id,
            type: t.type,
            date: t.date.toISOString(),
            amount: t.amount,
            description: t.description,
            category: t.category
          }))
        })
      );

      // Update transaction statuses based on response
      for (const result of response.results) {
        if (result.success) {
          await this.storage.markSynced(result.id);
        }
      }

      for (const error of response.errors) {
        await this.storage.markError(error.id, error.error);
      }

      return { synced: response.synced, failed: response.failed };
    } catch (error) {
      console.error('Batch sync error:', error);

      // Mark all as error
      const errorMessage = error instanceof Error ? error.message : 'Sync failed';
      for (const t of readyTransactions) {
        await this.storage.markError(t.id, errorMessage);
      }

      return { synced: 0, failed: readyTransactions.length };
    } finally {
      this._isSyncing.set(false);
    }
  }

  /**
   * Retry failed transactions
   */
  async retryFailed(): Promise<void> {
    const errorTransactions = this.storage.getTransactionsByStatus('error');
    for (const t of errorTransactions) {
      // Only retry if it has a category (was ready before)
      if (t.category) {
        await this.storage.updateTransaction(t.id, {
          status: 'ready',
          errorMessage: undefined
        });
      }
    }
  }

  /**
   * Auto-sync when conditions are met
   */
  async autoSync(): Promise<void> {
    if (this.canSync()) {
      await this.syncAll();
    }
  }

  /**
   * Add a new category
   */
  async addCategory(type: 'expense' | 'income', name: string): Promise<{ success: boolean; error?: string }> {
    try {
      await firstValueFrom(
        this.http.post(`${this.baseUrl}/api/categories/add`, { type, name })
      );
      await this.fetchCategories();
      return { success: true };
    } catch (error: any) {
      const msg = error?.error?.error || error?.message || 'Failed to add category';
      return { success: false, error: msg };
    }
  }

  /**
   * Rename a category across all sheets
   */
  async editCategory(type: 'expense' | 'income', oldName: string, newName: string): Promise<{ success: boolean; error?: string }> {
    try {
      await firstValueFrom(
        this.http.post(`${this.baseUrl}/api/categories/edit`, { type, oldName, newName })
      );
      await this.fetchCategories();
      return { success: true };
    } catch (error: any) {
      const msg = error?.error?.error || error?.message || 'Failed to edit category';
      return { success: false, error: msg };
    }
  }

  /**
   * Delete a category from dropdown (existing data preserved)
   */
  async deleteCategory(type: 'expense' | 'income', name: string): Promise<{ success: boolean; error?: string }> {
    try {
      await firstValueFrom(
        this.http.post(`${this.baseUrl}/api/categories/delete`, { type, name })
      );
      await this.fetchCategories();
      return { success: true };
    } catch (error: any) {
      const msg = error?.error?.error || error?.message || 'Failed to delete category';
      return { success: false, error: msg };
    }
  }
}
