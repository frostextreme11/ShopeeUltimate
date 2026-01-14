"""
Affiliate link utilities.
Placeholder functions for converting Shopee URLs to affiliate links.
"""
import re
from urllib.parse import urlparse, urlencode, parse_qs


def convert_to_affiliate_link(original_url: str, affiliate_id: str = None) -> str:
    """
    Convert a Shopee product URL to an affiliate link.
    
    This is a placeholder function. To implement actual affiliate links:
    1. Register with Shopee Affiliate Program
    2. Get your affiliate ID
    3. Use Shopee's official affiliate link format
    
    Args:
        original_url: The original Shopee product URL
        affiliate_id: Your Shopee affiliate ID (optional)
    
    Returns:
        The affiliate-formatted URL (or original if no affiliate ID)
    """
    if not affiliate_id:
        # Return placeholder format
        return f"{original_url}?affiliate=YOUR_AFFILIATE_ID"
    
    # Parse the original URL
    parsed = urlparse(original_url)
    
    # Shopee affiliate link format (example - actual format may vary)
    # This is a placeholder implementation
    affiliate_params = {
        "af_id": affiliate_id,
        "utm_source": "affiliate",
        "utm_medium": "shopeehunter"
    }
    
    # Add affiliate parameters
    existing_params = parse_qs(parsed.query)
    existing_params.update(affiliate_params)
    
    # Reconstruct URL with affiliate parameters
    new_query = urlencode(existing_params, doseq=True)
    affiliate_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}?{new_query}"
    
    return affiliate_url


def extract_product_id(shopee_url: str) -> str:
    """
    Extract product ID from Shopee URL.
    
    Shopee URLs typically follow formats like:
    - https://shopee.co.id/Product-Name-i.123456789.987654321
    - https://shopee.co.id/product/123456789/987654321
    
    Returns:
        The product ID (shop_id.item_id format)
    """
    # Pattern for i.{shop_id}.{item_id} format
    pattern1 = r'-i\.(\d+)\.(\d+)'
    match1 = re.search(pattern1, shopee_url)
    if match1:
        return f"{match1.group(1)}.{match1.group(2)}"
    
    # Pattern for /product/{shop_id}/{item_id} format
    pattern2 = r'/product/(\d+)/(\d+)'
    match2 = re.search(pattern2, shopee_url)
    if match2:
        return f"{match2.group(1)}.{match2.group(2)}"
    
    return ""


def generate_shopee_app_link(product_id: str) -> str:
    """
    Generate a deep link for Shopee mobile app.
    
    Args:
        product_id: Product ID in shop_id.item_id format
    
    Returns:
        Deep link URL for Shopee app
    """
    if not product_id or "." not in product_id:
        return ""
    
    shop_id, item_id = product_id.split(".")
    return f"shopee://product/{shop_id}/{item_id}"
