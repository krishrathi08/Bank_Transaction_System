const { Router } = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const transactionController = require("../controllers/transaction.controller")
const rateLimiter = require("../middleware/rateLimit.middleware")

const transactionRoutes = Router();

const txLimiter = rateLimiter({
    windowMs: 60 * 1000,
    max: 20,
    message: "Too many transaction submissions. Please try again shortly."
})

/**
 * - POST /api/transactions/
 * - Create a new transaction
 */

transactionRoutes.post("/", authMiddleware.authMiddleware, txLimiter, transactionController.createTransaction)

transactionRoutes.post("/verify-otp", authMiddleware.authMiddleware, txLimiter, transactionController.verifyOtpController)

transactionRoutes.get("/", authMiddleware.authMiddleware, transactionController.getUserTransactionsController)

transactionRoutes.get("/alerts/fraud", authMiddleware.authMiddleware, transactionController.getFraudAlertsController)

transactionRoutes.post("/deposit", authMiddleware.authMiddleware, txLimiter, transactionController.createDepositController)

transactionRoutes.post("/withdrawal", authMiddleware.authMiddleware, txLimiter, transactionController.createWithdrawalController)


/**
 * - POST /api/transactions/system/initial-funds
 * - Create initial funds transaction from system user
 */
transactionRoutes.post("/system/initial-funds", authMiddleware.authSystemUserMiddleware, transactionController.createInitialFundsTransaction)

module.exports = transactionRoutes;
