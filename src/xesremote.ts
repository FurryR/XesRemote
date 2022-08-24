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
export class XesRemote {
  private _ws: ws.WebSocket
  private _sended = false
  private _heartbeat: NodeJS.Timer
  // 收到消息的事件。
  onmessage: (ev: MsgEvent) => void | Promise<void> = async () => void null
  // 连接关闭的事件。
  onclose: (ev: ws.CloseEvent) => void | Promise<void> = async () => void null
  // 连接发生错误的事件。
  onerror: (ev: ws.ErrorEvent) => void | Promise<void> = async () => void null
  // 连接打开的事件。
  onopen: () => Promise<void> = async () => void null
  /**
   * 发送一段Buffer作为输入。
   * @param val 要发送的内容。
   */
  async send(val: Buffer): Promise<void> {
    this._ws.send('1' + val.toString())
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
   * @param lang 语言。
   * @param content 需要远程运行的代码。
   * @param echo 控制是否回显。此参数设置为true时，send方法发送的数据将被onmessage接收。
   */
  constructor(lang: Language, content: string, echo = false) {
    this._ws = new ws.WebSocket(
      'wss://codedynamic.xueersi.com/api/compileapi/ws/run'
    )
    this._ws.onopen = (): void => {
      this._ws.send('{}')
      this._ws.send(
        '7' +
          JSON.stringify({
            xml: content,
            type: 'run',
            lang: lang,
            original_id: 1
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
    this._heartbeat = setInterval((): void => this._ws.send('2'), 10000) // heartbeat
  }
}
