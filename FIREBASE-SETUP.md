# Vehicle Loading Cloud V1 — Setup

## 1. Firebase Authentication
Already enabled in project `vehicle-loading-58584`.
Admin email:
`vivekdevmurari517@gmail.com`

## 2. Firestore
Firebase Console → Build → Firestore Database → Create database.
Start in production mode.

Then Firestore → Rules: paste `firestore.rules`.

## 3. Storage
Firebase Console → Build → Storage → Get started.
Then Storage → Rules: paste `storage.rules`.

## 4. Bootstrap admin profile
Because the app recognizes the admin email directly, no admin profile document is required for the first login.
When you create normal users from the Admin panel, their `/users/{uid}` profile is created automatically.

## 5. Authorized domain
Authentication → Settings → Authorized domains:
`newmoviesnow.github.io`

## 6. GitHub Pages
Upload all files to the root of the new repository and enable Pages from the main branch/root.

## Data model
`loadings/{loadingId}` contains userId and loading metadata.
Photos are stored in Storage under:
`loadingPhotos/{userId}/{loadingId}/...`

Normal users can only read their own loadings.
Admin can read all loadings.
