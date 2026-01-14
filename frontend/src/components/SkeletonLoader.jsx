import { motion } from 'framer-motion'

/**
 * Skeleton loading placeholder with shimmer animation
 */
export function Skeleton({ className, ...props }) {
    return (
        <div
            className={`skeleton rounded ${className || ''}`}
            {...props}
        />
    )
}

/**
 * Product card skeleton loader
 */
export function ProductCardSkeleton() {
    return (
        <div className="card-cyber">
            {/* Thumbnail skeleton */}
            <Skeleton className="w-full h-48 rounded-lg mb-4" />

            {/* Title skeleton */}
            <Skeleton className="h-5 w-3/4 mb-2" />
            <Skeleton className="h-4 w-1/2 mb-4" />

            {/* Price skeleton */}
            <Skeleton className="h-6 w-1/3 mb-4" />

            {/* Badges skeleton */}
            <div className="flex gap-2 mb-4">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
            </div>

            {/* Buttons skeleton */}
            <div className="flex gap-2">
                <Skeleton className="h-10 flex-1 rounded-lg" />
                <Skeleton className="h-10 flex-1 rounded-lg" />
            </div>
        </div>
    )
}

/**
 * Grid of skeleton loaders
 */
export function ProductGridSkeleton({ count = 8 }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: count }).map((_, i) => (
                <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                >
                    <ProductCardSkeleton />
                </motion.div>
            ))}
        </div>
    )
}

/**
 * Stats skeleton loader
 */
export function StatsSkeleton() {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card-cyber">
                    <Skeleton className="h-4 w-1/2 mb-2" />
                    <Skeleton className="h-8 w-2/3" />
                </div>
            ))}
        </div>
    )
}

/**
 * Spinner loading indicator
 */
export function Spinner({ size = 'md', className = '' }) {
    const sizeClasses = {
        sm: 'w-4 h-4',
        md: 'w-8 h-8',
        lg: 'w-12 h-12',
    }

    return (
        <svg
            className={`animate-spin ${sizeClasses[size]} ${className}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
        >
            <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
            />
            <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
        </svg>
    )
}

/**
 * Full-page loading state
 */
export function LoadingScreen({ message = 'Loading...' }) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
            <div className="relative">
                <Spinner size="lg" className="text-cyber-cyan" />
                <div className="absolute inset-0 animate-ping">
                    <Spinner size="lg" className="text-cyber-cyan opacity-30" />
                </div>
            </div>
            <p className="text-gray-400 animate-pulse">{message}</p>
        </div>
    )
}
