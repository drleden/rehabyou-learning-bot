import client from './client';

export async function getCourses(params = {}) {
  const { data } = await client.get('/courses/', { params });
  return data;
}

export async function getCourse(id) {
  const { data } = await client.get(`/courses/${id}`);
  return data;
}

export async function createCourse(body) {
  const { data } = await client.post('/courses/', body);
  return data;
}

export async function updateCourse(id, body) {
  const { data } = await client.patch(`/courses/${id}`, body);
  return data;
}

export async function publishCourse(id) {
  const { data } = await client.post(`/courses/${id}/publish`);
  return data;
}

export async function unpublishCourse(id) {
  const { data } = await client.post(`/courses/${id}/unpublish`);
  return data;
}

export async function createModule(body) {
  const { data } = await client.post('/courses/modules/', body);
  return data;
}

export async function updateModule(id, body) {
  const { data } = await client.patch(`/courses/modules/${id}`, body);
  return data;
}

export async function deleteModule(id) {
  await client.delete(`/courses/modules/${id}`);
}

export async function createLesson(body) {
  const { data } = await client.post('/lessons/', body);
  return data;
}

export async function updateLesson(id, body) {
  const { data } = await client.patch(`/lessons/${id}`, body);
  return data;
}

export async function deleteLesson(id) {
  await client.delete(`/lessons/${id}`);
}

export async function importCourse(json) {
  const { data } = await client.post('/courses/import', json);
  return data;
}
