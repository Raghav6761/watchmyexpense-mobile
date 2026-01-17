export type TransactionType = 'expense' | 'income';
export type TransactionStatus = 'pending' | 'ready' | 'synced' | 'error';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  date: Date;
  merchant: string;
  description: string;
  category: string;
  source: string; // SBI, HDFC CC, Axis CC, etc.
  status: TransactionStatus;
  rawSms?: string;
  errorMessage?: string;
  syncedAt?: Date;
  createdAt: Date;
}

export interface ParsedSms {
  type: TransactionType;
  amount: number;
  date: Date;
  merchant: string;
  source: string;
  rawMessage: string;
}

export interface Categories {
  expense: string[];
  income: string[];
}

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Food',
  'Transport',
  'Shopping',
  'Bills & Utilities',
  'Entertainment',
  'Health',
  'Education',
  'Monthly Subs',
  'Credit Card Payment',
  'Other'
];

export const DEFAULT_INCOME_CATEGORIES = [
  'Paycheck',
  'Freelance',
  'Second source(s)',
  'Credit Card',
  'Loan Return',
  'Refund',
  'Other'
];

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Food': ['swiggy', 'zomato', 'restaurant', 'cafe', 'food', 'pizza', 'burger', 'dominos', 'mcd', 'kfc'],
  'Transport': ['uber', 'ola', 'rapido', 'petrol', 'diesel', 'fuel', 'metro', 'irctc', 'redbus'],
  'Shopping': ['amazon', 'flipkart', 'myntra', 'ajio', 'mall', 'store', 'mart', 'reliance', 'dmart'],
  'Bills & Utilities': ['electricity', 'water', 'gas', 'broadband', 'jio', 'airtel', 'vi', 'bsnl', 'tata'],
  'Entertainment': ['netflix', 'prime', 'hotstar', 'spotify', 'movie', 'pvr', 'inox', 'bookmyshow'],
  'Health': ['pharmacy', 'medical', 'hospital', 'doctor', 'apollo', 'medplus', '1mg', 'pharmeasy'],
  'Monthly Subs': ['linkedin', 'digital ocean', 'subscription', 'premium', 'adobe', 'github'],
  'Credit Card Payment': ['credit card', 'card payment', 'hdfc card', 'axis card', 'sbi card', 'cred']
};
