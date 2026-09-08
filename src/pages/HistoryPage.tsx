import { CrudPage } from '../components/CrudPage'

export function HistoryPage() {
  return (
    <CrudPage
      table="history"
      title="교회 연혁"
      orderBy="sort_order"
      fields={[
        { key: 'year', label: '연도', type: 'number', required: true },
        { key: 'month', label: '월', type: 'number' },
        { key: 'content', label: '내용', type: 'textarea', required: true },
        { key: 'content_en', label: '내용(영문)', type: 'textarea' },
        { key: 'sort_order', label: '정렬 순서', type: 'number' },
      ]}
    />
  )
}
