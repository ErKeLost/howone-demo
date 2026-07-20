import { Buffer } from 'node:buffer'
import { handleVoiceTurn } from '../src/server/voice-turn'

export const config = { api: { bodyParser: false } }

export default async function handler(request: any, response: any) {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const url = `https://${request.headers.host ?? 'localhost'}${request.url ?? '/api/voice-turn'}`
  const webResponse = await handleVoiceTurn(new Request(url, { method: request.method, headers: request.headers as HeadersInit, body: request.method === 'POST' ? Buffer.concat(chunks) : undefined }))
  response.status(webResponse.status)
  webResponse.headers.forEach((value: string, key: string) => response.setHeader(key, value))
  response.send(Buffer.from(await webResponse.arrayBuffer()))
}
