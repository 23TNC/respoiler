docker run -it --rm `
  -p 3000:3000 `
  -v "${PSScriptRoot}/data:/home/spacetime/.local/share/spacetime/data" `
  -v "${PSScriptRoot}/keys:/etc/spacetimedb" `
  -v "${PSScriptRoot}/server:/workspace/server" `
  -v "${PSScriptRoot}/../pixijs:/workspace/pixijs" `
  -w /workspace/server `
  --entrypoint /bin/bash `
  clockworklabs/spacetime
