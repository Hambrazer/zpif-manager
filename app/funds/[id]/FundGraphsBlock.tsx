'use client'

import { useState } from 'react'
import { NavChart } from '@/components/charts/NavChart'
import { CashflowChart } from '@/components/charts/CashflowChart'
import { ReturnChart } from '@/components/charts/ReturnChart'
import type { ReturnPoint } from '@/components/charts/ReturnChart'
import type { MonthlyCashflow, NAVResult } from '@/lib/types'

// V4.6.3: единый блок графиков с переключателем 4 режимов.
// Заменяет старые блоки «Динамика СЧА и РСП» + FundChartsBlock.
type Mode = 'nav' | 'rsp' | 'cashflow' | 'returns'

type Props = {
  navData: NAVResult[]
  cashflows: MonthlyCashflow[]
  returnPoints: ReturnPoint[]
}

const TABS: { id: Mode; label: string }[] = [
  { id: 'nav',      label: 'СЧА' },
  { id: 'rsp',      label: 'РСП' },
  { id: 'cashflow', label: 'Денежный поток' },
  { id: 'returns',  label: 'Доходность по годам' },
]

export function FundGraphsBlock({ navData, cashflows, returnPoints }: Props) {
  const [mode, setMode] = useState<Mode>('nav')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMode(tab.id)}
            className={[
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
              mode === tab.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === 'nav'      && <NavChart data={navData} mode="nav" />}
      {mode === 'rsp'      && <NavChart data={navData} mode="rsp" />}
      {mode === 'cashflow' && <CashflowChart cashflows={cashflows} />}
      {mode === 'returns'  && <ReturnChart data={returnPoints} />}
    </div>
  )
}
