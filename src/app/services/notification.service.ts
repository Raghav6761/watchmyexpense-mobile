import { Injectable } from '@angular/core';
import { LocalNotifications, ScheduleOptions, ActionPerformed } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Subject } from 'rxjs';
import { ParsedSms } from '../models/transaction.model';

export interface NotificationAction {
  transactionId: string;
  category?: string;
  action: 'open' | 'category' | 'later';
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private hasPermission = false;
  private isAppInForeground = true;

  // Emit when user taps notification or action button
  public notificationAction$ = new Subject<NotificationAction>();

  constructor() {
    this.init();
  }

  private async init() {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    // Track app state
    App.addListener('appStateChange', ({ isActive }) => {
      this.isAppInForeground = isActive;
      console.log('App state changed:', isActive ? 'foreground' : 'background');
    });

    // Set up notification channel for Android
    await this.createChannel();

    // Register action types with buttons
    await this.registerActionTypes();

    // Listen for notification actions
    LocalNotifications.addListener('localNotificationActionPerformed', (performed: ActionPerformed) => {
      console.log('Notification action performed:', performed);
      this.handleNotificationAction(performed);
    });
  }

  private async createChannel() {
    try {
      await LocalNotifications.createChannel({
        id: 'transactions',
        name: 'Transaction Alerts',
        description: 'Notifications for new payment transactions',
        importance: 4, // HIGH
        visibility: 1, // PUBLIC
        vibration: true,
        sound: 'default'
      });
    } catch (error) {
      console.error('Failed to create notification channel:', error);
    }
  }

  private async registerActionTypes() {
    try {
      await LocalNotifications.registerActionTypes({
        types: [
          {
            id: 'EXPENSE_ACTIONS',
            actions: [
              { id: 'food', title: '🍔 Food' },
              { id: 'transport', title: '🚗 Transport' },
              { id: 'shopping', title: '🛒 Shopping' },
              { id: 'more', title: 'More...' }
            ]
          },
          {
            id: 'INCOME_ACTIONS',
            actions: [
              { id: 'salary', title: '💼 Salary' },
              { id: 'refund', title: '↩️ Refund' },
              { id: 'more', title: 'More...' }
            ]
          }
        ]
      });
      console.log('Notification action types registered');
    } catch (error) {
      console.error('Failed to register action types:', error);
    }
  }

  private handleNotificationAction(performed: ActionPerformed) {
    const { notification, actionId } = performed;
    const transactionId = notification.extra?.transactionId;

    if (!transactionId) {
      console.error('No transaction ID in notification');
      return;
    }

    if (actionId === 'tap' || !actionId) {
      // User tapped the notification body - open app
      this.notificationAction$.next({
        transactionId,
        action: 'open'
      });
    } else if (actionId === 'more') {
      // User wants more options - open app with modal
      this.notificationAction$.next({
        transactionId,
        action: 'open'
      });
    } else {
      // User selected a category
      const categoryMap: Record<string, string> = {
        'food': 'Food',
        'transport': 'Transport',
        'shopping': 'Shopping',
        'salary': 'Paycheck',
        'refund': 'Refund'
      };

      this.notificationAction$.next({
        transactionId,
        category: categoryMap[actionId] || actionId,
        action: 'category'
      });
    }
  }

  async requestPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return true;
    }

    try {
      const result = await LocalNotifications.requestPermissions();
      this.hasPermission = result.display === 'granted';
      return this.hasPermission;
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return false;
    }
  }

  async checkPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      return true;
    }

    try {
      const result = await LocalNotifications.checkPermissions();
      this.hasPermission = result.display === 'granted';
      return this.hasPermission;
    } catch (error) {
      console.error('Failed to check notification permission:', error);
      return false;
    }
  }

  /**
   * Check if app is currently in foreground
   */
  isInForeground(): boolean {
    return this.isAppInForeground;
  }

  async showTransactionNotification(parsed: ParsedSms, transactionId: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      console.log('Notification (web):', parsed);
      return;
    }

    // Don't show notification if app is in foreground - modal will show instead
    if (this.isAppInForeground) {
      console.log('App in foreground, skipping notification');
      return;
    }

    const hasPermission = await this.checkPermission();
    if (!hasPermission) {
      console.log('No notification permission');
      return;
    }

    const isExpense = parsed.type === 'expense';
    const sign = isExpense ? '-' : '+';
    const amount = `₹${parsed.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    // Use transaction ID hash as notification ID so overlay can dismiss it
    const notificationId = this.hashCode(transactionId);

    const options: ScheduleOptions = {
      notifications: [
        {
          id: notificationId,
          title: `${isExpense ? '💸 Expense' : '💰 Income'}: ${sign}${amount}`,
          body: `${parsed.merchant} • ${parsed.source}`,
          channelId: 'transactions',
          extra: {
            transactionId,
            type: parsed.type
          },
          actionTypeId: isExpense ? 'EXPENSE_ACTIONS' : 'INCOME_ACTIONS',
          smallIcon: 'ic_stat_notify',
          largeIcon: 'ic_launcher',
          ongoing: false,
          autoCancel: true
        }
      ]
    };

    try {
      await LocalNotifications.schedule(options);
      console.log('Transaction notification sent with action buttons');
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }

  async cancelNotification(id: number): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      await LocalNotifications.cancel({ notifications: [{ id }] });
    } catch (error) {
      console.error('Failed to cancel notification:', error);
    }
  }

  async cancelAllNotifications(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel(pending);
      }
    } catch (error) {
      console.error('Failed to cancel notifications:', error);
    }
  }

  /**
   * Cancel notification for a specific transaction
   */
  async cancelTransactionNotification(transactionId: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      const notificationId = this.hashCode(transactionId);
      await LocalNotifications.cancel({ notifications: [{ id: notificationId }] });
      console.log('Cancelled notification for transaction:', transactionId);
    } catch (error) {
      console.error('Failed to cancel transaction notification:', error);
    }
  }

  /**
   * Generate a consistent hash code from a string (same algorithm as Java's String.hashCode)
   */
  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    // Ensure positive number for notification ID
    return Math.abs(hash);
  }
}
