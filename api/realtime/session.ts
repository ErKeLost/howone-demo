export default function handler(_request: unknown, response: { status: (code: number) => { send: (body: string) => void } }) {
  response.status(410).send('此 SDP 会话路径已停用，请从“沟通”页启动豆包实时语音。')
}
