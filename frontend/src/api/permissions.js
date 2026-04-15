import client from './client';

export async function getPermissions(userId) {
  const { data } = await client.get(`/permissions/user/${userId}`);
  return data;
}

export async function grantPermission(userId, service) {
  const { data } = await client.post('/permissions/grant', { user_id: userId, service });
  return data;
}

export async function revokePermission(permissionId) {
  const { data } = await client.delete(`/permissions/revoke/${permissionId}`);
  return data;
}
