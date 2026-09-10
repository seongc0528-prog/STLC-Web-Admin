import { useState, type FormEvent } from 'react'
import { useCrud } from '../hooks/useCrud'
import { uploadFile } from '../lib/storage'

type FieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'file'

export type FieldConfig = {
  key: string
  label: string
  type: FieldType
  options?: { value: string; label: string }[]
  required?: boolean
  /** required when type === 'file': which storage bucket to upload into */
  bucket?: string
}

type Row = { id: string; [key: string]: unknown }

export function CrudPage({
  table,
  title,
  fields,
  orderBy = 'created_at',
  ascending = false,
}: {
  table: string
  title: string
  fields: FieldConfig[]
  orderBy?: string
  ascending?: boolean
}) {
  const { list, create, update, remove } = useCrud<Row>(table, orderBy, ascending)
  const [editing, setEditing] = useState<Row | 'new' | null>(null)
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [uploading, setUploading] = useState<string | null>(null)

  async function handleFileChange(key: string, bucket: string, file: File | undefined) {
    if (!file) return
    setUploading(key)
    try {
      const url = await uploadFile(bucket, file, table)
      setValues((v) => ({ ...v, [key]: url }))
    } catch (err) {
      alert(err instanceof Error ? err.message : '업로드 실패')
    } finally {
      setUploading(null)
    }
  }

  function startCreate() {
    setEditing('new')
    setValues(Object.fromEntries(fields.map((f) => [f.key, f.type === 'boolean' ? true : ''])))
  }

  function startEdit(row: Row) {
    setEditing(row)
    setValues(row)
  }

  function cancel() {
    setEditing(null)
    setValues({})
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (editing === 'new') {
      await create.mutateAsync(values)
    } else if (editing) {
      await update.mutateAsync({ id: editing.id, values })
    }
    cancel()
  }

  async function handleDelete(id: string) {
    if (!confirm('정말 삭제하시겠습니까?')) return
    await remove.mutateAsync(id)
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        {!editing && (
          <button
            onClick={startCreate}
            className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            + 새로 추가
          </button>
        )}
      </div>

      {editing && (
        <form onSubmit={handleSubmit} className="mb-6 flex flex-col gap-3 rounded border border-gray-200 p-4">
          {fields.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-gray-700">{f.label}</span>
              {f.type === 'textarea' ? (
                <textarea
                  value={(values[f.key] as string) ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  required={f.required}
                  rows={4}
                  className="rounded border border-gray-300 px-2 py-1"
                />
              ) : f.type === 'boolean' ? (
                <input
                  type="checkbox"
                  checked={Boolean(values[f.key])}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
                  className="h-4 w-4"
                />
              ) : f.type === 'file' ? (
                <div className="flex flex-col gap-1">
                  <input
                    type="file"
                    onChange={(e) => handleFileChange(f.key, f.bucket!, e.target.files?.[0])}
                    className="text-sm"
                  />
                  {uploading === f.key && <span className="text-xs text-gray-400">업로드 중...</span>}
                  {typeof values[f.key] === 'string' && values[f.key] !== '' && (
                    <a
                      href={values[f.key] as string}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-xs text-blue-600 hover:underline"
                    >
                      {values[f.key] as string}
                    </a>
                  )}
                </div>
              ) : f.type === 'select' ? (
                <select
                  value={(values[f.key] as string) ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  required={f.required}
                  className="rounded border border-gray-300 px-2 py-1"
                >
                  <option value="" disabled>
                    선택
                  </option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type === 'number' ? 'number' : 'text'}
                  value={(values[f.key] as string | number) ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  required={f.required}
                  className="rounded border border-gray-300 px-2 py-1"
                />
              )}
            </label>
          ))}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={create.isPending || update.isPending}
              className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              저장
            </button>
            <button
              type="button"
              onClick={cancel}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600"
            >
              취소
            </button>
          </div>
        </form>
      )}

      {list.isLoading && <p className="text-sm text-gray-400">불러오는 중...</p>}
      {list.error && <p className="text-sm text-red-600">{(list.error as Error).message}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              {fields.map((f) => (
                <th key={f.key} className="px-2 py-2 font-medium">
                  {f.label}
                </th>
              ))}
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.data?.map((row) => (
              <tr key={row.id} className="border-b border-gray-100">
                {fields.map((f) => (
                  <td key={f.key} className="max-w-xs truncate px-2 py-2 text-gray-700">
                    {String(row[f.key] ?? '')}
                  </td>
                ))}
                <td className="whitespace-nowrap px-2 py-2 text-right">
                  <button onClick={() => startEdit(row)} className="mr-3 text-gray-600 hover:underline">
                    수정
                  </button>
                  <button onClick={() => handleDelete(row.id)} className="text-red-600 hover:underline">
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.data?.length === 0 && <p className="py-6 text-center text-sm text-gray-400">등록된 항목이 없습니다.</p>}
      </div>
    </div>
  )
}
