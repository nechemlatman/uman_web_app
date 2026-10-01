# Uman Event Manager — Web App

Responsive, installable web application based on the Uman Event Manager product definition and the supplied visual reference.

## Included screens
- Dashboard / command center with countdown, KPIs, alerts, and schedule
- People / participants
- Accommodation / apartments and assignments
- Flights
- Ground transport / drivers and vehicles
- Tasks
- Finance / payments and expenses
- Apartment issues
- Schedule
- Settings and data backup

## Working features
- Responsive mobile/desktop UI
- Hebrew/English direction and navigation toggle
- Local persistent data via browser `localStorage`
- Create/edit flows for the main entities
- Task/issue status changes
- CSV export for people
- JSON backup/export/import
- PWA manifest and service worker for install/offline use

## Run locally
Because the app uses a service worker, serve the folder through a local HTTP server rather than opening `index.html` directly.

### Windows PowerShell
```powershell
cd path\to\uman_web_app
python -m http.server 8080
```
Then open `http://localhost:8080`.

## Production data / Supabase
This delivered version is immediately usable as a local-first operational prototype. For the existing project’s two-manager real-time workflow, replace the localStorage data adapter with the project’s Supabase repositories/RLS/auth. The UI is intentionally separated from persistence to make that integration straightforward without redesigning the screens.
