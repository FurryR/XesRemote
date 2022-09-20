import ws from 'ws'
import { Base64 } from 'js-base64'
// 要运行的代码的语言。
export enum Language {
  Cpp = 'cpp', // C++
  Python = 'python' // Python
}
// 由远程端传回消息的类型。
export enum MsgType {
  Output = 'Output', // 远程输出
  System = 'System', // 系统消息
  Unknown = 'Unknown' // 未知/不支持
}
// 消息事件。
export class MsgEvent {
  // 类型。
  type: MsgType
  // 实际内容。
  data: Buffer
  /**
   * 初始化MsgEvent。
   * @param type 消息类型。
   * @param data 消息数据。
   * 当消息类型为MsgType.Output或MsgType.System时，data为base64解码完毕的Buffer。
   * 当消息类型为MsgType.Unknown时，data不解码。
   */
  constructor(type: MsgType, data: Buffer = Buffer.from([])) {
    void ([this.type, this.data] = [type, data])
  }
}
function trySend(ws: ws.WebSocket, data: string): Promise<void> {
  ws.send(data)
  return new Promise<void>(resolve => {
    const i = setInterval(() => {
      if (ws.readyState == ws.CLOSED || ws.readyState == ws.CLOSING) {
        clearInterval(i)
        resolve()
      }
      if (ws.bufferedAmount == 0) {
        clearInterval(i)
        resolve()
      }
    })
  })
}
export class XesRemote {
  private _ws: ws.WebSocket
  private _sended = false
  private _heartbeat: NodeJS.Timer
  private _host: Promise<string>
  // 收到消息的事件。
  onmessage: (ev: MsgEvent) => Promise<void> | void = async () => void null
  // 连接关闭的事件。
  onclose: (ev: ws.CloseEvent) => Promise<void> | void = async () => void null
  // 连接发生错误的事件。
  onerror: (ev: ws.ErrorEvent) => Promise<void> | void = async () => void null
  // 连接打开的事件。
  onopen: () => Promise<void> | void = async () => void null
  /**
   * 获得目标服务器。
   * @returns 服务器ID。
   */
  host(): Promise<string> {
    return this._host
  }
  /**
   * 发送一段文本作为输入。
   * @param val 要发送的内容。
   */
  async send(val: string): Promise<void> {
    if (val.length < 1) return
    await trySend(this._ws, '1' + val)
    this._sended = true
  }
  /**
   * 主动关闭连接。
   */
  async close(): Promise<void> {
    this._ws.close()
  }
  /**
   * 初始化XesRemote。
   * @param option         选项。
   * @param option.lang    语言。
   * @param option.content 需要远程运行的代码。
   * @param option.args    程序参数。
   * @param option.echo    控制是否回显。此参数设置为true时，send方法发送的数据将被onmessage接收。
   */
  constructor({
    lang,
    content,
    args = [],
    echo = false
  }: {
    lang: Language
    content: string
    args?: string[]
    echo?: boolean
  }) {
    this._ws = new ws.WebSocket(
      'wss://codedynamic.xueersi.com/api/compileapi/ws/run'
    )
    this._host = new Promise(resolve => {
      this._ws.on('upgrade', resp => {
        const a = resp.headers['server']
        if (typeof a == 'string') resolve(a)
        else resolve(`(unknown host ${JSON.stringify(a)})`)
      })
    })
    this._ws.onopen = async (): Promise<void> => {
      await trySend(this._ws, '{}')
      await trySend(
        this._ws,
        '7' +
          JSON.stringify({
            xml: content,
            type: 'run',
            lang: lang,
            original_id: 1,
            args
          })
      )
    }
    this._ws.onmessage = async (ev: ws.MessageEvent): Promise<void> => {
      const data: string = ev.data.toString('utf-8')
      switch (data[0]) {
        case '1': {
          if (echo || !this._sended)
            return await this.onmessage(
              new MsgEvent(
                MsgType.Output,
                Buffer.from(Base64.toUint8Array(data.substring(1)))
              )
            )
          this._sended = false
          break
        }
        case '7':
          return await this.onmessage(
            new MsgEvent(
              MsgType.System,
              Buffer.from(Base64.toUint8Array(data.substring(1)))
            )
          )
        case '3':
          return await this.onopen()
        case '2':
          return
        default:
          return await this.onmessage(
            new MsgEvent(MsgType.Unknown, Buffer.from(data))
          )
      }
    }
    this._ws.onclose = async (ev: ws.CloseEvent): Promise<void> => {
      clearInterval(this._heartbeat)
      await this.onclose(ev)
    }
    this._ws.onerror = async (ev: ws.ErrorEvent): Promise<void> =>
      await this.onerror(ev)
    this._heartbeat = setInterval(
      async (): Promise<void> => await trySend(this._ws, '2'),
      10000
    ) // heartbeat
  }
}
