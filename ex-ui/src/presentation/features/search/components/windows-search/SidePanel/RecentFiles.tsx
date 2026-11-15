import { FileTextOutlined } from '@ant-design/icons'
import type { SearchItem } from '../types'

interface RecentFilesProps {
  items: SearchItem[]
}

export function RecentFiles({ items }: RecentFilesProps) {
  return (
    <section className="mb-6">
      <h2 className="text-xs font-semibold text-zinc-700 mb-3">Recent</h2>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-zinc-200/50 cursor-pointer text-zinc-700 text-xs">
            <FileTextOutlined style={{ fontSize: 14 }} /> {item.title}
          </div>
        ))}
      </div>
    </section>
  )
}
