import { FileTextOutlined, LockOutlined, AppstoreOutlined } from '@ant-design/icons'

interface CategoryIconProps {
  category: string
}

export function CategoryIcon({ category }: CategoryIconProps) {
  switch (category) {
    case 'Docs':
      return <FileTextOutlined style={{ fontSize: 14 }} className="text-sky-500" />
    case 'Secret':
      return <LockOutlined style={{ fontSize: 14 }} className="text-amber-500" />
    case 'Canvas':
      return <AppstoreOutlined style={{ fontSize: 14 }} className="text-purple-500" />
    default:
      return <FileTextOutlined style={{ fontSize: 14 }} />
  }
}
