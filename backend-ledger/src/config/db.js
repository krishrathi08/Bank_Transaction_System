const mongoose = require("mongoose")
const dns = require("dns")

const dbState = {
    connected: false,
    message: "Database connection has not started yet"
}

async function connectToDB() {
    try {
        if (process.env.MONGO_DNS_SERVERS) {
            const dnsServers = process.env.MONGO_DNS_SERVERS
                .split(",")
                .map((server) => server.trim())
                .filter(Boolean)

            if (dnsServers.length > 0) {
                dns.setServers(dnsServers)
                console.log("Using custom DNS servers for MongoDB:", dnsServers.join(", "))
            }
        }

        await mongoose.connect(process.env.MONGO_URI)
        dbState.connected = true
        dbState.message = "Database connected successfully"
        console.log("server is connected to DB")
    } catch (err) {
        dbState.connected = false
        dbState.message = err.message || "Unknown database connection error"
        console.log("Error connecting to DB:", dbState.message)
    }
}

function getDBStatus() {
    return { ...dbState }
}

module.exports = {
    connectToDB,
    getDBStatus
}
