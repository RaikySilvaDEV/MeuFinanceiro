import type { Data } from './types'
import { isMealAllowanceExpense } from './finance'

export type PlanningSummary = {
  plannedIncome: number
  fixed: number
  spent: number
  pending: number
  reserved: number
  savingsTarget: number
  mealAllowance: number
  mealAllowanceSpent: number
  mealAllowanceAvailable: number
  projectedAvailable: number
}

const now = new Date()
const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

export const isCurrentMonth = (date: string) => date.slice(0, 7) === currentMonth

export function getPlanningSummary(data: Data): PlanningSummary {
  const currentTransactions = data.transactions.filter(transaction => isCurrentMonth(transaction.date))
  const income = currentTransactions.filter(transaction => transaction.kind === 'income' && transaction.status === 'paid' && !transaction.transferId).reduce((total, transaction) => total + transaction.amount, 0)
  const spent = currentTransactions.filter(transaction => transaction.kind === 'expense' && transaction.status === 'paid' && !transaction.transferId).reduce((total, transaction) => total + transaction.amount, 0)
  const pending = currentTransactions.filter(transaction => transaction.kind === 'expense' && transaction.status === 'pending' && !isMealAllowanceExpense(transaction)).reduce((total, transaction) => total + transaction.amount, 0)
  const fixed = data.fixed.filter(item => item.active).reduce((total, item) => total + item.amount, 0)
  const cashFixed = data.fixed.filter(item => item.active && item.method !== 'Vale alimentação').reduce((total, item) => total + item.amount, 0)
  const reserved = data.goals.reduce((total, goal) => total + goal.current, 0)
  const savingsTarget = data.netSalary * (data.savings / 100)
  const mealAllowanceSpent = currentTransactions.filter(transaction => transaction.kind === 'expense' && transaction.status === 'paid' && transaction.method === 'Vale alimentação').reduce((total, transaction) => total + transaction.amount, 0)
  const plannedIncome = data.netSalary + income
  const cashSpent = currentTransactions.filter(transaction => transaction.kind === 'expense' && transaction.status === 'paid' && !transaction.transferId && !isMealAllowanceExpense(transaction)).reduce((total, transaction) => total + transaction.amount, 0)

  return {
    plannedIncome,
    fixed,
    spent,
    pending,
    reserved,
    savingsTarget,
    mealAllowance: data.mealAllowance,
    mealAllowanceSpent,
    mealAllowanceAvailable: data.mealAllowance - mealAllowanceSpent,
    projectedAvailable: plannedIncome - cashFixed - cashSpent - pending - savingsTarget,
  }
}
