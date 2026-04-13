import client from './client';

export async function getStudios() {
  const { data } = await client.get('/studios/');
  return data;
}

export async function createStudio(body) {
  const { data } = await client.post('/studios/', body);
  return data;
}

export async function addStudioMember(studioId, userId) {
  const { data } = await client.post(`/studios/${studioId}/members`, { user_id: userId });
  return data;
}

export async function removeStudioMember(studioId, userId) {
  await client.delete(`/studios/${studioId}/members/${userId}`);
}
