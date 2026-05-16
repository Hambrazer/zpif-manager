'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// V4.10.2 — создание нового объекта сразу в фонде. Открывается из
// AddPropertyChoiceModal (ветка «Новый объект»).
//
// Поля — те же, что в шаге 1 wizard'а из pipeline (PropertyCreateForm, V3.6.1),
// + дополнительное «% владения» (default 100). Остальные параметры
// (тип, ставки налогов, OPEX, WACC) подставляются дефолтами и редактируются
// позже на вкладке «Основное» нового объекта.
//
// Submit — один POST /api/properties с {fundId, ownershipPct}. API в одной
// транзакции создаёт Property и FundProperty, ставит pipelineStatus=IN_FUND
// (логика существует с V3.8.4). Это эффективнее и атомарнее, чем два запроса.
//
// После успеха — redirect на /properties/[id]?tab=basic, чтобы пользователь
// сразу дозаполнил основное.

type Props = {
  fundId: string
  onClose: () => void
}

type FormState = {
  name: string
  address: string
  area: string
  purchaseDate: string
  acquisitionPrice: string
  ownershipPct: string
}

const emptyState: FormState = {
  name: '',
  address: '',
  area: '',
  purchaseDate: '',
  acquisitionPrice: '',
  ownershipPct: '100',
}

const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

// Дефолты для полей, которые требует API, но не показываются в wizard.
// Те же, что в PropertyCreateForm (V3.6.1).
const DEFAULTS = {
  type: 'OFFICE' as const,
  propertyTaxRate: 0.022,   // 2.2%
  landTaxRate:     0.003,   // 0.3%
  opexRate:        0,
  maintenanceRate: 0,
  wacc:            0.12,    // 12%
}

export function CreatePropertyInFundModal({ fundId, onClose }: Props) {
  const router = useRouter()
  const [form, setForm]       = useState<FormState>(emptyState)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, loading])

  function set<K extends keyof FormState>(field: K, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!form.name.trim())    { setError('Укажите название объекта'); return }
    if (!form.address.trim()) { setError('Укажите адрес');           return }

    const area = parseFloat(form.area)
    if (isNaN(area) || area <= 0) { setError('Укажите корректную площадь'); return }

    const acquisitionPrice = form.acquisitionPrice !== '' ? parseFloat(form.acquisitionPrice) : null
    if (acquisitionPrice !== null && isNaN(acquisitionPrice)) {
      setError('Стоимость покупки указана некорректно'); return
    }

    const ownershipPct = parseFloat(form.ownershipPct)
    if (isNaN(ownershipPct) || ownershipPct <= 0 || ownershipPct > 100) {
      setError('% владения должен быть в диапазоне 0–100'); return
    }

    const body = {
      fundId,
      ownershipPct,
      name:    form.name.trim(),
      address: form.address.trim(),
      type:    DEFAULTS.type,
      totalArea:    area,
      rentableArea: area,
      propertyTaxRate: DEFAULTS.propertyTaxRate,
      landTaxRate:     DEFAULTS.landTaxRate,
      opexRate:        DEFAULTS.opexRate,
      maintenanceRate: DEFAULTS.maintenanceRate,
      wacc:            DEFAULTS.wacc,
      acquisitionPrice,
      purchaseDate: form.purchaseDate ? new Date(form.purchaseDate).toISOString() : null,
    }

    setLoading(true)
    try {
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json() as { data?: { id: string }; error?: string }
      if (!res.ok || !json.data) {
        setError(json.error ?? 'Ошибка сервера')
        return
      }
      // V4.10.3: открыть вкладку «Основное» нового объекта.
      router.push(`/properties/${json.data.id}?tab=basic`)
    } catch {
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget && !loading) onClose() }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-900">Новый объект в фонде</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none disabled:opacity-40"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Минимальные данные. После создания откроется вкладка «Основное» для дозаполнения.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>
              Название объекта <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Бизнес-центр «Арбат Плаза»"
              className={inputCls}
              disabled={loading}
              autoFocus
            />
          </div>

          <div>
            <label className={labelCls}>
              Адрес <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.address}
              onChange={e => set('address', e.target.value)}
              placeholder="г. Москва, ул. Новый Арбат, д. 32"
              className={inputCls}
              disabled={loading}
            />
          </div>

          <div>
            <label className={labelCls}>
              Площадь, м² <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.area}
              onChange={e => set('area', e.target.value)}
              placeholder="10800"
              min="0"
              step="0.1"
              className={inputCls}
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Дата покупки</label>
              <input
                type="date"
                value={form.purchaseDate}
                onChange={e => set('purchaseDate', e.target.value)}
                className={inputCls}
                disabled={loading}
              />
            </div>
            <div>
              <label className={labelCls}>Стоимость покупки, ₽</label>
              <input
                type="number"
                value={form.acquisitionPrice}
                onChange={e => set('acquisitionPrice', e.target.value)}
                placeholder="2 100 000 000"
                min="0"
                step="1"
                className={inputCls}
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>
              % владения фонда <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.ownershipPct}
              onChange={e => set('ownershipPct', e.target.value)}
              min="0.01"
              max="100"
              step="0.01"
              className={inputCls}
              disabled={loading}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Создание…' : 'Создать и перейти к объекту'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
