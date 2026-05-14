'use client'

import { useState } from 'react'
import { CashflowChart } from '@/components/charts/CashflowChart'
import { ReturnChart } from '@/components/charts/ReturnChart'
import type { ReturnPoint } from '@/components/charts/ReturnChart'
import type { MonthlyCashflow } from '@/lib/types'

type Mode = 'cashflow' | 'returns'

type Props = {
  cashflows: MonthlyCashflow[]
  returnPoints: ReturnPoint[]
}

export function FundChartsBlock({ cashflows, returnPoints }: Props) {
  const [mode, setMode] = useState<Mode>('cashflow')

  const tabs: { id: Mode; label: string }[] = [
    { id: 'cashflow', label: 'Денежный поток' },
    { id: 'returns', label: 'Доходность по годам' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-gray-200 pb-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMode(tab.id)}
            className={[
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              mode === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === 'cashflow' ? (
        <CashflowChart cashflows={cashflows} />
      ) : (
        <ReturnChart data={returnPoints} />
      )}
    </div>
  )
}
