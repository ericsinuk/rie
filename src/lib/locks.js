import { api } from './api.js'

export async function acquireLock(airfieldId, department, userId) {
  const { data, error } = await api.from('record_locks').insert({
    airfield_id: airfieldId,
    department,
    locked_by: userId,
  })
  if (error) return { acquired: false, lock: null }
  return { acquired: data.acquired, lock: data.lock }
}

export async function releaseLock(airfieldId, department, userId) {
  await api.from('record_locks')
    .delete()
    .eq('airfield_id', airfieldId)
    .eq('department', department)
    .eq('locked_by', userId)
}

export async function getLock(airfieldId, department) {
  // Re-attempt acquire (server returns acquired:false + lock if held by someone else)
  const { data } = await api.from('record_locks').insert({
    airfield_id: airfieldId,
    department,
  })
  return data?.lock || null
}

export function subscribeLocks(airfieldId, onChange) {
  return api.channel(`locks:${airfieldId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'record_locks',
      filter: `airfield_id=eq.${airfieldId}`
    }, onChange)
    .subscribe()
}
