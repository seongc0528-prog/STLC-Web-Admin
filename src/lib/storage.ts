import { supabase } from './supabase'

export async function uploadFile(bucket: string, file: File, folder = ''): Promise<string> {
  // Storage 키는 한글·공백 같은 문자를 거부한다("주보 0914.pdf" → Invalid key).
  // 원래 파일명은 버리고 확장자만 남긴다.
  const ext = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext ? `.${ext}` : ''}`
  const path = `${folder ? `${folder}/` : ''}${name}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type || undefined,
  })
  if (error) throw error
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
