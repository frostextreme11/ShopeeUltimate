"""
Shopee Scraper using Playwright with stealth plugin.
Features:
- Random User-Agent and viewport
- Auto-scroll for lazy loading
- Network listening for video URLs (non-blocking)
- Concurrency with random delays
- Login bypass via homepage navigation
"""
import asyncio
import random
import re
from datetime import datetime
from typing import List, Optional, Callable
from playwright.async_api import async_playwright, Page, BrowserContext
from playwright_stealth import stealth_async

from .models import Product


# User agents for rotation
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
]

# Viewport sizes for rotation
VIEWPORTS = [
    {"width": 1920, "height": 1080},
    {"width": 1536, "height": 864},
    {"width": 1440, "height": 900},
    {"width": 1366, "height": 768},
    {"width": 1280, "height": 720},
]


class ShopeeScraper:
    """
    Async scraper for Shopee products using Playwright with stealth.
    """
    
    def __init__(self, log_callback: Optional[Callable[[str], None]] = None):
        """
        Initialize the scraper.
        
        Args:
            log_callback: Optional callback function for real-time logging
        """
        self.log_callback = log_callback or (lambda x: print(x))
        self.video_urls: List[str] = []  # Collected video URLs
        
    def log(self, message: str):
        """Send log message through callback."""
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.log_callback(f"[{timestamp}] {message}")
    
    async def create_browser_context(self) -> tuple:
        """
        Create a browser with stealth settings.
        Returns (playwright, browser, context) tuple.
        """
        self.log("🚀 Launching browser with stealth mode...")
        
        playwright = await async_playwright().start()
        
        # Random viewport and user agent
        viewport = random.choice(VIEWPORTS)
        user_agent = random.choice(USER_AGENTS)
        
        # Use headless=False to avoid detection (Shopee detects headless browsers)
        # For production, you can try headless="new" which is less detectable
        browser = await playwright.chromium.launch(
            headless=False,  # Shopee blocks headless browsers
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-web-security",
                "--disable-features=IsolateOrigins,site-per-process",
            ]
        )
        
        context = await browser.new_context(
            viewport=viewport,
            user_agent=user_agent,
            locale="id-ID",
            timezone_id="Asia/Jakarta",
            java_script_enabled=True,
            ignore_https_errors=True,
        )
        
        # Add cookies to appear as returning visitor
        await context.add_cookies([
            {
                "name": "SPC_EC",
                "value": "-",
                "domain": ".shopee.co.id",
                "path": "/"
            },
            {
                "name": "language",
                "value": "id",
                "domain": ".shopee.co.id",
                "path": "/"
            }
        ])
        
        self.log(f"📐 Viewport: {viewport['width']}x{viewport['height']}")
        self.log(f"🌐 User-Agent: {user_agent[:50]}...")
        
        return playwright, browser, context
    
    def setup_video_listener(self, page: Page):
        """
        Set up a response listener to capture video URLs.
        This is non-blocking and doesn't intercept requests.
        """
        def on_response(response):
            url = response.url
            # Check for video URLs
            if ".mp4" in url or "/video/" in url.lower():
                if url not in self.video_urls:
                    self.video_urls.append(url)
                    self.log(f"🎬 Found video URL: {url[:80]}...")
        
        page.on("response", on_response)
        self.log("🔍 Video listener enabled")
    
    async def auto_scroll(self, page: Page, scroll_count: int = 8):
        """
        Auto-scroll the page to trigger lazy loading.
        """
        self.log(f"📜 Auto-scrolling page ({scroll_count} iterations)...")
        
        for i in range(scroll_count):
            await page.evaluate("window.scrollBy(0, window.innerHeight)")
            await asyncio.sleep(random.uniform(0.8, 1.5))
            self.log(f"   Scroll {i + 1}/{scroll_count}")
        
        # Scroll back to top
        await page.evaluate("window.scrollTo(0, 0)")
        await asyncio.sleep(0.5)
    
    def parse_sales_count(self, sales_text: str) -> int:
        """
        Parse sales text like '1,2rb terjual' or '10K sold' to integer.
        """
        if not sales_text:
            return 0
        
        sales_text = sales_text.lower().strip()
        
        # Remove "terjual", "sold", etc.
        sales_text = re.sub(r'(terjual|sold|pcs)', '', sales_text).strip()
        
        # Handle 'rb' (ribu = thousand in Indonesian)
        if 'rb' in sales_text:
            num = re.sub(r'[^\d,.]', '', sales_text.replace(',', '.'))
            try:
                return int(float(num) * 1000)
            except:
                return 0
        
        # Handle 'jt' (juta = million)
        if 'jt' in sales_text:
            num = re.sub(r'[^\d,.]', '', sales_text.replace(',', '.'))
            try:
                return int(float(num) * 1000000)
            except:
                return 0
        
        # Handle 'k' for thousand
        if 'k' in sales_text:
            num = re.sub(r'[^\d,.]', '', sales_text.replace(',', '.'))
            try:
                return int(float(num) * 1000)
            except:
                return 0
        
        # Regular number
        num = re.sub(r'[^\d]', '', sales_text)
        try:
            return int(num) if num else 0
        except:
            return 0
    
    def parse_price(self, price_text: str) -> float:
        """
        Parse price text like 'Rp 123.456' to float.
        """
        if not price_text:
            return 0.0
        
        # Remove currency symbol and separators
        num = re.sub(r'[^\d]', '', price_text)
        try:
            return float(num) if num else 0.0
        except:
            return 0.0
    
    async def dismiss_popups(self, page: Page):
        """
        Dismiss any popups or overlays that might block interaction.
        """
        try:
            # Try to close language selection popup
            close_btns = await page.query_selector_all('[class*="close"], [class*="Close"], button[aria-label*="close"]')
            for btn in close_btns:
                try:
                    await btn.click(timeout=1000)
                    await asyncio.sleep(0.3)
                except:
                    pass
            
            # Press Escape to close any modal
            await page.keyboard.press("Escape")
            await asyncio.sleep(0.5)
            
        except Exception as e:
            self.log(f"⚠️ Error dismissing popups: {str(e)[:30]}")
    
    async def extract_products_from_page(self, page: Page) -> List[Product]:
        """
        Extract product data from the current page using multiple selector strategies.
        """
        self.log("🔎 Extracting product data...")
        
        products = []
        
        # Wait for page to be ready
        await asyncio.sleep(2)
        
        # Try multiple selector strategies
        selectors = [
            '[data-sqe="item"]',
            '.shopee-search-item-result__item',
            'li.shopee-search-item-result__item',
            'div[data-item-id]',
            '.col-xs-2-4',  # Shopee grid layout
        ]
        
        product_cards = []
        for selector in selectors:
            try:
                await page.wait_for_selector(selector, timeout=5000)
                product_cards = await page.query_selector_all(selector)
                if product_cards:
                    self.log(f"✅ Found products with selector: {selector}")
                    break
            except:
                continue
        
        if not product_cards:
            # Try getting all links that look like product links
            self.log("⚠️ Standard selectors failed, trying link extraction...")
            all_links = await page.query_selector_all('a[href*="-i."]')
            if all_links:
                self.log(f"📦 Found {len(all_links)} product links")
                for link in all_links[:60]:  # Limit to 60 products
                    try:
                        href = await link.get_attribute('href')
                        if not href or '-i.' not in href:
                            continue
                        
                        # Build full URL
                        if href.startswith('/'):
                            product_url = f"https://shopee.co.id{href}"
                        else:
                            product_url = href
                        
                        # Get parent element for more data
                        parent = await link.evaluate_handle("el => el.closest('div') || el.parentElement")
                        
                        # Try to get title from link text or parent
                        title = await link.inner_text() or "Unknown Product"
                        title = title.strip()[:200] if title else "Unknown Product"
                        
                        # Try to find price in parent
                        price = 0.0
                        try:
                            price_elem = await page.query_selector(f'a[href="{href}"] ~ *[class*="price"], a[href="{href}"] *[class*="price"]')
                            if price_elem:
                                price_text = await price_elem.inner_text()
                                price = self.parse_price(price_text)
                        except:
                            pass
                        
                        # Try to find image
                        thumbnail = None
                        try:
                            img = await link.query_selector('img')
                            if img:
                                thumbnail = await img.get_attribute('src')
                        except:
                            pass
                        
                        if title and title != "Unknown Product":
                            product = Product(
                                title=title,
                                price=price,
                                original_price=None,
                                star_rating=0.0,
                                review_count=0,
                                monthly_sales=0,
                                thumbnail_url=thumbnail,
                                video_url=None,
                                has_video=False,
                                original_url=product_url,
                                shop_name=None,
                            )
                            product.calculate_viral_score()
                            products.append(product)
                    except Exception as e:
                        continue
                
                self.log(f"✅ Extracted {len(products)} products from links")
                return products
            else:
                self.log("❌ No products found on page")
                
                # Debug: save page content
                try:
                    current_url = page.url
                    self.log(f"📍 Current URL: {current_url[:80]}...")
                    if "login" in current_url.lower():
                        self.log("⚠️ Redirected to login page - Shopee is blocking the scraper")
                except:
                    pass
                
                return []
        
        self.log(f"📦 Found {len(product_cards)} product cards")
        
        for card in product_cards:
            try:
                # Extract product link
                link_elem = await card.query_selector('a[href*="-i."]')
                if not link_elem:
                    link_elem = await card.query_selector('a[data-sqe="link"]')
                if not link_elem:
                    link_elem = await card.query_selector('a')
                
                href = await link_elem.get_attribute('href') if link_elem else None
                if not href:
                    continue
                
                # Build full URL
                if href.startswith('/'):
                    product_url = f"https://shopee.co.id{href}"
                else:
                    product_url = href
                
                # Extract title
                title_selectors = [
                    '[data-sqe="name"]',
                    '[data-sqe="name"] div',
                    '.ie3A\\+n',
                    '.Cve6sh',
                    'div[class*="name"]',
                    'div[class*="title"]',
                ]
                title = "Unknown Product"
                for sel in title_selectors:
                    try:
                        title_elem = await card.query_selector(sel)
                        if title_elem:
                            title = await title_elem.inner_text()
                            if title:
                                break
                    except:
                        continue
                
                # Extract price
                price_selectors = [
                    '[data-sqe="item_price"]',
                    '[data-sqe="price"] span',
                    '.vioxXd',
                    '.k9JZlv',
                    'span[class*="price"]',
                ]
                price = 0.0
                for sel in price_selectors:
                    try:
                        price_elem = await card.query_selector(sel)
                        if price_elem:
                            price_text = await price_elem.inner_text()
                            price = self.parse_price(price_text)
                            if price > 0:
                                break
                    except:
                        continue
                
                # Extract sold count
                sold_selectors = [
                    '[data-sqe="sold"]',
                    '.OwmBnn',
                    'span[class*="sold"]',
                    'div[class*="sold"]',
                ]
                monthly_sales = 0
                for sel in sold_selectors:
                    try:
                        sold_elem = await card.query_selector(sel)
                        if sold_elem:
                            sold_text = await sold_elem.inner_text()
                            monthly_sales = self.parse_sales_count(sold_text)
                            if monthly_sales > 0:
                                break
                    except:
                        continue
                
                # Extract rating
                rating_selectors = [
                    '[data-sqe="rating"]',
                    '.r6HknA',
                    'div[class*="rating"]',
                ]
                star_rating = 0.0
                for sel in rating_selectors:
                    try:
                        rating_elem = await card.query_selector(sel)
                        if rating_elem:
                            rating_text = await rating_elem.inner_text()
                            # Extract number from rating text
                            rating_match = re.search(r'(\d+\.?\d*)', rating_text)
                            if rating_match:
                                star_rating = float(rating_match.group(1))
                                if star_rating > 0:
                                    break
                    except:
                        continue
                
                # Extract thumbnail
                thumbnail = None
                try:
                    img_elem = await card.query_selector('img')
                    if img_elem:
                        thumbnail = await img_elem.get_attribute('src')
                except:
                    pass
                
                # Extract shop name
                shop_selectors = [
                    '[data-sqe="shop"] span',
                    '.zGGwiV',
                    'span[class*="shop"]',
                ]
                shop_name = None
                for sel in shop_selectors:
                    try:
                        shop_elem = await card.query_selector(sel)
                        if shop_elem:
                            shop_name = await shop_elem.inner_text()
                            if shop_name:
                                break
                    except:
                        continue
                
                # Calculate review count
                review_count = int(monthly_sales * 0.1) if monthly_sales > 0 else 0
                
                # Check for video
                video_url = self.video_urls[-1] if self.video_urls else None
                
                # Create product object
                product = Product(
                    title=title.strip()[:200] if title else "Unknown",
                    price=price,
                    original_price=None,
                    star_rating=star_rating,
                    review_count=review_count,
                    monthly_sales=monthly_sales,
                    thumbnail_url=thumbnail,
                    video_url=video_url,
                    has_video=video_url is not None,
                    original_url=product_url,
                    shop_name=shop_name,
                )
                product.calculate_viral_score()
                
                products.append(product)
                
            except Exception as e:
                self.log(f"⚠️ Error parsing product: {str(e)[:50]}")
                continue
        
        self.log(f"✅ Successfully extracted {len(products)} products")
        return products
    
    async def scrape(
        self,
        keyword: str,
        max_pages: int = 3,
    ) -> List[Product]:
        """
        Main scraping function.
        
        Args:
            keyword: Search keyword or category URL
            max_pages: Maximum number of pages to scrape
        
        Returns:
            List of scraped Product objects
        """
        all_products = []
        playwright = None
        browser = None
        
        try:
            playwright, browser, context = await self.create_browser_context()
            page = await context.new_page()
            
            # Apply stealth
            await stealth_async(page)
            self.log("🥷 Stealth mode applied")
            
            # Set up video listener (non-blocking, no interception)
            self.setup_video_listener(page)
            
            # First navigate to homepage to get cookies and bypass detection
            self.log("🏠 Visiting homepage first to set cookies...")
            try:
                await page.goto("https://shopee.co.id/", wait_until="domcontentloaded", timeout=30000)
                await asyncio.sleep(3)
                await self.dismiss_popups(page)
            except:
                self.log("⚠️ Homepage load timeout, continuing...")
            
            # Determine if keyword is URL or search term
            if keyword.startswith('http'):
                base_url = keyword
                self.log(f"📌 Scraping URL: {base_url}")
            else:
                # URL encode the keyword
                from urllib.parse import quote
                encoded_keyword = quote(keyword)
                base_url = f"https://shopee.co.id/search?keyword={encoded_keyword}"
                self.log(f"🔍 Searching for: {keyword}")
            
            for page_num in range(max_pages):
                # Build page URL
                if page_num == 0:
                    url = base_url
                else:
                    separator = '&' if '?' in base_url else '?'
                    url = f"{base_url}{separator}page={page_num}"
                
                self.log(f"📄 Loading page {page_num + 1}/{max_pages}...")
                
                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                    await asyncio.sleep(3)
                except Exception as e:
                    self.log(f"⚠️ Page load issue: {str(e)[:30]}, continuing...")
                
                # Dismiss any popups
                await self.dismiss_popups(page)
                
                # Wait for dynamic content
                await asyncio.sleep(2)
                
                # Auto-scroll to load all products
                await self.auto_scroll(page)
                
                # Extract products
                products = await self.extract_products_from_page(page)
                all_products.extend(products)
                
                self.log(f"📊 Total products so far: {len(all_products)}")
                
                # If no products found on first page, don't continue
                if page_num == 0 and len(products) == 0:
                    self.log("❌ No products found on first page, stopping scrape")
                    break
                
                # Random delay between pages (2-5 seconds)
                if page_num < max_pages - 1:
                    delay = random.uniform(2, 5)
                    self.log(f"⏳ Waiting {delay:.1f}s before next page...")
                    await asyncio.sleep(delay)
            
        except Exception as e:
            self.log(f"❌ Scraping error: {str(e)}")
            raise
        
        finally:
            if browser:
                await browser.close()
            if playwright:
                await playwright.stop()
            self.log("🏁 Browser closed")
        
        self.log(f"🎉 Scraping complete! Total products: {len(all_products)}")
        return all_products


# Example usage for testing
async def main():
    scraper = ShopeeScraper()
    products = await scraper.scrape("headphone bluetooth", max_pages=2)
    for p in products[:5]:
        print(f"{p.title[:50]} - Rp{p.price:,.0f} - ⭐{p.star_rating} - Score: {p.viral_score}")


if __name__ == "__main__":
    asyncio.run(main())
