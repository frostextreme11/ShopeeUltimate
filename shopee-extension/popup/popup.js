/**
 * ShopeeHunter Extension - Popup Script
 * Handles UI interactions and messaging with background worker
 */

// ===================================
// Configuration
// ===================================
const CONFIG = {
    BACKEND_URL: 'http://localhost:8000/api',
    SHOPEE_DOMAIN: 'shopee.co.id',
};

// ===================================
// State Management
// ===================================
let state = {
    isConnected: false,
    isScraping: false,
    currentTab: null,
    stats: {
        products: 0,
        videos: 0,
        avgRating: 0,
    },
    logs: [],
};

// ===================================
// DOM Elements
// ===================================
const elements = {
    // Status
    statusCard: document.getElementById('statusCard'),
    statusIcon: document.getElementById('statusIcon'),
    statusTitle: document.getElementById('statusTitle'),
    statusSubtitle: document.getElementById('statusSubtitle'),

    // Form
    formSection: document.getElementById('formSection'),
    keyword: document.getElementById('keyword'),
    maxPages: document.getElementById('maxPages'),
    maxPagesValue: document.getElementById('maxPagesValue'),
    videoOnly: document.getElementById('videoOnly'),
    minRating: document.getElementById('minRating'),
    startBtn: document.getElementById('startBtn'),

    // Progress
    progressSection: document.getElementById('progressSection'),
    stopBtn: document.getElementById('stopBtn'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    logViewer: document.getElementById('logViewer'),
    statProducts: document.getElementById('statProducts'),
    statVideos: document.getElementById('statVideos'),
    statRating: document.getElementById('statRating'),

    // Success
    successSection: document.getElementById('successSection'),
    successCount: document.getElementById('successCount'),
    newScrapeBtn: document.getElementById('newScrapeBtn'),

    // Error
    errorSection: document.getElementById('errorSection'),
    errorMessage: document.getElementById('errorMessage'),
    retryBtn: document.getElementById('retryBtn'),

    // Confetti
    confettiCanvas: document.getElementById('confettiCanvas'),
};

// ===================================
// Initialization
// ===================================
document.addEventListener('DOMContentLoaded', async () => {
    // Load saved preferences
    await loadPreferences();

    // Check current tab
    await checkCurrentTab();

    // Setup event listeners
    setupEventListeners();

    // Listen for messages from background
    chrome.runtime.onMessage.addListener(handleMessage);
});

// ===================================
// Event Listeners
// ===================================
function setupEventListeners() {
    // Max pages slider
    elements.maxPages.addEventListener('input', (e) => {
        elements.maxPagesValue.textContent = e.target.value;
        savePreferences();
    });

    // Checkbox changes
    elements.videoOnly.addEventListener('change', savePreferences);
    elements.minRating.addEventListener('change', savePreferences);

    // Start button
    elements.startBtn.addEventListener('click', startScraping);

    // Stop button
    elements.stopBtn.addEventListener('click', stopScraping);

    // New scrape button
    elements.newScrapeBtn.addEventListener('click', resetToForm);

    // Retry button
    elements.retryBtn.addEventListener('click', resetToForm);
}

// ===================================
// Tab Check
// ===================================
async function checkCurrentTab() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        state.currentTab = tab;

        if (tab && tab.url && tab.url.includes(CONFIG.SHOPEE_DOMAIN)) {
            // On Shopee
            updateStatus('connected', 'Connected to Shopee', 'Ready to scrape products');
            state.isConnected = true;
            elements.startBtn.disabled = false;
        } else {
            // Not on Shopee
            updateStatus('disconnected', 'Not on Shopee', 'Please open shopee.co.id first');
            state.isConnected = false;
            elements.startBtn.disabled = true;
        }
    } catch (error) {
        updateStatus('error', 'Error', 'Could not check current tab');
        elements.startBtn.disabled = true;
    }
}

// ===================================
// Status Update
// ===================================
function updateStatus(type, title, subtitle) {
    elements.statusCard.className = `status-card ${type}`;
    elements.statusTitle.textContent = title;
    elements.statusSubtitle.textContent = subtitle;
}

// ===================================
// Scraping Functions
// ===================================
async function startScraping() {
    const keyword = elements.keyword.value.trim();

    if (!keyword) {
        elements.keyword.focus();
        elements.keyword.style.borderColor = 'var(--cyber-red)';
        setTimeout(() => {
            elements.keyword.style.borderColor = '';
        }, 2000);
        return;
    }

    // Update UI
    state.isScraping = true;
    showProgressSection();
    addLog('Starting scrape...');

    // Send message to background
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'START_SCRAPE',
            data: {
                keyword,
                maxPages: parseInt(elements.maxPages.value),
                videoOnly: elements.videoOnly.checked,
                minRating: elements.minRating.checked ? 4.0 : 0,
                tabId: state.currentTab.id,
            },
        });

        if (response && response.success) {
            addLog('Scraper initialized successfully', 'success');
        } else {
            throw new Error(response?.error || 'Failed to start scraper');
        }
    } catch (error) {
        addLog(`Error: ${error.message}`, 'error');
        showError(error.message);
    }
}

async function stopScraping() {
    try {
        await chrome.runtime.sendMessage({ type: 'STOP_SCRAPE' });
        addLog('Stopping scrape...', 'warning');
    } catch (error) {
        console.error('Error stopping scrape:', error);
    }
}

// ===================================
// Message Handler
// ===================================
function handleMessage(message, sender, sendResponse) {
    switch (message.type) {
        case 'SCRAPE_PROGRESS':
            updateProgress(message.data);
            break;

        case 'SCRAPE_LOG':
            addLog(message.data.message, message.data.type);
            break;

        case 'SCRAPE_STATS':
            updateStats(message.data);
            break;

        case 'SCRAPE_COMPLETE':
            handleComplete(message.data);
            break;

        case 'SCRAPE_ERROR':
            handleError(message.data);
            break;
    }

    sendResponse({ received: true });
}

// ===================================
// UI Updates
// ===================================
function showProgressSection() {
    elements.formSection.classList.add('hidden');
    elements.progressSection.classList.remove('hidden');
    elements.successSection.classList.add('hidden');
    elements.errorSection.classList.add('hidden');

    // Clear previous logs
    elements.logViewer.innerHTML = '';
}

function showSuccess(count) {
    elements.formSection.classList.add('hidden');
    elements.progressSection.classList.add('hidden');
    elements.successSection.classList.remove('hidden');
    elements.errorSection.classList.add('hidden');

    elements.successCount.textContent = count;

    // Trigger confetti
    launchConfetti();
}

function showError(message) {
    elements.formSection.classList.add('hidden');
    elements.progressSection.classList.add('hidden');
    elements.successSection.classList.add('hidden');
    elements.errorSection.classList.remove('hidden');

    elements.errorMessage.textContent = message;
}

function resetToForm() {
    elements.formSection.classList.remove('hidden');
    elements.progressSection.classList.add('hidden');
    elements.successSection.classList.add('hidden');
    elements.errorSection.classList.add('hidden');

    state.isScraping = false;
    state.stats = { products: 0, videos: 0, avgRating: 0 };

    updateProgress({ percent: 0 });
    updateStats(state.stats);
}

function updateProgress(data) {
    const percent = data.percent || 0;
    const progressFill = elements.progressBar.querySelector('.progress-fill');
    progressFill.style.width = `${percent}%`;
    elements.progressText.textContent = `${percent}%`;
}

function updateStats(data) {
    elements.statProducts.textContent = data.products || 0;
    elements.statVideos.textContent = data.videos || 0;
    elements.statRating.textContent = (data.avgRating || 0).toFixed(1);

    state.stats = data;
}

function addLog(message, type = 'info') {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerHTML = `
    <span class="log-time">[${time}]</span>
    <span class="log-message">${escapeHtml(message)}</span>
  `;

    elements.logViewer.appendChild(entry);
    elements.logViewer.scrollTop = elements.logViewer.scrollHeight;

    // Keep only last 50 entries
    while (elements.logViewer.children.length > 50) {
        elements.logViewer.removeChild(elements.logViewer.firstChild);
    }
}

function handleComplete(data) {
    state.isScraping = false;
    showSuccess(data.totalProducts || state.stats.products);
}

function handleError(data) {
    state.isScraping = false;
    showError(data.message || 'An unknown error occurred');
}

// ===================================
// Preferences
// ===================================
async function loadPreferences() {
    try {
        const result = await chrome.storage.local.get(['preferences']);
        if (result.preferences) {
            const prefs = result.preferences;
            elements.maxPages.value = prefs.maxPages || 5;
            elements.maxPagesValue.textContent = prefs.maxPages || 5;
            elements.videoOnly.checked = prefs.videoOnly || false;
            elements.minRating.checked = prefs.minRating || false;
        }
    } catch (error) {
        console.error('Error loading preferences:', error);
    }
}

async function savePreferences() {
    try {
        await chrome.storage.local.set({
            preferences: {
                maxPages: parseInt(elements.maxPages.value),
                videoOnly: elements.videoOnly.checked,
                minRating: elements.minRating.checked,
            },
        });
    } catch (error) {
        console.error('Error saving preferences:', error);
    }
}

// ===================================
// Confetti Effect
// ===================================
function launchConfetti() {
    const canvas = elements.confettiCanvas;
    const ctx = canvas.getContext('2d');

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const colors = ['#00f0ff', '#ff00aa', '#00ff88', '#ffff00'];

    for (let i = 0; i < 100; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            size: Math.random() * 8 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            speedY: Math.random() * 3 + 2,
            speedX: Math.random() * 2 - 1,
            rotation: Math.random() * 360,
            rotationSpeed: Math.random() * 10 - 5,
        });
    }

    let frame = 0;
    const maxFrames = 150;

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach((p) => {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rotation * Math.PI) / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();

            p.y += p.speedY;
            p.x += p.speedX;
            p.rotation += p.rotationSpeed;

            if (p.y > canvas.height) {
                p.y = -p.size;
                p.x = Math.random() * canvas.width;
            }
        });

        frame++;
        if (frame < maxFrames) {
            requestAnimationFrame(animate);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    animate();
}

// ===================================
// Utilities
// ===================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
