# Lab Track

Lab Track is a University Lab Equipment Booking and Management System.

Students will be able to view available laboratory equipment and request bookings. Administrators will be able to manage equipment, review booking requests, and monitor availability.

## Completed: registration and login

- Student and admin registration, validation, and password hashing
- Unique email addresses and student registration numbers
- Server-side admin registration code and login role checks
- MongoDB-backed sessions lasting seven days, restored after refresh or restart
- Signed-in account page and logout that revokes the session
- Protected account endpoint and admin-only profile endpoint
- Expired/deleted-account session rejection and login/registration attempt limits

## Planned features

- View available equipment
- Request equipment bookings
- Administrator approval or rejection of requests
- Equipment and booking management

## Technologies

- Frontend: React
- Backend: Node.js and Express
- Database: MongoDB

## Run locally (Windows PowerShell)

Make sure the local **MongoDB** Windows service is running. MongoDB Compass is a
database viewer; the MongoDB server service must also be running.

From the project folder, start both the backend and frontend with one command:

```powershell
cd "D:\Lab Tracker\Lab_Tracker"
npm run dev
```

Keep that terminal open while using the app. Run this command again after
restarting your computer. It starts the backend on port 5000, waits for MongoDB,
then starts the frontend on port 5173. Existing healthy Lab Track servers are
reused. Press Ctrl+C to stop only the servers started by this command.

If dependencies have not been installed yet, run `npm install --prefix server`
and `npm install --prefix client` first. The root launcher needs no dependencies.
For custom ports, use the separate-terminal commands below and update the proxy.

If the page says it cannot connect, the frontend may be running without the
backend. Starting only `npm run dev` inside `client` does not start the backend.
Use the command above; the page retries its connection automatically.

### Starting each server separately

Start the backend in one terminal:

```powershell
cd server
npm install
npm start
```

Use `npm run dev` instead of `npm start` while editing the backend to reload it
automatically when files change. Otherwise stop the old process with Ctrl+C and
restart it after edits. Use Node.js 20.19+ (this project was checked on 20.20).

The backend connects to `mongodb://127.0.0.1:27017/lab_tracker` and listens on port
5000. Open `http://localhost:5000/api/health` to check the database connection.
You can override the database address using the `MONGODB_URI` environment variable.

Start the frontend in a second terminal, from the project folder:

```powershell
cd client
npm install
npm run dev
```

Open `http://localhost:5173`. Vite forwards
`/api` requests to the backend on port 5000. If you change the backend port, also
update `client/vite.config.js`.

Student registration saves the name, email, registration number, role, and a
hashed password in `lab_tracker.users`. Email addresses and registration numbers
are trimmed, lowercased, and unique. After registration, the form returns to login.
Existing accounts can still log in.

For admin registration, set a private code in the **backend terminal before
starting the server**:

```powershell
$env:ADMIN_REGISTRATION_CODE = 'replace-with-your-own-private-code'
npm start
```

Use that code in the Admin Code field. Admin registration is disabled until this
variable is set; student registration does not need it. The code is never saved
in a user record or sent to the frontend. To keep the configuration between
terminal sessions, copy `server/.env.example` to `server/.env`, enter your own
private code, and restart the backend. The server loads this file at startup;
it is excluded from Git. Existing environment variables take precedence.

## Login behavior

Successful login shows the saved account's name, email, registration number
(students), and role. Existing accounts created before the registration fix can
still log in; missing old profile fields display "Not provided".

The browser keeps an HttpOnly, SameSite=Strict cookie. Only a SHA-256 hash of its
random session token is stored in `lab_tracker.sessions`. Sessions expire after
seven days; refreshing the page or restarting the server does not log users out.
Logout removes the session from MongoDB and clears the cookie. The page checks
the session again when the browser window gains focus.

- `POST /api/auth/register`: create an account; does not automatically log in.
- `POST /api/auth/login`: verify credentials/selected role and create a session.
- `GET /api/auth/me`: restore the current account; requires a valid session.
- `POST /api/auth/logout`: revoke the browser's session.
- `GET /api/admin/profile`: requires a valid administrator session.

All POST requests require JSON and enforce the request origin when provided.
Use the Vite frontend URL consistently (switching between `localhost` and
`127.0.0.1` uses different cookies). Development allows the Vite origin on port
5173 and direct same-origin requests. If using a different frontend origin or
deploying behind a proxy, set `CLIENT_ORIGIN` to the exact frontend origin.
Production hosting must use HTTPS and `NODE_ENV=production`
to enable Secure cookies. Login and registration each allow 30 attempts per IP
per 15 minutes; these limits reset on server restart.

This milestone ends at the signed-in account screen. Equipment booking and
management screens are future work. Email verification and password recovery
are not part of this milestone.

## Checks

Run `npm test` in `server` while local MongoDB is running. Integration tests use
a separate temporary database and remove it afterwards, leaving `lab_tracker`
untouched. Run `npm run lint` and `npm run build` in `client`.

To verify manually: register a new student, log in, refresh and confirm the
account page remains, then log out and refresh to confirm the login form returns.
Wrong passwords and selecting Admin for a student account must fail.

