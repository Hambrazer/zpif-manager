import { withAuth } from 'next-auth/middleware'

export default withAuth({
  callbacks: {
    authorized: ({ token }) => token !== null,
  },
})

export const config = {
  matcher: [
    /*
     * Защищаем всё, кроме:
     * - /login  (страница входа)
     * - /api/auth/*  (NextAuth обработчики)
     * - _next/static, _next/image  (статика Next.js)
     * - favicon.ico
     */
    '/((?!login|api/auth|_next/static|_next/image|favicon\\.ico).*)',
  ],
}
