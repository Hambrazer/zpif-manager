'use client'

import type { ScenarioType } from '@/lib/types'

type Props = {
  available: ScenarioType[]
  active: ScenarioType
  onChange: (s: ScenarioType) => void
}

const SCENARIO_CONFIG = {
  BASE: { label: 'Base',   activeClass: 'bg-blue-600 text-white shadow-sm' },
  BULL: { label: 'Bull ↑', activeClass: 'bg-emerald-600 text-white shadow-sm' },
  BEAR: { label: 'Bear ↓', activeClass: 'bg-red-600 text-white shadow-sm' },
} satisfies Record<ScenarioType, { label: string; activeClass: string }>

const SCENARIO_ORDER = ['BASE', 'BULL', 'BEAR'] as const

export function ScenarioTabs({ available, active, onChange }: Props) {
  return (
    <div className="inline-flex gap-0.5 bg-gray-100 rounded-lg p-1" role="tablist">
      {SCENARIO_ORDER.map(type => {
        const cfg = SCENARIO_CONFIG[type]
        const isActive = active === type
        const isAvailable = available.includes(type)
        return (
          <button
            key={type}
            role="tab"
            aria-selected={isActive}
            disabled={!isAvailable}
            onClick={() => isAvailable && onChange(type)}
            className={[
              'px-4 py-1.5 rounded-md text-sm font-medium transition-all',
              isActive
                ? cfg.activeClass
                : isAvailable
                ? 'text-gray-600 hover:bg-white hover:text-gray-900 hover:shadow-sm'
                : 'text-gray-300 cursor-not-allowed',
            ].join(' ')}
          >
            {cfg.label}
          </button>
        )
      })}
    </div>
  )
}
