import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonList,
  IonItem,
  IonChip,
  IonButton,
  IonIcon,
  ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { refreshOutline } from 'ionicons/icons';

import { TransactionStorageService } from '../../services/transaction-storage.service';
import { SyncService } from '../../services/sync.service';

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonBackButton,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonList,
    IonItem,
    IonChip,
    IonButton,
    IonIcon
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/settings"></ion-back-button>
        </ion-buttons>
        <ion-title>Categories</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="refreshCategories()">
            <ion-icon slot="icon-only" name="refresh-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>

      <ion-toolbar>
        <ion-segment [(ngModel)]="selectedSegment" value="expense">
          <ion-segment-button value="expense">
            <ion-label>Expense ({{ expenseCategories().length }})</ion-label>
          </ion-segment-button>
          <ion-segment-button value="income">
            <ion-label>Income ({{ incomeCategories().length }})</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content [fullscreen]="true">
      <!-- Expense Categories (shown when selectedSegment === 'expense') -->
      @if (selectedSegment === 'expense') {
        <ion-list>
          @for (category of expenseCategories(); track category) {
            <ion-item>
              <ion-chip color="danger" outline="true">
                {{ category }}
              </ion-chip>
            </ion-item>
          }

          @if (expenseCategories().length === 0) {
            <ion-item>
              <ion-label class="ion-text-center">
                <p>No expense categories available</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }

      <!-- Income Categories (shown when selectedSegment === 'income') -->
      @if (selectedSegment === 'income') {
        <ion-list>
          @for (category of incomeCategories(); track category) {
            <ion-item>
              <ion-chip color="success" outline="true">
                {{ category }}
              </ion-chip>
            </ion-item>
          }

          @if (incomeCategories().length === 0) {
            <ion-item>
              <ion-label class="ion-text-center">
                <p>No income categories available</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
  styles: [`
    ion-segment {
      margin: 0;
    }

    ion-content {
      --padding-top: 16px;
      --padding-start: 8px;
      --padding-end: 8px;
    }

    ion-item {
      --padding-start: 8px;
      --inner-padding-end: 8px;
    }

    ion-chip {
      margin: 0;
      font-size: 14px;
      font-weight: 500;
    }

    ion-list {
      background: transparent;
    }
  `]
})
export class CategoriesPage {
  private storage = inject(TransactionStorageService);
  private syncService = inject(SyncService);
  private toastCtrl = inject(ToastController);

  expenseCategories = this.storage.expenseCategories;
  incomeCategories = this.storage.incomeCategories;

  selectedSegment: 'expense' | 'income' = 'expense';

  constructor() {
    addIcons({
      refreshOutline
    });
  }

  async refreshCategories() {
    const categories = await this.syncService.fetchCategories();

    if (categories) {
      const expenseCount = categories.expense?.length || 0;
      const incomeCount = categories.income?.length || 0;
      await this.showToast(`Categories refreshed! Expense: ${expenseCount}, Income: ${incomeCount}`, 'success');
    } else {
      await this.showToast('Failed to refresh categories', 'danger');
    }
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      color,
      position: 'bottom'
    });
    await toast.present();
  }
}
