import { CrudPage } from '../components/CrudPage'
import { nearestSunday } from '../lib/date'

export function BulletinsPage() {
  return (
    <CrudPage
      table="bulletins"
      title="주보"
      orderBy="sunday_date"
      fields={[
        { key: 'sunday_date', label: '주일 날짜', type: 'date', required: true, defaultValue: nearestSunday },
        {
          key: 'file_url',
          label: '주보 PDF',
          type: 'file',
          bucket: 'public-assets',
          accept: 'application/pdf',
          required: true,
        },
        { key: 'is_active', label: '게시 여부', type: 'boolean' },
      ]}
    />
  )
}
