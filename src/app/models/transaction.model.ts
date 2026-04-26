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

/**
 * One row from the user's Liability master register (Summary tab A41:E60).
 * Used by the SMS parser to recognize which card/loan an SMS belongs to.
 *
 * sourceKeyword is comma-separated AND-tokens: "HDFC, 1525" means an SMS must
 * contain both "HDFC" and "1525" (case-insensitive substring) to match this card.
 */
export interface MasterLiability {
  name: string;
  creditLimit: number;
  interestRate: number;
  billingCycle: string;
  sourceKeyword: string;
}

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Food',
  'Gifts',
  'Health/medical',
  'Home/Rent',
  'Transportation',
  'Personal',
  'Bike Pay',
  'Utilities',
  'Travel',
  'Debt',
  'Other',
  'Loan To',
  'Mutual Funds',
  'Unexpected Expense',
  'Hosting and server',
  'EMI',
  'Monthly Subscription',
  'Company Compliances',
  'Investment',
  'Liability'
];

export const DEFAULT_INCOME_CATEGORIES = [
  'Second source(s)',
  'Paycheck',
  'Bonus',
  'Interest',
  'Other',
  'Loan Return',
  'Mutual Funds Interest',
  'Loan Taken',
  'Credit Card'
];

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Food': ['swiggy', 'zomato', 'restaurant', 'cafe', 'food', 'pizza', 'burger', 'dominos', 'mcd', 'kfc'],
  'Transportation': ['uber', 'ola', 'rapido', 'petrol', 'diesel', 'fuel', 'metro', 'irctc', 'redbus'],
  'Personal': ['amazon', 'flipkart', 'myntra', 'ajio', 'mall', 'store', 'mart', 'reliance', 'dmart'],
  'Utilities': ['electricity', 'water', 'gas', 'broadband', 'jio', 'airtel', 'vi', 'bsnl', 'tata'],
  'Monthly Subscription': ['netflix', 'prime', 'hotstar', 'spotify', 'linkedin', 'adobe', 'github', 'subscription', 'premium'],
  'Health/medical': ['pharmacy', 'medical', 'hospital', 'doctor', 'apollo', 'medplus', '1mg', 'pharmeasy'],
  'Bike Pay': ['petrol', 'bike', 'helmet', 'servicing'],
  'Home/Rent': ['rent', 'maintenance', 'society', 'housing'],
  'EMI': ['emi', 'instalment', 'installment'],
  'Hosting and server': ['digital ocean', 'aws', 'heroku', 'vercel', 'netlify', 'cloudflare']
};
