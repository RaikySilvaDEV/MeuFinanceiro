import { useState } from 'react'
import type { Budget, Data } from '../domain/types'
import { expenseCategories, finiteNonNegative, formatMoneyInput, money, parseMoney, uid } from '../domain/finance'
import { isCurrentMonth } from '../domain/planning'

type BudgetSectionProps = {
  budgets: Budget[]
  data: Data
  onChange: (budgets: Budget[]) => void
  onError: (message: string) => void
}

export default function BudgetSection({ budgets, data, onChange, onError }: BudgetSectionProps) {
  const [category, setCategory] = useState(expenseCategories[0])
  const [limit, setLimit] = useState('')
  const add = () => {
    const value = parseMoney(limit)
    if (!finiteNonNegative(value) || value <= 0) {
      onError('Informe um limite maior que zero.')
      return
    }
    const existing = budgets.find(budget => budget.category === category)
    onChange(existing ? budgets.map(budget => budget.category === category ? { ...budget, limit: value } : budget) : [...budgets, { id: uid(), category, limit: value }])
    setLimit('')
  }

  return <div className="card">
    <div className="card-head"><div><h3>Orçamento por categoria</h3><small>Os gastos consideram apenas o mês atual.</small></div></div>
    <div className="budget-form"><select value={category} onChange={event => setCategory(event.target.value)}>{expenseCategories.map(item => <option key={item}>{item}</option>)}</select><input type="text" inputMode="decimal" value={limit} onChange={event => setLimit(formatMoneyInput(event.target.value))} placeholder="Limite (R$)" /><button type="button" className="small-btn" onClick={add}>Salvar limite</button></div>
    {budgets.length ? <div className="list">{budgets.map(budget => {
      const spent = data.transactions.filter(transaction => transaction.category === budget.category && transaction.kind === 'expense' && transaction.status === 'paid' && isCurrentMonth(transaction.date)).reduce((total, transaction) => total + transaction.amount, 0)
      const percentage = Math.min(100, spent / budget.limit * 100)
      return <div className="list-row" key={budget.id}><div className="row-main"><b>{budget.category}</b><small>{money(spent)} de {money(budget.limit)} · {percentage.toFixed(0)}%</small><div className="progress"><i style={{ width: `${percentage}%`, background: percentage >= 100 ? '#e45b72' : undefined }} /></div></div><button type="button" aria-label={`Excluir orçamento de ${budget.category}`} className="icon-btn danger" onClick={() => onChange(budgets.filter(item => item.id !== budget.id))}>×</button></div>
    })}</div> : <div className="empty">Nenhum limite definido.</div>}
  </div>
}
