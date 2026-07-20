import { randomUUID } from 'node:crypto'
import WebSocket, { WebSocketServer } from 'ws'

type BrowserMessage = { type: 'start'; direction: 'zh-en' | 'en-zh'; scenario: 'restaurant' | 'hotel' | 'transport' | 'everyday' } | { type: 'audio'; data: string } | { type: 'stop' }

const upstreamUrl = 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue'
const scenarios: Record<string, string> = { restaurant: 'restaurant', hotel: 'hotel', transport: 'transport', everyday: 'everyday travel' }

function u32(value: number) { const buffer = Buffer.alloc(4); buffer.writeUInt32BE(value >>> 0); return buffer }
function eventFrame(event: number, payload: object, sessionId?: string) {
  const data = Buffer.from(JSON.stringify(payload))
  const parts = [Buffer.from([0x11, 0x14, 0x10, 0x00]), u32(event)]
  if (sessionId) { const id = Buffer.from(sessionId); parts.push(u32(id.length), id) }
  parts.push(u32(data.length), data)
  return Buffer.concat(parts)
}
function audioFrame(event: number, audio: Buffer, sessionId: string) {
  const id = Buffer.from(sessionId)
  return Buffer.concat([Buffer.from([0x11, 0x24, 0x00, 0x00]), u32(event), u32(id.length), id, u32(audio.length), audio])
}
function parseFrame(data: Buffer) {
  const type = data[1] >> 4; const flags = data[1] & 0x0f; let offset = 4
  let code: number | undefined; let event: number | undefined
  if (type === 15 && data.length >= offset + 4) { code = data.readUInt32BE(offset); offset += 4 }
  if (flags === 4 && data.length >= offset + 4) { event = data.readUInt32BE(offset); offset += 4 }
  if (event && event >= 100 && data.length >= offset + 4) { const idLength = data.readUInt32BE(offset); offset += 4 + idLength }
  if (data.length < offset + 4) return { type, code, event, payload: Buffer.alloc(0) }
  const length = data.readUInt32BE(offset); offset += 4
  return { type, code, event, payload: data.subarray(offset, offset + length) }
}
function decodeJson(payload: Buffer) { try { return JSON.parse(payload.toString('utf8')) as Record<string, unknown> } catch { return {} } }
function safeError(message: string) { return message.slice(0, 240) }

export function attachVolcengineBridge(server: import('node:http').Server) {
  const wss = new WebSocketServer({ noServer: true })
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (url.pathname !== '/api/volcengine/live') return
    wss.handleUpgrade(request, socket, head, client => wss.emit('connection', client))
  })

  wss.on('connection', client => {
    let upstream: WebSocket | null = null
    let sessionId = ''
    let started = false
    let terminal = false
    const send = (message: object) => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message)) }
    const fail = (message: string) => { if (!terminal) { terminal = true; send({ type: 'error', message: safeError(message) }) } }
    const closeUpstream = () => { if (upstream && upstream.readyState === WebSocket.OPEN) { if (sessionId) upstream.send(eventFrame(102, {}, sessionId)); upstream.send(eventFrame(2, {})); upstream.close() } upstream = null }

    client.on('message', (raw, binary) => {
      if (binary) return
      let message: BrowserMessage
      try { message = JSON.parse(raw.toString()) as BrowserMessage } catch { send({ type: 'error', message: '浏览器桥接消息无效。' }); return }
      if (message.type === 'stop') { closeUpstream(); send({ type: 'ended' }); return }
      if (message.type === 'audio') {
        if (!upstream || upstream.readyState !== WebSocket.OPEN || !sessionId) return
        upstream.send(audioFrame(200, Buffer.from(message.data, 'base64'), sessionId)); return
      }
      if (started) return
      const appId = process.env.VOLCENGINE_APPID; const accessToken = process.env.VOLCENGINE_APP_ACCESS_TOKEN
      if (!appId || !accessToken) { fail(`实时沟通尚未配置：缺少 ${!appId ? 'VOLCENGINE_APPID' : ''}${!appId && !accessToken ? ' 与 ' : ''}${!accessToken ? 'VOLCENGINE_APP_ACCESS_TOKEN' : ''}。请在服务端运行环境中设置后重新启动服务。`); return }
      started = true; sessionId = randomUUID()
      upstream = new WebSocket(upstreamUrl, { handshakeTimeout: 12_000, headers: { 'X-Api-App-ID': appId, 'X-Api-Access-Key': accessToken, 'X-Api-Resource-Id': 'volc.speech.dialog', 'X-Api-App-Key': 'PlgvMymc7f3tQnJ6', 'X-Api-Connect-Id': randomUUID() } })
      upstream.on('open', () => upstream?.send(eventFrame(1, {})))
      upstream.on('message', data => {
        const frame = parseFrame(Buffer.from(data as Buffer)); const payload = decodeJson(frame.payload)
        if (frame.type === 15 || frame.event === 51 || frame.event === 153 || frame.event === 599) { fail(String(payload.error ?? payload.message ?? `实时服务错误${frame.code ? ` (${frame.code})` : ''}`)); return }
        if (frame.event === 50) {
          const source = message.direction === 'zh-en' ? 'Chinese' : 'English'; const target = message.direction === 'zh-en' ? 'English' : 'Simplified Chinese'
          upstream?.send(eventFrame(100, { asr: { audio_info: { format: 'speech_opus', sample_rate: 16000, channel: 1 }, extra: {} }, dialog: { bot_name: 'Travel Interpreter', system_role: `You are a concise ${source} to ${target} travel interpreter for ${scenarios[message.scenario]}. Translate only what the speaker says. Preserve names, prices, addresses, and requests.`, speaking_style: 'clear and natural', extra: { model: '1.2.1.1', input_mod: 'keep_alive', enable_conversation_truncate: true } }, tts: { speaker: 'zh_female_vv_jupiter_bigtts', extra: {} } }, sessionId))
        } else if (frame.event === 150) send({ type: 'ready' })
        else if (frame.event === 451) { const result = Array.isArray(payload.results) ? payload.results[0] as { text?: string; is_interim?: boolean } : undefined; if (result?.text) send({ type: 'asr', text: result.text, interim: Boolean(result.is_interim) }) }
        else if (frame.event === 550) { const content = String(payload.content ?? ''); if (content) send({ type: 'translation', text: content }) }
        else if (frame.event === 559) send({ type: 'turn-end' })
        else if (frame.event === 352) send({ type: 'audio', data: frame.payload.toString('base64') })
        else if (frame.event === 359) send({ type: 'audio-end' })
      })
      upstream.on('unexpected-response', (_request, response) => {
        response.resume()
        const status = response.statusCode ?? 0
        if (status === 401) fail('豆包服务拒绝了访问凭据。请确认 VOLCENGINE_APPID 与 VOLCENGINE_APP_ACCESS_TOKEN 对应同一已开通的实时语音应用。')
        else if (status === 403) fail('当前豆包应用没有实时语音服务权限。请在火山控制台确认 Realtime Dialogue 已开通。')
        else fail(`豆包实时服务拒绝连接（HTTP ${status || '未知'}）。请稍后重试。`)
      })
      upstream.on('error', error => {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ETIMEDOUT' || code === 'ENETUNREACH' || code === 'ECONNREFUSED') fail('运行环境无法连接豆包实时网关，请检查服务器网络出口后重试。')
        else fail('无法完成豆包实时网关握手。请确认服务端凭据与实时语音服务状态。')
      })
      upstream.on('close', () => { if (started && !terminal) send({ type: 'ended' }) })
    })
    client.on('close', closeUpstream)
  })
}
