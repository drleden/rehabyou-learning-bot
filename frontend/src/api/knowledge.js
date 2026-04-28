import client from './client';

export async function getCategories() {
  const { data } = await client.get('/knowledge/categories');
  return data;
}

export async function getArticlesByCategory(slug) {
  const { data } = await client.get(`/knowledge/categories/${slug}/articles`);
  return data;
}

export async function getArticle(id) {
  const { data } = await client.get(`/knowledge/articles/${id}`);
  return data;
}

export async function searchArticles(q) {
  const { data } = await client.get('/knowledge/search', { params: { q } });
  return data;
}

export async function getAllArticles(categoryId) {
  const params = {};
  if (categoryId) params.category_id = categoryId;
  const { data } = await client.get('/knowledge/articles/', { params });
  return data;
}

export async function createArticle(body) {
  const { data } = await client.post('/knowledge/articles', body);
  return data;
}

export async function updateArticle(id, body) {
  const { data } = await client.patch(`/knowledge/articles/${id}`, body);
  return data;
}

export async function deleteArticle(id) {
  await client.delete(`/knowledge/articles/${id}`);
}
