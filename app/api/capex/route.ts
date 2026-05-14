import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'

export async function GET(req: Request) {
  const authError = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const propertyId = searchParams.get('propertyId')

  try {
    const items = await prisma.capexItem.findMany({
      ...(propertyId ? { where: { propertyId } } : {}),
      orderBy: { plannedDate: 'asc' },
    })
    return Response.json({ data: items })
  } catch {
    return Response.json({ error: 'Ошибка получения CAPEX' }, { status: 500 })
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
      typeof b['propertyId'] !== 'string' ||
      typeof b['name'] !== 'string' ||
      typeof b['amount'] !== 'number' ||
      typeof b['plannedDate'] !== 'string'
    ) {
      return Response.json({ error: 'Некорректные данные' }, { status: 400 })
    }

    const item = await prisma.capexItem.create({
      data: {
        propertyId: b['propertyId'] as string,
        name: b['name'] as string,
        amount: b['amount'] as number,
        plannedDate: new Date(b['plannedDate'] as string),
        ...(typeof b['notes'] === 'string' ? { notes: b['notes'] } : {}),
      },
    })

    return Response.json({ data: item }, { status: 201 })
  } catch {
    return Response.json({ error: 'Ошибка создания CAPEX' }, { status: 500 })
  }
}
