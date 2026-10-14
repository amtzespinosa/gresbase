// Site settings read by the build. In Cloudflare Pages, SITE_URL sets siteUrl (see site/README.md).
export default {
  siteUrl: process.env.SITE_URL ?? 'http://localhost:4321',
  repoUrl: 'https://github.com/amtzespinosa/gresbase',
  // Raw files of the repository: the landing's one-command demo downloads deploy/docker-compose.demo.yml.
  repoRawUrl: 'https://raw.githubusercontent.com/amtzespinosa/gresbase',
  // "Edit on GitHub" links stay hidden until the repository is public (SITE_REPO_PUBLIC=true shows
  // them, e.g. to compare a page with site/reference/docs-referencia.html).
  repoPublic: process.env.SITE_REPO_PUBLIC === 'true',
  image: 'ghcr.io/amtzespinosa/gresbase:latest',
  // Host port of the quick start (the container listens on 8080, GRESBASE_PORT).
  hostPort: 8082,
  // The first language is served at /, the others at /<lang>/.
  langs: ['en', 'es'],
}
