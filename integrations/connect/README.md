# Campus Connect

Local companion for installing and managing reviewed MCP integrations through the Campus relay. The client runs on macOS and Windows and does not require campus-cli. Packet Tracer is the first independently downloaded integration.

This directory contains only the local client, its package builder, tests and public integration metadata. Campus account services, credentials, student data and backend code are not included.

## Build

Use Python 3.13 on the target operating system:

```sh
python -m pip install --require-hashes -r integrations/connect/requirements.lock
python -m pip install --no-deps --require-hashes -r integrations/connect/plugins/packet-tracer/requirements.lock
python integrations/connect/build.py --output connect-artifact
python -m unittest discover -s integrations/connect -p 'test_*.py'
```

The builder verifies the frozen executable with the real separate MCP package. Cisco Packet Tracer is installed separately; builds and offline tests do not install its extension or modify a laboratory.

The beta has no publisher signature/notarization. Each integration requires explicit local activation. Packages run with the current user's privileges; this is not an operating-system sandbox and arbitrary GitHub MCP servers cannot be imported. The upstream Packet Tracer MCP is pinned to 0.12.0 and its MIT notice is included. Campus fonts and brand assets are included for the client UI.
