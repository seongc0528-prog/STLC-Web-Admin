import { supabase } from './supabase'

export async function uploadFile(bucket: string, file: File, folder = ''): Promise<string> {
  const path = `${folder ? `${folder}/` : ''}${Date.now()}-${file.name}`
  const { error } = await supabase.storage.from(bucket).upload(path, file)
  if (error) throw error
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
