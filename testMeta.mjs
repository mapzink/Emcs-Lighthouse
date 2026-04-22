import { generateArticleHTML } from './routes/articles.js';

const article = { title:'Test', snippet:'', coverImagePath:'/images/1.png', tags:['a'], minuteRead:3, createdAt: new Date().toISOString() };
const rev = { contentHtml:'<p>hello</p>' };
// author with modern style structure
const author = { username:'alice', avatarStyle: { type:'solid', colors:['#ff0000'] } };

// legacy style format (used by older DB entries or manual edits)
const authorLegacy = { username:'bob', avatarStyle: { kind:'solid', color:'#00ff00' } };

// gradient style example
const authorGradient = {
  username: 'carol',
  avatarStyle: {
    type: 'gradient',
    gradientType: 'linear',
    angle: 45,
    stops: [
      { color: '#ff0000', position: 0 },
      { color: '#0000ff', position: 100 }
    ]
  }
};

// modern style
const metaMatch = generateArticleHTML(article, rev, author).match(/<div class="article-meta">([\s\S]*?)<\/div>/);
console.log('modern meta:', metaMatch ? metaMatch[1] : 'no match');

// legacy style
const metaMatch2 = generateArticleHTML(article, rev, authorLegacy).match(/<div class="article-meta">([\s\S]*?)<\/div>/);
console.log('legacy meta :', metaMatch2 ? metaMatch2[1] : 'no match');

// gradient style
const metaMatch3 = generateArticleHTML(article, rev, authorGradient).match(/<div class="article-meta">([\s\S]*?)<\/div>/);
console.log('gradient meta:', metaMatch3 ? metaMatch3[1] : 'no match');
