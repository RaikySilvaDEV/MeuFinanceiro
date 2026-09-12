import type { Data, User } from '../domain/types'

type AuthResponse = { user: User; token: string }

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const body = await response.text()
  let payload: unknown
  try {
    payload = body ? JSON.parse(body) : undefined
  } catch {
    throw new Error(response.ok ? 'A resposta da API é inválida.' : 'A API não está disponível neste endereço. Verifique a configuração do deploy.')
  }
  if (!response.ok) throw new Error((payload as { message?: string } | undefined)?.message || 'Não foi possível concluir a operação.')
  return payload as T
}

export const api = {
  register: (name: string, email: string, password: string) => request<AuthResponse>('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  login: (email: string, password: string) => request<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  changePassword: (token: string, currentPassword: string, newPassword: string) => request<void>('/api/auth/change-password', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ currentPassword, newPassword }) }),
  loadData: (token: string) => request<Data>('/api/data', { headers: { Authorization: `Bearer ${token}` } }),
  saveData: (token: string, data: Data) => request<void>('/api/data', { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(data) }),
}
