import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from './db.js'

const app = express()
const port = Number(process.env.PORT || 3001)
const jwtSecret = process.env.JWT_SECRET

if (!jwtSecret) throw new Error('JWT_SECRET is required to start the API.')

app.use(cors({ origin: process.env.WEB_ORIGIN || 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use((request, _response, next) => {
  if (!request.url.startsWith('/api/')) request.url = `/api${request.url}`
  next()
})

type AuthRequest = express.Request & { userId?: string }
const authenticate = (request: AuthRequest, response: express.Response, next: express.NextFunction) => {
  const token = request.headers.authorization?.replace('Bearer ', '')
  if (!token) return response.status(401).json({ message: 'Autenticação necessária.' })
  try {
    const payload = jwt.verify(token, jwtSecret) as { sub?: string }
    if (!payload.sub) return response.status(401).json({ message: 'Sessão inválida.' })
    request.userId = payload.sub
    next()
  } catch {
    return response.status(401).json({ message: 'Sessão expirada.' })
  }
}

app.get('/api/health', async (_request, response) => {
  await pool.query('SELECT 1')
  response.json({ ok: true })
})

app.post('/api/auth/register', async (request, response) => {
  const { name, email, password } = request.body as { name?: string; email?: string; password?: string }
  if (!name?.trim() || !email?.trim() || !password || password.length < 8) return response.status(400).json({ message: 'Nome, e-mail e senha com pelo menos 8 caracteres são obrigatórios.' })
  const normalizedEmail = email.trim().toLowerCase()
  const passwordHash = await bcrypt.hash(password, 12)
  try {
    const result = await pool.query('INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email', [name.trim(), normalizedEmail, passwordHash])
    const user = result.rows[0]
    await pool.query('INSERT INTO finance_data (user_id, data) VALUES ($1, $2)', [user.id, JSON.stringify({})])
    const token = jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: '7d' })
    response.status(201).json({ user, token })
  } catch (error) {
    if ((error as { code?: string }).code === '23505') return response.status(409).json({ message: 'Este e-mail já está cadastrado.' })
    throw error
  }
})

app.post('/api/auth/login', async (request, response) => {
  const { email, password } = request.body as { email?: string; password?: string }
  const result = await pool.query('SELECT id, name, email, password_hash FROM users WHERE email = $1', [email?.trim().toLowerCase()])
  const user = result.rows[0]
  if (!user || !password || !(await bcrypt.compare(password, user.password_hash))) return response.status(401).json({ message: 'E-mail ou senha inválidos.' })
  const token = jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: '7d' })
  response.json({ user: { id: user.id, name: user.name, email: user.email }, token })
})

app.post('/api/auth/change-password', authenticate, async (request: AuthRequest, response) => {
  const { currentPassword, newPassword } = request.body as { currentPassword?: string; newPassword?: string }
  if (!currentPassword || !newPassword || newPassword.length < 8) return response.status(400).json({ message: 'A nova senha deve ter pelo menos 8 caracteres.' })
  const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [request.userId])
  const user = result.rows[0]
  if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) return response.status(401).json({ message: 'A senha atual está incorreta.' })
  const passwordHash = await bcrypt.hash(newPassword, 12)
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, request.userId])
  response.status(204).end()
})

app.get('/api/data', authenticate, async (request: AuthRequest, response) => {
  const result = await pool.query('SELECT data FROM finance_data WHERE user_id = $1', [request.userId])
  response.json(result.rows[0]?.data || {})
})

app.put('/api/data', authenticate, async (request: AuthRequest, response) => {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) return response.status(400).json({ message: 'Dados inválidos.' })
  const result = await pool.query('INSERT INTO finance_data (user_id, data, updated_at) VALUES ($2, $1, NOW()) ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW() RETURNING user_id', [JSON.stringify(request.body), request.userId])
  if (!result.rowCount) return response.status(500).json({ message: 'Não foi possível persistir os dados.' })
  response.status(204).end()
})

export default app

if (!process.env.VERCEL) {
  app.listen(port, () => console.log(`API running on http://localhost:${port}`))
}
