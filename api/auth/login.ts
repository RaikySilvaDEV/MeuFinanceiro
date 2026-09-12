import 'dotenv/config'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { Request, Response } from 'express'
import { pool } from '../../server/db.js'

export default async function login(request: Request, response: Response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ message: 'Método não permitido.' })
  }

  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) return response.status(500).json({ message: 'JWT_SECRET não configurado.' })

  const { email, password } = request.body as { email?: string; password?: string }
  const result = await pool.query('SELECT id, name, email, password_hash FROM users WHERE email = $1', [email?.trim().toLowerCase()])
  const user = result.rows[0]
  if (!user || !password || !(await bcrypt.compare(password, user.password_hash))) {
    return response.status(401).json({ message: 'E-mail ou senha inválidos.' })
  }

  const token = jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: '7d' })
  return response.json({ user: { id: user.id, name: user.name, email: user.email }, token })
}
