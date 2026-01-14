import { useState } from 'react'
import { motion } from 'framer-motion'
import {
    Star,
    Video,
    TrendingUp,
    ExternalLink,
    Link2,
    Download,
    Trash2,
    Loader2,
} from 'lucide-react'
import { formatPrice, formatNumber } from '../lib/utils'
import { useDownloadVideo, useGenerateAffiliateLink, useDeleteProduct } from '../hooks/useProducts'

/**
 * Animated product card with badges and action buttons
 */
export default function ProductCard({ product, index = 0 }) {
    const [isHovered, setIsHovered] = useState(false)
    const [showAffiliateModal, setShowAffiliateModal] = useState(false)

    const downloadVideoMutation = useDownloadVideo()
    const affiliateMutation = useGenerateAffiliateLink()
    const deleteMutation = useDeleteProduct()

    // Determine badges
    const isViral = product.viral_score >= 1000
    const hasHighRating = product.star_rating >= 4.5
    const hasDiscount = product.original_price && product.original_price > product.price

    // Calculate discount percentage
    const discountPercent = hasDiscount
        ? Math.round((1 - product.price / product.original_price) * 100)
        : 0

    // Handle video download
    const handleDownloadVideo = async () => {
        try {
            await downloadVideoMutation.mutateAsync(product.id)
            // Show success notification
        } catch (error) {
            console.error('Failed to download video:', error)
        }
    }

    // Handle affiliate link generation
    const handleGetAffiliateLink = async () => {
        try {
            const result = await affiliateMutation.mutateAsync({
                productId: product.id,
                affiliateId: null, // Placeholder
            })
            // Copy to clipboard
            navigator.clipboard.writeText(result.affiliate_url)
            alert('Affiliate link copied to clipboard!')
        } catch (error) {
            console.error('Failed to generate affiliate link:', error)
        }
    }

    // Handle delete
    const handleDelete = async () => {
        if (confirm('Delete this product?')) {
            await deleteMutation.mutateAsync(product.id)
        }
    }

    // Animation variants
    const cardVariants = {
        hidden: { opacity: 0, y: 30 },
        visible: {
            opacity: 1,
            y: 0,
            transition: {
                duration: 0.4,
                delay: index * 0.05,
                ease: 'easeOut',
            },
        },
    }

    return (
        <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            whileHover={{ scale: 1.02, y: -4 }}
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
            className="card-cyber card-hover relative overflow-hidden group"
        >
            {/* Glow effect on hover */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: isHovered ? 0.5 : 0 }}
                className="absolute inset-0 bg-gradient-to-br from-cyber-cyan/10 to-cyber-magenta/10 pointer-events-none"
            />

            {/* Thumbnail */}
            <div className="relative mb-4 rounded-lg overflow-hidden aspect-square bg-cyber-darker">
                {product.thumbnail_url ? (
                    <img
                        src={product.thumbnail_url}
                        alt={product.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">
                        No Image
                    </div>
                )}

                {/* Discount badge */}
                {hasDiscount && (
                    <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
                        -{discountPercent}%
                    </div>
                )}

                {/* Video indicator */}
                {product.has_video && (
                    <div className="absolute top-2 right-2 bg-cyber-card/90 backdrop-blur p-2 rounded-full">
                        <Video className="w-4 h-4 text-cyber-cyan" />
                    </div>
                )}

                {/* Delete button (shows on hover) */}
                <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: isHovered ? 1 : 0 }}
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    className="absolute bottom-2 right-2 bg-red-500/80 hover:bg-red-500 p-2 rounded-lg transition-colors"
                >
                    {deleteMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Trash2 className="w-4 h-4" />
                    )}
                </motion.button>
            </div>

            {/* Title */}
            <h3 className="font-medium text-sm mb-2 line-clamp-2 min-h-[40px]">
                {product.title}
            </h3>

            {/* Price */}
            <div className="flex items-baseline gap-2 mb-3">
                <span className="text-lg font-bold text-cyber-cyan">
                    {formatPrice(product.price, product.currency)}
                </span>
                {hasDiscount && (
                    <span className="text-xs text-gray-500 line-through">
                        {formatPrice(product.original_price, product.currency)}
                    </span>
                )}
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
                <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                    <span>{product.star_rating.toFixed(1)}</span>
                </div>
                <div className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-cyber-green" />
                    <span>{formatNumber(product.monthly_sales)} sold</span>
                </div>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2 mb-4">
                {isViral && (
                    <span className="badge-viral text-xs px-2 py-1 rounded-full text-white font-medium">
                        🔥 Viral
                    </span>
                )}
                {product.has_video && (
                    <span className="badge-video text-xs px-2 py-1 rounded-full text-white font-medium">
                        📹 Video
                    </span>
                )}
                {hasHighRating && (
                    <span className="badge-rating text-xs px-2 py-1 rounded-full text-white font-medium">
                        ⭐ Top Rated
                    </span>
                )}
            </div>

            {/* Viral Score */}
            <div className="flex items-center justify-between mb-4 p-2 bg-cyber-darker rounded-lg">
                <span className="text-xs text-gray-400">Viral Score</span>
                <span className="text-sm font-bold text-gradient-cyber">
                    {formatNumber(product.viral_score)}
                </span>
            </div>

            {/* Shop info */}
            {product.shop_name && (
                <p className="text-xs text-gray-500 mb-4 truncate">
                    🏪 {product.shop_name}
                </p>
            )}

            {/* Action buttons */}
            <div className="grid grid-cols-3 gap-2">
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleGetAffiliateLink}
                    disabled={affiliateMutation.isPending}
                    className="btn-cyber text-xs py-2 flex items-center justify-center gap-1"
                    title="Get Affiliate Link"
                >
                    {affiliateMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                        <Link2 className="w-3 h-3" />
                    )}
                </motion.button>

                {product.has_video && (
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleDownloadVideo}
                        disabled={downloadVideoMutation.isPending}
                        className="btn-cyber text-xs py-2 flex items-center justify-center gap-1"
                        title="Download Video"
                    >
                        {downloadVideoMutation.isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                            <Download className="w-3 h-3" />
                        )}
                    </motion.button>
                )}

                <motion.a
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    href={product.original_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-cyber text-xs py-2 flex items-center justify-center gap-1 col-span-1"
                    title="View on Shopee"
                >
                    <ExternalLink className="w-3 h-3" />
                </motion.a>
            </div>
        </motion.div>
    )
}
