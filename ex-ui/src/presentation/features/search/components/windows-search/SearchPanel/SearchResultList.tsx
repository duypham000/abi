import { useEffect, useRef } from 'react'
import { SearchTabs } from './SearchTabs'
import { SearchResultItem } from './SearchResultItem'
import type { SearchItem } from '../types'

interface SearchResultListProps {
  activeTab: string
  onTabChange: (tab: string) => void
  filteredData: SearchItem[]
  selectedIndex: number
  onSelect: (item: SearchItem) => void
}

export function SearchResultList({ activeTab, onTabChange, filteredData, selectedIndex, onSelect }: SearchResultListProps) {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  return (
    <section className="sticky top-0 bg-white z-10 pb-2">
      <div className="sticky top-0 bg-white z-20 pb-2">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xs font-semibold text-zinc-700">All</h2>
          <select className="text-[10px] text-zinc-500 bg-transparent outline-none border-none cursor-pointer">
            <option>View: Category</option>
          </select>
        </div>
        <SearchTabs activeTab={activeTab} onTabChange={onTabChange} />
      </div>
      <div className="grid grid-cols-1 gap-1 mt-2">
        {filteredData.map((item, index) => (
          <SearchResultItem
            key={item.id}
            item={item}
            isSelected={index === selectedIndex}
            onClick={() => onSelect(item)}
            ref={(el) => { itemRefs.current[index] = el }}
          />
        ))}
        {filteredData.length === 0 && (
          <div className="p-8 text-center text-zinc-400 text-xs italic">
            No results found for your search.
          </div>
        )}
      </div>
    </section>
  )
}
