# W3dding Phonograph

A frontend web application that serves as a digital video guestbook for weddings. Guests can record video messages, which are stored locally in the browser using IndexedDB.

## Features

- **Video Recording:** Guests can record their messages directly through the browser.
- **Local Storage:** Videos are saved directly to the device's browser using IndexedDB (no immediate internet connection required to save messages).
- **Admin Panel:** A protected dashboard to view storage usage and export all recorded videos.

## Tech Stack

- React
- Vite
- TypeScript
- Tailwind CSS
- Lucide React (for icons)
- Vitest & React Testing Library (for testing)

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd w3dding-phonograph
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application

To start the local development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173`.

### Building for Production

To build the application for production:

```bash
npm run build
```

The built files will be located in the `dist/` directory.

### Running Tests

To execute the test suite:

```bash
npm test
```

## Admin Panel Access

The application includes a hidden Admin Panel that allows you to monitor storage usage and export all recorded video messages.

**To access the Admin Panel:**

1. Navigate to the main recording screen (where you see the camera feed).
2. Rapidly **click the "WEDDING GUESTBOOK" header title 5 times** within a 2-second window.
3. A passcode prompt will appear.
4. Enter the correct `ADMIN_PASSCODE` to gain access to the dashboard.

Once inside, you can view the total space occupied by the videos and click "Export All" to download the backups to your device.
