const express = require("express")
const cookieParser = require("cookie-parser")
const { getDBStatus } = require("./config/db")



const app = express()


app.use(express.json())
app.use(cookieParser())

/**
 * - Routes required
 */
const authRouter = require("./routes/auth.routes")
const accountRouter = require("./routes/account.routes")
const transactionRoutes = require("./routes/transaction.routes")
const beneficiaryRoutes = require("./routes/beneficiary.routes")
const scheduledPaymentRoutes = require("./routes/scheduledPayment.routes")
const adminRoutes = require("./routes/admin.routes")
const reportRoutes = require("./routes/report.routes")

/**
 * - Use Routes
 */

app.get("/", (req, res) => {
    res.send("Ledger Service is up and running")
})

app.get("/api/health", (req, res) => {
    const dbStatus = getDBStatus()
    res.status(200).json({
        status: dbStatus.connected ? "ok" : "degraded",
        db: dbStatus
    })
})

app.use("/api/auth", authRouter)
app.use("/api/accounts", accountRouter)
app.use("/api/transactions", transactionRoutes)
app.use("/api/beneficiaries", beneficiaryRoutes)
app.use("/api/schedules", scheduledPaymentRoutes)
app.use("/api/admin", adminRoutes)
app.use("/api/reports", reportRoutes)

module.exports = app
