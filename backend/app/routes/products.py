"""
Product API routes.
Handles product listing, filtering, and video downloads.
"""
import os
import httpx
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from ..database import get_session
from ..models import Product, ProductResponse
from ..utils.affiliate import convert_to_affiliate_link

router = APIRouter(prefix="/api", tags=["products"])

# Downloads folder path
DOWNLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "downloads")


@router.get("/products", response_model=List[ProductResponse])
def list_products(
    sort_by: str = Query(default="viral_score", description="Sort field"),
    order: str = Query(default="desc", description="Sort order: asc or desc"),
    has_video: Optional[bool] = Query(default=None, description="Filter by video availability"),
    min_rating: Optional[float] = Query(default=None, description="Minimum star rating"),
    min_viral_score: Optional[int] = Query(default=None, description="Minimum viral score"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session)
):
    """
    List products with sorting and filtering.
    Default sort is by viral_score descending.
    """
    # Build query
    statement = select(Product)
    
    # Apply filters
    if has_video is not None:
        statement = statement.where(Product.has_video == has_video)
    
    if min_rating is not None:
        statement = statement.where(Product.star_rating >= min_rating)
    
    if min_viral_score is not None:
        statement = statement.where(Product.viral_score >= min_viral_score)
    
    # Apply sorting
    sort_column = getattr(Product, sort_by, Product.viral_score)
    if order == "desc":
        statement = statement.order_by(sort_column.desc())
    else:
        statement = statement.order_by(sort_column.asc())
    
    # Apply pagination
    statement = statement.offset(offset).limit(limit)
    
    products = session.exec(statement).all()
    
    return [
        ProductResponse(
            id=p.id,
            title=p.title,
            price=p.price,
            original_price=p.original_price,
            currency=p.currency,
            star_rating=p.star_rating,
            review_count=p.review_count,
            monthly_sales=p.monthly_sales,
            viral_score=p.viral_score,
            thumbnail_url=p.thumbnail_url,
            video_url=p.video_url,
            has_video=p.has_video,
            original_url=p.original_url,
            affiliate_url=p.affiliate_url,
            shop_name=p.shop_name,
            scraped_at=p.scraped_at
        )
        for p in products
    ]


@router.get("/products/{product_id}", response_model=ProductResponse)
def get_product(product_id: int, session: Session = Depends(get_session)):
    """
    Get a single product by ID.
    """
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    return ProductResponse(
        id=product.id,
        title=product.title,
        price=product.price,
        original_price=product.original_price,
        currency=product.currency,
        star_rating=product.star_rating,
        review_count=product.review_count,
        monthly_sales=product.monthly_sales,
        viral_score=product.viral_score,
        thumbnail_url=product.thumbnail_url,
        video_url=product.video_url,
        has_video=product.has_video,
        original_url=product.original_url,
        affiliate_url=product.affiliate_url,
        shop_name=product.shop_name,
        scraped_at=product.scraped_at
    )


@router.post("/products/{product_id}/affiliate")
def generate_affiliate_link(
    product_id: int,
    affiliate_id: Optional[str] = None,
    session: Session = Depends(get_session)
):
    """
    Generate an affiliate link for a product.
    """
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    affiliate_url = convert_to_affiliate_link(product.original_url, affiliate_id)
    
    # Update product with affiliate URL
    product.affiliate_url = affiliate_url
    session.add(product)
    session.commit()
    
    return {
        "product_id": product_id,
        "original_url": product.original_url,
        "affiliate_url": affiliate_url
    }


@router.get("/download-video")
async def download_video(
    product_id: int,
    session: Session = Depends(get_session)
):
    """
    Download a product video to local folder.
    Returns the local file path on success.
    """
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    if not product.video_url:
        raise HTTPException(status_code=400, detail="Product has no video")
    
    # Ensure downloads directory exists
    os.makedirs(DOWNLOADS_DIR, exist_ok=True)
    
    # Generate filename
    safe_title = "".join(c if c.isalnum() or c in "- " else "_" for c in product.title[:50])
    filename = f"{product.id}_{safe_title}.mp4"
    filepath = os.path.join(DOWNLOADS_DIR, filename)
    
    # Download video
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(product.video_url, follow_redirects=True, timeout=60.0)
            response.raise_for_status()
            
            with open(filepath, "wb") as f:
                f.write(response.content)
        
        return {
            "success": True,
            "product_id": product_id,
            "filename": filename,
            "filepath": filepath,
            "size_bytes": os.path.getsize(filepath)
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download video: {str(e)}")


@router.delete("/products/{product_id}")
def delete_product(product_id: int, session: Session = Depends(get_session)):
    """
    Delete a product by ID.
    """
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    session.delete(product)
    session.commit()
    
    return {"success": True, "deleted_id": product_id}


@router.delete("/products")
def clear_all_products(session: Session = Depends(get_session)):
    """
    Delete all products from the database.
    Use with caution!
    """
    statement = select(Product)
    products = session.exec(statement).all()
    
    count = len(products)
    for product in products:
        session.delete(product)
    
    session.commit()
    
    return {"success": True, "deleted_count": count}


@router.get("/stats")
def get_stats(session: Session = Depends(get_session)):
    """
    Get dashboard statistics.
    """
    from sqlmodel import func
    
    # Total products
    total_products = session.exec(select(func.count(Product.id))).one()
    
    # Products with video
    videos_count = session.exec(
        select(func.count(Product.id)).where(Product.has_video == True)
    ).one()
    
    # Average viral score
    avg_viral = session.exec(select(func.avg(Product.viral_score))).one() or 0
    
    # Top viral products
    top_viral = session.exec(
        select(Product).order_by(Product.viral_score.desc()).limit(5)
    ).all()
    
    return {
        "total_products": total_products,
        "products_with_video": videos_count,
        "average_viral_score": round(avg_viral, 2),
        "top_viral_products": [
            {"id": p.id, "title": p.title[:50], "viral_score": p.viral_score}
            for p in top_viral
        ]
    }
