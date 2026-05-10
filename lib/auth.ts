import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Пароль', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const adminEmail = process.env['ADMIN_EMAIL']
        const adminPasswordHash = process.env['ADMIN_PASSWORD_HASH']

        if (!adminEmail || !adminPasswordHash) {
          throw new Error('Переменные ADMIN_EMAIL и ADMIN_PASSWORD_HASH не настроены')
        }

        if (credentials.email !== adminEmail) {
          return null
        }

        const passwordMatch = await bcrypt.compare(credentials.password, adminPasswordHash)
        if (!passwordMatch) {
          return null
        }

        return { id: '1', email: adminEmail, name: 'Admin' }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: '/login',
  },
}
