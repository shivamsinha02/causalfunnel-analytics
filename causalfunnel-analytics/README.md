# CausalFunnel Analytics

A full-stack web analytics dashboard for tracking user events, monitoring sessions, and visualizing user interaction data through heatmaps.

## 🚀 Live Demo

- **Frontend Dashboard:** [Open CausalFunnel Analytics](https://causalfunnel-analytics-rho.vercel.app/)
- **Backend API:** [Open Backend](https://causalfunnel-analytics-tl6q.onrender.com/)
- **GitHub Repository:** [View Source Code](https://github.com/shivamsinha02/causalfunnel-analytics)

## ✨ Features

- **Event Tracking:** Collect user interaction events through a tracking script.
- **Session Analytics:** View recorded user sessions and session activity.
- **Event Analytics:** Access event data and event counts through the dashboard.
- **Heatmap Analytics:** Explore page-level user interaction data.
- **REST API:** Flask-powered endpoints for retrieving analytics data.
- **Persistent Storage:** Store analytics data in MongoDB.
- **Live Deployment:** React frontend hosted on Vercel and Flask backend hosted on Render.

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite, JavaScript |
| Backend | Python, Flask, REST API |
| Database | MongoDB Atlas, PyMongo |
| Tracking | JavaScript |
| Frontend Hosting | Vercel |
| Backend Hosting | Render |
| Version Control | Git, GitHub |

## 🏗️ Architecture

```text
             User / Website
                    |
                    v
          JavaScript Tracking Script
                    |
                    v
             Flask REST API
                    |
                    v
              MongoDB Atlas
                    |
                    v
          Analytics API Endpoints
                    |
                    v
          React Analytics Dashboard
                 (Vercel)
```

The tracking script sends interaction data to the backend. Flask processes the incoming requests and works with MongoDB to store and retrieve analytics data. The React dashboard fetches analytics information through the REST API and presents it to the user.

## 📁 Project Structure

```text
causalfunnel-analytics/
├── frontend/             # React + Vite dashboard
├── backend/
│   ├── app.py            # Flask application and API routes
│   ├── requirements.txt  # Python dependencies
│   └── ...               # Backend modules and configuration
├── tracker/
│   └── tracker.js        # JavaScript tracking script
├── .gitignore
└── README.md
```

## ⚙️ Run Locally

### Prerequisites

- Python 3.10 or later
- Node.js and npm
- MongoDB Atlas account or a MongoDB instance

### 1. Clone the repository

```bash
git clone https://github.com/shivamsinha02/causalfunnel-analytics.git
cd causalfunnel-analytics
```

### 2. Configure and start the backend

```bash
cd backend

python -m venv venv
```

Activate the virtual environment:

**Windows**
```bash
venv\Scripts\activate
```

**macOS/Linux**
```bash
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Configure the following environment variables with your MongoDB connection details:

```env
MONGO_URI=your_mongodb_connection_string
MONGO_DB=causalfunnel
```

Start the Flask application using the entry point configured in `app.py`:

```bash
python app.py
```

Use the local backend URL configured by the application, typically `http://localhost:5000`.

### 3. Start the frontend

Open another terminal:

```bash
cd frontend
npm install
```

Create a `.env` file in the `frontend` directory:

```env
VITE_API_URL=http://localhost:5000
```

Start the development server:

```bash
npm run dev
```

Open the local URL printed by Vite in your terminal.

> Keep your MongoDB credentials in environment variables. Do not commit `.env` files or database passwords to GitHub.

## 🔌 API Endpoints

The backend provides REST endpoints for health checks, event tracking, session analytics, and heatmap data.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Check backend health |
| GET | `/api/events` | Retrieve event data |
| GET | `/api/sessions` | Retrieve session data |
| GET | `/api/heatmap/pages` | Retrieve pages represented in heatmap data |
| GET | `/demo/` | Access the demo page |
| GET | `/tracker.js` | Serve the JavaScript tracking script |

Base URL for the deployed backend:

```text
https://causalfunnel-analytics-tl6q.onrender.com
```

## ☁️ Deployment

### Frontend — Vercel

- Root directory: `frontend`
- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable:

```env
VITE_API_URL=https://causalfunnel-analytics-tl6q.onrender.com
```

### Backend — Render

- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `gunicorn app:app`
- Environment variables:

```env
MONGO_URI=your_mongodb_connection_string
MONGO_DB=causalfunnel
```

The deployed frontend communicates with the backend through the configured API URL, while MongoDB Atlas provides persistent data storage.

## 🧪 Testing the Application

1. Open the [live dashboard](https://causalfunnel-analytics-rho.vercel.app/).
2. Open the deployed backend's `/demo/` route to access the demo page.
3. Interact with the demo page to generate tracking events.
4. Return to the dashboard and refresh it.
5. Verify that sessions, events, and heatmap information appear when data has been collected successfully.

The dashboard may show empty states until tracking events have been generated and saved successfully.

## 🔐 Configuration and Security

- Store database credentials in environment variables.
- Configure MongoDB Atlas network access according to the deployment environment.
- Restrict CORS to trusted origins before production use.
- Add appropriate authentication and authorization before exposing sensitive analytics data.

## 🎯 Project Objective

CausalFunnel Analytics demonstrates a full-stack analytics workflow combining client-side event collection, a Flask REST API, MongoDB persistence, and a React dashboard. The project focuses on understanding user activity and presenting collected interaction data through a centralized analytics interface.

## 👨‍💻 Author

**Shivam Sinha**

- GitHub: [@shivamsinha02](https://github.com/shivamsinha02)
- Project Repository: [CausalFunnel Analytics](https://github.com/shivamsinha02/causalfunnel-analytics)

---

Built with React, Flask, and MongoDB.
