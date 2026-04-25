import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/tabs/tabs.page').then(m => m.TabsPage),
    children: [
      {
        path: 'home',
        loadComponent: () => import('./pages/home/home.page').then(m => m.HomePage),
      },
      {
        path: 'analytics',
        loadComponent: () => import('./pages/analytics/analytics.page').then(m => m.AnalyticsPage),
      },
      {
        path: 'settings',
        loadComponent: () => import('./pages/settings/settings.page').then(m => m.SettingsPage),
      },
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full',
      }
    ]
  },
  {
    path: 'categories',
    loadComponent: () => import('./pages/categories/categories.page').then(m => m.CategoriesPage),
  },
  {
    path: 'liabilities',
    loadComponent: () => import('./pages/liabilities/liabilities.page').then(m => m.LiabilitiesPage),
  },
  {
    path: 'category-detail',
    loadComponent: () => import('./pages/category-detail/category-detail.page').then(m => m.CategoryDetailPage),
  },
];
