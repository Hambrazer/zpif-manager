'use client'

import { useState } from 'react'

// V3.6.1: минимальный wizard создания объекта. Шаг 1 — этот компонент,
// шаг 2 — вкладка «Основное» на странице объекта (V3.6.2). Здесь
// собираем только базовые поля; остальные параметры объекта приходят
// с дефолтными значениями и редактируются позже в Основном.

type Props = {
  fundId: string
  onSuccess: (propertyId: string) => void
  onCancel?: () => void
}

type FormState = {
  name: string
  address: string
  area: string
  purchaseDate: string
  acquisitionPrice: string
}

const emptyState: FormState = {
  name: '',
  address: '',
  area: '',
  purchaseDate: '',
  acquisitionPrice: '',
}

const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

// Дефолты для полей, которые требует API но не показываются в wizard.
// Пользователь редактирует их позже на вкладке «Основное».
const DEFAULTS = {
  type: 'OFFICE' as const,
  propertyTaxRate: 0.022,   // 2.2% — стандартная ставка налога на имущество
  landTaxRate:     0.003,   // 0.3%
  opexRate:        0,
  maintenanceRate: 0,
  wacc:            0.12,    // 12%
}

export function PropertyCreateForm({ fundId, onSuccess, onCancel }: Props) {
  const [form, setForm]       = useState<FormState>(emptyState)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  function set<K extends keyof FormState>(field: K, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const area = parseFloat(form.area)
    if (!form.name.trim()) { setError('Укажите название объекта'); return }
    if (!form.address.trim()) { setError('Укажите адрес'); return }
    if (isNaN(area) || area <= 0) { setError('Укажите корректную площадь'); return }

    const acquisitionPrice = form.acquisitionPrice !== '' ? parseFloat(form.acquisitionPrice) : null
    if (acquisitionPrice !== null && isNaN(acquisitionPrice)) {
      setError('Стоимость покупки указана некорректно'); return
    }

    const body = {
      fundId,
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
      onSuccess(json.data.id)
    } catch {
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs text-gray-500">
        Это шаг 1 — минимальные данные. После создания вы перейдёте на страницу
        объекта, где сможете заполнить остальные параметры.
      </p>

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

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Создание…' : 'Создать и перейти к объекту'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Отмена
          </button>
        )}
      </div>
    </form>
  )
}
