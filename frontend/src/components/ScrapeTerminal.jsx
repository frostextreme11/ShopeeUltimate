import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Terminal, X, Minimize2, Maximize2 } from 'lucide-react'
import { createLogsWebSocket } from '../lib/api'

/**
 * Terminal-style component for displaying real-time scraping logs
 */
export default function ScrapeTerminal({ isOpen, onClose }) {
    const [logs, setLogs] = useState([])
    const [isMinimized, setIsMinimized] = useState(false)
    const [isConnected, setIsConnected] = useState(false)
    const logsEndRef = useRef(null)
    const wsRef = useRef(null)

    // Auto-scroll to bottom when new logs arrive
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
        }
    }, [logs])

    // WebSocket connection for real-time logs
    useEffect(() => {
        if (!isOpen) return

        const ws = createLogsWebSocket((data) => {
            if (data.type === 'log') {
                setLogs((prev) => [...prev, { type: 'info', message: data.message, time: new Date() }])
            } else if (data.type === 'complete') {
                setLogs((prev) => [
                    ...prev,
                    {
                        type: 'success',
                        message: `✅ Scraping complete! Found ${data.products_found} products`,
                        time: new Date(),
                    },
                ])
            } else if (data.type === 'error') {
                setLogs((prev) => [
                    ...prev,
                    { type: 'error', message: `❌ Error: ${data.message}`, time: new Date() },
                ])
            }
        })

        ws.onopen = () => setIsConnected(true)
        ws.onclose = () => setIsConnected(false)
        wsRef.current = ws

        return () => {
            ws.close()
        }
    }, [isOpen])

    // Add a log entry (for external use)
    const addLog = (type, message) => {
        setLogs((prev) => [...prev, { type, message, time: new Date() }])
    }

    // Clear logs
    const clearLogs = () => setLogs([])

    // Get log color class
    const getLogClass = (type) => {
        switch (type) {
            case 'success':
                return 'log-success'
            case 'error':
                return 'log-error'
            case 'warning':
                return 'log-warning'
            default:
                return 'log-info'
        }
    }

    // Format time
    const formatTime = (date) => {
        return date.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        })
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className={`fixed bottom-4 right-4 z-50 ${isMinimized ? 'w-80' : 'w-[500px]'
                        } bg-cyber-darker border border-cyber-border rounded-xl overflow-hidden shadow-2xl`}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-cyber-card border-b border-cyber-border">
                        <div className="flex items-center gap-2">
                            <Terminal className="w-4 h-4 text-cyber-cyan" />
                            <span className="font-medium text-sm">Scrape Logs</span>
                            <div
                                className={`w-2 h-2 rounded-full ${isConnected ? 'bg-cyber-green' : 'bg-red-500'
                                    }`}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setIsMinimized(!isMinimized)}
                                className="p-1 hover:bg-cyber-border rounded transition-colors"
                            >
                                {isMinimized ? (
                                    <Maximize2 className="w-4 h-4" />
                                ) : (
                                    <Minimize2 className="w-4 h-4" />
                                )}
                            </button>
                            <button
                                onClick={onClose}
                                className="p-1 hover:bg-red-500/20 rounded transition-colors text-red-400"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Log content */}
                    {!isMinimized && (
                        <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: 300 }}
                            exit={{ height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="h-[300px] overflow-y-auto p-4 terminal-log">
                                {logs.length === 0 ? (
                                    <div className="text-gray-500 text-center py-8">
                                        <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                        <p>Waiting for scraping logs...</p>
                                        <p className="text-xs mt-1">Start a scrape to see live updates</p>
                                    </div>
                                ) : (
                                    logs.map((log, index) => (
                                        <motion.div
                                            key={index}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className={`mb-1 ${getLogClass(log.type)}`}
                                        >
                                            <span className="text-gray-500 mr-2">[{formatTime(log.time)}]</span>
                                            <span>{log.message}</span>
                                        </motion.div>
                                    ))
                                )}
                                <div ref={logsEndRef} />
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-between px-4 py-2 bg-cyber-card border-t border-cyber-border">
                                <span className="text-xs text-gray-500">
                                    {logs.length} log entries
                                </span>
                                <button
                                    onClick={clearLogs}
                                    className="text-xs text-gray-400 hover:text-white transition-colors"
                                >
                                    Clear
                                </button>
                            </div>
                        </motion.div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    )
}

// Export addLog function for external use
export { ScrapeTerminal }
