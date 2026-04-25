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
  IonFab,
  IonFabButton,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  AlertController,
  ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { refreshOutline, addOutline, createOutline, trashOutline } from 'ionicons/icons';

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
    IonIcon,
    IonFab,
    IonFabButton,
    IonItemSliding,
    IonItemOptions,
    IonItemOption
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
      @if (selectedSegment === 'expense') {
        <ion-list>
          @for (category of expenseCategories(); track category) {
            <ion-item-sliding>
              <ion-item>
                <ion-chip color="danger" outline="true">
                  {{ category }}
                </ion-chip>
              </ion-item>
              <ion-item-options side="end">
                <ion-item-option color="primary" (click)="editCategory('expense', category)">
                  <ion-icon slot="icon-only" name="create-outline"></ion-icon>
                </ion-item-option>
                <ion-item-option color="danger" (click)="deleteCategory('expense', category)">
                  <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
                </ion-item-option>
              </ion-item-options>
            </ion-item-sliding>
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

      @if (selectedSegment === 'income') {
        <ion-list>
          @for (category of incomeCategories(); track category) {
            <ion-item-sliding>
              <ion-item>
                <ion-chip color="success" outline="true">
                  {{ category }}
                </ion-chip>
              </ion-item>
              <ion-item-options side="end">
                <ion-item-option color="primary" (click)="editCategory('income', category)">
                  <ion-icon slot="icon-only" name="create-outline"></ion-icon>
                </ion-item-option>
                <ion-item-option color="danger" (click)="deleteCategory('income', category)">
                  <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
                </ion-item-option>
              </ion-item-options>
            </ion-item-sliding>
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

      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button (click)="addCategory()">
          <ion-icon name="add-outline"></ion-icon>
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
  styles: [`
    ion-segment { margin: 0; }

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

    ion-list { background: transparent; }
  `]
})
export class CategoriesPage {
  private storage = inject(TransactionStorageService);
  private syncService = inject(SyncService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  expenseCategories = this.storage.expenseCategories;
  incomeCategories = this.storage.incomeCategories;

  selectedSegment: 'expense' | 'income' = 'expense';

  constructor() {
    addIcons({ refreshOutline, addOutline, createOutline, trashOutline });
  }

  async refreshCategories() {
    const categories = await this.syncService.fetchCategories();
    if (categories) {
      await this.showToast(`Categories refreshed! Expense: ${categories.expense?.length || 0}, Income: ${categories.income?.length || 0}`, 'success');
    } else {
      await this.showToast('Failed to refresh categories', 'danger');
    }
  }

  async addCategory() {
    const alert = await this.alertCtrl.create({
      header: `Add ${this.selectedSegment} category`,
      inputs: [
        { name: 'name', type: 'text', placeholder: 'Category name' }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Add',
          handler: async (data) => {
            const name = data.name?.trim();
            if (!name) return false;

            const result = await this.syncService.addCategory(this.selectedSegment, name);
            if (result.success) {
              await this.showToast(`"${name}" added`, 'success');
            } else {
              await this.showToast(result.error || 'Failed to add', 'danger');
            }
            return true;
          }
        }
      ]
    });
    await alert.present();
  }

  async editCategory(type: 'expense' | 'income', oldName: string) {
    const alert = await this.alertCtrl.create({
      header: 'Rename category',
      message: `This will rename "${oldName}" in all monthly sheets and transactions.`,
      inputs: [
        { name: 'newName', type: 'text', value: oldName, placeholder: 'New name' }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Rename',
          handler: async (data) => {
            const newName = data.newName?.trim();
            if (!newName || newName === oldName) return false;

            const result = await this.syncService.editCategory(type, oldName, newName);
            if (result.success) {
              await this.showToast(`Renamed to "${newName}"`, 'success');
            } else {
              await this.showToast(result.error || 'Failed to rename', 'danger');
            }
            return true;
          }
        }
      ]
    });
    await alert.present();
  }

  async deleteCategory(type: 'expense' | 'income', name: string) {
    const alert = await this.alertCtrl.create({
      header: 'Delete category',
      message: `Type "${name}" to confirm. This removes it from the dropdown only — existing data is preserved.`,
      inputs: [
        { name: 'confirm', type: 'text', placeholder: `Type "${name}" to confirm` }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          cssClass: 'danger',
          handler: async (data) => {
            if (data.confirm?.trim() !== name) {
              await this.showToast('Name does not match. Deletion cancelled.', 'warning');
              return false;
            }

            const result = await this.syncService.deleteCategory(type, name);
            if (result.success) {
              await this.showToast(`"${name}" removed from dropdown`, 'success');
            } else {
              await this.showToast(result.error || 'Failed to delete', 'danger');
            }
            return true;
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
