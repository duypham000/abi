import { forwardRef } from 'react'
import { CategoryIcon } from '../shared/CategoryIcon'
import { CATEGORY_MAP } from '../constants'
import type { SearchItem } from '../types'

interface SearchResultItemProps {
  item: SearchItem
  isSelected: boolean
  onClick?: () => void
}

export const SearchResultItem = forwardRef<HTMLDivElement, SearchResultItemProps>(
  ({ item, isSelected, onClick }, ref) => {
    return (
      <div
        ref={ref}
        onClick={onClick}
        className={`flex items-center gap-2 p-2 rounded-lg transition-colors cursor-pointer group
          ${isSelected
            ? 'bg-blue-50 ring-1 ring-blue-400'
            : 'hover:bg-zinc-100'
          }`}
      >
        <div className={`w-8 h-8 rounded-md flex items-center justify-center border
          ${isSelected ? 'bg-blue-100 border-blue-300' : 'bg-zinc-100 border-zinc-200'}`}>
          <CategoryIcon category={item.category} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-zinc-800 truncate">{item.title}</div>
          {item.highlight ? (
            <div
              className="text-[10px] text-zinc-500 truncate [&_em]:font-semibold [&_em]:text-blue-600 [&_em]:not-italic"
              dangerouslySetInnerHTML={{ __html: item.highlight }}
            />
          ) : (
            <div className="text-[10px] text-zinc-500 truncate">{item.description}</div>
          )}
        </div>
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium uppercase shrink-0
          ${isSelected
            ? 'bg-blue-100 text-blue-600'
            : 'bg-zinc-100 text-zinc-400 group-hover:bg-white group-hover:text-zinc-600'
          }`}>
          {CATEGORY_MAP[item.category] || item.category}
        </span>
      </div>
    )
  }
)
