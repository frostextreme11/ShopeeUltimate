import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ProductCard from './ProductCard'
import { ProductGridSkeleton } from './SkeletonLoader'
import { useProducts } from '../hooks/useProducts'
import { Package, AlertCircle, Sparkles, RefreshCw } from 'lucide-react'

/**
 * Product grid with filtering, sorting, and real-time updates
 */
export default function ProductGrid({ filters = {} }) {
    const { data: products, isLoading, isError, error, isFetching, dataUpdatedAt } = useProducts(filters)

    // Track previously seen product IDs to detect new ones
    const [seenProductIds, setSeenProductIds] = useState(new Set())
    const [newProductIds, setNewProductIds] = useState(new Set())
    const [showNewBadge, setShowNewBadge] = useState(false)
    const isFirstLoad = useRef(true)

    // Detect new products when data changes
    useEffect(() => {
        if (!products || products.length === 0) return

        const currentIds = new Set(products.map(p => p.id))

        if (isFirstLoad.current) {
            // First load - just record all IDs as seen
            setSeenProductIds(currentIds)
            isFirstLoad.current = false
            return
        }

        // Find new products (in current but not in seen)
        const newIds = new Set()
        currentIds.forEach(id => {
            if (!seenProductIds.has(id)) {
                newIds.add(id)
            }
        })

        if (newIds.size > 0) {
            setNewProductIds(newIds)
            setShowNewBadge(true)

            // Add new IDs to seen
            setSeenProductIds(prev => {
                const updated = new Set(prev)
                newIds.forEach(id => updated.add(id))
                return updated
            })

            // Clear "new" highlight after 10 seconds
            setTimeout(() => {
                setNewProductIds(new Set())
                setShowNewBadge(false)
            }, 10000)
        }
    }, [products, dataUpdatedAt])

    // Loading state
    if (isLoading) {
        return <ProductGridSkeleton count={8} />
    }

    // Error state
    if (isError) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
                <h3 className="text-xl font-bold mb-2">Failed to load products</h3>
                <p className="text-gray-400">{error?.message || 'Something went wrong'}</p>
            </div>
        )
    }

    // Empty state
    if (!products || products.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-16 text-center"
            >
                <div className="relative mb-6">
                    <Package className="w-24 h-24 text-gray-600" />
                    <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-cyber-cyan/20 rounded-full"
                    />
                </div>
                <h3 className="text-xl font-bold mb-2">No products found</h3>
                <p className="text-gray-400 max-w-md">
                    Start scraping to find viral products from Shopee. Enter a keyword or
                    category URL and click "Start Scrape".
                </p>
            </motion.div>
        )
    }

    // Container variants for staggered animation
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.05,
            },
        },
    }

    // Item variants with bounce effect for new products
    const itemVariants = {
        hidden: {
            opacity: 0,
            y: 20,
            scale: 0.9,
        },
        visible: {
            opacity: 1,
            y: 0,
            scale: 1,
            transition: {
                type: 'spring',
                stiffness: 300,
                damping: 20,
            }
        },
        exit: {
            opacity: 0,
            scale: 0.9,
            transition: { duration: 0.2 }
        }
    }

    // New product animation - glowing pulse effect
    const newProductVariants = {
        hidden: {
            opacity: 0,
            y: -30,
            scale: 0.8,
        },
        visible: {
            opacity: 1,
            y: 0,
            scale: 1,
            transition: {
                type: 'spring',
                stiffness: 400,
                damping: 15,
            }
        },
    }

    return (
        <div className="relative">
            {/* Live Update Indicator */}
            <AnimatePresence>
                {isFetching && !isLoading && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute -top-8 left-0 flex items-center gap-2 text-sm text-cyber-cyan"
                    >
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Checking for new products...</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* New Products Badge */}
            <AnimatePresence>
                {showNewBadge && newProductIds.size > 0 && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: -20 }}
                        className="absolute -top-10 right-0 flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyber-cyan/20 to-cyber-green/20 border border-cyber-cyan/50 rounded-full text-sm text-cyber-cyan"
                    >
                        <Sparkles className="w-4 h-4 animate-pulse" />
                        <span>{newProductIds.size} new product{newProductIds.size > 1 ? 's' : ''} added!</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Product Grid */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            >
                <AnimatePresence mode="popLayout">
                    {products.map((product, index) => (
                        <motion.div
                            key={product.id}
                            variants={newProductIds.has(product.id) ? newProductVariants : itemVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            layout
                            className={`relative ${newProductIds.has(product.id) ? 'z-10' : ''}`}
                        >
                            {/* New Product Glow Effect */}
                            {newProductIds.has(product.id) && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{
                                        opacity: [0.5, 1, 0.5],
                                        scale: [1, 1.02, 1],
                                    }}
                                    transition={{
                                        repeat: Infinity,
                                        duration: 1.5,
                                        ease: 'easeInOut',
                                    }}
                                    className="absolute inset-0 bg-gradient-to-r from-cyber-cyan/20 via-cyber-green/20 to-cyber-cyan/20 rounded-xl blur-xl -z-10"
                                />
                            )}

                            {/* New Badge on Card */}
                            {newProductIds.has(product.id) && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.3, type: 'spring' }}
                                    className="absolute -top-2 -right-2 z-20 flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-cyber-cyan to-cyber-green rounded-full text-xs font-bold text-cyber-dark"
                                >
                                    <Sparkles className="w-3 h-3" />
                                    NEW
                                </motion.div>
                            )}

                            <ProductCard product={product} index={index} isNew={newProductIds.has(product.id)} />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </motion.div>

            {/* Product Count */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-6 text-center text-sm text-gray-500"
            >
                Showing {products.length} products • Auto-refreshing every 3s
            </motion.div>
        </div>
    )
}
