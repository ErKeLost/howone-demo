export default function handler(_request: unknown, response: { status: (code: number) => { json: (body: { error: string }) => void } }) {
  response.status(410).json({ error: '此实时会话路径已停用，请从“沟通”页启动豆包实时语音。' })
}
