import { useState } from 'react'
import type { CustomCategories, Data, Kind, RecurringTransaction, Status } from '../domain/types'
import { categoriesFor, expenseCategories, finiteNonNegative, formatMoneyInput, incomeCategories, money, parseMoney, uid } from '../domain/finance'
import { getPlanningSummary } from '../domain/planning'
import BudgetSection from './BudgetSection'
import { Pencil, Plus, Trash2, X } from 'lucide-react'

type PlanningProps = {
  data: Data
  onSave: (salary: number, mealAllowance: number, savings: number) => void
  onBudgets: (budgets: Data['budgets']) => void
  onCategories: (categories: CustomCategories) => void
  onRecurring: (recurring: RecurringTransaction[]) => void
  onGenerateRecurring: () => void
  onError: (message: string) => void
}

export default function Planning({ data, onSave, onBudgets, onCategories, onRecurring, onGenerateRecurring, onError }: PlanningProps) {
  const [salary, setSalary] = useState(data.netSalary ? String(data.netSalary) : '')
  const [mealAllowance, setMealAllowance] = useState(data.mealAllowance ? String(data.mealAllowance) : '')
  const [savings, setSavings] = useState(data.savings ? String(data.savings) : '')
  const summary = getPlanningSummary(data)

  const save = () => {
    const parsedSalary = parseMoney(salary)
    const parsedSavings = parseMoney(savings || '0')
    const parsedMealAllowance = parseMoney(mealAllowance || '0')
    if (!finiteNonNegative(parsedSalary) || !finiteNonNegative(parsedMealAllowance) || !finiteNonNegative(parsedSavings) || parsedSavings > 100) {
      onError('Informe valores válidos para salário, vale-alimentação e percentual.')
      return
    }
    onSave(parsedSalary, parsedMealAllowance, parsedSavings)
  }

  return <section className="page">
    <div className="page-title"><div><h2>Planejamento</h2><p>Organize sua renda, limites e objetivos do mês.</p></div></div>
    <div className="planning-grid">
      <div className="card form">
        <label>Salário líquido mensal<input type="text" inputMode="decimal" value={salary} onChange={event => setSalary(formatMoneyInput(event.target.value))} placeholder="Ex.: 1.729,64" /></label>
        <label>Vale-alimentação mensal<input type="text" inputMode="decimal" value={mealAllowance} onChange={event => setMealAllowance(formatMoneyInput(event.target.value))} placeholder="Ex.: 600,00" /></label>
        <label>Percentual para guardar<input type="number" min="0" max="100" step="0.1" value={savings} onChange={event => setSavings(event.target.value)} placeholder="Ex.: 20" /></label>
        <button type="button" className="primary" onClick={save}>Salvar planejamento</button>
      </div>
      <div className="card summary">
        <h3>Projeção do mês</h3>
        <p><span>Renda planejada</span><b>{money(summary.plannedIncome)}</b></p>
        <p><span>Contas fixas</span><b>{money(summary.fixed)}</b></p>
        <p><span>Gastos realizados</span><b>{money(summary.spent)}</b></p>
        <p><span>Contas pendentes</span><b>{money(summary.pending)}</b></p>
        <p><span>Meta de economia</span><b>{money(summary.savingsTarget)}</b></p>
        <p><span>Vale-alimentação</span><b>{money(summary.mealAllowance)}</b></p>
        <p><span>Saldo do vale</span><b>{money(summary.mealAllowanceAvailable)}</b></p>
        <hr />
        <p className="highlight"><span>Disponível projetado</span><b>{money(summary.projectedAvailable)}</b></p>
      </div>
    </div>
    <BudgetSection budgets={data.budgets} data={data} onChange={onBudgets} onError={onError} />
    <CategorySection categories={data.customCategories} onChange={onCategories} onError={onError} />
    <RecurringSection data={data} onChange={onRecurring} onGenerate={onGenerateRecurring} onError={onError} />
  </section>
}

function RecurringSection({ data, onChange, onGenerate, onError }: { data: Data; onChange: (items: RecurringTransaction[]) => void; onGenerate: () => void; onError: (message: string) => void }) {
  const [kind, setKind] = useState<Kind>('expense')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState('1')
  const [category, setCategory] = useState(expenseCategories[0])
  const [accountId, setAccountId] = useState(data.accounts[0]?.id || '')
  const [method, setMethod] = useState('Pix')
  const [status, setStatus] = useState<Status>('pending')
  const categories = categoriesFor(data, kind)
  const add = () => {
    const value = parseMoney(amount)
    const numericDay = Number(day)
    if (!description.trim() || !finiteNonNegative(value) || value <= 0 || !Number.isInteger(numericDay) || numericDay < 1 || numericDay > 31 || !accountId || !categories.includes(category)) return onError('Preencha os dados do lançamento recorrente.')
    onChange([...data.recurring, { id: uid(), kind, amount: value, description: description.trim(), category, accountId, method, day: numericDay, status, active: true }])
    setDescription('')
    setAmount('')
  }
  return <div className="card recurring-section">
    <div className="card-head"><div><h3>Lançamentos recorrentes</h3><small>Gere receitas e despesas mensais sem duplicar lançamentos.</small></div><button type="button" className="small-btn" onClick={onGenerate}>Gerar mês atual</button></div>
    <div className="recurring-fields">
      <label>Tipo<select value={kind} onChange={event => { const nextKind = event.target.value as Kind; setKind(nextKind); setCategory(nextKind === 'income' ? incomeCategories[0] : expenseCategories[0]) }}><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
      <label>Descrição<input value={description} onChange={event => setDescription(event.target.value)} placeholder="Ex.: Aluguel" /></label>
      <label>Valor<input value={amount} onChange={event => setAmount(formatMoneyInput(event.target.value))} inputMode="decimal" placeholder="0,00" /></label>
      <label>Dia do mês<input type="number" min="1" max="31" value={day} onChange={event => setDay(event.target.value)} /></label>
      <label>Categoria<select value={category} onChange={event => setCategory(event.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Conta<select value={accountId} onChange={event => setAccountId(event.target.value)}>{data.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label>Pagamento<select value={method} onChange={event => setMethod(event.target.value)}><option>Pix</option><option>Débito</option><option>Crédito</option><option>Dinheiro</option><option>Transferência</option><option>Vale alimentação</option></select></label>
      <label>Status<select value={status} onChange={event => setStatus(event.target.value as Status)}><option value="pending">Pendente</option><option value="paid">Pago/Recebido</option></select></label>
    </div>
    <button type="button" className="secondary" onClick={add}>Adicionar recorrência</button>
    {data.recurring.length ? <div className="list">{data.recurring.map(item => <div className="list-row" key={item.id}><div className="row-main"><b>{item.description}</b><small>{item.kind === 'income' ? 'Receita' : 'Despesa'} · dia {item.day} · {money(item.amount)}</small></div><button type="button" className="small-btn" onClick={() => onChange(data.recurring.map(current => current.id === item.id ? { ...current, active: !current.active } : current))}>{item.active ? 'Ativo' : 'Pausado'}</button><button type="button" className="icon-btn danger" onClick={() => onChange(data.recurring.filter(current => current.id !== item.id))}>×</button></div>)}</div> : <div className="empty">Nenhuma recorrência cadastrada.</div>}
  </div>
}

function CategorySection({ categories, onChange, onError }: { categories: CustomCategories; onChange: (categories: CustomCategories) => void; onError: (message: string) => void }) {
  const [kind, setKind] = useState<'income' | 'expense'>('expense')
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const defaults = kind === 'income' ? incomeCategories : expenseCategories
  const hiddenKey = kind === 'income' ? 'hiddenIncome' : 'hiddenExpense'
  const visibleDefaults = defaults.filter(category => !categories[hiddenKey].includes(category))
  const add = () => {
    const value = name.trim()
    if (!value || defaults.includes(value) || categories[kind].some(item => item !== editing && item.toLocaleLowerCase() === value.toLocaleLowerCase())) return onError('Informe uma categoria nova e válida.')
    onChange({ ...categories, [kind]: editing ? categories[kind].map(item => item === editing ? value : item) : [...categories[kind], value] })
    setName('')
    setEditing(null)
  }
  const edit = (category: string) => { setEditing(category); setName(category) }
  const cancelEdit = () => { setEditing(null); setName('') }
  const remove = (category: string) => {
    if (defaults.includes(category)) onChange({ ...categories, [hiddenKey]: [...categories[hiddenKey], category] })
    else onChange({ ...categories, [kind]: categories[kind].filter(item => item !== category) })
  }
  return <div className="card">
    <div className="card-head"><div><h3>Categorias</h3><small>Consulte as categorias padrão e gerencie as que você criou.</small></div></div>
    <div className="category-tabs"><button type="button" className={kind === 'expense' ? 'selected' : ''} onClick={() => { setKind('expense'); cancelEdit() }}>Despesas</button><button type="button" className={kind === 'income' ? 'selected' : ''} onClick={() => { setKind('income'); cancelEdit() }}>Receitas</button></div>
    <div className="category-manager">
      <div className="category-group"><div className="category-group-head"><b>Categorias padrão</b><small>Disponíveis para todos os lançamentos</small></div><div className="category-list">{visibleDefaults.map(category => <div className="category-item system" key={category}><span>{category}</span><button type="button" className="icon-btn danger" aria-label={`Remover categoria ${category}`} title="Remover categoria" onClick={() => remove(category)}><Trash2 size={15} /></button></div>)}</div></div>
      <div className="category-group"><div className="category-group-head"><b>Minhas categorias</b><small>{categories[kind].length ? 'Edite ou remova suas categorias personalizadas' : 'Nenhuma categoria personalizada'}</small></div>{categories[kind].length ? <div className="category-list">{categories[kind].map(category => <div className="category-item" key={category}><span>{category}</span><div className="category-actions"><button type="button" className="icon-btn" aria-label={`Editar categoria ${category}`} title="Editar categoria" onClick={event => { event.stopPropagation(); edit(category) }}><Pencil size={15} /></button><button type="button" className="icon-btn danger" aria-label={`Excluir categoria ${category}`} title="Excluir categoria" onClick={event => { event.stopPropagation(); remove(category) }}><Trash2 size={15} /></button></div></div>)}</div> : <div className="empty category-empty">Crie uma categoria para começar.</div>}</div>
    </div>
    <div className="category-form"><input value={name} onChange={event => setName(event.target.value)} placeholder={editing ? 'Editar categoria' : 'Nome da nova categoria'} onKeyDown={event => { if (event.key === 'Enter') add() }} /><button type="button" className="small-btn" onClick={add}>{editing ? <><Pencil size={14} /> Salvar alteração</> : <><Plus size={14} /> Adicionar</>}</button>{editing && <button type="button" className="icon-btn" aria-label="Cancelar edição" title="Cancelar edição" onClick={cancelEdit}><X size={17} /></button>}</div>
  </div>
}
