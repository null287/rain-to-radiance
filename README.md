# Rain to Radiance · V10.4

[Open the live HTTPS demo](https://null287.github.io/rain-to-radiance/) · [Vibe Coding retrospective](VIBECODING.md)

A browser AR prototype: smile to fade in rain; laugh to launch continuous foreground fireworks; sparks collide with the tracked 36-point face contour. Six bloom patterns and four sizes use a 70% straight / 30% subtle S ascent sequence. Expression intensity controls firing cadence. Rain has no body collision.

The home preview plays a local prerecorded person and timeline-driven effects without requesting a camera. The two sample buttons run actual MediaPipe inference on recorded clips. Choose **开启摄像头，查看 AR 效果** for real camera inference. Comments, likes, gifts and audience entries are simulated and individually controllable.

## Run locally

Requires Node.js 22+ (validated locally with v24.15.0) and Python 3 for first-time dependency preparation. No npm installation or external inference API/key is needed.

```sh
python download_dependencies.py
python download_dependencies.py --check
node server.mjs
```

Open `http://127.0.0.1:8896/`. Start the camera only by clicking the camera button. Use localhost for local camera access, or HTTPS when hosted; opening index.html directly does not work. The source download excludes SDK/WASM/model binaries; the preparation step must complete before sample/camera modes can work. It downloads only pinned official URLs and verifies SHA-512/SHA-256. All face inference then happens on the user's device. Camera frames are not uploaded; audio is disabled.

## Tests

```sh
npm test
```

The included `test:full` script is the existing Windows/Edge local browser regression suite. Start the local service first; it uses independent test browser profiles, recorded Pexels clips and simulated input. It does not exercise a physical camera. Browser tests write local screenshots/results to `tests/`, which are ignored by Git. Test-only URLs are set to port 8896 to avoid colliding with another local demo. `src/person-depth.js` is retained for historical geometry tests, but no segmentation worker or person-segmentation model is loaded by V10.3.

## Architecture and performance

- MediaPipe Face Landmarker in a module Worker, with one inference frame in flight and stale-result checks.
- Expression state machine with smoothing, hysteresis and temporal laugh evidence.
- Canvas2D particles with adaptive inference/render budgets, bounded particle counts and DPR limits; hidden pages pause work and media is cleaned up on stop.
- Camera/object-fit/mirror projection and face center use the same smoothed face polygon. Continuous contour collision and clipped spark trails prevent visible face penetration.
- Local assets and same-origin Worker fetch guard; no CDN or external runtime inference endpoint. GitHub Pages is served with an equivalent CSP meta tag in `index.html`; platforms supporting `_headers` can preserve that file instead.

## Limits

This is a single-face 2D face-contour interaction, not complete hair/head/body segmentation. Recorded-video and desktop-emulated mobile tests do not certify a physical camera or phone. The public HTTPS release uses real camera inference. Recorded-video/automated checks remain distinct from a person testing live expressions and head movement.

## Credits and rights

See `THIRD_PARTY_NOTICES.md`, `vendor/LICENSE`, `vendor/NOTICE` and both icon license files. Public source access does not replace the separate third-party media/model/icon licenses. No new blanket open-source license is assigned to original project code in this preparation package.

## Public deployment layout

`main` contains reviewable source and pinned dependency preparation; `gh-pages` contains the reviewed static runtime including unmodified SDK/WASM/model files and licensed sample media. The live site requests the camera only after an explicit click and processes frames on the device. No external inference API or user-account integration is required.

## Camera selection

For a connected phone webcam, open Settings → 选择摄像头 → 刷新列表 and select the shared camera, then start the camera. The device must already be enabled/connected in Windows or macOS. Selection uses an exact device ID and never silently substitutes a different camera. Device IDs remain in memory, and audio capture stays disabled. Some browsers require camera permission before all device names are shown.
