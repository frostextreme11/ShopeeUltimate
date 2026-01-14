import { motion, AnimatePresence } from 'framer-motion'
import ProductCard from './ProductCard'
import { ProductGridSkeleton } from './SkeletonLoader'
import { useProducts } from '../hooks/useProducts'
import { Package, AlertCircle } from 'lucide-react'

/**
 * Product grid with filtering and sorting
 */
export default function ProductGrid({ filters = {} }) {
    const { data: products, isLoading, isError, error } = useProducts(filters)

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

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
        >
            <AnimatePresence mode="popLayout">
                {products.map((product, index) => (
                    <ProductCard key={product.id} product={product} index={index} />
                ))}
            </AnimatePresence>
        </motion.div>
    )
}
