import { PoweroffOutlined } from '@ant-design/icons'

export function SearchPanelFooter() {
  return (
    <div className="p-3 border-t border-zinc-100 flex items-center justify-between text-zinc-600">
      <div className="flex items-center gap-2 text-xs">
        <div className="w-5 h-5 rounded-full bg-zinc-300" />
        Duy Phạm
      </div>
      <PoweroffOutlined className="text-zinc-400 cursor-pointer hover:text-zinc-600 transition-colors" />
    </div>
  )
}
