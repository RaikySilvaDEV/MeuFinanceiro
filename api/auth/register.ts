import 'dotenv/config'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { Request, Response } from 'express'
import { pool } from '../../server/db.js'

export default async function register(request: Request, response: Response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ message: 'Método não permitido.' })
  }

  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) return response.status(500).json({ message: 'JWT_SECRET não configurado.' })

  const { name, email, password } = request.body as { name?: string; email?: string; password?: string }
  if (!name?.trim() || !email?.trim() || !password || password.length < 8) {
    return response.status(400).json({ message: 'Nome, e-mail e senha com pelo menos 8 caracteres são obrigatórios.' })
  }

  const normalizedEmail = email.trim().toLowerCase()
  const passwordHash = await bcrypt.hash(password, 12)
  try {
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name.trim(), normalizedEmail, passwordHash],
    )
    const user = result.rows[0]
    await pool.query('INSERT INTO finance_data (user_id, data) VALUES ($1, $2)', [user.id, JSON.stringify({})])
    const token = jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: '7d' })
    return response.status(201).json({ user, token })
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      return response.status(409).json({ message: 'Este e-mail já está cadastrado.' })
    }
    throw error
  }
}
