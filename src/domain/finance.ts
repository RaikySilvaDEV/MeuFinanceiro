import type { Data, Transaction } from './types'

export const refSalary = 1729.64
export const incomeCategories = ['Salário', 'Freelance', 'Venda', 'Pix recebido', 'Transferência', 'Outros']
export const expenseCategories = ['Alimentação', 'Mercado', 'Moradia', 'Gasolina', 'Transporte', 'Contas', 'Saúde', 'Lazer', 'Compras', 'Casa', 'Educação', 'Assinaturas', 'Metas', 'Outros']
export const categoriesFor = (data: Pick<Data, 'customCategories'>, kind: 'income' | 'expense') => {
  const defaults = kind === 'income' ? incomeCategories : expenseCategories
  const custom = data.customCategories[kind]
  const hidden = kind === 'income' ? data.customCategories.hiddenIncome : data.customCategories.hiddenExpense
  return [...defaults.filter(item => !hidden.includes(item)), ...custom]
}
export const paymentMethods = ['Pix', 'Débito', 'Crédito', 'Dinheiro', 'Transferência', 'Vale alimentação']
export const isMealAllowanceExpense = (transaction: Transaction) => transaction.kind === 'expense' && transaction.method === 'Vale alimentação'
export const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)
export const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const formatMoneyInput = (value: string | number) => {
  if (typeof value === 'number') return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const text = String(value).replace(/[^\d,.-]/g, '').replace(/\./g, (match, _offset, source) => source.includes(',') ? '' : match)
  const [integerPart = '', decimalPart] = text.replace('-', '').split(',')
  const integer = (integerPart || '0').replace(/\D/g, '').replace(/^0+(?=\d)/, '') || '0'
  const formattedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return decimalPart === undefined ? formattedInteger : `${formattedInteger},${decimalPart.replace(/\D/g, '').slice(0, 2)}`
}
export const today = () => new Date().toISOString().slice(0, 10)

export const parseMoney = (value: string) => {
  const compact = value.trim().replace(/\s/g, '')
  const normalized = compact.includes(',')
    ? compact.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(?:\.\d{3})+$/.test(compact)
      ? compact.replace(/\./g, '')
      : compact
  return Number(normalized)
}

export const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export const finiteNonNegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
export const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime()) && new Date(`${value}T12:00:00`).toISOString().slice(0, 10) === value

export const normalizeData = (value: unknown): Data => {
  const fallback = freshData()
  if (!value || typeof value !== 'object') return fallback
  const source = value as Partial<Data>
  return {
    netSalary: finiteNonNegative(source.netSalary) ? source.netSalary : 0,
    mealAllowance: finiteNonNegative(source.mealAllowance) ? source.mealAllowance : 0,
    savings: finiteNonNegative(source.savings) && source.savings <= 100 ? source.savings : 0,
    customCategories: source.customCategories && Array.isArray(source.customCategories.income) && Array.isArray(source.customCategories.expense)
      ? { income: source.customCategories.income.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()), expense: source.customCategories.expense.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()), hiddenIncome: Array.isArray(source.customCategories.hiddenIncome) ? source.customCategories.hiddenIncome.filter(item => typeof item === 'string') : [], hiddenExpense: Array.isArray(source.customCategories.hiddenExpense) ? source.customCategories.hiddenExpense.filter(item => typeof item === 'string') : [] }
      : { income: [], expense: [], hiddenIncome: [], hiddenExpense: [] },
    accounts: Array.isArray(source.accounts) ? source.accounts.filter(a => a && typeof a.id === 'string' && typeof a.name === 'string' && finiteNonNegative(a.balance)) : fallback.accounts,
    transactions: Array.isArray(source.transactions) ? source.transactions.filter(t => t && typeof t.id === 'string' && (t.kind === 'income' || t.kind === 'expense') && finiteNonNegative(t.amount) && typeof t.description === 'string' && validDate(t.date) && (t.status === 'paid' || t.status === 'pending')) : [],
    fixed: Array.isArray(source.fixed) ? source.fixed.filter(f => f && typeof f.id === 'string' && typeof f.name === 'string' && finiteNonNegative(f.amount) && Number.isInteger(f.due) && f.due >= 1 && f.due <= 31) : [],
    recurring: Array.isArray(source.recurring) ? source.recurring.filter(item => item && typeof item.id === 'string' && (item.kind === 'income' || item.kind === 'expense') && finiteNonNegative(item.amount) && item.amount > 0 && typeof item.description === 'string' && Number.isInteger(item.day) && item.day >= 1 && item.day <= 31 && (item.status === 'paid' || item.status === 'pending') && typeof item.active === 'boolean') : [],
    goals: Array.isArray(source.goals) ? source.goals : fallback.goals,
    budgets: Array.isArray(source.budgets) ? source.budgets.filter(b => b && typeof b.id === 'string' && typeof b.category === 'string' && finiteNonNegative(b.limit)) : [],
    cards: Array.isArray(source.cards) ? source.cards : [],
    installments: Array.isArray(source.installments) ? source.installments : [],
  }
}

export function freshData(): Data {
  return { netSalary: 0, mealAllowance: 0, savings: 0, customCategories: { income: [], expense: [], hiddenIncome: [], hiddenExpense: [] }, accounts: [{ id: uid(), name: 'Conta principal', type: 'Conta corrente', balance: 0, active: true }], transactions: [], fixed: [], recurring: [], goals: [], budgets: [], cards: [], installments: [] }
}

export function storageKey(id: string) {
  return `meu-financeiro-data-${id}`
}
