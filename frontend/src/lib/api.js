import axios from 'axios'

// API base URL - proxied through Vite in development
const API_BASE = '/api'

const api = axios.create({
    baseURL: API_BASE,
    headers: {
        'Content-Type': 'application/json',
    },
})

// ===== Scraper API =====

export const startScrape = async (keyword, maxPages = 3) => {
    const response = await api.post('/scrape', { keyword, max_pages: maxPages })
    return response.data
}

export const getScrapeJob = async (jobId) => {
    const response = await api.get(`/scrape/${jobId}`)
    return response.data
}

export const listScrapeJobs = async (limit = 10) => {
    const response = await api.get('/scrape', { params: { limit } })
    return response.data
}

// ===== Products API =====

export const getProducts = async ({
    sortBy = 'viral_score',
    order = 'desc',
    hasVideo,
    minRating,
    minViralScore,
    limit = 50,
    offset = 0,
} = {}) => {
    const params = {
        sort_by: sortBy,
        order,
        limit,
        offset,
    }
    if (hasVideo !== undefined) params.has_video = hasVideo
    if (minRating !== undefined) params.min_rating = minRating
    if (minViralScore !== undefined) params.min_viral_score = minViralScore

    const response = await api.get('/products', { params })
    return response.data
}

export const getProduct = async (productId) => {
    const response = await api.get(`/products/${productId}`)
    return response.data
}

export const generateAffiliateLink = async (productId, affiliateId) => {
    const response = await api.post(`/products/${productId}/affiliate`, null, {
        params: { affiliate_id: affiliateId },
    })
    return response.data
}

export const downloadVideo = async (productId) => {
    const response = await api.get('/download-video', {
        params: { product_id: productId },
    })
    return response.data
}

export const deleteProduct = async (productId) => {
    const response = await api.delete(`/products/${productId}`)
    return response.data
}

export const clearAllProducts = async () => {
    const response = await api.delete('/products')
    return response.data
}

// ===== Stats API =====

export const getStats = async () => {
    const response = await api.get('/stats')
    return response.data
}

// ===== WebSocket for logs =====

export const createLogsWebSocket = (onMessage) => {
    const wsUrl = `ws://${window.location.hostname}:8000/api/ws/logs`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
        console.log('WebSocket connected')
    }

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data)
            onMessage(data)
        } catch (e) {
            console.error('Failed to parse WebSocket message:', e)
        }
    }

    ws.onerror = (error) => {
        console.error('WebSocket error:', error)
    }

    ws.onclose = () => {
        console.log('WebSocket disconnected')
    }

    return ws
}

export default api
