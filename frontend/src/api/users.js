import client from './client';

export async function getUsers(params = {}) {
  const { data } = await client.get('/users/', { params });
  return data;
}

export async function getUser(id) {
  const { data } = await client.get(`/users/${id}`);
  return data;
}

export async function createUser(body) {
  const { data } = await client.post('/users/', body);
  return data;
}

export async function updateUser(id, body) {
  const { data } = await client.patch(`/users/${id}`, body);
  return data;
}

export async function deleteUser(id) {
  await client.delete(`/users/${id}`);
}
