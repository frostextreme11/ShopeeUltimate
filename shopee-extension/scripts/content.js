/**
 * ShopeeHunter Extension - Content Script
 * Extracts product data from Shopee search pages
 * Fixed: Improved rating extraction, added new filters
 */

// Guard to prevent duplicate script execution
if (window.__shopeeHunterLoaded) {
    console.log('[ShopeeHunter] Content script already loaded, skipping...');
} else {
    window.__shopeeHunterLoaded = true;

    // ===================================
    // State
    // ===================================
    let isScraperActive = false;

    // ===================================
    // Message Listener
    // ===================================
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'SCRAPE_PAGE') {
            handleScrapePage(message.data)
                .then((result) => sendResponse(result))
                .catch((error) => sendResponse({ success: false, error: error.message }));
            return true;
        }
    });

    // Notify background that content script is ready
    chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' }).catch(() => { });

    // ===================================
    // Main Scrape Handler
    // ===================================
    async function handleScrapePage(options = {}) {
        if (isScraperActive) {
            return { success: false, error: 'Scraper already active' };
        }

        isScraperActive = true;

        try {
            log('Starting page scrape...');
            log('Filters: ' + JSON.stringify(options));

            // Wait for page to be fully loaded
            await waitForElement('a[href*="-i."]', 10000);

            // Auto-scroll to load all products
            await autoScroll(5);

            // Wait a bit for lazy-loaded content
            await sleep(1000);

            // Extract products
            const products = await extractProducts(options);

            log(`Extracted ${products.length} products after filters`);

            // Send to background
            chrome.runtime.sendMessage({
                type: 'PRODUCTS_EXTRACTED',
                data: { products },
            });

            isScraperActive = false;
            return { success: true, count: products.length };

        } catch (error) {
            isScraperActive = false;
            log(`Error: ${error.message}`);

            // Still send results even if empty
            chrome.runtime.sendMessage({
                type: 'PRODUCTS_EXTRACTED',
                data: { products: [] },
            });

            return { success: false, error: error.message };
        }
    }

    // ===================================
    // Product Extraction
    // ===================================
    async function extractProducts(options = {}) {
        const products = [];
        const seenUrls = new Set();
        const fetchVideoUrls = options.fetchVideoUrls || false;

        // Find all product links
        const productLinks = document.querySelectorAll('a[href*="-i."]');

        log(`Found ${productLinks.length} product links`);

        for (const link of productLinks) {
            try {
                const product = extractProductFromLink(link);

                if (product && !seenUrls.has(product.original_url)) {
                    // Apply all filters
                    if (!passesFilters(product, options)) {
                        continue;
                    }

                    seenUrls.add(product.original_url);
                    products.push(product);
                }
            } catch (e) {
                // Skip failed products
                continue;
            }
        }

        // If fetchVideoUrls is enabled, try to get actual video URLs for products with videos
        if (fetchVideoUrls && products.length > 0) {
            const productsWithVideo = products.filter(p => p.has_video);
            log(`Fetching video URLs for ${productsWithVideo.length} products with video badge...`);

            for (let i = 0; i < productsWithVideo.length; i++) {
                const product = productsWithVideo[i];
                try {
                    log(`Fetching video ${i + 1}/${productsWithVideo.length}...`);
                    const videoUrl = await extractVideoFromDetailPage(product.original_url);
                    if (videoUrl) {
                        product.video_url = videoUrl;
                        log(`Got video URL for: ${product.title.substring(0, 30)}...`);
                    }
                } catch (e) {
                    log(`Failed to fetch video for: ${product.title.substring(0, 30)}`);
                }
            }
        }

        return products;
    }

    // ===================================
    // Filter Logic
    // ===================================
    function passesFilters(product, options) {
        // Video filter
        if (options.videoOnly && !product.has_video) {
            return false;
        }

        // Rating range filter
        if (options.minRating && product.star_rating < options.minRating) {
            return false;
        }
        if (options.maxRating && product.star_rating > options.maxRating) {
            return false;
        }

        // Price range filter
        if (options.minPrice && product.price < options.minPrice) {
            return false;
        }
        if (options.maxPrice && product.price > options.maxPrice) {
            return false;
        }

        // Seller type filter
        if (options.sellerType) {
            const sellerType = options.sellerType.toLowerCase();
            if (sellerType === 'mall' && !product.is_mall) {
                return false;
            }
            if (sellerType === 'star' && !product.is_star_seller) {
                return false;
            }
            if (sellerType === 'star+' && !product.is_star_plus) {
                return false;
            }
        }

        // Location filter
        if (options.locations && options.locations.length > 0) {
            const productLocation = (product.shop_location || '').toLowerCase();
            const matchesLocation = options.locations.some(loc =>
                productLocation.includes(loc.toLowerCase().trim())
            );
            if (!matchesLocation) {
                return false;
            }
        }

        // Promo filter
        if (options.hasPromo && !product.has_promo) {
            return false;
        }

        return true;
    }

    // ===================================
    // Product Extraction from Link
    // ===================================
    function extractProductFromLink(link) {
        const href = link.getAttribute('href');
        if (!href || !href.includes('-i.')) {
            return null;
        }

        // Build full URL
        const productUrl = href.startsWith('/')
            ? `https://shopee.co.id${href}`
            : href;

        // Debug: Log the extracted URL
        console.log('[ShopeeHunter DEBUG] Extracted href:', href);
        console.log('[ShopeeHunter DEBUG] Full product URL:', productUrl);

        // Get container element (product card)
        const container = findProductContainer(link);
        if (!container) return null;

        // Extract all data
        const allText = container.innerText || '';
        const lines = allText.split('\n').map(l => l.trim()).filter(l => l);

        // Extract each field
        const title = extractTitle(lines);
        if (!title || title.length < 5) return null;

        const price = extractPrice(container, lines);
        const originalPrice = extractOriginalPrice(container, lines);
        const rating = extractRating(container, lines);
        const sold = extractSoldCount(lines);
        const thumbnail = extractThumbnail(container);
        const hasVideo = checkHasVideo(container);
        const shopName = extractShopName(container);
        const shopLocation = extractShopLocation(container);
        const isMall = checkIsMall(container);
        const isStarSeller = checkIsStarSeller(container);
        const isStarPlus = checkIsStarPlus(container);
        const hasPromo = checkHasPromo(container, price, originalPrice);

        // Calculate viral score
        const viralScore = calculateViralScore(rating, sold);

        return {
            title: title.substring(0, 200),
            price: price,
            original_price: originalPrice,
            star_rating: rating,
            review_count: Math.floor(sold * 0.1),
            monthly_sales: sold,
            thumbnail_url: thumbnail,
            video_url: null,
            has_video: hasVideo,
            original_url: productUrl,
            shop_name: shopName,
            shop_location: shopLocation,
            is_mall: isMall,
            is_star_seller: isStarSeller,
            is_star_plus: isStarPlus,
            has_promo: hasPromo,
            viral_score: viralScore,
            scraped_at: new Date().toISOString(),
        };
    }

    // ===================================
    // Extraction Helpers
    // ===================================
    function findProductContainer(element) {
        let current = element;
        let depth = 0;

        while (current && depth < 10) {
            const rect = current.getBoundingClientRect();
            // Product card typically 150-300px wide and 200-400px tall
            if (rect.width > 140 && rect.width < 400 && rect.height > 180 && rect.height < 500) {
                return current;
            }
            current = current.parentElement;
            depth++;
        }

        return element.closest('[data-sqe]') || element;
    }

    function extractTitle(lines) {
        const filtered = lines.filter(line => {
            const lower = line.toLowerCase();
            // Skip price lines
            if (lower.includes('rp') || /^₫|^\d{1,3}(\.\d{3})+$/.test(line)) return false;
            // Skip rating lines (just a number like "4.9")
            if (/^\d\.\d$/.test(line)) return false;
            // Skip sold count lines
            if (lower.includes('terjual') || lower.includes('sold')) return false;
            // Skip location lines
            if (lower.includes('jakarta') || lower.includes('bandung') || lower.includes('surabaya')) return false;
            // Skip short lines
            if (line.length < 8) return false;
            return true;
        });

        return filtered[0] || '';
    }

    function extractPrice(container, lines) {
        // Method 1: Look for price element with specific classes
        const priceSelectors = [
            '[class*="price"] span',
            '[class*="Price"]',
            '[data-sqe="price"]',
            '.price',
        ];

        for (const sel of priceSelectors) {
            const el = container.querySelector(sel);
            if (el) {
                const price = parsePrice(el.innerText);
                if (price > 0) return price;
            }
        }

        // Method 2: Parse from text lines
        for (const line of lines) {
            if (line.toLowerCase().includes('rp') || /^\d{1,3}(\.\d{3})+$/.test(line)) {
                const price = parsePrice(line);
                if (price > 100 && price < 100000000) return price;
            }
        }

        return 0;
    }

    function extractOriginalPrice(container, lines) {
        // Look for crossed-out price
        const strikeEl = container.querySelector('del, s, [class*="original"], [class*="before"]');
        if (strikeEl) {
            const price = parsePrice(strikeEl.innerText);
            if (price > 0) return price;
        }

        return null;
    }

    function parsePrice(text) {
        if (!text) return 0;
        // Remove currency symbols and extract numbers
        const cleaned = text.replace(/[Rp₫\s]/gi, '').replace(/\./g, '').replace(',', '.');
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
    }

    function extractRating(container, lines) {
        // Method 1: Look for rating element near star icon
        const ratingContainers = container.querySelectorAll('[class*="rating"], [class*="star"], [class*="review"]');
        for (const el of ratingContainers) {
            const text = el.innerText.trim();
            // Look for pattern like "4.9" or "4.9/5"
            const match = text.match(/^(\d\.\d)(?:\/5)?$/);
            if (match) {
                const rating = parseFloat(match[1]);
                if (rating >= 0 && rating <= 5) {
                    return rating;
                }
            }
        }

        // Method 2: Search all text for rating pattern
        const allText = container.innerText;

        // Pattern: standalone rating like "4.9" followed by sold count
        const patterns = [
            /(\d\.\d)\s*(?:\n|\s).*?terjual/i,
            /(\d\.\d)\s*(?:\n|\s).*?sold/i,
            /(\d\.\d)\s*\|\s*\d/,
            /^(\d\.\d)$/m,
        ];

        for (const pattern of patterns) {
            const match = allText.match(pattern);
            if (match) {
                const rating = parseFloat(match[1]);
                if (rating >= 1 && rating <= 5) {
                    return rating;
                }
            }
        }

        // Method 3: Look for specific line format in lines
        for (const line of lines) {
            // Exact rating format: "4.9"
            if (/^\d\.\d$/.test(line.trim())) {
                const rating = parseFloat(line.trim());
                if (rating >= 1 && rating <= 5) {
                    return rating;
                }
            }
        }

        // Method 4: Count filled star SVGs
        const stars = container.querySelectorAll('svg[class*="star"], [class*="star"] svg');
        if (stars.length >= 5) {
            let filled = 0;
            stars.forEach(star => {
                const fill = star.getAttribute('fill') || '';
                if (fill.includes('#') && !fill.includes('none') && !fill.includes('gray')) {
                    filled++;
                }
            });
            if (filled >= 1 && filled <= 5) {
                return filled;
            }
        }

        return 0;
    }

    function extractSoldCount(lines) {
        for (const line of lines) {
            const lower = line.toLowerCase();
            if (lower.includes('terjual') || lower.includes('sold')) {
                return parseSoldCount(line);
            }
        }
        return 0;
    }

    function parseSoldCount(text) {
        if (!text) return 0;

        text = text.toLowerCase();
        text = text.replace(/(terjual|sold|pcs|\+)/gi, '').trim();

        // Handle "rb" (ribu = thousand) or "k"
        if (text.includes('rb') || text.includes('k')) {
            const num = text.replace(/[^0-9.,]/g, '').replace(',', '.');
            return Math.round(parseFloat(num) * 1000) || 0;
        }

        // Handle "jt" or "m" (million)
        if (text.includes('jt') || text.includes('m')) {
            const num = text.replace(/[^0-9.,]/g, '').replace(',', '.');
            return Math.round(parseFloat(num) * 1000000) || 0;
        }

        const num = text.replace(/[^0-9]/g, '');
        return parseInt(num) || 0;
    }

    function extractThumbnail(element) {
        const img = element.querySelector('img');
        if (img) {
            return img.getAttribute('src') || img.getAttribute('data-src') || null;
        }

        const bgElements = element.querySelectorAll('[style*="background"]');
        for (const el of bgElements) {
            const style = el.getAttribute('style') || '';
            const match = style.match(/url\(['"]?([^'")\s]+)['"]?\)/);
            if (match) {
                return match[1];
            }
        }

        return null;
    }

    function checkHasVideo(element) {
        // PRIORITY 1: Check for Shopee's specific video badge using data-testid
        // Element: <div data-testid="badge-video" ...>
        const videoBadge = element.querySelector('[data-testid="badge-video"]');
        if (videoBadge) {
            log('Video detected via data-testid="badge-video"');
            return true;
        }

        // PRIORITY 2: Check for any element with data-testid containing "video"
        const anyVideoTestId = element.querySelector('[data-testid*="video"]');
        if (anyVideoTestId) {
            log('Video detected via data-testid containing "video"');
            return true;
        }

        // PRIORITY 3: Check for actual video element
        if (element.querySelector('video')) {
            log('Video detected via video element');
            return true;
        }

        // PRIORITY 4: Search the element's HTML for video patterns
        const outerHTML = element.outerHTML.toLowerCase();
        const videoPatterns = [
            'badge-video',
            'video-badge',
            'data-video',
            'has-video',
            'with-video',
            'play-icon',
            'video-icon',
        ];

        for (const pattern of videoPatterns) {
            if (outerHTML.includes(pattern)) {
                log('Video detected via pattern in HTML: ' + pattern);
                return true;
            }
        }

        return false;
    }

    // Extract video URL from product page by fetching HTML and parsing embedded data
    async function extractVideoFromDetailPage(productUrl) {
        try {
            // Log full URL - don't truncate!
            log('Fetching video from: ' + productUrl);
            console.log('[ShopeeHunter] FETCHING VIDEO - Full URL:', productUrl);
            console.log('[ShopeeHunter] URL length:', productUrl.length);

            // Fetch the product page HTML (not API to avoid 403)
            const response = await fetch(productUrl, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
                }
            });

            if (!response.ok) {
                log('Failed to fetch page: ' + response.status);
                return null;
            }

            const html = await response.text();

            // Method 1: Look for video URLs in Shopee's embedded JSON data
            // Shopee embeds product data in script tags
            const videoPatterns = [
                // Video info patterns
                /"video_info_list":\s*\[\s*\{[^}]*"video_url":\s*"([^"]+)"/,
                /"video_url":\s*"(https?:[^"]+\.mp4[^"]*)"/i,
                /"videoUrl":\s*"(https?:[^"]+\.mp4[^"]*)"/i,
                /"video":\s*"(https?:[^"]+\.mp4[^"]*)"/i,
                // VOD susercontent pattern
                /"(https?:\\?\/\\?\/[^"]*vod\.susercontent\.com[^"]*\.mp4[^"]*)"/i,
                /"(https?:\\?\/\\?\/[^"]*down-[^"]*\.vod\.susercontent\.com[^"]*)"/i,
                // General mp4 pattern in JSON
                /"url":\s*"(https?:[^"]+\.mp4[^"]*)"/i,
            ];

            for (const pattern of videoPatterns) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    let videoUrl = match[1];
                    // Decode escaped unicode and slashes
                    videoUrl = videoUrl.replace(/\\u002F/g, '/');
                    videoUrl = videoUrl.replace(/\\\//g, '/');
                    videoUrl = videoUrl.replace(/\\/g, '');

                    // Validate URL
                    if (videoUrl.includes('http') && (videoUrl.includes('.mp4') || videoUrl.includes('vod.susercontent'))) {
                        log('Found video URL: ' + videoUrl.substring(0, 100));
                        return videoUrl;
                    }
                }
            }

            // Method 2: Find video in script tags with type="application/json"
            const scriptPattern = /<script[^>]*type="application\/json"[^>]*>([^<]+)<\/script>/gi;
            let scriptMatch;
            while ((scriptMatch = scriptPattern.exec(html)) !== null) {
                const scriptContent = scriptMatch[1];
                try {
                    // Look for video URL in the JSON
                    const vodMatch = scriptContent.match(/(https?:[^"]*vod\.susercontent\.com[^"]*)/i);
                    if (vodMatch) {
                        let videoUrl = vodMatch[1];
                        videoUrl = videoUrl.replace(/\\u002F/g, '/');
                        videoUrl = videoUrl.replace(/\\\//g, '/');
                        videoUrl = videoUrl.replace(/\\/g, '');
                        log('Found video URL in script: ' + videoUrl.substring(0, 100));
                        return videoUrl;
                    }

                    const mp4Match = scriptContent.match(/(https?:[^"]*\.mp4[^"]*)/i);
                    if (mp4Match) {
                        let videoUrl = mp4Match[1];
                        videoUrl = videoUrl.replace(/\\u002F/g, '/');
                        videoUrl = videoUrl.replace(/\\\//g, '/');
                        videoUrl = videoUrl.replace(/\\/g, '');
                        log('Found mp4 URL in script: ' + videoUrl.substring(0, 100));
                        return videoUrl;
                    }
                } catch (e) {
                    // Continue to next script
                }
            }

            // Method 3: Look for any vod.susercontent.com URL in entire HTML
            const vodPattern = /(https?:\/\/[^"'\s]*vod\.susercontent\.com[^"'\s]*)/i;
            const vodMatch = html.match(vodPattern);
            if (vodMatch) {
                let videoUrl = vodMatch[1];
                videoUrl = videoUrl.replace(/\\u002F/g, '/');
                videoUrl = videoUrl.replace(/\\\//g, '/');
                log('Found VOD URL in HTML: ' + videoUrl.substring(0, 100));
                return videoUrl;
            }

            // Method 4: Look for down-bs-sg patterns (Shopee video CDN)
            const cdnPattern = /(https?:\/\/down-[^"'\s]*\.mp4[^"'\s]*)/i;
            const cdnMatch = html.match(cdnPattern);
            if (cdnMatch) {
                let videoUrl = cdnMatch[1];
                videoUrl = videoUrl.replace(/\\/g, '');
                log('Found CDN video URL: ' + videoUrl.substring(0, 100));
                return videoUrl;
            }

            log('No video URL found in page HTML');
            return null;

        } catch (error) {
            log('Error fetching video: ' + error.message);
            console.error('[ShopeeHunter] Error:', error);
            return null;
        }
    }

    function extractShopName(element) {
        const shopSelectors = [
            '[class*="shop-name"]',
            '[class*="shopName"]',
            '[class*="seller-name"]',
            '[class*="store-name"]',
        ];

        for (const sel of shopSelectors) {
            const el = element.querySelector(sel);
            if (el) {
                const text = el.innerText.trim();
                if (text && text.length < 50 && text.length > 1) {
                    return text;
                }
            }
        }

        return null;
    }

    function extractShopLocation(element) {
        const locationSelectors = [
            '[class*="location"]',
            '[class*="address"]',
            '[class*="shop-loc"]',
        ];

        for (const sel of locationSelectors) {
            const el = element.querySelector(sel);
            if (el) {
                const text = el.innerText.trim();
                if (text && text.length < 100) {
                    return text;
                }
            }
        }

        // Try to find location in text (usually city name)
        const allText = element.innerText;
        const cities = ['Jakarta', 'Bandung', 'Surabaya', 'Medan', 'Bekasi', 'Tangerang', 'Depok', 'Semarang', 'Palembang', 'Makassar', 'Bogor'];

        for (const city of cities) {
            if (allText.includes(city)) {
                // Try to get the full location text
                const lines = allText.split('\n');
                for (const line of lines) {
                    if (line.includes(city) && line.length < 50) {
                        return line.trim();
                    }
                }
                return city;
            }
        }

        return null;
    }

    function checkIsMall(element) {
        // Check for Mall badge
        const mallIndicators = [
            '[class*="mall"]',
            '[class*="official"]',
            'img[alt*="mall" i]',
            'img[alt*="official" i]',
        ];

        for (const sel of mallIndicators) {
            if (element.querySelector(sel)) {
                return true;
            }
        }

        // Check text for "Mall" badge
        const html = element.innerHTML.toLowerCase();
        return html.includes('shopeemall') || html.includes('official store');
    }

    function checkIsStarSeller(element) {
        // Check for Star Seller badge
        const starIndicators = [
            '[class*="star-seller"]',
            '[class*="preferred"]',
            'img[alt*="star seller" i]',
        ];

        for (const sel of starIndicators) {
            if (element.querySelector(sel)) {
                return true;
            }
        }

        const html = element.innerHTML.toLowerCase();
        return html.includes('star seller') || html.includes('star-seller');
    }

    function checkIsStarPlus(element) {
        // Check for Star+ badge
        const starPlusIndicators = [
            '[class*="star-plus"]',
            '[class*="star+"]',
            'img[alt*="star+" i]',
        ];

        for (const sel of starPlusIndicators) {
            if (element.querySelector(sel)) {
                return true;
            }
        }

        const html = element.innerHTML.toLowerCase();
        return html.includes('star+') || html.includes('star plus');
    }

    function checkHasPromo(element, price, originalPrice) {
        // Has promo if there's a discount
        if (originalPrice && originalPrice > price) {
            return true;
        }

        // Check for promo badges
        const promoIndicators = [
            '[class*="promo"]',
            '[class*="discount"]',
            '[class*="sale"]',
            '[class*="flash"]',
            '[class*="voucher"]',
        ];

        for (const sel of promoIndicators) {
            if (element.querySelector(sel)) {
                return true;
            }
        }

        // Check for discount percentage text
        const text = element.innerText;
        if (/%\s*off/i.test(text) || /-\d+%/.test(text)) {
            return true;
        }

        return false;
    }

    function calculateViralScore(rating, sold) {
        const ratingScore = (rating / 5) * 30;
        let soldScore = 0;
        if (sold > 0) {
            soldScore = Math.min(70, Math.log10(sold) * 20);
        }
        return Math.round(ratingScore + soldScore);
    }

    // ===================================
    // Utility Functions
    // ===================================
    async function autoScroll(times = 5) {
        log(`Auto-scrolling ${times} times...`);

        for (let i = 0; i < times; i++) {
            window.scrollBy({
                top: window.innerHeight,
                behavior: 'smooth',
            });

            await sleep(800 + Math.random() * 400);
        }

        window.scrollTo({
            top: 0,
            behavior: 'smooth',
        });

        await sleep(500);
    }

    function waitForElement(selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                return resolve(element);
            }

            const observer = new MutationObserver((mutations, obs) => {
                const element = document.querySelector(selector);
                if (element) {
                    obs.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Timeout waiting for ${selector}`));
            }, timeout);
        });
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function log(message) {
        console.log(`[ShopeeHunter] ${message}`);
    }

    // ===================================
    // Initialize
    // ===================================
    log('Content script loaded on: ' + window.location.href);

} // End of guard if-else block
