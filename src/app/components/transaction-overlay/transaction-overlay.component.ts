import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonItem,
  IonLabel,
  IonInput,
  IonButton,
  IonIcon,
  IonChip,
  IonSearchbar,
  ModalController,
  AlertController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, checkmarkOutline, timeOutline, walletOutline, calendarOutline, storefrontOutline, cardOutline, searchOutline } from 'ionicons/icons';

import { Transaction } from '../../models/transaction.model';
import { TransactionStorageService } from '../../services/transaction-storage.service';
import { SmsParserService } from '../../services/sms-parser.service';
import { SyncService } from '../../services/sync.service';

@Component({
  selector: 'app-transaction-overlay',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonItem,
    IonLabel,
    IonInput,
    IonButton,
    IonIcon,
    IonChip,
    IonSearchbar
  ],
  template: `
    <div class="sheet-handle"></div>

    <ion-content class="ion-padding">
      <!-- Header with type indicator and close -->
      <div class="sheet-header">
        <span class="sheet-title" [class]="transaction.type">
          {{ transaction.type === 'expense' ? 'Expense' : 'Income' }}
        </span>
        <ion-button fill="clear" size="small" (click)="dismiss()">
          <ion-icon slot="icon-only" name="close-outline"></ion-icon>
        </ion-button>
      </div>

      <!-- Amount (Editable) -->
      <div class="amount-section">
        <span class="currency-symbol" [class]="transaction.type">₹</span>
        <ion-input
          type="number"
          [(ngModel)]="amount"
          class="amount-input"
          [class]="transaction.type"
          inputmode="decimal"
        ></ion-input>
      </div>

      <!-- Date (Read-only) & Source (Editable) -->
      <div class="date-source-row">
        <div class="date-display">
          <ion-icon name="calendar-outline"></ion-icon>
          <span>{{ formatDate(transaction.date) }}</span>
        </div>
        <div class="source-input-wrapper">
          <ion-icon name="card-outline"></ion-icon>
          <input
            type="text"
            [(ngModel)]="source"
            class="source-input"
            placeholder="Source"
          />
        </div>
      </div>

      <!-- Description (Editable) -->
      <ion-item lines="none" class="description-item">
        <ion-input
          label="Description"
          labelPlacement="stacked"
          [(ngModel)]="description"
          placeholder="Enter description"
          [clearInput]="true"
        ></ion-input>
      </ion-item>

      <!-- Category Selection -->
      <div class="category-section">
        <ion-label class="section-label">Category</ion-label>

        <!-- Search bar for categories -->
        <ion-searchbar
          [(ngModel)]="categorySearch"
          placeholder="Search categories..."
          [debounce]="150"
          class="category-search"
        ></ion-searchbar>

        <!-- Horizontal scrollable categories -->
        <div class="chips-scroll-container">
          <div class="chips-container">
            @for (cat of filteredCategories(); track cat) {
              <ion-chip
                [color]="selectedCategory === cat ? 'primary' : 'medium'"
                [outline]="selectedCategory !== cat"
                (click)="selectCategory(cat)"
              >
                {{ cat }}
              </ion-chip>
            }
            @if (filteredCategories().length === 0) {
              <span class="no-results">No matching categories</span>
            }
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="action-buttons">
        <ion-button expand="block" fill="outline" color="medium" (click)="saveLater()">
          Later
        </ion-button>

        <ion-button
          expand="block"
          [disabled]="!selectedCategory || amount <= 0"
          (click)="saveAndSync()"
        >
          <ion-icon name="checkmark-outline" slot="start"></ion-icon>
          Save
        </ion-button>
      </div>
    </ion-content>
  `,
  styles: [`
    .sheet-handle {
      width: 36px;
      height: 4px;
      background: var(--ion-color-medium);
      border-radius: 2px;
      margin: 8px auto 0;
      opacity: 0.5;
    }

    .sheet-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0 16px;
    }

    .sheet-title {
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;

      &.expense {
        color: var(--ion-color-danger);
      }

      &.income {
        color: var(--ion-color-success);
      }
    }

    .amount-section {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px 0 16px;
    }

    .currency-symbol {
      font-size: 32px;
      font-weight: 700;
      margin-right: 4px;

      &.expense {
        color: var(--ion-color-danger);
      }

      &.income {
        color: var(--ion-color-success);
      }
    }

    .amount-input {
      --padding-start: 0;
      --padding-end: 0;
      font-size: 32px;
      font-weight: 700;
      max-width: 200px;
      text-align: center;

      &.expense {
        color: var(--ion-color-danger);
      }

      &.income {
        color: var(--ion-color-success);
      }
    }

    .date-source-row {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 16px;
      padding: 8px 0 16px;
    }

    .date-display {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--ion-color-medium);
      font-size: 14px;

      ion-icon {
        font-size: 16px;
      }
    }

    .source-input-wrapper {
      display: flex;
      align-items: center;
      gap: 6px;
      background: var(--ion-color-light);
      padding: 4px 10px;
      border-radius: 12px;

      ion-icon {
        font-size: 14px;
        color: var(--ion-color-medium);
      }

      .source-input {
        border: none;
        background: transparent;
        font-size: 12px;
        width: 80px;
        color: var(--ion-text-color);
        outline: none;
      }
    }

    .description-item {
      --background: var(--ion-color-light);
      --border-radius: 8px;
      margin-bottom: 16px;
    }

    .category-section {
      margin-bottom: 16px;

      .section-label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--ion-color-medium);
        margin-bottom: 8px;
      }

      .category-search {
        --background: var(--ion-color-light);
        --border-radius: 8px;
        --box-shadow: none;
        --padding-start: 8px;
        --padding-end: 8px;
        --height: 36px;
        margin-bottom: 12px;
        padding: 0;
      }

      .chips-scroll-container {
        overflow-x: auto;
        overflow-y: hidden;
        margin: 0 -16px;
        padding: 0 16px;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;

        &::-webkit-scrollbar {
          display: none;
        }
      }

      .chips-container {
        display: flex;
        flex-wrap: nowrap;
        gap: 8px;
        padding-bottom: 4px;

        ion-chip {
          flex-shrink: 0;
        }
      }

      .no-results {
        color: var(--ion-color-medium);
        font-size: 14px;
        padding: 8px;
      }
    }

    .action-buttons {
      display: flex;
      gap: 12px;
      padding-top: 8px;

      ion-button {
        flex: 1;
      }
    }
  `]
})
export class TransactionOverlayComponent implements OnInit {
  @Input() transaction!: Transaction;
  @Input() isEditing = false;

  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);
  private storage = inject(TransactionStorageService);
  private smsParser = inject(SmsParserService);
  public syncService = inject(SyncService);

  amount = 0;
  description = '';
  source = '';
  selectedCategory = '';
  categorySearch = '';

  // Computed categories based on transaction type
  currentCategories = computed(() => {
    const cats = this.storage.categories();
    return this.transaction?.type === 'expense' ? cats.expense : cats.income;
  });

  // Filtered categories based on search
  filteredCategories = computed(() => {
    const all = this.currentCategories();
    const search = this.categorySearch.toLowerCase().trim();

    if (!search) {
      // No search - show suggested first, then others
      const suggested = this.suggestedCategories();
      const others = all.filter(c => !suggested.includes(c));
      return [...suggested, ...others];
    }

    // Filter by search term
    return all.filter(cat => cat.toLowerCase().includes(search));
  });

  // Suggested categories based on merchant
  suggestedCategories = signal<string[]>([]);

  constructor() {
    addIcons({
      closeOutline,
      checkmarkOutline,
      timeOutline,
      walletOutline,
      calendarOutline,
      storefrontOutline,
      cardOutline,
      searchOutline
    });
  }

  ngOnInit() {
    // Initialize with existing values
    this.amount = this.transaction.amount;
    this.description = this.transaction.description || this.transaction.merchant;
    this.source = this.transaction.source || '';
    this.selectedCategory = this.transaction.category || '';

    // Generate suggested categories
    this.generateSuggestions();
  }

  private generateSuggestions() {
    const suggested: string[] = [];

    // Try to auto-suggest from merchant name
    const autoSuggested = this.smsParser.suggestCategory(this.transaction.merchant);
    if (autoSuggested) {
      suggested.push(autoSuggested);
    }

    // Add most common categories as quick options
    const commonCategories = this.transaction.type === 'expense'
      ? ['Food', 'Transport', 'Shopping', 'Bills & Utilities', 'Other']
      : ['Paycheck', 'Refund', 'Other'];

    for (const cat of commonCategories) {
      if (!suggested.includes(cat) && suggested.length < 5) {
        suggested.push(cat);
      }
    }

    this.suggestedCategories.set(suggested);
  }

  selectCategory(category: string) {
    this.selectedCategory = category;
  }

  async showAllCategories() {
    const alert = await this.alertCtrl.create({
      header: 'Select Category',
      inputs: this.currentCategories().map(cat => ({
        type: 'radio' as const,
        label: cat,
        value: cat,
        checked: this.selectedCategory === cat
      })),
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Select',
          handler: (value: string) => {
            if (value) {
              this.selectedCategory = value;
            }
          }
        }
      ]
    });
    await alert.present();
  }

  formatAmount(amount: number): string {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  formatDate(date: Date): string {
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  async dismiss() {
    await this.modalCtrl.dismiss(null, 'cancel');
  }

  async saveLater() {
    // Save without category - stays as pending
    await this.storage.updateTransaction(this.transaction.id, {
      amount: this.amount,
      description: this.description || this.transaction.merchant,
      source: this.source
    });

    await this.modalCtrl.dismiss({ saved: true, synced: false }, 'later');
  }

  async saveAndSync() {
    if (!this.selectedCategory || this.amount <= 0) return;

    // Update amount and source first
    await this.storage.updateTransaction(this.transaction.id, {
      amount: this.amount,
      source: this.source
    });

    // Mark as ready
    await this.storage.markReady(
      this.transaction.id,
      this.description || this.transaction.merchant,
      this.selectedCategory
    );

    // Try to sync immediately if online and authenticated
    let synced = false;
    if (this.syncService.isOnline() && this.syncService.isAuthenticated()) {
      const updatedTransaction = this.storage.getTransaction(this.transaction.id);
      if (updatedTransaction) {
        synced = await this.syncService.syncTransaction(updatedTransaction);
      }
    }

    await this.modalCtrl.dismiss({ saved: true, synced }, 'save');
  }
}
