# Vehicle Loading Cloud V7

This build uses the Firestore Lite REST-only web SDK instead of the full Firestore WebChannel client. It keeps Firebase Authentication and Firestore Security Rules unchanged.

Deploy all files to GitHub Pages. Hard refresh with Ctrl+Shift+R. The footer/build label should show Cloud V7.

Firestore Lite is online-only; the app already uses explicit get/set/query operations and does not use realtime listeners.
