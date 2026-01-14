# ShopeeHunter

A sophisticated, local Shopee Scraper & Dashboard with a futuristic cyberpunk UI.

![ShopeeHunter](https://via.placeholder.com/800x400?text=ShopeeHunter+Dashboard)

## Features

- 🔍 **Smart Scraping**: Playwright with stealth plugin to avoid detection
- 📊 **Viral Score**: Automatically calculates product virality (sales + reviews)
- 🎬 **Video Extraction**: Intercepts and downloads product videos
- 🎨 **Cyberpunk UI**: Dark theme with neon accents and smooth animations
- 📡 **Real-time Logs**: WebSocket-powered terminal for live scraping updates
- 🗃️ **Zero-Config Database**: SQLite auto-creates on first run

## Tech Stack

**Backend:**
- FastAPI
- SQLModel + SQLite
- Playwright + playwright-stealth

**Frontend:**
- React + Vite
- Tailwind CSS
- Framer Motion
- React Query

## Quick Start

### Windows
```bash
# Double-click run.bat or:
cd shopeehunter
run.bat
```

### macOS / Linux
```bash
cd shopeehunter
chmod +x run.sh
./run.sh
```

The scripts will automatically:
1. Create Python virtual environment
2. Install backend dependencies
3. Install Playwright browsers
4. Install frontend dependencies
5. Start both servers

## Manual Setup

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
source venv/bin/activate  # Unix
pip install -r requirements.txt
playwright install chromium
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Usage

1. Open `http://localhost:5173` in your browser
2. Enter a search keyword (e.g., "headphone bluetooth")
3. Select number of pages to scrape (1-10)
4. Click "Start Scrape"
5. Watch real-time logs in the terminal panel
6. Browse and filter your scraped products

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scrape` | POST | Start scraping job |
| `/api/products` | GET | List products (sortable/filterable) |
| `/api/download-video` | GET | Download product video |
| `/api/stats` | GET | Dashboard statistics |
| `/api/ws/logs` | WS | Real-time scraping logs |

## Important Notes

⚠️ **Anti-Bot Measures**: Shopee employs aggressive detection. The stealth plugin helps, but occasional blocks may occur.

⚠️ **Video Extraction**: Some videos use encrypted streams that cannot be downloaded.

## License

MIT
