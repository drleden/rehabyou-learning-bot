import client from './client';

export async function getTestByLesson(lessonId) {
  const { data } = await client.get(`/tests/by-lesson/${lessonId}`);
  return data;
}

export async function getTestFullByLesson(lessonId) {
  const { data } = await client.get(`/tests/by-lesson/${lessonId}/full`);
  return data;
}

export async function submitTest(testId, answers) {
  const { data } = await client.post(`/tests/${testId}/submit`, { answers });
  return data;
}

export async function createTestFull(body) {
  const { data } = await client.post('/tests/full', body);
  return data;
}
