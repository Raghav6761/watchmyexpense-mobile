import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { TransactionStorageService } from './transaction-storage.service';
import { AuthService } from './auth.service';
import { Transaction, Categories, MasterLiability } from '../models/transaction.model';

export interface AuthStatus {
  authenticated: boolean;
  email?: string;
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
  private auth = inject(AuthService);

  // Reactive state
  private _isSyncing = signal(false);
  private _isOnline = signal(navigator.onLine);

  // Auth signals are now delegated to AuthService — they reactively follow
  // whatever AuthService says. Keeps settings.page and existing callers working.
  public isAuthenticated = this.auth.signedIn;
  public currentEmail = this.auth.currentEmail;

  public isSyncing = this._isSyncing.asReadonly();
  public isOnline = this._isOnline.asReadonly();

  // Can sync if online, authenticated, and has ready transactions
  public canSync = computed(() =>
    this._isOnline() &&
    this.auth.signedIn() &&
    this.storage.readyCount() > 0 &&
    !this._isSyncing()
  );

  constructor() {
    // Listen for online/offline events
    window.addEventListener('online', () => this._isOnline.set(true));
    window.addEventListener('offline', () => this._isOnline.set(false));
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
   * Re-verify session with backend. Now delegates to AuthService, which
   * also reconciles email and clears local JWT if backend has revoked it.
   */
  async checkAuthStatus(): Promise<boolean> {
    return this.auth.refreshStatus();
  }

  /**
   * Start OAuth flow. Returns immediately — completion is async via the
   * deep-link listener inside AuthService. UI should react to the
   * `isAuthenticated` signal flipping to true.
   */
  async authenticate(): Promise<void> {
    return this.auth.signIn();
  }

  async logout(): Promise<void> {
    return this.auth.signOut();
  }

  /**
   * Fetch the user's liability master register from backend and cache it locally.
   * The SMS parser uses this cache to identify which card a transaction belongs to,
   * so refreshing it after every add/edit/delete is important.
   */
  async fetchLiabilitiesMaster(): Promise<MasterLiability[] | null> {
    if (!this.auth.signedIn()) return null;
    try {
      const res = await firstValueFrom(
        this.http.get<{ liabilities: MasterLiability[] }>(`${this.baseUrl}/api/liabilities/master`)
      );
      const list = res.liabilities || [];
      await this.storage.updateLiabilities(list);
      console.log(`[SyncService] Cached ${list.length} liability cards/loans`);
      return list;
    } catch (error) {
      console.error('[SyncService] Error fetching liabilities master:', error);
      return null;
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

    if (!this.auth.signedIn()) {
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
    if (!this.auth.signedIn()) {
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
