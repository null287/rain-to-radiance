# Third-party notices

Rain to Radiance is an independent browser interaction prototype. It is not an official TikTok application and is not endorsed by TikTok, Google, Pexels, or the depicted people. All audience handles, gifts and comments in the interface are simulated.

## MediaPipe SDK
- Upstream: https://github.com/google-ai-edge/mediapipe
- Package: `@mediapipe/tasks-vision@1.1.1`; exact integrity and artifact hashes: `vendor/manifest.json`.
- License: Apache-2.0. Retain `vendor/LICENSE` and `vendor/NOTICE`. SDK files are unmodified; this prototype implements expression control, Canvas effects and face-contour collision around the SDK.
- The source package excludes downloaded SDK/WASM/model binaries. `python download_dependencies.py` retrieves the pinned official artifacts and checks hashes; it does not install npm packages or run package lifecycle scripts.

## Face Landmarker model bundle
- Pinned official artifact: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`.
- Official bundle-to-component mapping: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker#models
- All three component model cards explicitly state Apache License, Version 2.0 (checked 2026-11-02):
  - Face detector: https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf
  - Face mesh V2: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf
  - Blendshape V2: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf
- The binary bundle is unmodified. The SDK's license was not used to infer the model license; the model-card evidence above is separate.

## UI icons
- Remix Icon 4.9.1: https://github.com/Remix-Design/RemixIcon/tree/v4.9.1 ; license text: `assets/ui-icons/REMIX-ICON-LICENSE.txt` (Remix Icon License v1.0, January 2026). Used for prototype UI and recolored locally; not distributed as a competing icon library.
- IconPark SVG 1.4.2: https://github.com/bytedance/IconPark ; gift SVG derived/recolored from `@icon-park/svg@1.4.2` GiftBox. Apache-2.0 text: `assets/ui-icons/ICONPARK-LICENSE.txt`.
- These are independently licensed UI assets, not TikTok proprietary original icons.

## Pexels media
- License and usage limits: https://www.pexels.com/license/ (checked 2026-11-02).
- Smile clip: https://www.pexels.com/video/8627840/ ; locally cropped/resized video and poster stills.
- Laugh/home preview clip: https://www.pexels.com/video/5700089/ ; locally cropped/resized video and poster still.
- Ten audience photo sources: `assets/audience-avatars/SOURCES.md`; locally cropped/resized thumbnails.
- Pexels permits website/app use and modification, and prohibits implied endorsement. The pictured people are stock-media models, not actual accounts or users of this project. These media remain governed by Pexels terms, separately from original source code and icon licenses.

### Derived landing-preview geometry
`assets/preview-face-track.js` contains normalized face-oval tracks measured from the credited Pexels 5700089 clip using the pinned Face Landmarker. It is derived from that licensed preview, not a private-camera recording or an identity database. The video and its transformed preview remain subject to Pexels terms.
