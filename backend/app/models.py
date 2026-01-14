"""
Database models for ShopeeHunter.
Uses SQLModel for seamless SQLite integration with Pydantic validation.
"""
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class Product(SQLModel, table=True):
    """
    Scraped product data from Shopee.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    
    # Basic product info
    title: str = Field(index=True)
    price: float
    original_price: Optional[float] = None
    currency: str = Field(default="IDR")
    
    # Ratings and sales
    star_rating: float = Field(default=0.0)
    review_count: int = Field(default=0)
    monthly_sales: int = Field(default=0)
    
    # Calculated viral score: monthly_sales + review_count
    viral_score: int = Field(default=0, index=True)
    
    # Media
    thumbnail_url: Optional[str] = None
    video_url: Optional[str] = None
    has_video: bool = Field(default=False)
    
    # URLs
    original_url: str
    affiliate_url: Optional[str] = None
    
    # Metadata
    shop_name: Optional[str] = None
    shop_location: Optional[str] = None
    scraped_at: datetime = Field(default_factory=datetime.utcnow)
    
    def calculate_viral_score(self) -> int:
        """Calculate and update the viral score."""
        self.viral_score = self.monthly_sales + self.review_count
        return self.viral_score


class ScrapeJob(SQLModel, table=True):
    """
    Tracks scraping jobs and their status.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    
    # Job configuration
    keyword: str  # Search keyword or category URL
    max_pages: int = Field(default=3)
    
    # Status tracking
    status: str = Field(default="pending")  # pending, running, completed, failed
    products_found: int = Field(default=0)
    error_message: Optional[str] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


# Pydantic models for API requests/responses
class ScrapeRequest(SQLModel):
    """Request model for starting a scrape job."""
    keyword: str
    max_pages: int = Field(default=3, ge=1, le=10)


class ScrapeJobResponse(SQLModel):
    """Response model for scrape job status."""
    id: int
    keyword: str
    status: str
    products_found: int
    error_message: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class ProductResponse(SQLModel):
    """Response model for product data."""
    id: int
    title: str
    price: float
    original_price: Optional[float] = None
    currency: str
    star_rating: float
    review_count: int
    monthly_sales: int
    viral_score: int
    thumbnail_url: Optional[str] = None
    video_url: Optional[str] = None
    has_video: bool
    original_url: str
    affiliate_url: Optional[str] = None
    shop_name: Optional[str] = None
    scraped_at: datetime
