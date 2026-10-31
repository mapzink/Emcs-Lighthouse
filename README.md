# The Lighthouse

The Lighthouse is a self-hosted publishing platform for Emmanuel Christian School. It combines a public site with authenticated dashboards for managing users, articles, profiles, and video content.

Built with **Node.js**, **Express**, **EJS**, **SQLite**, and a little **Anime.js** for motion.

## What it includes

- Animated public homepage and responsive site layout
- Blog and article publishing workflow
- Drafts, submissions, reviews, previews, and article editing
- Video library with a validated manifest and view tracking
- Cookie-based JWT authentication
- Role-based access for users, publishers, videographers, admins, and developers
- User profiles with avatars, bios, and featured articles
- Admin dashboard with system and content management tools
- EJS templates with synchronized HTML versions for static previews

## Requirements

- Node.js 18 or newer
- npm
- Linux (the admin process monitor uses Linux `ps` output)

## Getting started

```bash
git clone git@github.com:mapzink/Emcs-Lighthouse.git
cd Emcs-Lighthouse
npm install
```

Create a `.env` file in the project root:

```env
PORT=5000
JWT_SECRET=replace-this-with-a-long-random-secret
NODE_ENV=development
```

Start the development server:

```bash
npm start
```

Then open [http://localhost:5000](http://localhost:5000).

The application creates or migrates its SQLite tables when it starts. Local database files are kept in the project root and should not be committed.

## Useful commands

| Command | Description |
| --- | --- |
| `npm start` | Start the Express server |
| `npm run sync` | Synchronize EJS templates and HTML previews |
| `npm run sync:watch` | Watch templates and synchronize changes |
| `npm run sync:ejs-to-html` | Generate HTML files from EJS templates |
| `node createDevUser.js` | Create a development user |
| `node resetUsersAndCreateDev.js` | Reset local users and create a development user |
| `node inspectUsers.js` | Inspect local user records |
| `node inspectArticlesAll.js` | Inspect local article records |

There is currently no automated test suite configured; `npm test` is a placeholder.

## Main routes

### Public pages

`/` · `/blog` · `/videos` · `/contact` · `/help` · `/login` · `/profile-page/:username`

### Authenticated areas

`/dashboard` · `/editor` · `/articles` · `/securepanel`

### API areas

`/auth` · `/users` · `/articles` · `/api/blog` · `/api/videos`

Most account and publishing operations require authentication. Administrative actions additionally require an appropriate role.

## Project layout

```text
.
├── server.js          # Express application and public routes
├── routes/            # Auth, users, dashboard, article, and profile routes
├── middleware/        # Authentication and caching middleware
├── views/             # EJS templates and generated HTML views
├── public/            # CSS, client-side JavaScript, fonts, images, and videos
├── assets/            # Article media and source assets
├── config/            # Database initialization
└── utils/             # Shared article/layout helpers
```

## Development notes

- `lighthouse.db`, `Users.db`, and `articles.db` are runtime SQLite databases. Keep backups before running reset or migration scripts.
- Set a strong `JWT_SECRET` outside local development. The fallback secret exists for convenience but should not be used in production.
- Large article image uploads are supported through `/articles/upload-image`.
- `syncTemplates.js` keeps the EJS-driven pages and their HTML counterparts aligned when working on templates.

## Version history

The project began as a simple homepage prototype and grew into a publishing platform through the 2.x releases, adding the dashboard, profiles, video library, blog workflow, animations, and security fixes. Version notes from earlier releases are preserved in the repository history.

## License

No open-source license has been declared yet. Add a `LICENSE` file before distributing the project outside its intended organization.
