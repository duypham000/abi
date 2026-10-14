import { TABS } from '../constants'

interface SearchTabsProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

export function SearchTabs({ activeTab, onTabChange }: SearchTabsProps) {
  return (
    <div className="flex gap-1 border-b border-zinc-100">
      {TABS.map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={`px-2 py-1 text-[11px] transition-colors ${activeTab === tab ? 'text-zinc-900 border-b-2 border-blue-600' : 'text-zinc-600 hover:text-zinc-900 border-b-2 border-transparent hover:border-zinc-400'}`}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}
