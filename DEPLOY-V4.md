# Vehicle Loading Cloud V4 — User Profile Fix

This build fixes the Admin → Create User flow and missing Firestore user profiles.

## What changed
- Admin creates the Firebase Authentication account using a secondary Firebase Auth instance, so the admin session stays logged in.
- The app writes `users/{newUserUid}` using the primary admin session.
- The app verifies the Firestore profile before showing “User created successfully”.
- If an existing authenticated user has no Firestore profile, the app creates a safe `role: user` profile automatically on login.
- Firestore rules allow a signed-in user to create only their own profile with `role: user`; users cannot self-promote to admin.
- Cache/version bumped to V4.
- Firebase project remains `vehicle-loading` and the current Firebase Web API key is included in `firebase-config.js`.

## Firestore rules
Publish the included `firestore.rules` in Firebase Console → Firestore Database → Rules.

## Deployment
Upload/replace all files in the root of the `newmoviesnow/vehicle_loading` GitHub repository.
Then open the GitHub Pages site and press Ctrl+Shift+R.
