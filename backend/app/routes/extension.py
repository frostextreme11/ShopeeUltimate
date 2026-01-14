"""
Extension API routes.
Handles product data from Chrome extension scraper.
"""
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from ..database import get_session
from ..models import Product

router = APIRouter(prefix="/api/extension", tags=["extension"])


class ExtensionProduct(BaseModel):
    """Product data from Chrome extension."""
    title: str
    price: float
    original_price: Optional[float] = None
    star_rating: float = 0.0
    review_count: int = 0
    monthly_sales: int = 0
    thumbnail_url: Optional[str] = None
    video_url: Optional[str] = None
    has_video: bool = False
    original_url: str
    shop_name: Optional[str] = None
    viral_score: int = 0
    scraped_at: Optional[str] = None


class ExtensionProductsRequest(BaseModel):
    """Request payload from Chrome extension."""
    products: List[ExtensionProduct]
    keyword: str
    scraped_at: str


class ExtensionResponse(BaseModel):
    """Response to Chrome extension."""
    success: bool
    message: str
    products_saved: int = 0


@router.post("/products", response_model=ExtensionResponse)
async def receive_products(
    request: ExtensionProductsRequest,
    session: Session = Depends(get_session)
):
    """
    Receive scraped products from Chrome extension.
    Saves products to database and returns count.
    """
    saved_count = 0
    
    for ext_product in request.products:
        try:
            # Create Product model
            product = Product(
                title=ext_product.title[:200] if ext_product.title else "Unknown",
                price=ext_product.price,
                original_price=ext_product.original_price,
                currency="IDR",
                star_rating=ext_product.star_rating,
                review_count=ext_product.review_count,
                monthly_sales=ext_product.monthly_sales,
                thumbnail_url=ext_product.thumbnail_url,
                video_url=ext_product.video_url,
                has_video=ext_product.has_video,
                original_url=ext_product.original_url,
                shop_name=ext_product.shop_name,
            )
            
            # Calculate viral score if not provided
            if ext_product.viral_score > 0:
                product.viral_score = ext_product.viral_score
            else:
                product.calculate_viral_score()
            
            # Set scraped timestamp
            if ext_product.scraped_at:
                try:
                    product.scraped_at = datetime.fromisoformat(ext_product.scraped_at.replace('Z', '+00:00'))
                except:
                    product.scraped_at = datetime.utcnow()
            
            session.add(product)
            saved_count += 1
            
        except Exception as e:
            print(f"Error saving product: {e}")
            continue
    
    # Commit all products
    session.commit()
    
    return ExtensionResponse(
        success=True,
        message=f"Successfully saved {saved_count} products from extension",
        products_saved=saved_count
    )


@router.get("/status")
async def get_extension_status():
    """
    Check if backend is ready to receive extension data.
    """
    return {
        "status": "online",
        "ready": True,
        "message": "Backend ready to receive extension data"
    }


@router.delete("/products", response_model=ExtensionResponse)
async def clear_extension_products(
    session: Session = Depends(get_session)
):
    """
    Clear all products (for testing).
    """
    from sqlmodel import delete
    
    statement = delete(Product)
    session.exec(statement)
    session.commit()
    
    return ExtensionResponse(
        success=True,
        message="All products cleared",
        products_saved=0
    )
