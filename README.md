# Clip Studio

Clip Studio is a lightweight, local-first workspace for shaping gaming and
livestream highlights. Upload a video from your device, preview it on a
landscape or vertical canvas, arrange text and facecam overlays, and work with
the trim timeline.

This repository currently provides the editor interface and browser preview.
Video export, automatic caption generation, and persistent project storage are
not implemented yet. Uploaded videos stay in the browser and are not sent to a
server.

## Run locally

Use Node.js 18 or newer:

```sh
npm start
```

Open <http://127.0.0.1:3000>. Run the static-host checks with:

```sh
npm test
```

The site has no runtime package dependencies. The Node server only serves the
allowlisted static editor files.
