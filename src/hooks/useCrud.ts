import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useCrud<T extends { id: string }>(table: string, orderBy = 'created_at') {
  const queryClient = useQueryClient()
  const queryKey = [table]

  const list = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order(orderBy, { ascending: false })
      if (error) throw error
      return data as T[]
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey })

  const create = useMutation({
    mutationFn: async (values: Partial<T>) => {
      // no generated DB types are wired up (table name is a runtime string),
      // so supabase-js can't narrow the insert/update payload type here.
      const { error } = await supabase.from(table).insert(values as never)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<T> }) => {
      const { error } = await supabase.from(table).update(values as never).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { list, create, update, remove }
}
