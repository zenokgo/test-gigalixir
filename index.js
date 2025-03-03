const { spawn, execSync } = require('child_process');
const fs = require('fs');
const http = require('http');

// 
const PORT = process.env.SERVER_PORT || process.env.PORT || 4000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello World\n');
});

let currentProcess = null;

// 
const commandExists = (command) => {
  try {
    execSync(`command -v ${command}`);
    return true;
  } catch {
    return false;
  }
};

// 
const checkProcessExists = (processName) => {
  const methods = [
    // 1:
    {
      command: 'pgrep',
      check: () => {
        try {
          execSync(`pgrep ${processName}`);
          return true;
        } catch {
          return false;
        }
      }
    },
    
    // 2: pidof
    {
      command: 'pidof',
      check: () => {
        try {
          execSync(`pidof ${processName}`);
          return true;
        } catch {
          return false;
        }
      }
    },
    
    // 3: ps aux + grep
    {
      command: 'ps',
      check: () => {
        try {
          const output = execSync(`ps aux | grep "${processName}" | grep -v "grep"`).toString();
          return output.trim().length > 0;
        } catch {
          return false;
        }
      }
    },
    
    // 4:  /proc 
    {
      command: null,
      check: () => {
        try {
          const procDirs = fs.readdirSync('/proc');
          for (const dir of procDirs) {
            if (/^\d+$/.test(dir)) {
              try {
                const cmdline = fs.readFileSync(`/proc/${dir}/cmdline`, 'utf8');
                if (cmdline.includes(processName)) {
                  return true;
                }
              } catch {
                continue;
              }
            }
          }
          return false;
        } catch {
          return false;
        }
      }
    }
  ];

  // 
  const availableMethods = methods.filter(method => 
    method.command === null || commandExists(method.command)
  );

  // 
  for (const method of availableMethods) {
    if (method.check()) {
      return true;
    }
  }

  // 
  return false;
};

// 
const ensureExecutable = () => {
  try {
    if (!fs.existsSync('./start.sh')) {
      console.error('\x1b[31mError: start.sh does not exist\x1b[0m');
      process.exit(1);
    }

    const stats = fs.statSync('./start.sh');
    const mode = stats.mode;
    
    if ((mode & fs.constants.S_IXUSR) !== 0) {
      console.log('\x1b[32m✔ start.sh is already executable\x1b[0m');
      return;
    }

    try {
      execSync('chmod +x ./start.sh');
      console.log('\x1b[32m✔ Successfully set execute permission for start.sh\x1b[0m');
    } catch (error) {
      if (!fs.accessSync('./start.sh', fs.constants.X_OK)) {
        console.warn('\x1b[33m⚠ Could not set execute permission, but file appears to be executable\x1b[0m');
        return;
      }
      console.error('\x1b[31m✘ Cannot set execute permission. Please ensure start.sh is executable manually\x1b[0m');
      console.error('\x1b[36mRun: chmod +x start.sh\x1b[0m');
      process.exit(1);
    }
  } catch (error) {
    console.error('\x1b[31m✘ Error checking file permissions:', error.message, '\x1b[0m');
    process.exit(1);
  }
};

// 
const startProcess = () => {
  // 
  if (checkProcessExists('tmpapp')) {
    console.log('\x1b[32m✔ tmpapp process is already running\x1b[0m');
    return null;
  }

  console.log(`\x1b[32m➤ Starting script...\x1b[0m`);
  
  const childProcess = spawn('./start.sh', [], {
    stdio: 'pipe',
    detached: false,
    env: { ...process.env, PORT }
  });

  // 
  childProcess.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        console.log(`\x1b[36m${line}\x1b[0m`);
      }
    });
  });

  // 
  childProcess.stderr.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        console.error(`\x1b[31m${line}\x1b[0m`);
      }
    });
  });

  // 
  childProcess.on('close', (code) => {
    console.log(`\x1b[33m⚠ Process exited with code ${code}, checking status...\x1b[0m`);
    // 
    if (!checkProcessExists('tmpapp')) {
      console.log('\x1b[33m⚠ tmpapp process not found, restarting...\x1b[0m');
      setTimeout(startProcess, 1000);
    } else {
      console.log('\x1b[32m✔ tmpapp process is still running (possibly restarted externally)\x1b[0m');
    }
  });

  // 
  childProcess.on('error', (error) => {
    if (error.code === 'EACCES') {
      console.error(`\x1b[31m✘ Permission denied. Please ensure start.sh has execute permission\x1b[0m`);
      console.error('\x1b[36mRun: chmod +x start.sh\x1b[0m');
      process.exit(1);
    }
    console.error(`\x1b[31m✘ Error: ${error.message}\x1b[0m`);
    setTimeout(startProcess, 1000);
  });

  return childProcess;
};

// 
server.listen(PORT, () => {
  console.log(`\x1b[32m✔ HTTP Server running on port ${PORT}\x1b[0m`);
});

// 
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\x1b[31m✘ Port ${PORT} is already in use\x1b[0m`);
    process.exit(1);
  }
  console.error(`\x1b[31m✘ Server error: ${error.message}\x1b[0m`);
});

//
console.log(`\x1b[34m➤ Checking file permissions...\x1b[0m`);
ensureExecutable();

// 
currentProcess = startProcess();

// 
setInterval(() => {
  if (!checkProcessExists('tmpapp')) {
    console.log('\x1b[33m⚠ tmpapp process not found, attempting to restart...\x1b[0m');
    currentProcess = startProcess();
  }
}, 30000);

// 
const shutdown = () => {
  server.close(() => {
    console.log(`\x1b[34m➤ HTTP server closed\x1b[0m`);
    process.exit(0);
  });
};

// 
process.on('SIGINT', () => {
  console.log(`\x1b[34m➤ Received SIGINT. Cleaning up...\x1b[0m`);
  shutdown();
});

process.on('SIGTERM', () => {
  console.log(`\x1b[34m➤ Received SIGTERM. Cleaning up...\x1b[0m`);
  shutdown();
});
