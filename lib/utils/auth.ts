import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function requireAuth(): Promise<Response | null> {
  const session = await getServerSession(authOptions)
  if (!session) {
    return Response.json({ error: 'Не авторизован' }, { status: 401 })
  }
  return null
}
