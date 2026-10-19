# Lab Track

A university laboratory equipment booking and management website using React, Express and local MongoDB. The animated login and responsive student/admin workspaces use the project's blue, black and white theme.

## Features

| Students | Administrators |
| --- | --- |
| Register and sign in | Register with the private server admin code |
| Search equipment, categories, labs and availability | Add and edit individual equipment assets |
| Read usage instructions and reserved times | Mark equipment for maintenance or archive it |
| Request bookings for administrator approval | Approve requests or reject with a reason |
| Track and cancel pending/approved bookings | Record checkout and return; monitor overdue items |
| View a personal schedule | View the lab schedule and member directory |
| Edit profile and change password | View reports, export CSV and manage own account |

All records are saved in MongoDB. Dashboards refresh every 30 seconds and have a manual refresh button. Existing accounts continue to work.

## Run locally (Windows PowerShell)

Use Node.js 20.19+ and a running local MongoDB server. MongoDB Compass is a database viewer; opening Compass alone does not start the database service.

```powershell
cd "D:\Lab Tracker\Lab_Tracker"
npm install --prefix server
npm install --prefix client
```

For first-time setup, if `server/.env` does not exist, copy `server/.env.example` to `server/.env` and set your private `ADMIN_REGISTRATION_CODE`. Do not overwrite an existing `.env` or commit it. Existing terminal environment variables override the file. Restart the backend after changing configuration.

```powershell
npm run seed --prefix server
npm run dev
```

Open **http://localhost:5173**. Keep the terminal open and run this command again after restarting your computer. The launcher starts the backend on port 5000, waits for MongoDB, and starts Vite on port 5173. Healthy existing Lab Track processes are reused. Ctrl+C stops processes created by the launcher.

The database defaults to `mongodb://127.0.0.1:27017/lab_tracker`. Set `MONGODB_URI` to change it. Check **http://localhost:5000/api/health** for database status.

The seed command adds six assets marked **SAMPLE**, with `SAMPLE-` asset codes. It can be run again without overwriting existing records or duplicating samples. These are example inventory records, not verified university equipment. An administrator can edit or archive them. No default accounts or passwords are created.

## Try a complete booking

1. Register a student with a unique email and registration number, then log in.
2. Open **Equipment**, choose **Details & booking**, select a future slot and enter a purpose. Submit the request.
3. Log out and sign in as an administrator. To register an admin, use the private code in `server/.env`. Select **Admin** when logging in.
4. Open **Booking requests** and approve the request. The student sees the status in **My bookings** and **Schedule**.
5. During the approved time slot, select **Check out** when handing over the item.
6. After it is returned, select **Record return**. The booking remains in **Returned** history and reports.

Use separate browser profiles or a private window to test both roles at once; tabs in the same profile share the login cookie.

## Booking rules

- One record represents one physical item. Use separate unique asset codes for multiple units.
- Requests must start in the future, within 90 days, and last no more than 8 hours. Times are stored in UTC and displayed in the browser's local timezone.
- Every request needs administrator approval. Pending requests do not reserve a slot, so different students may request overlapping times.
- Atomic MongoDB updates prevent overlapping approvals, including simultaneous administrator actions. Consecutive slots may meet at their boundaries.
- Students cannot create duplicate overlapping pending requests for an asset or modify another student's bookings.
- Requests cannot be approved after their start time. Reject stale requests and ask students to select a new slot.
- Checkout is permitted only during the approved slot, with one checked-out booking per item. An overdue item blocks new reservations until its return is recorded.
- Maintenance blocks new requests and approvals. Resolve active approved/checked-out bookings before maintenance. Archiving also requires resolving pending requests and preserves history.
- Students see only their own booking details. Equipment schedules show reserved times without other students' identities or purposes.

## Accounts and security

Passwords are hashed with bcrypt. Emails and registration numbers are normalized and unique. Admin registration requires a private backend code; that code is not stored in user records or sent to the frontend.

Sessions last seven days, use HttpOnly/SameSite cookies, and store only a hash of the session token in MongoDB. Logout revokes the session. Changing a password requires the current password and revokes existing sessions. Profile editing cannot change a role or email. Login, registration and password changes are rate limited.

POST, PATCH, PUT and DELETE API requests require JSON and check the request origin. Use the frontend URL consistently: `localhost` and `127.0.0.1` have separate cookies. Set `CLIENT_ORIGIN` for a custom frontend origin. Public hosting requires HTTPS and `NODE_ENV=production` for Secure cookies.

This local version includes the core equipment booking workflows. Email verification, forgotten-password recovery, email/SMS notifications, institutional SSO and public hosting are not configured. Booking updates are visible inside the website.

## Architecture

- `client/src/App.jsx`: registration, login and session restoration.
- `client/src/Dashboard.jsx` / `Dashboard.css`: role-specific inventory, bookings, schedule, members, reports and account forms.
- `server/index.js` / `auth.js`: startup, authentication, sessions and origin checks.
- `server/lab.js`: authorized inventory and booking operations.
- `server/models/Equipment.js`: equipment and embedded booking history, allowing atomic schedule checks with standalone local MongoDB, without a replica set.
- `server/sample-equipment.js`: repeatable sample inventory import.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/register`, `POST /api/auth/login` | Register / authenticate |
| `GET /api/auth/me`, `POST /api/auth/logout` | Restore / revoke session |
| `GET /api/lab/equipment` | Signed-in inventory and anonymized schedules |
| `POST /api/lab/equipment`, `PATCH /api/lab/equipment/:id` | Admin inventory changes |
| `GET /api/lab/bookings` | Own bookings for students; all bookings for admin |
| `POST /api/lab/bookings` | Student request |
| `POST /api/lab/bookings/:id/action` | Approve, reject, cancel, checkout or return with role/state checks |
| `GET /api/lab/members` | Admin member directory |
| `PATCH /api/lab/profile`, `POST /api/lab/password` | Account changes |

For a large deployment, add pagination and partition older embedded booking history before approaching MongoDB's document-size limit. The current dashboard loads inventory/history together.

## Checks

```powershell
npm test --prefix server
npm run lint --prefix client
npm run build --prefix client
```

Server tests require local MongoDB. They use uniquely named temporary databases and remove only those databases afterwards. Coverage includes authentication, validation, roles, ownership, concurrent approvals/edits, maintenance, archive history, overdue returns, password revocation and sample import.

## Troubleshooting

For separate terminals, run `npm run dev` in `server` and in `client`. Starting only the client does not start the backend. `npm start` in `server` runs without automatic reload.

- **Unable to connect:** check the MongoDB service, then run the root `npm run dev`. Inspect `/api/health`.
- **Port 5173 already in use:** use the existing page or root launcher; do not start a second Vite instance.
- **Admin registration not configured:** set `ADMIN_REGISTRATION_CODE` in `server/.env`, restart the backend, and enter the same code in the form.
- **Older interface after edits:** refresh the browser. If Vite still serves cached files, restart its terminal.
- **Schedule conflict:** refresh bookings. Another request may have been approved or an item may be overdue.

## Optional Docker setup

The existing `compose.yaml` runs MongoDB, the API and nginx at **http://localhost:8080**. Configure `server/.env`, then run:

```powershell
docker compose up --build -d
docker compose exec server npm run seed
```

Docker uses its own `mongo_data` volume, separate from Windows MongoDB. nginx proxies `/api` and preserves the original host and port. If `CLIENT_ORIGIN` is set, use `http://localhost:8080` for this setup. Add HTTPS and production configuration before public hosting.

## Equipment images

Administrators can choose an optional image in **Add equipment** or **Edit equipment**, preview it, then select **Save equipment**. Choosing a replacement changes the image only after a successful save. Leaving the file field empty preserves the existing image. Both student and admin cards/details display the image; absent or unavailable images fall back to the existing instrument placeholder.

- Accepted uploads: one JPG/JPEG, PNG or WebP, at most 5 MiB (5,242,880 bytes).
- Multer bounds file and field sizes. Sharp verifies the actual decoded format, rejects corrupt/animated images and images over 25 megapixels, strips metadata, and fits images within 2000 × 2000 pixels without enlargement.
- Equipment create/edit accepts JSON as before, or multipart with the same text fields and an `image` file. Multipart requests must include an allowed `Origin`; normal frontend requests do this automatically. Only authenticated administrators reach the upload parser.
- The equipment record stores the server-generated image filename. Clients receive an `imageUrl` under `/api/lab/equipment/:id/image/:filename`. Reading images requires a valid session. Original filenames are never used for filesystem paths.
- Failed/conflicting saves remove the newly written file. Successful replacements remove the previous image. A process crash between the filesystem and database operations can leave an unused file; this does not remove the currently referenced image.
- Existing equipment needs no migration. Bookings, availability rules and authentication remain unchanged.

Local development stores images in `server/uploads/equipment` (excluded from Git and the Docker build context). Override with `EQUIPMENT_IMAGE_DIR` if needed. Docker mounts the new `equipment_images` named volume at `/app/uploads/equipment`. The existing `mongo_data` volume is unchanged. Back up both volumes together.

### Rebuild an existing Docker installation without resetting data

Use **the same Compose project name as the existing installation**. Check it with `docker compose ls`. On this laptop it is `lab_tracker` (with an underscore); using a different name selects different volumes.

From the project root in PowerShell:

```powershell
docker compose -p lab_tracker config --quiet
docker compose -p lab_tracker build server client
docker compose -p lab_tracker up -d --no-deps --wait server client
docker compose -p lab_tracker ps
```

These commands assume the existing `mongo` service is already running. If it is stopped, start it first with `docker compose -p lab_tracker up -d mongo`. No database reset, reseeding or migration is needed. Do not run `down -v`, remove volumes or change the Compose project name during the update.

Open **http://localhost:8080**. As an admin, add/edit an item, choose an image, verify its preview and save. Confirm its card/detail image as both roles. Replace the image and confirm the new image appears. To verify persistence after saving, run:

```powershell
docker compose -p lab_tracker up -d --no-deps --force-recreate --wait server client
```

Refresh and confirm the saved image remains visible. The image and MongoDB volumes stay mounted across container replacement.

### Automated image tests

```powershell
npm test --prefix server
npm run lint --prefix client
npm run build --prefix client
```

The image integration tests use a unique test database and temporary image directory. They cover all accepted formats, the exact 5 MiB boundary, corrupt/spoofed files, authorization, origin checks, concurrent replacement, cleanup after failed writes, missing files and server restarts.

To run the full server test suite inside the Docker backend image against the existing MongoDB service (only unique test databases are created/deleted):

```powershell
$testPath = (Resolve-Path ./server/test).Path
docker compose -p lab_tracker run --rm --no-deps -e TEST_MONGODB_URI=mongodb://mongo:27017 -v "${testPath}:/app/test:ro" server npm test
```

The production image deliberately excludes test files, so the command mounts them read-only. Tests never select the application's `lab_tracker` database. Test uploads use a separate temporary directory, not the persistent equipment image directory.
