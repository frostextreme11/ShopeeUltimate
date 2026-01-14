import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    getProducts,
    getStats,
    startScrape,
    getScrapeJob,
    generateAffiliateLink,
    downloadVideo,
    deleteProduct,
    clearAllProducts,
} from '../lib/api'

// ===== Products Hooks =====

export function useProducts(filters = {}) {
    return useQuery({
        queryKey: ['products', filters],
        queryFn: () => getProducts(filters),
        keepPreviousData: true,
    })
}

export function useStats() {
    return useQuery({
        queryKey: ['stats'],
        queryFn: getStats,
        refetchInterval: 10000, // Refresh every 10 seconds
    })
}

// ===== Scraper Hooks =====

export function useScrape() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ keyword, maxPages }) => startScrape(keyword, maxPages),
        onSuccess: () => {
            // Invalidate products and stats after scraping starts
            queryClient.invalidateQueries({ queryKey: ['products'] })
            queryClient.invalidateQueries({ queryKey: ['stats'] })
        },
    })
}

export function useScrapeJob(jobId) {
    return useQuery({
        queryKey: ['scrapeJob', jobId],
        queryFn: () => getScrapeJob(jobId),
        enabled: !!jobId,
        refetchInterval: (data) => {
            // Stop polling when job is complete
            if (data?.status === 'completed' || data?.status === 'failed') {
                return false
            }
            return 2000 // Poll every 2 seconds
        },
    })
}

// ===== Product Actions Hooks =====

export function useGenerateAffiliateLink() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ productId, affiliateId }) =>
            generateAffiliateLink(productId, affiliateId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] })
        },
    })
}

export function useDownloadVideo() {
    return useMutation({
        mutationFn: (productId) => downloadVideo(productId),
    })
}

export function useDeleteProduct() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: deleteProduct,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] })
            queryClient.invalidateQueries({ queryKey: ['stats'] })
        },
    })
}

export function useClearAllProducts() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: clearAllProducts,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['products'] })
            queryClient.invalidateQueries({ queryKey: ['stats'] })
        },
    })
}
