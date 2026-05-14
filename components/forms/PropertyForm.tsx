'use client'

import { useState } from 'react'

type PropertyType = 'OFFICE' | 'WAREHOUSE' | 'RETAIL' | 'MIXED' | 'RESIDENTIAL'
type TerminalType = 'EXIT_CAP_RATE' | 'GORDON'

const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  OFFICE: 'Офис',
  WAREHOUSE: 'Склад',
  RETAIL: 'Торговый',
  MIXED: 'Смешанный',
  RESIDENTIAL: 'Жилой',
}

const TERMINAL_TYPE_LABELS: Record<TerminalType, string> = {
  EXIT_CAP_RATE: 'Cap Rate выхода',
  GORDON: 'Модель Гордона',
}

export type PropertyData = {
  id: string
  fundId: string
  name: string
  type: PropertyType
  address: string
  totalArea: number
  rentableArea: number
  cadastralValue: number | null
  landCadastralValue: number | null
  propertyTaxRate: number
  landTaxRate: number
  opexRate: number
  maintenanceRate: number
  acquisitionPrice: number | null
  purchaseDate: string | null
  saleDate: string | null
  exitCapRate: number | null
  wacc: number
  projectionYears: number
  terminalType: TerminalType
  gordonGrowthRate: number | null
}

type Props = {
  fundId: string
  initialData?: PropertyData
  onSuccess: (property: PropertyData) => void
  onCancel?: () => void
}

type FormState = {
  name: string
  type: PropertyType
  address: string
  totalArea: string
  rentableArea: string
  cadastralValue: string
  landCadastralValue: string
  propertyTaxRate: string
  landTaxRate: string
  opexRate: string
  maintenanceRate: string
  acquisitionPrice: string
  purchaseDate: string
  saleDate: string
  exitCapRate: string
  wacc: string
  projectionYears: string
  terminalType: TerminalType
  gordonGrowthRate: string
}

function toDateInput(isoStr: string): string {
  return isoStr.slice(0, 10)
}

function toFormState(data: PropertyData): FormState {
  return {
    name: data.name,
    type: data.type,
    address: data.address,
    totalArea: String(data.totalArea),
    rentableArea: String(data.rentableArea),
    cadastralValue: data.cadastralValue != null ? String(data.cadastralValue) : '',
    landCadastralValue: data.landCadastralValue != null ? String(data.landCadastralValue) : '',
    propertyTaxRate: String(+(data.propertyTaxRate * 100).toFixed(4)),
    landTaxRate: String(+(data.landTaxRate * 100).toFixed(4)),
    opexRate: String(data.opexRate),
    maintenanceRate: String(data.maintenanceRate),
    acquisitionPrice: data.acquisitionPrice != null ? String(data.acquisitionPrice) : '',
    purchaseDate: data.purchaseDate ? toDateInput(data.purchaseDate) : '',
    saleDate: data.saleDate ? toDateInput(data.saleDate) : '',
    exitCapRate: data.exitCapRate != null ? String(+(data.exitCapRate * 100).toFixed(4)) : '',
    wacc: String(+(data.wacc * 100).toFixed(4)),
    projectionYears: String(data.projectionYears),
    terminalType: data.terminalType,
    gordonGrowthRate: data.gordonGrowthRate != null ? String(+(data.gordonGrowthRate * 100).toFixed(4)) : '',
  }
}

const emptyState: FormState = {
  name: '',
  type: 'OFFICE',
  address: '',
  totalArea: '',
  rentableArea: '',
  cadastralValue: '',
  landCadastralValue: '',
  propertyTaxRate: '',
  landTaxRate: '',
  opexRate: '',
  maintenanceRate: '',
  acquisitionPrice: '',
  purchaseDate: '',
  saleDate: '',
  exitCapRate: '',
  wacc: '',
  projectionYears: '10',
  terminalType: 'EXIT_CAP_RATE',
  gordonGrowthRate: '',
}

const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

export function PropertyForm({ fundId, initialData, onSuccess, onCancel }: Props) {
  const [form, setForm] = useState<FormState>(
    initialData ? toFormState(initialData) : emptyState
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = Boolean(initialData?.id)

  function set(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const totalArea = parseFloat(form.totalArea)
    const rentableArea = parseFloat(form.rentableArea)
    const propertyTaxRate = parseFloat(form.propertyTaxRate)
    const landTaxRate = parseFloat(form.landTaxRate)
    const opexRate = parseFloat(form.opexRate)
    const maintenanceRate = parseFloat(form.maintenanceRate)
    const wacc = parseFloat(form.wacc)

    if (!form.name.trim()) { setError('Укажите название объекта'); return }
    if (!form.address.trim()) { setError('Укажите адрес'); return }
    if (isNaN(totalArea) || totalArea <= 0) { setError('Укажите корректную общую площадь'); return }
    if (isNaN(rentableArea) || rentableArea <= 0) { setError('Укажите корректную арендопригодную площадь'); return }
    if (rentableArea > totalArea) { setError('Арендопригодная площадь не может превышать общую'); return }
    if (isNaN(propertyTaxRate) || propertyTaxRate < 0) { setError('Укажите ставку налога на имущество'); return }
    if (isNaN(landTaxRate) || landTaxRate < 0) { setError('Укажите ставку налога на ЗУ'); return }
    if (isNaN(opexRate) || opexRate < 0) { setError('Укажите ставку OPEX'); return }
    if (isNaN(maintenanceRate) || maintenanceRate < 0) { setError('Укажите ставку эксплуатационных расходов'); return }
    if (isNaN(wacc) || wacc < 0) { setError('Укажите ставку дисконтирования (WACC)'); return }

    const cadastralValue = form.cadastralValue !== '' ? parseFloat(form.cadastralValue) : null
    const landCadastralValue = form.landCadastralValue !== '' ? parseFloat(form.landCadastralValue) : null
    const acquisitionPrice = form.acquisitionPrice !== '' ? parseFloat(form.acquisitionPrice) : null
    const exitCapRate = form.exitCapRate !== '' ? parseFloat(form.exitCapRate) : null
    const projectionYears = parseInt(form.projectionYears, 10)
    const gordonGrowthRate = form.gordonGrowthRate !== '' ? parseFloat(form.gordonGrowthRate) : null

    if (cadastralValue !== null && isNaN(cadastralValue)) { setError('Кадастровая стоимость здания указана некорректно'); return }
    if (landCadastralValue !== null && isNaN(landCadastralValue)) { setError('Кадастровая стоимость ЗУ указана некорректно'); return }
    if (acquisitionPrice !== null && isNaN(acquisitionPrice)) { setError('Цена приобретения указана некорректно'); return }
    if (exitCapRate !== null && isNaN(exitCapRate)) { setError('Cap Rate выхода указан некорректно'); return }
    if (isNaN(projectionYears) || projectionYears < 1) { setError('Укажите горизонт DCF (≥ 1 год)'); return }
    if (form.terminalType === 'GORDON' && (gordonGrowthRate === null || isNaN(gordonGrowthRate))) {
      setError('Для модели Гордона укажите темп роста, %'); return
    }

    const body = {
      fundId,
      name: form.name.trim(),
      type: form.type,
      address: form.address.trim(),
      totalArea,
      rentableArea,
      cadastralValue,
      landCadastralValue,
      propertyTaxRate: propertyTaxRate / 100,
      landTaxRate: landTaxRate / 100,
      opexRate,
      maintenanceRate,
      acquisitionPrice,
      purchaseDate: form.purchaseDate ? new Date(form.purchaseDate).toISOString() : null,
      saleDate: form.saleDate ? new Date(form.saleDate).toISOString() : null,
      exitCapRate: exitCapRate !== null ? exitCapRate / 100 : null,
      wacc: wacc / 100,
      projectionYears,
      terminalType: form.terminalType,
      gordonGrowthRate: form.terminalType === 'GORDON' && gordonGrowthRate !== null
        ? gordonGrowthRate / 100
        : null,
    }

    setLoading(true)
    try {
      const url = isEdit ? `/api/properties/${initialData!.id}` : '/api/properties'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = await res.json() as { data?: PropertyData; error?: string }

      if (!res.ok) {
        setError(json.error ?? 'Ошибка сервера')
        return
      }

      onSuccess(json.data!)
    } catch {
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Основная информация */}
      <div className="space-y-3">
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
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>
              Тип объекта <span className="text-red-500">*</span>
            </label>
            <select
              value={form.type}
              onChange={e => set('type', e.target.value as PropertyType)}
              className={inputCls + ' bg-white'}
              disabled={loading}
            >
              {(Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[]).map(t => (
                <option key={t} value={t}>{PROPERTY_TYPE_LABELS[t]}</option>
              ))}
            </select>
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
        </div>
      </div>

      {/* Площадь */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>
            Общая площадь, м² <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={form.totalArea}
            onChange={e => set('totalArea', e.target.value)}
            placeholder="12500"
            min="0"
            step="0.1"
            className={inputCls}
            disabled={loading}
          />
        </div>
        <div>
          <label className={labelCls}>
            Арендопригодная площадь (GLA), м² <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={form.rentableArea}
            onChange={e => set('rentableArea', e.target.value)}
            placeholder="10800"
            min="0"
            step="0.1"
            className={inputCls}
            disabled={loading}
          />
        </div>
      </div>

      {/* Приобретение и продажа */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Приобретение и продажа</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Цена приобретения, ₽</label>
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
        </div>
        <div>
          <label className={labelCls}>Дата продажи</label>
          <input
            type="date"
            value={form.saleDate}
            onChange={e => set('saleDate', e.target.value)}
            className={inputCls}
            disabled={loading}
          />
        </div>
      </div>

      {/* DCF параметры */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">DCF параметры</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>
              WACC (ставка дисконтирования), % <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.wacc}
              onChange={e => set('wacc', e.target.value)}
              placeholder="12"
              min="0"
              step="0.01"
              className={inputCls}
              disabled={loading}
            />
          </div>
          <div>
            <label className={labelCls}>
              Горизонт DCF, лет <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.projectionYears}
              onChange={e => set('projectionYears', e.target.value)}
              placeholder="10"
              min="1"
              step="1"
              className={inputCls}
              disabled={loading}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>
              Метод терминальной стоимости <span className="text-red-500">*</span>
            </label>
            <select
              value={form.terminalType}
              onChange={e => set('terminalType', e.target.value as TerminalType)}
              className={inputCls + ' bg-white'}
              disabled={loading}
            >
              {(Object.keys(TERMINAL_TYPE_LABELS) as TerminalType[]).map(t => (
                <option key={t} value={t}>{TERMINAL_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          {form.terminalType === 'EXIT_CAP_RATE' ? (
            <div>
              <label className={labelCls}>Cap Rate выхода, %</label>
              <input
                type="number"
                value={form.exitCapRate}
                onChange={e => set('exitCapRate', e.target.value)}
                placeholder="8"
                min="0"
                step="0.01"
                className={inputCls}
                disabled={loading}
              />
            </div>
          ) : (
            <div>
              <label className={labelCls}>
                Темп роста (g), % <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={form.gordonGrowthRate}
                onChange={e => set('gordonGrowthRate', e.target.value)}
                placeholder="3"
                step="0.01"
                className={inputCls}
                disabled={loading}
              />
            </div>
          )}
        </div>
      </div>

      {/* Кадастровая стоимость и налоги */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Кадастровая стоимость и налоги</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Кадастровая стоимость здания, ₽</label>
            <input
              type="number"
              value={form.cadastralValue}
              onChange={e => set('cadastralValue', e.target.value)}
              placeholder="1 850 000 000"
              min="0"
              step="1"
              className={inputCls}
              disabled={loading}
            />
          </div>
          <div>
            <label className={labelCls}>
              Налог на имущество, % <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.propertyTaxRate}
              onChange={e => set('propertyTaxRate', e.target.value)}
              placeholder="2"
              min="0"
              step="0.01"
              className={inputCls}
              disabled={loading}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Кадастровая стоимость ЗУ, ₽</label>
            <input
              type="number"
              value={form.landCadastralValue}
              onChange={e => set('landCadastralValue', e.target.value)}
              placeholder="350 000 000"
              min="0"
              step="1"
              className={inputCls}
              disabled={loading}
            />
          </div>
          <div>
            <label className={labelCls}>
              Налог на ЗУ, % <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.landTaxRate}
              onChange={e => set('landTaxRate', e.target.value)}
              placeholder="0.3"
              min="0"
              step="0.01"
              className={inputCls}
              disabled={loading}
            />
          </div>
        </div>
      </div>

      {/* Операционные расходы */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Операционные расходы</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>
              OPEX, ₽/м²/год <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.opexRate}
              onChange={e => set('opexRate', e.target.value)}
              placeholder="2000"
              min="0"
              step="1"
              className={inputCls}
              disabled={loading}
            />
          </div>
          <div>
            <label className={labelCls}>
              Эксплуатация, ₽/м²/год <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.maintenanceRate}
              onChange={e => set('maintenanceRate', e.target.value)}
              placeholder="1500"
              min="0"
              step="1"
              className={inputCls}
              disabled={loading}
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Добавить объект'}
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
