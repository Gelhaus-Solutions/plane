# Security policy

This policy covers this repository, the Gelhaus Solutions hard fork of Plane, and the images built from it (`ghcr.io/gelhaus-solutions/plane-*`).

## Reporting a vulnerability

Report it privately through GitHub: open a [private vulnerability report](https://github.com/Gelhaus-Solutions/plane/security/advisories/new) on this repository. Do not open a public issue or pull request for it.

Include what is needed to reproduce and assess the issue: the affected version, image tag or commit, the steps, and the impact you observed.

Plane Software, Inc. does not handle reports about this fork, so do not send them to upstream's security address. If the vulnerability is in code this fork shares with upstream Plane, upstream is affected as well, and you may report it to them separately under [their policy](https://github.com/makeplane/plane/security/policy).

## Guidelines

- Keep the vulnerability confidential until it has been fixed and a disclosure has been agreed.
- Test only against instances you own or are authorised to test. Do not run automated scans against other people's instances.
- Do not access, alter or delete data that is not yours, and do not use social engineering, physical attacks or denial of service.

## Out of scope

- Attacks that need a man-in-the-middle position or physical access to a user's device.
- Content spoofing or text injection without a clear attack vector.
- Email spoofing, and missing DNSSEC, CAA or CSP headers.
- Missing secure or HTTP-only flags on non-sensitive cookies.

## What you can expect

Reports are acknowledged and investigated, you are kept informed while a fix is prepared, and with your permission you are credited once it is released. No legal action is taken against anyone who reports in good faith and follows these guidelines.
