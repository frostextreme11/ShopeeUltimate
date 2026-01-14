import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
    Search,
    Zap,
    Package,
    Video,
    TrendingUp,
    Terminal,
    Loader2,
    LogIn,
    LogOut,
    Trash2,
    CheckCircle,
    AlertCircle,
} from 'lucide-react'
import ProductGrid from './ProductGrid'
import ScrapeTerminal from './ScrapeTerminal'
import { StatsSkeleton } from './SkeletonLoader'
import { useStats, useScrape, useClearAllProducts } from '../hooks/useProducts'
import { formatNumber } from '../lib/utils'
import { getSessionStatus, startLogin, logout as apiLogout } from '../lib/api'

/**
 * Main dashboard component
 */
export default function Dashboard() {
    const [keyword, setKeyword] = useState('')
    const [maxPages, setMaxPages] = useState(3)
    const [showTerminal, setShowTerminal] = useState(false)
    const [filters, setFilters] = useState({
        sortBy: 'viral_score',
        order: 'desc',
    })

    // Session state
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [sessionLoading, setSessionLoading] = useState(true)
    const [loginLoading, setLoginLoading] = useState(false)

    const { data: stats, isLoading: statsLoading } = useStats()
    const scrapeMutation = useScrape()
    const clearAllMutation = useClearAllProducts()

    // Check session on load
    useEffect(() => {
        checkSession()
    }, [])

    const checkSession = async () => {
        try {
            setSessionLoading(true)
            const status = await getSessionStatus()
            setIsLoggedIn(status.logged_in)
        } catch (error) {
            console.error('Failed to check session:', error)
        } finally {
            setSessionLoading(false)
        }
    }

    // Handle login
    const handleLogin = async () => {
        try {
            setLoginLoading(true)
            await startLogin()
            // Wait a bit then start checking for login
            setTimeout(() => {
                const checkInterval = setInterval(async () => {
                    const status = await getSessionStatus()
                    if (status.logged_in) {
                        setIsLoggedIn(true)
                        setLoginLoading(false)
                        clearInterval(checkInterval)
                    }
                }, 2000)

                // Stop checking after 5 minutes
                setTimeout(() => {
                    clearInterval(checkInterval)
                    setLoginLoading(false)
                }, 300000)
            }, 3000)
        } catch (error) {
            console.error('Login failed:', error)
            setLoginLoading(false)
        }
    }

    // Handle logout
    const handleLogout = async () => {
        try {
            await apiLogout()
            setIsLoggedIn(false)
        } catch (error) {
            console.error('Logout failed:', error)
        }
    }

    // Handle scrape submit
    const handleScrape = async (e) => {
        e.preventDefault()
        if (!keyword.trim()) return

        setShowTerminal(true)
        try {
            await scrapeMutation.mutateAsync({ keyword, maxPages })
            // Recheck session in case it expired
            setTimeout(checkSession, 2000)
        } catch (error) {
            console.error('Scrape failed:', error)
        }
    }

    // Handle clear all products
    const handleClearAll = async () => {
        if (confirm('Are you sure you want to delete ALL products? This cannot be undone.')) {
            await clearAllMutation.mutateAsync()
        }
    }

    // Stats cards data
    const statsCards = [
        {
            label: 'Total Products',
            value: stats?.total_products || 0,
            icon: Package,
            color: 'cyan',
        },
        {
            label: 'With Video',
            value: stats?.products_with_video || 0,
            icon: Video,
            color: 'green',
        },
        {
            label: 'Avg Viral Score',
            value: Math.round(stats?.average_viral_score || 0),
            icon: TrendingUp,
            color: 'magenta',
        },
        {
            label: 'Top Score',
            value: stats?.top_viral_products?.[0]?.viral_score || 0,
            icon: Zap,
            color: 'yellow',
        },
    ]

    return (
        <div className="min-h-screen bg-cyber-dark">
            {/* Header */}
            <header className="border-b border-cyber-border bg-cyber-darker/50 backdrop-blur-sm sticky top-0 z-40">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-3"
                        >
                            <div className="w-10 h-10 rounded-xl bg-gradient-cyber flex items-center justify-center">
                                <Zap className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-gradient-cyber">ShopeeHunter</h1>
                                <p className="text-xs text-gray-500">Viral Product Scraper</p>
                            </div>
                        </motion.div>

                        <div className="flex items-center gap-3">
                            {/* Session Status */}
                            {!sessionLoading && (
                                <div className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg ${isLoggedIn
                                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                        : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                    }`}>
                                    {isLoggedIn ? (
                                        <>
                                            <CheckCircle className="w-4 h-4" />
                                            <span className="hidden sm:inline">Logged In</span>
                                        </>
                                    ) : (
                                        <>
                                            <AlertCircle className="w-4 h-4" />
                                            <span className="hidden sm:inline">Not Logged In</span>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Login/Logout Button */}
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={isLoggedIn ? handleLogout : handleLogin}
                                disabled={loginLoading || sessionLoading}
                                className={`btn-cyber flex items-center gap-2 ${!isLoggedIn ? 'border-cyber-cyan text-cyber-cyan animate-pulse' : ''
                                    }`}
                            >
                                {loginLoading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span className="hidden sm:inline">Opening Browser...</span>
                                    </>
                                ) : isLoggedIn ? (
                                    <>
                                        <LogOut className="w-4 h-4" />
                                        <span className="hidden sm:inline">Logout</span>
                                    </>
                                ) : (
                                    <>
                                        <LogIn className="w-4 h-4" />
                                        <span className="hidden sm:inline">Login to Shopee</span>
                                    </>
                                )}
                            </motion.button>

                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setShowTerminal(!showTerminal)}
                                className="btn-cyber flex items-center gap-2"
                            >
                                <Terminal className="w-4 h-4" />
                                <span className="hidden sm:inline">Logs</span>
                            </motion.button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-8">
                {/* Login Warning Banner */}
                {!isLoggedIn && !sessionLoading && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-center gap-4"
                    >
                        <AlertCircle className="w-6 h-6 text-yellow-400 flex-shrink-0" />
                        <div className="flex-1">
                            <p className="text-yellow-200 font-medium">Login Required</p>
                            <p className="text-yellow-400/70 text-sm">
                                Please click "Login to Shopee" button above. A browser will open - login to your Shopee account, then return here.
                            </p>
                        </div>
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleLogin}
                            disabled={loginLoading}
                            className="btn-cyber-primary px-6"
                        >
                            {loginLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                'Login Now'
                            )}
                        </motion.button>
                    </motion.div>
                )}

                {/* Scrape Form */}
                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8"
                >
                    <form onSubmit={handleScrape} className="card-cyber neon-border p-6">
                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="flex-1">
                                <label className="block text-sm text-gray-400 mb-2">
                                    Search Keyword or Category URL
                                </label>
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                    <input
                                        type="text"
                                        value={keyword}
                                        onChange={(e) => setKeyword(e.target.value)}
                                        placeholder="e.g., headphone bluetooth, wireless earbuds..."
                                        className="input-cyber pl-12"
                                    />
                                </div>
                            </div>

                            <div className="w-full md:w-32">
                                <label className="block text-sm text-gray-400 mb-2">Max Pages</label>
                                <select
                                    value={maxPages}
                                    onChange={(e) => setMaxPages(Number(e.target.value))}
                                    className="input-cyber"
                                >
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                                        <option key={n} value={n}>
                                            {n} {n === 1 ? 'page' : 'pages'}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex items-end">
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    type="submit"
                                    disabled={scrapeMutation.isPending || !keyword.trim()}
                                    className="btn-cyber-primary w-full md:w-auto flex items-center justify-center gap-2 px-8 py-3"
                                >
                                    {scrapeMutation.isPending ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            <span>Scraping...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Zap className="w-5 h-5" />
                                            <span>Start Scrape</span>
                                        </>
                                    )}
                                </motion.button>
                            </div>
                        </div>
                    </form>
                </motion.section>

                {/* Stats Cards */}
                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="mb-8"
                >
                    {statsLoading ? (
                        <StatsSkeleton />
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {statsCards.map((stat, index) => (
                                <motion.div
                                    key={stat.label}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.1 }}
                                    className="card-cyber"
                                >
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-xs text-gray-400 mb-1">{stat.label}</p>
                                            <p className="text-2xl font-bold">{formatNumber(stat.value)}</p>
                                        </div>
                                        <stat.icon
                                            className={`w-6 h-6 text-cyber-${stat.color}`}
                                            style={{
                                                color:
                                                    stat.color === 'cyan'
                                                        ? '#00f0ff'
                                                        : stat.color === 'green'
                                                            ? '#00ff88'
                                                            : stat.color === 'magenta'
                                                                ? '#ff00aa'
                                                                : '#ffff00',
                                            }}
                                        />
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </motion.section>

                {/* Filter Bar */}
                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="mb-6"
                >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-gray-400">Sort by:</label>
                                <select
                                    value={filters.sortBy}
                                    onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
                                    className="input-cyber py-2 text-sm"
                                >
                                    <option value="viral_score">Viral Score</option>
                                    <option value="price">Price</option>
                                    <option value="star_rating">Rating</option>
                                    <option value="monthly_sales">Sales</option>
                                    <option value="scraped_at">Date Added</option>
                                </select>
                            </div>

                            <div className="flex items-center gap-2">
                                <label className="text-sm text-gray-400">Order:</label>
                                <select
                                    value={filters.order}
                                    onChange={(e) => setFilters({ ...filters, order: e.target.value })}
                                    className="input-cyber py-2 text-sm"
                                >
                                    <option value="desc">High to Low</option>
                                    <option value="asc">Low to High</option>
                                </select>
                            </div>

                            <button
                                onClick={() =>
                                    setFilters({
                                        ...filters,
                                        hasVideo: filters.hasVideo === true ? undefined : true,
                                    })
                                }
                                className={`btn-cyber py-2 text-sm ${filters.hasVideo === true ? 'border-cyber-cyan text-cyber-cyan' : ''
                                    }`}
                            >
                                <Video className="w-4 h-4 inline mr-1" />
                                Has Video
                            </button>
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleClearAll}
                            disabled={clearAllMutation.isPending}
                            className="btn-cyber-danger text-sm flex items-center gap-2"
                        >
                            {clearAllMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Trash2 className="w-4 h-4" />
                            )}
                            Clear All
                        </motion.button>
                    </div>
                </motion.section>

                {/* Product Grid */}
                <motion.section
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                >
                    <ProductGrid filters={filters} />
                </motion.section>
            </main>

            {/* Terminal Component */}
            <ScrapeTerminal isOpen={showTerminal} onClose={() => setShowTerminal(false)} />

            {/* Footer */}
            <footer className="border-t border-cyber-border py-6 mt-12">
                <div className="container mx-auto px-4 text-center text-sm text-gray-500">
                    <p>ShopeeHunter v1.0.0 • Built with FastAPI + React</p>
                </div>
            </footer>
        </div>
    )
}
