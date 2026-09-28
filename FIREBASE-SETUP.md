# Vehicle Loading Cloud V4 — Setup

## Firebase project
Use the existing project **vehicle-loading**. Do not create another project.

## Authentication
Enable:
- Authentication → Sign-in method → Email/Password

The existing admin account is:
- vivekdevmurari517@gmail.com

Do not put the admin password in this file or send it in chat.

## Firestore
Create the `(default)` Firestore database and publish `firestore.rules`.

Admin profile document:
- Collection: `users`
- Document ID: the admin Firebase Auth UID
- `email`: `vivekdevmurari517@gmail.com`
- `name`: `Vivek Devmurari`
- `role`: `admin`
- `uid`: the same UID

## Storage / Billing
Cloud V4 does **not** import or use Firebase Storage. Photos stay in the browser and are used to generate the local PDF. Firestore stores loading metadata and photo remarks. This avoids requiring Blaze billing for Storage.

## GitHub Pages
Upload all files in this ZIP to the root of the `newmoviesnow/vehicle_loading` repository.

After deployment, use a hard refresh: **Ctrl + Shift + R**.
The new service worker is network-first and unregisters old workers so the old login code does not remain cached.
