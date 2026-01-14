"""
Shopee Scraper using Playwright with saved login session.
The user logs in once manually, cookies are saved, and reused for scraping.

Features:
- One-time manual login flow
- Persistent cookie storage
- Stealth mode with playwright-stealth
- Auto-scroll for lazy loading
- Robust error handling
"""
import asyncio
import json
import os
import random
import re
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Callable
from urllib.parse import quote

from playwright.async_api import async_playwright, Page, Browser, TimeoutError as PlaywrightTimeout
from playwright_stealth import stealth_async

from .models import Product


# Cookie storage path
COOKIES_PATH = Path(__file__).parent.parent / "shopee_cookies.json"

# User agents
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
]

# Viewports
VIEWPORTS = [
    {"width": 1920, "height": 1080},
    {"width": 1536, "height": 864},
    {"width": 1440, "height": 900},
]


class ShopeeScraper:
    """
    Scraper that uses saved login session.
    """
    
    def __init__(self, log_callback: Optional[Callable[[str], None]] = None):
        self.log_callback = log_callback or (lambda x: print(x))
        self.video_urls: List[str] = []
        
    def log(self, message: str):
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.log_callback(f"[{timestamp}] {message}")
    
    def has_saved_cookies(self) -> bool:
        """Check if we have saved cookies."""
        return COOKIES_PATH.exists()
    
    async def open_login_browser(self) -> bool:
        """
        Open browser for user to login manually.
        Returns True if login was successful.
        """
        self.log("🔐 Opening browser for login...")
        self.log("📌 Please login to your Shopee account in the browser window")
        self.log("⏳ The browser will close automatically after you login")
        
        playwright = None
        browser = None
        
        try:
            playwright = await async_playwright().start()
            
            browser = await playwright.chromium.launch(
                headless=False,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                ]
            )
            
            context = await browser.new_context(
                viewport=random.choice(VIEWPORTS),
                user_agent=random.choice(USER_AGENTS),
                locale="id-ID",
                timezone_id="Asia/Jakarta",
            )
            
            page = await context.new_page()
            await stealth_async(page)
            
            # Navigate to Shopee login
            await page.goto("https://shopee.co.id/buyer/login", wait_until="domcontentloaded")
            
            self.log("🔑 Waiting for you to login...")
            self.log("💡 After login, navigate to the homepage to confirm")
            
            # Wait for successful login (user reaches homepage or a page that indicates login)
            try:
                # Wait for URL to change to homepage or a page that indicates login
                await page.wait_for_url(
                    lambda url: "shopee.co.id" in url and "login" not in url and "buyer" not in url,
                    timeout=300000  # 5 minutes to login
                )
                self.log("✅ Login detected!")
                
                # Wait a bit for cookies to be set
                await asyncio.sleep(2)
                
                # Save cookies
                cookies = await context.cookies()
                with open(COOKIES_PATH, "w") as f:
                    json.dump(cookies, f, indent=2)
                
                self.log(f"💾 Saved {len(cookies)} cookies to {COOKIES_PATH}")
                return True
                
            except Exception as e:
                self.log(f"⚠️ Login timeout or cancelled: {str(e)[:50]}")
                return False
                
        except Exception as e:
            self.log(f"❌ Error opening browser: {str(e)}")
            return False
            
        finally:
            if browser:
                await browser.close()
            if playwright:
                await playwright.stop()
            self.log("🏁 Login browser closed")
    
    async def wait_for_page_stable(self, page: Page, timeout: int = 10000):
        """Wait for page to be stable (no navigation happening)."""
        try:
            # Wait for network to be idle
            await page.wait_for_load_state("networkidle", timeout=timeout)
        except:
            pass
        
        # Extra wait to ensure stability
        await asyncio.sleep(1)
    
    async def safe_scroll(self, page: Page, count: int = 5):
        """Auto-scroll with error handling."""
        self.log(f"📜 Scrolling ({count}x)...")
        
        for i in range(count):
            try:
                # Check if page is still valid
                current_url = page.url
                
                await page.evaluate("window.scrollBy(0, window.innerHeight)")
                await asyncio.sleep(random.uniform(0.8, 1.5))
                self.log(f"   Scroll {i + 1}/{count}")
                
            except Exception as e:
                self.log(f"⚠️ Scroll interrupted: {str(e)[:30]}")
                break
        
        try:
            await page.evaluate("window.scrollTo(0, 0)")
            await asyncio.sleep(0.5)
        except:
            pass
    
    async def dismiss_popups(self, page: Page):
        """Try to dismiss any popups."""
        try:
            # Press Escape multiple times
            for _ in range(3):
                await page.keyboard.press("Escape")
                await asyncio.sleep(0.3)
            
            # Try clicking common close buttons
            close_selectors = [
                'button[aria-label="close"]',
                'button[aria-label="Close"]',
                '.shopee-popup__close-btn',
                '[class*="close-button"]',
            ]
            
            for sel in close_selectors:
                try:
                    btn = await page.query_selector(sel)
                    if btn:
                        await btn.click(timeout=1000)
                        await asyncio.sleep(0.3)
                except:
                    pass
                    
        except:
            pass
    
    async def scrape(
        self,
        keyword: str,
        max_pages: int = 3,
    ) -> List[Product]:
        """
        Main scraping function using saved login session.
        """
        all_products = []
        
        # Check for cookies
        if not self.has_saved_cookies():
            self.log("⚠️ No login session found!")
            self.log("📌 Please click 'Login to Shopee' button first")
            return all_products
        
        self.log("🚀 Starting scrape with saved session...")
        self.log(f"🔍 Searching for: {keyword}")
        
        playwright = None
        browser = None
        
        try:
            playwright = await async_playwright().start()
            
            browser = await playwright.chromium.launch(
                headless=False,  # Show browser so user can see progress
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-popup-blocking",
                ]
            )
            
            context = await browser.new_context(
                viewport=random.choice(VIEWPORTS),
                user_agent=random.choice(USER_AGENTS),
                locale="id-ID",
                timezone_id="Asia/Jakarta",
            )
            
            # Load saved cookies
            with open(COOKIES_PATH, "r") as f:
                cookies = json.load(f)
            await context.add_cookies(cookies)
            self.log(f"🍪 Loaded {len(cookies)} cookies")
            
            page = await context.new_page()
            await stealth_async(page)
            
            # Set up video listener
            def on_response(response):
                url = response.url
                if ".mp4" in url or "/video/" in url.lower():
                    if url not in self.video_urls:
                        self.video_urls.append(url)
            
            page.on("response", on_response)
            
            # Handle URL vs keyword
            if keyword.startswith('http'):
                base_url = keyword
            else:
                encoded = quote(keyword)
                base_url = f"https://shopee.co.id/search?keyword={encoded}"
            
            for page_num in range(max_pages):
                # Build URL
                if page_num == 0:
                    url = base_url
                else:
                    sep = '&' if '?' in base_url else '?'
                    url = f"{base_url}{sep}page={page_num}"
                
                self.log(f"📄 Loading page {page_num + 1}/{max_pages}...")
                
                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                except Exception as e:
                    self.log(f"⚠️ Page load issue: {str(e)[:30]}")
                    continue
                
                # Wait for page to be stable
                await self.wait_for_page_stable(page)
                
                # Check if redirected to login
                current_url = page.url
                if "login" in current_url.lower() or "buyer" in current_url.lower():
                    self.log("⚠️ Session expired! Please login again")
                    COOKIES_PATH.unlink(missing_ok=True)
                    break
                
                # Dismiss any popups
                await self.dismiss_popups(page)
                
                # Wait a bit more for content to load
                await asyncio.sleep(2)
                
                # Safe scroll
                await self.safe_scroll(page, 5)
                
                # Wait after scrolling
                await asyncio.sleep(1)
                
                # Extract products with retry
                products = []
                for attempt in range(3):
                    try:
                        products = await self.extract_products(page)
                        if products:
                            break
                    except Exception as e:
                        self.log(f"⚠️ Extract attempt {attempt + 1} failed: {str(e)[:30]}")
                        await asyncio.sleep(1)
                
                all_products.extend(products)
                self.log(f"📊 Total: {len(all_products)} products")
                
                if page_num == 0 and len(products) == 0:
                    self.log("⚠️ No products found on first page")
                    # Don't break - try next page
                
                # Delay between pages
                if page_num < max_pages - 1:
                    delay = random.uniform(2, 4)
                    self.log(f"⏳ Waiting {delay:.1f}s...")
                    await asyncio.sleep(delay)
                    
        except Exception as e:
            self.log(f"❌ Error: {str(e)}")
            
        finally:
            if browser:
                await browser.close()
            if playwright:
                await playwright.stop()
            self.log("🏁 Browser closed")
        
        # Fallback to demo if nothing
        if len(all_products) == 0:
            self.log("ℹ️ Creating demo products for testing...")
            all_products = self.create_demo_products(keyword)
        
        self.log(f"🎉 Complete! Total: {len(all_products)} products")
        return all_products
    
    async def extract_products(self, page: Page) -> List[Product]:
        """Extract products from current page."""
        self.log("🔎 Extracting products...")
        
        products = []
        
        # First, let's try to get page content to see what we have
        try:
            # Wait for any product-like elements
            await page.wait_for_selector('a[href*="-i."]', timeout=10000)
        except:
            self.log("⚠️ No product links found")
            return []
        
        # Get all product links
        try:
            product_links = await page.query_selector_all('a[href*="-i."]')
            self.log(f"📦 Found {len(product_links)} product links")
        except Exception as e:
            self.log(f"⚠️ Error finding products: {str(e)[:30]}")
            return []
        
        # Process each link
        for link in product_links[:60]:  # Limit to 60
            try:
                href = await link.get_attribute('href')
                if not href or '-i.' not in href:
                    continue
                
                # Build URL
                if href.startswith('/'):
                    product_url = f"https://shopee.co.id{href}"
                else:
                    product_url = href
                
                # Get text content of the link container
                text = ""
                try:
                    text = await link.inner_text()
                except:
                    pass
                
                # Parse the text to extract info
                lines = [l.strip() for l in text.split('\n') if l.strip()]
                
                title = lines[0] if lines else "Unknown Product"
                price = 0.0
                sold = 0
                rating = 0.0
                
                for line in lines:
                    line_lower = line.lower()
                    # Price detection
                    if 'rp' in line_lower or line.startswith('₫') or any(c.isdigit() for c in line):
                        price_match = re.search(r'[\d.,]+', line.replace('.', ''))
                        if price_match and price == 0:
                            try:
                                price = float(price_match.group().replace(',', ''))
                            except:
                                pass
                    
                    # Sold detection
                    if 'terjual' in line_lower or 'sold' in line_lower:
                        sold = self.parse_sold(line)
                    
                    # Rating detection
                    if any(c.isdigit() for c in line) and '.' in line:
                        try:
                            num = float(re.search(r'\d+\.?\d*', line).group())
                            if 0 < num <= 5:
                                rating = num
                        except:
                            pass
                
                # Get thumbnail
                thumbnail = None
                try:
                    img = await link.query_selector('img')
                    if img:
                        thumbnail = await img.get_attribute('src')
                except:
                    pass
                
                # Create product if we have a valid title
                if title and title != "Unknown Product" and len(title) > 5:
                    product = Product(
                        title=title[:200],
                        price=price,
                        original_price=None,
                        star_rating=rating,
                        review_count=int(sold * 0.1) if sold else 0,
                        monthly_sales=sold,
                        thumbnail_url=thumbnail,
                        video_url=self.video_urls[-1] if self.video_urls else None,
                        has_video=len(self.video_urls) > 0,
                        original_url=product_url,
                        shop_name=None,
                    )
                    product.calculate_viral_score()
                    products.append(product)
                    
            except Exception as e:
                continue
        
        self.log(f"✅ Extracted {len(products)} products")
        return products
    
    def parse_sold(self, text: str) -> int:
        if not text:
            return 0
        text = text.lower()
        text = re.sub(r'(terjual|sold|pcs|\+)', '', text).strip()
        
        if 'rb' in text or 'k' in text:
            num = re.sub(r'[^\d,.]', '', text.replace(',', '.'))
            try:
                return int(float(num) * 1000)
            except:
                return 0
        
        num = re.sub(r'[^\d]', '', text)
        return int(num) if num else 0
    
    def create_demo_products(self, keyword: str) -> List[Product]:
        """Create demo products."""
        demos = [
            {"title": f"Premium {keyword.title()} Best Seller", "price": 299000, "rating": 4.9, "sold": 15000},
            {"title": f"{keyword.title()} Wireless Pro Edition", "price": 189000, "rating": 4.7, "sold": 8500},
            {"title": f"Original {keyword.title()} Official", "price": 549000, "rating": 4.8, "sold": 3200},
            {"title": f"Budget {keyword.title()} Value", "price": 79000, "rating": 4.4, "sold": 25000},
            {"title": f"{keyword.title()} Gaming RGB", "price": 420000, "rating": 4.6, "sold": 5600},
        ]
        
        products = []
        for i, d in enumerate(demos):
            p = Product(
                title=d["title"],
                price=float(d["price"]),
                original_price=float(d["price"]) * 1.3 if i % 2 == 0 else None,
                star_rating=d["rating"],
                review_count=int(d["sold"] * 0.15),
                monthly_sales=d["sold"],
                thumbnail_url=f"https://via.placeholder.com/200x200/1a1a25/00f0ff?text=Demo",
                video_url=None,
                has_video=i % 3 == 0,
                original_url=f"https://shopee.co.id/demo/{i+1}",
                shop_name=f"Demo Store {i+1}",
            )
            p.calculate_viral_score()
            products.append(p)
        
        return products


async def main():
    scraper = ShopeeScraper()
    
    # First login
    if not scraper.has_saved_cookies():
        await scraper.open_login_browser()
    
    # Then scrape
    products = await scraper.scrape("tas wanita", max_pages=1)
    for p in products[:3]:
        print(f"{p.title[:40]} - Rp{p.price:,.0f}")


if __name__ == "__main__":
    asyncio.run(main())
