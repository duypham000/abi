import { SearchOutlined } from '@ant-design/icons'

interface SearchInputProps {
  query: string
  onChange: (query: string) => void
}

export function SearchInput({ query, onChange }: SearchInputProps) {
  return (
    <div className="p-4 pb-2">
      <div className="flex items-center bg-zinc-100/50 border border-zinc-200 rounded-lg p-3 shadow-inner">
        <SearchOutlined className="text-zinc-400 mr-3" style={{ fontSize: 20 }} />
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search for docs, secrets, and canvas"
          className="flex-1 outline-none text-sm text-zinc-800 placeholder:text-zinc-400 bg-transparent"
        />
      </div>
    </div>
  )
}
