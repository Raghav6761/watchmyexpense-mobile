import { Injectable, inject, NgZone, OnDestroy } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { SmsParserService } from './sms-parser.service';
import { ParsedSms } from '../models/transaction.model';

export interface TransactionUpdate {
  transactionId: string;
  amount: number;
  description: string;
  source: string;
  withCategory: boolean;
  category?: string;
}

export interface PendingSms {
  sender: string;
  body: string;
  timestamp: number;
}

// Define the plugin interface
export interface PendingTransaction {
  transactionId: string;
  amount: number;
  type: string;
  source: string;
  rawMessage: string;
  timestamp: number;
  dismissed?: boolean;
  dismissedAt?: number;
}

export interface SmsReceiverPlugin {
  requestPermissions(): Promise<{ granted: boolean }>;
  checkPermissions(): Promise<{ granted: boolean }>;
  checkOverlayPermission(): Promise<{ granted: boolean }>;
  requestOverlayPermission(): Promise<{ granted?: boolean; opened?: boolean }>;
  showOverlay(options: {
    transactionId: string;
    amount: number;
    merchant: string;
    type: string;
    source: string;
  }): Promise<void>;
  getPendingUpdates(): Promise<{ updates: TransactionUpdate[] }>;
  clearPendingUpdates(): Promise<void>;
  getPendingSms(): Promise<{ messages: PendingSms[] }>;
  clearPendingSms(): Promise<void>;
  setCategories(options: { expense: string[]; income: string[] }): Promise<void>;
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  // Monitoring service methods
  startMonitoring(): Promise<void>;
  stopMonitoring(): Promise<void>;
  isMonitoring(): Promise<{ monitoring: boolean }>;
  getPendingTransactions(): Promise<{ transactions: PendingTransaction[] }>;
  clearPendingTransactions(): Promise<void>;
  removePendingTransaction(options: { transactionId: string }): Promise<void>;
  addListener(
    eventName: 'smsReceived',
    listenerFunc: (data: { sender: string; body: string; timestamp: number }) => void
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: 'transactionUpdated',
    listenerFunc: (data: TransactionUpdate) => void
  ): Promise<{ remove: () => Promise<void> }>;
  removeAllListeners(): Promise<void>;
}

// Register the plugin
const SmsReceiver = registerPlugin<SmsReceiverPlugin>('SmsReceiver');

interface SmsQueueItem {
  sender: string;
  body: string;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class SmsListenerService implements OnDestroy {
  private smsParser = inject(SmsParserService);
  private ngZone = inject(NgZone);

  private isListening = false;
  private listenerHandle: { remove: () => Promise<void> } | null = null;
  private updateListenerHandle: { remove: () => Promise<void> } | null = null;

  // Rate limiting configuration
  private static readonly RATE_LIMIT_MS = 1500; // 1.5 seconds between processing
  private static readonly MAX_QUEUE_SIZE = 20;
  private smsQueue: SmsQueueItem[] = [];
  private isProcessingQueue = false;
  private lastProcessedTime = 0;
  private processingSubscription?: Subscription;

  // Observable for new transactions detected from SMS
  public transactionDetected$ = new Subject<ParsedSms>();

  // Observable for transaction updates from overlay
  public transactionUpdated$ = new Subject<TransactionUpdate>();

  constructor() {
    this.setupUpdateListener();
  }

  ngOnDestroy() {
    this.processingSubscription?.unsubscribe();
  }

  private async setupUpdateListener() {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return;
    }

    try {
      this.updateListenerHandle = await SmsReceiver.addListener('transactionUpdated', (data) => {
        this.ngZone.run(() => {
          console.log('Transaction update from overlay:', data);
          this.transactionUpdated$.next(data);
        });
      });
      console.log('Transaction update listener registered');
    } catch (error) {
      console.error('Failed to setup update listener:', error);
    }
  }

  /**
   * Request SMS permissions
   */
  async requestPermissions(): Promise<boolean> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      console.log('SMS permissions only needed on Android');
      return false;
    }

    try {
      const result = await SmsReceiver.requestPermissions();
      console.log('SMS permission result:', result);
      return result.granted;
    } catch (error) {
      console.error('Failed to request SMS permissions:', error);
      return false;
    }
  }

  /**
   * Check if SMS permissions are granted
   */
  async checkPermissions(): Promise<boolean> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return false;
    }

    try {
      const result = await SmsReceiver.checkPermissions();
      return result.granted;
    } catch (error) {
      console.error('Failed to check SMS permissions:', error);
      return false;
    }
  }

  /**
   * Start listening for incoming SMS messages (Android only)
   */
  async startListening(): Promise<boolean> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      console.log('SMS listening is only available on Android');
      return false;
    }

    if (this.isListening) {
      console.log('Already listening for SMS');
      return true;
    }

    try {
      // Check permissions first
      const hasPermission = await this.checkPermissions();
      if (!hasPermission) {
        console.log('SMS permission not granted, requesting...');
        const granted = await this.requestPermissions();
        if (!granted) {
          console.error('SMS permission denied');
          return false;
        }
      }

      // Set up the listener with rate-limited queue
      this.listenerHandle = await SmsReceiver.addListener('smsReceived', (data) => {
        this.ngZone.run(() => {
          this.queueSms(data.sender, data.body, data.timestamp);
        });
      });

      // Start listening
      await SmsReceiver.startListening();
      this.isListening = true;
      console.log('SMS listener started successfully');
      return true;
    } catch (error) {
      console.error('Failed to start SMS listener:', error);
      return false;
    }
  }

  /**
   * Stop listening for SMS messages
   */
  async stopListening(): Promise<void> {
    if (!this.isListening) return;

    try {
      await SmsReceiver.stopListening();
      if (this.listenerHandle) {
        await this.listenerHandle.remove();
        this.listenerHandle = null;
      }
      this.isListening = false;
      console.log('SMS listener stopped');
    } catch (error) {
      console.error('Failed to stop SMS listener:', error);
    }
  }

  /**
   * Queue SMS for rate-limited processing
   */
  private queueSms(sender: string, body: string, timestamp: number): void {
    // Check queue size to prevent memory issues
    if (this.smsQueue.length >= SmsListenerService.MAX_QUEUE_SIZE) {
      console.warn('[SmsQueue] Queue full, dropping oldest SMS');
      this.smsQueue.shift();
    }

    this.smsQueue.push({ sender, body, timestamp });
    console.log('[SmsQueue] SMS queued. Queue size:', this.smsQueue.length);

    // Start processing if not already running
    if (!this.isProcessingQueue) {
      this.processNextSms();
    }
  }

  /**
   * Process the next SMS in queue with rate limiting
   */
  private processNextSms(): void {
    if (this.smsQueue.length === 0) {
      this.isProcessingQueue = false;
      console.log('[SmsQueue] Queue empty, stopping processor');
      return;
    }

    this.isProcessingQueue = true;

    // Calculate delay based on last processed time
    const now = Date.now();
    const timeSinceLast = now - this.lastProcessedTime;
    const delay = Math.max(0, SmsListenerService.RATE_LIMIT_MS - timeSinceLast);

    setTimeout(() => {
      const item = this.smsQueue.shift();
      this.lastProcessedTime = Date.now();

      if (item) {
        this.processSmsItem(item);
      }

      // Process next item
      this.processNextSms();
    }, delay);
  }

  /**
   * Process a single SMS item
   */
  private processSmsItem(item: SmsQueueItem): void {
    try {
      console.log('[SmsQueue] Processing SMS from:', item.sender);

      // Check if it's from a bank we monitor
      if (!this.smsParser.isBankSms(item.sender)) {
        console.log('[SmsQueue] Not a bank SMS, ignoring');
        return;
      }

      // Try to parse the SMS
      const parsed = this.smsParser.parseSms(item.sender, item.body);

      if (parsed) {
        console.log('[SmsQueue] Transaction detected:', parsed);
        this.transactionDetected$.next(parsed);
      } else {
        console.log('[SmsQueue] Could not parse bank SMS');
      }
    } catch (error) {
      console.error('[SmsQueue] Error processing SMS:', error);
    }
  }

  /**
   * Handle incoming SMS and check if it's a bank transaction (direct, no queue)
   */
  private handleIncomingSms(sender: string, body: string): void {
    console.log('SMS received from:', sender);

    // Check if it's from a bank we monitor
    if (!this.smsParser.isBankSms(sender)) {
      console.log('Not a bank SMS, ignoring');
      return;
    }

    // Try to parse the SMS
    const parsed = this.smsParser.parseSms(sender, body);

    if (parsed) {
      console.log('Transaction detected:', parsed);
      this.transactionDetected$.next(parsed);
    } else {
      console.log('Could not parse bank SMS');
    }
  }

  /**
   * Simulate receiving an SMS (for testing in browser/development)
   */
  simulateSms(sender: string, message: string): void {
    console.log('Simulating SMS from:', sender);

    if (!this.smsParser.isBankSms(sender)) {
      console.log('Not a bank SMS, ignoring');
      return;
    }

    const parsed = this.smsParser.parseSms(sender, message);

    if (parsed) {
      console.log('Transaction detected:', parsed);
      this.transactionDetected$.next(parsed);
    } else {
      console.log('Could not parse bank SMS');
    }
  }

  /**
   * Check if currently listening
   */
  get listening(): boolean {
    return this.isListening;
  }

  /**
   * Check if overlay permission is granted
   */
  async checkOverlayPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return false;
    }

    try {
      const result = await SmsReceiver.checkOverlayPermission();
      return result.granted;
    } catch (error) {
      console.error('Failed to check overlay permission:', error);
      return false;
    }
  }

  /**
   * Request overlay permission (opens system settings)
   */
  async requestOverlayPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return false;
    }

    try {
      const result = await SmsReceiver.requestOverlayPermission();
      if (result.granted) {
        return true;
      }
      // If opened settings, return false - user needs to grant manually
      return false;
    } catch (error) {
      console.error('Failed to request overlay permission:', error);
      return false;
    }
  }

  /**
   * Show overlay for a transaction (when app is in background)
   */
  async showOverlay(transactionId: string, parsed: ParsedSms): Promise<boolean> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return false;
    }

    try {
      const hasPermission = await this.checkOverlayPermission();
      if (!hasPermission) {
        console.log('Overlay permission not granted');
        return false;
      }

      await SmsReceiver.showOverlay({
        transactionId,
        amount: parsed.amount,
        merchant: parsed.merchant,
        type: parsed.type,
        source: parsed.source
      });
      return true;
    } catch (error) {
      console.error('Failed to show overlay:', error);
      return false;
    }
  }

  /**
   * Get pending updates saved from overlay (for when app was in background)
   */
  async getPendingUpdates(): Promise<TransactionUpdate[]> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return [];
    }

    try {
      const result = await SmsReceiver.getPendingUpdates();
      return result.updates || [];
    } catch (error) {
      console.error('Failed to get pending updates:', error);
      return [];
    }
  }

  /**
   * Clear pending updates after processing
   */
  async clearPendingUpdates(): Promise<void> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return;
    }

    try {
      await SmsReceiver.clearPendingUpdates();
    } catch (error) {
      console.error('Failed to clear pending updates:', error);
    }
  }

  /**
   * Set categories for the native overlay
   */
  async setCategories(expense: string[], income: string[]): Promise<void> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return;
    }

    try {
      await SmsReceiver.setCategories({ expense, income });
      console.log('Categories sent to native overlay:', { expense: expense.length, income: income.length });
    } catch (error) {
      console.error('Failed to set categories on native:', error);
    }
  }

  /**
   * Get pending SMS that were received while app was killed
   */
  async getPendingSms(): Promise<PendingSms[]> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return [];
    }

    try {
      const result = await SmsReceiver.getPendingSms();
      console.log('[PendingSms] Retrieved:', result.messages?.length || 0, 'messages');
      return result.messages || [];
    } catch (error) {
      console.error('Failed to get pending SMS:', error);
      return [];
    }
  }

  /**
   * Clear pending SMS after processing
   */
  async clearPendingSms(): Promise<void> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return;
    }

    try {
      await SmsReceiver.clearPendingSms();
      console.log('[PendingSms] Cleared pending SMS');
    } catch (error) {
      console.error('Failed to clear pending SMS:', error);
    }
  }

  /**
   * Process any pending SMS that arrived while app was killed
   * Returns array of ParsedSms for each successfully parsed message
   */
  async processPendingSms(): Promise<ParsedSms[]> {
    const pendingSms = await this.getPendingSms();
    if (pendingSms.length === 0) {
      return [];
    }

    console.log('[PendingSms] Processing', pendingSms.length, 'pending SMS');
    const parsed: ParsedSms[] = [];

    for (const sms of pendingSms) {
      if (this.smsParser.isBankSms(sms.sender)) {
        const result = this.smsParser.parseSms(sms.sender, sms.body);
        if (result) {
          console.log('[PendingSms] Parsed SMS:', result);
          parsed.push(result);
        } else {
          console.log('[PendingSms] Could not parse SMS from:', sms.sender);
        }
      } else {
        console.log('[PendingSms] Not a bank SMS from:', sms.sender);
      }
    }

    // Clear processed SMS
    await this.clearPendingSms();

    return parsed;
  }

  // ========== MONITORING SERVICE METHODS ==========

  /**
   * Start the background monitoring service.
   * This shows a persistent notification and keeps the app alive for reliable SMS detection.
   */
  async startMonitoring(): Promise<boolean> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      console.log('Monitoring only available on Android');
      return false;
    }

    try {
      await SmsReceiver.startMonitoring();
      console.log('[Monitoring] Background monitoring service started');
      return true;
    } catch (error) {
      console.error('[Monitoring] Failed to start monitoring:', error);
      return false;
    }
  }

  /**
   * Stop the background monitoring service
   */
  async stopMonitoring(): Promise<void> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return;
    }

    try {
      await SmsReceiver.stopMonitoring();
      console.log('[Monitoring] Background monitoring service stopped');
    } catch (error) {
      console.error('[Monitoring] Failed to stop monitoring:', error);
    }
  }

  /**
   * Check if the monitoring service is currently running
   */
  async isMonitoring(): Promise<boolean> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return false;
    }

    try {
      const result = await SmsReceiver.isMonitoring();
      return result.monitoring;
    } catch (error) {
      console.error('[Monitoring] Failed to check monitoring status:', error);
      return false;
    }
  }

  /**
   * Get pending transactions that were detected while app was killed.
   * These are transactions parsed natively and stored for later sync.
   */
  async getPendingTransactions(): Promise<PendingTransaction[]> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return [];
    }

    try {
      const result = await SmsReceiver.getPendingTransactions();
      const transactions = result.transactions || [];
      console.log('[Monitoring] Retrieved', transactions.length, 'pending transactions');
      return transactions;
    } catch (error) {
      console.error('[Monitoring] Failed to get pending transactions:', error);
      return [];
    }
  }

  /**
   * Clear all pending transactions after they've been synced
   */
  async clearPendingTransactions(): Promise<void> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return;
    }

    try {
      await SmsReceiver.clearPendingTransactions();
      console.log('[Monitoring] Cleared pending transactions');
    } catch (error) {
      console.error('[Monitoring] Failed to clear pending transactions:', error);
    }
  }

  /**
   * Remove a specific pending transaction (after it's been categorized)
   */
  async removePendingTransaction(transactionId: string): Promise<void> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return;
    }

    try {
      await SmsReceiver.removePendingTransaction({ transactionId });
      console.log('[Monitoring] Removed pending transaction:', transactionId);
    } catch (error) {
      console.error('[Monitoring] Failed to remove pending transaction:', error);
    }
  }

  /**
   * Initialize monitoring on app startup.
   * Call this when the app starts to ensure monitoring is active.
   */
  async initializeMonitoring(): Promise<void> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return;
    }

    // Check if already monitoring
    const isActive = await this.isMonitoring();
    if (!isActive) {
      // Start monitoring if permissions are granted
      const hasPermission = await this.checkPermissions();
      if (hasPermission) {
        await this.startMonitoring();
      }
    }

    // Also start the listener for when app is in foreground
    await this.startListening();
  }
}
