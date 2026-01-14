/**
 * ShopeeHunter Extension - Content Script
 * Extracts product data from Shopee search pages
 */

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

        // Wait for page to be fully loaded
        await waitForElement('a[href*="-i."]', 10000);

        // Auto-scroll to load all products
        await autoScroll(5);

        // Wait a bit for lazy-loaded content
        await sleep(1000);

        // Extract products
        const products = await extractProducts(options);

        log(`Extracted ${products.length} products`);

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

    // Find all product links
    const productLinks = document.querySelectorAll('a[href*="-i."]');

    log(`Found ${productLinks.length} product links`);

    for (const link of productLinks) {
        try {
            const product = extractProductFromLink(link);

            if (product && !seenUrls.has(product.original_url)) {
                // Apply filters
                if (options.videoOnly && !product.has_video) {
                    continue;
                }

                if (options.minRating && product.star_rating < options.minRating) {
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

    return products;
}

function extractProductFromLink(link) {
    const href = link.getAttribute('href');
    if (!href || !href.includes('-i.')) {
        return null;
    }

    // Build full URL
    const productUrl = href.startsWith('/')
        ? `https://shopee.co.id${href}`
        : href;

    // Get container element (product card)
    const container = findProductContainer(link);

    // Extract text content
    const allText = container ? container.innerText : link.innerText;
    const lines = allText.split('\n').map(l => l.trim()).filter(l => l);

    // Extract title (usually first meaningful line)
    let title = extractTitle(lines);

    // Extract price
    const price = extractPrice(lines);

    // Extract rating
    const rating = extractRating(container || link);

    // Extract sold count
    const sold = extractSoldCount(lines);

    // Extract thumbnail
    const thumbnail = extractThumbnail(container || link);

    // Check for video
    const hasVideo = checkHasVideo(container || link);

    // Extract shop name
    const shopName = extractShopName(container || link);

    // Only return if we have a valid title
    if (!title || title.length < 5) {
        return null;
    }

    // Calculate viral score
    const viralScore = calculateViralScore(rating, sold);

    return {
        title: title.substring(0, 200),
        price: price,
        original_price: null,
        star_rating: rating,
        review_count: Math.floor(sold * 0.1),
        monthly_sales: sold,
        thumbnail_url: thumbnail,
        video_url: null,
        has_video: hasVideo,
        original_url: productUrl,
        shop_name: shopName,
        viral_score: viralScore,
        scraped_at: new Date().toISOString(),
    };
}

// ===================================
// Extraction Helpers
// ===================================
function findProductContainer(element) {
    // Try to find the product card container
    let current = element;
    let depth = 0;

    while (current && depth < 10) {
        // Check if this looks like a product card
        const style = window.getComputedStyle(current);
        const rect = current.getBoundingClientRect();

        if (rect.width > 150 && rect.height > 200) {
            return current;
        }

        current = current.parentElement;
        depth++;
    }

    return element;
}

function extractTitle(lines) {
    // Filter out lines that look like prices, ratings, or sold counts
    const filtered = lines.filter(line => {
        const lower = line.toLowerCase();

        // Skip price lines
        if (lower.includes('rp') || /^\₫|^\d{1,3}(\.\d{3})+/.test(line)) {
            return false;
        }

        // Skip rating lines
        if (/^\d\.\d$/.test(line)) {
            return false;
        }

        // Skip sold count lines
        if (lower.includes('terjual') || lower.includes('sold')) {
            return false;
        }

        // Skip very short lines
        if (line.length < 10) {
            return false;
        }

        return true;
    });

    return filtered[0] || lines[0] || '';
}

function extractPrice(lines) {
    for (const line of lines) {
        // Look for Rp price pattern
        const match = line.match(/[Rp\₫]?\s*([\d.,]+)/);
        if (match) {
            const numStr = match[1].replace(/\./g, '').replace(',', '.');
            const num = parseFloat(numStr);

            // Sanity check - price should be reasonable
            if (num > 100 && num < 100000000) {
                return num;
            }
        }
    }

    return 0;
}

function extractRating(element) {
    // Look for rating elements
    const ratingEl = element.querySelector('[class*="rating"]')
        || element.querySelector('[aria-label*="rating"]');

    if (ratingEl) {
        const text = ratingEl.innerText || ratingEl.getAttribute('aria-label') || '';
        const match = text.match(/(\d+\.?\d*)/);
        if (match) {
            const rating = parseFloat(match[1]);
            if (rating >= 0 && rating <= 5) {
                return rating;
            }
        }
    }

    // Try to find in text
    const allText = element.innerText;
    const patterns = [
        /(\d\.\d)\s*\/\s*5/,
        /rating:\s*(\d\.\d)/i,
        /⭐\s*(\d\.\d)/,
    ];

    for (const pattern of patterns) {
        const match = allText.match(pattern);
        if (match) {
            return parseFloat(match[1]);
        }
    }

    // Look for star icons and count them
    const stars = element.querySelectorAll('[class*="star"]');
    if (stars.length > 0) {
        let filled = 0;
        stars.forEach(star => {
            if (star.classList.toString().includes('fill') ||
                window.getComputedStyle(star).color !== 'rgb(189, 189, 189)') {
                filled++;
            }
        });
        if (filled > 0 && filled <= 5) {
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
        // Prefer data-src for lazy-loaded images
        return img.getAttribute('src') || img.getAttribute('data-src') || null;
    }

    // Check for background image
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
    // Look for video indicators
    const videoIndicators = [
        '[class*="video"]',
        '[class*="play"]',
        'video',
        '[aria-label*="video"]',
    ];

    for (const selector of videoIndicators) {
        if (element.querySelector(selector)) {
            return true;
        }
    }

    // Check for video icon in text
    const text = element.innerText.toLowerCase();
    if (text.includes('🎬') || text.includes('📹')) {
        return true;
    }

    return false;
}

function extractShopName(element) {
    // Look for shop name elements
    const shopEl = element.querySelector('[class*="shop"]')
        || element.querySelector('[class*="seller"]')
        || element.querySelector('[class*="store"]');

    if (shopEl) {
        const text = shopEl.innerText.trim();
        if (text && text.length < 50) {
            return text;
        }
    }

    return null;
}

function calculateViralScore(rating, sold) {
    // Normalize rating (0-5) to 0-100
    const ratingScore = (rating / 5) * 30;

    // Normalize sold count (log scale)
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

    // Scroll back to top
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
