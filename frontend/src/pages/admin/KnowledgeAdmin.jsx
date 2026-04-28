import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCategories, getAllArticles, createArticle, updateArticle, deleteArticle } from '../../api/knowledge';

export default function KnowledgeAdmin() {
  var navigate = useNavigate();
  var _c = useState([]); var categories = _c[0]; var setCategories = _c[1];
  var _a = useState([]); var articles = _a[0]; var setArticles = _a[1];
  var _l = useState(true); var loading = _l[0]; var setLoading = _l[1];
  var _f = useState(null); var filterCat = _f[0]; var setFilterCat = _f[1];
  var _s = useState(false); var showAdd = _s[0]; var setShowAdd = _s[1];
  var _e = useState(null); var editing = _e[0]; var setEditing = _e[1];

  var fetchAll = function() {
    setLoading(true);
    Promise.all([getCategories(), getAllArticles(filterCat)])
      .then(function(res) { setCategories(res[0]); setArticles(res[1]); })
      .catch(function(){})
      .finally(function() { setLoading(false); });
  };

  useEffect(fetchAll, [filterCat]);

  var handleDelete = function(id) {
    if (!window.confirm('Удалить статью?')) return;
    deleteArticle(id).then(fetchAll);
  };

  return (
    <div className="bg-surface min-h-screen pb-8">
      <header className="bg-white px-4 pt-4 pb-3 shadow-sm sticky top-0 z-30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={function() { navigate('/admin'); }} className="text-gray-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-extrabold text-gray-900">База знаний</h1>
          </div>
          <button onClick={function() { setEditing(null); setShowAdd(true); }} className="w-10 h-10 bg-accent text-white rounded-xl flex items-center justify-center shadow-sm shadow-accent/20 active:scale-95">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          <button onClick={function() { setFilterCat(null); }} className={'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ' + (!filterCat ? 'bg-accent text-white' : 'bg-white text-gray-600 border border-gray-200')}>Все</button>
          {categories.filter(function(c) { return !c.parent_slug; }).map(function(c) {
            return <button key={c.id} onClick={function() { setFilterCat(c.id); }} className={'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ' + (filterCat === c.id ? 'bg-accent text-white' : 'bg-white text-gray-600 border border-gray-200')}>{c.icon} {c.title}</button>;
          })}
        </div>
      </header>

      <div className="px-4 mt-3 space-y-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : articles.length === 0 ? (
          <p className="text-center text-gray-400 py-12 text-sm">Статей пока нет</p>
        ) : articles.map(function(a) {
          return (
            <div key={a.id} className="bg-white rounded-2xl p-3 shadow-sm border border-gray-50">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm text-gray-900 line-clamp-2">{a.title}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={'text-[10px] font-semibold px-1.5 py-0.5 rounded-full ' + (a.is_published ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400')}>
                      {a.is_published ? 'Опубл.' : 'Черновик'}
                    </span>
                    <span className="text-[10px] text-gray-400">{new Date(a.updated_at).toLocaleDateString('ru-RU')}</span>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={function() { setEditing(a); setShowAdd(true); }} className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-gray-400 hover:text-accent">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button onClick={function() { handleDelete(a.id); }} className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-gray-400 hover:text-red-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && (
        <ArticleFormSheet
          article={editing}
          categories={categories}
          onClose={function() { setShowAdd(false); setEditing(null); }}
          onSaved={function() { setShowAdd(false); setEditing(null); fetchAll(); }}
        />
      )}
    </div>
  );
}

function ArticleFormSheet(props) {
  var article = props.article;
  var categories = props.categories;
  var onClose = props.onClose;
  var onSaved = props.onSaved;
  var isEdit = !!article;

  var _t = useState(article ? article.title : '');
  var title = _t[0]; var setTitle = _t[1];
  var _cat = useState(article ? article.category_id : (categories[0] && categories[0].id) || 0);
  var catId = _cat[0]; var setCatId = _cat[1];
  var _tags = useState(article && article.tags ? article.tags.join(', ') : '');
  var tags = _tags[0]; var setTags = _tags[1];
  var _vid = useState(article ? (article.video_url || '') : '');
  var videoUrl = _vid[0]; var setVideoUrl = _vid[1];
  var _content = useState(article ? article.content : '');
  var content = _content[0]; var setContent = _content[1];
  var _pub = useState(article ? article.is_published : false);
  var published = _pub[0]; var setPublished = _pub[1];
  var _load = useState(false); var loading = _load[0]; var setLoading = _load[1];
  var _err = useState(''); var error = _err[0]; var setError = _err[1];

  var handleSubmit = function(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError('');
    var body = {
      title: title.trim(),
      category_id: catId,
      content: content,
      video_url: videoUrl.trim() || null,
      tags: tags ? tags.split(',').map(function(t) { return t.trim(); }).filter(Boolean) : [],
      is_published: published,
    };
    var promise = isEdit ? updateArticle(article.id, body) : createArticle(body);
    promise.then(onSaved).catch(function(err) {
      setError((err.response && err.response.data && err.response.data.detail) || 'Ошибка');
    }).finally(function() { setLoading(false); });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <form onSubmit={handleSubmit} className="relative w-full max-w-lg bg-white rounded-t-3xl max-h-[90vh] flex flex-col" onClick={function(e) { e.stopPropagation(); }}>
        <div className="flex-shrink-0 pt-3 pb-2"><div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" /></div>
        <div className="flex-shrink-0 px-5 pb-3 border-b border-gray-100">
          <h3 className="font-bold text-lg text-gray-900">{isEdit ? 'Редактировать' : 'Новая статья'}</h3>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          <input type="text" value={title} onChange={function(e) { setTitle(e.target.value); }} placeholder="Заголовок" className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
          <select value={catId} onChange={function(e) { setCatId(Number(e.target.value)); }} className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
            {categories.map(function(c) {
              return <option key={c.id} value={c.id}>{c.parent_slug ? '  ↳ ' : ''}{c.icon} {c.title}</option>;
            })}
          </select>
          <input type="text" value={tags} onChange={function(e) { setTags(e.target.value); }} placeholder="Теги через запятую" className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
          <input type="url" value={videoUrl} onChange={function(e) { setVideoUrl(e.target.value); }} placeholder="URL видео (необязательно)" className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
          <textarea value={content} onChange={function(e) { setContent(e.target.value); }} placeholder="Контент (Markdown)" rows={8} className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-surface text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-accent/30" />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={published} onChange={function(e) { setPublished(e.target.checked); }} className="w-4 h-4 rounded accent-accent" />
            <span className="text-sm text-gray-700">Опубликовать</span>
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <div className="flex-shrink-0 px-5 pt-3 pb-6 border-t border-gray-100">
          <button type="submit" disabled={loading} className="w-full h-11 bg-accent hover:bg-accent-hover disabled:opacity-60 text-white font-semibold rounded-xl text-sm">
            {loading ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </form>
    </div>
  );
}
