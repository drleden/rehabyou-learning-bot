import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCategories, getArticlesByCategory, searchArticles } from '../api/knowledge';

export default function KnowledgeBase() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoot, setSelectedRoot] = useState(null);
  const [selectedSub, setSelectedSub] = useState(null);
  const [articles, setArticles] = useState([]);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null);

  useEffect(() => {
    getCategories().then(setCategories).catch(function(){}).finally(function(){ setLoading(false); });
  }, []);

  var rootCats = categories.filter(function(c) { return !c.parent_slug; });
  var subCats = selectedRoot
    ? categories.filter(function(c) { return c.parent_slug === selectedRoot.slug; })
    : [];

  var openSubCategory = function(sub) {
    setSelectedSub(sub);
    setArticlesLoading(true);
    getArticlesByCategory(sub.slug).then(setArticles).catch(function(){}).finally(function(){ setArticlesLoading(false); });
  };

  useEffect(function() {
    if (search.length < 3) { setSearchResults(null); return; }
    var timer = setTimeout(function() {
      searchArticles(search).then(setSearchResults).catch(function(){});
    }, 300);
    return function() { clearTimeout(timer); };
  }, [search]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen pb-20">
      <header className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-3 mb-3">
          {(selectedRoot || selectedSub) && (
            <button
              onClick={function() {
                if (selectedSub) { setSelectedSub(null); setArticles([]); }
                else { setSelectedRoot(null); }
              }}
              className="text-gray-400"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <h1 className="text-xl font-extrabold text-gray-900">
            {selectedSub ? selectedSub.title : selectedRoot ? selectedRoot.title : 'База знаний'}
          </h1>
        </div>
        {!selectedRoot && !selectedSub && (
          <button
            onClick={function() { navigate('/documents'); }}
            className="w-full flex items-center gap-3 p-3 mb-3 bg-accent/5 border border-accent/20 rounded-2xl text-left hover:bg-accent/10 transition-colors"
          >
            <span className="text-xl">📄</span>
            <span className="font-semibold text-sm text-accent">Документы</span>
            <svg className="w-4 h-4 text-accent/50 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
        <input
          type="text"
          value={search}
          onChange={function(e) { setSearch(e.target.value); }}
          placeholder="Поиск по статьям..."
          className="w-full h-10 px-4 rounded-xl border border-gray-200 bg-surface text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
      </header>

      <div className="px-4 mt-3">
        {/* Search results */}
        {searchResults !== null ? (
          searchResults.length === 0 ? (
            <p className="text-center text-gray-400 py-12 text-sm">Ничего не найдено</p>
          ) : (
            <div className="space-y-2">
              {searchResults.map(function(a) {
                return (
                  <button
                    key={a.id}
                    onClick={function() { navigate('/knowledge/article/' + a.id); }}
                    className="w-full p-3 bg-surface rounded-2xl text-left hover:bg-gray-100 transition-colors"
                  >
                    <h3 className="font-semibold text-sm text-gray-900">{a.title}</h3>
                    {a.tags && a.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {a.tags.map(function(t) {
                          return <span key={t} className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">{t}</span>;
                        })}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )
        ) : !selectedRoot ? (
          /* Root categories */
          <div className="space-y-3">
            {rootCats.map(function(cat) {
              return (
                <button
                  key={cat.id}
                  onClick={function() { setSelectedRoot(cat); }}
                  className="w-full p-4 bg-surface rounded-2xl text-left hover:bg-gray-100 transition-colors active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{cat.icon}</span>
                    <div>
                      <h3 className="font-bold text-base text-gray-900">{cat.title}</h3>
                      {cat.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{cat.description}</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : !selectedSub ? (
          /* Sub categories */
          <div className="space-y-2">
            {subCats.map(function(cat) {
              return (
                <button
                  key={cat.id}
                  onClick={function() { openSubCategory(cat); }}
                  className="w-full flex items-center gap-3 p-3 bg-surface rounded-2xl text-left hover:bg-gray-100 transition-colors active:scale-[0.99]"
                >
                  <span className="text-xl">{cat.icon}</span>
                  <span className="font-semibold text-sm text-gray-900">{cat.title}</span>
                  <svg className="w-4 h-4 text-gray-300 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              );
            })}
          </div>
        ) : (
          /* Articles list */
          articlesLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : articles.length === 0 ? (
            <p className="text-center text-gray-400 py-12 text-sm">Статей пока нет</p>
          ) : (
            <div className="space-y-2">
              {articles.map(function(a) {
                return (
                  <button
                    key={a.id}
                    onClick={function() { navigate('/knowledge/article/' + a.id); }}
                    className="w-full p-3 bg-surface rounded-2xl text-left hover:bg-gray-100 transition-colors active:scale-[0.99]"
                  >
                    <h3 className="font-semibold text-sm text-gray-900">{a.title}</h3>
                    {a.tags && a.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {a.tags.map(function(t) {
                          return <span key={t} className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">{t}</span>;
                        })}
                      </div>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">
                      {new Date(a.updated_at).toLocaleDateString('ru-RU')}
                    </p>
                  </button>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
