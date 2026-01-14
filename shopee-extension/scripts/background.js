/**
 * ShopeeHunter Extension - Background Service Worker
 * Handles API calls, content script injection, and coordination
 */

// ===================================
// Configuration
// ===================================
const CONFIG = {
    BACKEND_URL: 'http://localhost:8000/api',
    SHOPEE_DOMAIN: 'shopee.co.id',
};

// ===================================
// State
// ===================================
let scrapeState = {
    isActive: false,
    currentTabId: null,
    keyword: '',
    maxPages: 5,
    currentPage: 0,
    products: [],
    videoOnly: false,
    minRating: 0,
};

// ===================================
// Message Listener
// ===================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender)
        .then(sendResponse)
        .catch((error) => sendResponse({ success: false, error: error.message }));

    return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
    switch (message.type) {
        case 'START_SCRAPE':
            return await startScrape(message.data);

        case 'STOP_SCRAPE':
            return stopScrape();

        case 'SCRAPE_PAGE_COMPLETE':
            return await handlePageComplete(message.data);

        case 'PRODUCTS_EXTRACTED':
            return await handleProductsExtracted(message.data, sender.tab?.id);

        case 'CONTENT_SCRIPT_READY':
            return { success: true };

        default:
            return { success: false, error: 'Unknown message type' };
    }
}

// ===================================
// Scrape Control
// ===================================
async function startScrape(data) {
    try {
        // Reset state
        scrapeState = {
            isActive: true,
            currentTabId: data.tabId,
            keyword: data.keyword,
            maxPages: data.maxPages,
            currentPage: 0,
            products: [],
            videoOnly: data.videoOnly,
            minRating: data.minRating,
        };

        sendToPopup('SCRAPE_LOG', { message: `Searching for: ${data.keyword}`, type: 'info' });

        // Navigate to first search page
        await navigateToSearchPage(data.keyword, 0);

        return { success: true };
    } catch (error) {
        sendToPopup('SCRAPE_ERROR', { message: error.message });
        return { success: false, error: error.message };
    }
}

function stopScrape() {
    scrapeState.isActive = false;
    sendToPopup('SCRAPE_LOG', { message: 'Scrape stopped by user', type: 'warning' });

    // Send final results
    finishScrape();

    return { success: true };
}

// ===================================
// Navigation
// ===================================
async function navigateToSearchPage(keyword, page) {
    if (!scrapeState.isActive) return;

    const encodedKeyword = encodeURIComponent(keyword);
    let url = `https://shopee.co.id/search?keyword=${encodedKeyword}`;

    if (page > 0) {
        url += `&page=${page}`;
    }

    sendToPopup('SCRAPE_LOG', { message: `Loading page ${page + 1}/${scrapeState.maxPages}...`, type: 'info' });

    try {
        await chrome.tabs.update(scrapeState.currentTabId, { url });

        // Wait for page to load then inject scraper
        setTimeout(() => {
            if (scrapeState.isActive) {
                executeContentScript();
            }
        }, 3000);

    } catch (error) {
        sendToPopup('SCRAPE_ERROR', { message: `Navigation error: ${error.message}` });
    }
}

// ===================================
// Content Script Execution
// ===================================
async function executeContentScript() {
    if (!scrapeState.isActive) return;

    try {
        // Inject the content script
        await chrome.scripting.executeScript({
            target: { tabId: scrapeState.currentTabId },
            files: ['scripts/content.js'],
        });

        // Wait a bit then send scrape command
        setTimeout(async () => {
            if (scrapeState.isActive) {
                await chrome.tabs.sendMessage(scrapeState.currentTabId, {
                    type: 'SCRAPE_PAGE',
                    data: {
                        videoOnly: scrapeState.videoOnly,
                        minRating: scrapeState.minRating,
                    },
                });
            }
        }, 2000);

    } catch (error) {
        console.error('Error executing content script:', error);
        sendToPopup('SCRAPE_LOG', { message: `Script error: ${error.message}`, type: 'error' });

        // Try to continue anyway
        handlePageComplete({ products: [] });
    }
}

// ===================================
// Handle Products
// ===================================
async function handleProductsExtracted(data, tabId) {
    if (!scrapeState.isActive) return { success: false };

    const products = data.products || [];

    sendToPopup('SCRAPE_LOG', {
        message: `Extracted ${products.length} products from page ${scrapeState.currentPage + 1}`,
        type: 'success'
    });

    // Add to state
    scrapeState.products.push(...products);

    // Update stats
    const stats = calculateStats(scrapeState.products);
    sendToPopup('SCRAPE_STATS', stats);

    // Update progress
    const progress = Math.round(((scrapeState.currentPage + 1) / scrapeState.maxPages) * 100);
    sendToPopup('SCRAPE_PROGRESS', { percent: progress });

    // Continue to next page or finish
    scrapeState.currentPage++;

    if (scrapeState.currentPage < scrapeState.maxPages && scrapeState.isActive) {
        // Small delay before next page
        sendToPopup('SCRAPE_LOG', { message: 'Waiting before next page...', type: 'info' });
        setTimeout(() => {
            navigateToSearchPage(scrapeState.keyword, scrapeState.currentPage);
        }, 2000 + Math.random() * 2000);
    } else {
        finishScrape();
    }

    return { success: true };
}

async function handlePageComplete(data) {
    // This is called when content script finishes but found no products
    if (data.products && data.products.length > 0) {
        return handleProductsExtracted(data);
    }

    sendToPopup('SCRAPE_LOG', { message: 'No products found on this page', type: 'warning' });

    // Still increment page
    scrapeState.currentPage++;

    if (scrapeState.currentPage < scrapeState.maxPages && scrapeState.isActive) {
        setTimeout(() => {
            navigateToSearchPage(scrapeState.keyword, scrapeState.currentPage);
        }, 2000);
    } else {
        finishScrape();
    }

    return { success: true };
}

// ===================================
// Finish Scrape
// ===================================
async function finishScrape() {
    scrapeState.isActive = false;

    const totalProducts = scrapeState.products.length;

    sendToPopup('SCRAPE_LOG', {
        message: `Scrape complete! Total: ${totalProducts} products`,
        type: 'success'
    });

    // Send to backend
    if (totalProducts > 0) {
        try {
            sendToPopup('SCRAPE_LOG', { message: 'Sending data to server...', type: 'info' });

            const response = await sendToBackend(scrapeState.products);

            if (response.success) {
                sendToPopup('SCRAPE_LOG', { message: 'Data saved successfully!', type: 'success' });
            } else {
                sendToPopup('SCRAPE_LOG', { message: 'Failed to save data', type: 'error' });
            }
        } catch (error) {
            sendToPopup('SCRAPE_LOG', { message: `Server error: ${error.message}`, type: 'error' });
        }
    }

    sendToPopup('SCRAPE_COMPLETE', { totalProducts });
}

// ===================================
// Backend Communication
// ===================================
async function sendToBackend(products) {
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/extension/products`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                products,
                keyword: scrapeState.keyword,
                scraped_at: new Date().toISOString(),
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Backend error:', error);
        return { success: false, error: error.message };
    }
}

// ===================================
// Popup Communication
// ===================================
function sendToPopup(type, data) {
    chrome.runtime.sendMessage({ type, data }).catch(() => {
        // Popup might be closed, that's okay
    });
}

// ===================================
// Stats Calculation
// ===================================
function calculateStats(products) {
    const totalProducts = products.length;
    const withVideo = products.filter(p => p.has_video).length;

    let totalRating = 0;
    let ratedCount = 0;

    products.forEach(p => {
        if (p.star_rating && p.star_rating > 0) {
            totalRating += p.star_rating;
            ratedCount++;
        }
    });

    const avgRating = ratedCount > 0 ? totalRating / ratedCount : 0;

    return {
        products: totalProducts,
        videos: withVideo,
        avgRating: avgRating,
    };
}

// ===================================
// Tab Update Listener
// ===================================
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (scrapeState.isActive && tabId === scrapeState.currentTabId) {
        if (changeInfo.status === 'complete' && tab.url?.includes('shopee.co.id')) {
            // Page loaded, wait a bit then scrape
            setTimeout(() => {
                if (scrapeState.isActive) {
                    executeContentScript();
                }
            }, 2000);
        }
    }
});

console.log('ShopeeHunter Background Service Worker loaded');
