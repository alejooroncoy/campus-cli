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

## Packet Tracer integration 0.2.1

The independently versioned package adds bounded IOS edits to existing routers and switches, configuration readback, new devices and links, host IPv4 configuration, activity status and saving a new `.pka` copy. The existing 21 operations remain available with package 0.2.0. New tools require a local package update and consent; Campus Connect itself stays at 0.2.0 on Windows and both Mac architectures.

The Campus adapter in `plugins/packet-tracer/editing.py` wraps the pinned vendor API. Raw CLI, JavaScript, arbitrary paths and overwrites remain unavailable. IOS batches may apply partially: inspect every result and read back before repeating. Saving checks that a new nonempty file exists; activity answers, grading and password protections are unchanged. WPA2/client profiles still require Cisco's UI and live verification.

## Packet Tracer package 0.2.2

Adds bounded DHCP/DNS/HTTP service operations, simulated client DNS/web checks, SSID settings, IOS config saving, SSHv2/ACL configuration, RSA generation with known prompts only and SSH login tests with lab secrets redacted from all result surfaces. Reads leave service state and wireless associations unchanged. Reopening accepts only existing workspace .pka files and never supplies an activity password. WPA2/client profiles retain the upstream API limitation. The host stays 0.2.0 and reviewed package versions keep their supported operations.

Package 0.2.3 preserves upstream error flags and late session failures after successful SSH authentication, and reports a disconnected bridge as an MCP error. Package 0.2.2 was superseded before the relay rollout; SSH tests require 0.2.3.

Package 0.2.4 adds `pt_read_course_activity`, which opens and reads a `.pka` activity or `.pkt` project from the student's course only when the student asks for it. Opening replaces whatever is open in Packet Tracer, so the request carries an explicit `confirmReplace: true` after asking the student. The Campus relay mints a one-use course file link; the computer receives only that link, a safe ASCII file name and a request digest. The package accepts only `<app relay origin>/d/<token>` (no redirects or proxies), downloads up to 50 MB within 90 seconds into a new file inside Documents/Campus/PacketTracer (never overwriting or following links) and opens it with the pinned vendor tools. It returns the activity instructions as text, the visible progress and the working topology. It never returns the assessed tree, answer network, points or feedback, nor local paths. Password-protected activities, or activities whose state cannot be read, are never reported as unlocked. Older packages keep running their operations; each new operation requires its `minPackageVersion`.
