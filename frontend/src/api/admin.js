import client from './client';

export async function getSnapshot() {
  const { data } = await client.get('/export/snapshot');
  return data;
}
