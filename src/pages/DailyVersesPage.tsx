import { CrudPage } from '../components/CrudPage'

export function DailyVersesPage() {
  return (
    <CrudPage
      table="daily_verses"
      title="데일리 말씀"
      orderBy="order_no"
      ascending
      fields={[
        { key: 'order_no', label: '순번', type: 'number', required: true },
        {
          key: 'type',
          label: '구분',
          type: 'select',
          required: true,
          options: [
            { value: 'bible', label: '성경말씀' },
            { value: 'quote', label: '명언' },
          ],
        },
        { key: 'text_kr', label: '한글', type: 'textarea', required: true },
        { key: 'text_en', label: '영문', type: 'textarea' },
        { key: 'is_active', label: '사용', type: 'boolean' },
      ]}
    />
  )
}
