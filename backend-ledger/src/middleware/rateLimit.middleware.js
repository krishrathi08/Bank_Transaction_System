const ipRequests = new Map()

// Periodically clean up old IP records to prevent memory growth
setInterval(() => {
    const now = Date.now()
    for (const [ip, requests] of ipRequests.entries()) {
        const activeRequests = requests.filter(timestamp => now - timestamp < 10 * 60 * 1000)
        if (activeRequests.length === 0) {
            ipRequests.delete(ip)
        } else {
            ipRequests.set(ip, activeRequests)
        }
    }
}, 5 * 60 * 1000)

function rateLimiter({ windowMs = 60 * 1000, max = 30, message = "Too many requests, please try again later." } = {}) {
    return function (req, res, next) {
        const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress
        const now = Date.now()

        if (!ipRequests.has(ip)) {
            ipRequests.set(ip, [])
        }

        const requests = ipRequests.get(ip).filter(timestamp => now - timestamp < windowMs)
        requests.push(now)
        ipRequests.set(ip, requests)

        if (requests.length > max) {
            return res.status(429).json({
                message
            })
        }

        next()
    }
}

module.exports = rateLimiter
