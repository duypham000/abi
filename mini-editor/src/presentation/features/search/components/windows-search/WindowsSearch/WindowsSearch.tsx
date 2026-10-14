import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { SearchPanel } from '../SearchPanel'
import { SidePanel } from '../SidePanel'
import { CATEGORY_MAP, TABS } from '../constants'
import type { SearchItem } from '../types'
import { useSearchDocsQuery } from '@/infrastructure/api/docsApi'
import { useSearchNotesQuery } from '@/infrastructure/api/notesApi'
import { useSearchCanvasQuery } from '@/infrastructure/api/canvasApi'
import { useDocPopup } from '@/presentation/hooks/useDocPopup'
import { useGoldenLayout } from '@/presentation/layout/golden/GoldenLayoutContext'
import { PANEL_TYPES } from '@/presentation/layout/golden/panelRegistry'

export function WindowsSearch() {
  const navigate = useNavigate()
  const { openDocPopup } = useDocPopup()
  const { layout, openPanel } = useGoldenLayout()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [activeTab, setActiveTab] = useState('All')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const queryRef = useRef(query)
  queryRef.current = query

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  const skip = !debouncedQuery

  const { data: docs = [] } = useSearchDocsQuery(debouncedQuery, { skip })
    const { data: notes = [] } = useSearchNotesQuery(debouncedQuery, { skip })
  const { data: canvases = [] } = useSearchCanvasQuery(debouncedQuery, { skip })

  const allItems: SearchItem[] = useMemo(() => [
    ...docs.map((d) => ({
      id: String(d.id),
      title: d.title ?? '',
      description: d.preview ?? d.plainText?.slice(0, 100) ?? '',
      highlight: d.highlights?.body?.[0] ?? d.highlights?.title?.[0] ?? undefined,
      category: 'Docs' as const,
      type: 'document',
    })),    ...notes.map((n) => ({
      id: String(n.id),
      title: n.title ?? '(no title)',
      description: n.content?.slice(0, 100) ?? '',
      category: 'Note' as const,
      type: 'note',
    })),
    ...canvases.map((c) => ({
      id: String(c.id),
      title: c.title ?? '',
      description: c.preview ?? '',
      highlight: c.highlights?.title?.[0] ?? undefined,
      category: 'Canvas' as const,
      type: 'canvas',
    })),
  ], [docs, notes, canvases])

  const filteredData = useMemo(() => {
    return allItems.filter(
      (item) => activeTab === 'All' || CATEGORY_MAP[item.category] === activeTab,
    )
  }, [allItems, activeTab])

  // Reset selection when results change
  useEffect(() => { setSelectedIndex(0) }, [filteredData])

  const handleSelectItem = (item: SearchItem, openInEditor = false) => {
    if (item.type === 'document') {
      if (openInEditor) {
        if (layout) {
          openPanel(PANEL_TYPES.DOC_EDITOR, { id: Number(item.id) }, { title: item.title || 'Document' })
        } else {
          navigate(`/docs/${item.id}`)
        }
      } else {
        openDocPopup(Number(item.id))
        navigate(-1)
      }
    }
  }

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(filteredData.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(0, i - 1))
      } else if (e.key === 'Tab') {
        e.preventDefault()
        setActiveTab(tab => {
          const idx = TABS.indexOf(tab)
          return e.shiftKey
            ? TABS[(idx - 1 + TABS.length) % TABS.length]
            : TABS[(idx + 1) % TABS.length]
        })
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = filteredData[selectedIndex]
        if (item) handleSelectItem(item, e.ctrlKey)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [filteredData, selectedIndex])

  return (
    <div className="w-full h-full bg-white rounded-xl shadow-2xl border border-zinc-200 flex overflow-hidden">
      <SearchPanel
        query={query}
        onQueryChange={setQuery}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        filteredData={filteredData}
        selectedIndex={selectedIndex}
        onSelect={(item) => handleSelectItem(item)}
      />

      <SidePanel items={allItems} />
    </div>
  )
}
