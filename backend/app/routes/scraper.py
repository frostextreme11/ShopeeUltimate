"""
Scraper API routes.
Handles scraping job triggering and status tracking.
"""
import asyncio
import json
import threading
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlmodel import Session, select

from ..database import get_session, engine
from ..models import Product, ScrapeJob, ScrapeRequest, ScrapeJobResponse
from ..scraper import ShopeeScraper

router = APIRouter(prefix="/api", tags=["scraper"])

# Store active WebSocket connections for log streaming
active_connections: List[WebSocket] = []

# Store log messages for broadcasting
log_queue: List[dict] = []


class ConnectionManager:
    """Manages WebSocket connections for real-time log streaming."""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self._loop = None
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
    
    async def broadcast(self, message: str):
        """Send message to all connected clients."""
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                pass
    
    def broadcast_sync(self, message: str):
        """Synchronous broadcast for use in threads."""
        # Store message in queue - will be sent when WebSocket is active
        log_queue.append(json.loads(message))


manager = ConnectionManager()


def run_scrape_job_sync(job_id: int, keyword: str, max_pages: int):
    """
    Synchronous wrapper to run the async scraper in a new event loop.
    This runs in a separate thread.
    """
    import sys
    
    # On Windows, we need ProactorEventLoop for subprocess support (required by Playwright)
    if sys.platform == 'win32':
        loop = asyncio.ProactorEventLoop()
    else:
        loop = asyncio.new_event_loop()
    
    asyncio.set_event_loop(loop)
    
    try:
        loop.run_until_complete(run_scrape_job(job_id, keyword, max_pages))
    finally:
        loop.close()


async def run_scrape_job(job_id: int, keyword: str, max_pages: int):
    """
    Background task to run the scraper.
    """
    from sqlmodel import Session
    
    with Session(engine) as session:
        # Update job status to running
        job = session.get(ScrapeJob, job_id)
        if job:
            job.status = "running"
            job.started_at = datetime.utcnow()
            session.add(job)
            session.commit()
        
        products_found = 0
        error_message = None
        
        try:
            # Create scraper with sync log callback
            def log_callback(message: str):
                manager.broadcast_sync(json.dumps({
                    "type": "log",
                    "job_id": job_id,
                    "message": message
                }))
            
            scraper = ShopeeScraper(log_callback=log_callback)
            
            # Run the scraper
            products = await scraper.scrape(keyword, max_pages)
            
            # Save products to database
            for product in products:
                session.add(product)
            
            session.commit()
            products_found = len(products)
            
            manager.broadcast_sync(json.dumps({
                "type": "complete",
                "job_id": job_id,
                "products_found": products_found
            }))
            
        except Exception as e:
            error_message = str(e)
            manager.broadcast_sync(json.dumps({
                "type": "error",
                "job_id": job_id,
                "message": error_message
            }))
        
        finally:
            # Update job status
            job = session.get(ScrapeJob, job_id)
            if job:
                job.status = "completed" if not error_message else "failed"
                job.products_found = products_found
                job.error_message = error_message
                job.finished_at = datetime.utcnow()
                session.add(job)
                session.commit()


@router.post("/scrape", response_model=ScrapeJobResponse)
async def start_scrape(
    request: ScrapeRequest,
    session: Session = Depends(get_session)
):
    """
    Start a new scraping job.
    The job runs in the background and progress is streamed via WebSocket.
    """
    # Create job record
    job = ScrapeJob(
        keyword=request.keyword,
        max_pages=request.max_pages,
        status="pending"
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    
    # Start scraping in a separate thread with its own event loop
    thread = threading.Thread(
        target=run_scrape_job_sync,
        args=(job.id, request.keyword, request.max_pages),
        daemon=True
    )
    thread.start()
    
    return ScrapeJobResponse(
        id=job.id,
        keyword=job.keyword,
        status=job.status,
        products_found=job.products_found,
        created_at=job.created_at
    )


@router.get("/scrape/{job_id}", response_model=ScrapeJobResponse)
def get_scrape_job(job_id: int, session: Session = Depends(get_session)):
    """
    Get the status of a scraping job.
    """
    job = session.get(ScrapeJob, job_id)
    if not job:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Job not found")
    
    return ScrapeJobResponse(
        id=job.id,
        keyword=job.keyword,
        status=job.status,
        products_found=job.products_found,
        error_message=job.error_message,
        created_at=job.created_at,
        started_at=job.started_at,
        finished_at=job.finished_at
    )


@router.get("/scrape", response_model=List[ScrapeJobResponse])
def list_scrape_jobs(
    limit: int = 10,
    session: Session = Depends(get_session)
):
    """
    List recent scraping jobs.
    """
    statement = select(ScrapeJob).order_by(ScrapeJob.created_at.desc()).limit(limit)
    jobs = session.exec(statement).all()
    
    return [
        ScrapeJobResponse(
            id=job.id,
            keyword=job.keyword,
            status=job.status,
            products_found=job.products_found,
            error_message=job.error_message,
            created_at=job.created_at,
            started_at=job.started_at,
            finished_at=job.finished_at
        )
        for job in jobs
    ]


@router.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket):
    """
    WebSocket endpoint for real-time scraping logs.
    """
    await manager.connect(websocket)
    try:
        while True:
            # Check for queued messages and send them
            while log_queue:
                msg = log_queue.pop(0)
                await websocket.send_text(json.dumps(msg))
            
            # Small delay to prevent busy loop
            await asyncio.sleep(0.1)
            
            # Also handle incoming messages to keep connection alive
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=0.1)
            except asyncio.TimeoutError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
