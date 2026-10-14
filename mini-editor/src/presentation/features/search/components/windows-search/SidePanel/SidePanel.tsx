import { ClockWidget } from './ClockWidget'
import { PinnedApps } from './PinnedApps'
import { RecentFiles } from './RecentFiles'
import type { SearchItem } from '../types'

interface SidePanelProps {
  items: SearchItem[]
}

export function SidePanel({ items }: SidePanelProps) {
  const pinned = items.slice(0, 8)
  const recent = items.slice(12, 16)

  return (
    <div className="w-[280px] bg-zinc-50 flex flex-col p-4">
      <ClockWidget />

      <PinnedApps items={pinned} />

      <RecentFiles items={recent} />
    </div>
  )
}
