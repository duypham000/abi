import { AppstoreOutlined } from '@ant-design/icons'
import type { SearchItem } from '../types'

interface PinnedAppsProps {
  items: SearchItem[]
}

export function PinnedApps({ items }: PinnedAppsProps) {
  return (
    <section className="mb-6">
      <h2 className="text-xs font-semibold text-zinc-700 mb-3">Pinned</h2>
      <div className="grid grid-cols-4 gap-2">
        {items.map((item) => (
          <div key={item.id} className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-zinc-200 transition-colors cursor-pointer">
            <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center shadow-sm">
              <AppstoreOutlined style={{ fontSize: 16 }} className="text-zinc-600" />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
