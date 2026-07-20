import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import { attachVolcengineBridge } from "./src/server/volcengine-bridge"
import { handleVoiceTurn } from "./src/server/voice-turn"

async function forwardRequest(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, handler: (request: Request) => Promise<Response>) {
  const chunks: Buffer[] = []
  if (req.method === "POST") for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const response = await handler(new Request(`http://localhost${req.url ?? ''}`, { method: req.method, headers: req.headers as HeadersInit, body: req.method === "POST" ? Buffer.concat(chunks) : undefined }))
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.end(Buffer.from(await response.arrayBuffer()))
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""))
  return {
    plugins: [react(), tailwindcss(), {
      name: "travel-audio-api",
      configureServer(server) {
        server.middlewares.use("/api/voice-turn", (req, res) => forwardRequest(req, res, handleVoiceTurn))
        if (server.httpServer) attachVolcengineBridge(server.httpServer)
      },
    }],
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  }
})
