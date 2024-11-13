const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync } = require('child_process');
const FILE_PATH = process.env.FILE_PATH || './temp'; // 
const projectPageURL = process.env.URL || '';        // 
const intervalInseconds = process.env.TIME || 120;   // 
const DISCO_ID = process.env.DISCO_ID || '89c13786-25aa-4520-b2e7-12cd60fb5202';
const GOMAIN = process.env.GOMAIN || '';                // 
const GOTH = process.env.GOTH || '';                    // 
const PUBLIC_IP = process.env.PUBLIC_IP || 'na.ma';                         // 
const PUBLIC_PORT = process.env.PUBLIC_PORT || 443;                         // 
const NAME = process.env.NAME || 'Vls';                           // 
const DISCO_PORT = process.env.DISCO_PORT || 8080;                  // 
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000; // 

//创建运行文件夹
if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH);
  console.log(`${FILE_PATH} is created`);
} else {
  console.log(`${FILE_PATH} already exists`);
}

//清理历史文件
const pathsToDelete = [ 'discowb', 'discobt', 'disconm', 'sub.txt', 'boot.log'];
function cleanupOldFiles() {
  pathsToDelete.forEach((file) => {
    const filePath = path.join(FILE_PATH, file);
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error(`Skip Delete ${filePath}`);
      } else {
        console.log(`${filePath} deleted`);
      }
    });
  });
}
cleanupOldFiles();

// 根路由
app.get("/", function(req, res) {
  res.send("Hello world!");
});

// 生成xr-ay配置文件
const config = {
  log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
  inbounds: [
    { port: DISCO_PORT, protocol: 'vless', settings: { clients: [{ id: DISCO_ID, flow: 'xtls-rprx-vision' }], decryption: 'none', fallbacks: [{ dest: 3001 }, { path: "/vless", dest: 3002 }, { path: "/vmess", dest: 3003 }, { path: "/trojan", dest: 3004 }] }, streamSettings: { network: 'tcp' } },
    { port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: DISCO_ID }], decryption: "none" }, streamSettings: { network: "ws", security: "none" } },
    { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: DISCO_ID, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
    { port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: DISCO_ID, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: "/vmess" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
    { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: DISCO_ID }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
  ],
  dns: { servers: ["https+local://8.8.8.8/dns-query"] },
  outbounds: [
    { protocol: "freedom" },
    {
      tag: "WARP",
      protocol: "wireguard",
      settings: {
        secretKey: "YFYOAdbw1bKTHlNNi+aEjBM3BO7unuFC5rOkMRAz9XY=",
        address: ["172.16.0.2/32", "2606:4700:110:8a36:df92:102a:9602:fa18/128"],
        peers: [{ publicKey: "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=", allowedIPs: ["0.0.0.0/0", "::/0"], endpoint: "162.159.193.10:2408" }],
        reserved: [78, 135, 76],
        mtu: 1280,
      },
    },
  ],
  routing: { domainStrategy: "AsIs", rules: [{ type: "field", domain: ["domain:openai.com", "domain:ai.com"], outboundTag: "WARP" }] },
};
fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));

// 判断系统架构
function getSystemArchitecture() {
  const arch = os.arch();
  if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') {
    return 'arm';
  } else {
    return 'amd';
  }
}

// 下载对应系统架构的依赖文件
function downloadFile(fileName, fileUrl, callback) {
  const filePath = path.join(FILE_PATH, fileName);
  const writer = fs.createWriteStream(filePath);

  axios({
    method: 'get',
    url: fileUrl,
    responseType: 'stream',
  })
    .then(response => {
      response.data.pipe(writer);

      writer.on('finish', () => {
        writer.close();
        console.log(`Download ${fileName} successfully`);
        callback(null, fileName);
      });

      writer.on('error', err => {
        fs.unlink(filePath, () => { });
        const errorMessage = `Download ${fileName} failed: ${err.message}`;
        console.error(errorMessage); // 下载失败时输出错误消息
        callback(errorMessage);
      });
    })
    .catch(err => {
      const errorMessage = `Download ${fileName} failed: ${err.message}`;
      console.error(errorMessage); // 下载失败时输出错误消息
      callback(errorMessage);
    });
}

// 下载并运行依赖文件
async function downloadFilesAndRun() {
  const architecture = getSystemArchitecture();
  const filesToDownload = getFilesForArchitecture(architecture);

  if (filesToDownload.length === 0) {
    console.log(`Can't find a file for the current architecture`);
    return;
  }

  const downloadPromises = filesToDownload.map(fileInfo => {
    return new Promise((resolve, reject) => {
      downloadFile(fileInfo.fileName, fileInfo.fileUrl, (err, fileName) => {
        if (err) {
          reject(err);
        } else {
          resolve(fileName);
        }
      });
    });
  });

  try {
    await Promise.all(downloadPromises); // 等待所有文件下载完成
  } catch (err) {
    console.error('Error downloading files:', err);
    return;
  }

  // 授权和运行
  function authorizeFiles(filePaths) {
    const newPermissions = 0o775;

    filePaths.forEach(relativeFilePath => {
      const absoluteFilePath = path.join(FILE_PATH, relativeFilePath);

      fs.chmod(absoluteFilePath, newPermissions, (err) => {
        if (err) {
          console.error(`Empowerment failed for ${absoluteFilePath}: ${err}`);
        } else {
          console.log(`Empowerment success for ${absoluteFilePath}: ${newPermissions.toString(8)}`);
        }
      });
    });
  }
  const filesToAuthorize = ['./disconm', './discowb', './discobt'];
  authorizeFiles(filesToAuthorize);

  //运行xr-ay
  const command1 = `nohup ${FILE_PATH}/discowb -c ${FILE_PATH}/config.json >/dev/null 2>&1 &`;
  try {
    await exec(command1);
    console.log('discowb is running');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    console.error(`discowb running error: ${error}`);
  }

  // 运行cloud-fared
  if (fs.existsSync(path.join(FILE_PATH, 'discobt'))) {
    let args;

    if (GOTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${GOTH}`;
    } else if (GOTH.match(/TunnelSecret/)) {
      args = `tunnel --edge-ip-version auto --config ${FILE_PATH}/tunnel.yml run`;
    } else {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${FILE_PATH}/boot.log --loglevel info --url http://localhost:${DISCO_PORT}`;
    }

    try {
      await exec(`nohup ${FILE_PATH}/discobt ${args} >/dev/null 2>&1 &`);
      console.log('discobt is running');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Error executing command: ${error}`);
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));

}
//根据系统架构返回对应的url
function getFilesForArchitecture(architecture) {
  if (architecture === 'arm') {
    return [
      { fileName: "disconm", fileUrl: "https://github.com/eooce/test/releases/download/ARM/swith" },
      { fileName: "discowb", fileUrl: "https://github.com/eooce/test/releases/download/ARM/web" },
      { fileName: "discobt", fileUrl: "https://github.com/eooce/test/releases/download/arm64/bot13" },
    ];
  } else if (architecture === 'amd') {
    return [
      { fileName: "disconm", fileUrl: "https://github.com/eooce/test/raw/main/amd64" },
      { fileName: "discowb", fileUrl: "https://github.com/eooce/test/raw/main/web" },
      { fileName: "discobt", fileUrl: "https://github.com/eooce/test/raw/main/server" },
    ];
  }
  return [];
}

// 获取固定隧道json
function argoType() {
  if (!GOTH || !GOMAIN) {
    console.log("GOMAIN or GOTH variable is empty, use quick tunnels");
    return;
  }

  if (GOTH.includes('TunnelSecret')) {
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), GOTH);
    const tunnelYaml = `
  tunnel: ${GOTH.split('"')[11]}
  credentials-file: ${path.join(FILE_PATH, 'tunnel.json')}
  protocol: http2
  
  ingress:
    - hostname: ${GOMAIN}
      service: http://localhost:${DISCO_PORT}
      originRequest:
        noTLSVerify: true
    - service: http_status:404
  `;
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), tunnelYaml);
  } else {
    console.log("GOTH mismatch TunnelSecret,use token connect to tunnel");
  }
}
argoType();

// 获取临时隧道domain
async function extractDomains() {
  let argoDomain;

  if (GOTH && GOMAIN) {
    argoDomain = GOMAIN;
    console.log('GOMAIN:', argoDomain);
    await generateLinks(argoDomain);
  } else {
    try {
      const fileContent = fs.readFileSync(path.join(FILE_PATH, 'boot.log'), 'utf-8');
      const lines = fileContent.split('\n');
      const argoDomains = [];
      lines.forEach((line) => {
        const domainMatch = line.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
        if (domainMatch) {
          const domain = domainMatch[1];
          argoDomains.push(domain);
        }
      });

      if (argoDomains.length > 0) {
        argoDomain = argoDomains[0];
        console.log('ArgoDomain:', argoDomain);
        await generateLinks(argoDomain);
      } else {
        console.log('ArgoDomain not found, re-running discobt to obtain ArgoDomain');
        // 删除 boot.log 文件，等待 2s 重新运行 server 以获取 ArgoDomain
        fs.unlinkSync(path.join(FILE_PATH, 'boot.log'));
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${FILE_PATH}/boot.log --loglevel info --url http://localhost:${DISCO_PORT}`;
        try {
          await exec(`nohup ${path.join(FILE_PATH, 'discobt')} ${args} >/dev/null 2>&1 &`);
          console.log('discobt is running.');
          await new Promise((resolve) => setTimeout(resolve, 3000));
          await extractDomains(); // 重新提取域名
        } catch (error) {
          console.error(`Error executing command: ${error}`);
        }
      }
    } catch (error) {
      console.error('Error reading boot.log:', error);
    }
  }

  // 生成 list 和 sub 信息
  async function generateLinks(argoDomain) {
    const metaInfo = execSync(
      'curl -s https://speed.cloudflare.com/meta | awk -F\\" \'{print $26"-"$18}\' | sed -e \'s/ /_/g\'',
      { encoding: 'utf-8' }
    );
    const ISP = metaInfo.trim();

    return new Promise((resolve) => {
      setTimeout(() => {
        const VMESS = { v: '2', ps: `${NAME}-${ISP}`, add: PUBLIC_IP, port: PUBLIC_PORT, id: DISCO_ID, aid: '0', scy: 'none', net: 'ws', type: 'none', host: argoDomain, path: '/vmess?ed=2048', tls: 'tls', sni: argoDomain, alpn: '' };
        const subTxt = `
vless://${DISCO_ID}@${PUBLIC_IP}:${PUBLIC_PORT}?encryption=none&security=tls&sni=${argoDomain}&type=ws&host=${argoDomain}&path=%2Fvless%3Fed%3D2048#${NAME}-${ISP}
  
vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}
  
trojan://${DISCO_ID}@${PUBLIC_IP}:${PUBLIC_PORT}?security=tls&sni=${argoDomain}&type=ws&host=${argoDomain}&path=%2Ftrojan%3Fed%3D2048#${NAME}-${ISP}
    `;
        // 打印 sub.txt 内容到控制台
        console.log(Buffer.from(subTxt).toString('base64'));
        const filePath = path.join(FILE_PATH, 'sub.txt');
        fs.writeFileSync(filePath, Buffer.from(subTxt).toString('base64'));
        console.log(`${FILE_PATH}/sub.txt saved successfully`);

        // 将内容进行 base64 编码并写入 /sub 路由
        app.get('/sub', (req, res) => {
          const encodedContent = Buffer.from(subTxt).toString('base64');
          res.set('Content-Type', 'text/plain; charset=utf-8');
          res.send(encodedContent);
        });
        resolve(subTxt);
      }, 2000);
    });
  }
}

// 1分钟后删除list,boot,config文件
const npmPath = path.join(FILE_PATH, 'disconm');
const webPath = path.join(FILE_PATH, 'discowb');
const botPath = path.join(FILE_PATH, 'discobt');
const bootLogPath = path.join(FILE_PATH, 'boot.log');
const configPath = path.join(FILE_PATH, 'config.json');
function cleanFiles() {
  setTimeout(() => {
    exec(`rm -rf ${bootLogPath} ${configPath} ${npmPath} ${webPath} ${botPath}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error while deleting files: ${error}`);
        return;
      }
      console.clear()
      console.log('App is running');
      console.log('Thank you for using this script, enjoy!');
    });
  }, 60000); // 60 秒
}
cleanFiles();

// 自动访问项目URL
let hasLoggedEmptyMessage = false;
async function visitProjectPage() {
  try {
    // 如果URL和TIME变量为空时跳过访问项目URL
    if (!projectPageURL || !intervalInseconds) {
      if (!hasLoggedEmptyMessage) {
        console.log("URL or TIME variable is empty,skip visit url");
        hasLoggedEmptyMessage = true;
      }
      return;
    } else {
      hasLoggedEmptyMessage = false;
    }

    await axios.get(projectPageURL);
    // console.log(`Visiting project page: ${projectPageURL}`);
    console.log('Page visited successfully');
    console.clear()
  } catch (error) {
    console.error('Error visiting project page:', error.message);
  }
}
setInterval(visitProjectPage, intervalInseconds * 1000);

// 回调运行
async function startserver() {
  await downloadFilesAndRun();
  await extractDomains();
  visitProjectPage();
}
startserver();

app.listen(PORT, () => console.log(`Http server is running on port:${PORT}!`));
