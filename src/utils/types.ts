export type TransactionType = 'income' | 'expense';
export type TransactionStatus = 'paid' | 'pending' | 'received' | 'canceled';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  description: string;
  category: string;
  paymentMethod: string;
  account: string;
  date: string;
  status: TransactionStatus;
}

export interface FixedBill {
  id: string;
  name: string;
  amount: number;
  dueDate: number;
  category: string;
  status: 'paid' | 'pending';
  active: boolean;
}

export interface Goal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  priority: 'high' | 'medium' | 'low';
  category: string;
}

export interface BudgetLimit {
  category: string;
  limitAmount: number;
}