"""
ShopeeHunter API - Main Application Entry Point
FastAPI server with auto-initialized SQLite database.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db
from .routes import scraper, products


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup/shutdown events.
    """
    # Startup: Initialize database
    print("🚀 Initializing ShopeeHunter database...")
    init_db()
    print("✅ Database ready!")
    
    # Install Playwright browsers if needed
    try:
        import subprocess
        print("🎭 Checking Playwright browsers...")
        result = subprocess.run(
            ["playwright", "install", "chromium"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print("✅ Playwright Chromium ready!")
    except Exception as e:
        print(f"⚠️ Playwright browser check failed: {e}")
    
    yield
    
    # Shutdown
    print("👋 ShopeeHunter shutting down...")


# Create FastAPI app
app = FastAPI(
    title="ShopeeHunter API",
    description="Scrape viral Shopee products and manage them with a futuristic dashboard",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(scraper.router)
app.include_router(products.router)


@app.get("/")
def root():
    """
    Health check endpoint.
    """
    return {
        "status": "online",
        "app": "ShopeeHunter",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
def health_check():
    """
    Detailed health check.
    """
    from .database import engine
    
    try:
        # Test database connection
        with engine.connect() as conn:
            conn.execute("SELECT 1")
        db_status = "healthy"
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"
    
    return {
        "status": "online",
        "database": db_status
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
