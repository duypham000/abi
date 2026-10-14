export interface SearchItem {
  id: string
  title: string
  description: string
  highlight?: string
  category: 'Docs' | 'Secret' | 'Note' | 'Canvas'
  type: string
  author?: string
  date?: string
  icon?: string
  hotkey?: string
  status?: 'Active' | 'Completed' | 'Pending' | 'Archived'
  priority?: 'High' | 'Medium' | 'Low'
}
