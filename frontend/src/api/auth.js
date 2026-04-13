import client from './client';

export async function phoneLogin(phone, password) {
  const { data } = await client.post('/auth/phone-login', { phone, password });
  return data;
}

export async function phoneRegister(phone, password, full_name) {
  const { data } = await client.post('/auth/phone-register', { phone, password, full_name });
  return data;
}

export async function initSuperadmin(password, full_name = 'Суперадмин') {
  const { data } = await client.post('/auth/init', { password, full_name });
  return data;
}

export async function getMe() {
  const { data } = await client.get('/users/me');
  return data;
}
