import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

type ChurchInfo = {
  id: number
  sunday_service: string | null
  wednesday_service: string | null
  address: string | null
  address_en: string | null
  latitude: number | null
  longitude: number | null
  phone: string | null
  email: string | null
}

export function ChurchInfoPage() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['church_info'],
    queryFn: async () => {
      const { data, error } = await supabase.from('church_info').select('*').eq('id', 1).single()
      if (error) throw error
      return data as ChurchInfo
    },
  })

  const [values, setValues] = useState<Partial<ChurchInfo>>({})

  useEffect(() => {
    if (data) setValues(data)
  }, [data])

  const save = useMutation({
    mutationFn: async (values: Partial<ChurchInfo>) => {
      const { error } = await supabase.from('church_info').update(values).eq('id', 1)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['church_info'] }),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    save.mutate(values)
  }

  if (isLoading) return <p className="text-sm text-gray-400">불러오는 중...</p>

  const field = (key: keyof ChurchInfo, label: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-gray-700">{label}</span>
      <input
        value={(values[key] as string) ?? ''}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
        className="rounded border border-gray-300 px-2 py-1"
      />
    </label>
  )

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-gray-900">예배 안내 · 오시는 길</h2>
      <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-3">
        {field('sunday_service', '주일 예배 시간')}
        {field('wednesday_service', '수요 예배 시간')}
        {field('address', '주소')}
        {field('address_en', '주소(영문)')}
        {field('latitude', '위도')}
        {field('longitude', '경도')}
        {field('phone', '전화번호')}
        {field('email', '이메일')}
        <button
          type="submit"
          disabled={save.isPending}
          className="mt-2 w-fit rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {save.isPending ? '저장 중...' : '저장'}
        </button>
      </form>
    </div>
  )
}
