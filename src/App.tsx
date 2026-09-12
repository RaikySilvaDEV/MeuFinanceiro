import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Account, Card, Data, Fixed, Goal, Installment, Kind, Status, Tab, Transaction, User } from './domain/types'
import { categoriesFor, expenseCategories, finiteNonNegative, formatMoneyInput, freshData, isMealAllowanceExpense, money, normalizeData, parseMoney, paymentMethods, readJson, today, uid, validDate } from './domain/finance'
import Planning from './components/Planning'
import { api } from './services/api'
import { isCurrentMonth } from './domain/planning'
import { AlertCircle, ArrowDownLeft, ArrowUpRight, BarChart3, CalendarDays, Check, CheckCircle2, CreditCard, Info, LayoutDashboard, LogOut, Pencil, Plus, Receipt, Repeat, Settings, Target, Trash2, Wallet, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    const stored = readJson<unknown>('meu-financeiro-session', null)
    return stored && typeof stored === 'object' && typeof (stored as User).id === 'string' ? stored as User : null
  })
  const [token, setToken] = useState(() => readJson<string>('meu-financeiro-token', ''))
  const [data, setData] = useState<Data>(freshData)
  const [loading, setLoading] = useState(Boolean(user && token))
  const [tab, setTab] = useState<Tab>('home')
  const [pageLoading, setPageLoading] = useState(false)
  const [modal, setModal] = useState<'transaction' | 'fixed' | 'goal' | 'account' | 'card' | 'installment' | 'transfer' | 'password' | 'reserve' | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [noticeTone, setNoticeTone] = useState<'error' | 'success' | 'info'>('error')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | Kind | Status>('all')
  const [onboarding, setOnboarding] = useState(false)
  const [reserveGoal, setReserveGoal] = useState<Goal | null>(null)
  const authRef = useRef({ user, token })
  useEffect(() => {
    authRef.current = { user, token }
  }, [user, token])
  const notify = (message: string, tone: 'error' | 'success' | 'info' = 'error') => {
    setNoticeTone(tone)
    setNotice(message)
  }

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), noticeTone === 'error' ? 5200 : 3600)
    return () => window.clearTimeout(timeout)
  }, [notice, noticeTone])
  useEffect(() => {
    if (!user || !token) return
    api.loadData(token).then(remoteData => setData(normalizeData(remoteData))).catch(() => { setUser(null); setToken(''); localStorage.removeItem('meu-financeiro-session'); localStorage.removeItem('meu-financeiro-token') }).finally(() => { setLoading(false) })
  }, [user, token])
  const update = (next: Data) => {
    setData(next)
    const { user: currentUser, token: currentToken } = authRef.current
    if (!currentUser || !currentToken) return
    void api.saveData(currentToken, next).catch(() => notify('Não foi possível salvar os dados no servidor.'))
  }
  const navigate = (next: Tab) => {
    if (next === tab) return
    setTab(next)
    setPageLoading(true)
    window.setTimeout(() => setPageLoading(false), 280)
  }
  const generateRecurring = () => {
    const month = today().slice(0, 7)
    const generated = data.recurring.filter(item => item.active && !data.transactions.some(transaction => transaction.recurringId === item.id && transaction.date.startsWith(month))).map(item => {
      const [year, monthNumber] = month.split('-').map(Number)
      const lastDay = new Date(year, monthNumber, 0).getDate()
      const date = `${month}-${String(Math.min(item.day, lastDay)).padStart(2, '0')}`
      return { id: uid(), recurringId: item.id, kind: item.kind, amount: item.amount, description: item.description, category: item.category, accountId: item.accountId, method: item.method, date, status: item.status } satisfies Transaction
    })
    if (!generated.length) return setNotice('Nenhum lançamento recorrente novo para gerar neste mês.')
    update({ ...data, transactions: [...generated, ...data.transactions] })
    notify(`${generated.length} lançamento(s) recorrente(s) gerado(s).`, 'success')
  }
  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `meu-financeiro-${today()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }
  const importData = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = normalizeData(JSON.parse(String(reader.result)))
        if (!imported.accounts.length) return setNotice('O arquivo não contém uma conta válida.')
        update(imported)
        notify('Dados importados com sucesso.', 'success')
      } catch {
        setNotice('Não foi possível importar este arquivo.')
      }
    }
    reader.onerror = () => setNotice('Não foi possível ler este arquivo.')
    reader.readAsText(file)
  }
  const totals = useMemo(() => {
    const currentTransactions = data.transactions.filter(t => isCurrentMonth(t.date))
    const paid = currentTransactions.filter(t => t.status === 'paid')
    const income = paid.filter(t => t.kind === 'income' && !t.transferId).reduce((s, t) => s + t.amount, 0)
    const spent = paid.filter(t => t.kind === 'expense' && !t.transferId).reduce((s, t) => s + t.amount, 0)
    const cashSpent = paid.filter(t => t.kind === 'expense' && !t.transferId && !isMealAllowanceExpense(t)).reduce((s, t) => s + t.amount, 0)
    const pending = currentTransactions.filter(t => t.kind === 'expense' && t.status === 'pending' && !isMealAllowanceExpense(t)).reduce((s, t) => s + t.amount, 0) + data.fixed.filter(f => f.active && !f.paid && f.method !== 'Vale alimentação').reduce((s, f) => s + f.amount, 0)
    const initial = data.accounts.reduce((s, a) => s + a.balance, 0)
    const reserved = data.goals.reduce((s, g) => s + g.current, 0)
    return { income, spent, pending, reserved, balance: initial + income - cashSpent, available: initial + income - cashSpent - pending, fixed: data.fixed.filter(f => f.active).reduce((s, f) => s + f.amount, 0) }
  }, [data])

  if (!user) return <Auth onLogin={(u, nextToken) => { setLoading(true); setUser(u); setToken(nextToken); localStorage.setItem('meu-financeiro-session', JSON.stringify(u)); localStorage.setItem('meu-financeiro-token', nextToken) }} onRegister={(u, nextToken) => { setLoading(true); setUser(u); setToken(nextToken); setOnboarding(true); setData(freshData()); localStorage.setItem('meu-financeiro-session', JSON.stringify(u)); localStorage.setItem('meu-financeiro-token', nextToken) }} />
  if (loading) return <LoadingScreen message="Carregando seu financeiro..." />

  const nav: [Tab, LucideIcon, string][] = [['home', LayoutDashboard, 'Início'], ['transactions', ArrowUpRight, 'Lançamentos'], ['fixed', Receipt, 'Contas fixas'], ['planning', BarChart3, 'Planejamento'], ['goals', Target, 'Metas'], ['accounts', Wallet, 'Contas'], ['cards', CreditCard, 'Cartões'], ['calendar', CalendarDays, 'Calendário'], ['reports', BarChart3, 'Relatórios']]
  const saveTransaction = (form: HTMLFormElement) => {
    const fd = new FormData(form); const amount = parseMoney(String(fd.get('amount') || '')); const kind = String(fd.get('kind')) as Kind
    const description = String(fd.get('description') || '').trim(); const category = String(fd.get('category') || '')
    const accountId = String(fd.get('accountId') || ''); const date = String(fd.get('date') || ''); const status = String(fd.get('status')) as Status
    if (!finiteNonNegative(amount) || amount <= 0 || !description) return setNotice('Informe um valor válido e uma descrição.')
    if (!validDate(date)) return setNotice('Informe uma data válida.')
    if (!data.accounts.some(a => a.id === accountId && a.active)) return setNotice('Selecione uma conta válida.')
    if (!categoriesFor(data, kind).includes(category)) return setNotice('Selecione uma categoria válida.')
    if (status !== 'paid' && status !== 'pending') return setNotice('Status inválido.')
    const previous = editing ? data.transactions.find(t => t.id === editing) : undefined
    if (!previous && editing) return setNotice('Lançamento não encontrado.')
    if (previous?.fixedId) return setNotice('Contas fixas devem ser alteradas na tela Contas fixas.')
    const transaction: Transaction = { id: editing || uid(), kind, amount, description, category, accountId, method: String(fd.get('method') || ''), date, status }
    update({ ...data, transactions: editing ? data.transactions.map(t => t.id === editing ? transaction : t) : [transaction, ...data.transactions] }); closeModal()
  }
  const saveFixed = (form: HTMLFormElement) => {
    const fd = new FormData(form); const amount = parseMoney(String(fd.get('amount') || '')); const name = String(fd.get('name') || '').trim(); const due = Number(fd.get('due'))
    const category = String(fd.get('category') || ''); const accountId = String(fd.get('accountId') || '')
    if (!name || !finiteNonNegative(amount) || amount <= 0 || !Number.isInteger(due) || due < 1 || due > 31) return setNotice('Informe nome, valor e vencimento válido.')
    if (!data.accounts.some(a => a.id === accountId && a.active)) return setNotice('Selecione uma conta válida.')
    if (!expenseCategories.includes(category)) return setNotice('Selecione uma categoria válida.')
    const duplicate = data.fixed.some(f => f.id !== editing && f.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())
    if (duplicate) return setNotice('Já existe uma conta fixa com esse nome.')
    const existing = editing ? data.fixed.find(f => f.id === editing) : undefined
    if (editing && !existing) return setNotice('Conta fixa não encontrada.')
    const item: Fixed = { id: editing || uid(), name, amount, category, due, accountId, method: String(fd.get('method') || ''), recurrence: String(fd.get('recurrence') || 'Mensal'), active: existing?.active ?? true, paid: existing?.paid ?? false, paidTransaction: existing?.paidTransaction }
    const transactions = item.paidTransaction ? data.transactions.map(t => t.id === item.paidTransaction ? { ...t, amount, category, accountId, method: item.method, description: name } : t) : data.transactions
    update({ ...data, fixed: editing ? data.fixed.map(f => f.id === editing ? item : f) : [...data.fixed, item], transactions }); closeModal()
  }
  const closeModal = () => { setModal(null); setEditing(null); setNotice('') }
  const toggleFixed = (item: Fixed) => {
    if (item.paid && item.paidTransaction && data.transactions.some(t => t.id === item.paidTransaction)) return setNotice('Esta conta já está paga.')
    const linked = data.transactions.find(t => t.fixedId === item.id)
    if (linked) return update({ ...data, fixed: data.fixed.map(f => f.id === item.id ? { ...f, paid: true, paidTransaction: linked.id } : f) })
    const transaction: Transaction = { id: uid(), kind: 'expense', amount: item.amount, description: item.name, category: item.category, accountId: item.accountId, method: item.method, date: today(), status: 'paid', fixedId: item.id }
    update({ ...data, fixed: data.fixed.map(f => f.id === item.id ? { ...f, paid: true, paidTransaction: transaction.id } : f), transactions: [transaction, ...data.transactions] })
  }
  const deleteTransaction = (id: string) => {
    const transaction = data.transactions.find(t => t.id === id)
    if (!transaction) return setNotice('Lançamento não encontrado.')
    if (transaction.fixedId) update({ ...data, transactions: data.transactions.filter(t => t.id !== id), fixed: data.fixed.map(f => f.id === transaction.fixedId ? { ...f, paid: false, paidTransaction: undefined } : f) })
    else update({ ...data, transactions: data.transactions.filter(t => t.id !== id) })
  }
  const deleteFixed = (id: string) => {
    const item = data.fixed.find(f => f.id === id)
    if (!item) return setNotice('Conta fixa não encontrada.')
    update({ ...data, fixed: data.fixed.filter(f => f.id !== id), transactions: item.paidTransaction ? data.transactions.filter(t => t.id !== item.paidTransaction) : data.transactions })
  }
  const payCardInvoice = (cardId: string) => {
    const card = data.cards.find(item => item.id === cardId)
    const account = data.accounts.find(item => item.active)
    if (!card || !account) return setNotice('Cadastre uma conta ativa para pagar a fatura.')
    const month = today().slice(0, 7)
    const invoice = data.installments.filter(item => item.cardId === cardId && item.date.slice(0, 7) === month).reduce((total, item) => total + item.amount, 0)
    if (invoice <= 0) return setNotice('Este cartão não possui fatura neste mês.')
    if (card.paidInvoices?.includes(month)) return setNotice('A fatura deste mês já foi paga.')
    const transaction: Transaction = { id: uid(), kind: 'expense', amount: invoice, description: `Fatura ${card.name}`, category: 'Compras', accountId: account.id, method: 'Crédito', date: today(), status: 'paid' }
    update({ ...data, cards: data.cards.map(item => item.id === cardId ? { ...item, paidInvoices: [...(item.paidInvoices || []), month] } : item), transactions: [transaction, ...data.transactions] })
  }
  const openReserve = (goal: Goal) => { setReserveGoal(goal); setModal('reserve') }
  const reserve = (description: string, value: number) => {
    const goal = reserveGoal
    const account = data.accounts.find(item => item.active)
    const remaining = goal ? Math.max(0, (goal.target || Infinity) - goal.current) : 0
    if (!goal || !account) return setNotice('Cadastre uma conta ativa antes de reservar.')
    if (!description.trim()) return setNotice('Informe uma descrição para identificar a reserva.')
    if (!finiteNonNegative(value) || value <= 0 || value > totals.available || value > remaining) return setNotice('Valor inválido, maior que o disponível ou que o restante da meta.')
    const transaction: Transaction = { id: uid(), kind: 'expense', amount: value, description: description.trim(), category: 'Metas', accountId: account.id, method: 'Transferência', date: today(), status: 'paid', goalId: goal.id }
    update({ ...data, goals: data.goals.map(g => g.id === goal.id ? { ...g, current: g.current + value } : g), transactions: [transaction, ...data.transactions] })
    setReserveGoal(null)
    closeModal()
  }
  const filtered = data.transactions.filter(t => (filter === 'all' || t.kind === filter || t.status === filter) && (`${t.description} ${t.category}`.toLowerCase().includes(query.toLowerCase())))

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand">Meu<span>Financeiro</span></div><nav>{nav.map(([id, Icon, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => navigate(id)}><Icon size={18} strokeWidth={2} />{label}</button>)}</nav><button className="logout" onClick={() => { setUser(null); setToken(''); localStorage.removeItem('meu-financeiro-session'); localStorage.removeItem('meu-financeiro-token') }}>Sair</button></aside>
    <main className="main"><header><div><small>Olá, {user.name.split(' ')[0]} 👋</small><h1>{nav.find(n => n[0] === tab)?.[2]}</h1></div><button className="avatar" onClick={() => setModal('password')} aria-label="Abrir configurações da conta" title="Configurações da conta"><Settings size={20} strokeWidth={2.2} /></button></header>
      {pageLoading ? <PageSkeleton tab={tab} /> : <>{tab === 'home' && <Dashboard totals={totals} data={data} onNew={() => setModal('transaction')} onNavigate={navigate} />}
      {tab === 'transactions' && <section className="page"><div className="page-title"><div><h2>Todos os lançamentos</h2><p>Pesquise, filtre e mantenha tudo organizado.</p></div><button className="primary" onClick={() => setModal('transaction')}>+ Novo lançamento</button></div><div className="toolbar"><input placeholder="Pesquisar lançamento..." value={query} onChange={e => setQuery(e.target.value)} />{(['all', 'income', 'expense', 'paid', 'pending'] as const).map(f => <button key={f} className={filter === f ? 'selected' : ''} onClick={() => setFilter(f)}>{f === 'all' ? 'Todos' : f === 'income' ? 'Entradas' : f === 'expense' ? 'Saídas' : f === 'paid' ? 'Pagos' : 'Pendentes'}</button>)}</div><TransactionList items={filtered} data={data} onEdit={(id) => { setEditing(id); setModal('transaction') }} onDelete={deleteTransaction} /></section>}
      {tab === 'fixed' && <FixedPage data={data} totals={totals} onNew={() => setModal('fixed')} onEdit={(id) => { setEditing(id); setModal('fixed') }} onPay={toggleFixed} onDelete={deleteFixed} />}
      {tab === 'goals' && <GoalsPage data={data} onNew={() => setModal('goal')} onReserve={openReserve} onEdit={(id) => { setEditing(id); setModal('goal') }} onDelete={(id) => update({ ...data, goals: data.goals.filter(g => g.id !== id) })} />}
      {tab === 'accounts' && <AccountsPage data={data} totals={totals} onNew={() => setModal('account')} onTransfer={() => setModal('transfer')} onExport={exportData} onImport={importData} onDelete={(id) => update({ ...data, accounts: data.accounts.filter(a => a.id !== id) })} />}
      {tab === 'planning' && <Planning key={`${data.netSalary}-${data.mealAllowance}-${data.savings}`} data={data} onSave={(netSalary, mealAllowance, savings) => update({ ...data, netSalary, mealAllowance, savings })} onBudgets={(budgets) => update({ ...data, budgets })} onCategories={(customCategories) => update({ ...data, customCategories })} onRecurring={(recurring) => update({ ...data, recurring })} onGenerateRecurring={generateRecurring} onError={setNotice} />}
      {tab === 'cards' && <CardsPage data={data} onNew={() => setModal('card')} onInstallment={() => setModal('installment')} onPay={payCardInvoice} onDelete={(id) => update({ ...data, cards: data.cards.filter(c => c.id !== id), installments: data.installments.filter(item => item.cardId !== id) })} />}
      {tab === 'calendar' && <CalendarPage data={data} />}
      {tab === 'reports' && <Reports data={data} totals={totals} />}</>}
    </main>
    <nav className="bottom-nav">{nav.slice(0, 5).map(([id, Icon, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => navigate(id)}><Icon size={18} />{label}</button>)}</nav>
    <button className="mobile-logout" onClick={() => { setUser(null); setToken(''); localStorage.removeItem('meu-financeiro-session'); localStorage.removeItem('meu-financeiro-token') }}><LogOut size={17} />Sair</button>
    <button className="fab" onClick={() => setModal('transaction')} aria-label="Novo lançamento"><Plus size={25} /></button>
    {modal === 'transaction' && <Modal title={editing ? 'Editar lançamento' : 'Novo lançamento'} onClose={closeModal}><TransactionForm data={data} initial={data.transactions.find(t => t.id === editing)} onSubmit={saveTransaction} /></Modal>}
    {modal === 'fixed' && <Modal title={editing ? 'Editar conta fixa' : 'Nova conta fixa'} onClose={closeModal}><FixedForm data={data} initial={data.fixed.find(f => f.id === editing)} onSubmit={saveFixed} /></Modal>}
    {modal === 'goal' && <Modal title={editing ? 'Editar meta' : 'Nova meta'} onClose={closeModal}><GoalForm data={data} initial={data.goals.find(g => g.id === editing)} onSubmit={(goal) => { if (!goal.name || !finiteNonNegative(goal.target) || goal.target <= 0 || !finiteNonNegative(goal.current) || !finiteNonNegative(goal.monthly) || (goal.deadline && !validDate(goal.deadline))) return setNotice('Informe valores válidos para a meta e uma data correta.'); update({ ...data, goals: editing ? data.goals.map(g => g.id === editing ? { ...goal, id: editing } : g) : [...data.goals, { ...goal, id: uid() }] }); closeModal() }} /></Modal>}
    {modal === 'account' && <Modal title="Nova conta" onClose={closeModal}><AccountForm onSubmit={(account) => { if (!account.name || !finiteNonNegative(account.balance)) return setNotice('Informe um nome e saldo inicial válido.'); update({ ...data, accounts: [...data.accounts, { ...account, id: uid() }] }); closeModal() }} /></Modal>}
    {modal === 'transfer' && <Modal title="Transferir entre contas" onClose={closeModal}><TransferForm data={data} onSubmit={(transfer) => { if (!transfer.description || transfer.fromId === transfer.toId || !finiteNonNegative(transfer.amount) || transfer.amount <= 0 || !validDate(transfer.date)) return setNotice('Informe contas diferentes, valor e data válidos.'); const transferId = uid(); const source: Transaction = { id: uid(), transferId, kind: 'expense', amount: transfer.amount, description: transfer.description, category: 'Transferência', accountId: transfer.fromId, method: 'Transferência', date: transfer.date, status: 'paid' }; const destination: Transaction = { id: uid(), transferId, kind: 'income', amount: transfer.amount, description: transfer.description, category: 'Transferência', accountId: transfer.toId, method: 'Transferência', date: transfer.date, status: 'paid' }; update({ ...data, transactions: [source, destination, ...data.transactions] }); closeModal() }} /></Modal>}
    {modal === 'password' && <Modal title="Segurança da conta" onClose={closeModal}><PasswordForm token={token} onDone={() => { closeModal(); notify('Senha alterada com sucesso.', 'success') }} onError={setNotice} /></Modal>}
    {modal === 'reserve' && reserveGoal && <Modal title={`Reservar para ${reserveGoal.name}`} onClose={() => { setReserveGoal(null); closeModal() }}><ReserveForm goal={reserveGoal} available={totals.available} onSubmit={reserve} /></Modal>}
    {modal === 'card' && <Modal title="Novo cartão" onClose={closeModal}><CardForm onSubmit={(card) => { if (!card.name || !finiteNonNegative(card.limit) || card.limit <= 0 || !Number.isInteger(card.closing) || card.closing < 1 || card.closing > 31 || !Number.isInteger(card.due) || card.due < 1 || card.due > 31) return setNotice('Informe nome, limite e datas válidos.'); update({ ...data, cards: [...data.cards, { ...card, id: uid() }] }); closeModal() }} /></Modal>}
    {modal === 'installment' && <Modal title="Compra parcelada" onClose={closeModal}><InstallmentForm data={data} onSubmit={(item) => { if (!item.description || !data.cards.some(c => c.id === item.cardId) || !finiteNonNegative(item.amount) || item.amount <= 0 || !Number.isInteger(item.total) || item.total < 1 || !validDate(item.date)) return setNotice('Preencha valores, cartão e data válidos.'); const firstDate = new Date(`${item.date}T12:00:00`); update({ ...data, installments: [...data.installments, ...Array.from({ length: item.total }, (_, i) => { const date = new Date(firstDate.getFullYear(), firstDate.getMonth() + i, firstDate.getDate()); return { ...item, id: uid(), current: i + 1, amount: item.amount / item.total, date: date.toISOString().slice(0, 10) } })] }); closeModal() }} /></Modal>}
    {onboarding && <Modal title="Vamos configurar seu financeiro" onClose={() => setOnboarding(false)}><Onboarding data={data} onDone={(next) => { update(next); setOnboarding(false) }} /></Modal>}
    {notice && <div className={`toast ${noticeTone}`} role={noticeTone === 'error' ? 'alert' : 'status'} aria-live="polite"><span className="toast-icon">{noticeTone === 'error' ? <AlertCircle size={18} /> : noticeTone === 'success' ? <CheckCircle2 size={18} /> : <Info size={18} />}</span><span className="toast-message">{notice}</span><button type="button" className="toast-close" aria-label="Fechar notificação" onClick={() => setNotice('')}><X size={16} /></button></div>}
  </div>
}

function Auth({ onLogin, onRegister }: { onLogin: (u: User, token: string) => void; onRegister: (u: User, token: string) => void }) {
  const [register, setRegister] = useState(false); const [error, setError] = useState(''); const [submitting, setSubmitting] = useState(false)
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const fd = new FormData(event.currentTarget); const name = String(fd.get('name') || '').trim(); const email = String(fd.get('email') || '').toLowerCase().trim(); const password = String(fd.get('password') || '')
    setSubmitting(true); setError('')
    const operation = register ? api.register(name, email, password) : api.login(email, password)
    operation.then(result => register ? onRegister(result.user, result.token) : onLogin(result.user, result.token)).catch(reason => setError(reason instanceof Error ? reason.message : 'Não foi possível entrar.')).finally(() => setSubmitting(false))
  }
  return <div className="auth"><div className="auth-card"><div className="brand">Meu<span>Financeiro</span></div><h1>{register ? 'Crie sua conta' : 'Bem-vindo de volta'}</h1><p>Seu dinheiro, de um jeito simples.</p><form onSubmit={submit} className="form">{register && <label>Nome<input name="name" required disabled={submitting} /></label>}<label>E-mail<input name="email" type="email" required disabled={submitting} /></label><label>Senha<input name="password" type="password" minLength={8} required disabled={submitting} /></label>{error && <div className="error">{error}</div>}<button className="primary full auth-submit" disabled={submitting}>{submitting ? <><span className="spinner" /> {register ? 'Criando conta...' : 'Entrando...'}</> : register ? 'Cadastrar' : 'Entrar'}</button></form><button className="link" disabled={submitting} onClick={() => { setRegister(!register); setError('') }}>{register ? 'Já tenho uma conta' : 'Criar uma conta'}</button><small>Dados armazenados com segurança no PostgreSQL.</small></div></div>
}

function LoadingScreen({ message }: { message: string }) {
  return <div className="loading-screen" role="status" aria-live="polite"><div className="loading-brand">Meu<span>Financeiro</span></div><div className="loading-spinner" /><p>{message}</p><div className="loading-preview"><DashboardSkeleton /></div></div>
}

function DashboardSkeleton() {
  return <section className="page skeleton-page" aria-label="Carregando painel"><div className="skeleton skeleton-hero" /><div className="skeleton-metrics">{Array.from({ length: 5 }, (_, index) => <div className="skeleton skeleton-metric" key={index} />)}</div><div className="grid-two"><div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" /></div></section>
}

function PageSkeleton({ tab }: { tab: Tab }) {
  const labels: Record<Tab, string> = { home: 'Carregando painel...', transactions: 'Carregando lançamentos...', fixed: 'Carregando contas fixas...', planning: 'Carregando planejamento...', goals: 'Carregando metas...', accounts: 'Carregando contas...', cards: 'Carregando cartões...', calendar: 'Carregando calendário...', reports: 'Carregando relatórios...' }
  return <section className={`page skeleton-page skeleton-${tab}`} role="status" aria-live="polite"><div className="skeleton-loading-label"><span className="spinner" /> {labels[tab]}</div><SkeletonLayout tab={tab} /></section>
}

function SkeletonLayout({ tab }: { tab: Tab }) {
  if (tab === 'home') return <><div className="skeleton skeleton-hero" /><SkeletonMetrics /><div className="skeleton-columns"><div className="skeleton skeleton-list-card" /><div className="skeleton skeleton-shortcuts-card" /></div></>
  if (tab === 'transactions') return <><div className="skeleton skeleton-page-title" /><div className="skeleton skeleton-toolbar" /><div className="skeleton skeleton-list-card tall" /></>
  if (tab === 'planning') return <><div className="skeleton-columns"><div className="skeleton skeleton-form-card" /><div className="skeleton skeleton-summary-card" /></div><div className="skeleton skeleton-wide-card" /><div className="skeleton skeleton-wide-card" /><div className="skeleton skeleton-wide-card" /></>
  if (tab === 'reports') return <><SkeletonMetrics /><div className="skeleton-columns"><div className="skeleton skeleton-chart-card" /><div className="skeleton skeleton-report-card" /></div></>
  if (tab === 'calendar') return <><div className="skeleton skeleton-page-title" /><div className="skeleton skeleton-calendar-card" /></>
  if (tab === 'fixed' || tab === 'goals' || tab === 'accounts' || tab === 'cards') return <><div className="skeleton skeleton-page-title" /><div className="skeleton-cards">{Array.from({ length: 3 }, (_, index) => <div className="skeleton skeleton-item-card" key={index} />)}</div><div className="skeleton skeleton-wide-card" /></>
  return <><div className="skeleton skeleton-page-title" /><div className="skeleton skeleton-wide-card" /></>
}

function SkeletonMetrics() {
  return <div className="skeleton-metrics">{Array.from({ length: 5 }, (_, index) => <div className="skeleton skeleton-metric" key={index} />)}</div>
}

function PasswordForm({ token, onDone, onError }: { token: string; onDone: () => void; onError: (message: string) => void }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (newPassword.length < 8) return onError('A nova senha deve ter pelo menos 8 caracteres.')
    if (newPassword !== confirmation) return onError('A confirmação da nova senha não confere.')
    setSaving(true)
    try {
      await api.changePassword(token, currentPassword, newPassword)
      onDone()
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'Não foi possível alterar a senha.')
    } finally {
      setSaving(false)
    }
  }
  return <form className="form" onSubmit={submit}><label>Senha atual<input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required /></label><label>Nova senha<input type="password" minLength={8} value={newPassword} onChange={event => setNewPassword(event.target.value)} required /></label><label>Confirmar nova senha<input type="password" minLength={8} value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></label><button className="primary full" disabled={saving}>{saving ? 'Salvando...' : 'Alterar senha'}</button></form>
}

function Dashboard({ totals, data, onNew, onNavigate }: { totals: { balance: number; available: number; income: number; spent: number; pending: number; reserved: number; fixed: number }; data: Data; onNew: () => void; onNavigate: (tab: Tab) => void }) {
  const alerts = data.fixed.filter(item => item.active && !item.paid).slice(0, 3).map(item => `Conta fixa "${item.name}" vence dia ${item.due}.`)
  const cardAlerts = data.cards.filter(card => !card.paidInvoices?.includes(today().slice(0, 7)) && data.installments.some(item => item.cardId === card.id && item.date.slice(0, 7) === today().slice(0, 7))).slice(0, 3).map(card => `Fatura de ${card.name} vence dia ${card.due}.`)
  return <section className="page"><div className="hero"><div><small>SALDO ATUAL</small><strong>{money(totals.balance)}</strong><p>Disponível para gastar: <b>{money(totals.available)}</b></p></div><button className="primary light" onClick={onNew}><Plus size={17} /> Lançamento</button></div><div className="metrics"><Metric label="Recebido no mês" value={totals.income} tone="green" /><Metric label="Gasto no mês" value={totals.spent} tone="red" /><Metric label="Contas fixas" value={totals.fixed} tone="blue" /><Metric label="A pagar" value={totals.pending} tone="yellow" /><Metric label="Reservado" value={totals.reserved} tone="purple" /></div>{alerts.length || cardAlerts.length ? <div className="card alerts-card"><div className="card-head"><div><h3><CalendarDays size={17} /> Próximos vencimentos</h3><small>Confira suas contas e faturas em aberto.</small></div></div><div className="alerts-list">{[...alerts, ...cardAlerts].map(alert => <div className="alert-row" key={alert}><CalendarDays size={16} /><span>{alert}</span></div>)}</div></div> : null}<div className="grid-two"><div className="card"><div className="card-head"><h3>Últimas movimentações</h3><button className="link" onClick={() => onNavigate('transactions')}>Ver todas</button></div>{data.transactions.length ? <TransactionList items={data.transactions.slice(0, 5)} data={data} compact /> : <Empty text="Você ainda não tem lançamentos." />}</div><div className="card"><h3>Atalhos</h3><div className="shortcuts"><button onClick={onNew}><Plus className="shortcut-icon" size={26} strokeWidth={1.8} /><span>Novo lançamento</span></button><button onClick={() => onNavigate('fixed')}><Receipt className="shortcut-icon" size={26} strokeWidth={1.8} /><span>Contas fixas</span></button><button onClick={() => onNavigate('goals')}><Target className="shortcut-icon" size={26} strokeWidth={1.8} /><span>Reservar dinheiro</span></button><button onClick={() => onNavigate('planning')}><BarChart3 className="shortcut-icon" size={26} strokeWidth={1.8} /><span>Planejamento</span></button></div></div></div></section>
}
function Metric({ label, value, tone }: { label: string; value: number; tone: string }) { return <div className={`metric ${tone}`}><small>{label}</small><b>{money(value)}</b></div> }
function Empty({ text }: { text: string }) { return <div className="empty">{text}</div> }
function TransactionList({ items, data, compact = false, onEdit, onDelete }: { items: Transaction[]; data: Data; compact?: boolean; onEdit?: (id: string) => void; onDelete?: (id: string) => void }) {
  if (!items.length) return <Empty text="Nenhum lançamento encontrado." />
  return <div className="list">{items.map(t => <div className="list-row" key={t.id}><div className={`type-icon ${t.kind}`}>{t.kind === 'income' ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}</div><div className="row-main"><b>{t.description}</b><small>{t.category} · {t.date} · {t.method || 'Forma não informada'} · {data.accounts.find(a => a.id === t.accountId)?.name || 'Sem conta'}</small></div><strong className={t.kind}>{t.kind === 'income' ? '+' : '-'}{money(t.amount)}</strong>{!compact && <><span className={`status ${t.status}`}>{t.status === 'paid' ? 'Pago' : 'Pendente'}</span>{onEdit && <button className="icon-btn" aria-label="Editar lançamento" onClick={() => onEdit(t.id)}><Pencil size={15} /></button>}{onDelete && <button className="icon-btn danger" aria-label="Excluir lançamento" onClick={() => onDelete(t.id)}><Trash2 size={15} /></button>}</>}</div>)}</div>
}
function FixedPage({ data, totals, onNew, onEdit, onPay, onDelete }: { data: Data; totals: { fixed: number }; onNew: () => void; onEdit: (id: string) => void; onPay: (f: Fixed) => void; onDelete: (id: string) => void }) { return <section className="page"><div className="page-title"><div><h2>Contas fixas</h2><p>Total mensal previsto: <b>{money(totals.fixed)}</b></p></div><button className="primary" onClick={onNew}><Plus size={16} /> Nova conta fixa</button></div>{data.fixed.length ? <div className="card"><div className="list">{data.fixed.map(f => <div className="list-row" key={f.id}><div className={`bill-dot ${f.paid ? 'paid' : ''}`}>{f.paid ? <Check size={16} /> : <Receipt size={16} />}</div><div className="row-main"><b>{f.name}</b><small>{f.category} · vence dia {f.due} · {f.recurrence}</small></div><strong>{money(f.amount)}</strong>{f.paid ? <span className="status paid">Paga</span> : <button className="small-btn" onClick={() => onPay(f)}>Marcar paga</button>}<button className="icon-btn" aria-label="Editar conta fixa" onClick={() => onEdit(f.id)}><Pencil size={15} /></button><button className="icon-btn danger" aria-label="Excluir conta fixa" onClick={() => onDelete(f.id)}><Trash2 size={15} /></button></div>)}</div></div> : <div className="card"><Empty text="Cadastre sua primeira conta fixa." /></div>}</section> }
function GoalsPage({ data, onNew, onReserve, onEdit, onDelete }: { data: Data; onNew: () => void; onReserve: (g: Goal) => void; onEdit: (id: string) => void; onDelete: (id: string) => void }) { return <section className="page"><div className="page-title"><div><h2>Metas</h2><p>Reserve dinheiro sem misturar com gastos.</p></div><button className="primary" onClick={onNew}><Plus size={16} /> Nova meta</button></div><div className="goal-grid">{data.goals.map(g => { const percent = g.target ? Math.min(g.current / g.target * 100, 100) : 0; return <div className="card goal-card" key={g.id}><div className="goal-title"><Target size={22} /><b>{g.name}</b><button className="icon-btn" aria-label="Editar meta" onClick={() => onEdit(g.id)}><Pencil size={15} /></button></div><strong>{money(g.current)}</strong><small>{g.target ? `de ${money(g.target)}` : 'Defina um valor alvo'}</small><div className="progress"><i style={{ width: `${percent}%` }} /></div><div className="goal-footer"><span>{percent.toFixed(0)}%</span><button className="small-btn" onClick={() => onReserve(g)}>Guardar dinheiro</button><button className="icon-btn danger" aria-label="Excluir meta" onClick={() => onDelete(g.id)}><Trash2 size={15} /></button></div></div> })}</div>{!data.goals.length && <div className="card"><Empty text="Crie sua primeira meta." /></div>}</section> }
function AccountsPage({ data, totals, onNew, onTransfer, onExport, onImport, onDelete }: { data: Data; totals: { balance: number }; onNew: () => void; onTransfer: () => void; onExport: () => void; onImport: (file: File) => void; onDelete: (id: string) => void }) { return <section className="page"><div className="page-title"><div><h2>Minhas contas</h2><p>Saldo consolidado: <b>{money(totals.balance)}</b></p></div><div className="actions"><button className="secondary" onClick={onTransfer} disabled={data.accounts.length < 2}><Repeat size={16} /> Transferir</button><button className="primary" onClick={onNew}><Plus size={16} /> Nova conta</button></div></div><div className="toolbar"><button type="button" onClick={onExport}>Exportar backup</button><label className="small-btn">Importar backup<input type="file" accept="application/json" hidden onChange={event => { const file = event.target.files?.[0]; if (file) onImport(file); event.currentTarget.value = '' }} /></label></div><div className="account-grid">{data.accounts.map(a => { const balance = a.balance + data.transactions.filter(t => t.accountId === a.id && t.status === 'paid' && !isMealAllowanceExpense(t)).reduce((s, t) => s + (t.kind === 'income' ? t.amount : -t.amount), 0); return <div className="card account-card" key={a.id}><Wallet size={24} /><b>{a.name}</b><small>{a.type}</small><strong>{money(balance)}</strong><button className="icon-btn danger" aria-label="Excluir conta" onClick={() => onDelete(a.id)}><Trash2 size={15} /></button></div> })}</div>{!data.accounts.length && <div className="card"><Empty text="Crie uma conta para começar a registrar seu saldo." /></div>}</section> }
function CardsPage({ data, onNew, onInstallment, onPay, onDelete }: { data: Data; onNew: () => void; onInstallment: () => void; onPay: (id: string) => void; onDelete: (id: string) => void }) { const month = today().slice(0, 7); const invoiceHistory = data.cards.flatMap(card => Array.from(new Set(data.installments.filter(item => item.cardId === card.id).map(item => item.date.slice(0, 7)))).sort().reverse().map(invoiceMonth => ({ card, month: invoiceMonth, amount: data.installments.filter(item => item.cardId === card.id && item.date.slice(0, 7) === invoiceMonth).reduce((total, item) => total + item.amount, 0), paid: card.paidInvoices?.includes(invoiceMonth) }))); return <section className="page"><div className="page-title"><div><h2>Cartões</h2><p>Organize limites, faturas e compras parceladas.</p></div><div className="actions"><button className="secondary" onClick={onInstallment} disabled={!data.cards.length}><Plus size={16} /> Compra parcelada</button><button className="primary" onClick={onNew}><Plus size={16} /> Novo cartão</button></div></div><div className="account-grid">{data.cards.map(c => { const invoice = data.installments.filter(item => item.cardId === c.id && item.date.slice(0, 7) === month).reduce((total, item) => total + item.amount, 0); const used = data.installments.filter(item => item.cardId === c.id && item.date >= `${month}-01`).reduce((total, item) => total + item.amount, 0); const paid = c.paidInvoices?.includes(month); return <div className="card account-card" key={c.id}><CreditCard size={24} /><b>{c.name}</b><small>Fecha dia {c.closing} · vence dia {c.due}</small><strong>Disponível {money(Math.max(0, c.limit - used))}</strong><small>Fatura atual: {money(invoice)} · {paid ? 'paga' : 'em aberto'}</small>{invoice > 0 && !paid && <button type="button" className="small-btn" onClick={() => onPay(c.id)}>Marcar fatura como paga</button>}<button className="icon-btn danger" aria-label="Excluir cartão" onClick={() => onDelete(c.id)}><Trash2 size={15} /></button></div>})}</div><div className="card"><h3>Parcelas</h3>{data.installments.length ? <div className="list">{data.installments.map(i => <div className="list-row" key={i.id}><div className="row-main"><b>{i.description}</b><small>{i.current}/{i.total} · {data.cards.find(c => c.id === i.cardId)?.name} · vence {i.date}</small></div><strong>{money(i.amount)}</strong></div>)}</div> : <Empty text="Nenhuma compra parcelada." />}</div><div className="card"><div className="card-head"><div><h3>Histórico de faturas</h3><small>Valores organizados por cartão e mês.</small></div></div>{invoiceHistory.length ? <div className="list">{invoiceHistory.map(invoice => <div className="list-row" key={`${invoice.card.id}-${invoice.month}`}><div className="row-main"><b>{invoice.card.name}</b><small>Fatura de {invoice.month}</small></div><strong>{money(invoice.amount)}</strong><span className={`status ${invoice.paid ? 'paid' : 'pending'}`}>{invoice.paid ? 'Paga' : 'Em aberto'}</span></div>)}</div> : <Empty text="Nenhuma fatura registrada." />}</div></section> }
function CalendarPage({ data }: { data: Data }) { const [date, setDate] = useState(today()); const events = data.transactions.filter(t => t.date === date); return <section className="page"><div className="page-title"><div><h2>Calendário financeiro</h2><p>Entradas, gastos e pagamentos por dia.</p></div><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div><div className="card"><h3>{new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { dateStyle: 'full' })}</h3>{events.length ? <TransactionList items={events} data={data} compact /> : <Empty text="Nenhum lançamento neste dia." />}</div></section> }
function Reports({ data, totals }: { data: Data; totals: { income: number; spent: number; fixed: number; reserved: number; balance: number } }) { const categories = expenseCategories.map(category => ({ category, value: data.transactions.filter(t => t.kind === 'expense' && t.category === category && t.status === 'paid').reduce((s, t) => s + t.amount, 0) })).filter(x => x.value); return <section className="page"><div className="page-title"><div><h2>Relatórios</h2><p>Resumo visual das suas finanças.</p></div></div><div className="metrics"><Metric label="Entradas" value={totals.income} tone="green" /><Metric label="Saídas" value={totals.spent} tone="red" /><Metric label="Contas fixas" value={totals.fixed} tone="blue" /><Metric label="Reservado" value={totals.reserved} tone="purple" /></div><div className="grid-two"><div className="card"><h3>Entradas x saídas</h3><div className="bars"><div><i style={{ height: `${Math.min(100, totals.income ? totals.income / Math.max(totals.income, totals.spent) * 100 : 0)}%` }} /><small>Entradas</small></div><div><i className="red-bar" style={{ height: `${Math.min(100, totals.spent ? totals.spent / Math.max(totals.income, totals.spent) * 100 : 0)}%` }} /><small>Saídas</small></div></div></div><div className="card"><h3>Gastos por categoria</h3>{categories.length ? categories.map(c => <p className="report-row" key={c.category}><span>{c.category}</span><b>{money(c.value)}</b></p>) : <Empty text="Ainda não há gastos registrados." />}</div></div></section> }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal"><div className="modal-head"><h2 id="modal-title">{title}</h2><button type="button" aria-label="Fechar" className="icon-btn" onClick={onClose}><X size={19} /></button></div>{children}</div></div> }
function Fields({ data, kind }: { data: Data; kind: Kind }) { const categories = categoriesFor(data, kind); return <><label>Categoria<select name="category">{categories.map(c => <option key={c}>{c}</option>)}</select></label><label>Conta<select name="accountId" required>{data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Forma de pagamento<select name="method">{paymentMethods.map(method => <option key={method}>{method}</option>)}</select></label></> }
function TransferForm({ data, onSubmit }: { data: Data; onSubmit: (transfer: { fromId: string; toId: string; amount: number; description: string; date: string }) => void }) { const [transfer, setTransfer] = useState({ fromId: data.accounts[0]?.id || '', toId: data.accounts[1]?.id || '', amount: '', description: '', date: today() }); return <form className="form" onSubmit={event => { event.preventDefault(); onSubmit({ ...transfer, amount: parseMoney(transfer.amount) }) }}><label>Conta de origem<select value={transfer.fromId} onChange={event => setTransfer({ ...transfer, fromId: event.target.value })}>{data.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label>Conta de destino<select value={transfer.toId} onChange={event => setTransfer({ ...transfer, toId: event.target.value })}>{data.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label>Valor<input type="text" inputMode="decimal" placeholder="0,00" value={transfer.amount} onChange={event => setTransfer({ ...transfer, amount: formatMoneyInput(event.target.value) })} required /></label><label>Descrição<input value={transfer.description} onChange={event => setTransfer({ ...transfer, description: event.target.value })} placeholder="Ex.: Reserva mensal" required /></label><label>Data<input type="date" value={transfer.date} onChange={event => setTransfer({ ...transfer, date: event.target.value })} required /></label><button className="primary full">Transferir</button></form> }
function ReserveForm({ goal, available, onSubmit }: { goal: Goal; available: number; onSubmit: (description: string, value: number) => void }) { const [description, setDescription] = useState(`Reserva: ${goal.name}`); const [value, setValue] = useState(''); return <form className="form" onSubmit={event => { event.preventDefault(); onSubmit(description, parseMoney(value)) }}><small>Disponível para reservar: {money(available)}</small><label>Descrição<input value={description} onChange={event => setDescription(event.target.value)} placeholder="Ex.: Economia do salário de setembro" required autoFocus /></label><label>Valor<input type="text" inputMode="decimal" value={value} onChange={event => setValue(formatMoneyInput(event.target.value))} placeholder="0,00" required /></label><button className="primary full">Confirmar reserva</button></form> }
function TransactionForm({ data, initial, onSubmit }: { data: Data; initial?: Transaction; onSubmit: (f: HTMLFormElement) => void }) { const [kind, setKind] = useState<Kind>(initial?.kind || 'expense'); return <form className="form" onSubmit={e => { e.preventDefault(); onSubmit(e.currentTarget) }}><div className="segmented"><button type="button" className={kind === 'income' ? 'selected income-bg' : ''} onClick={() => setKind('income')}>Entrada</button><button type="button" className={kind === 'expense' ? 'selected expense-bg' : ''} onClick={() => setKind('expense')}>Saída</button></div><input type="hidden" name="kind" value={kind} /><label>Valor<input name="amount" type="text" inputMode="decimal" defaultValue={initial ? formatMoneyInput(initial.amount) : ''} onChange={event => { event.currentTarget.value = formatMoneyInput(event.currentTarget.value) }} placeholder="0,00" required autoFocus /></label><label>Descrição<input name="description" defaultValue={initial?.description} placeholder="Ex.: Mercado" required /></label><div className="form-grid"><Fields data={data} kind={kind} /><label>Data<input name="date" type="date" defaultValue={initial?.date || today()} required /></label><label>Status<select name="status" defaultValue={initial?.status || 'paid'}><option value="paid">Pago/Recebido</option><option value="pending">Pendente</option></select></label></div><button className="primary full">Salvar lançamento</button></form> }
function FixedForm({ data, initial, onSubmit }: { data: Data; initial?: Fixed; onSubmit: (f: HTMLFormElement) => void }) { return <form className="form" onSubmit={e => { e.preventDefault(); onSubmit(e.currentTarget) }}><label>Nome<input name="name" defaultValue={initial?.name} placeholder="Internet, energia..." required /></label><div className="form-grid"><label>Valor<input name="amount" type="text" inputMode="decimal" defaultValue={initial ? formatMoneyInput(initial.amount) : ''} onChange={event => { event.currentTarget.value = formatMoneyInput(event.currentTarget.value) }} placeholder="0,00" required /></label><label>Vencimento<input name="due" type="number" min="1" max="31" defaultValue={initial?.due || 10} required /></label><label>Categoria<select name="category" defaultValue={initial?.category || 'Contas'}><option>Contas</option><option>Moradia</option><option>Assinaturas</option><option>Casa</option></select></label><label>Recorrência<select name="recurrence" defaultValue={initial?.recurrence || 'Mensal'}><option>Mensal</option><option>Semanal</option><option>Anual</option></select></label><label>Conta<select name="accountId" defaultValue={initial?.accountId} required>{data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Pagamento<select name="method" defaultValue={initial?.method || 'Pix'}>{paymentMethods.map(method => <option key={method}>{method}</option>)}</select></label></div><button className="primary full">Salvar conta</button></form> }
function GoalForm({ initial, onSubmit }: { data: Data; initial?: Goal; onSubmit: (g: Omit<Goal, 'id'>) => void }) { const [g, setG] = useState({ name: initial?.name || '', target: initial ? formatMoneyInput(initial.target) : '', current: initial ? formatMoneyInput(initial.current) : '', monthly: initial ? formatMoneyInput(initial.monthly) : '', deadline: initial?.deadline || '', priority: initial?.priority || 'Média' }); return <form className="form" onSubmit={e => { e.preventDefault(); onSubmit({ ...g, target: parseMoney(g.target), current: parseMoney(g.current || '0'), monthly: parseMoney(g.monthly || '0') }) }}><label>Nome<input value={g.name} onChange={e => setG({ ...g, name: e.target.value })} required /></label><div className="form-grid"><label>Valor da meta<input type="text" inputMode="decimal" placeholder="0,00" value={g.target} onChange={e => setG({ ...g, target: formatMoneyInput(e.target.value) })} required /></label><label>Já tenho<input type="text" inputMode="decimal" placeholder="0,00" value={g.current} onChange={e => setG({ ...g, current: formatMoneyInput(e.target.value) })} /></label><label>Guardar por mês<input type="text" inputMode="decimal" placeholder="0,00" value={g.monthly} onChange={e => setG({ ...g, monthly: formatMoneyInput(e.target.value) })} /></label><label>Prazo<input type="date" value={g.deadline} onChange={e => setG({ ...g, deadline: e.target.value })} /></label><label>Prioridade<select value={g.priority} onChange={e => setG({ ...g, priority: e.target.value })}><option>Alta</option><option>Média</option><option>Baixa</option></select></label></div><button className="primary full">Salvar meta</button></form> }
function AccountForm({ onSubmit }: { onSubmit: (a: Omit<Account, 'id'>) => void }) { const [a, setA] = useState({ name: '', type: 'Conta corrente', balance: '' }); return <form className="form" onSubmit={e => { e.preventDefault(); onSubmit({ ...a, balance: parseMoney(a.balance), active: true }) }}><label>Nome<input value={a.name} onChange={e => setA({ ...a, name: e.target.value })} placeholder="Conta principal" required /></label><label>Tipo<select value={a.type} onChange={e => setA({ ...a, type: e.target.value })}><option>Conta corrente</option><option>Dinheiro</option><option>Carteira digital</option><option>Poupança</option></select></label><label>Saldo inicial<input type="text" inputMode="decimal" placeholder="0,00" value={a.balance} onChange={e => setA({ ...a, balance: formatMoneyInput(e.target.value) })} /></label><button className="primary full">Salvar conta</button></form> }
function CardForm({ onSubmit }: { onSubmit: (c: Omit<Card, 'id'>) => void }) { const [c, setC] = useState({ name: '', limit: '', closing: 1, due: 10 }); return <form className="form" onSubmit={e => { e.preventDefault(); onSubmit({ ...c, limit: parseMoney(c.limit) }) }}><label>Nome<input value={c.name} onChange={e => setC({ ...c, name: e.target.value })} placeholder="Meu cartão" required /></label><label>Limite<input type="text" inputMode="decimal" placeholder="0,00" value={c.limit} onChange={e => setC({ ...c, limit: formatMoneyInput(e.target.value) })} required /></label><div className="form-grid"><label>Fechamento<input type="number" min="1" max="31" value={c.closing} onChange={e => setC({ ...c, closing: Number(e.target.value) })} /></label><label>Vencimento<input type="number" min="1" max="31" value={c.due} onChange={e => setC({ ...c, due: Number(e.target.value) })} /></label></div><button className="primary full">Salvar cartão</button></form> }
function InstallmentForm({ data, onSubmit }: { data: Data; onSubmit: (i: Omit<Installment, 'id' | 'current'>) => void }) { const [i, setI] = useState({ cardId: data.cards[0]?.id || '', description: '', amount: '', total: 1, date: today() }); return <form className="form" onSubmit={e => { e.preventDefault(); onSubmit({ ...i, amount: parseMoney(i.amount) }) }}><label>Cartão<select value={i.cardId} onChange={e => setI({ ...i, cardId: e.target.value })}>{data.cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Descrição<input value={i.description} onChange={e => setI({ ...i, description: e.target.value })} required /></label><div className="form-grid"><label>Valor total<input type="text" inputMode="decimal" placeholder="0,00" value={i.amount} onChange={e => setI({ ...i, amount: formatMoneyInput(e.target.value) })} required /></label><label>Parcelas<input type="number" min="1" value={i.total} onChange={e => setI({ ...i, total: Number(e.target.value) })} /></label><label>Primeiro vencimento<input type="date" value={i.date} onChange={e => setI({ ...i, date: e.target.value })} /></label></div><button className="primary full">Criar parcelas</button></form> }
function Onboarding({ data, onDone }: { data: Data; onDone: (d: Data) => void }) { const [salary, setSalary] = useState(''); const [mealAllowance, setMealAllowance] = useState(''); const [saving, setSaving] = useState(''); return <form className="form" onSubmit={e => { e.preventDefault(); const netSalary = parseMoney(salary); const parsedMealAllowance = parseMoney(mealAllowance || '0'); const savings = parseMoney(saving || '0'); if (!finiteNonNegative(netSalary) || !finiteNonNegative(parsedMealAllowance) || !finiteNonNegative(savings) || savings > 100) return; onDone({ ...data, netSalary, mealAllowance: parsedMealAllowance, savings }) }}><label>Salário líquido mensal<input type="number" min="0" step="0.01" value={salary} onChange={e => setSalary(e.target.value)} autoFocus required /></label><label>Vale-alimentação mensal<input type="number" min="0" step="0.01" value={mealAllowance} onChange={e => setMealAllowance(e.target.value)} placeholder="Opcional" /></label><label>Percentual que deseja guardar<input type="number" min="0" max="100" value={saving} onChange={e => setSaving(e.target.value)} placeholder="Ex.: 20" /></label><button className="primary full">Começar</button></form> }
