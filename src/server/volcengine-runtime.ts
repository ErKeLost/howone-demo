import { createReadStream, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { attachVolcengineBridge } from './volcengine-bridge'

const root = join(process.cwd(), 'dist')
const types: Record<string, string> = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' }

const server = createServer((request, response) => {
  const rawPath = new URL(request.url ?? '/', 'http://localhost').pathname
  const filePath = normalize(join(root, rawPath === '/' ? 'index.html' : rawPath)).startsWith(root) ? normalize(join(root, rawPath === '/' ? 'index.html' : rawPath)) : join(root, 'index.html')
  const target = existsSync(filePath) ? filePath : join(root, 'index.html')
  response.writeHead(200, { 'Content-Type': types[extname(target)] ?? 'application/octet-stream', 'Cache-Control': target.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable' })
  createReadStream(target).pipe(response)
})

attachVolcengineBridge(server)
server.listen(Number(process.env.PORT ?? 3000), '0.0.0.0')
