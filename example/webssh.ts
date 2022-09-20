import { Language, MsgType, MsgEvent, XesRemote } from '../src/xesremote'
import readline from 'readline'
const f = `
#include<iostream>
int main() {
  system("sh");
}
`
;(async () => {
  let s = new XesRemote({
    lang: Language.Cpp,
    content: f,
    echo: true
  })
  s.onmessage = async (ev: MsgEvent): Promise<void> => {
    if (ev.type == MsgType.Output) {
      await new Promise<void>(resolve => {
        process.stdout.write(ev.data, () => resolve())
      })
    } else if (ev.type == MsgType.System) {
      console.log('system:' + ev.data.toString())
    }
  }
  s.onopen = async (): Promise<void> => {
    readline.emitKeypressEvents(process.stdin)
    process.stdin.setRawMode(true)
    process.stdin.on('data', async data => {
      await s.send(data.toString())
    })
  }
  s.onclose = async (): Promise<void> => {
    console.log('remote connection closed')
    process.exit(0)
  }
})()
