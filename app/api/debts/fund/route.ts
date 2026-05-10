import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'

export async function GET(req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const fundId = searchParams.get('fundId')

  try {
    const debts = await prisma.fundDebt.findMany({
      ...(fundId ? { where: { fundId } } : {}),
      orderBy: { startDate: 'asc' },
    })
    return Response.json({ data: debts })
  } catch {
    return Response.json({ error: 'Ошибка получения долгов фонда' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const body: unknown = await req.json()
    const b = body as Record<string, unknown>

    if (
      typeof body !== 'object' || body === null ||
      typeof b['fundId'] !== 'string' ||
      typeof b['lenderName'] !== 'string' ||
      typeof b['principalAmount'] !== 'number' ||
      typeof b['interestRate'] !== 'number' ||
      typeof b['startDate'] !== 'string' ||
      typeof b['endDate'] !== 'string' ||
      typeof b['amortizationType'] !== 'string'
    ) {
      return Response.json({ error: 'Некорректные данные' }, { status: 400 })
    }

    const debt = await prisma.fundDebt.create({
      data: {
        fundId: b['fundId'] as string,
        lenderName: b['lenderName'] as string,
        principalAmount: b['principalAmount'] as number,
        interestRate: b['interestRate'] as number,
        startDate: new Date(b['startDate'] as string),
        endDate: new Date(b['endDate'] as string),
        amortizationType: b['amortizationType'] as Parameters<typeof prisma.fundDebt.create>[0]['data']['amortizationType'],
      },
    })

    return Response.json({ data: debt }, { status: 201 })
  } catch {
    return Response.json({ error: 'Ошибка создания долга фонда' }, { status: 500 })
  }
}
