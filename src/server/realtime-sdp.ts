export async function handleRealtimeSdp() {
  return new Response('此 SDP 会话路径已停用，请从“沟通”页启动豆包实时语音。', { status: 410, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
}
