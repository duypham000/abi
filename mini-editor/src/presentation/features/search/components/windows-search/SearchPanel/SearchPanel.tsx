import { SearchInput } from './SearchInput'
import { SearchResultList } from './SearchResultList'
import { SearchPanelFooter } from './SearchPanelFooter'
import type { SearchItem } from '../types'

interface SearchPanelProps {
  query: string
  onQueryChange: (query: string) => void
  activeTab: string
  onTabChange: (tab: string) => void
  filteredData: SearchItem[]
  selectedIndex: number
  onSelect: (item: SearchItem) => void
}

export function SearchPanel({
  query,
  onQueryChange,
  activeTab,
  onTabChange,
  filteredData,
  selectedIndex,
  onSelect,
}: SearchPanelProps) {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-zinc-100">
      <SearchInput query={query} onChange={onQueryChange} />

      <div className="flex-1 overflow-y-auto p-4 pt-0 scrollbar-hide">
        <SearchResultList
          activeTab={activeTab}
          onTabChange={onTabChange}
          filteredData={filteredData}
          selectedIndex={selectedIndex}
          onSelect={onSelect}
        />
      </div>

      <SearchPanelFooter />
    </div>
  )
}
