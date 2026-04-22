import { generateArticleHTML } from './routes/articles.js';

(async () => {
  const article = { title:'Test', snippet:'', coverImagePath:'/images/1.png', tags:['a'], minuteRead:3, createdAt: new Date().toISOString() };
  const rev = { contentHtml:'<p>hello</p>' };
  const author = { username:'alice', avatarStyle: { type:'solid', colors:['#ff0000'] } };
  const html = generateArticleHTML(article, rev, author);
  const idx = html.indexOf('<div class="article-meta">');
  // print a chunk including meta and a bit after
  console.log(html.slice(idx, idx+500));
})();