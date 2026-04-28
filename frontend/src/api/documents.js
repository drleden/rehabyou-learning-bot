import client from './client';

export async function getDocuments() {
  var resp = await client.get('/documents/');
  return resp.data;
}

export async function getDocument(id) {
  var resp = await client.get('/documents/' + id);
  return resp.data;
}
